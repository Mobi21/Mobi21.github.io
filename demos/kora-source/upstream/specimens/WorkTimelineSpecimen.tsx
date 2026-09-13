import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/work/work.css";
import "../features/work/work-timeline.css";
import "./work-timeline-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import {
  WorkTimelineWorkspace,
  type TimelineServices,
} from "../features/work/WorkTimelineWorkspace";
import {
  RuntimeRequestError,
  type Goal,
  type GoalListEntry,
  type WorkItem,
  type WorkItemListEntry,
} from "../lib/runtime";
import { WORK_TIMELINE_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_TIMELINE_FIXTURES;
type Fixture = (typeof fixtures)[number];
const search = new URLSearchParams(window.location.search);
const requested = search.get("fixture") as Fixture | null;
const fixture: Fixture =
  requested && fixtures.includes(requested) ? requested : "populated";
const now = "2026-08-29T14:00:00.000Z";

const makeGoal = (
  id: string,
  title: string,
  plannedStart?: string,
  targetDate?: string,
  overrides: Partial<Goal> = {},
): Goal => ({
  id,
  title,
  area: "Personal",
  purposeMarkdown:
    "Synthetic planning context for localhost qualification only.",
  shape: "finish",
  lifecycle: "active",
  priority: 3,
  plannedStart,
  targetDate,
  sensitivity: "private",
  provenance: "synthetic_qualification",
  version: 4,
  createdAt: "2026-07-01T12:00:00.000Z",
  updatedAt: now,
  ...overrides,
});
const portfolio = makeGoal(
  "portfolio",
  "Publish the portfolio refresh",
  "2026-08-18",
  "2026-09-18",
  { area: "Career" },
);
const coast = makeGoal(
  "coast",
  "Plan the September coastal trip",
  "2026-08-24",
  "2026-09-12",
);
const spanning = makeGoal(
  "spanning",
  "Build a calm autumn household rhythm",
  "2026-01-01",
  "2026-12-31",
  { area: "Home" },
);
const makeItem = (
  id: string,
  title: string,
  kind: WorkItem["kind"],
  dueAt: string | undefined,
  goal?: Goal,
  overrides: Partial<WorkItem> = {},
): WorkItemListEntry => ({
  item: {
    id,
    goalId: goal?.id,
    kind,
    title,
    area: goal?.area,
    descriptionMarkdown:
      "Synthetic dated Work used only for visual qualification.",
    state: "active",
    priority: 3,
    dueAt,
    provenance: "synthetic_qualification",
    version: 2,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: now,
    ...overrides,
  },
  goal: goal
    ? {
        id: goal.id,
        title: goal.title,
        area: goal.area,
        shape: goal.shape,
        lifecycle: goal.lifecycle,
        priority: goal.priority,
        plannedStart: goal.plannedStart,
        targetDate: goal.targetDate,
        version: goal.version,
        updatedAt: goal.updatedAt,
      }
    : undefined,
  inUserAttention: false,
});
const ordinaryItems = [
  makeItem(
    "case-study",
    "Rewrite the case study around measured outcomes",
    "task",
    "2026-08-30T23:59:59.000Z",
    portfolio,
  ),
  makeItem(
    "review",
    "Editorial review complete",
    "milestone",
    "2026-09-04T12:00:00.000Z",
    portfolio,
  ),
  makeItem(
    "departure",
    "Confirm the Friday departure window",
    "commitment",
    "2026-09-02T12:00:00.000Z",
    coast,
  ),
  makeItem(
    "arrival",
    "Arrive at the coast rested and prepared",
    "outcome",
    "2026-09-12T12:00:00.000Z",
    coast,
  ),
];
const longGoal = makeGoal(
  "long",
  "Create a calm household operating rhythm that survives travel, appointments, busy weeks, shared responsibilities, and ordinary unpredictability",
  "2026-08-20",
  "2026-10-18",
);
const largeGoals = Array.from({ length: 50 }, (_, index) =>
  makeGoal(
    `goal-${index}`,
    `Personal outcome ${index + 1}`,
    `2026-08-${String((index % 12) + 14).padStart(2, "0")}`,
    `2026-09-${String((index % 24) + 1).padStart(2, "0")}`,
  ),
);
const largeItems = Array.from({ length: 160 }, (_, index) =>
  makeItem(
    `item-${index}`,
    `Concrete next step ${index + 1}`,
    index % 7 === 0 ? "milestone" : "task",
    `2026-09-${String((index % 24) + 1).padStart(2, "0")}T12:00:00.000Z`,
    largeGoals[index % largeGoals.length],
  ),
);

let goalRecords =
  fixture === "spanning-range"
    ? [spanning]
    : fixture === "single-date-goals"
      ? [
          makeGoal("start-only", "Start-only Goal", "2026-08-26"),
          makeGoal("target-only", "Target-only Goal", undefined, "2026-09-08"),
        ]
      : fixture === "long-copy"
        ? [longGoal]
        : fixture === "terminal"
          ? [makeGoal("completed-goal", "Publish the neighborhood history zine", "2026-08-16", "2026-08-27", { lifecycle: "achieved", achievedAt: now, resultMarkdown: "Printed and shared the first edition." })]
        : fixture === "large"
          ? largeGoals
          : [portfolio, coast];
let itemRecords =
  fixture === "sparse"
    ? [ordinaryItems[0]]
    : fixture === "unscheduled-mix"
      ? [
          ordinaryItems[0],
          makeItem(
            "undated",
            "Choose the next recipe to practice",
            "task",
            undefined,
          ),
        ]
      : fixture === "long-copy"
        ? [
            makeItem(
              "long-item",
              "Compare every practical constraint before choosing the smallest realistic next move",
              "task",
              "2026-09-03T12:00:00.000Z",
              longGoal,
            ),
          ]
        : fixture === "terminal"
          ? [makeItem("archived-task", "Retire the superseded interview checklist", "task", "2026-08-28T12:00:00.000Z", goalRecords[0], { state: "archived", archivedAt: now })]
        : fixture === "large"
          ? largeItems
          : ordinaryItems;
let goalReads = 0;
let itemReads = 0;
const page = <T,>(records: T[], cursor?: string, limit = 50) => {
  const offset = cursor ? Number(cursor) : 0;
  const items = records.slice(offset, offset + limit);
  const next = offset + items.length;
  return {
    items,
    cursor: next < records.length ? String(next) : undefined,
    complete: next >= records.length,  };
};

const services: TimelineServices = {
  goalsPage: async (input = {}) => {
    goalReads += 1;
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. Dated Work could not be read; no records were changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable")
      throw new Error("Synthetic Native Work read failure.");
    if (fixture === "stale" && goalReads > 1) throw new Error("Synthetic Goal refresh failure.");
    if (fixture === "retry-success" && goalReads === 1)
      throw new Error("Synthetic first read failure.");
    if (fixture === "partial-goals")
      throw new Error("Synthetic Goal collection failure.");
    if (fixture === "true-empty")
      return { items: [], complete: true };
    const result = page(
      goalRecords.map((goal): GoalListEntry => ({
        goal,
        visibleOpenWorkItemCount: itemRecords.filter(
          (entry) => entry.item.goalId === goal.id,
        ).length,
        inUserAttention: false,
      })),
      input.cursor,
      fixture === "pagination" || fixture === "next-page-error"
        ? 1
        : input.limit,
    );
    if (fixture === "next-page-error" && input.cursor)
      throw new Error("Synthetic next page failure.");
    return result;
  },
  workItems: async (input = {}) => {
    itemReads += 1;
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. Dated Work could not be read; no records were changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable")
      throw new Error("Synthetic Native Work read failure.");
    if (fixture === "stale" && itemReads > 1) throw new Error("Synthetic Work-item refresh failure.");
    if (fixture === "retry-success" && itemReads === 1)
      throw new Error("Synthetic first read failure.");
    if (fixture === "partial-items")
      throw new Error("Synthetic Work item collection failure.");
    if (fixture === "true-empty")
      return { items: [], complete: true };
    const result = page(
      itemRecords,
      input.cursor,
      fixture === "pagination" || fixture === "next-page-error"
        ? 1
        : input.limit,
    );
    if (fixture === "next-page-error" && input.cursor)
      throw new Error("Synthetic next page failure.");
    return result;
  },
  updateGoal: async (id, version, changes) => {
    if (fixture === "date-conflict")
      throw new RuntimeRequestError("Synthetic version conflict.", {
        code: "work_conflict",
        status: 409,
      });
    if (fixture === "date-save-error")
      throw new Error(
        "Synthetic save failure; existing dates remain unchanged.",
      );
    const found = goalRecords.find((record) => record.id === id)!;
    const record = {
      ...found,
      plannedStart:
        changes.plannedStart === null
          ? undefined
          : (changes.plannedStart ?? found.plannedStart),
      targetDate:
        changes.targetDate === null
          ? undefined
          : (changes.targetDate ?? found.targetDate),
      version: version + 1,
    };
    goalRecords = goalRecords.map((entry) =>
      entry.id === id ? record : entry,
    );
    return { status: "settled", record, replayed: false };
  },
  updateWorkItem: async (id, version, changes) => {
    if (fixture === "date-conflict")
      throw new RuntimeRequestError("Synthetic version conflict.", {
        code: "work_conflict",
        status: 409,
      });
    if (fixture === "date-save-error")
      throw new Error(
        "Synthetic save failure; existing dates remain unchanged.",
      );
    const found = itemRecords.find((entry) => entry.item.id === id)!;
    const record = {
      ...found.item,
      dueAt:
        changes.dueAt === null
          ? undefined
          : (changes.dueAt ?? found.item.dueAt),
      version: version + 1,
    };
    itemRecords = itemRecords.map((entry) =>
      entry.item.id === id ? { ...entry, item: record } : entry,
    );
    return { status: "settled", record, replayed: false };
  },
};

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const route =
  fixture === "range-empty"
    ? "/work/timeline?date=2027-06-01"
    : "/work/timeline?date=2026-08-29";
function Specimen() {
  return (
    <main className="work-timeline-specimen" id="main-content">
      <header className="work-timeline-specimen__controls">
        <div>
          <strong>Work Timeline qualification</strong>
          <span>
            Synthetic local Work states · no provider or product mutation
          </span>
        </div>
        <KoraSelect
          label="Timeline fixture"
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
            <WorkTimelineWorkspace
              services={services}
              now={() => new Date("2026-08-29T14:00:00.000Z")}
              requestKey={fixture}
              onAskKora={
                fixture === "kora-review" ? () => undefined : undefined
              }
            />
          </ViewBarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Specimen />);
if (fixture === "stale") window.setTimeout(() => void client.invalidateQueries({ queryKey: ["work", "timeline"] }), 500);
