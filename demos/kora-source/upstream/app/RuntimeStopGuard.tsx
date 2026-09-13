import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useReducer, useRef, type RefObject } from "react";
import { Button, Modal } from "../components/primitives";
import { desktopHost, hasDesktopHost, type RuntimeStopOperation } from "../lib/desktop-host";
import { checkpointAllDrafts } from "../lib/persistence";

export type StopPresentation =
  | { phase: "idle" }
  | { phase: "stopping"; operationId: string }
  | { phase: "failed"; operationId?: string; message: string };

export type StopAction =
  | { type: "stopping"; operationId: string }
  | { type: "failed"; operationId?: string; message?: string }
  | { type: "dismiss" };

export function stopPresentationReducer(_state: StopPresentation, action: StopAction): StopPresentation {
  if (action.type === "stopping") return { phase: "stopping", operationId: action.operationId };
  if (action.type === "failed") return { phase: "failed", operationId: action.operationId, message: action.message ?? "Kora could not stop the local runtime." };
  return { phase: "idle" };
}

export function RuntimeStopPresentation({
  state,
  onDismiss,
  onRetry,
  onForceClose,
  finalFocus,
}: {
  state: StopPresentation;
  onDismiss: () => void;
  onRetry: () => void;
  onForceClose: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);
  return <>
    {state.phase === "stopping" && <div className="runtime-stop-guard" role="status" aria-live="polite" aria-labelledby="runtime-stop-title">
      <section>
        <LoaderCircle className="spin" size={20} aria-hidden="true" />
        <div><h2 id="runtime-stop-title">Stopping Kora…</h2><p>Saving your draft and gracefully stopping the local runtime.</p></div>
      </section>
    </div>}
    <Modal
      open={state.phase === "failed"}
      onOpenChange={() => undefined}
      title="Kora is still running"
      description="The desktop app is still open, and your saved and unsent work remains safe."
      purpose="confirm"
      className="runtime-stop-failure"
      closeLabel="Keep Kora open"
      dismissPolicy="explicit"
      onDismissAttempt={(reason) => {
        if (reason === "escape-key" || reason === "close-press") onDismiss();
      }}
      initialFocus={retryRef}
      finalFocus={finalFocus}
      actions={<>
        <Button ref={retryRef} onClick={onRetry}>Retry graceful stop</Button>
        <Button tone="danger" onClick={onForceClose}>Force close host</Button>
      </>}
    >
      {state.phase === "failed" && <div className="runtime-stop-failure__body" role="alert">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <p>{state.message}</p>
          <small>Force close exits the desktop host immediately and may leave the local Kora runtime running.</small>
        </div>
      </div>}
    </Modal>
  </>;
}

export function RuntimeStopGuard() {
  const [state, dispatch] = useReducer(stopPresentationReducer, { phase: "idle" });
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!hasDesktopHost) return;
    const listeners: UnlistenFn[] = [];
    void listen<RuntimeStopOperation>("kora:runtime-stopping", (event) => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      checkpointAllDrafts();
      dispatch({ type: "stopping", operationId: event.payload.operationId });
    }).then((unlisten) => listeners.push(unlisten));
    void listen<RuntimeStopOperation>("kora:runtime-stop-failed", (event) => {
      checkpointAllDrafts();
      dispatch({ type: "failed", operationId: event.payload.operationId, message: "Kora could not stop the local runtime. The desktop app is still open and your draft remains safe." });
    }).then((unlisten) => listeners.push(unlisten));
    return () => listeners.forEach((unlisten) => unlisten());
  }, []);

  const retry = async () => {
    checkpointAllDrafts();
    try {
      const operation = await desktopHost.requestRuntimeStop();
      if (operation.state === "failed" || operation.state === "timed_out") dispatch({ type: "failed", operationId: operation.operationId });
      else dispatch({ type: "stopping", operationId: operation.operationId });
    } catch (error) {
      dispatch({ type: "failed", message: error instanceof Error ? error.message : undefined });
    }
  };

  return <RuntimeStopPresentation
    state={state}
    onDismiss={() => dispatch({ type: "dismiss" })}
    onRetry={() => void retry()}
    onForceClose={() => { checkpointAllDrafts(); void desktopHost.forceCloseHost(); }}
    finalFocus={returnFocusRef}
  />;
}
