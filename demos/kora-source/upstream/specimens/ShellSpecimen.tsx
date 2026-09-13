import "@fontsource-variable/mona-sans";
import { createRoot } from "react-dom/client";
import { createAppMemoryRouter } from "../app/App";
import type { ConnectionPhase } from "../app/connection-context";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import {
  IntegratedAppQualification,
  syntheticConnection,
} from "./IntegratedAppQualification";
import "./shell-specimen.css";

const parameters = new URLSearchParams(window.location.search);
const requestedState = parameters.get("state");
const phase: ConnectionPhase = ["ready", "degraded", "disconnected"].includes(
  requestedState ?? "",
)
  ? (requestedState as ConnectionPhase)
  : "ready";
const invalidRoute =
  parameters.get("route") ?? "/qualification/missing?from=shell-review";
const router = createAppMemoryRouter([invalidRoute]);

createRoot(document.getElementById("root")!).render(
  <IntegratedAppQualification
    router={router}
    connection={syntheticConnection({ phase })}
  />,
);
