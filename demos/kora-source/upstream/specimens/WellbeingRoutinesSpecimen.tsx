import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-today.css";
import "../features/life/wellbeing-routines.css";
import "./wellbeing-routines-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WellbeingRoutinesWorkspace } from "../features/life/WellbeingRoutinesWorkspace";
import type { WellbeingTodayLoaders } from "../features/life/WellbeingTodayWorkspace";
import type {
  WellbeingDeletionOutcome,
  WellbeingRecord,
  WellbeingRecordChanges,
  WellbeingRecordDraft,
  WellbeingRecordPage,
  WellbeingSourceCoverage,
} from "../lib/runtime";
import { RuntimeRequestError } from "../lib/runtime";

const fixtures = [
  "populated",
  "empty",
  "none-due",
  "completed",
  "skipped",
  "paused",
  "archived",
  "provider-gap",
  "saved-only",
  "not-configured",
  "loading",
  "section-error",
  "read-error",
  "many-history",
  "large-history",
  "next-page-error",
  "long-copy",
  "note-required",
  "editor",
  "validation",
  "edit-conflict",
  "detail",
  "detail-missing",
  "detail-wrong-kind",
  "deletion-waiting",
  "deletion-rejected",
  "deletion-transient",
  "deletion-settled",
  "deletion-gone",
  "restored",
  "restricted",
] as const;
type Fixture = (typeof fixtures)[number];
const requested = new URLSearchParams(window.location.search).get(
  "fixture",
) as Fixture | null;
const fixture: Fixture =
  requested && fixtures.includes(requested) ? requested : "populated";
const now = new Date("2026-08-29T15:00:00.000Z"),
  today = "2026-08-29";

function record(
  input: Partial<WellbeingRecord> &
    Pick<WellbeingRecord, "id" | "kind" | "title" | "payload" | "recordedAt">,
): WellbeingRecord {
  return {
    privacy: "private",
    source: { kind: "manual", label: "You" },
    state: "active",
    version: 1,
    createdAt: input.recordedAt,
    updatedAt: "2026-08-29T14:30:00.000Z",
    ...input,
  } as WellbeingRecord;
}
const definitions: WellbeingRecord[] = [
  record({
    id: "walk",
    kind: "routine",
    title: "Morning walk",
    payload: {
      name: "Morning walk",
      cadence: "Daily",
      cue: "After breakfast",
      reason: "Start the day outside",
      enabled: true,
      preferredWindow: "morning",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      completionChoices: ["done", "skipped"],
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  }),
  record({
    id: "meditation",
    kind: "routine",
    title: "Five quiet minutes",
    payload: {
      name: "Five quiet minutes",
      cadence: "Daily",
      cue: "Before the afternoon reset",
      enabled: true,
      preferredWindow: "afternoon",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      completionChoices: ["done", "skipped"],
      carePlanId: "care-plan",
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  }),
  record({
    id: "reflection",
    kind: "routine",
    title: "Evening reflection",
    payload: {
      name: "Evening reflection",
      cadence: "Daily",
      cue: "Before winding down",
      enabled: true,
      preferredWindow: "evening",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      completionChoices: ["done"],
      noteRequired: true,
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  }),
  record({
    id: "sunday",
    kind: "routine",
    title: "Sunday planning",
    payload: {
      name: "Sunday planning",
      cadence: "Sundays",
      enabled: true,
      preferredWindow: "afternoon",
      daysOfWeek: [0],
      completionChoices: ["done", "skipped"],
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  }),
  record({
    id: "paused",
    kind: "routine",
    title: "Paused mobility break",
    payload: {
      name: "Paused mobility break",
      cadence: "Weekdays",
      enabled: false,
      preferredWindow: "afternoon",
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  }),
];
const carePlan = record({
  id: "care-plan",
  kind: "medication_plan",
  title: "Recorded care plan",
  payload: {
    medication: "Recorded medication",
    instructions: "As recorded by the owner",
    active: true,
  },
  recordedAt: "2026-08-01T12:00:00.000Z",
});
const prior = [
  record({
    id: "walk-1",
    kind: "routine_checkin",
    title: "Morning walk",
    payload: { name: "Morning walk", routineId: "walk", status: "done" },
    recordedAt: "2026-08-28T13:15:00.000Z",
  }),
  record({
    id: "walk-2",
    kind: "routine_checkin",
    title: "Morning walk",
    payload: {
      name: "Morning walk",
      routineId: "walk",
      status: "skipped",
      notes: "Rain changed the plan.",
    },
    recordedAt: "2026-08-27T13:15:00.000Z",
  }),
  record({
    id: "quiet-1",
    kind: "routine_checkin",
    title: "Five quiet minutes",
    payload: {
      name: "Five quiet minutes",
      routineId: "meditation",
      status: "done",
    },
    recordedAt: "2026-08-28T19:10:00.000Z",
  }),
];
const completed = record({
  id: "walk-today",
  kind: "routine_checkin",
  title: "Morning walk",
  payload: { name: "Morning walk", routineId: "walk", status: "done" },
  recordedAt: `${today}T13:30:00.000Z`,
});
const skipped = record({
  id: "walk-today",
  kind: "routine_checkin",
  title: "Morning walk",
  payload: {
    name: "Morning walk",
    routineId: "walk",
    status: "skipped",
    notes: "Chose a quiet morning.",
  },
  recordedAt: `${today}T13:30:00.000Z`,
});
const archived = record({
  id: "archived",
  kind: "routine",
  title: "Archived evening tea",
  payload: {
    name: "Archived evening tea",
    cadence: "Daily",
    enabled: false,
    preferredWindow: "evening",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  state: "archived",
  archivedAt: "2026-08-20T12:00:00.000Z",
  recordedAt: "2026-08-01T12:00:00.000Z",
});
const restored = record({
  id: "restored",
  kind: "routine",
  title: "Restored breathing pause",
  payload: {
    name: "Restored breathing pause",
    cadence: "Daily",
    enabled: false,
    preferredWindow: "anytime",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  recordedAt: "2026-08-01T12:00:00.000Z",
});
const restricted = record({
  id: "restricted-routine",
  kind: "routine",
  title: "Synthetic restricted routine",
  payload: {
    name: "Synthetic restricted routine",
    cadence: "Daily",
    enabled: true,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  privacy: "restricted",
  recordedAt: "2026-08-01T12:00:00.000Z",
});
const many = Array.from({ length: fixture === "large-history" ? 520 : 124 }, (_, index) =>
  record({
    id: `history-${index}`,
    kind: "routine_checkin",
    title: "Morning walk",
    payload: {
      name: "Morning walk",
      routineId: "walk",
      status: index % 5 === 0 ? "skipped" : "done",
    },
    recordedAt: new Date(
      now.getTime() - (index + 1) * 16 * 60 * 60_000,
    ).toISOString(),
  }),
);
const long = record({
  id: "long",
  kind: "routine",
  title:
    "A deliberately long owner-authored routine name that must remain readable without pushing response actions beyond the working canvas",
  payload: {
    name: "A deliberately long owner-authored routine name that must remain readable without pushing response actions beyond the working canvas",
    cadence: "Every weekday after the first long block of focused work",
    cue: "When the current task reaches a natural stopping point",
    reason: "A synthetic long-copy fixture for responsive qualification",
    enabled: true,
    preferredWindow: "afternoon",
    daysOfWeek: [1, 2, 3, 4, 5],
    completionChoices: ["done", "skipped"],
    noteRequired: true,
  },
  recordedAt: "2026-08-01T12:00:00.000Z",
  source: { kind: "agent", label: "Kora · confirmed with you" },
});

let records: WellbeingRecord[] =
  fixture === "empty"
    ? [carePlan]
    : fixture === "none-due"
      ? [definitions[3], carePlan]
      : fixture === "paused"
        ? [definitions[4], carePlan]
        : fixture === "archived"
          ? [archived, carePlan]
          : fixture === "restored"
            ? [restored, carePlan]
            : fixture === "completed"
              ? [...definitions, carePlan, ...prior, completed]
              : fixture === "skipped"
                ? [...definitions, carePlan, ...prior, skipped]
                : fixture === "many-history" || fixture === "large-history" || fixture === "next-page-error"
                  ? [...definitions, carePlan, ...many]
                  : fixture === "long-copy"
                    ? [long, carePlan]
                    : fixture === "note-required"
                      ? [definitions[2], carePlan]
                      : fixture === "restricted"
                        ? [...definitions, carePlan, ...prior, restricted]
                        : [...definitions, carePlan, ...prior];
function ordinary() {
  return records.filter((item) => item.privacy !== "restricted");
}
function inRange(item: WellbeingRecord, start?: string, end?: string) {
  return (
    (!start || item.recordedAt >= start) && (!end || item.recordedAt < end)
  );
}
function page(
  items: WellbeingRecord[],
  complete = true,
  cursor?: string,
): WellbeingRecordPage {
  return {
    items,
    complete,
    restrictedOmitted: records.some((item) => item.privacy === "restricted"),
    ...(cursor ? { cursor } : {}),
  };
}
function coverage(): WellbeingSourceCoverage {
  if (fixture === "provider-gap")
    return {
      state: "partial",
      local: { state: "current", visibleRecordCount: ordinary().length },
      external: [
        {
          id: "provider:routines",
          kind: "provider",
          label: "Synthetic routine source",
          state: "unavailable",
          visibleRecordCount: 0,
          lastRecordedAt: "2026-08-28T12:00:00.000Z",
          limitation: "Synthetic routine source read is unavailable.",
          recoveryOwner: "Wellbeing · Sources",
        },
      ],
      complete: true,
    };
  if (fixture === "saved-only" || fixture === "not-configured")
    return {
      state: "saved_external_records",
      local: { state: "current", visibleRecordCount: ordinary().length },
      external: [{
        id: "provider:routines",
        kind: "provider",
        label: "Synthetic routine source",
        state: fixture === "saved-only" ? "saved_only" : "not_configured",
        visibleRecordCount: prior.length,
        limitation: fixture === "saved-only" ? "Saved records remain visible; current coverage is not asserted." : "No provider is configured.",
        recoveryOwner: "Wellbeing · Sources",
      }],
      complete: true,
    };
  return {
    state: "local_only",
    local: { state: "current", visibleRecordCount: ordinary().length },
    external: [],
    complete: true,
  };
}
function loaders(): WellbeingTodayLoaders {
  let deletionApproved = false;
  let deletionAttempt = 0;
  return {
    sources: async () => coverage(),
    list: async (input) => {
      if (
        fixture === "loading" &&
        input.kinds?.includes("routine") &&
        input.state !== "archived"
      )
        return new Promise<WellbeingRecordPage>(() => undefined);
      if (fixture === "section-error" && input.state === "archived")
        throw new Error("Synthetic archived routine read failure");
      if (fixture === "read-error")
        throw new Error("Synthetic local Routines read failure");
      const items = ordinary()
        .filter(
          (item) =>
            item.state === (input.state ?? "active") &&
            inRange(item, input.start, input.end) &&
            (!input.kinds?.length || input.kinds.includes(item.kind)) &&
            (item.kind !== "routine" ||
              !input.routineSchedule ||
              (input.routineSchedule === "due") ===
                Boolean(
                  ((item.payload as { enabled?: boolean; daysOfWeek?: number[] }).enabled &&
                    (item.payload as { daysOfWeek?: number[] }).daysOfWeek?.includes(
                      input.routineDay ?? -1,
                    )) ||
                    ordinary().some(
                      (candidate) =>
                        candidate.kind === "routine_checkin" &&
                        candidate.privacy === "private" &&
                        (candidate.payload as { routineId?: string }).routineId === item.id &&
                        inRange(candidate, input.routineDayStart, input.routineDayEnd),
                    ),
                )),
        )
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      if (
        (fixture === "many-history" || fixture === "large-history" || fixture === "next-page-error") &&
        input.kinds?.includes("routine_checkin") &&
        !input.cursor
      )
        return page(items.slice(0, 100), false, "history-2");
      if (fixture === "next-page-error" && input.cursor === "history-2")
        throw new Error("Synthetic earlier-history page failure");
      if ((fixture === "many-history" || fixture === "large-history") && input.cursor === "history-2")
        return page(items.slice(100));
      return { ...page(items), visibleTotal: items.length };
    },
    read: async (id) => {
      const item = ordinary().find((candidate) => candidate.id === id);
      if (!item) throw new Error("Synthetic record not found");
      return { record: item };
    },
    create: async (draft: WellbeingRecordDraft) => {
      const next = record({
        ...draft,
        id: `created-${records.length + 1}`,
      } as WellbeingRecord);
      records = [...records, next];
      return { record: next, replayed: false };
    },
    update: async (
      id: string,
      version: number,
      changes: WellbeingRecordChanges,
    ) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== version)
        throw new Error("Synthetic routine conflict");
      if (fixture === "edit-conflict") {
        const latest = {
          ...current,
          title: "Morning walk · latest saved",
          version: current.version + 1,
          privacy: "restricted" as const,
          payload: {
            ...(current.payload as WellbeingRecord["payload"]),
            cadence: "Weekdays",
            preferredWindow: "evening",
            cue: "After dinner",
            reason: "Latest saved context",
            daysOfWeek: [1, 2, 3, 4, 5],
            completionChoices: ["done"],
            noteRequired: true,
            carePlanId: "care-plan",
            enabled: false,
          },
        } as WellbeingRecord;
        records = records.map((item) => (item.id === id ? latest : item));
        throw new RuntimeRequestError("A newer routine version is available.", {
          code: "conflict",
          status: 409,
        });
      }
      const next = {
        ...current,
        ...changes,
        version: version + 1,
        updatedAt: now.toISOString(),
      } as WellbeingRecord;
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    archive: async (id, version) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== version)
        throw new Error("Synthetic archive conflict");
      const next = {
        ...current,
        state: "archived" as const,
        archivedAt: now.toISOString(),
        version: version + 1,
      };
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    restore: async (id, version) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== version)
        throw new Error("Synthetic restore conflict");
      const next = {
        ...current,
        state: "active" as const,
        archivedAt: undefined,
        version: version + 1,
        payload: { ...(current.payload as object), enabled: false },
      } as WellbeingRecord;
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    delete: async (
      id,
      _version,
      requestKey,
    ): Promise<WellbeingDeletionOutcome> => {
      deletionAttempt += 1;
      if (fixture === "deletion-gone")
        return {
          status: "gone",
          surface: "wellbeing_record",
          id,
          replayed: false,
        };
      if (fixture === "deletion-rejected")
        return {
          status: "rejected",
          message: "Deletion was rejected. The routine remains unchanged.",
          replayed: false,
        };
      if (fixture === "deletion-transient" && deletionAttempt === 1)
        return {
          status: "uncertain",
          requestKey,
          message: "The connection was interrupted. The deletion outcome is unknown; retry the same request.",
          retryable: true,
        };
      if (!deletionApproved)
        return {
          status: "waiting_confirmation",
          confirmations: [
            {
              confirmationId: "synthetic-routine-delete",
              expiresAt: "2026-08-29T16:00:00.000Z",
              purpose: "exact_deletion",
            },
          ],
          consequence: "Permanently delete this exact synthetic routine.",
          replayed: false,
        };
      return {
        status: "settled",
        deletion: {
          surface: "wellbeing_record",
          id,
          deleted: true,
          negativeRead: true,
          erased: ["wellbeing_record"],
          independentSources: [],
        },
        replayed: false,
      };
    },
    approve: async () => {
      deletionApproved = true;
    },
    reject: async () => {
      deletionApproved = false;
    },
  };
}
function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}
function Specimen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const route =
    fixture === "editor" || fixture === "validation"
      ? "/life/wellbeing/routines?new=1"
      : fixture === "edit-conflict"
        ? "/life/wellbeing/routines?record=walk&edit=1"
        : fixture === "detail-missing"
          ? "/life/wellbeing/routines?record=missing"
          : fixture === "detail-wrong-kind"
            ? "/life/wellbeing/routines?record=care-plan&edit=1"
          : fixture === "detail" ||
              fixture === "deletion-waiting" ||
              fixture === "deletion-rejected" ||
              fixture === "deletion-transient" ||
              fixture === "deletion-settled" ||
              fixture === "deletion-gone"
            ? "/life/wellbeing/routines?record=walk"
            : "/life/wellbeing/routines";
  return (
    <main className="wellbeing-routines-specimen" id="main-content">
      <header className="wellbeing-routines-specimen__controls">
        <div>
          <strong>Wellbeing Routines qualification</strong>
          <span>
            Synthetic private routine state · no account or provider access
          </span>
        </div>
        <KoraSelect
          label="Routines fixture"
          value={fixture}
          options={fixtures.map((value) => ({
            value,
            label: value.replaceAll("-", " "),
          }))}
          onValueChange={choose}
        />
      </header>
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={client}>
          <ViewBarProvider>
            <ViewBar />
            <WellbeingRoutinesWorkspace loaders={loaders()} initialNow={now} />
          </ViewBarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Specimen />);
