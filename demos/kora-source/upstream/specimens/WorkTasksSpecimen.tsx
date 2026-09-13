import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../components/collections.css";
import "../features/work/work.css";
import "../features/work/work-tasks.css";
import "./work-tasks-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WorkTasksWorkspace, type WorkTasksServices } from "../features/work/WorkTasksWorkspace";
import { RuntimeRequestError, type Goal, type GoalListEntry, type WorkItem, type WorkItemListEntry, type WorkItemListFilter } from "../lib/runtime";
import { createLargeTaskGoals } from "./WorkTasksSpecimen.fixtures";
import { WORK_TASKS_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_TASKS_FIXTURES;
type Fixture = typeof fixtures[number];
const search = new URLSearchParams(window.location.search);
const requested = search.get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const view = search.get("view") === "board" ? "board" : "list";
const now = "2026-08-29T14:00:00.000Z";

const goal = (id: string, title: string, area: string): Goal => ({
  id,
  title,
  area,
  purposeMarkdown: "A synthetic personal Goal used only to qualify the Tasks collection.",
  shape: "finish",
  lifecycle: "active",
  priority: 3,
  sensitivity: "private",
  provenance: "synthetic_qualification",
  version: 1,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: now,
});

const portfolio = goal("portfolio", "Publish the portfolio refresh", "Career");
const coast = goal("coast", "Plan the September coastal trip", "Personal");
const cooking = goal("cooking", "Cook five dependable weeknight meals", "Learning");
const goals = [portfolio, coast, cooking];
const largeGoals = createLargeTaskGoals(now);
const fixtureGoals = fixture === "large" ? largeGoals : goals;
const task = (id: string, title: string, kind: WorkItem["kind"], state: WorkItem["state"], goal: Goal | undefined, overrides: Partial<WorkItem> = {}): WorkItemListEntry => ({
  item: {
    id,
    goalId: goal?.id,
    kind,
    title,
    area: goal?.area ?? "Home",
    descriptionMarkdown: "Useful synthetic context that explains why this Work matters without repeating its title.",
    state,
    priority: state === "blocked" ? 4 : 3,
    dueAt: "2026-09-04T17:00:00.000Z",
    blocker: state === "blocked" ? "Waiting for a decision that only the owner can make." : undefined,
    provenance: "synthetic_qualification",
    version: 1,
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: now,
    ...overrides,
  },
  goal: goal ? { id: goal.id, title: goal.title, area: goal.area, shape: goal.shape, lifecycle: goal.lifecycle, priority: goal.priority, version: goal.version, updatedAt: goal.updatedAt } : undefined,
  inUserAttention: id === "case-study" || id === "departure",
});

const ordinary: WorkItemListEntry[] = [
  task("quote", "Request final launch quote from Maya Chen", "task", "blocked", portfolio),
  task("case-study", "Rewrite the case study around measured outcomes", "task", "active", portfolio),
  task("deck", "Send the revised case-study deck to Maya", "commitment", "active", portfolio, { commitmentDirection: "owed_by_user" }),
  task("departure", "Confirm the Friday departure window", "commitment", "active", coast, { commitmentDirection: "owed_to_user" }),
  task("inns", "Compare the two refundable inns", "task", "planned", coast),
  task("carbonara", "Practice carbonara without cream", "task", "active", cooking),
  task("lodging", "Refundable lodging reserved", "milestone", "planned", coast),
  task("approval", "Publication approval returned", "commitment", "planned", portfolio, { commitmentDirection: "owed_to_user" }),
  task("warranties", "File appliance warranties and receipts", "task", "planned", undefined),
  task("review", "Editorial review complete", "milestone", "planned", portfolio),
  task("itinerary", "Share the final itinerary", "commitment", "planned", coast, { commitmentDirection: "owed_by_user" }),
  task("launch", "Launch the portfolio with six credible case studies", "outcome", "active", portfolio),
  task("arrive", "Arrive at the coast rested and prepared", "outcome", "active", coast),
];
const terminal: WorkItemListEntry[] = [
  task("published", "Publish the final portfolio", "outcome", "completed", portfolio, { resultMarkdown: "Published with six reviewed case studies.", completedAt: now }),
  task("old-inn", "Reserve the first inn option", "task", "cancelled", coast, { cancellationReason: "A better refundable option became available.", cancelledAt: now }),
];
const archivedTerminal: WorkItemListEntry[] = [
  task("archived-recipes", "Retire the first recipe-testing checklist", "task", "archived", cooking, { archivedAt: "2026-08-21T18:40:00.000Z" }),
];
const longCopy = task("long", "Create a calm household operating rhythm that survives travel, busy weeks, unexpected appointments, shared responsibilities, and the ordinary messiness of everyday life", "task", "blocked", undefined, {
  area: "Home and family logistics",
  descriptionMarkdown: "Make meals, supplies, maintenance, scheduling, and shared decisions easier to understand without turning home life into a company or hiding the next concrete action inside an essay.",
  dueAt: "2026-12-18T17:00:00.000Z",
});
const large = Array.from({ length: 500 }, (_, index) => {
  const source = ordinary[index % ordinary.length]!;
  const state: WorkItem["state"] = index < 120 ? "planned" : index % 9 === 0 ? "blocked" : index % 3 === 0 ? "active" : "planned";
  return task(`large-${index + 1}`, `${source.item.title} · ${index + 1}`, source.item.kind, state, largeGoals[index % largeGoals.length], { priority: index % 5, dueAt: `2026-${String(9 + Math.floor((index % 90) / 30)).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}T17:00:00.000Z` });
});

let records = fixture === "large" ? large : fixture === "long-copy" ? [longCopy, ...ordinary.slice(0, 4)] : fixture === "terminal" ? terminal : fixture === "archived-terminal" ? archivedTerminal : ordinary;
let readCount = 0;
let bulkWriteCount = 0;
const matchesFilter = (item: WorkItem, filter: WorkItemListFilter) => filter === "open" ? ["planned", "active", "blocked"].includes(item.state)
  : filter === "active" ? item.state === "active"
    : filter === "planned" ? item.state === "planned"
      : filter === "blocked" ? item.state === "blocked"
        : filter === "archived" ? item.state === "archived"
          : ["completed", "cancelled", "archived"].includes(item.state);

const services: WorkTasksServices = {
  workItems: async (input = {}) => {
    readCount += 1;
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. No current Task collection could be read; local records were not changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable") throw new Error("Synthetic local Work read failure. Existing records remain intact.");
    if ((fixture === "stale" || fixture === "background-error") && readCount > 1) throw new Error("Synthetic refresh failure.");
    if (fixture === "next-page-error" && input.cursor) throw new Error("Synthetic next-page failure.");
    if (fixture === "empty") return { items: [], complete: true };
    const query = input.query?.trim().toLocaleLowerCase();
    let filtered = records.filter((entry) => matchesFilter(entry.item, input.filter ?? "open") && (!input.kind || entry.item.kind === input.kind) && (!query || `${entry.item.title} ${entry.item.area ?? ""} ${entry.goal?.title ?? ""}`.toLocaleLowerCase().includes(query)));
    if (fixture === "filtered-empty") filtered = [];
    const offset = input.cursor ? Number(input.cursor) || 50 : 0;
    const limit = input.limit ?? 50;
    const items = filtered.slice(offset, offset + limit).map((entry) => fixture === "partial-goal" ? { ...entry, goal: undefined } : entry);
    const next = offset + items.length;
    const forceNext = fixture === "next-page-error" && !input.cursor;
    return { items, cursor: forceNext ? "50" : next < filtered.length ? String(next) : undefined, complete: !forceNext && next >= filtered.length };
  },
  goalsPage: async (input) => {
    if (fixture === "partial-goal") throw new Error("Synthetic Goal context failure.");
    const filter = input?.filter ?? "open";
    const items: GoalListEntry[] = fixtureGoals.filter((record) => filter === "terminal" ? ["achieved", "stopped", "archived"].includes(record.lifecycle) : true).map((record) => ({ goal: record, visibleOpenWorkItemCount: records.filter((entry) => entry.item.goalId === record.id && ["planned", "active", "blocked"].includes(entry.item.state)).length, inUserAttention: false }));
    return { items, complete: true };
  },
  updateWorkItem: async (id, version, changes) => {
    if (fixture === "move-conflict") throw new RuntimeRequestError("Synthetic version conflict.", { code: "work_conflict", status: 409 });
    bulkWriteCount += 1;
    if (fixture === "bulk-failure" && bulkWriteCount === 2) throw new Error("Synthetic local write interruption.");
    const current = records.find((entry) => entry.item.id === id);
    if (!current) throw new Error("Synthetic Task not found.");
    const updated: WorkItem = {
      ...current.item,
      state: changes.state ?? current.item.state,
      blocker: changes.blocker === null ? undefined : changes.blocker ?? current.item.blocker,
      provenance: changes.provenance,
      version: version + 1,
      updatedAt: now,
    };
    records = records.map((entry) => entry.item.id === id ? { ...entry, item: updated } : entry);
    return { status: "settled", record: updated, replayed: false };
  },
  createGoalWorkItem: async (goalId, input) => {
    const target = fixtureGoals.find((candidate) => candidate.id === goalId);
    if (!target) throw new Error("Synthetic Goal not found.");
    const created = task(`created-${records.length + 1}`, input.item.title, input.item.kind, input.item.state, target, {
      ...input.item,
      goalId,
      descriptionMarkdown: input.item.descriptionMarkdown,
      provenance: "synthetic_qualification",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    records = [created, ...records];
    return { status: "settled", record: created.item, replayed: false };
  },
};

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const route = `/work/tasks?${new URLSearchParams({ ...(view === "board" ? { view } : {}), ...(fixture === "filtered-empty" ? { q: "no matching Task" } : {}), ...(fixture === "terminal" ? { filter: "terminal" } : {}), ...(fixture === "archived-terminal" ? { filter: "archived" } : {}) })}`;

function Specimen() {
  return <main className="work-tasks-specimen" id="main-content">
    <header className="work-tasks-specimen__controls"><div><strong>Work Tasks qualification</strong><span>Synthetic local Work states · no product or provider mutation</span></div><KoraSelect label="Tasks fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><WorkTasksWorkspace onAskKora={() => undefined} services={services} requestKey={fixture} /></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
if (fixture === "stale" || fixture === "background-error") window.setTimeout(() => void client.invalidateQueries({ queryKey: ["work", "items"] }), 500);
