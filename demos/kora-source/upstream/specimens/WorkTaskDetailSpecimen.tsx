import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/work/work.css";
import "../features/work/task-detail.css";
import "./work-task-detail-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WorkItemWorkspace, type TaskDetailServices } from "../features/work/WorkItemWorkspace";
import type { DeleteWorkServices } from "../features/work/WorkDetailShared";
import { RuntimeRequestError, type ActiveWorkResponse, type Goal, type WorkConnectionSummary, type WorkItem, type WorkItemWorkspaceView } from "../lib/runtime";
import { WORK_TASK_DETAIL_FIXTURES } from "./WorkQualificationFixtureRegistry";

const fixtures = WORK_TASK_DETAIL_FIXTURES;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const now = "2026-08-29T14:00:00.000Z";

const goal: Goal = {
  id: "portfolio",
  title: "Publish the portfolio refresh",
  area: "Career",
  purposeMarkdown: "Share six substantial case studies with senior product teams.",
  shape: "finish",
  lifecycle: "active",
  sensitivity: "private",
  priority: 4,
  targetDate: "2026-09-18",
  provenance: "synthetic_qualification",
  version: 4,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: now,
};

const makeItem = (id: string, title: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  goalId: goal.id,
  kind: "task",
  title,
  area: "Career",
  descriptionMarkdown: "Rewrite the case study around the product decision, the evidence available, and the measured result.",
  state: "active",
  priority: 3,
  dueAt: "2026-09-01T16:00:00.000Z",
  provenance: "synthetic_qualification",
  version: 2,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: now,
  ...overrides,
});

const baseItem = makeItem("task-rewrite", "Rewrite the Kora case study around measured outcomes");
const parent = makeItem("outcome-case-study", "Publish a credible Kora case study", { kind: "outcome", parentWorkItemId: undefined });
const child = makeItem("task-evidence", "Verify the adoption evidence with the research notes", { parentWorkItemId: baseItem.id, state: "planned", dueAt: "2026-09-03T16:00:00.000Z" });
const dependency: WorkConnectionSummary = { id: "dependency-review", from: { type: "work_item", id: baseItem.id }, relation: "depends_on", target: { type: "work_item", id: "task-review" }, label: "Editorial review confirms the final narrative", availability: "available", verifiedAt: now, createdAt: now };
const pageConnection: WorkConnectionSummary = { id: "context-notes", from: { type: "work_item", id: baseItem.id }, relation: "supporting_page", target: { type: "page", id: "research-notes" }, label: "Portfolio research notes", availability: "available", verifiedAt: now, createdAt: now };
const allChildren = Array.from({ length: 75 }, (_, index) => makeItem(`child-${index + 1}`, `Case-study follow-up ${index + 1}`, { parentWorkItemId: baseItem.id, state: index % 9 === 0 ? "blocked" : index % 3 === 0 ? "active" : "planned", blocker: index % 9 === 0 ? "A synthetic editorial dependency is unresolved." : undefined, dueAt: `2026-09-${String((index % 27) + 1).padStart(2, "0")}T16:00:00.000Z` }));

function itemForFixture(): WorkItem {
  if (fixture === "standalone") return { ...baseItem, goalId: undefined };
  if (fixture === "blocked") return { ...baseItem, state: "blocked", blocker: "The client name cannot be published until Maya confirms the attribution language." };
  if (fixture === "completed-result") return { ...baseItem, state: "completed", resultMarkdown: "Published the revised case study with reviewed adoption evidence and approved attribution.", completedAt: now };
  if (fixture === "completed-no-result") return { ...baseItem, state: "completed", completedAt: now };
  if (fixture === "cancelled") return { ...baseItem, state: "cancelled", cancellationReason: "The underlying product was retired before the case study could be published.", cancelledAt: now };
  if (fixture === "archived") return { ...baseItem, state: "archived", archivedAt: now };
  if (fixture === "empty") return { ...baseItem, descriptionMarkdown: undefined };
  if (fixture === "long-copy") return { ...baseItem, title: "Rewrite the Kora case study so it explains why the team changed direction after the first research round, which constraints remained unresolved, how the evidence affected the final interaction model, and what the measured outcome can and cannot honestly establish", descriptionMarkdown: "The working notes need to preserve a careful distinction between the research observation, the team’s interpretation, and the eventual product decision. They should also explain why the original approach looked reasonable, what failed in practice, how the revised interaction reduced ambiguity, and which claims still rely on incomplete evidence rather than treating the final outcome as more certain than it is." };
  return baseItem;
}

const active: ActiveWorkResponse = { version: 8, records: [], capacity: { state: "known", count: 2, limit: 12, canAdd: true } };
const view: WorkItemWorkspaceView = {
  item: itemForFixture(),
  ...(fixture === "standalone" ? {} : { goal }),
  ...(fixture === "populated" || fixture === "blocked" || fixture === "long-copy" ? { parent } : {}),
  children: fixture === "empty" || fixture === "standalone" ? { items: [], complete: true } : fixture === "pagination" ? { items: allChildren.slice(0, 50), cursor: "50", complete: false } : fixture === "partial" ? { items: [child], cursor: "partial-page", complete: false } : { items: [child], complete: true },
  focus: { inUserAttention: false, capacity: active.capacity },
  connections: { items: fixture === "empty" || fixture === "standalone" ? [] : [dependency, pageConnection], complete: fixture !== "partial" },
  activity: { items: fixture === "empty" ? [] : [{ id: "activity-1", occurredAt: now, operation: "update", targetType: "work_item", targetId: baseItem.id, outcome: "settled", summary: "Recorded the current evidence plan." }], complete: fixture !== "partial" },
};

const services: TaskDetailServices = {
  workItemWorkspace: async () => {
    if (fixture === "loading") return new Promise<never>(() => undefined);
    if (fixture === "missing") throw new RuntimeRequestError("Synthetic record is gone.", { code: "not_found", status: 404 });
    if (fixture === "offline") throw new RuntimeRequestError("Kora is offline. This Work item cannot be refreshed; no local Work was changed.", { code: "runtime_disconnected", status: 503 });
    if (fixture === "stale") throw new Error("The Work item could not refresh. Last-confirmed details remain available for review.");
    if (fixture === "unavailable") throw new RuntimeRequestError("Synthetic local Work read is unavailable.", { code: "runtime_unavailable", status: 503 });
    return view;
  },
  activeWork: async () => active,
  workItemChildren: async (_id, _limit, cursor) => {
    if (fixture === "partial") throw new Error("The next related-Work page is temporarily unavailable. Existing relationships remain visible.");
    if (fixture === "pagination" && cursor === "50") return { items: allChildren.slice(50), complete: true };
    return { items: [], complete: true };
  },
  addWorkFocus: async () => {
    if (fixture === "focus-failure") throw new Error("Focus changed elsewhere. Refresh focus before trying again.");
    return { status: "settled", activeWork: active, replayed: false };
  },
  removeWorkFocus: async () => ({ status: "settled", activeWork: active, replayed: false }),
};

const deletionServices: DeleteWorkServices = {
  deleteWorkRecord: async (_surface, id, requestKey) => {
    if (fixture === "deletion-expired") return {
      status: "expired",
      message: "The exact-deletion approval expired. Review the current record before trying again.",
      replayed: false,
    };
    if (fixture === "deletion-stale") return {
      status: "stale",
      surface: "work_item",
      id,
      message: "This Work item changed. Review its current version before requesting deletion again.",
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
      confirmations: [{ confirmationId: "synthetic-delete", expiresAt: "2026-08-29T14:05:00.000Z", purpose: "exact_deletion" }],
      consequence: "Permanently delete this exact synthetic Work item and its Kora-owned derivatives.",
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
  if (fixture === "stale") client.setQueryData(["work", "item", baseItem.id, fixture], view);
  return <main className="work-task-detail-specimen" id="main-content">
    <header className="work-task-detail-specimen__controls"><div><strong>Task detail qualification</strong><span>Synthetic local Work state · no product or provider writes</span></div><KoraSelect label="Task detail fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={["/work/tasks/task-rewrite"]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><Routes><Route path="/work/tasks/:itemId" element={<WorkItemWorkspace onAskKora={() => undefined} services={services} deletionServices={deletionServices} requestKey={fixture} />} /></Routes></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
