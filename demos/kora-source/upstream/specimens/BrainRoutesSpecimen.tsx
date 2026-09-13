import "@fontsource-variable/mona-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { DirtyDraftGuardProvider } from "../app/DirtyDraftGuard";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect, ToastProvider, TooltipProvider } from "../components/primitives";
import { BrainLayout } from "../features/brain/BrainLayout";
import { MemoryWorkspace, type BrainMemoryRecord } from "../features/brain/MemoryWorkspace";
import { OutputsWorkspace, type OutputsClient } from "../features/brain/OutputsWorkspace";
import { PagesWorkspace, type PagesClient } from "../features/brain/PagesWorkspace";
import { PeopleWorkspace, type PeopleClient } from "../features/brain/PeopleWorkspace";
import { SourcesWorkspace, type SourcesClient } from "../features/brain/SourcesWorkspace";
import {
  runtime,
  RuntimeRequestError,
  type BrainPage,
  type KnowledgeSource,
  type MemoryPipelineHealth,
  type OutputSummary,
  type PersonRecord,
} from "../lib/runtime";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/shell.css";
import "../styles/app.css";
import "./brain-routes-specimen.css";
import {
  brainRouteAuthorityNote,
  brainRouteFixturesBySurface,
  brainRouteModesBySurface,
  brainRouteSurfaces,
  isBrainRouteFixture,
  isBrainRouteMode,
  isBrainRouteSurface,
  type BrainRouteFixture,
  type BrainRouteMode,
  type BrainRouteSurface,
} from "./brain-route-specimen-contract";

const search = new URLSearchParams(window.location.search);
const requestedSurface = search.get("surface");
const requestedFixture = search.get("fixture");
const requestedMode = search.get("mode");
const surface: BrainRouteSurface = isBrainRouteSurface(requestedSurface) ? requestedSurface : "memory";
const defaultFixture: BrainRouteFixture = "populated";
const fixture: BrainRouteFixture = isBrainRouteFixture(surface, requestedFixture) ? requestedFixture : defaultFixture;
const mode: BrainRouteMode = isBrainRouteMode(surface, requestedMode) ? requestedMode : "list";
const now = "2026-08-29T18:20:00.000Z";
const earlier = "2026-08-25T14:15:00.000Z";
const never = () => new Promise<never>(() => undefined);
const unavailable = () => Promise.reject(new RuntimeRequestError("Synthetic local Brain authority is unavailable.", { code: "runtime_unavailable", status: 503 }));
const detailUnavailable = () => Promise.reject(new RuntimeRequestError("Synthetic record detail is temporarily unavailable.", { code: "runtime_unavailable", status: 503 }));
const restrictedRequired = () => Promise.reject(new RuntimeRequestError("Restricted record approval is required.", { code: "restricted_record_required", status: 403 }));
const longCopy = "Keeps a carefully qualified planning note for the first Monday of each month, including the decision context, what remains uncertain, and which original record should be checked before Kora uses it again.";
const providerFixture = surface === "sources" && fixture.startsWith("provider-");

const memory: BrainMemoryRecord = {
  id: "memory-morning",
  content: fixture === "restricted" ? "RESTRICTED SENTINEL MEMORY CONTENT" : fixture === "long-copy" ? longCopy : "Prefers a short planning note before Monday meetings.",
  status: fixture === "archived" ? "expired" : "active",
  provenance: "user_explicit",
  confidence: 1,
  createdAt: earlier,
  updatedAt: now,
};
const page: BrainPage = {
  id: "page-september",
  title: fixture === "restricted" ? "RESTRICTED SENTINEL PAGE TITLE" : fixture === "long-copy" ? "September planning, renovation decisions, travel constraints, and the open questions still waiting for confirmation" : "September planning",
  kind: "note",
  bodyMarkdown: fixture === "long-copy" ? `## Decisions and qualifications\n\n${longCopy}\n\nThe final weekend remains deliberately unscheduled until the provider calendar is current.` : "## Decisions\n\nKeep the coast trip restorative and leave one unscheduled afternoon.",
  provenance: "user_explicit",
  state: fixture === "archived" ? "archived" : "active",
  version: 1,
  createdAt: earlier,
  updatedAt: now,
};
const person: PersonRecord = {
  id: "person-maya",
  displayName: fixture === "restricted" ? "RESTRICTED SENTINEL PERSON NAME" : fixture === "long-copy" ? "Maya Chen-Williams with a deliberately long preferred display name" : "Maya Chen",
  relationshipLabel: fixture === "long-copy" ? "Longtime friend, climbing partner, neighborhood organizer, and co-planner for the autumn accessibility fundraiser" : "Friend and climbing partner",
  contextMarkdown: fixture === "long-copy" ? longCopy : "Prefers early weekend plans and usually climbs at the east gym.",
  providerRefs: [],
  provenance: "user_explicit",
  state: "active",
  version: 1,
  createdAt: earlier,
  updatedAt: now,
};
const syntheticPerson = (index: number): PersonRecord => ({
  ...person,
  id: `person-scale-${String(index + 1).padStart(5, "0")}`,
  displayName: `${["Avery", "Camille", "Devon", "Imani", "Jun", "Leila", "Mateo", "Nora"][index % 8]} ${["Bennett", "Chen", "Diaz", "Foster", "Gupta", "Ibrahim", "Kwon", "Laurent"][Math.floor(index / 8) % 8]} ${index + 1}`,
  relationshipLabel: ["Neighbor", "Former teammate", "Family friend", "Research collaborator"][index % 4],
  contextMarkdown: `Synthetic relationship context ${index + 1}; generated locally for deterministic scale review.`,
  version: 1 + (index % 4),
  updatedAt: new Date(Date.parse(now) - index * 60_000).toISOString(),
});
const scaledPeopleCount = fixture === "large" ? 10_000 : fixture === "count-1000" ? 1_000 : fixture === "count-100" ? 100 : fixture === "count-2" ? 2 : 0;
const scaledPeople = Array.from({ length: scaledPeopleCount }, (_, index) => syntheticPerson(index));
const scaledMemories: BrainMemoryRecord[] = fixture === "large" ? Array.from({ length: 240 }, (_, index) => ({
  ...memory,
  id: `memory-scale-${String(index + 1).padStart(4, "0")}`,
  content: `Deterministic memory ${index + 1}: ${["planning preference", "household context", "travel note", "reading reminder"][index % 4]}.`,
  updatedAt: new Date(Date.parse(now) - index * 90_000).toISOString(),
})) : [];
const scaledPages: BrainPage[] = fixture === "large" ? Array.from({ length: 160 }, (_, index) => ({
  ...page,
  id: `page-scale-${String(index + 1).padStart(4, "0")}`,
  title: `Reference page ${index + 1}: ${["September plan", "renovation", "travel", "reading"][index % 4]}`,
  version: 1 + (index % 3),
  updatedAt: new Date(Date.parse(now) - index * 120_000).toISOString(),
})) : [];
const source: KnowledgeSource = {
  id: "source-renovation",
  label: fixture === "restricted" ? "RESTRICTED SENTINEL SOURCE LABEL" : fixture === "long-copy" ? "Home renovation notes covering contractor decisions, material substitutions, access constraints, and unresolved inspection questions" : "Home renovation notes",
  sourceKind: fixture === "missing" ? "file" : "inline",
  format: fixture === "missing" ? "markdown" : "inline",
  mediaType: "text/markdown",
  extraction: {
    parser: "synthetic-v1",
    coverage: {
      status: fixture === "partial" || fixture === "local-partial" ? "partial" : "complete",
      indexed: ["synthetic text"],
      omitted: fixture === "partial" || fixture === "local-partial" ? ["synthetic unsupported content"] : [],
    },
  },
  retrievalRole: "task_relevant",
  temporalScope: "current",
  freshness: fixture === "missing" ? "persisted" : "verified",
  version: 1,
  contentHash: "synthetic-source-hash",
  state: fixture === "missing" || fixture === "local-error" ? "unavailable" : "active",
  observedState: fixture === "partial" || fixture === "stale" ? "changed" : fixture === "missing" || fixture === "local-error" ? "unavailable" : "current",
  createdAt: earlier,
  updatedAt: now,
};
const scaledSources: KnowledgeSource[] = fixture === "large" ? Array.from({ length: 150 }, (_, index) => ({
  ...source,
  id: `source-scale-${String(index + 1).padStart(4, "0")}`,
  label: `Registered ${index % 2 === 0 ? "file" : "inline"} source ${index + 1}`,
  sourceKind: index % 2 === 0 ? "file" : "inline",
  version: 1 + (index % 4),
  observedState: index % 9 === 0 ? "changed" : "current",
  updatedAt: new Date(Date.parse(now) - index * 150_000).toISOString(),
})) : [];
const output: OutputSummary = {
  id: "output-packing",
  title: fixture === "long-copy" ? "Iceland packing brief with accessibility constraints, uncertain weather coverage, and source-qualified equipment notes" : "Iceland packing brief",
  mediaType: "application/pdf",
  byteSize: 18241,
  sha256: "synthetic-output-hash",
  role: "output",
  createdAt: earlier,
  updatedAt: now,
  previewState: fixture === "native-only" ? "unsupported" : "not_requested",
};
const scaledOutputs: OutputSummary[] = fixture === "large" ? Array.from({ length: 180 }, (_, index) => ({
  ...output,
  id: `output-scale-${String(index + 1).padStart(4, "0")}`,
  title: `Created ${["brief", "worksheet", "image", "notes"][index % 4]} ${index + 1}`,
  mediaType: ["application/pdf", "text/markdown", "image/png", "text/plain"][index % 4],
  byteSize: 18_241 + index * 137,
  sha256: `synthetic-output-hash-${index + 1}`,
  createdAt: new Date(Date.parse(earlier) - index * 180_000).toISOString(),
  updatedAt: new Date(Date.parse(now) - index * 180_000).toISOString(),
})) : [];
const health: MemoryPipelineHealth = {
  automaticLearning: { enabled: true, updatedAt: now },
  processing: fixture === "learning-failure-history"
    ? { state: "attention", pending: 0, processing: 0, failed: 2, lastAttemptAt: now, lastSuccessAt: earlier }
    : { state: "idle", pending: 0, processing: 0, failed: 0, lastAttemptAt: earlier, lastSuccessAt: earlier },
  recent: fixture === "learning-failure-history"
    ? [
        { state: "retryable_failure", attempts: 2, acceptedCount: 0, failureCategory: "provider", updatedAt: now },
        { state: "completed", attempts: 1, acceptedCount: 1, updatedAt: earlier },
      ]
    : [{ state: "completed", attempts: 1, acceptedCount: 1, updatedAt: earlier }],
  deletionReceipts: [],
  processingBoundary: { extraction: "remote_model", embedding: "local_runtime", canonicalStorage: "local_sqlite" },
  complete: fixture !== "partial",
};

const paged = <T,>(items: T[], input: { cursor?: string; pageSize?: number } = {}) => {
  const offset = Number(input.cursor ?? 0);
  const pageSize = input.pageSize ?? 50;
  const pageItems = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageItems.length;
  const hasMore = nextOffset < items.length;
  return {
    items: pageItems,
    cursor: hasMore ? String(nextOffset) : undefined,
    complete: fixture === "partial" ? false : !hasMore,
  };
};
const ordinaryPage = <T,>(items: T[]) => paged(items);
const ordinaryItems = <T,>(item: T) => fixture === "empty" || fixture === "restricted" ? [] : [item];
let personWorkspaceAttempts = 0;
const restrictedConfirmation = {
  id: "synthetic-restricted-inventory-confirmation",
  toolName: "restricted_brain_inventory",
  argumentsHash: "synthetic-only",
  state: "pending" as const,
  owner: null,
  presentation: {
    action: "Open a temporary restricted Brain vault",
    target: "Synthetic restricted fixture records",
    consequence: "Allows one short-lived local inventory view. Ordinary Brain routes remain sealed.",
    risk: "private" as const,
  },
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: now,
  updatedAt: now,
};
const confirmClient = {
  toolConfirmations: async () => ({ confirmations: [restrictedConfirmation] }),
  approveToolConfirmation: async () => ({}),
  rejectToolConfirmation: async () => ({}),
};

const pagesClient: PagesClient = {
  ...confirmClient,
  pagesPage: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async (input = {}) => paged(fixture === "large" ? scaledPages : fixture === "missing" ? [] : ordinaryItems(page), input),
  brainRecord: fixture === "restricted" ? restrictedRequired : fixture === "detail-error" || fixture === "missing" ? detailUnavailable : async (_surface, id) => ({ surface: "page", record: scaledPages.find((record) => record.id === id) ?? page }),
  createPage: async () => ({ status: "settled", record: page, replayed: false }),
  updatePage: async () => {
    if (fixture === "save-conflict") return { status: "conflict", current: { ...page, title: "September planning revised elsewhere", version: 2 }, replayed: false };
    if (fixture === "save-error") throw new RuntimeRequestError("This synthetic Page could not be saved.", { code: "runtime_unavailable", status: 503 });
    return { status: "settled", record: { ...page, version: 2 }, replayed: false };
  },
  archivePage: async () => ({ status: "settled", record: { ...page, state: "archived", version: 2 }, replayed: false }),
  deleteBrainRecord: async () => ({ status: "settled", id: page.id, surface: "personal_brain_page", negativeRead: true, replayed: false }),
};
const peopleClient: PeopleClient = {
  ...confirmClient,
  peoplePage: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async ({ query, cursor, pageSize = 50 } = {}) => {
    if (fixture === "search-no-match") return ordinaryPage([]);
    if (fixture === "search-match") return ordinaryPage(query ? [person] : [person]);
    if (fixture !== "large" && fixture !== "count-1000" && fixture !== "count-100" && fixture !== "count-2") return ordinaryPage(fixture === "missing" ? [] : ordinaryItems(person));
    const offset = Number(cursor ?? 0);
    const items = scaledPeople.slice(offset, offset + pageSize);
    const nextOffset = offset + items.length;
    return { items, cursor: nextOffset < scaledPeople.length ? String(nextOffset) : undefined, complete: nextOffset >= scaledPeople.length };
  },
  personWorkspace: async (personId) => {
    personWorkspaceAttempts += 1;
    if (fixture === "restricted") return restrictedRequired();
    if (fixture === "missing") {
      throw new RuntimeRequestError("Synthetic person is no longer available.", { code: "not_found", status: 404 });
    }
    if (fixture === "detail-error" && personWorkspaceAttempts === 1) {
      throw new RuntimeRequestError("Synthetic person detail read failed.", { code: "runtime_unavailable", status: 503 });
    }
    return {
      person: scaledPeople.find(record => record.id === personId) ?? person,
      work: fixture === "linked-work-unavailable"
        ? { items: [], complete: false }
        : { items: [{ recordType: "project", id: "goal-portfolio", title: "Publish the 2026 portfolio refresh", state: "active", route: "/work/goals/goal-portfolio" }], complete: true },
    };
  },
  createPerson: async () => ({ status: "settled", record: person, replayed: false }),
  updatePerson: async () => {
    if (fixture === "edit-validation") return { status: "validation_failure", message: "Complete the synthetic relationship label before saving.", replayed: false };
    if (fixture === "edit-error") throw new RuntimeRequestError("This synthetic Person could not be saved.", { code: "runtime_unavailable", status: 503 });
    return { status: "settled", record: { ...person, version: 2 }, replayed: false };
  },
  deleteBrainRecord: async () => {
    if (fixture === "delete-restricted") return { status: "waiting_confirmation", confirmations: [{ confirmationId: restrictedConfirmation.id, expiresAt: restrictedConfirmation.expiresAt, purpose: "exact_deletion" }], consequence: "Delete exactly this synthetic Person record.", replayed: false };
    if (fixture === "delete-expired") return { status: "expired", message: "This deletion approval expired. The Person was not deleted.", replayed: false };
    if (fixture === "delete-error") return { status: "uncertain", requestKey: "synthetic-delete-error", message: "Kora could not confirm this deletion. The Person remains visible.", retryable: true };
    return { status: "settled", id: person.id, surface: "person", negativeRead: true, replayed: false };
  },
  personalBrainSearchPage: async () => ({ state: "ok", results: [], complete: true, unavailableScopes: [], limitedScopes: [], coverage: [], snapshotOmissions: { changed: 0, gone: 0, unavailable: 0 } }),
};
const sourcesClient: SourcesClient = {
  ...confirmClient,
  knowledgeSourcesPage: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async (input = {}) => paged(fixture === "large" ? scaledSources : providerFixture ? [] : ordinaryItems(source), input),
  knowledgeSourceWorkspace: fixture === "restricted" ? restrictedRequired : fixture === "detail-error" ? detailUnavailable : async (id) => ({ source: scaledSources.find((record) => record.id === id) ?? source }),
  knowledgeSourceSpans: fixture === "missing" ? detailUnavailable : async () => ({ items: [{ sourceId: source.id, label: source.label, version: 1, start: 0, end: 72, text: "Synthetic renovation notes with a contractor shortlist and material decisions.", retrievalRole: source.retrievalRole, temporalScope: source.temporalScope, updatedAt: now }], complete: fixture !== "local-partial" }),
  registerKnowledgeSource: fixture === "checking"
    ? never
    : async () => fixture === "index-failure-retryable"
      ? ({ status: "ingestion_failure", category: "unavailable", replayed: false } as const)
      : fixture === "index-failure-terminal"
        ? ({ status: "ingestion_failure", category: "unsupported_format", replayed: false } as const)
        : ({ status: "settled", record: source, externalFilePreserved: true, replayed: false } as const),
  updateKnowledgeSource: async () => ({ status: "settled", record: { ...source, version: 2 }, externalFilePreserved: true, replayed: false }),
  reconcileKnowledgeSource: async () => ({ status: "settled", record: { ...source, observedState: "current", version: 2 }, externalFilePreserved: true, replayed: false }),
  unregisterKnowledgeSource: async () => ({ status: "settled", id: source.id, surface: "knowledge_source", negativeRead: true, replayed: false, externalFilePreserved: true }),
};
const outputsClient: OutputsClient = {
  outputsPage: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async (input = {}) => paged(fixture === "large" ? scaledOutputs : fixture === "empty" ? [] : [output], input),
  outputWorkspace: fixture === "detail-error" ? detailUnavailable : async (id) => ({ output: scaledOutputs.find((record) => record.id === id) ?? output, previews: [], origins: [{ type: "schedule_run", id: "run-weekly", label: "Sunday planning", route: "/settings/schedules/sunday", availability: "available" }] }),
  outputContent: fixture === "missing" ? detailUnavailable : async (id) => { const selected = scaledOutputs.find((record) => record.id === id) ?? output; return { blob: new Blob(["synthetic"]), mediaType: selected.mediaType, title: selected.title ?? "Synthetic output", byteSize: 9, sha256: "synthetic" }; },
  renameOutput: async () => ({ status: "settled", record: output, replayed: false }),
  renderOutputPreview: async () => fixture === "preview-error"
    ? ({ status: "failed", previews: [], message: "The synthetic preview renderer could not complete.", replayed: false })
    : ({ status: "unsupported", previews: [], message: "Preview is unavailable in this browser fixture.", replayed: false }),
  deleteOutput: async () => ({ status: "settled", id: output.id, surface: "artifact", negativeRead: true, replayed: false }),
  attachImageOutput: async () => ({ artifact: { id: output.id, mediaType: output.mediaType, title: output.title, byteSize: output.byteSize }, replayed: false }),
  openArtifact: async () => {
    if (fixture === "open-error") throw new RuntimeRequestError("Synthetic native open failed.", { code: "runtime_unavailable", status: 503 });
    return { dispatched: true };
  },
};
Object.assign(runtime as unknown as Record<string, unknown>, {
  memoryPage: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async (input: { cursor?: string; limit?: number } = {}) => {
    const pageResult = paged(fixture === "large" ? scaledMemories : fixture === "missing" ? [] : ordinaryItems(memory), { cursor: input.cursor, pageSize: input.limit });
    return { items: pageResult.items, nextCursor: pageResult.cursor, complete: pageResult.complete, automaticMemoryEnabled: true };
  },
  brainRecord: fixture === "restricted" ? restrictedRequired : fixture === "missing" ? detailUnavailable : async (_surface: string, id: string) => ({ record: scaledMemories.find((record) => record.id === id) ?? memory }),
  createMemory: async () => ({ status: "settled", record: memory }),
  correctMemory: async () => fixture === "save-conflict"
    ? ({ status: "conflict", current: { ...memory, content: "A newer synthetic memory correction already exists.", updatedAt: "2026-08-29T18:21:00.000Z" }, message: "This memory changed elsewhere. Your draft is still here." } as const)
    : ({ status: "settled", record: memory } as const),
  deleteBrainRecord: async () => ({ status: "settled", id: memory.id, surface: "memory", negativeRead: true, replayed: false }),
  memoryPipelineHealth: fixture === "loading" ? never : fixture === "unavailable" ? unavailable : async () => health,
  updateMemorySettings: async () => ({ enabled: true, updatedAt: now, replayed: false }),
});

const routeFor = (selectedSurface: BrainRouteSurface, selectedMode: BrainRouteMode) => {
  const routes: Record<BrainRouteSurface, Partial<Record<BrainRouteMode, string>>> = {
    memory: { list: "/brain/memory", detail: `/brain/memory/${memory.id}` },
    pages: { list: "/brain/pages", detail: `/brain/pages/${page.id}`, new: "/brain/pages/new", edit: `/brain/pages/${page.id}/edit` },
    people: { list: "/brain/people", detail: `/brain/people/${person.id}`, new: "/brain/people/new", edit: `/brain/people/${person.id}/edit` },
    sources: { list: "/brain/sources", detail: `/brain/sources/${source.id}`, new: "/brain/sources/new", edit: `/brain/sources/${source.id}/edit` },
    created: { list: "/brain/outputs", detail: `/brain/outputs/${output.id}` },
  };
  const base = routes[selectedSurface][selectedMode] ?? routes[selectedSurface].list!;
  if (selectedSurface === "people" && fixture === "search-match") return `${base}?q=Maya`;
  if (selectedSurface === "people" && fixture === "search-no-match") return `${base}?q=Moonbase`;
  return base;
};
function choose(key: "surface" | "fixture" | "mode", value: string) {
  const next = new URLSearchParams(window.location.search);
  next.set(key, value);
  if (key === "surface") next.set("mode", "list");
  window.location.search = next.toString();
}

function setSyntheticValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function AcceptanceFixtureDriver() {
  useEffect(() => {
    if (fixture === "learning-failure-history") {
      const timer = window.setInterval(() => {
        const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Memory learning activity"]');
        if (!trigger) return;
        window.clearInterval(timer);
        trigger.click();
      }, 30);
      return () => window.clearInterval(timer);
    }
    if (fixture === "save-conflict") {
      let step = 0;
      const timer = window.setInterval(() => {
        if (step === 0) {
          const edit = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Edit");
          if (!edit) return;
          edit.click();
          step = 1;
          return;
        }
        if (step === 1) {
          const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Correct memory"]');
          if (!field) return;
          setSyntheticValue(field, "Keep this exact synthetic correction draft after conflict.");
          step = 2;
          return;
        }
        const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Save correction"));
        if (!save || save.disabled) return;
        window.clearInterval(timer);
        save.click();
      }, 35);
      return () => window.clearInterval(timer);
    }
    if (fixture === "edit-dirty") {
      const timer = window.setInterval(() => {
        const field = document.querySelector<HTMLInputElement>('input[aria-label="Relationship label"]');
        if (!field) return;
        window.clearInterval(timer);
        setSyntheticValue(field, "Friend, climbing partner, and synthetic dirty draft");
      }, 30);
      return () => window.clearInterval(timer);
    }
    if (fixture === "count-100" || fixture === "count-1000") {
      const timer = window.setInterval(() => {
        const more = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Show more");
        if (more && !more.disabled) more.click();
        const expectedCount = fixture === "count-1000" ? "1000" : "100";
        if (document.body.textContent?.includes(`${expectedCount} visible people loaded · current directory complete`)) window.clearInterval(timer);
      }, 45);
      return () => window.clearInterval(timer);
    }
    if (fixture === "checking" || fixture === "index-failure-retryable" || fixture === "index-failure-terminal") {
      let step = 0;
      const timer = window.setInterval(() => {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
        if (step === 0) {
          const chooseDocument = buttons.find((button) => button.textContent?.includes("Choose a document"));
          if (!chooseDocument) return;
          chooseDocument.click();
          step = 1;
          return;
        }
        if (step === 1) {
          const chooseFile = buttons.find((button) => button.textContent?.trim() === "Choose file");
          if (!chooseFile) return;
          chooseFile.click();
          step = 2;
          return;
        }
        const add = buttons.find((button) => button.textContent?.includes("Add source"));
        if (!add || add.disabled) return;
        window.clearInterval(timer);
        add.click();
      }, 40);
      return () => window.clearInterval(timer);
    }
  }, []);
  return null;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
const chooseSyntheticSourceFile = async () => ({
  path: "C:\\synthetic-fixtures\\brain-source.pdf",
  name: "brain-source.pdf",
});
const appRouter = createMemoryRouter([{
  path: "*",
  element: <DirtyDraftGuardProvider><TooltipProvider><ToastProvider><ViewBarProvider>
    <div className="pane">
      <div className="brain-routes-specimen__view-bar" role="region" aria-label="Brain workspace heading">
        <ViewBar />
      </div>
      <main className="pane__content" id="main-content" tabIndex={-1}>
        <BrainLayout><Routes>
          <Route path="/brain/memory" element={<MemoryWorkspace onAskKora={() => undefined} />} />
          <Route path="/brain/memory/:memoryId" element={<MemoryWorkspace onAskKora={() => undefined} />} />
          <Route path="/brain/pages" element={<PagesWorkspace client={pagesClient} onAskKora={() => undefined} />} />
          <Route path="/brain/pages/new" element={<PagesWorkspace client={pagesClient} onAskKora={() => undefined} />} />
          <Route path="/brain/pages/:pageId" element={<PagesWorkspace client={pagesClient} onAskKora={() => undefined} />} />
          <Route path="/brain/pages/:pageId/edit" element={<PagesWorkspace client={pagesClient} onAskKora={() => undefined} />} />
          <Route path="/brain/people" element={<PeopleWorkspace client={peopleClient} onAskKora={() => undefined} />} />
          <Route path="/brain/people/new" element={<PeopleWorkspace client={peopleClient} onAskKora={() => undefined} />} />
          <Route path="/brain/people/:personId" element={<PeopleWorkspace client={peopleClient} onAskKora={() => undefined} />} />
          <Route path="/brain/people/:personId/edit" element={<PeopleWorkspace client={peopleClient} onAskKora={() => undefined} />} />
          <Route path="/brain/sources" element={<SourcesWorkspace client={sourcesClient} chooseFile={chooseSyntheticSourceFile} onAskKora={() => undefined} />} />
          <Route path="/brain/sources/new" element={<SourcesWorkspace client={sourcesClient} chooseFile={chooseSyntheticSourceFile} onAskKora={() => undefined} />} />
          <Route path="/brain/sources/:sourceId" element={<SourcesWorkspace client={sourcesClient} chooseFile={chooseSyntheticSourceFile} onAskKora={() => undefined} />} />
          <Route path="/brain/sources/:sourceId/edit" element={<SourcesWorkspace client={sourcesClient} chooseFile={chooseSyntheticSourceFile} onAskKora={() => undefined} />} />
          <Route path="/brain/outputs" element={<OutputsWorkspace client={outputsClient} saveCopy={async () => ({ saved: false, cancelled: true })} />} />
          <Route path="/brain/outputs/:artifactId" element={<OutputsWorkspace client={outputsClient} saveCopy={async () => ({ saved: false, cancelled: true })} />} />
        </Routes></BrainLayout>
      </main>
    </div>
  </ViewBarProvider></ToastProvider></TooltipProvider></DirtyDraftGuardProvider>,
}], { initialEntries: [routeFor(surface, mode)] });

export function BrainRoutesSpecimen() {
  const authorityNote = brainRouteAuthorityNote(surface, fixture);
  return <div className="brain-routes-specimen">
    <header className="brain-routes-specimen__controls">
      <div><strong>Brain route qualification</strong><span>Synthetic local records and provider states · no real providers, accounts, native files, Agent, or product writes</span></div>
      <div className="brain-routes-specimen__pickers">
        <KoraSelect label="Brain surface" value={surface} options={brainRouteSurfaces.map((value) => ({ value, label: value === "created" ? "Created" : value[0].toUpperCase() + value.slice(1) }))} onValueChange={(value) => choose("surface", value)} />
        <KoraSelect label="Brain route" value={mode} options={brainRouteModesBySurface[surface].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onValueChange={(value) => choose("mode", value)} />
        <KoraSelect label="Brain fixture" value={fixture} options={brainRouteFixturesBySurface[surface].map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={(value) => choose("fixture", value)} />
      </div>
    </header>
    {authorityNote && <aside className="brain-routes-specimen__authority" role="note"><strong>Typed authority boundary</strong><span>{authorityNote}</span></aside>}
    <div className="brain-routes-specimen__app">
      <QueryClientProvider client={queryClient}><RouterProvider router={appRouter} /><AcceptanceFixtureDriver /></QueryClientProvider>
    </div>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><BrainRoutesSpecimen /></StrictMode>);
