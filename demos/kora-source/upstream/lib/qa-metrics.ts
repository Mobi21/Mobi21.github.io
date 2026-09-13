type Listener = EventListenerOrEventListenerObject;
type QaWindow = Window & typeof globalThis;
type AddOptions = boolean | AddEventListenerOptions | null;
type RemoveOptions = boolean | EventListenerOptions | null;
type QaRoute = "snapshot" | "overview" | "integrations" | "model" | "background" | "data" | "diagnostics";

export type QaNavigationObservation = {
  id: string;
  route: QaRoute;
  durationMs: number;
  snapshot: KoraQaMetricsSnapshot;
};

type ListenerRecord = {
  target: EventTarget;
  type: string;
  listener: Listener;
  capture: boolean;
  wrapped: EventListener;
  signal?: AbortSignal;
  abortHandler?: EventListener;
  state: { active: boolean; counted: boolean };
};

function captureOf(options?: AddOptions | RemoveOptions): boolean {
  return typeof options === "boolean" ? options : Boolean(options?.capture);
}

function invokeListener(listener: Listener, target: EventTarget, event: Event) {
  if (typeof listener === "function") listener.call(target, event);
  else listener.handleEvent(event);
}

export function installQaMetrics(scope: QaWindow, enabled: boolean): () => void {
  if (!enabled || scope.__KORA_QA_METRICS__) return () => undefined;

  const prototype = scope.EventTarget.prototype;
  const originalAdd = prototype.addEventListener;
  const originalRemove = prototype.removeEventListener;
  const originalScopeAdd = scope.addEventListener.bind(scope);
  const originalScopeRemove = scope.removeEventListener.bind(scope);
  const originalFetch = scope.fetch;
  const byTarget = new WeakMap<EventTarget, Map<string, Map<Listener, Map<boolean, ListenerRecord>>>>();
  let activeEventListeners = 0;
  let inFlightRequests = 0;
  let persistentRequests = 0;
  let totalRequestsStarted = 0;
  let connectionPhase: KoraQaMetricsSnapshot["connectionPhase"] = "starting";
  let runtimeId: string | null = null;
  let sessionId: string | null = null;
  let internalListenerMutation = false;
  const isPersistentTarget = (target: EventTarget) =>
    target === scope || target === scope.document ||
    target === scope.document.documentElement || target === scope.document.body;

  const mutateInternalListener = (mutation: () => void) => {
    internalListenerMutation = true;
    try {
      mutation();
    } finally {
      internalListenerMutation = false;
    }
  };

  const lookup = (target: EventTarget, type: string, listener: Listener, capture: boolean) =>
    byTarget.get(target)?.get(type)?.get(listener)?.get(capture);

  const forget = (record: ListenerRecord) => {
    if (!record.state.active) return;
    record.state.active = false;
    if (record.state.counted) activeEventListeners -= 1;
    const types = byTarget.get(record.target);
    const listeners = types?.get(record.type);
    const captures = listeners?.get(record.listener);
    captures?.delete(record.capture);
    if (captures?.size === 0) listeners?.delete(record.listener);
    if (listeners?.size === 0) types?.delete(record.type);
    if (record.signal && record.abortHandler) {
      mutateInternalListener(() => record.signal?.removeEventListener("abort", record.abortHandler!));
    }
  };

  const patchedAdd: typeof EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: Listener | null,
    options?: AddOptions,
  ) {
    if (!listener) return;
    if (internalListenerMutation) {
      originalAdd.call(this, type, listener, options as AddEventListenerOptions | boolean | undefined);
      return;
    }
    const capture = captureOf(options);
    if (lookup(this, type, listener, capture)) return;
    const signal = options && typeof options === "object" ? options.signal : undefined;
    if (signal?.aborted) return;

    let record!: ListenerRecord;
    const once = Boolean(options && typeof options === "object" && options.once);
    const wrapped: EventListener = function (this: EventTarget, event: Event) {
      if (once) {
        forget(record);
      }
      invokeListener(listener, this, event);
    };
    // Route-local elements and signals do not remain reachable merely because
    // they own listeners. Counting them makes GC timing look like a leak.
    // Persistent browser roots do remain reachable, so only their registrations
    // provide a deterministic retained-listener lifecycle signal.
    const state = { active: true, counted: isPersistentTarget(this) };
    record = { target: this, type, listener, capture, wrapped, state, ...(signal ? { signal } : {}) };

    let types = byTarget.get(this);
    if (!types) {
      types = new Map();
      byTarget.set(this, types);
    }
    let listeners = types.get(type);
    if (!listeners) {
      listeners = new Map();
      types.set(type, listeners);
    }
    let captures = listeners.get(listener);
    if (!captures) {
      captures = new Map();
      listeners.set(listener, captures);
    }
    captures.set(capture, record);
    if (state.counted) activeEventListeners += 1;

    if (signal) {
      record.abortHandler = () => {
        forget(record);
        originalRemove.call(record.target, record.type, record.wrapped, record.capture);
      };
      mutateInternalListener(() => signal.addEventListener("abort", record.abortHandler!, { once: true }));
    }
    try {
      originalAdd.call(this, type, wrapped, options as AddEventListenerOptions | boolean | undefined);
    } catch (error) {
      forget(record);
      throw error;
    }
  };

  const patchedRemove: typeof EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: Listener | null,
    options?: RemoveOptions,
  ) {
    if (!listener) return;
    if (internalListenerMutation) {
      originalRemove.call(this, type, listener, options as EventListenerOptions | boolean | undefined);
      return;
    }
    const record = lookup(this, type, listener, captureOf(options));
    if (!record) {
      originalRemove.call(this, type, listener, options as EventListenerOptions | boolean | undefined);
      return;
    }
    forget(record);
    originalRemove.call(this, type, record.wrapped, options as EventListenerOptions | boolean | undefined);
  };

  const isPersistentRequest = (input: RequestInfo | URL) => {
    const raw = input instanceof scope.Request ? input.url : String(input);
    try {
      const path = new URL(raw, scope.location.href).pathname;
      return path === "/v1/events/next" || /^\/v1\/conversation-runs\/[^/]+\/events$/.test(path);
    } catch {
      return false;
    }
  };

  const patchedFetch: typeof fetch = async function (...args) {
    const persistent = isPersistentRequest(args[0]);
    totalRequestsStarted += 1;
    if (persistent) persistentRequests += 1;
    else inFlightRequests += 1;
    try {
      return await originalFetch.apply(scope, args);
    } finally {
      if (persistent) persistentRequests -= 1;
      else inFlightRequests -= 1;
    }
  };

  prototype.addEventListener = patchedAdd;
  prototype.removeEventListener = patchedRemove;
  scope.fetch = patchedFetch;
  const connectionListener = (rawEvent: Event) => {
    if (!(rawEvent instanceof CustomEvent)) return;
    const detail = rawEvent.detail as {
      phase?: unknown;
      runtimeId?: unknown;
      sessionId?: unknown;
    };
    if (!["starting", "ready", "disconnected", "restarting", "degraded", "failed"].includes(String(detail.phase))) return;
    const connected = detail.phase === "ready" || detail.phase === "degraded";
    if (connected && (typeof detail.runtimeId !== "string" || typeof detail.sessionId !== "string")) return;
    if (!connected && (detail.runtimeId !== null || detail.sessionId !== null)) return;
    connectionPhase = detail.phase as KoraQaMetricsSnapshot["connectionPhase"];
    runtimeId = connected ? detail.runtimeId as string : null;
    sessionId = connected ? detail.sessionId as string : null;
  };
  originalScopeAdd("kora:qa-connection-authority", connectionListener);
  const api = Object.freeze({
    snapshot: (): KoraQaMetricsSnapshot => ({
      activeEventListeners,
      connectionPhase,
      inFlightRequests,
      persistentRequests,
      runtimeId,
      sessionId,
      totalRequestsStarted,
      observedAt: new Date().toISOString(),
    }),
  });
  Object.defineProperty(scope, "__KORA_QA_METRICS__", {
    configurable: true,
    enumerable: false,
    value: api,
  });

  return () => {
    originalScopeRemove("kora:qa-connection-authority", connectionListener);
    if (activeEventListeners !== 0)
      throw new Error("QA metrics cannot be uninstalled while observed listeners remain active");
    if (prototype.addEventListener === patchedAdd) prototype.addEventListener = originalAdd;
    if (prototype.removeEventListener === patchedRemove) prototype.removeEventListener = originalRemove;
    if (scope.fetch === patchedFetch) scope.fetch = originalFetch;
    if (scope.__KORA_QA_METRICS__ === api) delete scope.__KORA_QA_METRICS__;
  };
}

const QA_ROUTES: Readonly<Record<Exclude<QaRoute, "snapshot">, string>> = Object.freeze({
  overview: "/settings",
  integrations: "/settings/integrations",
  model: "/settings/model",
  background: "/settings/background",
  data: "/settings/data",
  diagnostics: "/settings/diagnostics",
});

function nextFrame(scope: QaWindow) {
  return new Promise<void>((resolve) => scope.requestAnimationFrame(() => resolve()));
}

export function installQaNavigationBridge(
  scope: QaWindow,
  record: (observation: QaNavigationObservation) => Promise<void>,
): () => void {
  let active = false;
  const listener = async (rawEvent: Event) => {
    if (active || !(rawEvent instanceof CustomEvent)) return;
    const detail = rawEvent.detail as { id?: unknown; route?: unknown };
    if (typeof detail?.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(detail.id)) return;
    if (typeof detail.route !== "string" || !(["snapshot", ...Object.keys(QA_ROUTES)] as string[]).includes(detail.route)) return;
    const route = detail.route as QaRoute;
    active = true;
    const started = performance.now();
    try {
      if (route !== "snapshot") scope.location.hash = QA_ROUTES[route];
      await nextFrame(scope);
      await nextFrame(scope);
      const deadline = performance.now() + 15_000;
      while ((scope.__KORA_QA_METRICS__?.snapshot().inFlightRequests ?? 1) !== 0 && performance.now() < deadline) {
        await new Promise((resolve) => scope.setTimeout(resolve, 50));
      }
      await nextFrame(scope);
      await nextFrame(scope);
      const snapshot = scope.__KORA_QA_METRICS__?.snapshot();
      if (!snapshot) return;
      await record({
        id: detail.id,
        route,
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        snapshot,
      });
    } finally {
      active = false;
    }
  };
  scope.addEventListener("kora:qa-navigation-request", listener);
  return () => scope.removeEventListener("kora:qa-navigation-request", listener);
}
