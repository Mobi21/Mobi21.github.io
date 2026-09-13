import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/mona-sans";
import { StrictMode } from "react";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ConnectionProvider } from "./app/ConnectionProvider";
import { applyStartupAppearance } from "./lib/appearance";
import { desktopHost, hasDesktopHost } from "./lib/desktop-host";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/shell.css";

async function renderKora() {
  await applyStartupAppearance(hasDesktopHost ? desktopHost.setInterfaceScale : undefined);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: true, refetchOnReconnect: true },
    },
  });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <ConnectionProvider>
            <App />
          </ConnectionProvider>
        </QueryClientProvider>
      </MotionConfig>
    </StrictMode>,
  );
}

if (__KORA_QA_METRICS_ENABLED__) {
  void Promise.all([import("./lib/qa-metrics"), import("@tauri-apps/api/core")]).then(([metrics, tauri]) => {
    const { installQaMetrics, installQaNavigationBridge } = metrics;
    installQaMetrics(window, true);
    installQaNavigationBridge(window, (observation) =>
      tauri.invoke("record_qa_navigation_observation", { observation }),
    );
    void renderKora().then(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("kora:qa-navigation-request", {
          detail: { id: "renderer_ready", route: "snapshot" },
        }));
      }));
    });
  });
} else {
  void renderKora();
}
