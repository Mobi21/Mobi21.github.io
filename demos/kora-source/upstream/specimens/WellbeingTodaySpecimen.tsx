import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-today.css";
import "./wellbeing-today-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WellbeingTodayWorkspace, type WellbeingTodayLoaders } from "../features/life/WellbeingTodayWorkspace";
import type { WellbeingRecord, WellbeingRecordChanges, WellbeingRecordDraft, WellbeingRecordPage, WellbeingSourceCoverage } from "../lib/runtime";

const fixtures = ["populated", "empty", "loading", "partial", "restricted", "provider-gap", "source-error", "many", "same-time", "long-copy", "read-error", "detail-error", "detail-missing", "editor", "conflict"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const now = new Date("2026-08-29T15:00:00.000Z");
const createdAt = "2026-08-29T12:00:00.000Z";

function record(input: Partial<WellbeingRecord> & Pick<WellbeingRecord, "id" | "kind" | "title" | "payload" | "recordedAt">): WellbeingRecord {
  return {
    privacy: "private",
    source: { kind: "manual", label: "You" },
    state: "active",
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...input,
  } as WellbeingRecord;
}

const core: WellbeingRecord[] = [
  record({ id: "breakfast", kind: "meal", title: "Breakfast", payload: { foods: ["Oats", "blueberries", "almond butter"], mealType: "breakfast", notes: "A calm start before work." }, recordedAt: "2026-08-29T12:10:00.000Z" }),
  record({ id: "energy", kind: "observation", title: "Morning energy", payload: { category: "energy", value: "Steady", rating: 4, notes: "Slept well and woke before the alarm." }, recordedAt: "2026-08-29T13:05:00.000Z" }),
  record({ id: "walk", kind: "routine_checkin", title: "Morning walk", payload: { name: "Morning walk", routineId: "routine-walk", status: "done", notes: "Twenty minutes around the park." }, recordedAt: "2026-08-29T14:20:00.000Z" }),
  record({ id: "water", kind: "measurement", title: "Water", payload: { metric: "Hydration", value: 750, unit: "ml", notes: "Logged from the kitchen bottle." }, recordedAt: "2026-08-29T14:42:00.000Z", source: { kind: "imported", label: "Bottle log" } }),
];

const upcoming: WellbeingRecord[] = [
  record({ id: "appointment", kind: "appointment", title: "Annual check-in", payload: { startsAt: "2026-09-01T14:30:00.000Z", clinician: "Primary care", location: "Northside clinic" }, recordedAt: "2026-09-01T14:30:00.000Z" }),
  record({ id: "routine", kind: "routine", title: "Evening wind-down", payload: { name: "Evening wind-down", cadence: "Daily at 9:30 PM", cue: "After putting the phone away", enabled: true }, recordedAt: "2026-08-31T01:30:00.000Z" }),
];

const many = Array.from({ length: 52 }, (_, index) => record({
  id: `moment-${index + 1}`,
  kind: index % 5 === 0 ? "meal" : "observation",
  title: index % 5 === 0 ? `Food note ${index / 5 + 1}` : `Personal observation ${index + 1}`,
  payload: index % 5 === 0 ? { foods: [`Synthetic meal ${index + 1}`], mealType: "snack" } : { category: "other", value: `Synthetic check-in ${index + 1}`, rating: (index % 5) + 1 },
  recordedAt: new Date(Date.parse("2026-08-29T05:10:00.000Z") + Math.floor(index / 5) * 45 * 60_000).toISOString(),
})) as WellbeingRecord[];

function initialRecords() {
  if (fixture === "empty") return [];
  if (fixture === "many") return [...many, ...upcoming];
  if (fixture === "same-time") return [...core.map((item) => ({ ...item, recordedAt: "2026-08-29T13:05:00.000Z" })), ...upcoming];
  if (fixture === "long-copy") return [record({ id: "long", kind: "note", title: "A deliberately long personal note title that should remain readable without forcing the chronology beyond its intended width", payload: { body: "A long but synthetic note about how today felt, what helped, and what context may be useful later. The interface should preserve the meaning without turning a private life record into a wall of text." }, recordedAt: "2026-08-29T13:25:00.000Z", source: { kind: "agent", label: "Kora · confirmed with you" } }), ...upcoming];
  return [...core, ...upcoming];
}

let records = initialRecords();
function page(items: WellbeingRecord[], restrictedOmitted = false): WellbeingRecordPage { return { items, complete: true, restrictedOmitted }; }
function inRange(item: WellbeingRecord, start?: string, end?: string) { return (!start || item.recordedAt >= start) && (!end || item.recordedAt < end); }

function sourceCoverage(): WellbeingSourceCoverage {
  const visible = records.filter((item) => item.state === "active" && item.privacy !== "restricted"),
    local = visible.filter((item) => item.source.kind === "manual" || item.source.kind === "agent"),
    external = visible.filter((item) => item.source.kind === "provider" || item.source.kind === "imported"),
    lastLocal = [...local].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.recordedAt,
    lastExternal = [...external].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.recordedAt;
  if (fixture === "provider-gap") return {
    state: "partial",
    local: { state: "current", visibleRecordCount: local.length, ...(lastLocal ? { lastRecordedAt: lastLocal } : {}) },
    external: [{ id: "provider:synthetic-health", kind: "provider", label: "Synthetic connected health", providerId: "synthetic-health", state: "unavailable", visibleRecordCount: external.length, ...(lastExternal ? { lastRecordedAt: lastExternal } : {}), limitation: "Synthetic provider read is unavailable.", recoveryOwner: "Wellbeing · Sources" }],
    complete: true,
  };
  if (!external.length) return { state: "local_only", local: { state: "current", visibleRecordCount: local.length, ...(lastLocal ? { lastRecordedAt: lastLocal } : {}) }, external: [], complete: true };
  return {
    state: "saved_external_records",
    local: { state: "current", visibleRecordCount: local.length, ...(lastLocal ? { lastRecordedAt: lastLocal } : {}) },
    external: [{ id: "imported:synthetic", kind: "imported", label: external[0].source.label, state: "saved_only", visibleRecordCount: external.length, ...(lastExternal ? { lastRecordedAt: lastExternal } : {}), limitation: "Saved imported record; current import coverage is not established.", recoveryOwner: "Wellbeing · Sources" }],
    complete: true,
  };
}

function loaders(): WellbeingTodayLoaders {
  return {
    sources: async () => {
      if (fixture === "source-error") throw new Error("Synthetic source coverage failure");
      return sourceCoverage();
    },
    list: async (input) => {
      if (fixture === "loading") return new Promise<WellbeingRecordPage>(() => undefined);
      if (fixture === "read-error") throw new Error("Synthetic local Wellbeing read failure");
      const items = records.filter((item) => item.state === (input.state ?? "active") && inRange(item, input.start, input.end) && (!input.kinds?.length || input.kinds.includes(item.kind)));
      if (fixture === "partial") return { items: items.slice(0, 2), complete: false, restrictedOmitted: false };
      const start = input.cursor ? Number(input.cursor) : 0;
      const size = input.pageSize ?? 50;
      const visible = items.slice(start, start + size);
      const next = start + visible.length;
      return {
        items: visible,
        complete: next >= items.length,
        restrictedOmitted: fixture === "restricted",
        ...(next < items.length ? { cursor: String(next) } : {}),
      };
    },
    read: async (id) => {
      if (fixture === "detail-error") throw new Error("Synthetic record detail failure");
      if (fixture === "detail-missing") return { record: undefined as unknown as WellbeingRecord };
      const item = records.find((candidate) => candidate.id === id);
      if (!item) throw new Error("Synthetic record not found");
      return { record: item };
    },
    create: async (draft: WellbeingRecordDraft) => {
      const next = record({ ...draft, id: `created-${records.length + 1}` } as WellbeingRecord);
      records = [...records, next];
      return { record: next, replayed: false };
    },
    update: async (id: string, expectedVersion: number, changes: WellbeingRecordChanges) => {
      const current = records.find((candidate) => candidate.id === id);
      if (!current || current.version !== expectedVersion) throw new Error("Synthetic edit conflict");
      if (fixture === "conflict" && current.version === 1) {
        const latest = { ...current, title: `${current.title} · updated elsewhere`, version: 2, updatedAt: now.toISOString() } as WellbeingRecord;
        records = records.map((candidate) => candidate.id === id ? latest : candidate);
        throw new Error("Synthetic edit conflict: record changed elsewhere");
      }
      const next = { ...current, ...changes, version: current.version + 1, updatedAt: now.toISOString() } as WellbeingRecord;
      records = records.map((candidate) => candidate.id === id ? next : candidate);
      return { record: next, replayed: false };
    },
    archive: async (id: string, expectedVersion: number) => {
      const current = records.find((candidate) => candidate.id === id);
      if (!current || current.version !== expectedVersion) throw new Error("Synthetic archive conflict");
      const next = { ...current, state: "archived" as const, archivedAt: now.toISOString(), version: current.version + 1, updatedAt: now.toISOString() };
      records = records.map((candidate) => candidate.id === id ? next : candidate);
      return { record: next, replayed: false };
    },
    restore: async (id: string, expectedVersion: number) => {
      const current = records.find((candidate) => candidate.id === id);
      if (!current || current.version !== expectedVersion) throw new Error("Synthetic restore conflict");
      const next = { ...current, state: "active" as const, archivedAt: undefined, version: current.version + 1, updatedAt: now.toISOString() };
      records = records.map((candidate) => candidate.id === id ? next : candidate);
      return { record: next, replayed: false };
    },
  };
}

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const initialRoute = fixture === "detail-error" || fixture === "detail-missing" ? "/life/wellbeing?record=breakfast" : fixture === "editor" ? "/life/wellbeing?log=symptom" : fixture === "conflict" ? "/life/wellbeing?record=breakfast" : "/life/wellbeing";
  return <main className="wellbeing-today-specimen" id="main-content">
    <header className="wellbeing-today-specimen__controls">
      <div><strong>Wellbeing Today qualification</strong><span>Synthetic private records · no account or provider access</span></div>
      <KoraSelect label="Wellbeing fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} />
    </header>
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={client}><ViewBarProvider><ViewBar /><WellbeingTodayWorkspace loaders={loaders()} initialNow={now} /></ViewBarProvider></QueryClientProvider>
    </MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
