import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  ListFilter,
  MessageCircleMore,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  CheckboxChoice,
  Field,
  Input,
  KoraPresenceMark,
  Menu,
  Popover,
  SearchField,
  SegmentedControl,
  StateView,
} from "../../components/primitives";
import { useViewBar } from "../../app/ViewBar";
import {
  runtime,
  type BrainSearchPage,
  type BrainCursorPage,
  type BrainPage,
  type BrainScope,
  type ConversationContextRequest,
  type ConversationContextSelection,
  type KnowledgeSource,
  type MemoryRecord,
  type MemoryPipelineHealth,
  type OutputSummary,
  type PersonalBrainSearchResult,
  type PersonRecord,
} from "../../lib/runtime";
import { dateLabel, profileLabel, profileValueSummary } from "../../lib/language";
import { DUR, EASE } from "../../lib/motion";
import {
  conversationContextKey,
  conversationContextReady,
} from "../conversation/conversation-context";
import { BrainLayout } from "./BrainLayout";
import {
  BRAIN_SEARCH_RETURN_PATH,
  brainSearchSnapshotFor,
  destinationPathIsLocal,
  readBrainOrigin,
  withBrainOrigin,
  type BrainOrigin,
  type BrainSearchSnapshot,
} from "./brain-navigation";

type MemoryPage = BrainCursorPage<MemoryRecord>;

export type BrainOverviewClient = {
  personalBrainSearchPage: typeof runtime.personalBrainSearchPage;
  memoryPage: (input?: { limit?: number }) => Promise<MemoryPage>;
  memoryPipelineHealth: () => Promise<MemoryPipelineHealth>;
  pagesPage: (input?: { pageSize?: number }) => Promise<BrainCursorPage<BrainPage>>;
  peoplePage: (input?: { order?: "name_asc" | "updated_desc"; pageSize?: number }) => Promise<BrainCursorPage<PersonRecord>>;
  knowledgeSourcesPage: (input?: { pageSize?: number }) => Promise<BrainCursorPage<KnowledgeSource>>;
  outputsPage: (input?: { pageSize?: number }) => Promise<BrainCursorPage<OutputSummary>>;
};

type BrainMode = "find" | "ask";
type BrainPageState = "active" | "archived";
type BrainWorkState = "planned" | "active" | "blocked" | "completed" | "cancelled" | "archived";
type BrainSearchFilters = {
  pageStates?: BrainPageState[];
  workStates?: BrainWorkState[];
  workDueAfter?: string;
  workDueBefore?: string;
};
type BrainFilterDraft = {
  pageStates: BrainPageState[];
  workStates: BrainWorkState[];
  workDueAfter: string;
  workDueBefore: string;
};

const scopeChoices: Array<{ id: string; label: string; scopes?: BrainScope[] }> = [
  { id: "everything", label: "Everything" },
  { id: "memory", label: "Memory", scopes: ["memory", "profile"] },
  { id: "people", label: "People", scopes: ["people"] },
  { id: "pages", label: "Pages", scopes: ["pages"] },
  { id: "sources", label: "Sources", scopes: ["knowledge_sources"] },
  { id: "work", label: "Work", scopes: ["work"] },
  { id: "created", label: "Created", scopes: ["outputs"] },
];

const scopeLabel: Record<PersonalBrainSearchResult["scope"], string> = {
  profile: "Profile",
  memory: "Memory",
  pages: "Page",
  people: "Person",
  knowledge_sources: "Source",
  work: "Work",
  outputs: "Created",
};

const channelLabel = {
  lexical: "Keyword",
  semantic: "Meaning",
} as const;

const workStateChoices: Array<{ value: BrainWorkState; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const defaultFilterDraft = (): BrainFilterDraft => ({
  pageStates: ["active"],
  workStates: [],
  workDueAfter: "",
  workDueBefore: "",
});

function localDateTimeValue(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function filterDraft(filters: BrainSearchFilters): BrainFilterDraft {
  return {
    pageStates: filters.pageStates ?? ["active"],
    workStates: filters.workStates ?? [],
    workDueAfter: localDateTimeValue(filters.workDueAfter),
    workDueBefore: localDateTimeValue(filters.workDueBefore),
  };
}

function filterCount(filters: BrainSearchFilters) {
  const pageChanged = filters.pageStates && !(filters.pageStates.length === 1 && filters.pageStates[0] === "active") ? 1 : 0;
  return pageChanged + (filters.workStates?.length ?? 0) + Number(Boolean(filters.workDueAfter)) + Number(Boolean(filters.workDueBefore));
}

function filtersForScope(filters: BrainSearchFilters, choice: (typeof scopeChoices)[number]): BrainSearchFilters {
  const allowsPages = !choice.scopes || choice.scopes.includes("pages");
  const allowsWork = !choice.scopes || choice.scopes.includes("work");
  return {
    ...(allowsPages && filters.pageStates ? { pageStates: filters.pageStates } : {}),
    ...(allowsWork && filters.workStates ? { workStates: filters.workStates } : {}),
    ...(allowsWork && filters.workDueAfter ? { workDueAfter: filters.workDueAfter } : {}),
    ...(allowsWork && filters.workDueBefore ? { workDueBefore: filters.workDueBefore } : {}),
  };
}

const readableExcerpt = (value: string | undefined, fallback: string) => {
  const text = value?.replace(/[#*_>`[\]~]/g, "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : fallback;
};

const previewText = (result: PersonalBrainSearchResult) => {
  if (result.scope === "profile") return profileValueSummary(result.preview);
  if (typeof result.preview === "string") {
    // Search excerpts are user-facing recognition aids. Keep Markdown syntax
    // out of them and avoid echoing the whole generic Memory title below it.
    if (result.scope === "memory" && /^memory$/i.test(result.display.title.trim())) return "";
    return readableExcerpt(result.preview, "");
  }
  return "Structured profile detail";
};

const resultTitle = (result: PersonalBrainSearchResult) => {
  if (result.scope === "profile") return profileLabel(result.display.title);
  const title = result.display.title.trim();
  if (result.scope === "memory" && /^memory$/i.test(title) && result.preview.trim()) {
    return readableExcerpt(result.preview, "Memory").slice(0, 96);
  }
  return title || scopeLabel[result.scope];
};

const resultIdentity = (result: PersonalBrainSearchResult) => {
  const destination = destinationPathIsLocal(result.destination)
    ? result.destination.path.trim()
    : undefined;
  return destination ?? `${result.scope}:${result.display.objectKind}:${result.display.title}`;
};

const contextTitle = (selection: ConversationContextSelection) =>
  selection.display.objectKind === "profile"
    ? profileLabel(selection.display.title)
    : selection.display.title;

const safeDate = (value: string) => dateLabel(value, { month: "short", day: "numeric" });

type RecentItem = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  route: string;
  updatedAt: string;
};

const fileSizeLabel = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "File artifact";
  if (value < 1_000) return `${value} bytes`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
};

const mediaTypeLabel = (value: string) => {
  const labels: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel workbook",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "text/markdown": "Markdown",
    "text/plain": "Plain text",
    "image/gif": "GIF image",
    "image/jpeg": "JPEG image",
    "image/png": "PNG image",
    "image/webp": "WebP image",
  };
  return labels[value] ?? value;
};

const recentTime = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

function NewBrainMenu() {
  const navigate = useNavigate();
  return <Menu
    trigger={<Button tone="primary" aria-label="New Brain record"><Plus size={15} />New</Button>}
    actions={[
      { id: "new-page", label: "New page", description: "Write a note, goal, area, or reference.", onSelect: () => navigate("/brain/pages/new") },
      { id: "remember", label: "Remember something", description: "Save a fact for Kora to recall.", onSelect: () => navigate("/brain/memory") },
      { id: "new-source", label: "Add a source", description: "Register a file or inline source.", onSelect: () => navigate("/brain/sources/new") },
    ]}
  />;
}

function HomeDashboard({ client }: { client: BrainOverviewClient }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const homeOrigin = useMemo(() => readBrainOrigin(location.state), [location.state]);
  const homeSnapshot = homeOrigin?.kind === "home" ? homeOrigin.snapshot : undefined;
  const memory = useQuery({ queryKey: ["brain", "home", "memory"], queryFn: () => client.memoryPage({ limit: 12 }), staleTime: 15_000 });
  const memoryHealth = useQuery({ queryKey: ["brain", "home", "memory-health"], queryFn: () => client.memoryPipelineHealth(), staleTime: 15_000, retry: false });
  const pages = useQuery({ queryKey: ["brain", "home", "pages"], queryFn: () => client.pagesPage({ pageSize: 12 }), staleTime: 15_000 });
  const people = useQuery({ queryKey: ["brain", "home", "people"], queryFn: () => client.peoplePage({ order: "updated_desc", pageSize: 12 }), staleTime: 15_000 });
  const sources = useQuery({ queryKey: ["brain", "home", "sources"], queryFn: () => client.knowledgeSourcesPage({ pageSize: 12 }), staleTime: 15_000 });
  const outputs = useQuery({ queryKey: ["brain", "home", "outputs"], queryFn: () => client.outputsPage({ pageSize: 12 }), staleTime: 15_000 });

  const recent = useMemo<RecentItem[]>(() => [
    ...(memory.data?.items ?? []).map((item) => ({
      id: `memory:${item.id}`,
      kind: "Memory",
      title: readableExcerpt(item.content, "Untitled memory"),
      excerpt: item.status === "expired" ? "Expired memory · review before relying on it" : "Saved for Kora to recall",
      route: `/brain/memory/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    })),
    ...(pages.data?.items ?? []).map((item) => ({
      id: `page:${item.id}`,
      kind: "Page",
      title: item.title.trim() || "Untitled page",
      excerpt: readableExcerpt(item.bodyMarkdown, "Empty page"),
      route: `/brain/pages/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    })),
    ...(people.data?.items ?? []).map((item) => ({
      id: `person:${item.id}`,
      kind: "Person",
      title: item.displayName.trim() || "Unnamed person",
      excerpt: readableExcerpt(item.contextMarkdown, item.relationshipLabel || "Personal context"),
      route: `/brain/people/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    })),
    ...(sources.data?.items ?? []).map((item) => ({
      id: `source:${item.id}`,
      kind: "Source",
      title: item.label.trim() || "Untitled source",
      excerpt: item.sourceKind === "file" ? item.pathLabel || `${item.format.toUpperCase()} file` : `${item.format === "inline" ? "Inline" : item.format} source`,
      route: `/brain/sources/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    })),
    ...(outputs.data?.items ?? []).map((item) => ({
      id: `output:${item.id}`,
      kind: "Created",
      title: item.title?.trim() || "Untitled output",
      excerpt: `${mediaTypeLabel(item.mediaType)} · ${fileSizeLabel(item.byteSize)}`,
      route: `/brain/outputs/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    })),
  ].sort((left, right) => recentTime(right.updatedAt) - recentTime(left.updatedAt)).slice(0, 10), [memory.data, outputs.data, pages.data, people.data, sources.data]);

  const collections = [
    { label: "Memory", query: memory },
    { label: "Pages", query: pages },
    { label: "People", query: people },
    { label: "Sources", query: sources },
    { label: "Created", query: outputs },
  ] as const;
  const anyPending = collections.some(({ query }) => query.isPending);
  const anyFetching = collections.some(({ query }) => query.isFetching);
  const allPending = collections.every(({ query }) => query.isPending);
  const allUnavailable = collections.every(({ query }) => query.isError);
  const someUnavailable = collections.some(({ query }) => query.isError);
  const unavailableCollections = collections
    .filter(({ query }) => query.isError)
    .map(({ label }) => label);
  const retryUnavailable = () => {
    void Promise.all(
      collections
        .filter(({ query }) => query.isError)
        .map(({ query }) => query.refetch()),
    );
  };
  const openRecent = (event: ReactMouseEvent<HTMLAnchorElement>, item: RecentItem) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    navigate(item.route, {
      state: withBrainOrigin(undefined, {
        kind: "home",
        returnTo: "/brain",
        snapshot: brainSearchSnapshotFor("", "everything", {}, dashboardRef.current?.closest<HTMLElement>(".brain-stage")?.scrollTop ?? 0, item.id),
      }),
    });
  };
  useLayoutEffect(() => {
    if (!homeSnapshot || anyPending || anyFetching || !dashboardRef.current) return;
    const scrollParent = dashboardRef.current.closest<HTMLElement>(".brain-stage");
    if (scrollParent) scrollParent.scrollTop = homeSnapshot.scrollTop;
    if (homeSnapshot.focusedResult) {
      const result = [...dashboardRef.current.querySelectorAll<HTMLElement>("[data-result-id]")]
        .find((candidate) => candidate.dataset.resultId === homeSnapshot.focusedResult);
      if (result) result.focus();
      else dashboardRef.current.closest<HTMLElement>(".brain-overview")?.querySelector<HTMLInputElement>('input[aria-label="Find in your Brain"]')?.focus();
    }
  }, [anyFetching, anyPending, homeSnapshot, recent]);
  const healthNotice = (() => {
    const health = memoryHealth.data;
    if (memoryHealth.isError)
      return { icon: CircleAlert, title: "Memory activity could not be checked.", body: "Automatic learning and explicit Remember keep their current settings." };
    if (!health) return undefined;
    if (!health.automaticLearning.enabled)
      return { icon: ShieldCheck, title: "Automatic learning is off.", body: "Explicit Remember and existing memories still work." };
    if (health.processing.state === "attention")
      return { icon: CircleAlert, title: "Automatic Memory needs attention.", body: health.processing.failed > 0 ? `${health.processing.failed} recorded ${health.processing.failed === 1 ? "attempt did" : "attempts did"} not settle. This is history, not a live connection check.` : "A processing attempt has been open for more than five minutes." };
    return undefined;
  })();

  return <motion.div ref={dashboardRef} className="brain-home-dashboard" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE.out }}>
    {healthNotice && <div className="brain-home-notice" role="status"><healthNotice.icon size={17} /><span><strong>{healthNotice.title}</strong><small>{healthNotice.body}</small></span><Link to="/brain/memory">Review Memory <ArrowRight size={14} /></Link></div>}
    {recent.length > 0 && someUnavailable && !allUnavailable && <div className="brain-home-notice brain-home-notice--partial" role="status"><CircleAlert size={17} /><span><strong>Recently updated is partial.</strong><small>{unavailableCollections.join(", ")} could not be read. Showing records from the available collections.</small></span><Button tone="ghost" onClick={retryUnavailable}>Retry unavailable</Button></div>}
    <section className="brain-continue" aria-labelledby="brain-continue-title">
      <div className="brain-section-heading"><div><h2 id="brain-continue-title">Recently updated</h2></div><span>Sorted by record update time</span></div>
      {allPending || (anyPending && recent.length === 0) ? <StateView state="loading" title="Loading recent Brain records" />
        : allUnavailable ? <StateView state="unavailable" title="Recent records are unavailable" body="Kora could not read any Brain collection. Open a collection to try again." />
          : recent.length ? <div className="brain-continue__list">{recent.map((item) => <Link key={item.id} data-result-id={item.id} to={item.route} onClick={(event) => openRecent(event, item)}><span className="brain-continue__type"><Badge tone="brain">{item.kind}</Badge></span><span className="brain-continue__copy"><strong>{item.title}</strong><small>{item.excerpt}</small></span><time dateTime={item.updatedAt}>{safeDate(item.updatedAt)}</time><ArrowRight size={14} /></Link>)}</div>
            : someUnavailable ? <StateView state="partial" title="No available recent records yet" body="At least one Brain collection is unavailable, so this is not a complete empty state." />
              : <StateView state="empty" title="Nothing to continue yet" body="Saved memories, pages, people, sources, and created files will appear here." />}
    </section>
  </motion.div>;
}

function ResultRow({
  result,
  selected,
  onToggle,
  origin,
}: {
  result: PersonalBrainSearchResult;
  selected: boolean;
  onToggle: () => void;
  origin: (focusedResult?: string) => BrainOrigin;
}) {
  const navigate = useNavigate();
  const ready = conversationContextReady(result.context);
  const destination = destinationPathIsLocal(result.destination) ? result.destination.path.trim() : undefined;
  const title = resultTitle(result);
  const identity = resultIdentity(result);
  const openResult = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !destination) return;
    event.preventDefault();
    navigate(destination, { state: withBrainOrigin(undefined, origin(identity)) });
  };
  return <article className="brain-result" data-result-id={identity} data-selected={selected || undefined}>
    <div className="brain-result__main">
      <div className="brain-result__headline"><span className="brain-result__identity"><Badge tone="brain">{scopeLabel[result.scope]}</Badge></span><strong>{title}</strong><div className="brain-result__meta"><time dateTime={result.updatedAt}>{safeDate(result.updatedAt)}</time><span>{result.scope === "outputs" && result.mediaType ? mediaTypeLabel(result.mediaType) : result.scope === "work" ? result.state : undefined}</span></div></div>
      {previewText(result) && <p>{previewText(result)}</p>}
      <details className="brain-result__details">
        <summary>Match details</summary>
        <span>{result.matchReason}</span>{result.matchChannels.map((channel) => <small key={channel}>{channelLabel[channel]}</small>)}
      </details>
    </div>
    <div className="brain-result__actions">
      {destination && (ready || result.context.authorization === "allowed")
        ? <Link className="brain-result__open" to={destination} onClick={openResult} aria-label={`Open ${title}`}>Open <ArrowRight size={14} aria-hidden="true" /></Link>
        : <span className="brain-result__unavailable">{destination ? "Open unavailable" : "Not directly openable"}</span>}
      <Button tone={selected ? "secondary" : "ghost"} disabled={!ready} aria-pressed={selected} onClick={onToggle}>
        {selected ? "Selected" : ready ? "Use with Kora" : "Unavailable"}
      </Button>
    </div>
  </article>;
}

export function BrainOverview({
  onAskKora,
  client = runtime,
}: {
  onAskKora: (reference?: ConversationContextRequest | ConversationContextRequest[], draft?: string) => void;
  client?: BrainOverviewClient;
}) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const mode: BrainMode = params.get("mode") === "ask" ? "ask" : "find";
  const routeOrigin = useMemo(() => readBrainOrigin(location.state), [location.state]);
  const routeSnapshot = routeOrigin?.kind === "search" ? routeOrigin.snapshot : undefined;
  const initialQuery = routeSnapshot?.query ?? params.get("q") ?? "";
  const initialScope = params.get("scope") ?? routeSnapshot?.scope;
  const selectedScope = scopeChoices.some((choice) => choice.id === initialScope) ? initialScope! : "everything";
  const scope = scopeChoices.find((choice) => choice.id === selectedScope) ?? scopeChoices[0];
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query.trim());
  const [searchRevision, setSearchRevision] = useState(0);
  const [selected, setSelected] = useState<ConversationContextSelection[]>([]);
  const [selectionDetailsOpen, setSelectionDetailsOpen] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const [filters, setFilters] = useState<BrainSearchFilters>(() => routeSnapshot?.filters ?? {});
  const [filterDraftState, setFilterDraftState] = useState<BrainFilterDraft>(() => filterDraft(routeSnapshot?.filters ?? {}));
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState<string>();
  const overviewRef = useRef<HTMLDivElement>(null);
  const restoredSnapshot = useRef<BrainSearchSnapshot | undefined>(routeSnapshot);
  const queryClient = useQueryClient();
  const allowsPageFilters = !scope.scopes || scope.scopes.includes("pages");
  const allowsWorkFilters = !scope.scopes || scope.scopes.includes("work");
  const filtersAvailable = allowsPageFilters || allowsWorkFilters;
  const activeFilterCount = filterCount(filters);
  const searchView = mode === "find" && params.get("view") === "search";
  const homeRoute = location.pathname === "/brain" && !searchView;

  useEffect(() => {
    const safe = new URLSearchParams();
    if (mode !== "find") safe.set("mode", mode);
    else if (params.get("view") === "search") safe.set("view", "search");
    if (selectedScope !== "everything") safe.set("scope", selectedScope);
    if (safe.toString() !== params.toString()) setParams(safe, { replace: true });
  }, [mode, params, selectedScope, setParams]);

  useEffect(() => {
    if (!homeRoute) return;
    setQuery("");
    setFilters((current) => Object.keys(current).length ? {} : current);
    setFilterDraftState((current) => current.pageStates.length === 1 && current.pageStates[0] === "active" && current.workStates.length === 0 && !current.workDueAfter && !current.workDueBefore
      ? current
      : defaultFilterDraft());
    setFilterOpen(false);
    setSelected((current) => current.length ? [] : current);
    setSelectionError(undefined);
  }, [homeRoute]);

  const searchQueryKey = useMemo(
    () => ["brain", "find", deferredQuery, scope.id, filters, searchRevision] as const,
    [deferredQuery, filters, scope.id, searchRevision],
  );
  const search = useInfiniteQuery({
    queryKey: searchQueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => client.personalBrainSearchPage({ query: deferredQuery, scopes: scope.scopes, pageSize: 30, cursor: pageParam, ...filters }, signal),
    getNextPageParam: (page) => page.cursor,
    enabled: searchView && deferredQuery.length > 0,
    staleTime: 15_000,
  });
  const pages = search.data?.pages ?? [];
  const lastPage = pages.at(-1);
  const cachedResults = pages.flatMap((page) => page.results);
  const boundedTextScopes = [...new Set(pages.flatMap((page) => page.coverage
    .filter((item) => item.channels.some((channel) => channel.state === "limited" && channel.reason === "bounded_text_subset"))
    .map((item) => scopeLabel[item.scope])))];
  const limitedScopeLabels = (reason: BrainSearchPage["limitedScopes"][number]["reason"]) =>
    [...new Set(pages.flatMap((page) => page.limitedScopes
      .filter((item) => item.reason === reason)
      .map((item) => scopeLabel[item.scope])))];
  const semanticIndexingScopes = limitedScopeLabels("semantic_index_incomplete");
  const semanticUnavailableScopes = [
    ...limitedScopeLabels("semantic_runtime_unavailable"),
    ...limitedScopeLabels("semantic_model_mismatch"),
  ].filter((label, index, labels) => labels.indexOf(label) === index);
  const semanticCappedScopes = limitedScopeLabels("semantic_candidate_cap");
  const generalCoverageGaps = (() => {
    const gaps = new Map<PersonalBrainSearchResult["scope"], Set<string>>();
    for (const page of pages) {
      const unavailable = new Set(page.unavailableScopes.map((item) => item.scope));
      const reportedLimits = new Set(page.limitedScopes.map((item) => item.scope));
      for (const item of page.coverage) {
        if (unavailable.has(item.scope) || reportedLimits.has(item.scope)) continue;
        for (const channel of item.channels) {
          if (channel.state === "complete" || channel.state === "unsupported") continue;
          if (channel.state === "limited" && channel.reason === "bounded_text_subset") continue;
          const labels = gaps.get(item.scope) ?? new Set<string>();
          labels.add(channelLabel[channel.channel]);
          gaps.set(item.scope, labels);
        }
      }
    }
    return [...gaps.entries()].map(([itemScope, channels]) =>
      `${scopeLabel[itemScope]}: ${[...channels].join(", ")}`);
  })();
  const snapshotOmissions = lastPage?.snapshotOmissions ?? {
    changed: 0,
    gone: 0,
    unavailable: 0,
  };
  const snapshotOmissionTotal = Object.values(snapshotOmissions)
    .reduce((total, count) => total + count, 0);
  const snapshotOmissionSummary = [
    snapshotOmissions.changed > 0 ? `${snapshotOmissions.changed} changed` : undefined,
    snapshotOmissions.gone > 0 ? `${snapshotOmissions.gone} removed` : undefined,
    snapshotOmissions.unavailable > 0 ? `${snapshotOmissions.unavailable} could not be rechecked` : undefined,
  ].filter(Boolean).join(" · ");
  const snapshotInvalidated = snapshotOmissionTotal > 0;
  const results = snapshotInvalidated ? [] : cachedResults;

  useLayoutEffect(() => {
    if (routeOrigin?.kind === "search" && routeOrigin.snapshot) {
      restoredSnapshot.current = routeOrigin.snapshot;
    }
  }, [routeOrigin]);

  useEffect(() => {
    if (selected.length === 0) setSelectionDetailsOpen(false);
  }, [selected.length]);

  useLayoutEffect(() => {
    const snapshot = restoredSnapshot.current;
    if (!snapshot || search.isPending || search.isFetching || !overviewRef.current) return;
    const scrollParent = overviewRef.current.closest<HTMLElement>(".brain-stage");
    if (scrollParent) scrollParent.scrollTop = snapshot.scrollTop;
    if (snapshot.focusedResult) {
      const result = [...overviewRef.current.querySelectorAll<HTMLElement>("[data-result-id]")]
        .find((candidate) => candidate.dataset.resultId === snapshot.focusedResult);
      const target = result?.querySelector<HTMLElement>("a, button");
      if (target) target.focus();
      else overviewRef.current.querySelector<HTMLInputElement>('input[aria-label="Find in your Brain"]')?.focus();
    }
    restoredSnapshot.current = undefined;
  }, [results, routeOrigin, search.isFetching, search.isPending]);

  useLayoutEffect(() => {
    if (!snapshotInvalidated) return;
    queryClient.setQueryData<InfiniteData<BrainSearchPage>>(searchQueryKey, (current) => {
      if (!current || current.pages.every((page) => page.results.length === 0)) return current;
      return {
        ...current,
        pages: current.pages.map((page) => ({ ...page, results: [] })),
      };
    });
    setSelected([]);
    setSelectionError(undefined);
  }, [queryClient, searchQueryKey, snapshotInvalidated]);

  const updateSafeParam = (key: "mode" | "scope", value: string) => {
    const next = new URLSearchParams();
    const nextMode = key === "mode" ? value : mode;
    const nextScope = key === "scope" ? value : selectedScope;
    if (nextMode !== "find") next.set("mode", nextMode);
    else if (params.get("view") === "search" || key === "scope") next.set("view", "search");
    if (nextScope !== "everything") next.set("scope", nextScope);
    if (key === "scope") {
      const nextChoice = scopeChoices.find((choice) => choice.id === nextScope) ?? scopeChoices[0];
      const scopedFilters = filtersForScope(filters, nextChoice);
      setFilters(scopedFilters);
      setFilterDraftState(filterDraft(scopedFilters));
      setFilterError(undefined);
      setSelected([]);
      setSelectionError(undefined);
    }
    setParams(next, { replace: true });
  };

  const togglePageState = (value: BrainPageState, checked: boolean) => {
    setFilterDraftState((current) => ({
      ...current,
      pageStates: checked
        ? [...new Set([...current.pageStates, value])]
        : current.pageStates.filter((state) => state !== value),
    }));
    setFilterError(undefined);
  };

  const toggleWorkState = (value: BrainWorkState, checked: boolean) => {
    setFilterDraftState((current) => ({
      ...current,
      workStates: checked
        ? workStateChoices.map((choice) => choice.value).filter((state) => current.workStates.includes(state) || state === value)
        : current.workStates.filter((state) => state !== value),
    }));
    setFilterError(undefined);
  };

  const openFilters = (open: boolean) => {
    if (open) {
      setFilterDraftState(filterDraft(filters));
      setFilterError(undefined);
    }
    setFilterOpen(open);
  };

  const clearFilters = () => {
    setFilters({});
    setFilterDraftState(defaultFilterDraft());
    setFilterError(undefined);
    setFilterOpen(false);
    setSelected([]);
    setSelectionError(undefined);
  };

  const applyFilters = () => {
    if (allowsPageFilters && filterDraftState.pageStates.length === 0) {
      setFilterError("Choose at least one Page status.");
      return;
    }
    const dueAfterDate = filterDraftState.workDueAfter ? new Date(filterDraftState.workDueAfter) : undefined;
    const dueBeforeDate = filterDraftState.workDueBefore ? new Date(filterDraftState.workDueBefore) : undefined;
    if (
      (dueAfterDate && !Number.isFinite(dueAfterDate.getTime())) ||
      (dueBeforeDate && !Number.isFinite(dueBeforeDate.getTime()))
    ) {
      setFilterError("Enter a valid local due date and time.");
      return;
    }
    if (dueAfterDate && dueBeforeDate && dueAfterDate.getTime() >= dueBeforeDate.getTime()) {
      setFilterError("Due before must be later than due from.");
      return;
    }
    const pageStates = ["active", "archived"].filter((state) =>
      filterDraftState.pageStates.includes(state as BrainPageState)) as BrainPageState[];
    const nextFilters: BrainSearchFilters = {
      ...(allowsPageFilters && !(pageStates.length === 1 && pageStates[0] === "active") ? { pageStates } : {}),
      ...(allowsWorkFilters && filterDraftState.workStates.length ? { workStates: filterDraftState.workStates } : {}),
      ...(allowsWorkFilters && dueAfterDate ? { workDueAfter: dueAfterDate.toISOString() } : {}),
      ...(allowsWorkFilters && dueBeforeDate ? { workDueBefore: dueBeforeDate.toISOString() } : {}),
    };
    setFilters(nextFilters);
    setFilterError(undefined);
    setFilterOpen(false);
    setSelected([]);
    setSelectionError(undefined);
  };

  const toggleSelection = (selection: ConversationContextSelection) => {
    if (snapshotInvalidated) return;
    const key = conversationContextKey(selection);
    setSelectionError(undefined);
    setSelected((current) => current.some((item) => conversationContextKey(item) === key)
      ? current.filter((item) => conversationContextKey(item) !== key)
      : [...current, selection]);
  };

  const ask = () => {
    const currentSelection = snapshotInvalidated ? [] : selected;
    const usable = currentSelection.filter((item) => conversationContextReady(item));
    if (usable.length !== currentSelection.length) {
      setSelectionError("One or more selected items expired. Remove them and search again before asking Kora.");
      return;
    }
    onAskKora(usable.length ? usable : undefined, query.trim() || undefined);
  };

  const refreshInvalidatedSearch = () => {
    setSelected([]);
    setSelectionError(undefined);
    setSearchRevision((current) => current + 1);
  };

  const searchOrigin = (focusedResult?: string): BrainOrigin => {
    const scrollParent = overviewRef.current?.closest<HTMLElement>(".brain-stage");
    const focused = focusedResult ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>("[data-result-id]")?.dataset.resultId
      : undefined);
    return {
      kind: "search",
      returnTo: BRAIN_SEARCH_RETURN_PATH,
      snapshot: brainSearchSnapshotFor(query, scope.id, filters, scrollParent?.scrollTop ?? 0, focused),
    };
  };
  const updateQuery = (value: string) => {
    setQuery(value);
    setSelectionError(undefined);
    if (mode === "find" && value.trim() && params.get("view") !== "search") {
      const next = new URLSearchParams(params);
      next.set("view", "search");
      next.delete("q");
      setParams(next, { replace: true });
    }
  };

  useViewBar(() => ({ title: searchView ? "Search" : "Home" }), [searchView]);

  const searching = searchView && deferredQuery.length > 0;
  const noResults = !search.isFetching && results.length === 0;
  const completeNoMatch = noResults && lastPage?.state === "ok" && lastPage.complete;
  const partialNoMatch = noResults && lastPage && (lastPage.state === "partial" || !lastPage.complete);

  return <BrainLayout>
    <div ref={overviewRef} className="brain-overview" data-mode={mode} data-view={searchView ? "search" : "home"}>
      <section className="brain-command" aria-label="Find or ask your Brain">
        <div className="brain-command__top">
          <SegmentedControl value={mode} onValueChange={(value) => updateSafeParam("mode", value)} layoutId="brain-mode" label="Brain mode" options={[{ value: "find", label: <><Search size={14} />Find</> }, { value: "ask", label: <><MessageCircleMore size={14} />Ask Kora</> }]} />
          <span className="brain-command__hint">{mode === "find" ? "Search your Brain on this device" : "Ask in your current Kora conversation"}</span>
          <NewBrainMenu />
        </div>
        <div className="brain-command__input">
          <SearchField value={query} onValueChange={updateQuery} label={mode === "find" ? "Find in your Brain" : "Question for Kora"} placeholder={mode === "find" ? "Find a person, memory, page, source, project…" : "What should Kora help you understand?"} />
          {search.isFetching && <KoraPresenceMark state="gathering" label="Searching Brain" />}
          {mode === "ask" && <Button tone="primary" disabled={!query.trim()} onClick={ask}><MessageCircleMore size={15} />Ask Kora</Button>}
        </div>
        {searching && <div className="brain-search-controls">
          <div className="brain-scopes" role="group" aria-label="Search scope">{scopeChoices.map((choice) => <Button key={choice.id} tone="ghost" aria-pressed={choice.id === scope.id} onClick={() => updateSafeParam("scope", choice.id)}>{choice.label}</Button>)}</div>
          <Popover
            open={filterOpen}
            onOpenChange={openFilters}
            align="end"
            sideOffset={8}
            className="brain-filter-popover"
            trigger={<Button
              tone="ghost"
              className="brain-filter-trigger"
              disabled={!filtersAvailable}
              aria-label={filtersAvailable ? `Search filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}` : `Filters do not apply to ${scope.label}`}
            ><ListFilter size={14} aria-hidden="true" /><span>Filters</span>{activeFilterCount > 0 && <Badge tone="brain">{activeFilterCount}</Badge>}</Button>}
          >
            <div className="brain-filter-popover__heading"><strong>Narrow by state &amp; date</strong><span>Applied together when you choose Apply.</span></div>
            {allowsPageFilters && <fieldset className="brain-filter-group">
              <legend>Page status</legend>
              <div className="brain-filter-grid">
                <CheckboxChoice checked={filterDraftState.pageStates.includes("active")} onCheckedChange={(checked) => togglePageState("active", checked)} title="Active" hint="Current pages" />
                <CheckboxChoice checked={filterDraftState.pageStates.includes("archived")} onCheckedChange={(checked) => togglePageState("archived", checked)} title="Archived" hint="Past pages" />
              </div>
            </fieldset>}
            {allowsWorkFilters && <fieldset className="brain-filter-group">
              <legend>Work status</legend>
              <div className="brain-filter-grid brain-filter-grid--work">{workStateChoices.map((choice) => <CheckboxChoice
                key={choice.value}
                checked={filterDraftState.workStates.includes(choice.value)}
                onCheckedChange={(checked) => toggleWorkState(choice.value, checked)}
                title={choice.label}
              />)}</div>
            </fieldset>}
            {allowsWorkFilters && <fieldset className="brain-filter-group">
              <legend>Due window</legend>
              <div className="brain-filter-dates">
                <Field label="Due from" htmlFor="brain-filter-due-after" hint="Inclusive"><Input id="brain-filter-due-after" type="datetime-local" value={filterDraftState.workDueAfter} onChange={(event) => { setFilterDraftState((current) => ({ ...current, workDueAfter: event.target.value })); setFilterError(undefined); }} /></Field>
                <Field label="Due before" htmlFor="brain-filter-due-before" hint="Exclusive"><Input id="brain-filter-due-before" type="datetime-local" value={filterDraftState.workDueBefore} onChange={(event) => { setFilterDraftState((current) => ({ ...current, workDueBefore: event.target.value })); setFilterError(undefined); }} /></Field>
              </div>
            </fieldset>}
            {filterError && <div className="brain-filter-error" role="alert">{filterError}</div>}
            <div className="brain-filter-actions"><Button tone="ghost" onClick={clearFilters}>Clear</Button><Button tone="primary" onClick={applyFilters}>Apply filters</Button></div>
          </Popover>
        </div>}
      </section>

      {!snapshotInvalidated && <AnimatePresence initial={false}>{selected.length > 0 && <motion.section className="brain-context-tray" aria-label="Selected Kora context" initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -3 }} transition={{ duration: DUR.base, ease: EASE.out }}>
        <div className="brain-context-tray__summary"><strong>{selected.length} selected for Kora</strong><span>Exact records are rechecked when you send.</span></div>
        <div className="brain-context-tray__actions">
          <Button tone="primary" aria-label="Ask with selected context" onClick={ask}><MessageCircleMore size={15} />Use Kora</Button>
          <Button tone="ghost" aria-expanded={selectionDetailsOpen} aria-controls="brain-selected-records" onClick={() => setSelectionDetailsOpen((open) => !open)}>{selectionDetailsOpen ? "Hide selected" : "Show selected"}</Button>
        </div>
        {selectionDetailsOpen && <div className="brain-context-tray__items" id="brain-selected-records" aria-label="Selected records">{selected.map((item) => <Button tone="ghost" key={conversationContextKey(item)} aria-label={`Remove ${contextTitle(item)} from Kora context`} onClick={() => toggleSelection(item)}><span>{contextTitle(item)}</span><X size={12} aria-hidden="true" /></Button>)}</div>}
      </motion.section>}</AnimatePresence>}
      {selectionError && <div className="brain-selection-error" role="alert">{selectionError}</div>}

      {!searchView && !searching ? <HomeDashboard client={client} /> : <section className="brain-results" aria-label="Brain search results">
        {!searching ? <StateView state="empty" title="Search your Brain" body="Enter a name, phrase, or question to find a local record." />
          : search.isPending ? <StateView state="loading" title="Searching your Brain" />
          : search.isError ? <StateView state="error" title="Brain search is unavailable" body={search.error.message} action={<Button onClick={() => void search.refetch()}>Try again</Button>} />
            : lastPage?.state === "unavailable" ? <StateView state="unavailable" title="Brain search is unavailable" body="No requested authority could complete this search." action={<Button onClick={() => void search.refetch()}>Try again</Button>} />
              : snapshotInvalidated ? <StateView state="partial" title="Cached search cleared for freshness" body={`${snapshotOmissionSummary}. Kora cleared every cached preview and selected context from this search because the continuation cannot safely identify only the affected rows. Run a fresh search to see current results.`} action={<Button onClick={refreshInvalidatedSearch}>Run fresh search</Button>} />
                : completeNoMatch ? <StateView state="empty" title={`No matches for “${query.trim()}”`} body="Every requested collection completed. Try fewer words or a different scope." />
                : partialNoMatch ? <StateView state="partial" title="No available matches yet" body={boundedTextScopes.length > 0
                  ? `${boundedTextScopes.join(", ")} checks a safe, bounded text subset. Title search remains available, but Kora cannot call this a complete content no-match.`
                  : "At least one requested collection is unavailable or incomplete, so Kora cannot call this a complete no-match."} />
                  : <>
                    <div className="brain-results__status" role="status"><span>{lastPage?.state === "partial" ? "Partial results" : lastPage?.complete ? `${results.length} results` : `${results.length}+ results`}</span><small>{lastPage?.state === "partial" ? "Available results are shown; incomplete coverage stays named below." : `Ranked by ${scope.label.toLocaleLowerCase()} relevance.`}</small></div>
                    <div className="brain-result-list">{results.map((result) => {
                       const key = conversationContextKey(result.context);
                       return <ResultRow key={resultIdentity(result)} result={result} origin={searchOrigin} selected={selected.some((item) => conversationContextKey(item) === key)} onToggle={() => toggleSelection(result.context)} />;
                     })}</div>
                     {search.hasNextPage && <Button className="brain-results__more" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>Load more results</Button>}
                     {(pages.some((page) => page.unavailableScopes.length) || semanticIndexingScopes.length > 0 || semanticUnavailableScopes.length > 0 || semanticCappedScopes.length > 0 || boundedTextScopes.length > 0 || generalCoverageGaps.length > 0) && <details className="brain-diagnostics">
                       <summary>Search coverage details</summary>
                       <div className="brain-diagnostics__body">
                         {pages.some((page) => page.unavailableScopes.length) && <div className="brain-coverage" role="status"><strong>Unavailable in this search</strong><span>{[...new Set(pages.flatMap((page) => page.unavailableScopes.map((item) => scopeLabel[item.scope])))].join(", ")}</span></div>}
                         {semanticIndexingScopes.length > 0 && <div className="brain-coverage" role="status"><strong>Meaning-based search is still preparing</strong><span>Keyword search remains available for {semanticIndexingScopes.join(", ")}. Try again shortly for complete paraphrase coverage.</span></div>}
                         {semanticUnavailableScopes.length > 0 && <div className="brain-coverage" role="status"><strong>Meaning-based search unavailable</strong><span>Keyword search remains available for {semanticUnavailableScopes.join(", ")}. Kora is not claiming complete paraphrase coverage.</span></div>}
                         {semanticCappedScopes.length > 0 && <div className="brain-coverage" role="status"><strong>Meaning-based search capped</strong><span>Kora reached the bounded semantic search limit for {semanticCappedScopes.join(", ")}. Narrow the search for more complete coverage.</span></div>}
                         {boundedTextScopes.length > 0 && <div className="brain-coverage" role="status"><strong>Bounded content search</strong><span>{boundedTextScopes.join(", ")} checks a safe, bounded text subset. Title search remains available.</span></div>}
                         {generalCoverageGaps.length > 0 && <div className="brain-coverage" role="status"><strong>Search coverage incomplete</strong><span>{generalCoverageGaps.join(" · ")}</span></div>}
                       </div>
                     </details>}
                   </>}
      </section>}
    </div>
  </BrainLayout>;
}
