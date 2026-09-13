import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CanonicalConversationTurn, ConversationRunSnapshot } from "../../lib/runtime";
import { canonicalTurnSettlesRun } from "./conversation-reconciliation";

type ConversationRunStateOptions = {
  sessionId?: string;
  bootstrapSnapshot?: ConversationRunSnapshot;
  canonicalTurns: CanonicalConversationTurn[];
};

export function recoverCanonicalFailedRun(
  sessionId: string | undefined,
  canonicalTurns: CanonicalConversationTurn[],
): ConversationRunSnapshot | undefined {
  if (!sessionId) return;
  for (let index = canonicalTurns.length - 1; index >= 0; index -= 1) {
    const turn = canonicalTurns[index]!,
      user = turn.items.find((item) => item.kind === "user_message"),
      failed = [...turn.items].reverse().find(
        (item) => item.kind === "assistant_message" && item.status === "failed" && item.failure,
      );
    if (!user || user.kind !== "user_message" || !failed || failed.kind !== "assistant_message" || !failed.failure) continue;
    return {
      schemaVersion: 1,
      runId: `canonical-recovery:${turn.acceptedEntryId}`,
      sessionId,
      clientRequestId: turn.clientRequestId ?? `canonical-recovery:${turn.acceptedEntryId}`,
      acceptedEntryId: turn.acceptedEntryId,
      invocation: { kind: "user_message", content: user.content },
      phase: "finishing",
      terminalStatus: "failed",
      failure: failed.failure,
      stopRequested: false,
      acceptedAt: turn.createdAt,
      completedAt: failed.createdAt,
      items: turn.items,
      queue: [],
      lastSequence: 0,
    };
  }
}

export function useConversationRunState({
  sessionId,
  bootstrapSnapshot,
  canonicalTurns,
}: ConversationRunStateOptions): [
  ConversationRunSnapshot | undefined,
  Dispatch<SetStateAction<ConversationRunSnapshot | undefined>>,
] {
  const [run, setRun] = useState<ConversationRunSnapshot | undefined>(bootstrapSnapshot);
  const ownerSessionId = useRef(sessionId);
  const canonicalRecovery = recoverCanonicalFailedRun(sessionId, canonicalTurns),
    canonicalRecoveryKey = canonicalRecovery
      ? `${canonicalRecovery.sessionId}:${canonicalRecovery.acceptedEntryId}:${canonicalRecovery.failure?.code}`
      : "";

  useLayoutEffect(() => {
    const sessionChanged = ownerSessionId.current !== sessionId;
    ownerSessionId.current = sessionId;
    setRun((current) => {
      const recovered = bootstrapSnapshot ?? canonicalRecovery;
      if (sessionChanged) return recovered;

      const preserveUnsettledTerminalRun = current?.terminalStatus
        && current.sessionId === sessionId
        && (!bootstrapSnapshot || bootstrapSnapshot.runId === current.runId);

      return preserveUnsettledTerminalRun ? current : recovered;
    });
  }, [bootstrapSnapshot, canonicalRecoveryKey, sessionId]);

  useLayoutEffect(() => {
    if (!run?.terminalStatus) return;
    if (run.terminalStatus === "failed") return;
    if (canonicalTurns.some((turn) => canonicalTurnSettlesRun(turn, run))) setRun(undefined);
  }, [canonicalTurns, run]);

  return [run, setRun];
}
