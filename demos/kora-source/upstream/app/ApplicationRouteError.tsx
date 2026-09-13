import { CircleAlert } from "lucide-react";
import { useNavigate, useRouteError } from "react-router-dom";
import { KoraMark } from "../components/KoraMark";
import { Button, KoraPresenceMark } from "../components/primitives";
import { WindowControls } from "./WindowControls";

/**
 * Last-resort presentation for an unexpected route render failure.
 *
 * React Router's default boundary prints stack traces and source URLs into the
 * product window. Kora keeps those details in developer tooling and gives the
 * user two safe recovery paths without pretending the failed screen loaded.
 */
export function ApplicationRouteError() {
  useRouteError();
  const navigate = useNavigate();

  return (
    <div className="startup-shell">
      <header className="window-bar startup-shell__bar" data-tauri-drag-region>
        <div className="window-bar__brand"><KoraMark width={16} height={16} /><span>Kora</span></div>
        <WindowControls />
      </header>
      <main className="runtime-state runtime-state--failed" role="alert" aria-live="assertive">
        <KoraPresenceMark state="failed" label="This Kora screen could not open" />
        <span className="runtime-state__kicker"><CircleAlert size={14} /> Screen unavailable</span>
        <h1>This screen hit a problem.</h1>
        <p>Your local workspace is still intact. Reload this screen, or return to Brain and continue from a known place.</p>
        <div className="runtime-state__actions">
          <Button type="button" tone="primary" onClick={() => window.location.reload()}>Reload screen</Button>
          <Button type="button" onClick={() => navigate("/brain", { replace: true })}>Return to Brain</Button>
        </div>
      </main>
    </div>
  );
}
