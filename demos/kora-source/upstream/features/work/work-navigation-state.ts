const WORK_ROUTE_ORIGIN = "https://kora.local";

/**
 * Work links can carry a little browsing state back to the collection that
 * opened a record. Keep this deliberately small: a record title or an opaque
 * path should never become a navigation destination just because it arrived
 * in a query string.
 */
const WORK_RETURN_QUERY_KEYS = new Set([
  "view",
  "filter",
  "q",
  "kind",
  "columns",
  "stage",
  "range",
  "date",
]);
const WORK_TIMELINE_RANGES = new Set(["30", "90", "180"]);

const WORK_RETURN_COLLECTIONS = new Set([
  "/work",
  "/work/goals",
  "/work/tasks",
  "/work/timeline",
  "/work/archive",
]);

function isWorkRecordPath(pathname: string) {
  return /^\/work\/(?:goals|tasks)\/[^/]+$/.test(pathname);
}

function safeWorkPath(pathname: string) {
  return WORK_RETURN_COLLECTIONS.has(pathname) || isWorkRecordPath(pathname);
}

function sanitizeWorkSearch(search: string) {
  const source = new URLSearchParams(search);
  const clean = new URLSearchParams();
  for (const [key, value] of source) {
    if (!WORK_RETURN_QUERY_KEYS.has(key)) continue;
    if (key === "range" && !WORK_TIMELINE_RANGES.has(value)) continue;
    if (key === "date" && !isValidDateKey(value)) continue;
    clean.set(key, value);
  }
  const encoded = clean.toString();
  return encoded ? `?${encoded}` : "";
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

export function isSafeWorkReturnPath(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) return false;
  try {
    const target = new URL(candidate, WORK_ROUTE_ORIGIN);
    return target.origin === WORK_ROUTE_ORIGIN && safeWorkPath(target.pathname);
  } catch {
    return false;
  }
}

export function workDetailHref(
  destination: string,
  returnTo: string,
  defaultReturnTo: string,
) {
  if (returnTo === defaultReturnTo) return destination;
  return `${destination}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function workReturnPath(
  candidate: string | null | undefined,
  fallback: "/work" | "/work/goals" | "/work/tasks" | "/work/timeline" | "/work/archive",
) {
  if (!isSafeWorkReturnPath(candidate)) {
    return fallback;
  }
  try {
    const target = new URL(candidate, WORK_ROUTE_ORIGIN);
    return `${target.pathname}${sanitizeWorkSearch(target.search)}`;
  } catch {
    return fallback;
  }
}
