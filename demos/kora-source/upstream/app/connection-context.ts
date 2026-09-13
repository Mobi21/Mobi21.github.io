import { createContext, useContext } from "react";
import type { RuntimeRequestError, ShellBootstrap } from "../lib/runtime";

export type ConnectionPhase =
  | "starting"
  | "ready"
  | "disconnected"
  | "restarting"
  | "degraded"
  | "failed";

export type RuntimeRestartSettlement =
  | { status: "settled"; runtimeId: string; startedAt: string }
  | { status: "failed"; code: string; message: string; requestId?: string };

export type ConnectionValue = {
  phase: ConnectionPhase;
  bootstrap?: ShellBootstrap;
  error?: RuntimeRequestError;
  retry: () => Promise<void>;
  restart: () => Promise<RuntimeRestartSettlement>;
  lastRestart?: RuntimeRestartSettlement & { observedAt: string };
  refresh: () => Promise<void>;
};

export const ConnectionContext = createContext<ConnectionValue | null>(null);

export function useConnection() {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider");
  return value;
}
