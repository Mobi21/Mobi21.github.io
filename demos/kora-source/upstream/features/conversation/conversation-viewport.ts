export function placeConversationAtLatest(viewport: Pick<HTMLElement, "scrollHeight" | "scrollTop"> | null) {
  if (!viewport) return;
  viewport.scrollTop = viewport.scrollHeight;
}
