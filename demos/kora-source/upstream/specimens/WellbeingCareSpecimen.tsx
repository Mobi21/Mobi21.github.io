import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-today.css";
import "../features/life/wellbeing-care.css";
import "./wellbeing-care-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { CARE_KINDS, WellbeingCareWorkspace } from "../features/life/WellbeingCareWorkspace";
import type { WellbeingTodayLoaders } from "../features/life/WellbeingTodayWorkspace";
import type { WellbeingDeletionOutcome, WellbeingRecord, WellbeingRecordChanges, WellbeingRecordDraft, WellbeingRecordPage, WellbeingSourceCoverage } from "../lib/runtime";

const fixtures = ["populated", "empty", "filtered-empty", "upcoming", "saved-only", "provider-gap", "not-configured", "permission-restricted", "source-error", "restricted", "partial-history", "next-page-error", "many-measurements", "long-copy", "loading", "read-error", "detail", "active", "archived", "restore", "detail-missing", "detail-wrong-kind", "editor-observation", "editor-symptom", "editor-measurement", "editor-dose", "editor-plan", "editor-appointment", "editor-document", "edit-conflict", "deletion-waiting", "deletion-rejected", "deletion-transient", "deletion-settled", "deletion-gone"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const now = new Date("2026-08-29T15:00:00.000Z");

function record(input: Partial<WellbeingRecord> & Pick<WellbeingRecord, "id" | "kind" | "title" | "payload" | "recordedAt">): WellbeingRecord {
  return { privacy: "private", source: { kind: "manual", label: "You" }, state: "active", version: 1, createdAt: input.recordedAt, updatedAt: "2026-08-29T14:30:00.000Z", ...input } as WellbeingRecord;
}

const core: WellbeingRecord[] = [
  record({ id: "observation", kind: "observation", title: "Afternoon energy", payload: { category: "energy", value: "Steady after lunch", rating: 4, notes: "Recorded in my own words." }, recordedAt: "2026-08-29T14:05:00.000Z" }),
  record({ id: "symptom", kind: "symptom", title: "Mild headache", payload: { name: "Headache", severity: 2, notes: "Noticed after a long screen session." }, recordedAt: "2026-08-29T13:20:00.000Z" }),
  record({ id: "measurement", kind: "measurement", title: "Temperature", payload: { metric: "Temperature", value: 98.4, unit: "°F", notes: "Home reading." }, recordedAt: "2026-08-29T12:40:00.000Z", source: { kind: "provider", providerId: "home-device", label: "Home thermometer" } }),
  record({ id: "plan", kind: "medication_plan", title: "Daily medication", payload: { medication: "Recorded medication", instructions: "Take one tablet as directed by the prescribing clinician.", schedule: "Morning", prescriber: "Primary care note", active: true }, recordedAt: "2026-08-20T12:00:00.000Z" }),
  record({ id: "dose", kind: "dose", title: "Morning dose", payload: { medication: "Recorded medication", amount: "10 mg", takenAt: "2026-08-29T12:30:00.000Z", status: "taken" }, recordedAt: "2026-08-29T12:30:00.000Z" }),
  record({ id: "appointment", kind: "appointment", title: "Annual check-in", payload: { startsAt: "2026-09-02T15:00:00.000Z", clinician: "Primary care", specialty: "General medicine", location: "Northside clinic", notes: "Bring the existing medication list." }, recordedAt: "2026-09-02T15:00:00.000Z" }),
  record({ id: "document", kind: "care_document", title: "Visit summary", payload: { name: "Visit summary.pdf", notes: "Imported summary awaiting evidence linkage." }, recordedAt: "2026-08-18T16:00:00.000Z", source: { kind: "imported", label: "Document import" } }),
];
const longCopy = record({ id: "long", kind: "observation", title: "A deliberately long recorded observation title that must wrap without pushing exact care actions beyond the working canvas", payload: { category: "other", value: "A long owner-authored description retained exactly without diagnosis, compression, or unsupported interpretation.", notes: "Synthetic long copy for responsive qualification." }, recordedAt: "2026-08-29T11:00:00.000Z", source: { kind: "agent", label: "Kora · confirmed with you after reviewing the original owner-authored note" } });
const restrictedDocument = record({ id: "restricted-document", kind: "care_document", title: "Synthetic restricted care document", payload: { name: "restricted-document.pdf", notes: "Synthetic restricted content must never appear in the chronology." }, privacy: "restricted", recordedAt: "2026-08-19T16:00:00.000Z" });
const archivedMeasurement = { ...core[2], state: "archived" as const, version: 4, archivedAt: "2026-08-29T14:00:00.000Z" };
const wrongKind = record({ id: "wrong-kind", kind: "meal", title: "Synthetic meal record", payload: { description: "This belongs to Food." }, recordedAt: "2026-08-29T12:00:00.000Z" });
const many = Array.from({ length: 5001 }, (_, index) => record({ id: `measurement-${index + 1}`, kind: "measurement", title: `Temperature reading ${index + 1}`, payload: { metric: "Temperature", value: Number((97.8 + (index % 10) / 10).toFixed(1)), unit: "°F" }, recordedAt: new Date(now.getTime() - index * 15 * 60_000).toISOString(), source: { kind: "provider", providerId: "synthetic-device", label: "Synthetic device" } }));

const archivedCareFixture = fixture === "archived" || fixture === "restore";
let records = fixture === "empty" ? [] : fixture === "filtered-empty" ? core.filter((item) => item.kind === "appointment") : fixture === "upcoming" ? core.filter((item) => item.kind === "appointment") : fixture === "restricted" ? [...core, restrictedDocument] : archivedCareFixture ? core.map((item) => item.id === archivedMeasurement.id ? archivedMeasurement : item) : fixture === "detail-wrong-kind" ? [...core, wrongKind] : fixture === "many-measurements" ? many : fixture === "long-copy" ? [longCopy] : [...core];
let deleteAttempt = 0;
let deletionApproved = false;

function page(items: WellbeingRecord[], restrictedOmitted = false, complete = true, cursor?: string): WellbeingRecordPage { return { items, restrictedOmitted, complete, ...(cursor ? { cursor } : {}) }; }
function ordinaryRecords() { return records.filter((item) => item.privacy !== "restricted"); }
function coverage(): WellbeingSourceCoverage {
  const visible = ordinaryRecords();
  if (fixture === "provider-gap") return { state: "partial", local: { state: "current", visibleRecordCount: visible.filter((item) => item.source.kind === "manual").length }, external: [{ id: "provider:care", kind: "provider", label: "Synthetic care device", providerId: "synthetic-device", state: "unavailable", visibleRecordCount: 1, lastRecordedAt: "2026-08-28T14:00:00.000Z", limitation: "Synthetic provider read is unavailable.", recoveryOwner: "Wellbeing · Sources" }], complete: true };
  if (fixture === "not-configured") return { state: "partial", local: { state: "current", visibleRecordCount: visible.length }, external: [{ id: "provider:not-configured", kind: "provider", label: "Synthetic care source", state: "not_configured", visibleRecordCount: 0, recoveryOwner: "Wellbeing · Sources" }], complete: true };
  if (fixture === "permission-restricted") return { state: "partial", local: { state: "current", visibleRecordCount: visible.length }, external: [{ id: "provider:restricted", kind: "provider", label: "Synthetic restricted source", state: "permission_restricted", visibleRecordCount: 0, limitation: "Synthetic permission is not granted.", recoveryOwner: "Wellbeing · Sources" }], complete: true };
  const external = visible.filter((item) => item.source.kind === "provider" || item.source.kind === "imported");
  return external.length ? { state: "saved_external_records", local: { state: "current", visibleRecordCount: visible.length - external.length }, external: [{ id: "provider:saved-care", kind: "provider", label: "Saved care sources", state: "saved_only", visibleRecordCount: external.length, lastRecordedAt: external.at(-1)?.recordedAt, recoveryOwner: "Wellbeing · Sources" }], complete: true } : { state: "local_only", local: { state: "current", visibleRecordCount: visible.length }, external: [], complete: true };
}

function loaders(): WellbeingTodayLoaders {
  return {
    sources: async () => { if (fixture === "source-error") throw new Error("Synthetic source coverage failure"); return coverage(); },
    list: async (input) => {
      if (fixture === "read-error") throw new Error("Synthetic local Care read failure");
      if (fixture === "loading") return await new Promise<WellbeingRecordPage>(() => undefined);
      const filtered = ordinaryRecords().filter((item) => item.state === (input.state ?? "active") && (!input.kinds?.length || input.kinds.includes(item.kind))).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      if (fixture === "many-measurements") { const offset = input.cursor ? Number(input.cursor.replace("care-page-", "")) : 0, next = offset + 100; return page(filtered.slice(offset, next), false, next >= filtered.length, next < filtered.length ? `care-page-${next}` : undefined); }
      if (fixture === "partial-history") return page(filtered.slice(0, 5), false, false);
      if (fixture === "next-page-error") { if (input.cursor) throw new Error("Synthetic earlier Care page failure"); return page(filtered.slice(0, 3), false, false, "earlier"); }
      return page(filtered, fixture === "restricted" || records.some((item) => item.privacy === "restricted"));
    },
    read: async (id) => { if (fixture === "detail-missing") throw new Error("Synthetic record not found"); const item = fixture === "detail-wrong-kind" ? wrongKind : records.find((candidate) => candidate.id === id); if (!item) throw new Error("Synthetic record not found"); return { record: item }; },
    create: async (draft: WellbeingRecordDraft) => { const next = record({ ...draft, id: `created-${records.length + 1}` } as WellbeingRecord); records = [...records, next]; return { record: next, replayed: false }; },
    update: async (id: string, expectedVersion: number, changes: WellbeingRecordChanges) => { const current = records.find((item) => item.id === id); if (fixture === "edit-conflict") { const latest = { ...current!, title: "Temperature · latest saved", version: expectedVersion + 1, updatedAt: now.toISOString() } as WellbeingRecord; records = records.map((item) => item.id === id ? latest : item); throw new Error("Synthetic care edit conflict"); } if (!current || current.version !== expectedVersion) throw new Error("Synthetic edit conflict"); const next = { ...current, ...changes, version: expectedVersion + 1, updatedAt: now.toISOString() } as WellbeingRecord; records = records.map((item) => item.id === id ? next : item); return { record: next, replayed: false }; },
    archive: async (id, expectedVersion) => { const current = records.find((item) => item.id === id); if (!current || current.version !== expectedVersion) throw new Error("Synthetic archive conflict"); const next = { ...current, state: "archived" as const, archivedAt: now.toISOString(), version: expectedVersion + 1 }; records = records.map((item) => item.id === id ? next : item); return { record: next, replayed: false }; },
    restore: async (id, expectedVersion) => { const current = records.find((item) => item.id === id); if (!current || current.version !== expectedVersion) throw new Error("Synthetic restore conflict"); const next = { ...current, state: "active" as const, archivedAt: undefined, version: expectedVersion + 1 }; records = records.map((item) => item.id === id ? next : item); return { record: next, replayed: false }; },
    delete: async (id, _version, _key): Promise<WellbeingDeletionOutcome> => {
      deleteAttempt += 1;
      if (fixture === "deletion-gone") return { status: "gone", surface: "wellbeing_record", id, replayed: false };
      if (fixture === "deletion-rejected") return { status: "rejected", message: "Deletion was rejected. The care record is unchanged.", replayed: false };
      if (fixture === "deletion-transient" && deleteAttempt === 1) return { status: "uncertain", requestKey: _key, message: "The connection was interrupted. The deletion outcome is unknown; retry the same request.", retryable: true };
      if (!deletionApproved) return { status: "waiting_confirmation", confirmations: [{ confirmationId: "care-delete", expiresAt: "2026-08-29T16:00:00.000Z", purpose: "exact_deletion" }], consequence: "Permanently delete this exact local Wellbeing record.", replayed: false };
      records = records.filter((item) => item.id !== id);
      return { status: "settled", deletion: { surface: "wellbeing_record", id, deleted: true, negativeRead: true, erased: ["wellbeing_record"], independentSources: [] }, replayed: false };
    },
    approve: async () => { deletionApproved = true; }, reject: async () => { deletionApproved = false; },
  };
}

function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }
function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const detailFixtures: Fixture[] = ["detail", "active", "archived", "restore", "deletion-waiting", "deletion-rejected", "deletion-transient", "deletion-settled", "deletion-gone"];
  const route = detailFixtures.includes(fixture) ? `/life/wellbeing/care?record=measurement${archivedCareFixture ? "&type=measurement" : ""}` : fixture === "detail-missing" ? "/life/wellbeing/care?record=missing&edit=1" : fixture === "detail-wrong-kind" ? "/life/wellbeing/care?record=wrong-kind&edit=1" : fixture === "edit-conflict" ? "/life/wellbeing/care?record=measurement&edit=1" : fixture === "filtered-empty" ? "/life/wellbeing/care?type=symptom" : fixture === "editor-observation" ? "/life/wellbeing/care?log=observation" : fixture === "editor-symptom" ? "/life/wellbeing/care?log=symptom" : fixture === "editor-measurement" ? "/life/wellbeing/care?log=measurement" : fixture === "editor-dose" ? "/life/wellbeing/care?log=dose" : fixture === "editor-plan" ? "/life/wellbeing/care?log=medication_plan" : fixture === "editor-appointment" ? "/life/wellbeing/care?log=appointment" : fixture === "editor-document" ? "/life/wellbeing/care?log=care_document" : "/life/wellbeing/care";
  return <main className="wellbeing-care-specimen" id="main-content"><header className="wellbeing-care-specimen__controls"><div><strong>Wellbeing Care qualification</strong><span>Synthetic private care records · no account or provider access</span></div><KoraSelect label="Care fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><WellbeingCareWorkspace loaders={loaders()} initialNow={now} /></ViewBarProvider></QueryClientProvider></MemoryRouter></main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
