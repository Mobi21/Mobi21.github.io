import "@fontsource-variable/mona-sans";
import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeStopPresentation, type StopPresentation } from "../app/RuntimeStopGuard";
import { Button, KoraSelect, TooltipProvider } from "../components/primitives";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "./runtime-stop-guard-specimen.css";

const fixtures = ["stopping", "failed", "failed-long-copy"] as const;
type Fixture = (typeof fixtures)[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "failed";

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function RuntimeStopGuardSpecimen() {
  const originRef = useRef<HTMLButtonElement>(null);
  const state: StopPresentation = fixture === "stopping"
    ? { phase: "stopping", operationId: "synthetic-stop" }
    : {
        phase: "failed",
        operationId: "synthetic-stop",
        message: fixture === "failed-long-copy"
          ? "Kora could not finish the graceful stop because a deliberately long-running local operation did not acknowledge shutdown before the safe timeout. The desktop app is still open, every saved record remains intact, and your unsent draft is still available if you keep Kora open."
          : "Kora could not stop the local runtime before the safe timeout. The desktop app is still open and your draft remains safe.",
      };
  return <TooltipProvider>
    <div className="runtime-stop-specimen">
      <header><div><strong>Runtime stop overlay qualification</strong><span>Synthetic local stop state · no host or runtime action</span></div><KoraSelect label="Runtime stop fixture" value={fixture} options={fixtures.map(value => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
      <main>
        <Button ref={originRef}>Original close command</Button>
        <p>The underlying Kora workspace remains inert while recovery is required.</p>
      </main>
      <RuntimeStopPresentation state={state} onDismiss={() => undefined} onRetry={() => undefined} onForceClose={() => undefined} finalFocus={originRef} />
    </div>
  </TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><RuntimeStopGuardSpecimen /></StrictMode>);
