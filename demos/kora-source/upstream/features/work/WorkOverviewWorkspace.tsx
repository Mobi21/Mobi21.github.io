import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  ListTodo,
  Plus,
  Target,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  PageFrame,
  PageHeader,
  PageSection,
  Pressable,
  StateView,
  type BadgeTone,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type Goal,
  type GoalListEntry,
  type WorkItem,
  type WorkItemListEntry,
} from "../../lib/runtime";
import { WorkNavigation } from "./WorkNavigation";
import { workDetailHref } from "./work-navigation-state";
import "./work-overview.css";

export type WorkOverviewServices = Partial<
  Pick<typeof runtime, "goalsPage" | "workItems">
>;

const stateLabel = (state: Goal["lifecycle"] | WorkItem["state"]) => {
  if (state === "active") return "In progress";
  if (state === "blocked") return "Blocked";
  if (state === "paused") return "Paused";
  if (state === "completed" || state === "achieved") return "Completed";
  if (state === "cancelled" || state === "stopped") return "Stopped";
  if (state === "archived") return "Archived";
  if (state === "idea") return "Idea";
  return "Planned";
};

const stateTone = (state: Goal["lifecycle"] | WorkItem["state"]): BadgeTone =>
  state === "active"
    ? "work"
    : state === "blocked" || state === "paused"
      ? "danger"
      : state === "completed" || state === "achieved"
        ? "success"
        : state === "cancelled" || state === "stopped" || state === "archived"
          ? "quiet"
          : "neutral";

function dateLabel(value?: string) {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(date);
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isOverdue(item: WorkItem, now: Date) {
  return Boolean(item.dueAt && new Date(item.dueAt).getTime() < dayStart(now));
}

function isDueSoon(item: WorkItem, now: Date) {
  if (!item.dueAt) return false;
  const due = new Date(item.dueAt).getTime();
  const today = dayStart(now);
  return due >= today && due <= today + 7 * 86_400_000;
}

function isAttentionScheduled(item: WorkItem, now: Date) {
  if (!item.attentionAt) return false;
  const attentionAt = new Date(item.attentionAt).getTime();
  return !Number.isNaN(attentionAt) && attentionAt <= now.getTime();
}

function taskGoal(entry: WorkItemListEntry) {
  return entry.goal?.title ?? entry.project?.title ?? (entry.item.goalId ? "Project context unavailable" : "Independent Work");
}

function taskDate(entry: WorkItemListEntry, now: Date) {
  if (isOverdue(entry.item, now)) return "Overdue";
  if (isAttentionScheduled(entry.item, now)) return `Attention ${dateLabel(entry.item.attentionAt) ?? "now"}`;
  if (entry.item.dueAt) return `Due ${dateLabel(entry.item.dueAt) ?? "date unavailable"}`;
  if (entry.item.attentionAt) return `Attention ${dateLabel(entry.item.attentionAt) ?? "date unavailable"}`;
  return "No date recorded";
}

function AttentionTask({ entry, returnTo }: { entry: WorkItemListEntry; returnTo: string }) {
  const tone = entry.item.state === "blocked" || entry.item.blocker ? "danger" : entry.inUserAttention ? "work" : "neutral";
  return (
    <li className="work-overview-attention__item">
      <span className={`work-overview-attention__signal is-${tone}`} aria-hidden="true" />
      <div className="work-overview-attention__identity">
        <Link to={workDetailHref(`/work/tasks/${encodeURIComponent(entry.item.id)}`, returnTo, "/work/tasks")}>
          {entry.item.title}
        </Link>
        <span>{taskGoal(entry)}</span>
      </div>
      <div className="work-overview-attention__detail">
        <Badge tone={stateTone(entry.item.state)} dot>{entry.item.state === "blocked" ? "Blocked" : entry.inUserAttention ? "In focus" : taskDate(entry, new Date())}</Badge>
        {entry.item.blocker ? <span className="work-overview-attention__blocker"><CircleAlert size={13} aria-hidden="true" />{entry.item.blocker}</span> : null}
      </div>
    </li>
  );
}

function ActiveProject({ entry, returnTo }: { entry: GoalListEntry; returnTo: string }) {
  const target = entry.goal.targetDate ?? entry.goal.hardDeadline;
  return (
    <li className="work-overview-project__item">
      <span className="work-overview-project__marker" aria-hidden="true"><Target size={14} /></span>
      <div className="work-overview-project__identity">
        <Link to={workDetailHref(`/work/goals/${encodeURIComponent(entry.goal.id)}`, returnTo, "/work/goals")}>
          {entry.goal.title}
        </Link>
        <span>{entry.nextOpenWorkItem ? `Next · ${entry.nextOpenWorkItem.title}` : "No next action recorded"}</span>
      </div>
      <div className="work-overview-project__meta">
        <Badge tone={stateTone(entry.goal.lifecycle)} dot>{stateLabel(entry.goal.lifecycle)}</Badge>
        {target ? <span><CalendarDays size={13} aria-hidden="true" />{dateLabel(target)}</span> : null}
      </div>
    </li>
  );
}

function ProjectPreview({ entry, returnTo }: { entry: GoalListEntry; returnTo: string }) {
  return (
    <li className="work-overview-register__item">
      <Link to={workDetailHref(`/work/goals/${encodeURIComponent(entry.goal.id)}`, returnTo, "/work/goals")}>
        {entry.goal.title}
      </Link>
      <span>{entry.goal.area || "General"}</span>
      <Badge tone={stateTone(entry.goal.lifecycle)} dot>{stateLabel(entry.goal.lifecycle)}</Badge>
      <span>{entry.visibleOpenWorkItemCount} open {entry.visibleOpenWorkItemCount === 1 ? "item" : "items"}</span>
    </li>
  );
}

function OverviewSkeleton() {
  return <div className="work-overview-skeleton" role="status" aria-label="Loading Work overview" aria-busy="true"><i /><i /><i /></div>;
}

export function WorkOverviewWorkspace({
  onAskKora,
  services = runtime,
  requestKey = "live",
}: {
  onAskKora?: (reference?: ConversationContextReference, draft?: string) => void;
  services?: WorkOverviewServices;
  requestKey?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = `${location.pathname}${location.search}`;
  const goalsQuery = useInfiniteQuery({
    queryKey: ["work", "overview", "projects", requestKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => services.goalsPage!({
      filter: "open",
      includeArchived: false,
      limit: 24,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const tasksQuery = useInfiniteQuery({
    queryKey: ["work", "overview", "tasks", requestKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => services.workItems!({
      filter: "open",
      limit: 40,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const goals = useMemo(() => goalsQuery.data?.pages.flatMap((page) => page.items) ?? [], [goalsQuery.data]);
  const taskEntries = useMemo(() => tasksQuery.data?.pages.flatMap((page) => page.items) ?? [], [tasksQuery.data]);
  const now = new Date();
  const attention = useMemo(() => taskEntries
    .filter((entry) => entry.item.state === "blocked" || Boolean(entry.item.blocker) || entry.inUserAttention || isOverdue(entry.item, now) || isDueSoon(entry.item, now) || isAttentionScheduled(entry.item, now))
    .sort((left, right) => {
      const rank = (entry: WorkItemListEntry) => (entry.item.state === "blocked" || entry.item.blocker ? 40 : 0) + (isOverdue(entry.item, now) ? 30 : 0) + (entry.inUserAttention ? 20 : 0) + (isAttentionScheduled(entry.item, now) ? 15 : 0) + (isDueSoon(entry.item, now) ? 10 : 0);
      return rank(right) - rank(left) || new Date(left.item.dueAt ?? left.item.updatedAt).getTime() - new Date(right.item.dueAt ?? right.item.updatedAt).getTime();
    }), [taskEntries, now]);
  const activeProjects = useMemo(() => goals
    .filter((entry) => entry.goal.lifecycle === "active" || entry.inUserAttention)
    .sort((left, right) => Number(right.inUserAttention) - Number(left.inUserAttention) || right.goal.priority - left.goal.priority), [goals]);
  const goalsComplete = goalsQuery.data?.pages.at(-1)?.complete ?? false;
  const tasksComplete = tasksQuery.data?.pages.at(-1)?.complete ?? false;
  const projectsUnavailable = goalsQuery.isError && !goals.length;
  const tasksUnavailable = tasksQuery.isError && !taskEntries.length;
  const loading = goalsQuery.isPending || tasksQuery.isPending;
  const partial = (goalsQuery.isError && goals.length) || (tasksQuery.isError && taskEntries.length) || !goalsComplete || !tasksComplete;
  const offline = [goalsQuery.error, tasksQuery.error].some((reason) => reason instanceof RuntimeRequestError && reason.code === "runtime_disconnected");
  const coverageStatus = goalsQuery.isError || tasksQuery.isError
    ? "Some Work could not refresh"
    : partial
      ? "Showing loaded Work · more available"
      : "Current Work";

  return (
    <section className="work-overview-workspace">
      <PageFrame width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work">
        <PageHeader
          title="Work"
          description="A clear starting point for the work that needs you and the projects moving forward."
          status={<span>{loading ? "Gathering current Work" : coverageStatus}</span>}
          actions={<Button tone="primary" onClick={() => navigate("/work/goals?new=1")}><Plus size={15} aria-hidden="true" />New project</Button>}
        />
        {loading ? <OverviewSkeleton /> : null}
        {!loading && projectsUnavailable && tasksUnavailable ? (
          <StateView state="unavailable" title={offline ? "Work is offline" : "Work overview is unavailable"} body={offline ? "Kora's local runtime is disconnected. Reconnect and try again; no Work was changed." : "Kora could not read the current Work collections. Your existing records were not changed."} action={<Button onClick={() => { void goalsQuery.refetch(); void tasksQuery.refetch(); }}>Try again</Button>} />
        ) : null}
        {!loading && !(projectsUnavailable && tasksUnavailable) ? (
          <>
            {partial ? <div className="work-overview-coverage" role="status">
              <span>Showing available Work.</span>
              <span>{goalsQuery.isError ? "Projects could not refresh." : !goalsComplete ? "More projects remain." : null}{tasksQuery.isError ? " Tasks could not refresh." : !tasksComplete ? " More tasks remain." : null}</span>
              {goalsQuery.isError || tasksQuery.isError ? <Button tone="ghost" onClick={() => { if (goalsQuery.isError) void goalsQuery.refetch(); if (tasksQuery.isError) void tasksQuery.refetch(); }}>Retry</Button> : null}
              {!goalsQuery.isError && !goalsComplete && goalsQuery.hasNextPage ? <Button tone="ghost" onClick={() => void goalsQuery.fetchNextPage()} loading={goalsQuery.isFetchingNextPage}>Load more projects</Button> : null}
              {!tasksQuery.isError && !tasksComplete && tasksQuery.hasNextPage ? <Button tone="ghost" onClick={() => void tasksQuery.fetchNextPage()} loading={tasksQuery.isFetchingNextPage}>Load more tasks</Button> : null}
            </div> : null}
            <div className="work-overview-grid">
              <PageSection title="Needs attention" description="Blocked, focused, or dated tasks that may need a decision today." className="work-overview-attention">
                {tasksUnavailable ? <StateView state="unavailable" title="Tasks are unavailable" body="The project overview remains available. Retry to restore task attention." action={<Button onClick={() => void tasksQuery.refetch()}>Retry tasks</Button>} /> : attention.length ? <ul className="work-overview-attention__list">{attention.slice(0, 7).map((entry) => <AttentionTask key={entry.item.id} entry={entry} returnTo={returnTo} />)}</ul> : <StateView state="empty" title="Nothing needs attention yet" body="When a task is blocked, focused, or dated soon, it will appear here." action={<Button tone="ghost" onClick={() => navigate("/work/tasks")}>Open all tasks</Button>} />}
                {attention.length > 7 ? <Link className="work-overview-section-link" to="/work/tasks">View all tasks <ArrowRight size={14} aria-hidden="true" /></Link> : null}
              </PageSection>
              <div className="work-overview-secondary">
                <PageSection title="Active projects" description="Projects with work currently moving or held in focus." className="work-overview-projects">
                  {projectsUnavailable ? <StateView state="unavailable" title="Projects are unavailable" body="Retry to see current project context." action={<Button onClick={() => void goalsQuery.refetch()}>Retry projects</Button>} /> : activeProjects.length ? <ul className="work-overview-project__list">{activeProjects.slice(0, 5).map((entry) => <ActiveProject key={entry.goal.id} entry={entry} returnTo={returnTo} />)}</ul> : <StateView state="empty" title="No active projects" body="Start a project when there is an outcome you want to move forward." action={<Button onClick={() => navigate("/work/goals?new=1")}>Create a project</Button>} />}
                  {activeProjects.length > 5 ? <Link className="work-overview-section-link" to="/work/goals">View all projects <ArrowRight size={14} aria-hidden="true" /></Link> : null}
                </PageSection>
                {onAskKora ? <Pressable className="work-overview-prompt" onClick={() => onAskKora(undefined, "Help me review the current Work overview and choose one useful next step without changing anything yet.")}><ListTodo size={17} aria-hidden="true" /><span><strong>Need help choosing?</strong><small>Review the current Work with Kora before anything changes.</small></span><ArrowRight size={15} aria-hidden="true" /></Pressable> : null}
              </div>
            </div>
            <PageSection title="Projects" description={goalsComplete ? "Your current project collection." : "The first page of your project collection."} className="work-overview-register" actions={<Link className="work-overview-section-link" to="/work/goals">Browse all <ArrowRight size={14} aria-hidden="true" /></Link>}>
              {projectsUnavailable ? <StateView state="unavailable" title="Projects are unavailable" body="Retry when the local runtime is available." action={<Button onClick={() => void goalsQuery.refetch()}>Retry projects</Button>} /> : goals.length ? <ul className="work-overview-register__list">{goals.slice(0, 8).map((entry) => <ProjectPreview key={entry.goal.id} entry={entry} returnTo={returnTo} />)}</ul> : <StateView state="empty" title="No projects yet" body="Give an outcome a clear home, then add its first task." action={<Button tone="primary" onClick={() => navigate("/work/goals?new=1")}>Create your first project</Button>} />}
            </PageSection>
          </>
        ) : null}
      </PageFrame>
    </section>
  );
}
