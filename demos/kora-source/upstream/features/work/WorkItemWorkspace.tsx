import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, CircleX, Clock3, GitBranch, Link2, MessageCircleMore, Pencil, RefreshCw, Target, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Disclosure, PageFrame, PageSection, RecordPage, Skeleton, StateView, type BadgeTone } from "../../components/primitives";
import { useViewBar } from "../../app/ViewBar";
import { runtime, RuntimeRequestError, type ConversationContextReference, type WorkConnectionSummary, type WorkItem, type WorkItemWorkspaceView } from "../../lib/runtime";
import { WorkInspector, type SelectedWork } from "./WorkInspector";
import { ActivitySection, ConnectionsSection, DeleteWorkRecordModal, type DeleteWorkServices } from "./WorkDetailShared";
import { WorkNavigation } from "./WorkNavigation";
import { workReturnPath } from "./work-navigation-state";
import "./work.css";
import "./task-detail.css";

export type TaskDetailServices = Pick<typeof runtime, "workItemWorkspace" | "activeWork" | "addWorkFocus" | "removeWorkFocus"> & {
  workItemChildren: (id: string, limit?: number, cursor?: string) => Promise<{ items: WorkItem[]; cursor?: string; complete: boolean }>;
};

const humanize = (value: string) => value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
const stateLabel = (state: WorkItem["state"]) => state === "active" ? "In progress" : humanize(state);
const stateTone = (state: WorkItem["state"]): BadgeTone => state === "blocked" ? "danger" : state === "active" ? "work" : state === "completed" ? "success" : state === "cancelled" || state === "archived" ? "quiet" : "neutral";
const priorityLabel = (priority: number) => ["Someday", "Low", "Normal", "High", "Highest"][priority] ?? `Priority ${priority}`;
const isTerminal = (state: WorkItem["state"]) => ["completed", "cancelled", "archived"].includes(state);
const fullDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

function taskErrorKind(reason: unknown): "missing" | "unavailable" {
  if (!(reason instanceof RuntimeRequestError)) return "unavailable";
  if (reason.code === "not_found" || reason.status === 404) return "missing";
  return "unavailable";
}

function TaskAssignee({ view }: { view: WorkItemWorkspaceView }) {
  const name = view.assignee?.displayName;
  return <>{name ?? (view.item.personId ? "Assignee unavailable" : "Unassigned")}</>;
}

function TaskDetailLoading() {
  return <div className="task-detail-loading" aria-hidden="true">
    <div className="task-detail-loading__header"><Skeleton rows={3} /></div>
    <div className="task-detail-loading__section"><Skeleton rows={3} /></div>
    <div className="task-detail-loading__section"><Skeleton rows={5} /></div>
    <div className="task-detail-loading__section"><Skeleton rows={2} /></div>
  </div>;
}

function TaskProperties({ view, onDelete, readOnly = false }: { view: WorkItemWorkspaceView; onDelete: () => void; readOnly?: boolean }) {
  const { item, goal, focus } = view;
  const contextualConnections = view.connections.items.filter((connection) => !(connection.relation === "depends_on" && connection.target.type === "work_item"));
  return <div className="k-record-page__properties task-properties">
    <section><h2>Properties</h2><dl>
      <div><dt>Kind</dt><dd>{humanize(item.kind)}</dd></div>
      <div><dt>Project</dt><dd>{goal ? <Link to={`/work/goals/${encodeURIComponent(goal.id)}`}>{goal.title}</Link> : item.goalId ? "Project unavailable" : "No Project"}</dd></div>
      <div><dt>Area</dt><dd>{item.area ?? goal?.area ?? "General"}</dd></div>
      <div><dt>State</dt><dd>{stateLabel(item.state)}</dd></div>
      <div><dt>Priority</dt><dd>{priorityLabel(item.priority)}</dd></div>
      <div><dt>Assigned to</dt><dd><TaskAssignee view={view} /></dd></div>
      <div><dt>Due</dt><dd>{fullDate(item.dueAt) ?? "No due date"}</dd></div>
      {item.attentionAt ? <div><dt>Attention</dt><dd>{fullDate(item.attentionAt)}</dd></div> : null}
      {focus.inUserAttention ? <div><dt>Focus</dt><dd>In focus</dd></div> : null}
      <div><dt>Updated</dt><dd>{fullDate(item.updatedAt)}</dd></div>
    </dl></section>
    <ConnectionsSection recordType="work_item" recordId={item.id} connections={contextualConnections} cursor={view.connections.cursor} complete={view.connections.complete} readOnly={readOnly} />
    {!view.connections.complete ? <p className="task-properties__qualification" role="status">Some connected context is not available. The records shown above are still usable.</p> : null}
    <Disclosure summary="Activity"><ActivitySection items={view.activity.items} /></Disclosure>
    {!view.activity.complete ? <p className="task-properties__qualification" role="status">Recent activity is incomplete. Earlier entries were not returned.</p> : null}
    <Disclosure summary="Manage task"><section className="task-properties__management"><Button tone="danger" onClick={onDelete} disabled={readOnly}><Trash2 size={14} aria-hidden="true" />Delete Work item</Button></section></Disclosure>
  </div>;
}

function TaskRelationships({ view, items, canLoadMore, onLoadMore, loadingMore, loadError }: { view: WorkItemWorkspaceView; items: WorkItem[]; canLoadMore: boolean; onLoadMore: () => void; loadingMore: boolean; loadError?: string }) {
  if (!view.parent && !items.length && !loadError) return <p className="task-detail__optional">No parent or subtasks recorded</p>;
  return <div className="task-relationships">
    {view.parent ? <div className="task-relationships__parent"><span>Parent {humanize(view.parent.kind)}</span><Link to={`/work/tasks/${encodeURIComponent(view.parent.id)}`}>{view.parent.title}</Link></div> : null}
    {items.length ? <ul>{items.map((child) => <li key={child.id}><span className={`work-state work-state--${child.state}`} aria-hidden="true" /><div><Link to={`/work/tasks/${encodeURIComponent(child.id)}`}>{child.title}</Link><small>{humanize(child.kind)} · {stateLabel(child.state)}{child.dueAt ? ` · ${fullDate(child.dueAt)}` : ""}</small></div>{child.blocker ? <span className="task-relationships__blocked"><CircleAlert size={13} aria-hidden="true" />Blocked</span> : null}</li>)}</ul> : null}
    {loadError ? <div className="task-detail__local-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><div><strong>More related Work could not load</strong><p>{loadError}</p></div><Button tone="ghost" onClick={onLoadMore}><RefreshCw size={14} aria-hidden="true" />Try again</Button></div> : null}
    {canLoadMore && !loadError ? <Button tone="ghost" onClick={onLoadMore} loading={loadingMore}>Load more related Work</Button> : null}
  </div>;
}

function Dependencies({ connections }: { connections: WorkConnectionSummary[] }) {
  const dependencies = connections.filter((connection) => connection.relation === "depends_on" && connection.target.type === "work_item");
  if (!dependencies.length) return <p className="task-detail__optional">No dependencies recorded</p>;
  return <ul className="task-dependencies">{dependencies.map((connection) => {
    const targetId = connection.target.type === "work_item" ? connection.target.id : "";
    return <li key={connection.id}><Link2 size={15} aria-hidden="true" /><div><Link to={`/work/tasks/${encodeURIComponent(targetId)}`}>{connection.label}</Link><small>{connection.availability === "available" ? "Available" : humanize(connection.availability)}</small></div></li>;
  })}</ul>;
}

function ResultIcon({ item }: { item: WorkItem }): ReactNode {
  if (item.state === "completed") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (item.state === "cancelled") return <CircleX size={18} aria-hidden="true" />;
  if (item.state === "archived") return <Archive size={18} aria-hidden="true" />;
  if (item.state === "blocked") return <CircleAlert size={18} aria-hidden="true" />;
  return <Clock3 size={18} aria-hidden="true" />;
}

export function WorkItemWorkspace({ onAskKora, services = runtime, deletionServices, requestKey = "live" }: { onAskKora: (reference: ConversationContextReference) => void; services?: TaskDetailServices; deletionServices?: DeleteWorkServices; requestKey?: string }) {
  useViewBar(() => ({ title: "Work", titleRole: "label" }), []);
  const { itemId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tasksReturnTo = workReturnPath(new URLSearchParams(location.search).get("returnTo"), "/work/tasks");
  const returnLabel = tasksReturnTo.startsWith("/work/goals/")
    ? "Back to project"
    : tasksReturnTo.startsWith("/work/timeline")
      ? "Timeline"
      : tasksReturnTo === "/work"
        ? "Overview"
        : "Tasks";
  const queryClient = useQueryClient();
  const [inspectorMode, setInspectorMode] = useState<"edit" | "review">();
  const [deleting, setDeleting] = useState(false);
  const [moreChildren, setMoreChildren] = useState<WorkItem[]>([]);
  const [childrenCursor, setChildrenCursor] = useState<string>();
  const [currentPageExhausted, setCurrentPageExhausted] = useState(false);
  const [childrenError, setChildrenError] = useState<string>();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setMoreChildren([]);
    setChildrenCursor(undefined);
    setCurrentPageExhausted(false);
    setChildrenError(undefined);
    setAnnouncement("");
    setInspectorMode(undefined);
    setDeleting(false);
  }, [itemId]);

  const item = useQuery({ queryKey: ["work", "item", itemId, requestKey], queryFn: () => services.workItemWorkspace(itemId), enabled: Boolean(itemId) });
  const active = useQuery({ queryKey: ["work", "active", requestKey], queryFn: services.activeWork });
  const focus = useMutation({
    mutationFn: async () => {
      if (!active.data || !item.data) throw new Error("Current focus is not available yet.");
      const target = { type: "work_item" as const, id: item.data.item.id };
      return item.data.focus.inUserAttention ? services.removeWorkFocus(target, active.data.version) : services.addWorkFocus(target, active.data.version);
    },
    onSuccess: async () => {
      const removing = Boolean(item.data?.focus.inUserAttention);
      setAnnouncement(removing ? "Removed this Work item from focus." : "Added this Work item to focus.");
      await queryClient.invalidateQueries({ queryKey: ["work"] });
    },
  });
  const loadChildren = useMutation({
    mutationFn: () => services.workItemChildren(itemId, 50, childrenCursor ?? item.data?.children.cursor),
    onMutate: () => setChildrenError(undefined),
    onSuccess: (page) => {
      setMoreChildren((current) => [...current, ...page.items]);
      setChildrenCursor(page.cursor);
      setCurrentPageExhausted(page.complete || !page.cursor);
      setAnnouncement(`Loaded ${page.items.length} more related ${page.items.length === 1 ? "item" : "items"}.`);
    },
    onError: (reason) => setChildrenError(reason instanceof Error ? reason.message : "The next page is temporarily unavailable."),
  });
  const changed = (selected: SelectedWork, message?: string) => {
    if (selected.type !== "work_item") return;
    queryClient.setQueryData<WorkItemWorkspaceView>(["work", "item", itemId, requestKey], (current) => current ? { ...current, item: selected.record } : current);
    if (message) setAnnouncement(message);
  };

  if (item.isPending) return <section className="task-detail-workspace"><PageFrame width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work" inspector={<div className="task-properties task-properties--loading"><Skeleton rows={9} /></div>} inspectorLabel="Work-item details"><StateView state="loading" headingLevel={1} title="Opening Work item" geometry={<TaskDetailLoading />} /></PageFrame></section>;
  if (item.isError && !item.data) {
    const kind = taskErrorKind(item.error);
    const offline = item.error instanceof RuntimeRequestError && item.error.code === "runtime_disconnected";
    if (kind === "missing") return <section className="task-detail-workspace"><PageFrame width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work"><StateView state="empty" headingLevel={1} title="This Work item is no longer available" body="It may have been deleted or moved out of ordinary Work. No title or content can be recovered from this route." action={<Button onClick={() => navigate(tasksReturnTo)}>Return to Tasks</Button>} /></PageFrame></section>;
    return <section className="task-detail-workspace"><PageFrame width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work"><StateView state="unavailable" headingLevel={1} title={offline ? "Work item is offline" : "Work item is temporarily unavailable"} body={offline ? "Kora's local runtime is disconnected, so this record cannot be read. Nothing was changed; reconnect and retry or return to Tasks." : "Kora could not read this local record. Nothing was changed, and the Tasks view remains available."} action={<div className="task-detail__state-actions"><Button onClick={() => void item.refetch()}>Try again</Button><Button tone="ghost" onClick={() => navigate(tasksReturnTo)}>Return to Tasks</Button></div>} /></PageFrame></section>;
  }

  const view = item.data;
  const children = [...view.children.items, ...moreChildren];
  const canLoadMore = !currentPageExhausted && Boolean(childrenCursor ?? view.children.cursor);
  const terminal = isTerminal(view.item.state);
  const properties = <TaskProperties view={view} onDelete={() => setDeleting(true)} readOnly={item.isError} />;
  const statusCopy = view.item.state === "completed" ? view.item.resultMarkdown || "Completed without a recorded result." : view.item.state === "cancelled" ? view.item.cancellationReason || "Cancelled without a recorded reason." : view.item.state === "archived" ? "This record is archived and remains readable. Review its lifecycle to reactivate it when appropriate." : view.item.blocker ? view.item.blocker : "This Work item is still active. A result will appear here only after it reaches a terminal state.";
  const resultTitle = view.item.state === "completed" ? "Actual result" : view.item.state === "cancelled" ? "Cancellation" : view.item.state === "archived" ? "Archive status" : "Status and result";

   return <section className="task-detail-workspace">
     <RecordPage width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work" details={properties} detailsLabel="Work details" detailsDescription="Kind, Project, status, dates, assignment, focus, context, activity, and management." breadcrumb={<Link className="k-record-page__back" to={tasksReturnTo}><ArrowLeft size={14} aria-hidden="true" />{returnLabel}</Link>} title={view.item.title} description={view.goal ? <>Part of <Link to={`/work/goals/${encodeURIComponent(view.goal.id)}`}>{view.goal.title}</Link></> : view.item.goalId ? "Project context unavailable" : undefined} status={<><Badge tone={stateTone(view.item.state)} dot>{stateLabel(view.item.state)}</Badge><span>{humanize(view.item.kind)}</span>{view.item.dueAt ? <span><CalendarClock size={13} aria-hidden="true" />Due {fullDate(view.item.dueAt)}</span> : null}{view.item.attentionAt ? <span><CalendarClock size={13} aria-hidden="true" />Attention {fullDate(view.item.attentionAt)}</span> : null}</>} actions={<><Button tone="ghost" onClick={() => onAskKora({ kind: "work_item", id: view.item.id, title: view.item.title })}><MessageCircleMore size={15} aria-hidden="true" />Ask Kora</Button>{!terminal ? <Button tone="ghost" onClick={() => focus.mutate()} loading={focus.isPending} disabled={item.isError || active.isPending || active.isError}><Target size={14} aria-hidden="true" />{view.focus.inUserAttention ? "Remove focus" : "Add to focus"}</Button> : null}{terminal ? <Button onClick={() => setInspectorMode("review")} disabled={item.isError}><RefreshCw size={15} aria-hidden="true" />Review status</Button> : <Button tone="primary" onClick={() => setInspectorMode("edit")} disabled={item.isError}><Pencil size={15} aria-hidden="true" />Edit</Button>}</>}>
      <p className="task-detail__announcement" role="status" aria-live="polite">{announcement}</p>
      {item.isError ? <StateView state="partial" title="Showing last-confirmed Work item" body="This record could not refresh. Its saved details remain readable, but changes are paused until Kora can confirm the latest local version." action={<Button tone="ghost" onClick={() => void item.refetch()}><RefreshCw size={14} aria-hidden="true" />Retry Work-item refresh</Button>} /> : null}
      {focus.isError ? <div className="task-detail__local-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><div><strong>Focus did not change</strong><p>{focus.error instanceof Error ? focus.error.message : "The focus change did not settle."}</p></div><Button tone="ghost" onClick={() => focus.mutate()}><RefreshCw size={14} aria-hidden="true" />Try again</Button></div> : null}
      {active.isError ? <div className="task-detail__local-error" role="status"><CircleAlert size={16} aria-hidden="true" /><div><strong>Focus is temporarily unavailable</strong><p>The record remains readable. Retry focus status before changing attention.</p></div><Button tone="ghost" onClick={() => void active.refetch()}><RefreshCw size={14} aria-hidden="true" />Retry focus</Button></div> : null}
      <PageSection title="Notes"><div className="task-detail__notes">{view.item.descriptionMarkdown ? <p>{view.item.descriptionMarkdown}</p> : <p className="task-detail__optional">Add a note when you need one.</p>}</div></PageSection>
      {!view.parent && !children.length && !canLoadMore && !childrenError && view.children.complete && view.connections.complete && !view.connections.items.some(connection => connection.relation === "depends_on" && connection.target.type === "work_item")
        ? <p className="task-detail__optional">No subtasks or dependencies.</p>
        : <>
          <PageSection title="Parent and subtasks" actions={<GitBranch size={16} aria-hidden="true" />}><TaskRelationships view={view} items={children} canLoadMore={canLoadMore} onLoadMore={() => loadChildren.mutate()} loadingMore={loadChildren.isPending} loadError={childrenError} /></PageSection>
          <PageSection title="Dependencies"><Dependencies connections={view.connections.items} /></PageSection>
        </>}
      {terminal || view.item.blocker ? <PageSection title={view.item.blocker && !terminal ? "Blocked" : resultTitle}><div className={`task-detail__result task-detail__result--${view.item.state}`}><ResultIcon item={view.item} /><p>{statusCopy}</p></div></PageSection> : null}
    </RecordPage>
    <AnimatePresence initial={false}>{inspectorMode ? <WorkInspector selected={{ type: "work_item", record: view.item, assignee: view.assignee }} activeVersion={active.data?.version} inFocus={view.focus.inUserAttention} onClose={() => setInspectorMode(undefined)} onChanged={changed} onFocusChange={() => focus.mutate()} focusBusy={focus.isPending} onAskKora={() => onAskKora({ kind: "work_item", id: view.item.id, title: view.item.title })} initialEditing={inspectorMode === "edit"} /> : null}</AnimatePresence>
    <DeleteWorkRecordModal open={deleting} onOpenChange={setDeleting} surface="work_item" id={view.item.id} title={view.item.title} services={deletionServices} onDeleted={async () => { queryClient.removeQueries({ queryKey: ["work", "item", itemId] }); await queryClient.invalidateQueries({ queryKey: ["work"] }); navigate(view.goal ? `/work/goals/${encodeURIComponent(view.goal.id)}` : "/work/tasks", { replace: true }); }} />
  </section>;
}
