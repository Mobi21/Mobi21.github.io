import type { ConversationEvent, ConversationItem, ConversationRunSnapshot } from "../../lib/runtime";

const itemFrom = (payload: Record<string, unknown>) => payload.item as ConversationItem | undefined;

export function applyConversationEvent(current: ConversationRunSnapshot, event: ConversationEvent): ConversationRunSnapshot {
  if (event.runId !== current.runId || event.sequence <= current.lastSequence) return current;
  const next = structuredClone(current);
  next.lastSequence = event.sequence;
  if (event.type === "run.status_changed") {
    if (typeof event.payload.phase === "string") next.phase = event.payload.phase as ConversationRunSnapshot["phase"];
    if (typeof event.payload.stopRequested === "boolean") next.stopRequested = event.payload.stopRequested;
  } else if (event.type === "item.started" || event.type === "item.completed" || event.type === "item.failed" || event.type === "approval.requested" || event.type === "approval.resolved") {
    const item = itemFrom(event.payload);
    if (item) {
      const index = next.items.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) next.items[index] = item;
      else next.items.push(item);
    }
  } else if (event.type === "item.delta") {
    const id = typeof event.payload.itemId === "string" ? event.payload.itemId : "";
    const item = next.items.find((candidate) => candidate.id === id);
    if (item?.kind === "assistant_message" || item?.kind === "reasoning_summary") {
      if (typeof event.payload.delta === "string") item.content += event.payload.delta;
    } else if ((item?.kind === "tool_activity" || item?.kind === "capability_activity") && typeof event.payload.summary === "string") {
      item.summary = event.payload.summary;
    }
  } else if (event.type === "queue.updated" && Array.isArray(event.payload.queue)) {
    next.queue = event.payload.queue as ConversationRunSnapshot["queue"];
  } else if (event.type === "run.completed") {
    next.terminalStatus = event.payload.terminalStatus as ConversationRunSnapshot["terminalStatus"];
    next.completedAt = typeof event.payload.completedAt === "string" ? event.payload.completedAt : event.createdAt;
    if (event.payload.failure) next.failure = event.payload.failure as ConversationRunSnapshot["failure"];
  }
  return next;
}

export function isConversationRunLive(run: ConversationRunSnapshot | undefined): boolean {
  return Boolean(run && !run.terminalStatus);
}

export const phaseCopy: Record<ConversationRunSnapshot["phase"], string> = {
  queued: "Queued",
  preparing: "Getting oriented",
  thinking: "Thinking",
  responding: "Responding",
  using_tool: "Working",
  waiting_for_approval: "Waiting for you",
  finishing: "Finishing",
};
