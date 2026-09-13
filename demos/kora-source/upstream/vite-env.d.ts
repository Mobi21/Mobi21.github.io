/// <reference types="vite/client" />

declare const __KORA_QA_METRICS_ENABLED__: boolean;

type KoraQaMetricsSnapshot = {
  activeEventListeners: number;
  connectionPhase: "starting" | "ready" | "disconnected" | "restarting" | "degraded" | "failed";
  inFlightRequests: number;
  persistentRequests: number;
  runtimeId: string | null;
  sessionId: string | null;
  totalRequestsStarted: number;
  observedAt: string;
};

interface Window {
  __KORA_QA_METRICS__?: {
    snapshot(): KoraQaMetricsSnapshot;
  };
}
