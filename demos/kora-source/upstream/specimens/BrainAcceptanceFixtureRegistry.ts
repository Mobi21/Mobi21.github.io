/**
 * Deterministic, synthetic-only acceptance states for PRD 10's Brain/People
 * routes. These entries point at existing product workspaces and typed clients;
 * they are qualification evidence, not another Brain state model.
 */
export const BRAIN_HOME_ACCEPTANCE_FIXTURES = [
  "recent-over-8",
] as const;

export const BRAIN_SEARCH_ACCEPTANCE_FIXTURES = [
  "search-idle",
  "search-typing",
  "search-loading",
  "search-no-match",
  "search-filtered-no-match",
  "search-unavailable",
  "search-multi-select",
] as const;

export const BRAIN_MEMORY_ACCEPTANCE_FIXTURES = [
  "stale-source-unsupported",
  "save-conflict",
  "learning-failure-history",
] as const;

export const BRAIN_PEOPLE_ACCEPTANCE_FIXTURES = [
  "count-2",
  "count-100",
  "count-1000",
  "search-match",
  "search-no-match",
  "edit-dirty",
] as const;

export const BRAIN_SOURCES_ACCEPTANCE_FIXTURES = [
  "checking",
  "index-failure-retryable",
  "index-failure-terminal",
  "archived-recovery-unsupported",
] as const;

export type BrainAcceptanceFixture =
  | (typeof BRAIN_HOME_ACCEPTANCE_FIXTURES)[number]
  | (typeof BRAIN_SEARCH_ACCEPTANCE_FIXTURES)[number]
  | (typeof BRAIN_MEMORY_ACCEPTANCE_FIXTURES)[number]
  | (typeof BRAIN_PEOPLE_ACCEPTANCE_FIXTURES)[number]
  | (typeof BRAIN_SOURCES_ACCEPTANCE_FIXTURES)[number];

export type BrainAcceptanceFixtureEntry = {
  surface: "home" | "search" | "memory" | "people" | "sources";
  fixture: BrainAcceptanceFixture;
  href: `/specimens/${string}`;
  support: "supported" | "unsupported";
  authorityNote?: string;
};

export const BRAIN_ACCEPTANCE_FIXTURE_REGISTRY: readonly BrainAcceptanceFixtureEntry[] = [
  { surface: "home", fixture: "recent-over-8", href: "/specimens/brain-overview.html?fixture=recent-over-8", support: "supported" },
  { surface: "search", fixture: "search-idle", href: "/specimens/brain-overview.html?fixture=search-idle", support: "supported" },
  { surface: "search", fixture: "search-typing", href: "/specimens/brain-overview.html?fixture=search-typing", support: "supported" },
  { surface: "search", fixture: "search-loading", href: "/specimens/brain-overview.html?fixture=search-loading", support: "supported" },
  { surface: "search", fixture: "search-no-match", href: "/specimens/brain-overview.html?fixture=search-no-match", support: "supported" },
  { surface: "search", fixture: "search-filtered-no-match", href: "/specimens/brain-overview.html?fixture=search-filtered-no-match", support: "supported" },
  { surface: "search", fixture: "search-unavailable", href: "/specimens/brain-overview.html?fixture=search-unavailable", support: "supported" },
  { surface: "search", fixture: "search-multi-select", href: "/specimens/brain-overview.html?fixture=search-multi-select", support: "supported" },
  {
    surface: "memory",
    fixture: "stale-source-unsupported",
    href: "/specimens/brain-routes.html?surface=memory&mode=detail&fixture=stale-source-unsupported",
    support: "unsupported",
    authorityNote: "Memory records expose origin references but no typed source-freshness result. The fixture states that boundary instead of inventing a stale-source claim.",
  },
  { surface: "memory", fixture: "save-conflict", href: "/specimens/brain-routes.html?surface=memory&mode=detail&fixture=save-conflict", support: "supported" },
  { surface: "memory", fixture: "learning-failure-history", href: "/specimens/brain-routes.html?surface=memory&mode=list&fixture=learning-failure-history", support: "supported" },
  { surface: "people", fixture: "count-2", href: "/specimens/brain-routes.html?surface=people&mode=list&fixture=count-2", support: "supported" },
  { surface: "people", fixture: "count-100", href: "/specimens/brain-routes.html?surface=people&mode=list&fixture=count-100", support: "supported" },
  { surface: "people", fixture: "count-1000", href: "/specimens/brain-routes.html?surface=people&mode=list&fixture=count-1000", support: "supported" },
  { surface: "people", fixture: "search-match", href: "/specimens/brain-routes.html?surface=people&mode=list&fixture=search-match", support: "supported" },
  { surface: "people", fixture: "search-no-match", href: "/specimens/brain-routes.html?surface=people&mode=list&fixture=search-no-match", support: "supported" },
  { surface: "people", fixture: "edit-dirty", href: "/specimens/brain-routes.html?surface=people&mode=edit&fixture=edit-dirty", support: "supported" },
  { surface: "sources", fixture: "checking", href: "/specimens/brain-routes.html?surface=sources&mode=new&fixture=checking", support: "supported" },
  { surface: "sources", fixture: "index-failure-retryable", href: "/specimens/brain-routes.html?surface=sources&mode=new&fixture=index-failure-retryable", support: "supported" },
  { surface: "sources", fixture: "index-failure-terminal", href: "/specimens/brain-routes.html?surface=sources&mode=new&fixture=index-failure-terminal", support: "supported" },
  {
    surface: "sources",
    fixture: "archived-recovery-unsupported",
    href: "/specimens/brain-routes.html?surface=sources&mode=list&fixture=archived-recovery-unsupported",
    support: "unsupported",
    authorityNote: "Knowledge Sources have active/unavailable states and destructive unregister, but no archive/restore operation. Recovery is not presented as product behavior.",
  },
] as const;

export function brainAcceptanceFixture(
  surface: BrainAcceptanceFixtureEntry["surface"],
  fixture: BrainAcceptanceFixture,
) {
  return BRAIN_ACCEPTANCE_FIXTURE_REGISTRY.find((entry) => entry.surface === surface && entry.fixture === fixture)!;
}
