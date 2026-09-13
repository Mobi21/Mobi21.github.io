/**
 * The one place records become human language.
 *
 * Every string this replaces reached a user because the rendering layer printed a
 * value instead of presenting it. Measured in the running app:
 *
 *   "No registered source is unavailable."  a double negative meaning the opposite
 *   "1 Projects"                            unpluralised
 *   "1 sources available"                   unpluralised
 *   "Date unavailable" x4                   a null rendered as prose
 *   "first_run_profile_first_run"           a database key, in mono, under its name
 *   "First Run Profile Profile"             that key mechanically title-cased
 *   "Untitled conversation" x20             an absent title rendered as a title
 *
 * These are not typos. They are the same defect: no layer owns the translation
 * from record to sentence, so each call site invented one.
 */

/** `1 project` / `2 projects`. Pass an explicit plural for irregular nouns. */
export function count(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * States a positive fact when the count is zero, rather than negating a negative.
 * "No registered source is unavailable" required the reader to resolve two
 * negations to learn that everything is fine.
 */
export function healthSummary(total: number, unhealthy: number) {
  if (total === 0) return "No sources registered yet.";
  if (unhealthy === 0) return total === 1 ? "The source is reachable." : "All sources are reachable.";
  return `${count(unhealthy, "source")} ${unhealthy === 1 ? "needs" : "need"} attention.`;
}

/**
 * An absent date is absent — it is not the sentence "Date unavailable".
 * Returns undefined so the caller can omit the element rather than print a
 * placeholder where a date belongs.
 */
export function dateLabel(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, options ?? {
    month: "short",
    day: "numeric",
    ...(parsed.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(parsed);
}

/** An untitled record is described by what it is, not labelled "Untitled". */
export function recordTitle(title: string | null | undefined, fallback: string) {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

const ACRONYMS = new Set(["id", "url", "api", "utc", "sha", "os", "ui", "tz"]);

/**
 * Turns a dotted record key into a human phrase.
 *
 * The previous approach title-cased the whole key, which produced
 * "First Run Profile Profile" from `first_run_profile_profile` — the noise
 * duplicated because the namespace and the leaf repeated. Dropping the namespace
 * and de-duplicating adjacent repeats is what makes these read as names.
 */
export function humaniseKey(key: string) {
  const leaf = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
  const words: string[] = [];
  for (const raw of leaf.split(/[_\s-]+/).filter(Boolean)) {
    const lower = raw.toLowerCase();
    // Collapse immediate repetition: first_run_profile_profile -> First Run Profile
    if (words.length && words[words.length - 1].toLowerCase() === lower) continue;
    words.push(ACRONYMS.has(lower) ? lower.toUpperCase() : lower[0].toUpperCase() + lower.slice(1));
  }
  return words.join(" ") || key;
}

/** Removes the one legacy Profile namespace before presenting a stable key. */
export function profileLabel(key: string) {
  const leaf = key.startsWith("first_run_profile_")
    ? key.slice("first_run_profile_".length)
    : key;
  return humaniseKey(leaf) || "Profile detail";
}

const compactProfileText = (value: string) => {
  const trimmed = value.trim();
  const characters = [...trimmed];
  return characters.length > 180
    ? `${characters.slice(0, 179).join("")}…`
    : trimmed;
};

/**
 * Profile values may be structured JSON internally. Search rows should present
 * the user-facing value, never serialize that storage envelope into the GUI.
 */
export function profileValueSummary(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return profileValueSummary(JSON.parse(trimmed)); }
      catch { /* A user-authored string that merely resembles JSON stays text. */ }
    }
    return compactProfileText(value) || "Profile detail";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const visible = value
      .filter((entry): entry is string | number | boolean =>
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")
      .slice(0, 3)
      .map((entry) => compactProfileText(String(entry)))
      .filter(Boolean);
    return visible.length ? visible.join(" · ") : "Structured profile detail";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value_text", "valueText", "value", "summary", "text", "label"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return compactProfileText(candidate);
      if (typeof candidate === "number" || typeof candidate === "boolean") return String(candidate);
    }
  }
  return "Structured profile detail";
}

/**
 * Presents a stored *value* that is an enum token.
 *
 * Record keys were the obvious case, but values carry enums too: Life Profile
 * showed `none_declared` and `no_safety_boundary_in_turn` verbatim inside its
 * detail panes. Deliberately conservative — only all-lowercase snake_case with no
 * slash, dot or space is treated as a token, so `America/New_York`, a file path,
 * a hash and ordinary prose all pass through untouched.
 */
export function humaniseValue(value: string) {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(value)) return value;
  const words = value.split("_");
  return words
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
