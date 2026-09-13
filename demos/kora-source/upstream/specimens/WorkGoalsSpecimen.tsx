import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/work/work.css";
import "../features/work/work-goals.css";
import "./work-goals-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { ProjectsWorkspace, type WorkGoalsServices } from "../features/work/ProjectsWorkspace";
import type { Project, ProjectListEntry, ProjectListFilter } from "../lib/runtime";
import { RuntimeRequestError } from "../lib/runtime";
import { WORK_GOALS_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_GOALS_FIXTURES;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const requestedView = new URLSearchParams(window.location.search).get("view");
const view = requestedView === "list" || requestedView === "board" ? requestedView : "cards";
const now = "2026-08-29T14:00:00.000Z";

const project = (id: string, title: string, state: Project["state"], overrides: Partial<Project> = {}): Project => ({
  id,
  title,
  area: "Personal",
  purposeMarkdown: "Make the outcome concrete without turning ordinary life into project-management ceremony.",
  state,
  priority: state === "planned" ? 2 : 3,
  provenance: "synthetic_qualification",
  version: 1,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: now,
  ...overrides,
});

const entry = (record: Project, open: number, overrides: Partial<ProjectListEntry> = {}): ProjectListEntry => ({
  project: record,
  visibleOpenWorkItemCount: open,
  visibleBlockedWorkItemCount: record.state === "blocked" ? 1 : 0,
  visibleOverdueWorkItemCount: 0,
  nextOpenWorkItem: open ? {
    id: `next-${record.id}`,
    projectId: record.id,
    kind: "task",
    title: record.state === "blocked" ? "Resolve the recorded blocker" : "Complete the next useful step",
    state: record.state === "blocked" ? "blocked" : "planned",
    priority: 3,
    version: 1,
    updatedAt: now,
  } : undefined,
  inUserAttention: record.state === "active",
  lastActivityAt: now,
  ...overrides,
});

const ordinary: ProjectListEntry[] = [
  entry(project("portfolio", "Publish the portfolio refresh", "active", { area: "Career", targetDate: "2026-09-18", purposeMarkdown: "Turn six substantial case studies into a concise portfolio that is ready to share with senior product teams." }), 6, { visibleOverdueWorkItemCount: 1 }),
  entry(project("coast", "Plan the September coastal trip", "active", { area: "Personal", targetDate: "2026-09-04", purposeMarkdown: "Make a restorative four-day trip concrete without over-planning every hour." }), 5),
  entry(project("carbonara", "Learn to make carbonara well", "planned", { area: "Learning", priority: 0, purposeMarkdown: "Cook a confident weeknight carbonara from memory and understand how to correct the sauce." }), 3),
  entry(project("studio", "Set up the spare-room music studio", "planned", { area: "Home", priority: 2 }), 4),
  entry(project("run", "Return to a comfortable 5K", "blocked", { area: "Wellbeing", blocker: "Wait for the current ankle flare-up to settle before increasing distance." }), 2),
  entry(project("reading", "Build a sustainable reading habit", "planned", { area: "Personal", priority: 1 }), 2),
];
const archivedTerminal = entry(project("archived-writing", "Publish the winter essay collection", "archived", {
  area: "Creative",
  archivedAt: "2026-08-22T16:30:00.000Z",
  resultMarkdown: "Archived after publishing the final edited collection.",
}), 0);

const longEntry = entry(project("long", "Create a calm, maintainable household operating rhythm that survives travel, busy work weeks, unexpected appointments, and the ordinary messiness of sharing a home", "active", {
  area: "Home",
  purposeMarkdown: "Replace fragile memory and repeated negotiation with a lightweight rhythm for meals, supplies, cleaning, maintenance, and shared decisions—without making the household feel like a company.",
  targetDate: "2026-12-01",
}), 17, { visibleBlockedWorkItemCount: 2, visibleOverdueWorkItemCount: 4 });

const large = Array.from({ length: 120 }, (_, index) => entry(project(
  `goal-${index + 1}`,
  `${["Practice conversational Spanish", "Restore the balcony garden", "Prepare for the autumn half marathon", "Organize family photographs"][index % 4]} ${index + 1}`,
  index % 9 === 0 ? "blocked" : index % 3 === 0 ? "active" : "planned",
  { area: ["Learning", "Home", "Wellbeing", "Personal"][index % 4], priority: index % 5, targetDate: index % 4 === 0 ? "2026-10-15" : undefined },
), (index % 7) + 1));

let records = fixture === "large"
  ? large
  : fixture === "long-copy"
    ? [longEntry, ...ordinary.slice(0, 2)]
    : fixture === "archived-terminal"
      ? [archivedTerminal]
      : ordinary;
let readCount = 0;

const services: WorkGoalsServices = {
  projectsPage: async (input) => {
    readCount += 1;
    const request = input ?? {};
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. No current Goal collection could be read; local records were not changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "unavailable") throw new Error("Synthetic local Work read failure. Existing records remain intact.");
    if ((fixture === "stale" || fixture === "background-error") && readCount > 1) throw new Error("Synthetic local Goal refresh failure.");
    if (fixture === "empty") return { items: [], complete: true, coverage: { state: "complete" } };
    const query = request.query?.trim().toLocaleLowerCase();
    let filtered = records.filter(({ project: item }) => {
      const filter: ProjectListFilter = request.filter ?? "open";
      const matchesFilter = filter === "open" ? ["planned", "active", "blocked"].includes(item.state)
        : filter === "active" ? item.state === "active"
          : filter === "planned" ? item.state === "planned"
            : filter === "blocked" ? item.state === "blocked"
              : ["completed", "cancelled", "archived"].includes(item.state);
      return matchesFilter && (!query || `${item.title} ${item.area ?? ""} ${item.purposeMarkdown}`.toLocaleLowerCase().includes(query));
    });
    if (fixture === "filtered-empty") filtered = [];
    const offset = request.cursor ? Number(request.cursor) : 0;
    const limit = request.limit ?? 50;
    const items = filtered.slice(offset, offset + limit);
    const next = offset + items.length;
    return {
      items,
      cursor: next < filtered.length ? String(next) : undefined,
      complete: next >= filtered.length,
      coverage: fixture === "partial"
        ? { state: "partial", omittedOrdinaryCollections: ["goal_activity"] }
        : { state: "complete" },
    };
  },
  projectWorkspace: async () => { throw new Error("Synthetic Goals provide their recorded next action directly."); },
  updateProject: async (id, version, changes) => {
    const current = records.find((item) => item.project.id === id)?.project;
    if (!current) throw new Error("Synthetic Goal not found.");
    const updated: Project = {
      ...current,
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.purposeMarkdown !== undefined ? { purposeMarkdown: changes.purposeMarkdown } : {}),
      ...(changes.state !== undefined ? { state: changes.state } : {}),
      ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
      area: changes.area === null ? undefined : changes.area ?? current.area,
      startDate: changes.startDate === null ? undefined : changes.startDate ?? current.startDate,
      targetDate: changes.targetDate === null ? undefined : changes.targetDate ?? current.targetDate,
      blocker: changes.blocker === null ? undefined : changes.blocker ?? current.blocker,
      provenance: changes.provenance,
      version: version + 1,
      updatedAt: now,
    };
    records = records.map((item) => item.project.id === id ? { ...item, project: updated } : item);
    return { status: "settled", record: updated, replayed: false };
  },
  createProject: async (input) => {
    const created = project(`created-${records.length + 1}`, input.project.title, input.project.state, { ...input.project, version: 1 });
    records = [entry(created, 0), ...records];
    return { status: "settled", record: created, replayed: false };
  },
};

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Specimen() {
  const route = `/work?${new URLSearchParams({ ...(view === "cards" ? {} : { view }), ...(fixture === "filtered-empty" ? { q: "no matching goal" } : {}), ...(fixture === "archived-terminal" ? { filter: "terminal" } : {}) })}`;
  return <main className="work-goals-specimen" id="main-content">
    <header className="work-goals-specimen__controls"><div><strong>Work Goals qualification</strong><span>Synthetic local Work states · no product or provider mutation</span></div><KoraSelect label="Goals fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><ProjectsWorkspace onAskKora={() => undefined} services={services} requestKey={fixture} /></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
if (fixture === "stale" || fixture === "background-error") window.setTimeout(() => void client.invalidateQueries({ queryKey: ["work", "projects"] }), 500);
