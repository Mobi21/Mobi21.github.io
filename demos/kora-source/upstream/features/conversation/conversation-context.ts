import type {
  ConversationContextRequest,
  ConversationContextSelection,
} from "../../lib/runtime";

export function isConversationContextSelection(
  value: ConversationContextRequest,
): value is ConversationContextSelection {
  return "state" in value && "authorization" in value && "display" in value;
}

export function conversationContextKey(reference: ConversationContextSelection) {
  if ("selectionId" in reference) return reference.selectionId;
  return reference.opaqueHandle ?? `${reference.state}:${reference.authorization}:${reference.reason}`;
}

export function conversationContextExpired(reference: ConversationContextSelection, now = Date.now()) {
  return "expiresAt" in reference && Date.parse(reference.expiresAt) <= now;
}

export function conversationContextReady(reference: ConversationContextSelection, now = Date.now()) {
  return reference.state === "ready" && reference.authorization === "allowed" && !conversationContextExpired(reference, now);
}

export function mergeConversationContext(
  current: ConversationContextSelection[],
  incoming: ConversationContextSelection[],
) {
  const merged = new Map(current.map((reference) => [conversationContextKey(reference), reference]));
  for (const reference of incoming) merged.set(conversationContextKey(reference), reference);
  return [...merged.values()];
}
