import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../components/collections.css";
import "../features/life/wellbeing-today.css";
import "../features/life/wellbeing-navigation.css";
import "../features/life/wellbeing-records.css";
import "./wellbeing-records-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect, ToastProvider } from "../components/primitives";
import { WellbeingRecordsWorkspace, type WellbeingRecordsLoaders } from "../features/life/WellbeingRecordsWorkspace";
import { RuntimeRequestError, type WellbeingDeletionOutcome, type WellbeingRecord, type WellbeingRecordPage } from "../lib/runtime";

const fixtures = ["populated", "detail", "edit", "edit-conflict", "empty", "filtered-empty", "restricted", "archived", "restore", "unavailable", "loading", "fifty", "ten-thousand", "long-copy", "deletion-waiting", "deletion-rejected", "deletion-transient", "deletion-settled", "deletion-gone"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const NOW = new Date("2026-08-30T14:00:00.000Z");
const archivedFixture = fixture === "archived" || fixture === "restore";

const kinds = ["note", "measurement", "meal", "symptom", "routine_checkin", "appointment"] as const;
function record(index: number): WellbeingRecord {
  const kind = kinds[index % kinds.length]!;
  const common = {
    id: `record-${index}`,
    kind,
    title: fixture === "long-copy" && index === 0
      ? "A deliberately long owner-authored note about energy, sleep, travel, medication timing, and the context that made this day different"
      : kind === "measurement" ? "Morning blood pressure" : kind === "meal" ? "Lunch at home" : kind === "symptom" ? "Afternoon headache" : kind === "routine_checkin" ? "Evening walk" : kind === "appointment" ? "Annual primary care visit" : `Daily reflection ${index + 1}`,
    recordedAt: new Date(NOW.getTime() - index * 3_600_000).toISOString(),
    privacy: "private" as const,
    source: index % 4 === 1 ? { kind: "provider" as const, label: "Saved wearable", providerId: "synthetic-wearable" } : index % 4 === 2 ? { kind: "imported" as const, label: "Imported care file" } : { kind: "manual" as const, label: "Added in Kora" },
    state: archivedFixture ? "archived" as const : "active" as const,
    version: index === 0 ? 3 : 1,
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: new Date(NOW.getTime() - index * 1_800_000).toISOString(),
    ...(archivedFixture ? { archivedAt: "2026-08-30T13:30:00.000Z" } : {}),
  };
  const payload = kind === "measurement" ? { metric: "Blood pressure", value: 118, unit: "mmHg", notes: "Before breakfast" }
    : kind === "meal" ? { description: "Tomato toast, fruit, and coffee", tags: ["lunch"] }
    : kind === "symptom" ? { name: "Headache", severity: 2, notes: "Improved after rest" }
    : kind === "routine_checkin" ? { name: "Evening walk", status: "done" as const, notes: "Twenty quiet minutes" }
    : kind === "appointment" ? { startsAt: "2026-09-14T14:00:00.000Z", clinician: "Dr. Rivera", specialty: "Primary care" }
    : { body: fixture === "long-copy" && index === 0 ? "This is a long, human-written record with enough context to test wrapping without turning the collection into a stack of oversized cards. It should remain readable in the exact detail while the table keeps a compact summary." : `Felt steady after a short walk and an early lunch. Saved detail ${index + 1}.` };
  return { ...common, payload } as WellbeingRecord;
}

const count = fixture === "empty" || fixture === "filtered-empty" ? 0 : fixture === "fifty" || fixture === "ten-thousand" ? 50 : 12;
let items = Array.from({ length: count }, (_, index) => record(index));
const page: WellbeingRecordPage = { items, ...(fixture === "ten-thousand" ? { cursor: "synthetic-next-50" } : {}), complete: fixture !== "ten-thousand", restrictedOmitted: fixture === "restricted" };
const byId = new Map(items.map((item) => [item.id, item]));
let deleteAttempt = 0;
let deletionApproved = false;
type ListInput = Parameters<WellbeingRecordsLoaders["list"]>[0];

function matchesInput(item: WellbeingRecord, input: ListInput) {
  const text = `${item.title} ${JSON.stringify(item.payload)}`.toLowerCase();
  return (!input.kinds?.length || input.kinds.includes(item.kind))
    && (!input.sourceKinds?.length || input.sourceKinds.includes(item.source.kind))
    && (!input.start || item.recordedAt >= input.start)
    && (!input.end || item.recordedAt < input.end)
    && (!input.query || text.includes(input.query.toLowerCase()))
    && item.state === (input.state ?? "active");
}

function ordered(input: ListInput, candidates: WellbeingRecord[]) {
  const field = input.sort === "updated" ? "updatedAt" : "recordedAt";
  return candidates.filter((item) => matchesInput(item, input)).sort((left, right) =>
    right[field].localeCompare(left[field]) || right.id.localeCompare(left.id));
}

const loaders: WellbeingRecordsLoaders = {
  list: async (input) => {
    if (fixture === "loading") return new Promise(() => {});
    if (fixture === "unavailable") throw new Error("Synthetic local record authority is unavailable.");
    if (fixture === "ten-thousand") {
      const offset = input.cursor ? Number(input.cursor.replace("synthetic-offset-", "")) : 0;
      const matches: WellbeingRecord[] = [];
      let scan = offset;
      while (scan < 10_000 && matches.length < 50) {
        const candidate = record(scan);
        if (matchesInput(candidate, input)) matches.push(candidate);
        scan += 1;
      }
      return {
        items: matches,
        ...(scan < 10_000 ? { cursor: `synthetic-offset-${scan}` } : {}),
        complete: scan >= 10_000,
        restrictedOmitted: false,
      };
    }
    if (input.cursor) return { items: [], complete: true, restrictedOmitted: false };
    const filtered = ordered(input, items);
    return { ...page, items: filtered, complete: true, cursor: undefined };
  },
  read: async (id) => {
    const selected = byId.get(id);
    if (!selected) throw new Error("Record unavailable");
    return { record: selected, history: [
      { version: selected.version, action: selected.state === "archived" ? "archived" : "updated", recordedAt: selected.updatedAt, record: selected },
      { version: 1, action: "created", recordedAt: selected.createdAt, record: { ...selected, version: 1 } },
    ] };
  },
  sources: async () => ({ state: "local_only", local: { state: "current", visibleRecordCount: items.length }, external: [], complete: true }),
  create: async (draft) => ({ record: { ...draft, id: "created-record", state: "active", version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() } as WellbeingRecord, replayed: false }),
  update: async (id, version, changes) => {
    const current = byId.get(id);
    if (!current || current.version !== version) throw new Error("Synthetic record version conflict");
    if (fixture === "edit-conflict") {
      const latest = { ...current, title: "Daily reflection · latest saved", payload: { body: "The latest saved note from another edit." }, version: version + 1, updatedAt: NOW.toISOString() } as WellbeingRecord;
      byId.set(id, latest);
      throw new RuntimeRequestError("A newer record version is available.", { code: "conflict", status: 409 });
    }
    const next = { ...current, ...changes, version: version + 1, updatedAt: NOW.toISOString() } as WellbeingRecord;
    byId.set(id, next);
    items = items.map((item) => item.id === id ? next : item);
    return { record: next, replayed: false };
  },
  archive: async (id, version) => {
    const current = byId.get(id)!;
    const next = { ...current, state: "archived" as const, version: version + 1, archivedAt: NOW.toISOString() };
    byId.set(id, next);
    items = items.map((item) => item.id === id ? next : item);
    return { record: next, replayed: false };
  },
  restore: async (id, version) => {
    const current = byId.get(id)!;
    const next = { ...current, state: "active" as const, version: version + 1, archivedAt: undefined };
    byId.set(id, next);
    items = items.map((item) => item.id === id ? next : item);
    return { record: next, replayed: false };
  },
  delete: async (id, _version, requestKey): Promise<WellbeingDeletionOutcome> => {
    deleteAttempt += 1;
    if (fixture === "deletion-gone") return { status: "gone", surface: "wellbeing_record", id, replayed: false };
    if (fixture === "deletion-rejected") return { status: "rejected", message: "Deletion was rejected. The record remains unchanged.", replayed: false };
    if (fixture === "deletion-transient" && deleteAttempt === 1) return { status: "uncertain", requestKey, message: "The connection was interrupted. The deletion outcome is unknown; retry the same request.", retryable: true };
    if (!deletionApproved) return { status: "waiting_confirmation", confirmations: [{ confirmationId: "record-delete", expiresAt: "2026-08-30T16:00:00.000Z", purpose: "exact_deletion" }], consequence: "Permanently delete this exact synthetic Wellbeing record.", replayed: false };
    byId.delete(id);
    items = items.filter((item) => item.id !== id);
    return { status: "settled", deletion: { surface: "wellbeing_record", id, deleted: true, negativeRead: true, erased: ["wellbeing_record"], independentSources: [] }, replayed: false };
  },
  approve: async () => { deletionApproved = true; }, reject: async () => { deletionApproved = false; },
};

const deletionFixture = fixture.startsWith("deletion-");
const route = fixture === "filtered-empty" ? "/life/wellbeing/records?q=missing" : archivedFixture ? "/life/wellbeing/records?state=archived&record=record-0" : fixture === "edit" || fixture === "edit-conflict" ? "/life/wellbeing/records?record=record-0&edit=1" : fixture === "detail" || fixture === "long-copy" || deletionFixture ? "/life/wellbeing/records?record=record-0" : "/life/wellbeing/records";
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function App() {
  return <ToastProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><ViewBarProvider>
    <main className="wellbeing-records-specimen" id="main-content">
      <div className="wellbeing-records-specimen__controls">
        <div><strong>Records specimen</strong><span>{fixture} · deterministic synthetic data</span></div>
        <KoraSelect label="Fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value }))} onValueChange={(value) => { const next = new URL(location.href); next.searchParams.set("fixture", value); location.href = next.toString(); }} />
      </div>
      <ViewBar />
      <WellbeingRecordsWorkspace loaders={loaders} initialNow={NOW} />
    </main>
  </ViewBarProvider></MemoryRouter></QueryClientProvider></ToastProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
