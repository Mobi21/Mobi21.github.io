import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/work/work.css";
import "../features/work/work-archive.css";
import "./work-archive-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import {
  WorkArchiveWorkspace,
  type ArchiveServices,
} from "../features/work/WorkArchiveWorkspace";
import {
  RuntimeRequestError,
  type Goal,
  type GoalListEntry,
  type WorkItem,
  type WorkItemListEntry,
} from "../lib/runtime";
import { WORK_ARCHIVE_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_ARCHIVE_FIXTURES;
type Fixture = (typeof fixtures)[number];
const search = new URLSearchParams(window.location.search);
const requested = search.get("fixture") as Fixture | null;
const fixture: Fixture =
  requested && fixtures.includes(requested) ? requested : "populated";
const now = "2026-08-29T14:00:00.000Z";
const makeGoal = (
  id: string,
  title: string,
  overrides: Partial<Goal> = {},
): Goal => ({
  id,
  title,
  area: "Personal",
  purposeMarkdown:
    "Synthetic archived context for localhost qualification only.",
  shape: "finish",
  lifecycle: "archived",
  priority: 2,
  sensitivity: "private",
  provenance: "synthetic_qualification",
  version: 7,
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-08-24T14:00:00.000Z",
  archivedAt: "2026-08-24T14:00:00.000Z",
  ...overrides,
});
const meals = makeGoal("meals", "Learn three reliable weeknight meals", {
  resultMarkdown: "Built a short rotation and kept the recipes.",
});
const balcony = makeGoal("balcony", "Refresh the balcony herb plan", {
  archivedAt: "2026-08-20T10:00:00.000Z",
  stopReason: "The available light changed after moving the shelf.",
});
const makeTask = (
  id: string,
  title: string,
  goal?: Goal,
  overrides: Partial<WorkItem> = {},
): WorkItemListEntry => ({
  item: {
    id,
    goalId: goal?.id,
    kind: "task",
    title,
    state: "archived",
    priority: 2,
    cancellationReason: "The plan changed after a useful first attempt.",
    provenance: "synthetic_qualification",
    version: 4,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-08-22T09:00:00.000Z",
    archivedAt: "2026-08-22T09:00:00.000Z",
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
        targetDate: goal.targetDate,
        version: goal.version,
        updatedAt: goal.updatedAt,
      }
    : undefined,
  inUserAttention: false,
});
const carbonara = makeTask(
  "carbonara",
  "Practice carbonara without cream",
  meals,
);
const receipts = makeTask(
  "receipts",
  "File the old appliance warranties and receipts",
);
const longGoal = makeGoal(
  "long",
  "Create a household reference that remains understandable after travel, busy weeks, unexpected appointments, shared decisions, and the ordinary passage of time",
);
const largeGoals = Array.from({ length: 80 }, (_, index) =>
  makeGoal(`goal-${index}`, `Archived personal outcome ${index + 1}`, {
    archivedAt: `2026-08-${String((index % 24) + 1).padStart(2, "0")}T12:00:00.000Z`,
  }),
);
const largeTasks = Array.from({ length: 120 }, (_, index) =>
  makeTask(
    `task-${index}`,
    `Archived next step ${index + 1}`,
    largeGoals[index % largeGoals.length],
  ),
);
let goalRecords =
  fixture === "long-copy"
    ? [longGoal]
    : fixture === "large"
      ? largeGoals
      : [meals, balcony];
let taskRecords =
  fixture === "long-copy"
    ? [
        makeTask(
          "long-task",
          "Reconcile every useful note before deciding what still deserves a place in active Work",
          longGoal,
        ),
      ]
    : fixture === "large"
      ? largeTasks
      : [carbonara, receipts];
let goalReads = 0;
let taskReads = 0;
const slice = <T,>(records: T[], cursor?: string, limit = 50) => {
  const offset = cursor ? Number(cursor) : 0;
  const items = records.slice(offset, offset + limit);
  const next = offset + items.length;
  return {
    items,
    cursor: next < records.length ? String(next) : undefined,
    complete: next >= records.length,  };
};
const services: ArchiveServices = {
  goalsPage: async (input = {}) => {
    goalReads += 1;
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. Archived Goals could not be read; nothing was restored or removed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable" || fixture === "partial-goals")
      throw new Error("Synthetic archived Goal read failure.");
    if (fixture === "stale" && goalReads > 1) throw new Error("Synthetic archived Goal refresh failure.");
    if (fixture === "retry-success" && goalReads === 1)
      throw new Error("Synthetic first read failure.");
    if (["true-empty", "tasks-only"].includes(fixture))
      return { items: [], complete: true };
    if (fixture === "filtered-empty" && input.query)
      return { items: [], complete: true };
    if (fixture === "pagination-before-first-archive" && !input.cursor)
      return {
        items: [
          {
            goal: makeGoal("finished", "Finished but not archived", {
              lifecycle: "achieved",
              archivedAt: undefined,
            }),
            visibleOpenWorkItemCount: 0,
            inUserAttention: false,
          },
        ],
        cursor: "1",
        complete: false,      };
    if (fixture === "next-page-error" && input.cursor)
      throw new Error("Synthetic next-page failure.");
    const records: GoalListEntry[] = goalRecords.map((goal) => ({
      goal,
      visibleOpenWorkItemCount: 0,
      inUserAttention: false,
    }));
    const result = slice(
      records,
      input.cursor,
      fixture === "pagination-before-first-archive" ||
        fixture === "next-page-error"
        ? 1
        : input.limit,
    );
    return result;
  },
  workItems: async (input = {}) => {
    taskReads += 1;
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. Archived Tasks could not be read; nothing was restored or removed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable" || fixture === "partial-tasks")
      throw new Error("Synthetic archived Task read failure.");
    if (fixture === "stale" && taskReads > 1) throw new Error("Synthetic archived Task refresh failure.");
    if (fixture === "retry-success" && taskReads === 1)
      throw new Error("Synthetic first read failure.");
    if (["true-empty", "goals-only"].includes(fixture))
      return { items: [], complete: true };
    if (fixture === "filtered-empty" && input.query)
      return { items: [], complete: true };
    if (fixture === "unqualified-active-result")
      return {
        items: [
          makeTask(
            "active",
            "Active Work must not appear archived",
            undefined,
            { state: "active", archivedAt: undefined },
          ),
        ],
        complete: true,      };
    if (fixture === "next-page-error" && input.cursor)
      throw new Error("Synthetic next-page failure.");
    const result = slice(
      taskRecords,
      input.cursor,
      fixture === "next-page-error" ? 1 : input.limit,
    );
    return result;
  },
  resumeGoal: async (id, version, destination) => {
    if (fixture === "restore-conflict")
      throw new RuntimeRequestError("Synthetic version conflict.", {
        code: "work_conflict",
        status: 409,
      });
    if (fixture === "restore-error")
      throw new Error("Synthetic restore failure; archived Work is unchanged.");
    if (fixture === "restore-record-gone")
      throw new Error("This archived Goal is no longer available.");
    const found = goalRecords.find((record) => record.id === id)!;
    const record = {
      ...found,
      lifecycle: destination,
      version: version + 1,
      archivedAt: undefined,
    };
    goalRecords = goalRecords.filter((entry) => entry.id !== id);
    return { status: "settled", record, replayed: false };
  },
  reactivateWorkItem: async (id, version, destination) => {
    if (fixture === "restore-conflict")
      throw new RuntimeRequestError("Synthetic version conflict.", {
        code: "work_conflict",
        status: 409,
      });
    if (fixture === "restore-error")
      throw new Error("Synthetic restore failure; archived Work is unchanged.");
    if (fixture === "restore-record-gone")
      throw new Error("This archived Task is no longer available.");
    const found = taskRecords.find((entry) => entry.item.id === id)!;
    const record = {
      ...found.item,
      state: destination,
      version: version + 1,
      archivedAt: undefined,
    };
    taskRecords = taskRecords.filter((entry) => entry.item.id !== id);
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
const routeParams = new URLSearchParams();
if (fixture === "filtered-empty") routeParams.set("q", "no-match");
if (fixture === "goals-only") routeParams.set("type", "goals");
if (fixture === "tasks-only") routeParams.set("type", "tasks");
const requestedQuery = search.get("q");
const requestedType = search.get("type");
if (requestedQuery !== null) routeParams.set("q", requestedQuery);
if (requestedType === "goals" || requestedType === "tasks")
  routeParams.set("type", requestedType);
const route = `/work/archive${routeParams.size ? `?${routeParams}` : ""}`;
function Specimen() {
  return (
    <main className="work-archive-specimen" id="main-content">
      <header className="work-archive-specimen__controls">
        <div>
          <strong>Work Archive qualification</strong>
          <span>
            Synthetic recoverable Work · no provider or product mutation
          </span>
        </div>
        <KoraSelect
          label="Archive fixture"
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
            <WorkArchiveWorkspace services={services} requestKey={fixture} />
          </ViewBarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Specimen />);
if (fixture === "stale") window.setTimeout(() => void client.invalidateQueries({ queryKey: ["work", "archive"] }), 500);
