import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/work/work.css";
import "../features/work/goal-detail.css";
import "./work-goal-detail-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { ProjectWorkspace, type GoalDetailServices } from "../features/work/ProjectWorkspace";
import type { DeleteWorkServices } from "../features/work/WorkDetailShared";
import { RuntimeRequestError, type ActiveWorkResponse, type Project, type ProjectWorkspaceView, type WorkItem, type WorkOutlineNode } from "../lib/runtime";
import { WORK_GOAL_DETAIL_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_GOAL_DETAIL_FIXTURES;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const now = "2026-08-29T14:00:00.000Z";

const goal: Project = {
  id: "portfolio",
  title: fixture === "long-copy" ? "Publish a coherent portfolio that explains the decisions, constraints, outcomes, and lessons behind six substantial product case studies without flattening the work into generic résumé language" : "Publish the portfolio refresh",
  area: fixture === "long-copy" ? "Career transition and independent practice" : "Career",
  purposeMarkdown: fixture === "long-copy" ? "Create a portfolio that is concise enough for a hiring manager to scan, rigorous enough for a senior practitioner to trust, and honest about uncertainty, collaboration, tradeoffs, and the parts of each result that remain difficult to measure." : "Turn six substantial case studies into a concise portfolio that is ready to share with senior product teams.",
  state: fixture === "terminal" ? "completed" : fixture === "archived" ? "archived" : "active",
  priority: 4,
  targetDate: "2026-09-18",
  resultMarkdown: fixture === "terminal" ? "Published with six reviewed case studies." : fixture === "archived" ? "Archived after the final case-study package was preserved." : undefined,
  provenance: "synthetic_qualification",
  version: 4,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: now,
  completedAt: fixture === "terminal" ? now : undefined,
  archivedAt: fixture === "archived" ? "2026-08-24T14:00:00.000Z" : undefined,
};

const workItem = (id: string, kind: WorkItem["kind"], title: string, state: WorkItem["state"], overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  projectId: goal.id,
  kind,
  title,
  state,
  priority: 3,
  provenance: "synthetic_qualification",
  version: 1,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: now,
  ...overrides,
});

const milestone = workItem("milestone-editorial", "milestone", "Editorial review complete", "active", { dueAt: "2026-09-04T16:00:00.000Z" });
const next = workItem("task-rewrite", "task", "Rewrite the Kora case study around measured outcomes", "active", { dueAt: "2026-09-01T16:00:00.000Z" });
const blocked = workItem("task-quote", "task", "Request final launch quote from Maya", "blocked", { blocker: "Waiting for Maya to confirm whether the client name may be published." });
const outcome = workItem("outcome-launch", "outcome", "Launch with six credible case studies", "planned", { dueAt: "2026-09-18T16:00:00.000Z" });
const ordinaryNodes: WorkOutlineNode[] = [
  { item: milestone, children: { items: [next], complete: true } },
  { item: blocked, children: { items: [], complete: true } },
  { item: outcome, children: { items: [], complete: true } },
];
const largeNodes = Array.from({ length: 75 }, (_, index): WorkOutlineNode => ({ item: workItem(`task-${index + 1}`, index % 12 === 0 ? "milestone" : "task", `${index % 12 === 0 ? "Checkpoint" : "Case-study task"} ${index + 1}`, index % 9 === 0 ? "blocked" : index % 3 === 0 ? "active" : "planned", { dueAt: `2026-09-${String((index % 27) + 1).padStart(2, "0")}T16:00:00.000Z`, blocker: index % 9 === 0 ? "A synthetic dependency is still unresolved." : undefined }), children: { items: [], complete: true } }));
const nodes = fixture === "empty-work" || fixture === "terminal" || fixture === "archived" ? [] : fixture === "large" ? largeNodes.slice(0, 50) : ordinaryNodes;

const active: ActiveWorkResponse = { version: 7, records: [], capacity: { state: "known", count: 1, limit: 12, canAdd: true } };
const view: ProjectWorkspaceView = {
  project: goal,
  focus: { inUserAttention: true, capacity: active.capacity },
  work: { nodes, cursor: fixture === "large" ? "50" : undefined, complete: fixture !== "large" },
  connections: { items: fixture === "empty-work" ? [] : [{ id: "connection-page", from: { type: "project", id: goal.id }, relation: "supporting_page", target: { type: "page", id: "portfolio-notes" }, label: "Portfolio evidence notes", availability: fixture === "partial" ? "degraded" : "available", verifiedAt: now, createdAt: now }], complete: true },
  activity: { items: [{ id: "activity-1", occurredAt: now, operation: "update", targetType: "project", targetId: goal.id, outcome: "settled", summary: "Recorded the current editorial milestone." }], complete: true },
};

const services: GoalDetailServices = {
  projectWorkspace: async () => {
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "missing") throw new RuntimeRequestError("The synthetic Goal was archived or deleted.", { code: "not_found", status: 404 });
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. This Goal cannot be refreshed; no local Work was changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "stale") throw new Error("The Goal could not refresh. Last-confirmed details remain available for review.");
    if (fixture === "unavailable") throw new Error("Synthetic local Work read failure. Existing records remain intact.");
    return view;
  },
  activeWork: async () => active,
  projectOutline: async (_id, mode, _limit, cursor) => mode === "terminal"
    ? { nodes: fixture === "terminal" ? [{ item: workItem("completed-task", "task", "Publish the final portfolio", "completed", { completedAt: now }) , children: { items: [], complete: true } }] : [], complete: true }
    : { nodes: fixture === "large" && cursor === "50" ? largeNodes.slice(50) : nodes, complete: true },
  workItemChildren: async () => ({ items: [], complete: true }),
  addWorkFocus: async () => ({ status: "settled", activeWork: active, replayed: false }),
  removeWorkFocus: async () => ({ status: "settled", activeWork: active, replayed: false }),
};

const deletionServices: DeleteWorkServices = {
  deleteWorkRecord: async (_surface, id, requestKey) => {
    if (fixture === "deletion-expired") return {
      status: "expired",
      message: "The exact-deletion approval expired. Review the current Goal before trying again.",
      replayed: false,
    };
    if (fixture === "deletion-stale") return {
      status: "stale",
      surface: "project",
      id,
      message: "This Goal changed. Review its current version before requesting deletion again.",
      replayed: false,
    };
    if (fixture === "deletion-uncertain") return {
      status: "uncertain",
      requestKey,
      message: "Kora could not confirm whether deletion settled. Retry confirmation with the same request.",
      retryable: true,
    };
    return {
      status: "waiting_confirmation",
      confirmations: [{ confirmationId: "synthetic-goal-delete", expiresAt: "2026-08-29T14:05:00.000Z", purpose: "exact_deletion" }],
      consequence: "Permanently delete this exact synthetic Goal and its Kora-owned derivatives.",
      replayed: false,
    };
  },
  approveToolConfirmation: async () => ({}),
  rejectToolConfirmation: async () => ({}),
};

function choose(nextFixture: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", nextFixture);
  window.location.search = query.toString();
}

function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (fixture === "stale") client.setQueryData(["work", "project", fixture, goal.id], view);
  return <main className="work-goal-detail-specimen" id="main-content">
    <header className="work-goal-detail-specimen__controls"><div><strong>Goal detail qualification</strong><span>Synthetic local Goal and Work states · no initial product or provider access</span></div><KoraSelect label="Goal detail fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={["/work/goals/portfolio"]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><Routes><Route path="/work/goals/:projectId" element={<ProjectWorkspace onAskKora={() => undefined} services={services} deletionServices={deletionServices} requestKey={fixture} />} /></Routes></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
