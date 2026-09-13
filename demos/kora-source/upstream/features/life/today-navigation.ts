/** The bounded, app-authored state carried between Today and a source record. */
export type TodayOrigin = {
  version: 1;
  route: "/life/today";
  destination: string;
  scrollTop: number;
  focusId: string;
};

const ROUTE_ORIGIN = "https://kora.local";
const MAX_FOCUS_ID_LENGTH = 256;
const MAX_DESTINATION_LENGTH = 2_048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasUnsafeCharacters(value: string) {
  return /[\\\u0000-\u001f\u007f]/.test(value);
}

/**
 * Check path segments before URL parsing can normalize a dot segment. This
 * keeps encoded separators and traversal out of state that React Router will
 * later interpret as a location.
 */
function hasSafePathSegments(pathname: string) {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || hasUnsafeCharacters(pathname)) return false;
  const segments = pathname.split("/");
  for (const segment of segments.slice(1)) {
    if (!segment) return false;
    try {
      const decoded = decodeURIComponent(segment);
      if (!decoded || decoded === "." || decoded === ".." || /[\\/\u0000-\u001f\u007f]/.test(decoded)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function isAllowedDestination(destination: unknown): destination is string {
  if (typeof destination !== "string" || destination.length < 1 || destination.length > MAX_DESTINATION_LENGTH) return false;
  if (hasUnsafeCharacters(destination) || destination.includes("#")) return false;
  if (!destination.startsWith("/") || destination.startsWith("//")) return false;

  let target: URL;
  try {
    target = new URL(destination, ROUTE_ORIGIN);
  } catch {
    return false;
  }
  if (target.origin !== ROUTE_ORIGIN || target.username || target.password || target.host !== "kora.local") return false;
  if (target.pathname !== destination.split("?", 1)[0] || !hasSafePathSegments(target.pathname)) return false;

  const path = target.pathname;
  const isWorkDetail = /^\/work\/(?:tasks|goals)\/[^/]+$/.test(path);
  const isCalendarEventDetail = /^\/calendar\/event\/[^/]+\/[^/]+$/.test(path);
  const isBrainPageDetail = /^\/brain\/pages\/[^/]+$/.test(path);
  const isLifeProducer = path === "/life/finances"
    || path === "/life/wellbeing"
    || path === "/life/wellbeing/food"
    || path === "/life/wellbeing/care"
    || path === "/life/wellbeing/routines"
    || path === "/life/wellbeing/records"
    || path === "/life/about-you"
    || /^\/life\/about-you\/[^/]+$/.test(path);

  // Current Today producers emit canonical paths without query state. Keep
  // query-bearing destinations available for the record owners, while Life
  // remains exact because its producers emit only these paths.
  return isWorkDetail || isCalendarEventDetail || isBrainPageDetail || (isLifeProducer && !target.search);
}

function validateOrigin(origin: unknown): TodayOrigin | undefined {
  if (!isRecord(origin)
    || origin.version !== 1
    || origin.route !== "/life/today"
    || !isAllowedDestination(origin.destination)
    || typeof origin.scrollTop !== "number"
    || !Number.isFinite(origin.scrollTop)
    || origin.scrollTop < 0
    || typeof origin.focusId !== "string"
    || origin.focusId.length < 1
    || origin.focusId.length > MAX_FOCUS_ID_LENGTH
    || hasUnsafeCharacters(origin.focusId)) return undefined;
  return {
    version: 1,
    route: "/life/today",
    destination: origin.destination,
    scrollTop: origin.scrollTop,
    focusId: origin.focusId,
  };
}

/** Create Today state only for a real, app-owned destination. */
export function createTodayOrigin(destination: string, focusId: string, scrollTop: number): TodayOrigin | undefined {
  return validateOrigin({ version: 1, route: "/life/today", destination, focusId, scrollTop });
}

/**
 * Read only validated Today state from a React Router location state object.
 * When supplied, currentDestination must equal the origin's destination so a
 * stale or copied state cannot show a return affordance on another record.
 */
export function readTodayOrigin(value: unknown, currentDestination?: string): TodayOrigin | undefined {
  if (!isRecord(value)) return undefined;
  const origin = validateOrigin(value.todayOrigin);
  if (!origin || (currentDestination !== undefined && origin.destination !== currentDestination)) return undefined;
  return origin;
}
