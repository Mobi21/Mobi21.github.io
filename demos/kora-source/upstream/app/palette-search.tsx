import { BookOpen, Brain, CheckSquare2, Database, FileOutput, FileText, Target, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import {
  runtime,
  type BrainScope,
  type BrainSearchPage,
  type PersonalBrainSearchResult,
} from "../lib/runtime";
import type { PaletteRecord, PaletteRecordSearchResult } from "./CommandPalette";

/**
 * The global palette uses the authenticated Brain search projection so every
 * result is already bounded and authorized by the runtime owner. Keeping the
 * scope list here makes its coverage explicit and easy to test.
 */
export const PALETTE_BRAIN_SCOPES: readonly BrainScope[] = [
  "profile",
  "memory",
  "pages",
  "people",
  "knowledge_sources",
  "work",
  "outputs",
];

export const PALETTE_BRAIN_PAGE_SIZE = 20;

const scopeLabels: Record<BrainScope, string> = {
  profile: "Profile",
  memory: "Memory",
  pages: "Pages",
  people: "People",
  knowledge_sources: "Sources",
  work: "Work",
  outputs: "Outputs",
};

const kindLabels: Record<NonNullable<PersonalBrainSearchResult["destination"]>["kind"], string> = {
  profile: "Profile",
  memory: "Memory",
  page: "Page",
  person: "Person",
  knowledge_source: "Source",
  project: "Goal",
  work_item: "Task",
  output: "Output",
};

function kindIcon(kind: keyof typeof kindLabels): ReactNode {
  const Icon = kind === "profile" ? UsersRound
    : kind === "memory" ? Brain
      : kind === "page" ? BookOpen
        : kind === "person" ? UsersRound
          : kind === "knowledge_source" ? Database
            : kind === "project" ? Target
              : kind === "work_item" ? CheckSquare2
                : kind === "output" ? FileOutput
                  : FileText;
  return <Icon size={16} aria-hidden="true" />;
}

function searchablePreview(result: PersonalBrainSearchResult) {
  if (typeof result.preview === "string") return result.preview.slice(0, 500);
  if (result.preview === null || result.preview === undefined) return "";
  return JSON.stringify(result.preview).slice(0, 500);
}

function hasCanonicalPalettePath(path: string | undefined): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

function paletteRecordFor(result: PersonalBrainSearchResult): PaletteRecord | undefined {
  const destination = result.destination;
  // The runtime owns canonical routes. A missing route is an honest omission;
  // reconstructing one in the UI could cross an authorization boundary.
  const path = destination?.path.trim();
  if (!destination || !hasCanonicalPalettePath(path)) return undefined;
  const title = result.display.title.trim();
  if (!title) return undefined;
  const kind = kindLabels[destination.kind];
  const detailParts = [
    kind,
    result.display.originLabel,
    result.scope === "work" ? result.state : undefined,
    result.scope === "outputs" ? result.mediaType : undefined,
  ].filter((part): part is string => Boolean(part));
  const details = detailParts.filter((part, index) =>
    detailParts.findIndex((candidate) => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index,
  ).join(" · ");
  const preview = searchablePreview(result);
  return {
    id: `brain:${destination.kind}:${path}`,
    label: title,
    description: details,
    path,
    icon: kindIcon(destination.kind),
    keywords: [preview, result.matchReason, result.display.originLabel ?? ""],
  };
}

function coverageReason(reason: string | undefined) {
  if (!reason || reason === "unsupported") return "unsupported";
  if (reason === "authority_unavailable") return "authority unavailable";
  if (reason.startsWith("semantic_")) return "search index limited";
  if (reason === "bounded_text_subset" || reason === "candidate_cap") return "search scope limited";
  return "search limited";
}

/** Convert typed Brain coverage into source-specific, user-readable notices. */
export function paletteSearchIssues(page: BrainSearchPage): string[] {
  const issues = new Map<BrainScope, string>();
  for (const unavailable of page.unavailableScopes) {
    issues.set(unavailable.scope, "unavailable");
  }
  for (const limited of page.limitedScopes) {
    if (!issues.has(limited.scope)) issues.set(limited.scope, coverageReason(limited.reason));
  }
  for (const coverage of page.coverage) {
    if (coverage.state === "unavailable") issues.set(coverage.scope, "unavailable");
    else if (coverage.state === "limited" && !issues.has(coverage.scope)) {
      const reason = coverage.channels.find((channel) => channel.state !== "complete")?.reason;
      issues.set(coverage.scope, coverageReason(reason));
    }
  }
  // The current typed source projection carries safe display/context for
  // knowledge sources but does not author a canonical destination. Surface
  // that limitation when such a result was returned instead of silently
  // presenting a complete-looking search.
  if (page.results.some((result) => (
    result.scope === "knowledge_sources" && !hasCanonicalPalettePath(result.destination?.path.trim())
  )) && !issues.has("knowledge_sources")) {
    issues.set("knowledge_sources", "not directly openable");
  }
  return [...issues.entries()]
    .sort(([left], [right]) => PALETTE_BRAIN_SCOPES.indexOf(left) - PALETTE_BRAIN_SCOPES.indexOf(right))
    .map(([scope, reason]) => `${scopeLabels[scope]}: ${reason}`);
}

/** Search all public Brain projections through the existing bounded contract. */
export async function searchPaletteRecords(
  query: string,
  signal?: AbortSignal,
): Promise<PaletteRecordSearchResult> {
  const page = await runtime.personalBrainSearchPage({
    query,
    scopes: [...PALETTE_BRAIN_SCOPES],
    pageSize: PALETTE_BRAIN_PAGE_SIZE,
  }, signal);
  const seen = new Set<string>();
  const records = page.results.flatMap((result) => {
    const record = paletteRecordFor(result);
    if (!record || seen.has(record.id)) return [];
    seen.add(record.id);
    return [record];
  });
  return { records, issues: paletteSearchIssues(page) };
}
