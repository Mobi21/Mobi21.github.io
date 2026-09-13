export const brainRouteViewports = [
  { id: "wide", width: 1440, height: 900 },
  { id: "intermediate", width: 1024, height: 768 },
  { id: "compact", width: 680, height: 620 },
] as const;

export const brainRouteSurfaces = [
  "memory",
  "pages",
  "people",
  "sources",
  "created",
] as const;

export type BrainRouteSurface = (typeof brainRouteSurfaces)[number];

export const brainRouteModesBySurface = {
  memory: ["list", "detail"],
  pages: ["list", "detail", "new", "edit"],
  people: ["list", "detail", "new", "edit"],
  sources: ["list", "detail", "new", "edit"],
  created: ["list", "detail"],
} as const satisfies Record<BrainRouteSurface, readonly string[]>;

export type BrainRouteMode = (typeof brainRouteModesBySurface)[BrainRouteSurface][number];

export const brainRouteFixturesBySurface = {
  memory: ["populated", "empty", "large", "long-copy", "loading", "partial", "unavailable", "restricted", "archived", "missing", "save-conflict", "learning-failure-history", "stale-source-unsupported"],
  pages: ["populated", "empty", "large", "long-copy", "loading", "partial", "unavailable", "restricted", "archived", "missing", "detail-error", "save-success", "save-error", "save-conflict", "restore-unsupported", "linked-work-unavailable"],
  people: ["populated", "empty", "large", "long-copy", "loading", "partial", "unavailable", "restricted", "missing", "detail-error", "count-2", "count-100", "count-1000", "search-match", "search-no-match", "edit-dirty", "edit-validation", "edit-approval", "edit-error", "delete-ordinary", "delete-restricted", "delete-expired", "delete-success", "delete-error", "linked-work-unavailable"],
  sources: ["populated", "empty", "large", "long-copy", "loading", "partial", "unavailable", "restricted", "stale", "missing", "detail-error", "local-current", "local-partial", "local-error", "checking", "index-failure-retryable", "index-failure-terminal", "archived-unsupported", "archived-recovery-unsupported", "provider-connected", "provider-stale", "provider-unavailable", "provider-not-configured", "provider-denied", "provider-expired"],
  created: ["populated", "empty", "large", "long-copy", "loading", "partial", "unavailable", "missing", "detail-error", "native-only", "open-error", "preview-error"],
} as const satisfies Record<BrainRouteSurface, readonly string[]>;

export type BrainRouteFixture = (typeof brainRouteFixturesBySurface)[BrainRouteSurface][number];

export const brainRouteAuthorityNotes = {
  memory: {
    "stale-source-unsupported": "Memory records expose origin references but no typed source-freshness result. This fixture names the missing authority instead of inventing a stale-source claim.",
  },
  pages: {
    "restore-unsupported": "The typed Pages client exposes archive, but no restore operation. The archived read-only state is rendered without inventing a write.",
    "linked-work-unavailable": "The typed Page workspace has no linked-Work result or availability field, so this state cannot be presented as product data.",
  },
  people: {
    "linked-work-unavailable": "The typed Person workspace can qualify an incomplete Work window. Calendar remains omitted because there is no explicit Person-to-Calendar relation contract; the conditional Linked anatomy does not authorize inferred matches.",
  },
  sources: {
    "archived-unsupported": "KnowledgeSource state is active or unavailable; the typed Sources client has no archived state or archive operation.",
    "archived-recovery-unsupported": "KnowledgeSource state is active or unavailable; unregister is destructive and the typed Sources client has no archive or restore operation.",
  },
} as const;

export function brainRouteAuthorityNote(surface: BrainRouteSurface, selectedFixture: BrainRouteFixture) {
  const notes = brainRouteAuthorityNotes[surface as keyof typeof brainRouteAuthorityNotes] as Partial<Record<BrainRouteFixture, string>> | undefined;
  return notes?.[selectedFixture];
}

export function isBrainRouteSurface(value: string | null): value is BrainRouteSurface {
  return value !== null && (brainRouteSurfaces as readonly string[]).includes(value);
}

export function isBrainRouteMode(surface: BrainRouteSurface, value: string | null): value is BrainRouteMode {
  return value !== null && (brainRouteModesBySurface[surface] as readonly string[]).includes(value);
}

export function isBrainRouteFixture(surface: BrainRouteSurface, value: string | null): value is BrainRouteFixture {
  return value !== null && (brainRouteFixturesBySurface[surface] as readonly string[]).includes(value);
}
