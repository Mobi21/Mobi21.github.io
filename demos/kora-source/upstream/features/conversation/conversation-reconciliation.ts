import type { CanonicalConversationTurn, ConversationItem, ConversationRunSnapshot } from "../../lib/runtime";

export type KoraPresentationMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: string;
  items: ConversationItem[];
  live: boolean;
};

const messagesFor = (
  acceptedEntryId: string,
  createdAt: string,
  items: ConversationItem[],
  live: boolean,
): KoraPresentationMessage[] => {
  const user = items.filter((item) => item.kind === "user_message"),
    response = items.filter((item) => item.kind !== "user_message");
  return [
    ...(user.length ? [{ id: `${acceptedEntryId}:user`, role: "user" as const, createdAt, items: user, live }] : []),
    ...(response.length || live ? [{ id: `${acceptedEntryId}:assistant`, role: "assistant" as const, createdAt, items: response, live }] : []),
  ];
};

const turnMatchesRun = (turn: CanonicalConversationTurn, run: ConversationRunSnapshot) =>
  turn.acceptedEntryId === run.acceptedEntryId || turn.clientRequestId === run.clientRequestId;

export function canonicalTurnSettlesRun(turn: CanonicalConversationTurn, run: ConversationRunSnapshot): boolean {
  if (!run.terminalStatus || !turnMatchesRun(turn, run)) return false;
  return turn.items.some((item) => item.kind !== "user_message" && (
    run.terminalStatus === "completed"
      ? item.status === "completed"
      : item.status === run.terminalStatus
  ));
}

export function reconcileConversationMessages(
  canonicalTurns: CanonicalConversationTurn[],
  run?: ConversationRunSnapshot,
): KoraPresentationMessage[] {
  const canonical = canonicalTurns.flatMap((turn) => messagesFor(turn.acceptedEntryId, turn.createdAt, turn.items, false));
  if (!run) return canonical;
  const matchingTurn = canonicalTurns.find((turn) => turnMatchesRun(turn, run));
  if (matchingTurn && canonicalTurnSettlesRun(matchingTurn, run)) return canonical;
  if (matchingTurn) {
    const otherCanonical = canonicalTurns
      .filter((turn) => turn !== matchingTurn)
      .flatMap((turn) => messagesFor(turn.acceptedEntryId, turn.createdAt, turn.items, false));
    const liveItems = new Map<string, ConversationItem>();
    for (const item of matchingTurn.items) liveItems.set(item.id, item);
    for (const item of run.items) liveItems.set(item.id, item);
    return [...otherCanonical, ...messagesFor(run.acceptedEntryId, run.acceptedAt, [...liveItems.values()], !run.terminalStatus)];
  }
  return [...canonical, ...messagesFor(run.acceptedEntryId, run.acceptedAt, run.items, !run.terminalStatus)];
}
