export type ComposerCompletionContext = {
  kind: "command" | "inline_skill";
  input: string;
  start: number;
  end: number;
};

export function getSkillCompletionDisplayName(value: string): string {
  return value.replace(/^\/skill:/i, "").trim().split(/\s+/, 1)[0] ?? value;
}

const INLINE_SKILL_TOKEN = /(?:^|\s)(\/(?:skill:)?[a-z0-9_-]*)$/i;

export function getComposerCompletionContext(
  draft: string,
  cursor = draft.length,
): ComposerCompletionContext | undefined {
  const caret = Math.max(0, Math.min(cursor, draft.length));
  if (draft.startsWith("/") && !draft.includes("\n")) {
    return { kind: "command", input: draft, start: 0, end: draft.length };
  }

  const match = draft.slice(0, caret).match(INLINE_SKILL_TOKEN);
  const token = match?.[1];
  if (!token) return;

  const input = token.toLocaleLowerCase() === "/skill"
    ? "/skill:"
    : token.toLocaleLowerCase().startsWith("/skill:")
      ? `/skill:${token.slice("/skill:".length)}`
      : `/skill:${token.slice(1)}`;

  return {
    kind: "inline_skill",
    input,
    start: caret - token.length,
    end: caret,
  };
}

export function applyComposerCompletion(
  draft: string,
  context: ComposerCompletionContext,
  value: string,
): string {
  if (context.kind === "command") {
    // A zero-width command context comes from the explicit Commands button.
    // The button is disabled for non-empty drafts; retain this guard so no
    // programmatic selection can reinterpret or erase unsent user text.
    if (context.start === context.end && draft.trim()) {
      return draft;
    }
    return value;
  }

  const before = draft.slice(0, context.start).trimEnd();
  const after = draft.slice(context.end).trimStart();
  const request = [before, after].filter(Boolean).join(" ");
  const command = value.trim();
  return request ? `${command} ${request}` : `${command} `;
}

export function getForcedCommandCompletionContext(draft: string): ComposerCompletionContext {
  return { kind: "command", input: "/", start: 0, end: 0 };
}

export function shouldPickComposerCompletion(key: string, isComposing = false): boolean {
  return key === "Tab" || (key === "Enter" && !isComposing);
}
