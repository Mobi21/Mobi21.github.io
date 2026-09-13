import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/profile.css";
import "./about-you-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { LifeProfileWorkspace } from "../features/life/LifeProfileWorkspace";
import { LifeLayout } from "../features/life/LifeLayout";
import {
  runtime,
  type NativeToolConfirmation,
  type ProfileCategory,
  type ProfileOverview,
  type ProfileRecord,
} from "../lib/runtime";

const fixtures = ["populated", "review", "identity", "communication", "household", "preferences", "privacy", "sources", "setup-only", "empty", "loading", "error", "partial", "restricted-omitted", "restricted-access", "long-copy", "large", "detail", "read-only", "stale", "editor", "conflict", "restore-conflict", "exact-error", "delete-confirmation", "delete-waiting", "delete-rejected", "delete-expired", "delete-uncertain", "delete-settled", "delete-gone"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";

function fact(key: string, value: ProfileRecord["value"], provenance: ProfileRecord["provenance"] = "user_explicit"): ProfileRecord {
  const category = key.startsWith("identity.") ? "identity"
    : key.startsWith("communication.") ? "communication"
    : key.startsWith("household.") ? "household"
    : key.includes("boundary") ? "privacy"
    : key.startsWith("preference.") || key.startsWith("accessibility.") || key.startsWith("custom.") ? "preferences"
    : "unknown";
  return { key, category, value, provenance, version: 3, createdAt: "2026-08-12T14:00:00.000Z", updatedAt: "2026-08-28T18:30:00.000Z" };
}

const populated: ProfileRecord[] = [
  fact("identity.preferred_name", "Bee"),
  fact("identity.pronouns", "they/them"),
  fact("identity.timezone", "America/New_York"),
  fact("communication.preference", "Lead with the decision, then show the reasoning."),
  fact("communication.response_length", "Keep routine answers concise; go deep when a decision is consequential."),
  fact("household.city", "Brooklyn"),
  fact("household.detail", "Shares a home with Jordan and a very curious cat."),
  fact("preference.food", ["Vegetarian meals during the week", "No raw onion"], "user_confirmed"),
  fact("accessibility.need", "Avoid rapid flashing motion and preserve keyboard access."),
  fact("preference.kora_boundary", "Ask before contacting another person or changing an external account."),
  fact("preference.context_boundary", "Do not treat a remembered preference as permission to expose private context in a new conversation."),
];
const readOnlyRecord: ProfileRecord = {
  ...fact("identity.timezone", "America/New_York", "system_read_only"),
  mutability: "read_only",
  source: { kind: "system_read_only", label: "System owned", correctionOwner: "source" },
};
const archivedRecord: ProfileRecord = {
  ...fact("communication.archived_style", "Use the previous compact style."),
  state: "archived",
};
const setup: ProfileRecord[] = [
  fact("first_run_profile_first_run", { valueText: "No local profile facts yet.", details: { sourceNote: "Completed during initial setup." } }),
  fact("first_run_profile_profile", "No local profile facts yet."),
  fact("first_run_profile_calendar", "No details saved"),
];
const long = [fact("communication.preference", "Use a deliberately long owner-confirmed communication preference that must wrap naturally without turning the portrait into a narrow metadata table, hiding the correction affordance, or forcing the working canvas beyond the supported width."), fact("preference.kora_boundary", "Never infer that silence means permission; preserve explicit review and approval before any consequential external action, even when a prior conversation contained a superficially similar request.")];
const large = Array.from({ length: 1_005 }, (_, index) => fact(`custom.detail_${String(index).padStart(4, "0")}`, `Synthetic value ${index}`));
const deletedKeys = new Set<string>();
const review = populated.map((record, index) => index === 0 ? { ...record, state: "proposed" as const, provenance: "agent_inferred" as const } : index === 1 ? { ...record, state: "conflicted" as const } : record);
const records = fixture === "setup-only" ? setup : fixture === "empty" ? [] : fixture === "long-copy" ? long : fixture === "large" ? large : fixture === "review" ? review : fixture === "read-only" ? populated.map((record) => record.key === readOnlyRecord.key ? readOnlyRecord : record) : ["sources", "restore-conflict"].includes(fixture) ? [...populated, archivedRecord] : populated;
const recordOverrides = new Map<string, ProfileRecord>();
const currentRecord = (key: string) =>
  recordOverrides.get(key) ?? records.find((record) => record.key === key);
const profileRecordAction = (record: ProfileRecord): "created" | "archived" =>
  record.state === "archived" ? "archived" : "created";

const deleteApproval: NativeToolConfirmation = {
  id: "about-you-delete-confirmation",
  toolName: "delete_local_data",
  argumentsHash: "synthetic-about-you-delete",
  state: "pending",
  owner: { kind: "foreground", sessionId: "synthetic-session", nativeRunId: "synthetic-run", toolCallId: "synthetic-call" },
  presentation: { action: "Delete local profile fact", target: "The exact About You fact selected in this specimen", consequence: "This permanently removes only this synthetic local fact.", risk: "destructive" },
  expiresAt: "2099-08-30T23:00:00.000Z",
  createdAt: "2026-08-30T20:00:00.000Z",
  updatedAt: "2026-08-30T20:00:00.000Z",
};

runtime.profilePage = async (input = {}) => {
  if (fixture === "loading") return new Promise(() => undefined);
  if (fixture === "error") throw new Error("Synthetic internal profile diagnostic must not render");
  const needle = input.query?.toLocaleLowerCase();
  const visible = records.map((record) => currentRecord(record.key)!).filter((record) =>
    !deletedKeys.has(record.key) &&
    (!input.category || record.category === input.category) &&
    (!input.states?.length || input.states.includes(record.state ?? "confirmed")) &&
    (input.includeSetupArtifacts !== false || !record.key.startsWith("first_run_profile_")) &&
    (!needle || record.key.toLocaleLowerCase().includes(needle) || JSON.stringify(record.value).toLocaleLowerCase().includes(needle)),
  );
  const offset = input.cursor ? Number(input.cursor) : 0;
  const limit = input.pageSize ?? input.limit ?? 50;
  const items = visible.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < visible.length;
  return { items, nextCursor: hasMore ? String(nextOffset) : undefined, ...(hasMore ? { cursor: String(nextOffset) } : {}), complete: fixture !== "partial" && !hasMore, matchingCount: visible.length };
};
runtime.profileOverview = async (): Promise<ProfileOverview> => {
  if (fixture === "loading") return new Promise(() => undefined);
  if (fixture === "error") throw new Error("Synthetic internal profile diagnostic must not render");
  const visible = records.map((record) => currentRecord(record.key)!).filter((record) => !deletedKeys.has(record.key) && !record.key.startsWith("first_run_profile_"));
  const active = visible.filter((record) => !["archived", "dismissed"].includes(record.state ?? "confirmed"));
  const reviewItems = active.filter((record) => ["proposed", "conflicted"].includes(record.state ?? "confirmed"));
  const categories = ["identity", "communication", "household", "preferences", "privacy"] as const;
  const text = (record: ProfileRecord) => {
    const value = Array.isArray(record.value)
      ? record.value.map(String).join(", ")
      : record.value && typeof record.value === "object"
        ? Object.entries(record.value).map(([key, item]) => `${key}: ${String(item)}`).join("; ")
        : String(record.value);
    if (record.key === "identity.preferred_name") return `Call me ${value}.`;
    return `${value}${/[.!?]$/.test(value) ? "" : "."}`;
  };
  return {
    portrait: { sections: categories.map((category) => ({ category, statements: active.filter((record) => record.category === category && (record.state ?? "confirmed") === "confirmed").slice(0, 5).map((record) => ({ text: text(record), state: "confirmed" as const, mutability: record.mutability ?? "editable", support: { key: record.key, version: record.version } })) })) },
    review: { items: reviewItems.slice(0, 20).map((record) => ({ text: text(record), state: record.state as "proposed" | "conflicted", updatedAt: record.updatedAt, support: { key: record.key, version: record.version } })), total: reviewItems.length, complete: reviewItems.length <= 20 },
    recentChanges: { items: active.slice(0, 20).map((record, index) => ({
      action: (["confirmed", "corrected", "created", "confirmed", "corrected"] as const)[index % 5]!,
      category: record.category ?? "unknown",
      recordedAt: new Date(Date.parse(record.updatedAt) - index * 86_400_000).toISOString(),
      support: { key: record.key, version: record.version },
      source: record.source ?? (index % 3 === 0
        ? { kind: "owner_confirmed" as const, label: "Confirmed by you" as const, correctionOwner: "owner" as const }
        : { kind: "kora_proposed" as const, label: "Proposed by Kora" as const, correctionOwner: "owner" as const }),
    })), total: active.length, complete: active.length <= 20 },
    counts: { visible: visible.length, active: active.length, setupArtifacts: records.filter((record) => record.key.startsWith("first_run_profile_")).length, byState: { confirmed: active.filter((record) => (record.state ?? "confirmed") === "confirmed").length, proposed: reviewItems.filter((record) => record.state === "proposed").length, conflicted: reviewItems.filter((record) => record.state === "conflicted").length, archived: visible.filter((record) => record.state === "archived").length, dismissed: visible.filter((record) => record.state === "dismissed").length }, byCategory: Object.fromEntries([...categories, "unknown"].map((category) => [category, visible.filter((record) => record.category === category).length])) as Record<ProfileCategory, number> },
    complete: fixture !== "partial",
    generatedAt: "2026-08-31T12:00:00.000Z",
  };
};
runtime.profileHistoryPage = async () => ({
  items: records
    .slice(0, 50)
    .map((record) => ({
      profileKey: record.key,
      version: record.version,
      action: profileRecordAction(record),
      provenance: record.provenance,
      state: record.state ?? "confirmed",
      recordedAt: record.updatedAt,
    })),
  complete: true,
  nextCursor: undefined,
});
runtime.brainRecord = (async (surface: "profile", id: string) => {
  if (fixture === "exact-error") throw new Error("Synthetic internal exact-detail diagnostic must not render");
  const record = currentRecord(id);
  if (!record) throw new Error("Synthetic profile detail is unavailable.");
  return { surface, record };
}) as typeof runtime.brainRecord;
let conflictAttempt = 0;
runtime.setProfileRecord = (async (key, input) => {
  const current = currentRecord(key) ?? fact(key, input.value);
  if (fixture === "conflict" && conflictAttempt++ === 0) return { status: "conflict", current: { ...current, value: "Latest synthetic saved value", version: current.version + 1 } };
  const next = { ...current, value: input.value, version: current.version + 1, updatedAt: new Date().toISOString() };
  recordOverrides.set(key, next);
  return { status: "settled", record: next, replayed: false };
}) as typeof runtime.setProfileRecord;
runtime.transitionProfileRecord = (async (key: string, input: { action: "confirm" | "dismiss" | "archive" | "restore"; expectedVersion: number; requestKey?: string }) => {
  const current = currentRecord(key);
  if (!current) return { status: "gone" as const };
  if (fixture === "restore-conflict" && input.action === "restore")
    return { status: "conflict" as const, current: { ...current, version: current.version + 1 } };
  if (current.version !== input.expectedVersion)
    return { status: "conflict" as const, current };
  const state = input.action === "archive"
    ? "archived"
    : input.action === "dismiss"
      ? "dismissed"
      : "confirmed";
  const next: ProfileRecord = {
    ...current,
    state,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
  recordOverrides.set(key, next);
  return { status: "settled" as const, record: next, replayed: false };
}) as typeof runtime.transitionProfileRecord;
runtime.deleteBrainRecord = (async (surface, id) => {
  if (fixture === "delete-waiting") return { status: "waiting_confirmation", confirmations: [{ confirmationId: deleteApproval.id, expiresAt: deleteApproval.expiresAt, purpose: "exact_deletion" }], consequence: deleteApproval.presentation.consequence, replayed: false };
  if (fixture === "delete-rejected") return { status: "rejected", message: "Synthetic rejection", replayed: false };
  if (fixture === "delete-expired") return { status: "expired", message: "Synthetic expiry", replayed: false };
  if (fixture === "delete-uncertain") return { status: "uncertain", requestKey: "synthetic-uncertain-delete", message: "Synthetic uncertain deletion", retryable: true };
  deletedKeys.add(id);
  if (fixture === "delete-settled") return { status: "settled", surface, id, negativeRead: true, replayed: false, deletion: { erased: ["stable_profile", "revision history"], independentSources: ["Synthetic imported source"] } };
  return { status: "gone", surface, id, negativeRead: true, replayed: false };
}) as typeof runtime.deleteBrainRecord;
runtime.toolConfirmations = async () => ({ confirmations: [deleteApproval] });

function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }

export function findAboutYouEditorControl(labelText: string) {
  const label = [...document.querySelectorAll<HTMLLabelElement>(".about-you-editor label")]
    .find((candidate) => [...candidate.children]
      .some((child) => child.tagName === "SPAN" && child.textContent?.trim() === labelText));
  const control = label?.control;
  return control instanceof HTMLInputElement
    ? control
    : label?.querySelector<HTMLInputElement>("input") ?? null;
}

export function isAboutYouConflictStateRendered() {
  return Boolean(
    document.querySelector('.about-you-editor [role="alert"]') &&
    document.querySelector('[aria-label="Latest saved profile value"]'),
  );
}

function FixtureAutomation() {
  useEffect(() => {
    const timers: number[] = [];
    let cancelled = false;
    const clickDetailAction = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>(".about-you-detail__footer button")]
        .find((button) => button.textContent?.trim() === label)
        ?.click();
    const waitFor = <T,>(read: () => T | null | undefined, label: string) => new Promise<T>((resolve, reject) => {
      const deadline = performance.now() + 2_000;
      const poll = () => {
        if (cancelled) return;
        const value = read();
        if (value) {
          resolve(value);
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error(`About You specimen automation did not render ${label}.`));
          return;
        }
        timers.push(window.setTimeout(poll, 20));
      };
      poll();
    });
    if (fixture === "editor") {
      timers.push(window.setTimeout(() => clickDetailAction("Correct"), 120));
    }
    if (fixture === "conflict") {
      void (async () => {
        const correct = await waitFor(
          () => [...document.querySelectorAll<HTMLButtonElement>(".about-you-detail__footer button")]
            .find((button) => button.textContent?.trim() === "Correct"),
          "the Correct action",
        );
        correct.click();
        const input = await waitFor(
          () => findAboutYouEditorControl("Value"),
          "the labeled Value control",
        );
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "Draft Bee");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.closest("form")?.requestSubmit();
        await waitFor(
          () => isAboutYouConflictStateRendered() ? true : undefined,
          "the conflict alert and latest saved value",
        );
        document.querySelector(".about-you-specimen")?.setAttribute("data-automation-state", "conflict-rendered");
      })().catch((reason) => {
        const specimen = document.querySelector(".about-you-specimen");
        specimen?.setAttribute("data-automation-state", "failed");
        specimen?.setAttribute("data-automation-error", reason instanceof Error ? reason.message : String(reason));
        console.error(reason);
      });
    }
    if (fixture === "restore-conflict") {
      timers.push(window.setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>(".about-you-archived button")]
        .find((button) => button.textContent?.trim() === "Restore")?.click(), 160));
    }
    if (["delete-confirmation", "delete-waiting", "delete-rejected", "delete-expired", "delete-uncertain", "delete-settled", "delete-gone"].includes(fixture)) {
      timers.push(window.setTimeout(() => clickDetailAction("Delete permanently"), 120));
    }
    if (["delete-waiting", "delete-rejected", "delete-expired", "delete-uncertain", "delete-settled", "delete-gone"].includes(fixture)) {
      timers.push(window.setTimeout(() => document.querySelector<HTMLButtonElement>('.about-you-delete-confirmation .button--danger')?.click(), 260));
    }
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  return null;
}

function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const detailKey = ["detail", "stale", "editor", "conflict", "delete-confirmation", "delete-waiting", "delete-rejected", "delete-expired", "delete-uncertain", "delete-settled", "delete-gone"].includes(fixture) ? "identity.preferred_name" : fixture === "read-only" ? readOnlyRecord.key : fixture === "exact-error" ? "missing.detail" : fixture === "restricted-access" ? "restricted.synthetic" : undefined;
  const destinationFixtures = new Set(["identity", "communication", "household", "preferences", "privacy", "sources"]);
  const route = detailKey ? `/life/about-you/facts/${detailKey}${fixture === "stale" ? "?version=2" : ""}` : fixture === "large" ? "/life/about-you/preferences" : fixture === "restore-conflict" ? "/life/about-you/sources" : destinationFixtures.has(fixture) ? `/life/about-you/${fixture}` : "/life/about-you";
  const page = <LifeLayout><LifeProfileWorkspace /></LifeLayout>;
  return <main className="about-you-specimen" id="main-content"><header className="about-you-specimen__controls"><div><strong>About You qualification</strong><span>Synthetic private facts · writes settle only inside this fixture · no provider or account access</span></div><KoraSelect label="About You fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><FixtureAutomation /><Routes><Route path="/life/about-you" element={page} /><Route path="/life/about-you/facts/:factKey" element={page} /><Route path="/life/about-you/:profileKey" element={page} /></Routes></ViewBarProvider></QueryClientProvider></MemoryRouter></main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
