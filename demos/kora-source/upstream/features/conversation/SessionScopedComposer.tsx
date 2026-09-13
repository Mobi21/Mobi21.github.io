import type { ConversationContextSelection, ConversationRunSnapshot } from "../../lib/runtime";
import { FullComposer } from "./ConversationComposer";

export function SessionScopedComposer({ sessionId, run, onRun, pendingContext, pendingDraft, onContextAttached }: {
  sessionId?: string;
  run?: ConversationRunSnapshot;
  onRun: (run: ConversationRunSnapshot) => void;
  pendingContext?: ConversationContextSelection[];
  pendingDraft?: string;
  onContextAttached?: () => void;
}) {
  return <FullComposer key={sessionId ?? "no-session"} run={run} onRun={onRun} pendingContext={pendingContext} pendingDraft={pendingDraft} onContextAttached={onContextAttached} />;
}
