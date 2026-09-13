import type { BrainSearchDestination } from "../../lib/runtime";

/** The only Brain search state that is safe to carry between routed views. */
export type BrainSearchSnapshot = {
  query: string;
  scope: string;
  filters: {
    pageStates?: Array<"active" | "archived">;
    workStates?: Array<"planned" | "active" | "blocked" | "completed" | "cancelled" | "archived">;
    workDueAfter?: string;
    workDueBefore?: string;
  };
  scrollTop: number;
  focusedResult?: string;
};

export type BrainOrigin = {
  kind: "search" | "home";
  returnTo: "/brain" | "/brain?view=search";
  snapshot?: BrainSearchSnapshot;
};

export type BrainNavigationState = Record<string, unknown> & {
  brainOrigin?: BrainOrigin;
};

export const BRAIN_SEARCH_RETURN_PATH = "/brain?view=search" as const;

const validScopes: ReadonlySet<string> = new Set(["everything", "memory", "people", "pages", "sources", "work", "created"]);
const validPageStates: ReadonlySet<"active" | "archived"> = new Set(["active", "archived"]);
const validWorkStates: ReadonlySet<"planned" | "active" | "blocked" | "completed" | "cancelled" | "archived"> = new Set(["planned", "active", "blocked", "completed", "cancelled", "archived"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray<T extends string>(value: unknown, allowed: ReadonlySet<T>): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is T => typeof item === "string" && allowed.has(item as T));
  return values.length === value.length ? Array.from(new Set(values)) : undefined;
}

function readSnapshot(value: unknown): BrainSearchSnapshot | undefined {
  if (!isRecord(value) || typeof value.query !== "string" || typeof value.scope !== "string" || !validScopes.has(value.scope)) return undefined;
  if (value.query.length > 1_000 || !isRecord(value.filters)) return undefined;
  const pageStates = stringArray(value.filters.pageStates, validPageStates);
  const workStates = stringArray(value.filters.workStates, validWorkStates);
  const scrollTop = typeof value.scrollTop === "number" && Number.isFinite(value.scrollTop) && value.scrollTop >= 0
    ? value.scrollTop
    : 0;
  const focusedResult = typeof value.focusedResult === "string" && value.focusedResult.length <= 300
    ? value.focusedResult
    : undefined;
  const workDueAfter = typeof value.filters.workDueAfter === "string" && value.filters.workDueAfter.length <= 64
    ? value.filters.workDueAfter
    : undefined;
  const workDueBefore = typeof value.filters.workDueBefore === "string" && value.filters.workDueBefore.length <= 64
    ? value.filters.workDueBefore
    : undefined;
  return {
    query: value.query,
    scope: value.scope,
    filters: {
      ...(pageStates ? { pageStates } : {}),
      ...(workStates ? { workStates } : {}),
      ...(workDueAfter ? { workDueAfter } : {}),
      ...(workDueBefore ? { workDueBefore } : {}),
    },
    scrollTop,
    ...(focusedResult ? { focusedResult } : {}),
  };
}

/** Read only the validated, app-authored part of React Router location state. */
export function readBrainOrigin(value: unknown): BrainOrigin | undefined {
  if (!isRecord(value) || !isRecord(value.brainOrigin)) return undefined;
  const origin = value.brainOrigin;
  if ((origin.kind !== "search" && origin.kind !== "home") || (origin.returnTo !== "/brain" && origin.returnTo !== BRAIN_SEARCH_RETURN_PATH)) return undefined;
  if ((origin.kind === "search" && origin.returnTo !== BRAIN_SEARCH_RETURN_PATH)
    || (origin.kind === "home" && origin.returnTo !== "/brain")) return undefined;
  const snapshot = readSnapshot(origin.snapshot);
  if (origin.kind === "search" && !snapshot) return undefined;
  return {
    kind: origin.kind,
    returnTo: origin.returnTo,
    ...(snapshot ? { snapshot } : {}),
  };
}

/** Merge the Brain origin into existing route state so feature-owned state survives. */
export function withBrainOrigin(existing: unknown, origin: BrainOrigin): BrainNavigationState {
  return {
    ...(isRecord(existing) ? existing : {}),
    brainOrigin: origin,
  };
}

export function brainSearchSnapshotFor(
  query: string,
  scope: string,
  filters: BrainSearchSnapshot["filters"],
  scrollTop: number,
  focusedResult?: string,
): BrainSearchSnapshot {
  return {
    query: query.slice(0, 1_000),
    scope: validScopes.has(scope) ? scope : "everything",
    filters,
    scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
    ...(focusedResult ? { focusedResult: focusedResult.slice(0, 300) } : {}),
  };
}

export function destinationPathIsLocal(destination: BrainSearchDestination | undefined): destination is BrainSearchDestination {
  const path = destination?.path.trim();
  return Boolean(path && path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(path));
}

/** Keep safe scope context in the registered Search destination; private query/filter values stay in state. */
export function searchReturnPath(snapshot?: Pick<BrainSearchSnapshot, "scope">) {
  if (!snapshot || snapshot.scope === "everything" || !validScopes.has(snapshot.scope)) return BRAIN_SEARCH_RETURN_PATH;
  return `${BRAIN_SEARCH_RETURN_PATH}&scope=${encodeURIComponent(snapshot.scope)}`;
}

/** Only record routes authored by the Brain search runtime may show its return affordance. */
export function isBrainExternalRecordPath(pathname: string): boolean {
  if (!pathname || /[\\\u0000-\u001f\u007f]/.test(pathname)) return false;
  return pathname.startsWith("/work/goals/")
    || pathname.startsWith("/work/tasks/")
    || pathname.startsWith("/life/about-you/facts/");
}
