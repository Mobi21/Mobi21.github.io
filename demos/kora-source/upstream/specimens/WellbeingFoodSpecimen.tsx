import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-today.css";
import "../features/life/wellbeing-food.css";
import "./wellbeing-food-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WellbeingFoodWorkspace } from "../features/life/WellbeingFoodWorkspace";
import type { WellbeingTodayLoaders } from "../features/life/WellbeingTodayWorkspace";
import type {
  WellbeingDeletionOutcome,
  WellbeingRecord,
  WellbeingRecordChanges,
  WellbeingRecordDraft,
  WellbeingRecordPage,
  WellbeingSourceCoverage,
} from "../lib/runtime";

const fixtures = [
  "loading",
  "populated",
  "empty",
  "not-configured",
  "provider-gap",
  "source-error",
  "permission-restricted",
  "restricted",
  "many",
  "next-page-error",
  "365-history",
  "long-copy",
  "read-error",
  "detail",
  "detail-error",
  "detail-missing",
  "detail-wrong-kind",
  "archived-detail",
  "proposed",
  "confirmed",
  "evidence-unavailable",
  "editor-meal",
  "editor-drink",
  "conflict",
  "archive-restore",
  "stale-delete",
  "delete-rejected",
  "delete-expired",
  "delete-uncertain",
  "delete-gone",
  "previous-day",
] as const;
type Fixture = (typeof fixtures)[number];
const requested = new URLSearchParams(window.location.search).get(
  "fixture",
) as Fixture | null;
const fixture: Fixture =
  requested && fixtures.includes(requested) ? requested : "populated";
const now = new Date("2026-08-29T15:00:00.000Z"),
  updatedAt = "2026-08-29T14:30:00.000Z";

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
    updatedAt,
    ...input,
  } as WellbeingRecord;
}

const core: WellbeingRecord[] = [
  record({
    id: "breakfast",
    kind: "meal",
    title: "Breakfast",
    payload: {
      description: "Oats with blueberries and almond butter.",
      foods: ["Oats", "blueberries", "almond butter"],
      mealType: "breakfast",
      notes: "A calm start before work.",
    },
    recordedAt: "2026-08-29T12:10:00.000Z",
  }),
  record({
    id: "coffee",
    kind: "drink",
    title: "Coffee",
    payload: { name: "Coffee", volumeMl: 300, notes: "With a little milk." },
    recordedAt: "2026-08-29T13:05:00.000Z",
  }),
  record({
    id: "lunch",
    kind: "meal",
    title: "Lunch at the park",
    payload: {
      description: "A tomato sandwich and peach at the park.",
      foods: ["Tomato sandwich", "peach"],
      tags: ["outdoors"],
      mealType: "lunch",
    },
    recordedAt: "2026-08-29T18:10:00.000Z",
    source: { kind: "agent", label: "Kora · confirmed with you" },
  }),
  record({
    id: "water",
    kind: "drink",
    title: "Water",
    payload: { name: "Water", volumeMl: 500 },
    recordedAt: "2026-08-29T23:10:00.000Z",
    source: { kind: "imported", label: "Bottle log" },
  }),
  record({
    id: "dinner",
    kind: "meal",
    title: "Dinner",
    payload: {
      description: "Mushroom pasta with a green salad.",
      foods: ["Mushroom pasta", "green salad"],
      mealType: "dinner",
    },
    recordedAt: "2026-08-30T00:35:00.000Z",
  }),
];
const previous: WellbeingRecord[] = [
  record({
    id: "previous-lunch",
    kind: "meal",
    title: "Soup and toast",
    payload: {
      description: "Tomato soup with sourdough toast.",
      foods: ["Tomato soup", "sourdough toast"],
      mealType: "lunch",
    },
    recordedAt: "2026-08-28T17:40:00.000Z",
  }),
];
const proposed = record({
  id: "proposed",
  kind: "meal",
  title: "Lunch from a photo",
  payload: {
    description: "Rice bowl with greens and roasted tofu.",
    interpretation: {
      state: "proposed",
      items: [
        { name: "Brown rice", portion: "about 1 cup" },
        { name: "Roasted tofu", portion: "one serving" },
        { name: "Mixed greens" },
      ],
      tags: ["lunch"],
      generatedAt: updatedAt,
    },
    evidence: {
      state: "available",
      label: "Lunch photo",
      artifactId: "synthetic-photo",
    },
  },
  recordedAt: "2026-08-29T18:25:00.000Z",
  source: { kind: "agent", label: "Kora · proposed from your photo" },
});
const confirmed = record({
  id: "confirmed",
  kind: "meal",
  title: "Confirmed lunch",
  payload: {
    description: "Rice bowl with greens and roasted tofu.",
    foods: ["Brown rice", "Roasted tofu", "Mixed greens"],
    interpretation: {
      state: "confirmed",
      items: [
        { name: "Brown rice", portion: "about 1 cup" },
        { name: "Roasted tofu", portion: "one serving" },
        { name: "Mixed greens" },
      ],
    },
    evidence: {
      state: "available",
      label: "Lunch photo",
      artifactId: "synthetic-photo",
    },
  },
  recordedAt: "2026-08-29T18:25:00.000Z",
  source: { kind: "agent", label: "Kora · confirmed with you" },
});
const evidenceUnavailable = record({
  id: "evidence-unavailable",
  kind: "meal",
  title: "Imported dinner",
  payload: {
    description: "Dinner remembered from an unavailable receipt image.",
    foods: ["Pasta", "salad"],
    evidence: { state: "unavailable", label: "Original receipt image" },
  },
  recordedAt: "2026-08-29T23:20:00.000Z",
  source: { kind: "imported", label: "Saved import" },
});
const wrongKind = record({
  id: "routine-record",
  kind: "routine",
  title: "Evening walk",
  payload: { name: "Evening walk", cadence: "daily", enabled: true },
  recordedAt: "2026-08-29T21:00:00.000Z",
});
const archivedBreakfast = {
  ...core[0],
  id: "archived-breakfast",
  state: "archived" as const,
  version: 2,
  archivedAt: "2026-08-29T14:45:00.000Z",
} as WellbeingRecord;
const many = Array.from({ length: 124 }, (_, index) =>
  record({
    id: `food-${index + 1}`,
    kind: index % 3 === 0 ? "drink" : "meal",
    title:
      index % 3 === 0 ? `Drink entry ${index + 1}` : `Meal note ${index + 1}`,
    payload:
      index % 3 === 0
        ? { name: "Water", volumeMl: 250 }
        : {
            description: `Synthetic meal description ${index + 1}.`,
            foods: [`Synthetic item ${index + 1}`],
            mealType: index % 2 ? "snack" : "lunch",
          },
    recordedAt: new Date(
      Date.parse("2026-08-29T04:05:00.000Z") + index * 8 * 60_000,
    ).toISOString(),
  }),
) as WellbeingRecord[];

let records =
  fixture === "empty" ||
  fixture === "not-configured" ||
  fixture === "permission-restricted"
    ? []
    : fixture === "many"
      ? many
      : fixture === "next-page-error"
        ? many
      : fixture === "365-history"
        ? [
            ...many,
            ...Array.from({ length: 365 }, (_, index) =>
              record({
                id: `history-${index + 1}`,
                kind: index % 5 === 0 ? "drink" : "meal",
                title: `History entry ${index + 1}`,
                payload:
                  index % 5 === 0
                    ? { name: "Water" }
                    : {
                        description: `Synthetic historical meal ${index + 1}.`,
                      },
                recordedAt: new Date(
                  Date.parse("2026-08-28T18:00:00.000Z") - index * 86_400_000,
                ).toISOString(),
              }),
            ),
          ]
        : fixture === "proposed"
          ? [proposed]
          : fixture === "confirmed"
            ? [confirmed]
            : fixture === "evidence-unavailable"
              ? [evidenceUnavailable]
              : fixture === "long-copy"
                ? [
                    record({
                      id: "long",
                      kind: "meal",
                      title:
                        "A deliberately long meal title that should wrap gracefully without forcing the chronology beyond the working canvas",
                      payload: {
                        description:
                          "A long natural-language description of a shared dinner with roasted vegetables, rice, beans, and several remembered details.",
                        foods: ["Roasted vegetables", "rice", "beans"],
                        mealType: "dinner",
                        notes:
                          "Synthetic long copy for responsive qualification.",
                      },
                      recordedAt: "2026-08-29T22:20:00.000Z",
                      source: {
                        kind: "agent",
                        label:
                          "Kora · confirmed with you after reviewing the original description",
                      },
                    }),
                  ]
                : fixture === "detail-wrong-kind"
                  ? [...core, wrongKind]
                  : fixture === "archived-detail"
                    ? [...core, archivedBreakfast]
                    : [...core, ...previous];
let deleteAttempt = 0;

function page(
  items: WellbeingRecord[],
  restrictedOmitted = false,
  complete = true,
  cursor?: string,
): WellbeingRecordPage {
  return { items, complete, restrictedOmitted, ...(cursor ? { cursor } : {}) };
}
function inRange(item: WellbeingRecord, start?: string, end?: string) {
  return (
    (!start || item.recordedAt >= start) && (!end || item.recordedAt < end)
  );
}

function coverage(): WellbeingSourceCoverage {
  const visible = records.filter((item) => item.state === "active"),
    local = visible.filter(
      (item) => item.source.kind === "manual" || item.source.kind === "agent",
    ),
    external = visible.filter(
      (item) =>
        item.source.kind === "provider" || item.source.kind === "imported",
    );
  if (fixture === "not-configured")
    return {
      state: "local_only",
      local: { state: "current", visibleRecordCount: 0 },
      external: [
        {
          id: "provider:not-configured",
          kind: "provider",
          label: "Food provider",
          state: "not_configured",
          visibleRecordCount: 0,
          limitation: "No Food account is configured.",
          recoveryOwner: "Settings · Accounts & integrations",
        },
      ],
      complete: true,
    };
  if (fixture === "permission-restricted")
    return {
      state: "partial",
      local: { state: "current", visibleRecordCount: 0 },
      external: [
        {
          id: "provider:restricted",
          kind: "provider",
          label: "Food provider",
          state: "permission_restricted",
          visibleRecordCount: 0,
          limitation:
            "The connected account does not grant Food read permission.",
          recoveryOwner: "Settings · Accounts & integrations",
        },
      ],
      complete: true,
    };
  if (fixture === "provider-gap")
    return {
      state: "partial",
      local: {
        state: "current",
        visibleRecordCount: local.length,
        lastRecordedAt: local.at(-1)?.recordedAt,
      },
      external: [
        {
          id: "provider:food",
          kind: "provider",
          label: "Synthetic food import",
          state: "unavailable",
          visibleRecordCount: external.length,
          limitation: "Synthetic provider read is unavailable.",
          recoveryOwner: "Wellbeing · Sources",
        },
      ],
      complete: true,
    };
  if (external.length)
    return {
      state: "saved_external_records",
      local: {
        state: "current",
        visibleRecordCount: local.length,
        lastRecordedAt: local.at(-1)?.recordedAt,
      },
      external: [
        {
          id: "imported:bottle",
          kind: "imported",
          label: "Bottle log",
          state: "saved_only",
          visibleRecordCount: external.length,
          lastRecordedAt: external.at(-1)?.recordedAt,
          limitation: "Saved import only.",
          recoveryOwner: "Wellbeing · Sources",
        },
      ],
      complete: true,
    };
  return {
    state: "local_only",
    local: {
      state: "current",
      visibleRecordCount: local.length,
      lastRecordedAt: local.at(-1)?.recordedAt,
    },
    external: [],
    complete: true,
  };
}

function loaders(): WellbeingTodayLoaders {
  return {
    sources: async () => {
      if (fixture === "source-error")
        throw new Error("Synthetic Food source coverage failure");
      return coverage();
    },
    list: async (input) => {
      if (fixture === "loading")
        return new Promise<WellbeingRecordPage>(() => undefined);
      if (fixture === "read-error")
        throw new Error("Synthetic local Food read failure");
      if (fixture === "next-page-error" && input.cursor)
        throw new Error("Synthetic earlier-page read failure");
      const items = records
        .filter(
          (item) =>
            item.state === (input.state ?? "active") &&
            inRange(item, input.start, input.end) &&
            (!input.kinds?.length || input.kinds.includes(item.kind)),
        )
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      if (
        ["many", "365-history", "next-page-error"].includes(fixture) &&
        !input.cursor &&
        items.length > 100
      )
        return page(items.slice(0, 100), false, false, "many-page-2");
      if (
        ["many", "365-history", "next-page-error"].includes(fixture) &&
        input.cursor === "many-page-2"
      )
        return page(items.slice(100));
      return page(items, fixture === "restricted");
    },
    read: async (id) => {
      if (fixture === "detail-error")
        throw new Error("Synthetic detail failure");
      if (fixture === "detail-missing")
        throw new Error("Synthetic exact Food record is gone");
      const item = records.find((candidate) => candidate.id === id);
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
      expectedVersion: number,
      changes: WellbeingRecordChanges,
    ) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== expectedVersion)
        throw new Error("Synthetic edit conflict");
      if (fixture === "conflict" && current.version === 1) {
        const latest = {
          ...current,
          title: `${current.title} · updated elsewhere`,
          version: 2,
          updatedAt: now.toISOString(),
        } as WellbeingRecord;
        records = records.map((item) => (item.id === id ? latest : item));
        throw new Error("Synthetic edit conflict: record changed elsewhere");
      }
      const next = {
        ...current,
        ...changes,
        version: current.version + 1,
        updatedAt: now.toISOString(),
      } as WellbeingRecord;
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    archive: async (id, expectedVersion) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== expectedVersion)
        throw new Error("Synthetic archive conflict");
      const next = {
        ...current,
        state: "archived" as const,
        archivedAt: now.toISOString(),
        version: current.version + 1,
        updatedAt: now.toISOString(),
      };
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    restore: async (id, expectedVersion) => {
      const current = records.find((item) => item.id === id);
      if (!current || current.version !== expectedVersion)
        throw new Error("Synthetic restore conflict");
      const next = {
        ...current,
        state: "active" as const,
        archivedAt: undefined,
        version: current.version + 1,
        updatedAt: now.toISOString(),
      };
      records = records.map((item) => (item.id === id ? next : item));
      return { record: next, replayed: false };
    },
    delete: async (
      id,
      _expectedVersion,
      _requestKey,
    ): Promise<WellbeingDeletionOutcome> => {
      if (deleteAttempt++ === 0)
        return {
          status: "waiting_confirmation",
          confirmations: [
            {
              confirmationId: "synthetic-delete",
              expiresAt: "2026-08-29T16:00:00.000Z",
              purpose: "exact_deletion",
            },
          ],
          consequence:
            "Permanently delete this exact local Wellbeing record. Independent provider or imported sources remain independent.",
          replayed: false,
        };
      if (fixture === "stale-delete")
        return {
          status: "stale",
          surface: "wellbeing_record",
          id,
          message: "The record changed; close and reopen it before deleting.",
          replayed: false,
        };
      if (fixture === "delete-rejected")
        return {
          status: "rejected",
          message: "Deletion was rejected. The record is unchanged.",
          replayed: false,
        };
      if (fixture === "delete-expired")
        return {
          status: "expired",
          message: "Deletion approval expired. The record is unchanged.",
          replayed: false,
        };
      if (fixture === "delete-uncertain")
        return {
          status: "uncertain",
          requestKey: "synthetic-delete",
          message:
            "Deletion settlement is uncertain. Retry with the same bound request.",
          retryable: true,
        };
      if (fixture === "delete-gone")
        return {
          status: "gone",
          surface: "wellbeing_record",
          id,
          replayed: false,
        };
      records = records.filter((item) => item.id !== id);
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
    approve: async () => ({}),
    reject: async () => ({}),
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
  const detailFixtures: Fixture[] = [
    "detail",
    "detail-error",
    "detail-missing",
    "detail-wrong-kind",
    "archived-detail",
    "conflict",
    "archive-restore",
    "stale-delete",
    "delete-rejected",
    "delete-expired",
    "delete-uncertain",
    "delete-gone",
  ];
  const exactRecord =
    fixture === "proposed"
      ? "proposed"
      : fixture === "confirmed"
        ? "confirmed"
        : fixture === "evidence-unavailable"
          ? "evidence-unavailable"
          : fixture === "detail-missing"
            ? "missing-food-record"
            : fixture === "detail-wrong-kind"
              ? "routine-record"
              : fixture === "archived-detail"
                ? "archived-breakfast"
          : "breakfast";
  const initialRoute =
    detailFixtures.includes(fixture) ||
    ["proposed", "confirmed", "evidence-unavailable"].includes(fixture)
      ? `/life/wellbeing/food?record=${exactRecord}`
      : fixture === "editor-meal"
        ? "/life/wellbeing/food?log=meal"
        : fixture === "editor-drink"
          ? "/life/wellbeing/food?log=drink"
          : fixture === "previous-day"
            ? "/life/wellbeing/food?date=2026-08-28"
            : fixture === "365-history"
              ? "/life/wellbeing/food?date=2025-08-29"
            : "/life/wellbeing/food";
  return (
    <main className="wellbeing-food-specimen" id="main-content">
      <header className="wellbeing-food-specimen__controls">
        <div>
          <strong>Wellbeing Food qualification</strong>
          <span>Synthetic private records · no account or provider access</span>
        </div>
        <KoraSelect
          label="Food fixture"
          value={fixture}
          options={fixtures.map((value) => ({
            value,
            label: value.replaceAll("-", " "),
          }))}
          onValueChange={choose}
        />
      </header>
      <MemoryRouter initialEntries={[initialRoute]}>
        <QueryClientProvider client={client}>
          <ViewBarProvider>
            <ViewBar />
            <WellbeingFoodWorkspace
              loaders={loaders()}
              initialNow={now}
              onAskKora={() => undefined}
            />
          </ViewBarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Specimen />);
