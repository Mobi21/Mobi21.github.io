import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { createHashRouter } from "react-router-dom";
import { App } from "../app/App";
import {
  ConnectionContext,
  type ConnectionValue,
} from "../app/connection-context";

/**
 * Supplies only the two production providers normally owned by main.tsx.
 * The connection is explicit synthetic state; no host, provider, account, or
 * product-data call is made by this harness.
 */
export function IntegratedAppQualification({
  connection,
  router,
  children,
}: {
  connection: ConnectionValue;
  router: ReturnType<typeof createHashRouter>;
  children?: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionContext.Provider value={connection}>
        {children ?? <App router={router} />}
      </ConnectionContext.Provider>
    </QueryClientProvider>
  );
}

export function syntheticConnection(
  overrides: Partial<ConnectionValue> = {},
): ConnectionValue {
  return {
    phase: "ready",
    retry: async () => undefined,
    restart: async () => ({ status: "settled", runtimeId: "qualification-runtime", startedAt: "2026-08-19T12:00:00Z" }),
    refresh: async () => undefined,
    ...overrides,
  };
}
