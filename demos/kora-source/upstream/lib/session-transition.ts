import { checkpointAllDrafts } from "./persistence";
import { runtime, type SessionTransitionOrigin, type SessionTransitionOutcome } from "./runtime";

export type SessionTransitionPresentation =
  | { state: "settled"; previousSessionId: string; sessionId: string }
  | { state: "conflict"; currentSessionId: string; message: string }
  | { state: "blocked_by_active_run"; currentSessionId: string; message: string }
  | { state: "failed"; currentSessionId: string; message: string };

export async function requestSessionTransition(input: {
  kind: "create" | "resume";
  targetSessionId?: string;
  expectedCurrentSessionId: string;
  origin: SessionTransitionOrigin;
  requestKey?: string;
}): Promise<SessionTransitionPresentation> {
  checkpointAllDrafts();
  window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: { state: "requesting" } }));
  try {
    const result: SessionTransitionOutcome = await runtime.transitionSession({
      ...input,
      requestKey: input.requestKey ?? crypto.randomUUID(),
      activeRunPolicy: "reject",
    });
    if (result.status === "confirmed") {
      const settled = { state: "settled" as const, previousSessionId: result.previousSessionId, sessionId: result.sessionId };
      window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: settled }));
      return settled;
    }
    if (result.status === "conflict") {
      const conflict = { state: "conflict" as const, currentSessionId: result.currentSessionId, message: "The conversation changed elsewhere. Kora kept the current conversation open." };
      window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: conflict }));
      return conflict;
    }
    if (result.status === "failed") {
      const failed = { state: "failed" as const, currentSessionId: result.currentSessionId, message: result.code === "target_not_found" ? "That conversation is no longer available." : "Kora could not change conversations. The current conversation stayed open." };
      window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: failed }));
      return failed;
    }
    const blocked = { state: "blocked_by_active_run" as const, currentSessionId: result.currentSessionId, message: "Kora is working in this conversation. Let her finish or stop the run before switching." };
    window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: blocked }));
    return blocked;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("kora:session-transition", { detail: { state: "failed" } }));
    throw error;
  }
}
