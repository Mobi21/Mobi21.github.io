import "@fontsource-variable/mona-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { BrainOverview, type BrainOverviewClient } from "../features/brain/BrainOverview";
import type {
  BrainPage,
  BrainSearchPage,
  ConversationContextSelection,
  KnowledgeSource,
  MemoryPipelineHealth,
  MemoryRecord,
  OutputSummary,
  PersonRecord,
  PersonalBrainSearchResult,
} from "../lib/runtime";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/shell.css";
import "../styles/app.css";
import "../features/brain/brain.css";
import "./brain-overview-specimen.css";

type Fixture = "populated" | "empty" | "partial" | "unavailable" | "loading" | "learning-off" | "review-required" | "restricted-home" | "recent-over-8" | "search" | "search-idle" | "search-typing" | "search-loading" | "search-no-match" | "search-filtered-no-match" | "search-unavailable" | "search-partial" | "search-restricted" | "search-large" | "search-multi-select";

const fixtureLabels: Record<Fixture, string> = {
  populated: "Populated home",
  empty: "True empty",
  partial: "Partial collections",
  unavailable: "All unavailable",
  loading: "Loading",
  "learning-off": "Learning off",
  "review-required": "Extraction review",
  "restricted-home": "Restricted Home omission",
  "recent-over-8": "Recent records over Home bound",
  search: "Search results",
  "search-idle": "Search idle",
  "search-typing": "Search typing",
  "search-loading": "Search loading",
  "search-no-match": "Search no match",
  "search-filtered-no-match": "Filtered search no match",
  "search-unavailable": "Search unavailable",
  "search-partial": "Partial search",
  "search-restricted": "Restricted omitted",
  "search-large": "Large search",
  "search-multi-select": "Search multi-select",
};

const now = "2026-08-29T18:20:00.000Z";
const earlier = "2026-08-27T14:15:00.000Z";

const recentTimestamp = (index: number) => new Date(Date.parse(now) - index * 60_000).toISOString();
const memory = (index = 1): MemoryRecord => ({ id: `memory-${index}`, content: index === 1 ? "Prefers a short planning note before Monday meetings." : `Planning preference ${index}`, status: "active", provenance: "user_explicit", confidence: 1, createdAt: earlier, updatedAt: recentTimestamp(index) });
const page = (index = 1): BrainPage => ({ id: `page-${index}`, title: index === 1 ? "September planning" : `Reference note ${index}`, kind: "note", bodyMarkdown: "A concise, owner-written planning record.", provenance: "user_explicit", state: "active", version: 1, createdAt: earlier, updatedAt: recentTimestamp(index + 10) });
const person = (index = 1): PersonRecord => ({ id: `person-${index}`, displayName: index === 1 ? "Maya Chen" : `Person ${index}`, relationshipLabel: index === 1 ? "Friend and climbing partner" : "Personal context", providerRefs: [], provenance: "user_explicit", state: "active", version: 1, createdAt: earlier, updatedAt: recentTimestamp(index + 20) });
const source = (index = 1): KnowledgeSource => ({ id: `source-${index}`, label: index === 1 ? "Home renovation notes" : `Local source ${index}`, sourceKind: "inline", format: "inline", mediaType: "text/markdown", extraction: { parser: "inline-markdown-v1", coverage: { status: "complete", indexed: ["inline Markdown text"], omitted: [] } }, retrievalRole: "default", temporalScope: "current", freshness: "verified", version: 1, contentHash: `hash-${index}`, state: "active", observedState: "current", createdAt: earlier, updatedAt: recentTimestamp(index + 30) });
const output = (index = 1): OutputSummary => ({ id: `output-${index}`, title: index === 1 ? "Iceland packing brief" : `Created brief ${index}`, mediaType: "application/pdf", byteSize: 18240 + index, sha256: `hash-${index}`, role: "output", createdAt: earlier, updatedAt: recentTimestamp(index + 40), previewState: "ready" });
const hiddenSentinelPage: BrainPage = { ...page(99), id: "hidden-sentinel-page", title: "HIDDEN SENTINEL — specialist care plan", bodyMarkdown: "HIDDEN SENTINEL PREVIEW — must never enter ordinary Home DOM." };

const health = (state: Fixture): MemoryPipelineHealth => ({
  automaticLearning: { enabled: state !== "learning-off", updatedAt: now },
  processing: { state: "idle", pending: 0, processing: 0, failed: 0, lastAttemptAt: earlier, lastSuccessAt: earlier },
  recent: [{ state: "completed", attempts: 1, acceptedCount: 1, updatedAt: earlier }],
  deletionReceipts: [],
  processingBoundary: { extraction: "remote_model", embedding: "local_runtime", canonicalStorage: "local_sqlite" },
  complete: true,
});

const emptySearch: BrainSearchPage = { state: "ok", results: [], complete: true, unavailableScopes: [], limitedScopes: [], coverage: [], snapshotOmissions: { changed: 0, gone: 0, unavailable: 0 } };

function searchResult(index: number): PersonalBrainSearchResult {
  const selection: ConversationContextSelection = { state: "ready", authorization: "allowed", selectionId: `selection-${index}`, evidenceHandle: `evidence-${index}`, display: { objectKind: index % 3 === 0 ? "person" : "page", title: index === 1 ? "September planning" : index === 2 ? "Maya Chen" : `Planning record ${index}` }, expiresAt: "2099-01-01T00:00:00.000Z" };
  return { scope: index % 3 === 0 ? "people" : "pages", destination: index % 3 === 0 ? { kind: "person", path: `/brain/people/person-${index}` } : { kind: "page", path: `/brain/pages/page-${index}` }, display: selection.display, preview: index === 1 ? "A concise plan for the next four weeks, including renovation and travel decisions." : `Relevant owner-authored context for planning result ${index}.`, provenance: "user_explicit", updatedAt: now, context: selection, matchChannels: index % 2 ? ["lexical", "semantic"] : ["semantic"], stableRank: index, matchReason: index % 2 ? "The wording and semantic index match." : "The semantic index matched." };
}

const settledPage = <T,>(items: T[]) => Promise.resolve({ items, complete: true });
const restrictedHomePage = () => {
  const providerRecords = [page(), hiddenSentinelPage];
  return Promise.resolve({ items: providerRecords.filter((item) => item.id !== hiddenSentinelPage.id), complete: true });
};
const never = () => new Promise<never>(() => undefined);

function makeClient(fixture: Fixture): BrainOverviewClient {
  if (fixture === "loading") return { personalBrainSearchPage: never, memoryPage: never, memoryPipelineHealth: never, pagesPage: never, peoplePage: never, knowledgeSourcesPage: never, outputsPage: never };
  const unavailable = () => Promise.reject(new Error("Synthetic Brain authority unavailable"));
  const partial = fixture === "partial";
  const searchPage = async (input: { cursor?: string }): Promise<BrainSearchPage> => {
    if (fixture === "search-typing" || fixture === "search-loading") return never();
    if (fixture === "search-unavailable") throw new Error("Synthetic Brain search authority is unavailable.");
    if (fixture === "search-partial") return { ...emptySearch, state: "partial", complete: false, results: [searchResult(1), searchResult(2)], unavailableScopes: [{ scope: "memory", reason: "unavailable" }], coverage: [{ scope: "memory", state: "unavailable", usableCount: 0, channels: [{ channel: "lexical", state: "unavailable", reason: "authority_unavailable" }] }] };
    if (fixture === "search-restricted") return { ...emptySearch, results: [searchResult(1)] };
    if (fixture === "search-large") {
      const restrictedSentinel: PersonalBrainSearchResult = {
        ...searchResult(1_006),
        display: { objectKind: "page", title: "RESTRICTED SENTINEL — must not render" },
        preview: "RESTRICTED SENTINEL PREVIEW",
      };
      const providerResults: PersonalBrainSearchResult[] = [
        ...Array.from({ length: 1_005 }, (_, index) => searchResult(index + 1)),
        restrictedSentinel,
      ];
      return { ...emptySearch, results: providerResults.filter((result) => !result.display.title.startsWith("RESTRICTED SENTINEL")) };
    }
    if (fixture === "search" || fixture === "search-multi-select") return { ...emptySearch, results: [searchResult(1), searchResult(2), searchResult(3)] };
    return emptySearch;
  };
  const recentSet = fixture === "recent-over-8";
  return {
    personalBrainSearchPage: searchPage as BrainOverviewClient["personalBrainSearchPage"],
    memoryPage: fixture === "unavailable" ? unavailable : () => settledPage(fixture === "empty" ? [] : recentSet ? [memory(1), memory(2), memory(3)] : [memory()]),
    memoryPipelineHealth: fixture === "unavailable" ? unavailable : () => Promise.resolve(health(fixture)),
    pagesPage: fixture === "unavailable" ? unavailable : fixture === "restricted-home" ? restrictedHomePage : () => settledPage(fixture === "empty" ? [] : recentSet ? [page(1), page(2), page(3)] : [page(), page(2)]),
    peoplePage: fixture === "unavailable" || partial ? unavailable : () => settledPage(fixture === "empty" ? [] : recentSet ? [person(1), person(2), person(3)] : [person()]),
    knowledgeSourcesPage: fixture === "unavailable" ? unavailable : () => settledPage(fixture === "empty" ? [] : recentSet ? [source(1), source(2)] : [source()]),
    outputsPage: fixture === "unavailable" ? unavailable : () => settledPage(fixture === "empty" ? [] : recentSet ? [output(1), output(2)] : [output()]),
  };
}

function routeForFixture(selected: Fixture) {
  const routes: Partial<Record<Fixture, string>> = {
    "search-idle": "/brain?view=search",
    "search-typing": "/brain?view=search&q=plann",
    "search-loading": "/brain?view=search&q=planning",
    "search-no-match": "/brain?view=search&q=moonbase",
    "search-filtered-no-match": "/brain?view=search&q=planning&scope=pages&pageState=archived",
    "search-unavailable": "/brain?view=search&q=planning",
    "search-multi-select": "/brain?view=search&q=planning",
  };
  return routes[selected] ?? (selected.startsWith("search") ? "/brain?view=search&q=planning" : "/brain");
}

function AcceptanceFixtureDriver({ fixture }: { fixture: Fixture }) {
  useEffect(() => {
    if (fixture !== "search-multi-select") return;
    const timer = window.setInterval(() => {
      const actions = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Use "][aria-label$=" with Kora"]')];
      if (actions.length < 2) return;
      window.clearInterval(timer);
      actions[0]?.click();
      actions[1]?.click();
    }, 30);
    return () => window.clearInterval(timer);
  }, [fixture]);
  return null;
}

function BrainOverviewSpecimen() {
  const initial = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(initial && fixtureLabels[initial] ? initial : "populated");
  const client = useMemo(() => makeClient(fixture), [fixture]);
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }), [fixture]);
  const choose = (value: string) => { const next = value as Fixture; setFixture(next); history.replaceState(null, "", `?fixture=${next}`); };
  return <main className="brain-overview-specimen" id="main-content">
    <header className="brain-overview-specimen__controls"><div><strong>Brain overview qualification</strong><span>Synthetic local records · no provider, account, Agent, or native access</span></div><KoraSelect label="Brain fixture" value={fixture} options={(Object.keys(fixtureLabels) as Fixture[]).map((value) => ({ value, label: fixtureLabels[value] }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={[routeForFixture(fixture)]}>
      <QueryClientProvider client={queryClient}><ViewBarProvider><ViewBar /><BrainOverview client={client} onAskKora={() => undefined} /><AcceptanceFixtureDriver fixture={fixture} /></ViewBarProvider></QueryClientProvider>
    </MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><BrainOverviewSpecimen /></StrictMode>);
