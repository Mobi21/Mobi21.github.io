export {
  SETTINGS_DESTINATIONS,
  SETTINGS_GROUPS,
  SETTINGS_ROUTES,
  type SettingsDestinationAvailability,
  type SettingsDestinationDefinition,
  type SettingsDestinationFocus,
  type SettingsRouteDefinition,
  type SettingsRouteGroup,
  type SettingsRouteId,
} from "../../app/navigation";
import { SETTINGS_DESTINATIONS, SETTINGS_ROUTES, type SettingsDestinationDefinition } from "../../app/navigation";

function normalizedSearchText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function destinationScore(destination: SettingsDestinationDefinition, normalizedQuery: string) {
  const label = destination.label.toLocaleLowerCase();
  const fields = [destination.breadcrumb, destination.description, ...destination.aliases]
    .join(" ")
    .toLocaleLowerCase();
  if (label === normalizedQuery) return 0;
  if (label.startsWith(normalizedQuery)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) return 2;
  if (fields.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) return 3;
  return `${label} ${fields}`.includes(normalizedQuery) ? 4 : null;
}

/**
 * Static availability describes how a destination must qualify itself; it does
 * not infer current native/provider state. Every returned destination is safe
 * to name without exposing an account identity or restricted runtime data.
 */
export function isSettingsDestinationDiscoverable(destination: SettingsDestinationDefinition) {
  return destination.availability === "always"
    || destination.availability === "native-qualified"
    || destination.availability === "known-provider";
}

export function searchSettingsDestinations(query: string) {
  const normalized = normalizedSearchText(query);
  if (!normalized) return SETTINGS_DESTINATIONS.filter((destination) => destination.kind === "route");
  return SETTINGS_DESTINATIONS
    .filter(isSettingsDestinationDiscoverable)
    .map((destination) => ({ destination, score: destinationScore(destination, normalized) }))
    .filter((result): result is { destination: SettingsDestinationDefinition; score: number } => result.score !== null)
    .sort((left, right) => left.score - right.score
      || SETTINGS_DESTINATIONS.indexOf(left.destination) - SETTINGS_DESTINATIONS.indexOf(right.destination))
    .map(({ destination }) => destination);
}

export function settingsDestinationForHash(hash: string) {
  const anchor = hash.startsWith("#setting-") ? hash.slice("#setting-".length) : "";
  return anchor ? SETTINGS_DESTINATIONS.find((destination) => destination.anchor === anchor) : undefined;
}

export function searchSettingsRoutes(query: string) {
  const normalized = normalizedSearchText(query);
  if (!normalized) return SETTINGS_ROUTES;
  return SETTINGS_ROUTES.filter((route) =>
    [route.label, route.description, route.group, ...route.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export function settingsRouteIdForPath(pathname: string) {
  const matches = SETTINGS_ROUTES
    .filter((route) => route.href === "/settings" ? pathname === route.href : pathname === route.href || pathname.startsWith(`${route.href}/`))
    .sort((left, right) => right.href.length - left.href.length);
  return matches[0]?.id ?? "overview";
}
