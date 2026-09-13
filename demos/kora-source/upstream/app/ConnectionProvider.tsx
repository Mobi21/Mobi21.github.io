import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runtime, RuntimeRequestError } from "../lib/runtime";
import { ConnectionContext, type ConnectionPhase, type ConnectionValue, type RuntimeRestartSettlement } from "./connection-context";

type HostPhase = "starting" | "ready" | "restarting" | "failed";

export function resolveEstablishedBootstrap<T>(
  current: T | undefined,
  established: T | undefined,
): T | undefined {
  return current ?? established;
}

export function resolveConnectionPhase({
  hostPhase,
  hasBootstrap,
  bootstrapIsError,
  hasCapabilityDegradation,
}: {
  hostPhase: HostPhase;
  hasBootstrap: boolean;
  bootstrapIsError: boolean;
  hasCapabilityDegradation: boolean;
}): ConnectionPhase {
  if (!hasBootstrap) {
    if (hostPhase === "restarting") return "restarting";
    if (hostPhase === "failed" || bootstrapIsError) return "failed";
    return "starting";
  }
  if (hostPhase !== "ready" || bootstrapIsError) return "disconnected";
  return hasCapabilityDegradation ? "degraded" : "ready";
}

export function crossSurfaceInvalidationRoots(
  domains: readonly string[],
): string[][] {
  const includes = (...values: string[]) =>
    domains.includes("all") || values.some((value) => domains.includes(value));
  const roots: string[][] = [];
  if (includes("wellbeing", "provider")) roots.push(["wellbeing"]);
  if (includes("finance", "provider")) {
    for (const root of ["money", "money-accounts", "money-activity", "money-plan", "money-recurring"])
      roots.push([root]);
  }
  if (includes("finance", "wellbeing", "personal_brain", "provider"))
    roots.push(["life"]);
  if (includes("personal_brain")) roots.push(["about-you"]);
  if (includes("calendar", "native_work", "job", "approval", "personal_brain", "finance", "wellbeing", "provider"))
    roots.push(["today"]);
  return roots;
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [hostPhase, setHostPhase] = useState<HostPhase>("starting");
  const [hostError, setHostError] = useState<RuntimeRequestError>();
  const [lastRestart, setLastRestart] = useState<ConnectionValue["lastRestart"]>();
  const rediscovering = useRef(false);

  const connect = useCallback(async (restart = false): Promise<RuntimeRestartSettlement> => {
    setHostPhase(restart ? "restarting" : "starting");
    setHostError(undefined);
    try {
      const connected = restart ? await runtime.restart() : await runtime.prepare();
      setGeneration((value) => value + 1);
      setHostPhase("ready");
      const settlement = { status: "settled" as const, runtimeId: connected.runtimeId, startedAt: connected.startedAt };
      if (restart) setLastRestart({ ...settlement, observedAt: new Date().toISOString() });
      return settlement;
    } catch (error) {
      const failure = error as RuntimeRequestError;
      setHostError(failure);
      setHostPhase("failed");
      const settlement = {
        status: "failed",
        code: failure.code ?? "runtime_restart_failed",
        message: failure.message || "Kora could not restart.",
        ...(failure.requestId ? { requestId: failure.requestId } : {}),
      } as const;
      if (restart) setLastRestart({ ...settlement, observedAt: new Date().toISOString() });
      return settlement;
    }
  }, []);

  useEffect(() => {
    void connect(false);
    return () => runtime.clearConnection();
  }, [connect]);

  const bootstrapQuery = useQuery({
    queryKey: ["shell-bootstrap", generation],
    queryFn: ({ signal }) => runtime.bootstrap(signal),
    enabled: hostPhase === "ready" && generation > 0,
    retry: 1,
    retryDelay: 650,
    // Events drive state; this lightweight health refetch bounds discovery of
    // a CLI-restarted daemon whose old long-poll socket has not failed yet.
    refetchInterval: 3_000,
    staleTime: 3_000,
  });
  const {
    data: currentBootstrap,
    error: bootstrapError,
    isError: bootstrapIsError,
    refetch,
  } = bootstrapQuery;
  const establishedBootstrap = useRef<typeof currentBootstrap>(undefined);
  if (currentBootstrap) establishedBootstrap.current = currentBootstrap;
  const bootstrap = resolveEstablishedBootstrap(
    currentBootstrap,
    establishedBootstrap.current,
  );

  useEffect(() => {
    const error = bootstrapError as RuntimeRequestError | undefined;
    if (!bootstrapIsError || hostPhase !== "ready" || rediscovering.current ||
      !error || !["runtime_unavailable", "runtime_unreachable", "runtime_disconnected", "runtime_unauthorized"].includes(error.code)) return;
    rediscovering.current = true;
    void connect(false).finally(() => { rediscovering.current = false; });
  }, [bootstrapError, bootstrapIsError, connect, hostPhase]);

  useEffect(() => {
    if (runtime.isPreview || hostPhase !== "ready" || generation === 0) return;
    const controller = new AbortController();
    void (async () => {
      let revision = 0;
      let epoch: string | undefined;
      while (!controller.signal.aborted) {
        try {
          const ticket = await runtime.eventTicket();
          const event = await runtime.nextEvent(ticket.ticket, revision, controller.signal);
          if (epoch && event.epoch !== epoch) {
            await queryClient.invalidateQueries();
            revision = 0;
          } else if (event.revision < revision) {
            await queryClient.invalidateQueries();
            revision = event.revision;
            epoch = event.epoch;
            continue;
          }
          epoch = event.epoch;
          revision = event.revision;
          if (event.type === "invalidate") {
            await queryClient.invalidateQueries({ queryKey: ["shell-bootstrap"] });
            if (event.domains.includes("all") || event.domains.includes("session") || event.domains.includes("conversation"))
              await queryClient.invalidateQueries({ queryKey: ["conversation-transcript"] });
            if (event.domains.includes("all") || event.domains.includes("session") || event.domains.includes("conversation")) {
              await queryClient.invalidateQueries({ queryKey: ["conversation-commands"] });
              await queryClient.invalidateQueries({ queryKey: ["command-completion"] });
            }
            if (event.domains.includes("all") || event.domains.includes("model"))
              await queryClient.invalidateQueries({ queryKey: ["model-catalog"] });
            if (
              event.domains.includes("all") ||
              event.domains.some((domain) =>
                ["model", "provider", "job", "notification", "approval", "background"].includes(domain),
              )
            )
              await queryClient.invalidateQueries({ queryKey: ["settings"] });
            if (event.domains.includes("all") || event.domains.includes("notification"))
              await queryClient.invalidateQueries({ queryKey: ["notifications"] });
            if (event.domains.includes("all") || event.domains.includes("approval"))
              await queryClient.invalidateQueries({ queryKey: ["approvals"] });
            if (event.domains.includes("all") || event.domains.includes("calendar") || event.domains.includes("provider"))
              await queryClient.invalidateQueries({ queryKey: ["calendar"] });
            if (event.domains.includes("all") || event.domains.includes("native_work"))
              await queryClient.invalidateQueries({ queryKey: ["work"] });
            if (
              event.domains.includes("all") ||
              event.domains.includes("personal_brain") ||
              event.domains.includes("artifact") ||
              event.domains.includes("native_work") ||
              event.domains.includes("job") ||
              event.domains.includes("calendar") ||
              event.domains.includes("approval") ||
              event.domains.includes("session") ||
              event.domains.includes("conversation")
            )
              await queryClient.invalidateQueries({ queryKey: ["brain"] });
            if (event.domains.includes("all") || event.domains.includes("activity"))
              await queryClient.invalidateQueries({ queryKey: ["work-activity"] });
            for (const queryKey of crossSurfaceInvalidationRoots(event.domains))
              await queryClient.invalidateQueries({ queryKey });
          }
        } catch {
          if (controller.signal.aborted) break;
          // The CLI and GUI deliberately share one daemon. A CLI restart changes
          // its authenticated endpoint, so ask the native host for the new
          // connection instead of retrying the stale URL forever.
          await connect(false);
          break;
        }
      }
    })();
    return () => controller.abort();
  }, [connect, generation, hostPhase, queryClient]);

  const hasCapabilityDegradation = Boolean(
    bootstrap &&
      (bootstrap.capabilities.degraded.length > 0 || bootstrap.capabilities.unavailable.length > 0),
  );
  const phase = resolveConnectionPhase({
    hostPhase,
    hasBootstrap: Boolean(bootstrap),
    bootstrapIsError,
    hasCapabilityDegradation,
  });

  useEffect(() => {
    if (!__KORA_QA_METRICS_ENABLED__) return;
    const connected = phase === "ready" || phase === "degraded";
    window.dispatchEvent(new CustomEvent("kora:qa-connection-authority", {
      detail: {
        phase,
        runtimeId: connected ? bootstrap?.epoch ?? null : null,
        sessionId: connected ? bootstrap?.session.id ?? null : null,
      },
    }));
  }, [bootstrap?.epoch, bootstrap?.session.id, phase]);

  const retry = useCallback(async () => {
    if (hostPhase === "failed" || bootstrapIsError) await connect(false);
    else await refetch();
  }, [bootstrapIsError, connect, hostPhase, refetch]);
  const restart = useCallback(async () => connect(true), [connect]);
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const value = useMemo<ConnectionValue>(() => ({
    phase,
    bootstrap,
    error: hostError ?? (bootstrapError as RuntimeRequestError | undefined),
    retry,
    restart,
    lastRestart,
    refresh,
  }), [bootstrap, bootstrapError, hostError, lastRestart, phase, refresh, restart, retry]);

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}
