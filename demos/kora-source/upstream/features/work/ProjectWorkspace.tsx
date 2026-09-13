import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Columns3,
  CircleAlert,
  Flag,
  Link2,
  ListTodo,
  LockKeyhole,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Disclosure,
  PageFrame,
  PageSection,
  PageTabs,
  RecordPage,
  StateView,
} from "../../components/primitives";
import { useViewBar } from "../../app/ViewBar";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type Goal,
  type Project,
  type GoalWorkspaceView,
  type WorkItem,
  type WorkItemListPage,
  type WorkOutlineNode,
  type WorkOutlinePage,
} from "../../lib/runtime";
import { WorkInspector, type SelectedWork } from "./WorkInspector";
import {
  ActivitySection,
  ConnectionsSection,
  DeleteWorkRecordModal,
  type DeleteWorkServices,
} from "./WorkDetailShared";
import { WorkNavigation } from "./WorkNavigation";
import { WorkTasksWorkspace, type WorkTasksServices } from "./WorkTasksWorkspace";
import { WorkTimelineWorkspace } from "./WorkTimelineWorkspace";
import { flattenCurrentWork, selectGoalNextMove } from "./work-selection";
import { workReturnPath } from "./work-navigation-state";
import "./work.css";
import "./goal-detail.css";

function GoalDetailLoading() {
  return <div className="goal-detail-loading" aria-hidden="true">
    <span className="goal-detail-loading__header" />
    <span className="goal-detail-loading__now" />
    <span className="goal-detail-loading__section" />
    <span className="goal-detail-loading__section" />
  </div>;
}

const stateLabel = (state: Goal["lifecycle"] | WorkItem["state"]) =>
  state === "active"
    ? "In progress"
    : state === "paused" || state === "blocked"
      ? "Paused"
      : state === "planned"
        ? "Coming up"
        : state === "achieved" || state === "completed"
          ? "Achieved"
          : state === "stopped" || state === "cancelled"
            ? "Stopped"
            : "Archived";
const priorityLabel = (priority: number) =>
  ["Someday", "Low", "Normal", "High", "Highest"][priority] ??
    `Priority ${priority}`;
const shapeLabel = (shape: Goal["shape"]) =>
  shape === "finish" ? "Finish" : shape === "target" ? "Target" : "Ongoing";
const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : undefined;
const dueLabel = (item: WorkItem) => {
  const value = item.dueAt ?? item.attentionAt;
  return value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(value))
    : undefined;
};
function goalErrorKind(
  reason: unknown,
): "missing" | "restricted" | "unavailable" {
  if (!(reason instanceof RuntimeRequestError)) return "unavailable";
  if (reason.code === "not_found" || reason.status === 404) return "missing";
  if (
    reason.code === "restricted_record_required" ||
    reason.code === "forbidden" ||
    reason.status === 403
  )
    return "restricted";
  return "unavailable";
}
type WorkItemChildrenPage = { items: WorkItem[]; cursor?: string; complete: boolean };
type CanonicalWorkOutline = (id: string, historyMode?: "current" | "terminal", limit?: number, cursor?: string) => Promise<WorkOutlinePage>;
type ProjectTab = "list" | "board" | "timeline" | "documents";
const PROJECT_TAB_VALUES = new Set<ProjectTab>(["list", "board", "timeline", "documents"]);
export type GoalDetailServices = Pick<
  typeof runtime,
  | "activeWork"
  | "addWorkFocus"
  | "removeWorkFocus"
> & {
  workItemChildren: (id: string, limit?: number, cursor?: string) => Promise<WorkItemChildrenPage>;
} & Partial<{
  workItems: typeof runtime.workItems;
  goalsPage: typeof runtime.goalsPage;
  updateWorkItem: typeof runtime.updateWorkItem;
  createGoalWorkItem: typeof runtime.createGoalWorkItem;
  goalWorkspace: typeof runtime.goalWorkspace;
  goalOutline: CanonicalWorkOutline;
  projectWorkspace: typeof runtime.projectWorkspace;
  projectOutline: CanonicalWorkOutline;
}>;
const goalFromLegacyProject = (project: Project): Goal => ({
  id: project.id, title: project.title, ...(project.area ? { area: project.area } : {}), purposeMarkdown: project.purposeMarkdown,
  shape: "finish", lifecycle: project.state === "blocked" ? "paused" : project.state === "completed" ? "achieved" : project.state === "cancelled" ? "stopped" : project.state === "archived" ? "archived" : project.state,
  priority: project.priority, ...(project.startDate ? { plannedStart: project.startDate } : {}), ...(project.targetDate ? { targetDate: project.targetDate } : {}),
  ...(project.blocker ? { pauseReason: project.blocker } : {}), ...(project.resultMarkdown ? { resultMarkdown: project.resultMarkdown } : {}),
  ...(project.cancellationReason ? { stopReason: project.cancellationReason } : {}), sensitivity: "private", provenance: project.provenance,
  version: project.version, createdAt: project.createdAt, updatedAt: project.updatedAt,
  ...(project.completedAt ? { achievedAt: project.completedAt } : {}), ...(project.cancelledAt ? { stoppedAt: project.cancelledAt } : {}), ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
});

function GoalWorkRow({
  item,
  child = false,
}: {
  item: WorkItem;
  child?: boolean;
}) {
  return (
    <div className={`goal-work-row${child ? " goal-work-row--child" : ""}`}>
      <span
        className={`work-state work-state--${item.state}`}
        aria-hidden="true"
      />
      <div className="goal-work-row__identity">
        <Link to={`/work/tasks/${encodeURIComponent(item.id)}`}>
          {item.title}
        </Link>
        <span>
          {item.kind} · {item.state}
          {dueLabel(item) ? ` · ${dueLabel(item)}` : ""}
        </span>
      </div>
      {item.blocker ? (
        <span className="goal-work-row__blocker">
          <CircleAlert size={13} aria-hidden="true" />
          Blocked
        </span>
      ) : null}
    </div>
  );
}

function ChildWork({
  parentTitle,
  initial,
  services,
}: {
  parentTitle: string;
  initial: { items: WorkItem[]; cursor?: string; complete: boolean };
  services: GoalDetailServices;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const parentId = initial.items[0]?.parentWorkItemId;
  const load = useMutation({
    mutationFn: () => services.workItemChildren(parentId ?? "", 50, cursor),
    onSuccess: (page) => {
      setItems((current) => [...current, ...page.items]);
      setCursor(page.cursor);
    },
  });
  return (
    <ul className="goal-work-children" aria-label={`Work under ${parentTitle}`}>
      {items.map((item) => (
        <li key={item.id}>
          <GoalWorkRow item={item} child />
        </li>
      ))}
      {cursor && parentId ? (
        <li>
          <Button
            tone="ghost"
            onClick={() => load.mutate()}
            loading={load.isPending}
          >
            Load more
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

function GoalProperties({
  view,
  onDelete,
  readOnly = false,
  showConnections = true,
}: {
  view: GoalWorkspaceView;
  onDelete: () => void;
  readOnly?: boolean;
  showConnections?: boolean;
}) {
  const { goal, focus } = view;
  return (
    <div className="k-record-page__properties goal-properties">
      <section>
        <h2>Details</h2>
        <dl>
          <div>
            <dt>Area</dt>
            <dd>{goal.area ?? "General"}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{stateLabel(goal.lifecycle)}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{priorityLabel(goal.priority)}</dd>
          </div>
          <div>
            <dt>Shape</dt>
            <dd>{shapeLabel(goal.shape)}</dd>
          </div>
          <div>
            <dt>Planned start</dt>
            <dd>{shortDate(goal.plannedStart) ?? "No start"}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{shortDate(goal.targetDate) ?? "No target"}</dd>
          </div>
          <div>
            <dt>Hard deadline</dt>
            <dd>{shortDate(goal.hardDeadline) ?? "No deadline"}</dd>
          </div>
          <div className="goal-properties__long">
            <dt>Success definition</dt>
            <dd>{goal.successDefinitionMarkdown ?? "No success definition recorded"}</dd>
          </div>
          <div>
            <dt>Focus</dt>
            <dd>{focus.inUserAttention ? "In focus" : "Not in focus"}</dd>
          </div>
          <div>
            <dt>Visibility</dt>
            <dd>
              {goal.sensitivity === "restricted" ? "Restricted" : "Private"}
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              {new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(goal.updatedAt))}
            </dd>
          </div>
        </dl>
      </section>
      {showConnections ? <ConnectionsSection
          recordType="project"
          recordId={goal.id}
          connections={view.connections.items}
        /> : null}
      <ActivitySection items={view.activity.items} />
      <section className="goal-properties__management">
        <h2>Management</h2>
        <Button tone="danger" onClick={onDelete} disabled={readOnly}>
          <Trash2 size={14} aria-hidden="true" />
          Delete Project
        </Button>
      </section>
    </div>
  );
}

export function ProjectWorkspace({
  onAskKora,
  services = runtime,
  deletionServices,
  requestKey = "live",
}: {
  onAskKora: (reference?: ConversationContextReference, draft?: string) => void;
  services?: GoalDetailServices;
  deletionServices?: DeleteWorkServices;
  requestKey?: string;
}) {
  useViewBar(() => ({ title: "Work", titleRole: "label" }), []);
  const params = useParams();
  const projectId = params.goalId ?? params.projectId ?? "";
  const location = useLocation();
  const navigate = useNavigate();
  const [projectParams, setProjectParams] = useSearchParams();
  const goalsReturnTo = workReturnPath(new URLSearchParams(location.search).get("returnTo"), "/work/goals");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false),
    [createTaskSignal, setCreateTaskSignal] = useState(0),
    [openCreatorOnList, setOpenCreatorOnList] = useState(false),
    [creatorLoading, setCreatorLoading] = useState(false),
    [currentLoadError, setCurrentLoadError] = useState<string>(),
    [historyOpen, setHistoryOpen] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [moreCurrent, setMoreCurrent] = useState<WorkOutlineNode[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string>();
  const [currentPageExhausted, setCurrentPageExhausted] = useState(false);
  const [moreHistory, setMoreHistory] = useState<WorkOutlineNode[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string>();
  const [historyComplete, setHistoryComplete] = useState(false);
  const goal = useQuery({
    queryKey: ["work", "project", requestKey, projectId],
    queryFn: async () => {
      if (!services.goalWorkspace) {
        const legacy = await services.projectWorkspace!(projectId);
        return { ...legacy, goal: goalFromLegacyProject(legacy.project) } satisfies GoalWorkspaceView;
      }
      const view = await services.goalWorkspace(projectId);
      return view;
    },
    enabled: Boolean(projectId),
  });
  const active = useQuery({
    queryKey: ["work", "active", requestKey],
    queryFn: services.activeWork,
  });
  const history = useQuery({
    queryKey: ["work", "project-outline", requestKey, projectId, "terminal"],
    queryFn: () => services.goalOutline
      ? services.goalOutline(projectId, "terminal")
      : services.projectOutline!(projectId, "terminal"),
    enabled: historyOpen && Boolean(projectId),
  });
  useEffect(() => {
    setMoreHistory([]);
    setHistoryCursor(history.data?.cursor);
    setHistoryComplete(history.data?.complete ?? false);
  }, [history.data]);
  const loadMoreHistory = useMutation({
    mutationFn: () => {
      const outline = services.goalOutline ?? services.projectOutline;
      if (!outline || !historyCursor) throw new Error("More Project history is not available yet.");
      return outline(projectId, "terminal", 50, historyCursor);
    },
    onSuccess: (page) => {
      setMoreHistory((current) => [...current, ...page.nodes]);
      setHistoryCursor(page.cursor);
      setHistoryComplete(page.complete || !page.cursor);
    },
  });
  const historyMoreError = loadMoreHistory.isError;
  const focus = useMutation({
    mutationFn: async () => {
      if (!active.data || !goal.data)
        throw new Error("Current focus is not available yet.");
      const target = { type: "project" as const, id: goal.data.goal.id };
      return goal.data.focus.inUserAttention
        ? services.removeWorkFocus(target, active.data.version)
        : services.addWorkFocus(target, active.data.version);
    },
    onMutate: () => {
      setAnnouncement("");
    },
    onSuccess: async () => {
      const removing = Boolean(goal.data?.focus.inUserAttention);
      setAnnouncement(
        removing
          ? "Removed this Project from focus."
          : "Added this Project to focus.",
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["work", "active", requestKey],
        }),
        queryClient.invalidateQueries({
          queryKey: ["work", "project", requestKey, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] }),
      ]);
    },
  });
  useEffect(() => {
    setMoreCurrent([]);
    setCurrentCursor(undefined);
    setCurrentPageExhausted(false);
  }, [projectId]);
  const currentNodes = [...(goal.data?.work.nodes ?? []), ...moreCurrent];
  const currentItems = useMemo(
    () => flattenCurrentWork(currentNodes),
    [currentNodes],
  );
  const requestedTab = projectParams.get("view");
  const projectTab: ProjectTab = requestedTab && PROJECT_TAB_VALUES.has(requestedTab as ProjectTab)
    ? requestedTab as ProjectTab
    : "list";
  const updateProjectTab = (next: string) => {
    const value = next as ProjectTab;
    if (!PROJECT_TAB_VALUES.has(value)) return;
    const nextParams = new URLSearchParams(projectParams);
    // Keep the selected project surface in the shared, safe Work return state.
    if (value === "list") nextParams.delete("view");
    else nextParams.set("view", value);
    setProjectParams(nextParams, { replace: true });
  };
  const legacyScopedWorkItems: WorkTasksServices["workItems"] = async (input = {}) => {
    const currentView = goal.data;
    if (!currentView || input.goalId !== currentView.goal.id) return { items: [], complete: true } satisfies WorkItemListPage;
    const outline = services.goalOutline ?? services.projectOutline;
    const useWorkspacePage = !input.cursor && (!input.filter || input.filter === "open") && !input.kind && !input.query;
    const page = useWorkspacePage
      ? { nodes: currentNodes, cursor: currentView.work.cursor, complete: currentView.work.complete }
      : outline
        ? await outline(projectId, input.filter === "terminal" ? "terminal" : "current", input.limit ?? 50, input.cursor)
        : { nodes: [], complete: true };
    const terminal = new Set<WorkItem["state"]>(["completed", "cancelled", "archived"]);
    const normalizedQuery = input.query?.trim().toLocaleLowerCase();
    const items = flattenCurrentWork(page.nodes).filter((item) => {
      if (input.filter === "terminal" && !terminal.has(item.state)) return false;
      if (input.filter === "active" && item.state !== "active") return false;
      if (input.filter === "planned" && item.state !== "planned") return false;
      if (input.filter === "blocked" && item.state !== "blocked") return false;
      if ((!input.filter || input.filter === "open") && terminal.has(item.state)) return false;
      if (input.kind && item.kind !== input.kind) return false;
      if (normalizedQuery && !`${item.title}\n${item.descriptionMarkdown ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
    return {
      items: items.map((item) => ({ item, goal: currentView.goal, inUserAttention: false })),
      cursor: page.cursor,
      complete: page.complete,
    } satisfies WorkItemListPage;
  };
  const taskServices: WorkTasksServices = {
    // Older injected Project adapters have no list service. Keep their loaded
    // outline useful while canonical runtime services use workItems directly.
    workItems: services.workItems ?? legacyScopedWorkItems,
    goalsPage: services.goalsPage ?? runtime.goalsPage,
    updateWorkItem: services.updateWorkItem ?? runtime.updateWorkItem,
    createGoalWorkItem: services.createGoalWorkItem ?? runtime.createGoalWorkItem,
  };
  const changed = (selected: SelectedWork) => {
    if (selected.type === "goal")
      queryClient.setQueryData<GoalWorkspaceView>(
        ["work", "project", requestKey, projectId],
        (current) =>
          current ? { ...current, goal: selected.record } : current,
      );
  };
  const loadedView = goal.data;
  const terminal = Boolean(loadedView && ["achieved", "stopped", "archived"].includes(loadedView.goal.lifecycle));
  const prepareTaskCreator = async (openCreator = true) => {
    if (!loadedView || terminal || goal.isError) return;
    if (currentPageExhausted) {
      if (openCreator) setCreateTaskSignal((current) => current + 1);
      return;
    }
    const outline = services.goalOutline ?? services.projectOutline;
    let cursor = currentCursor ?? loadedView.work.cursor;
    setCreatorLoading(true);
    setCurrentLoadError(undefined);
    try {
      // Keep parent discovery bounded. The modal remains usable with the
      // loaded outcomes, while this control can be used again for another
      // page instead of blocking on an entire project outline.
      if (cursor && outline) {
        const page = await outline(projectId, "current", 50, cursor);
        setMoreCurrent((current) => [...current, ...page.nodes]);
        cursor = page.cursor;
        setCurrentCursor(cursor);
        setCurrentPageExhausted(page.complete || !cursor);
      } else {
        setCurrentPageExhausted(true);
      }
    } catch (reason) {
      setCurrentLoadError(reason instanceof Error ? reason.message : "Some Project Work could not load.");
    } finally {
      setCreatorLoading(false);
      if (openCreator) setCreateTaskSignal((current) => current + 1);
    }
  };
  const requestTaskCreator = () => {
    if (!loadedView || terminal || goal.isError || creatorLoading) return;
    if (projectTab !== "list") {
      setOpenCreatorOnList(true);
      updateProjectTab("list");
      return;
    }
    void prepareTaskCreator();
  };
  useEffect(() => {
    if (!openCreatorOnList || projectTab !== "list" || !loadedView) return;
    setOpenCreatorOnList(false);
    void prepareTaskCreator();
    // The tab change intentionally gates creator preparation so the shared
    // scoped task surface receives its signal after it is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreatorOnList, projectTab, loadedView]);
  if (goal.isPending)
    return (
      <section className="goal-detail-workspace">
        <PageFrame
          width="wide"
          sidebar={<WorkNavigation />}
          sidebarLabel="Work"
        >
          <StateView state="loading" headingLevel={1} title="Opening Project" geometry={<GoalDetailLoading />} />
        </PageFrame>
      </section>
    );
  if (goal.isError && !goal.data) {
    const kind = goalErrorKind(goal.error);
    const offline = goal.error instanceof RuntimeRequestError && goal.error.code === "runtime_disconnected";
    if (kind === "restricted")
      return (
        <section className="goal-detail-workspace">
          <PageFrame
            width="wide"
            sidebar={<WorkNavigation />}
            sidebarLabel="Work"
          >
            <StateView
              state="denied"
              headingLevel={1}
              icon={<LockKeyhole size={20} aria-hidden="true" />}
              title="This Project needs approved access"
              body="Kora did not reveal the title or contents. Ask Kora to begin the exact-record access flow, or return to ordinary Projects."
              action={
                <div>
                  <Button
                    onClick={() =>
                      onAskKora({
                        kind: "project",
                        id: projectId,
                        title: "Restricted Project",
                      })
                    }
                  >
                    <MessageCircleMore size={15} aria-hidden="true" />
                    Ask Kora about access
                  </Button>
                  <Button tone="ghost" onClick={() => navigate(goalsReturnTo)}>
                    Return to Projects
                  </Button>
                </div>
              }
            />
          </PageFrame>
        </section>
      );
    if (kind === "missing")
      return (
        <section className="goal-detail-workspace">
          <PageFrame
            width="wide"
            sidebar={<WorkNavigation />}
            sidebarLabel="Work"
          >
            <StateView
              state="empty"
              headingLevel={1}
              title="This Project is no longer available"
              body="It may have been deleted or moved out of ordinary Work. No title or content can be recovered from this route."
              action={
                <Button onClick={() => navigate(goalsReturnTo)}>
                  Return to Projects
                </Button>
              }
            />
          </PageFrame>
        </section>
      );
    return (
      <section className="goal-detail-workspace">
        <PageFrame
          width="wide"
          sidebar={<WorkNavigation />}
          sidebarLabel="Work"
        >
          <StateView
            state="unavailable"
            headingLevel={1}
            title={offline ? "Project is offline" : "Project is temporarily unavailable"}
            body={offline ? "Kora's local runtime is disconnected, so this Project cannot be read. Nothing was changed; reconnect and retry or return to Projects." : "Kora could not read this local record. Nothing was changed, and the Projects view remains available."}
            action={
              <div>
                <Button onClick={() => void goal.refetch()}>Try again</Button>
                <Button tone="ghost" onClick={() => navigate(goalsReturnTo)}>
                  Return to Projects
                </Button>
              </div>
            }
          />
        </PageFrame>
      </section>
    );
  }
  const view = goal.data!;
  const properties = (
    <GoalProperties view={view} onDelete={() => setDeleting(true)} readOnly={goal.isError} showConnections={false} />
  );
  return (
    <section className="goal-detail-workspace">
      <RecordPage
        width="wide"
        sidebar={<WorkNavigation />}
        sidebarLabel="Work"
        details={properties}
        detailsLabel="Project details"
        detailsDescription="State, target, focus, context, activity, and management."
        breadcrumb={
            <Link className="k-record-page__back" to={goalsReturnTo}>
              <ArrowLeft size={14} aria-hidden="true" />
              Projects
            </Link>
          }
          title={view.goal.title}
          description={
            view.goal.purposeMarkdown || "No outcome has been recorded yet."
          }
          status={
            <>
              <Badge
                tone={
                  view.goal.lifecycle === "paused"
                    ? "danger"
                    : view.goal.lifecycle === "active"
                      ? "work"
                      : "neutral"
                }
                dot
              >
                {stateLabel(view.goal.lifecycle)}
              </Badge>
              {view.goal.targetDate ? (
                <span>
                  <CalendarDays size={13} aria-hidden="true" />
                  Target {shortDate(view.goal.targetDate)}
                </span>
              ) : null}
            </>
          }
          actions={
            <>
              <Button
                tone="ghost"
                onClick={() =>
                  onAskKora({
                    kind: "project",
                    id: view.goal.id,
                    title: view.goal.title,
                  })
                }
              >
                <MessageCircleMore size={15} aria-hidden="true" />
                Ask Kora
              </Button>
              <Button
                tone="ghost"
                onClick={() => focus.mutate()}
                loading={focus.isPending}
                disabled={goal.isError || active.isPending || active.isError}
              >
                <Target size={15} aria-hidden="true" />
                {view.focus.inUserAttention ? "Remove focus" : "Add to focus"}
              </Button>
              <Button onClick={() => setEditing(true)} disabled={goal.isError}>
                <Pencil size={15} aria-hidden="true" />
                Edit
              </Button>
              {!terminal ? (
              <Button tone="primary" onClick={requestTaskCreator} loading={creatorLoading} disabled={goal.isError || creatorLoading}>
                  <Plus size={15} aria-hidden="true" />
                  Add task
                </Button>
              ) : null}
            </>
          }
      >
        {goal.isError ? (
          <StateView
            state="partial"
            title="Showing last-confirmed Project"
            body="This Project could not refresh. Its saved details remain readable, but changes are paused until Kora can confirm the latest local version."
            action={<Button tone="ghost" onClick={() => void goal.refetch()}><RefreshCw size={14} aria-hidden="true" />Retry Project refresh</Button>}
          />
        ) : null}
        {announcement ? (
          <p role="status" aria-live="polite">
            {announcement}
          </p>
        ) : null}
        {focus.isError ? (
          <StateView
            state="error"
            title="Focus did not change"
            body="Kora could not change this Project's focus state. Nothing else changed."
            action={
              <Button tone="ghost" onClick={() => focus.mutate()}>
                <RefreshCw size={14} aria-hidden="true" />
                Try again
              </Button>
            }
          />
        ) : null}
        {active.isError ? (
          <StateView
            state="partial"
            title="Focus is temporarily unavailable"
            body="The Project remains readable. Retry focus status before changing attention."
            action={
              <Button tone="ghost" onClick={() => void active.refetch()}>
                <RefreshCw size={14} aria-hidden="true" />
                Retry focus
              </Button>
            }
          />
        ) : null}
        {currentLoadError ? (
          <div className="goal-detail__notice goal-detail__notice--action" role="status">
            <span>Some current Project Work could not load. The creator remains usable, but parent outcome choices may be incomplete.</span>
            <Button tone="ghost" onClick={() => void prepareTaskCreator(false)} loading={creatorLoading} disabled={creatorLoading}>Retry parent outcomes</Button>
          </div>
        ) : null}
        {!currentLoadError && !terminal && !goal.isError && !currentPageExhausted && (currentCursor ?? view.work.cursor) ? (
          <div className="goal-detail__notice goal-detail__notice--action" role="status">
            <span>Some current Work remains outside this page. Load another page to include more parent outcomes.</span>
            <Button tone="ghost" onClick={() => void prepareTaskCreator(false)} loading={creatorLoading} disabled={creatorLoading}>Load more parent outcomes</Button>
          </div>
        ) : null}
        <section className="goal-detail-position" aria-label="Current project position">
          <div>
            <span>Current position</span>
            <p>{view.goal.currentPositionMarkdown || view.goal.pauseReason || "No current position recorded."}</p>
          </div>
        </section>
        {view.goal.resultMarkdown ? (
          <PageSection
            title="Result"
            description="The durable outcome recorded when this Project reached a terminal state."
          >
            <div className="goal-result">
              <CheckCircle2 size={18} aria-hidden="true" />
              <p>{view.goal.resultMarkdown}</p>
            </div>
          </PageSection>
        ) : null}
        <PageTabs
          label="Project views"
          value={projectTab}
          onValueChange={updateProjectTab}
          items={[
            {
              value: "list",
              label: <><ListTodo size={14} aria-hidden="true" />List</>,
              panel: projectTab === "list" ? <WorkTasksWorkspace embedded scope={{ goalId: view.goal.id, title: view.goal.title }} services={taskServices} requestKey={requestKey} onAskKora={(reference, draft) => onAskKora(reference ?? { kind: "project", id: view.goal.id, title: view.goal.title }, draft)} createSignal={createTaskSignal} createTaskOnly={false} createParents={currentItems} createDisabledReason={terminal || goal.isError ? "Project creation is unavailable until this Project is current and open." : undefined} /> : null,
            },
            {
              value: "board",
              label: <><Columns3 size={14} aria-hidden="true" />Board</>,
              panel: projectTab === "board" ? <WorkTasksWorkspace embedded scope={{ goalId: view.goal.id, title: view.goal.title }} services={taskServices} requestKey={requestKey} onAskKora={(reference, draft) => onAskKora(reference ?? { kind: "project", id: view.goal.id, title: view.goal.title }, draft)} createSignal={createTaskSignal} createTaskOnly={false} createParents={currentItems} createDisabledReason={terminal || goal.isError ? "Project creation is unavailable until this Project is current and open." : undefined} /> : null,
            },
            {
              value: "timeline",
              label: <><CalendarDays size={14} aria-hidden="true" />Timeline</>,
              panel: projectTab === "timeline" ? <WorkTimelineWorkspace embedded scope={{ goal: view.goal }} onAskKora={(reference) => onAskKora(reference)} requestKey={requestKey} /> : null,
            },
            {
              value: "documents",
              label: <><Link2 size={14} aria-hidden="true" />Documents</>,
              panel: projectTab === "documents" ? <ConnectionsSection recordType="project" recordId={view.goal.id} connections={view.connections.items} cursor={view.connections.cursor} complete={view.connections.complete} readOnly={goal.isError || terminal} /> : null,
            },
          ]}
        />
        <Disclosure
          summary="Project details and history"
          description="Milestones, completed Work, and the full project settings remain available when you need them."
          meta={history.data ? `${history.data.nodes.length + moreHistory.length} history loaded` : undefined}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          icon={<CheckCircle2 size={15} />}
        >
          <div className="goal-detail-secondary">
            <PageSection title="Milestones" description="Checkpoints recorded inside this Project." headingLevel={3}>
              {currentItems.some((item) => item.kind === "milestone") ? <ul className="goal-milestones">{currentItems.filter((item) => item.kind === "milestone").map((item) => <li key={item.id} data-state={item.state}><span aria-hidden="true"><Flag size={14} /></span><Link to={`/work/tasks/${encodeURIComponent(item.id)}`}>{item.title}</Link><small>{stateLabel(item.state)}{dueLabel(item) ? ` · ${dueLabel(item)}` : ""}</small></li>)}</ul> : <StateView state="empty" title="No milestones yet" body="Use milestones for meaningful checkpoints; ordinary steps belong in Tasks." />}
            </PageSection>
            <PageSection title="Completed and cancelled Work" description="Terminal Work stays readable without competing with the current task list." headingLevel={3}>
              {history.isPending ? <StateView state="loading" title="Gathering history" /> : history.isError && !history.data ? <StateView state="error" title="Project history is unavailable" body="The current Project remains readable. Try again to load completed and cancelled Work." action={<Button onClick={() => void history.refetch()}>Retry history</Button>} /> : history.data?.nodes.length || moreHistory.length ? <ul className="goal-work-list">{[...(history.data?.nodes ?? []), ...moreHistory].map((node) => <li key={node.item.id}><GoalWorkRow item={node.item} /></li>)}</ul> : <StateView state="empty" title="No completed or cancelled Work" />}
              {historyMoreError ? <div className="goal-detail__notice" role="alert">More Project history could not load. The history already shown remains available.<Button tone="ghost" onClick={() => loadMoreHistory.mutate()} disabled={loadMoreHistory.isPending}>Try again</Button></div> : null}
              {!historyComplete && historyCursor ? <Button tone="ghost" onClick={() => loadMoreHistory.mutate()} loading={loadMoreHistory.isPending}>Load more history</Button> : null}
            </PageSection>
          </div>
        </Disclosure>
      </RecordPage>
      <AnimatePresence initial={false}>
        {editing ? (
          <WorkInspector
            selected={{ type: "goal", record: view.goal }}
            activeVersion={active.data?.version}
            inFocus={view.focus.inUserAttention}
            onClose={() => setEditing(false)}
            onChanged={changed}
            onFocusChange={() => focus.mutate()}
            focusBusy={focus.isPending}
            onAskKora={() =>
              onAskKora({
                kind: "project",
                id: view.goal.id,
                title: view.goal.title,
              })
            }
            initialEditing
          />
        ) : null}
      </AnimatePresence>
      <DeleteWorkRecordModal
        open={deleting}
        onOpenChange={setDeleting}
        surface="project"
        id={view.goal.id}
        title={view.goal.title}
        services={deletionServices}
        onDeleted={() => {
          queryClient.removeQueries({
            queryKey: ["work", "project", projectId],
          });
          navigate("/work", { replace: true });
        }}
      />
    </section>
  );
}
