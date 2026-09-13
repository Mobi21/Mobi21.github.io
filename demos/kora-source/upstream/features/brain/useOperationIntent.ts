import { useCallback, useRef, useState } from "react";

export type OperationIntentPhase =
  | "ready"
  | "waiting_confirmation"
  | "transient_failure";

export type OperationIntentReleaseReason =
  | "cancelled"
  | "settled"
  | "gone"
  | "conflict_resolved";

export type OperationIntentSnapshot<Value> =
  Value extends null | undefined | string | number | boolean
    ? Value
    : Value extends readonly (infer Entry)[]
      ? readonly OperationIntentSnapshot<Entry>[]
      : Value extends object
        ? { readonly [Key in keyof Value]: OperationIntentSnapshot<Value[Key]> }
        : never;

export type OperationIntent<Payload, Concurrency> = Readonly<{
  payload: OperationIntentSnapshot<Payload>;
  concurrency: OperationIntentSnapshot<Concurrency>;
  requestKey: string;
}>;

export type OperationIntentState<Payload, Concurrency> = Readonly<{
  intent: OperationIntent<Payload, Concurrency> | null;
  phase: OperationIntentPhase | "idle";
}>;

export type OperationIntentController<Payload, Concurrency> =
  OperationIntentState<Payload, Concurrency> & Readonly<{
    capture(
      payload: Payload,
      concurrency: Concurrency,
    ): OperationIntent<Payload, Concurrency>;
    markWaitingForConfirmation(): void;
    markTransientFailure(): void;
    retry(): OperationIntent<Payload, Concurrency> | null;
    cancel(): void;
    settle(): void;
    markGone(): void;
    resolveConflict(): void;
  }>;

type CapturedIntent<Payload, Concurrency> = Readonly<{
  fingerprint: string;
  value: OperationIntent<Payload, Concurrency>;
}>;

const unsupportedValue = (value: object) => {
  const name = value.constructor?.name ?? "object";
  throw new TypeError(
    `Operation intents must contain JSON-compatible data; received ${name}.`,
  );
};

const cloneJsonIntent = <Value,>(value: Value, ancestors = new WeakSet<object>()): Value => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Operation intents require finite numbers.");
    }
    return value;
  }
  if (typeof value === "undefined") return value;
  if (typeof value !== "object") {
    throw new TypeError("Operation intents must contain JSON-compatible data.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Operation intents cannot contain circular references.");
  }

  ancestors.add(value);
  let clone: unknown;
  if (Array.isArray(value)) {
    clone = value.map((entry) => cloneJsonIntent(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unsupportedValue(value);
    clone = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonIntent(entry, ancestors)]),
    );
  }
  ancestors.delete(value);
  return Object.freeze(clone) as Value;
};

const fingerprintJsonIntent = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (typeof value === "number") return `number:${value}`;
  if (Array.isArray(value)) {
    return `array:[${value.map(fingerprintJsonIntent).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${fingerprintJsonIntent(entry)}`);
  return `object:{${entries.join(",")}}`;
};

export function useOperationIntent<Payload, Concurrency>(
  options: Readonly<{ createRequestKey?: () => string }> = {},
): OperationIntentController<Payload, Concurrency> {
  const createRequestKeyRef = useRef(options.createRequestKey ?? (() => crypto.randomUUID()));
  createRequestKeyRef.current = options.createRequestKey ?? (() => crypto.randomUUID());
  const capturedRef = useRef<CapturedIntent<Payload, Concurrency> | null>(null);
  const [state, setState] = useState<OperationIntentState<Payload, Concurrency>>({
    intent: null,
    phase: "idle",
  });

  const capture = useCallback((payload: Payload, concurrency: Concurrency) => {
    const frozenPayload = cloneJsonIntent(payload);
    const frozenConcurrency = cloneJsonIntent(concurrency);
    const fingerprint = fingerprintJsonIntent({
      payload: frozenPayload,
      concurrency: frozenConcurrency,
    });
    const current = capturedRef.current;
    if (current?.fingerprint === fingerprint) return current.value;

    const value = Object.freeze({
      payload: frozenPayload as OperationIntentSnapshot<Payload>,
      concurrency: frozenConcurrency as OperationIntentSnapshot<Concurrency>,
      requestKey: createRequestKeyRef.current(),
    });
    capturedRef.current = Object.freeze({ fingerprint, value });
    setState({ intent: value, phase: "ready" });
    return value;
  }, []);

  const setPhase = useCallback((phase: OperationIntentPhase) => {
    if (!capturedRef.current) return;
    setState({ intent: capturedRef.current.value, phase });
  }, []);

  const retry = useCallback(() => {
    const current = capturedRef.current?.value ?? null;
    if (current) setState({ intent: current, phase: "ready" });
    return current;
  }, []);

  const release = useCallback((_reason: OperationIntentReleaseReason) => {
    capturedRef.current = null;
    setState({ intent: null, phase: "idle" });
  }, []);

  return {
    ...state,
    capture,
    markWaitingForConfirmation: useCallback(
      () => setPhase("waiting_confirmation"),
      [setPhase],
    ),
    markTransientFailure: useCallback(
      () => setPhase("transient_failure"),
      [setPhase],
    ),
    retry,
    cancel: useCallback(() => release("cancelled"), [release]),
    settle: useCallback(() => release("settled"), [release]),
    markGone: useCallback(() => release("gone"), [release]),
    resolveConflict: useCallback(() => release("conflict_resolved"), [release]),
  };
}
