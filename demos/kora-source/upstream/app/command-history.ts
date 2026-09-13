import { NAVIGATION_DESTINATIONS, destinationForPath, type NavigationDestination } from "./navigation";

const RECENT_DESTINATIONS_KEY = "kora.command-palette.recents.v1";
const MAX_RECENT_DESTINATIONS = 6;

function readIds() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(RECENT_DESTINATIONS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/** Store only stable registry ids. Record titles, ids, and provider data never enter browser storage. */
export function rememberCommandDestination(pathname: string) {
  const destination = destinationForPath(pathname);
  if (!destination) return;
  const next = [destination.id, ...readIds().filter((id) => id !== destination.id)].slice(0, MAX_RECENT_DESTINATIONS);
  try {
    window.sessionStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next));
  } catch {
    // Recents are progressive enhancement; navigation must never depend on storage.
  }
}

export function recentCommandDestinations(currentPath: string, limit = 4): NavigationDestination[] {
  const current = destinationForPath(currentPath)?.id;
  const byId = new Map(NAVIGATION_DESTINATIONS.map((destination) => [destination.id, destination]));
  return readIds()
    .filter((id) => id !== current)
    .map((id) => byId.get(id))
    .filter((destination): destination is NavigationDestination => destination !== undefined)
    .slice(0, limit);
}

export function __resetCommandHistoryForTests() {
  try { window.sessionStorage.removeItem(RECENT_DESTINATIONS_KEY); } catch { /* noop */ }
}
