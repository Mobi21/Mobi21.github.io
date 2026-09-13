import type { SessionMetadata, SessionNavigationEntry } from "../../lib/runtime";

const placeholderNames = new Set(["", "new conversation", "untitled conversation"]);

export function isPlaceholderConversationName(name?: string): boolean {
  return placeholderNames.has(name?.trim().toLocaleLowerCase() ?? "");
}

export function conversationTitle(session: SessionMetadata): string {
  return isPlaceholderConversationName(session.name) ? "Untitled conversation" : session.name!.trim();
}

export function conversationTimestamp(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const dayAge = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (dayAge === 0) return `Today, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  if (dayAge === 1) return `Yesterday, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), hour: "numeric", minute: "2-digit" });
}

export function conversationRowMeta(session: SessionMetadata, draft: boolean): string {
  const timestamp = conversationTimestamp(session.updatedAt);
  return `${draft ? "Draft saved · " : ""}${timestamp}`;
}

export function conversationNameError(name: string): string | undefined {
  return name.trim() ? undefined : "Give this conversation a name before saving.";
}

export function sessionNavigationDepth(entry: SessionNavigationEntry, entries: SessionNavigationEntry[]): number {
  const byId = new Map(entries.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>([entry.id]);
  let depth = 0;
  let parentId = entry.parentId;
  while (parentId && depth < 8 && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

function declaredSkillLabel(value: string): string | undefined {
  const match = value.match(/^<skill\b[^>]*\bname\s*=\s*["']([^"']+)["']/iu);
  if (!match?.[1]?.trim()) return undefined;
  const name = match[1].trim().replace(/[-_]+/gu, " ").replace(/\s+/gu, " ");
  return `Skill: ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function withoutMarkdownDecoration(value: string): string {
  return value
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^[-+*]\s+/u, "")
    .replace(/(^|\s)(?:-{3,}|\*{3,}|_{3,})(?=\s+(?:[*_#`]|$))/gu, "$1")
    .replace(/(?<!\w)(\*\*|__)(?=\S)(.+?)(?<!\s)\1(?!\w)/gu, "$2")
    .replace(/(?<!\w)(\*|_|~~)(?=\S)(.+?)(?<!\s)\1(?!\w)/gu, "$2");
}

function readableMarkdownPreview(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:-{3,}|\*{3,}|_{3,})$/u.test(line))
    .map((line) => {
      const chunks = line.split(/(`[^`\n]*`)/gu);
      return chunks.map((chunk, index) => index % 2 === 1 ? chunk : withoutMarkdownDecoration(chunk)).join("");
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function readableNavigationText(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const skillLabel = declaredSkillLabel(trimmed);
  if (skillLabel) return skillLabel;

  const withoutHeading = readableMarkdownPreview(trimmed);
  if (withoutHeading.startsWith("`") && withoutHeading.endsWith("`") && withoutHeading.length > 1) return withoutHeading;
  return withoutHeading;
}

/**
 * Returns the short, user-facing label for a branch entry while retaining the
 * runtime entry as the navigation identity. A named entry always wins over a
 * message preview; skill envelopes are represented by their declared name.
 */
export function sessionNavigationLabel(entry: SessionNavigationEntry): string {
  return readableNavigationText(entry.name) ?? readableNavigationText(entry.preview) ?? readableNavigationText(entry.label) ?? "Conversation entry";
}

/** Returns a secondary preview only when it adds information to the label. */
export function sessionNavigationPreview(entry: SessionNavigationEntry): string | undefined {
  if (!entry.preview || declaredSkillLabel(entry.preview.trim())) return undefined;
  const preview = readableNavigationText(entry.preview);
  return preview && preview !== sessionNavigationLabel(entry) ? preview : undefined;
}

export const sessionNavigationKind: Record<SessionNavigationEntry["kind"], string> = {
  message: "Message",
  model: "Model change",
  reasoning: "Reasoning change",
  tools: "Tool setting",
  compaction: "History compacted",
  branch: "Branch point",
  label: "Label",
  state: "Session state",
};
