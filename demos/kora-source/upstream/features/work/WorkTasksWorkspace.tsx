import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Columns3, List, ListFilter, Plus, Sparkles, Target } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  DataTable,
  ContentState,
  Disclosure,
  Field,
  Input,
  KoraSelect,
  Modal,
  PageFrame,
  PageHeader,
  PageToolbar,
  SearchField,
  SegmentedControl,
  Sheet,
  Textarea,
  type BadgeTone,
  type DataColumn,
  type DataTableState,
} from "../../components/primitives";
import { CheckboxChoice, CheckboxControl } from "../../components/form";
import { useViewBar } from "../../app/ViewBar";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type WorkItem,
  type WorkItemListEntry,
  type WorkItemListFilter,
} from "../../lib/runtime";
import { WorkNavigation } from "./WorkNavigation";
import { AddWorkItemModal } from "./WorkDetailShared";
import { workDetailHref } from "./work-navigation-state";
import "./work.css";
import "./work-tasks.css";

const FILTER_OPTIONS: Array<{ value: WorkItemListFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "active", label: "In progress" },
  { value: "planned", label: "Planned" },
  { value: "blocked", label: "Blocked" },
  { value: "terminal", label: "Finished" },
];
const KIND_OPTIONS: Array<{ value: "all" | WorkItem["kind"]; label: string }> = [
  { value: "all", label: "Every kind" },
  { value: "task", label: "Tasks" },
  { value: "milestone", label: "Milestones" },
  { value: "commitment", label: "Commitments" },
  { value: "outcome", label: "Outcomes" },
];
const FILTER_VALUES = new Set(FILTER_OPTIONS.map((option) => option.value));
const KIND_VALUES = new Set(KIND_OPTIONS.map((option) => option.value));
type TaskView = "list" | "board";
const VIEW_VALUES = new Set<TaskView>(["list", "board"]);
const VIEW_OPTIONS = [
  { value: "list", label: <><List size={14} aria-hidden="true" />List</> },
  { value: "board", label: <><Columns3 size={14} aria-hidden="true" />Board</> },
];
type TaskColumnKey = "goal" | "state" | "due" | "priority" | "focus";
const TASK_COLUMN_KEYS: TaskColumnKey[] = ["goal", "state", "due", "priority", "focus"];
const DEFAULT_TASK_COLUMNS: TaskColumnKey[] = ["goal", "state", "due"];
const TASK_COLUMN_LABELS: Record<TaskColumnKey, string> = { goal: "Project", state: "State", due: "Due", priority: "Priority", focus: "Focus" };

export type WorkTasksServices = Pick<
  typeof runtime,
  "workItems" | "goalsPage" | "updateWorkItem" | "createGoalWorkItem"
>;
export type WorkTasksScope = { goalId: string; title: string };

const humanize = (value: string) => value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
const stateLabel = (state: WorkItem["state"]) => state === "active" ? "In progress" : state === "completed" ? "Completed" : humanize(state);
const stateTone = (state: WorkItem["state"]): BadgeTone => state === "blocked" ? "danger" : state === "active" ? "work" : state === "completed" ? "success" : state === "cancelled" || state === "archived" ? "quiet" : "neutral";
const priorityLabel = (priority: number) => priority >= 4 ? "Highest" : priority === 3 ? "High" : priority === 2 ? "Normal" : priority === 1 ? "Low" : "Someday";
const shortDate = (value?: string) => {
  if (!value) return "No due date";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Due date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) }).format(date);
};
const readTime = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(timestamp));

type TaskStage = "planned" | "active" | "blocked" | "finished";
const taskStage = (item: WorkItem): TaskStage => item.state === "planned" ? "planned" : item.state === "active" ? "active" : item.state === "blocked" ? "blocked" : "finished";
const TASK_COLUMNS: Array<{ id: TaskStage; label: string; empty: string }> = [
  { id: "planned", label: "Planned", empty: "Nothing waiting to begin." },
  { id: "active", label: "In progress", empty: "Nothing moving right now." },
  { id: "blocked", label: "Blocked", empty: "Nothing is blocked." },
  { id: "finished", label: "Finished", empty: "Finished Work appears here when included." },
];

function taskGoalLabel(entry: WorkItemListEntry) {
  if (entry.goal) return entry.goal.title;
  return entry.item.goalId ? "Project context unavailable" : "No Project";
}

function WorkItemRow({ entry, compact = false }: { entry: WorkItemListEntry; compact?: boolean }) {
  if (compact) {
    return <span className="work-task-mobile">
      <span className="work-task-mobile__context">{entry.item.goalId ? `Project: ${taskGoalLabel(entry)}` : "Independent Work"}</span>
      <span className="work-task-mobile__facts"><Badge tone={stateTone(entry.item.state)} dot>{stateLabel(entry.item.state)}</Badge><span>{shortDate(entry.item.dueAt)}</span></span>
    </span>;
  }
  return <span className="work-task-subject"><strong>{entry.item.title}</strong>{entry.item.blocker ? <small>Blocked: {entry.item.blocker}</small> : null}</span>;
}

function WorkItemBoardCard({
  entry,
  checked,
  busy,
  onCheckedChange,
  onMove,
  returnTo,
}: {
  entry: WorkItemListEntry;
  checked: boolean;
  busy: boolean;
  onCheckedChange: (checked: boolean) => void;
  onMove: (entry: WorkItemListEntry, state: string) => void;
  returnTo: string;
}) {
  const item = entry.item;
  return <article className="work-task-board-card" data-task-id={item.id}>
    <div className="work-task-board-card__meta">
      <CheckboxControl checked={checked} label={`Select ${item.title}`} onCheckedChange={onCheckedChange} />
      <Badge tone={stateTone(item.state)} dot>{humanize(item.kind)}</Badge>
      {entry.inUserAttention ? <Target size={14} aria-label="In focus" /> : null}
    </div>
    <Link to={workDetailHref(`/work/tasks/${encodeURIComponent(item.id)}`, returnTo, "/work/tasks")}>{item.title}</Link>
    {item.blocker ? <p className="work-task-board-card__blocker">Blocked: {item.blocker}</p> : item.descriptionMarkdown ? <p>{item.descriptionMarkdown.split(/\r?\n/, 1)[0]}</p> : null}
    <div className="work-task-board-card__context"><span>{taskGoalLabel(entry)}</span><span>{item.area ?? entry.goal?.area ?? "General"}</span><span>{shortDate(item.dueAt)}</span><span>{priorityLabel(item.priority)}</span></div>
    {!['completed', 'cancelled', 'archived'].includes(item.state) ? <KoraSelect label={`Move ${item.title}`} value={item.state} disabled={busy} onValueChange={(value) => onMove(entry, value)} options={[
      { value: "planned", label: item.state === "planned" ? "Move · Planned" : "Move to Planned" },
      { value: "active", label: item.state === "active" ? "Move · In progress" : "Move to In progress" },
      { value: "blocked", label: item.state === "blocked" ? "Move · Blocked" : "Move to Blocked" },
    ]} /> : null}
  </article>;
}

function WorkTaskBoard({ entries, selected, onSelectedChange, services, returnTo, readOnly = false }: {
  entries: WorkItemListEntry[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: ReadonlySet<string>) => void;
  services: WorkTasksServices;
  returnTo: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [blockTarget, setBlockTarget] = useState<WorkItemListEntry>();
  const [blocker, setBlocker] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [moveError, setMoveError] = useState<string>();
  const [moveErrorTaskId, setMoveErrorTaskId] = useState<string>();
  const [focusTaskId, setFocusTaskId] = useState<string>();
  const moveErrorRef = useRef<HTMLDivElement>(null);
  const move = useMutation({
    mutationFn: async ({ entry, state, reason }: { entry: WorkItemListEntry; state: "planned" | "active" | "blocked"; reason?: string }) => {
      const outcome = await services.updateWorkItem(entry.item.id, entry.item.version, {
        state,
        blocker: state === "blocked" ? reason?.trim() || null : null,
        provenance: "gui_direct",
      });
      if (outcome.status !== "settled") throw new Error("This move requires approved access.");
      return outcome;
    },
    onSuccess: async (_outcome, input) => {
      await queryClient.invalidateQueries({ queryKey: ["work", "items"] });
      setBlockTarget(undefined); setBlocker(""); setMoveError(undefined);
      setAnnouncement(`${input.entry.item.title} moved to ${stateLabel(input.state)}.`);
      setFocusTaskId(input.entry.item.id);
    },
    onError: (reason, input) => {
      const conflict = reason instanceof RuntimeRequestError && reason.code === "work_conflict";
      setMoveErrorTaskId(input.entry.item.id);
      setMoveError(conflict
        ? "This Task changed elsewhere. Refresh Tasks, review the current state, and move it again."
        : reason instanceof Error
          ? `${reason.message} Loaded Tasks remain unchanged.`
          : "This Task could not be moved. Loaded Tasks remain unchanged.");
    },
  });
  useEffect(() => {
    if (!moveError || blockTarget) return;
    moveErrorRef.current?.focus({ preventScroll: false });
  }, [blockTarget, moveError]);
  useEffect(() => {
    if (!focusTaskId || move.isPending) return;
    const timer = window.setTimeout(() => {
      const card = [...document.querySelectorAll<HTMLElement>("[data-task-id]")]
        .find((candidate) => candidate.dataset.taskId === focusTaskId);
      const control = card?.querySelector<HTMLElement>('[role="combobox"]');
      control?.focus({ preventScroll: true });
      if (document.activeElement === control) setFocusTaskId(undefined);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [entries, focusTaskId, move.isPending]);
  const requestMove = (entry: WorkItemListEntry, state: string) => {
    if (readOnly) return;
    if (state === entry.item.state || state === "finished") return;
    if (state === "blocked") { setBlockTarget(entry); setBlocker(entry.item.blocker ?? ""); return; }
    move.mutate({ entry, state: state as "planned" | "active" });
  };
  return <>
    {moveError && !blockTarget ? <div ref={moveErrorRef} className="work-tasks-move-error" role="alert" tabIndex={-1}>
      <ContentState state="error" size="inline" title={moveError} action={<Button onClick={async () => {
        const taskId = moveErrorTaskId;
        setAnnouncement("Refreshing Tasks.");
        await queryClient.invalidateQueries({ queryKey: ["work", "items"] });
        setMoveError(undefined);
        setMoveErrorTaskId(undefined);
        setAnnouncement("Tasks refreshed. Review the current state before moving again.");
        if (taskId) setFocusTaskId(taskId);
      }}>Refresh Tasks</Button>} />
    </div> : null}
    <div className="work-task-board" aria-label="Tasks by state">
      {TASK_COLUMNS.map((column) => {
        const items = entries.filter((entry) => taskStage(entry.item) === column.id);
        return <section className="work-task-board__column" aria-labelledby={`task-column-${column.id}`} key={column.id}>
          <div className="work-task-board__heading"><h2 id={`task-column-${column.id}`}>{column.label}</h2><span>{items.length}</span></div>
          <div className="work-task-board__items">
            {items.map((entry) => {
              const item = entry.item;
              const checked = selected.has(item.id);
              return <WorkItemBoardCard
                key={item.id}
                entry={entry}
                checked={checked}
                busy={move.isPending || readOnly}
                onMove={requestMove}
                returnTo={returnTo}
                onCheckedChange={(nextChecked) => { const next = new Set(selected); if (nextChecked) next.add(item.id); else next.delete(item.id); onSelectedChange(next); }}
              />;
            })}
            {!items.length ? <p className="work-task-board__empty">{column.empty}</p> : null}
          </div>
        </section>;
      })}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <Modal open={Boolean(blockTarget)} onOpenChange={(open) => { if (!open && !move.isPending) { setBlockTarget(undefined); setBlocker(""); setMoveError(undefined); } }} title="Block this Work" description="Record what is preventing progress so the next review has useful context." purpose="confirm" busy={move.isPending}>
      <form className="work-task-block-form" onSubmit={(event) => { event.preventDefault(); if (!blockTarget || !blocker.trim()) { setMoveError("Blocking Work requires a reason."); return; } move.mutate({ entry: blockTarget, state: "blocked", reason: blocker }); }}>
        <Field label="Blocker"><Textarea autoFocus value={blocker} onChange={(event) => { setBlocker(event.target.value); setMoveError(undefined); }} rows={4} /></Field>
        {moveError ? <ContentState state="error" size="inline" announcement="assertive" title={moveError} /> : null}
        <div className="work-task-block-form__actions"><Button type="button" onClick={() => setBlockTarget(undefined)}>Keep moving</Button><Button tone="primary" type="submit" loading={move.isPending}>Block Work</Button></div>
      </form>
    </Modal>
  </>;
}

function WorkTaskFilters({ filter, kind, onFilterChange, onKindChange }: {
  filter: WorkItemListFilter;
  kind: "all" | WorkItem["kind"];
  onFilterChange: (filter: WorkItemListFilter) => void;
  onKindChange: (kind: "all" | WorkItem["kind"]) => void;
}) {
  return <div className="work-task-filters">
    <KoraSelect label="Task state" value={filter} onValueChange={(value) => onFilterChange(value as WorkItemListFilter)} options={FILTER_OPTIONS} />
    <KoraSelect label="Work item kind" value={kind} onValueChange={(value) => onKindChange(value as "all" | WorkItem["kind"])} options={KIND_OPTIONS} />
  </div>;
}

function TaskBoardLoading() {
  return <div className="work-task-loading work-task-loading--board" role="status" aria-label="Loading Tasks board" aria-busy="true">
    <span className="sr-only">Loading Tasks</span>
    {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
  </div>;
}

function WorkBulkReview({
  count,
  showCount = false,
  busy = false,
  readOnly = false,
  onReview,
  onStart,
  onClear,
}: {
  count: number;
  showCount?: boolean;
  busy?: boolean;
  readOnly?: boolean;
  onReview: () => void;
  onStart: () => void;
  onClear: () => void;
}) {
  return <>
    {showCount ? <strong>{count} selected</strong> : null}
    <Button disabled={busy} onClick={onReview}>Review selection</Button>
    <Button tone="primary" loading={busy} disabled={readOnly} onClick={onStart}>Start selected</Button>
    <Button tone="ghost" disabled={busy} onClick={onClear}>Clear</Button>
  </>;
}

export function WorkTasksWorkspace({ onAskKora, services = runtime, requestKey = "live", scope, embedded = false, createSignal, createTaskOnly = true, createParents = [], createDisabledReason }: {
  onAskKora?: (reference?: ConversationContextReference, draft?: string) => void;
  services?: WorkTasksServices;
  requestKey?: string;
  scope?: WorkTasksScope;
  embedded?: boolean;
  /** Increment to open the task form from a containing project header. */
  createSignal?: number;
  /** Project detail can create any Work kind against its fixed scope. */
  createTaskOnly?: boolean;
  createParents?: WorkItem[];
  createDisabledReason?: string;
}) {
  useViewBar(() => embedded ? {} : ({ title: "Work", titleRole: "label" }), [embedded]);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filterParam = params.get("filter") as WorkItemListFilter | null;
  const kindParam = params.get("kind") as "all" | WorkItem["kind"] | null;
  const filter = filterParam && FILTER_VALUES.has(filterParam) ? filterParam : "open";
  const kind = kindParam && KIND_VALUES.has(kindParam) ? kindParam : "all";
  const viewParam = params.get("view") as TaskView | null;
  const view = viewParam && VIEW_VALUES.has(viewParam) ? viewParam : "list";
  const columnParam = params.get("columns");
  const visibleColumnKeys = new Set<TaskColumnKey>(columnParam
    ? columnParam.split(",").filter((key): key is TaskColumnKey => TASK_COLUMN_KEYS.includes(key as TaskColumnKey))
    : DEFAULT_TASK_COLUMNS);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkRetryState, setBulkRetryState] = useState<"active">();
  const [proposalDraft, setProposalDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [createGoalId, setCreateGoalId] = useState(scope?.goalId ?? "");
  const createSignalRef = useRef(createSignal);
  useEffect(() => {
    setCreateGoalId(scope?.goalId ?? "");
  }, [scope?.goalId]);
  useEffect(() => {
    if (createSignal !== undefined && createSignalRef.current !== undefined && createSignal !== createSignalRef.current) setCreating(true);
    createSignalRef.current = createSignal;
  }, [createSignal]);

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    updateParams({ q: deferredQuery || undefined });
    // The deferred search value is the sole owner of this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery]);
  useEffect(() => {
    const urlQuery = params.get("q") ?? "";
    setQuery((current) => current === urlQuery ? current : urlQuery);
  }, [params]);
  useEffect(() => {
    setSelected(new Set());
    setSelectionNotice("");
    setBulkError("");
    setBulkRetryState(undefined);
  }, [filter, kind, deferredQuery]);
  useEffect(() => {
    const focusLocalSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault(); event.stopPropagation(); searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusLocalSearch, true);
    return () => window.removeEventListener("keydown", focusLocalSearch, true);
  }, []);

  const result = useInfiniteQuery({
    queryKey: ["work", "items", requestKey, scope?.goalId ?? "all", filter, kind, deferredQuery],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => services.workItems({ filter, kind: kind === "all" ? undefined : kind, ...(scope ? { goalId: scope.goalId } : {}), query: deferredQuery || undefined, limit: 50, cursor: pageParam }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const rawEntries = useMemo(() => result.data?.pages.flatMap((page) => page.items) ?? [], [result.data]);
  const missingGoalContext = rawEntries.some((entry) => Boolean(entry.item.goalId && !entry.goal));
  const goalContext = useQuery({
    queryKey: ["work", "task-goal-context", requestKey],
    enabled: missingGoalContext && !scope,
    staleTime: 30_000,
    queryFn: async () => {
      const [open, terminal] = await Promise.all([
        services.goalsPage({ filter: "open", includeArchived: false, limit: 100 }),
        services.goalsPage({ filter: "terminal", includeArchived: true, limit: 100 }),
      ]);
      return [...open.items, ...terminal.items].map((entry) => entry.goal);
    },
  });
  const createGoals = useInfiniteQuery({
    queryKey: ["work", "task-create-goals", requestKey, scope?.goalId ?? "all"],
    initialPageParam: undefined as string | undefined,
    enabled: creating && !scope,
    staleTime: 30_000,
    queryFn: ({ pageParam }) => services.goalsPage({
      filter: "open",
      includeArchived: false,
      limit: 100,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  // A scoped project Board has a visible Finished column. Keep its terminal
  // page separate from the open page so Finished never implies zero merely
  // because the default collection query is open-only.
  const terminalResult = useInfiniteQuery({
    queryKey: ["work", "items", "board-terminal", requestKey, scope?.goalId ?? "all", kind, deferredQuery],
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(embedded && scope && view === "board" && filter === "open"),
    queryFn: ({ pageParam }) => services.workItems({
      filter: "terminal",
      kind: kind === "all" ? undefined : kind,
      ...(scope ? { goalId: scope.goalId } : {}),
      query: deferredQuery || undefined,
      limit: 50,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const createGoalChoices = useMemo(
    () => scope ? [{ id: scope.goalId, title: scope.title }] : createGoals.data?.pages.flatMap((page) => page.items.map(({ goal }) => ({ id: goal.id, title: goal.title }))) ?? [],
    [createGoals.data, scope],
  );
  const entries = useMemo(() => {
    const scopedEntries = scope
      ? rawEntries.map((entry) => entry.goal || entry.item.goalId !== scope.goalId ? entry : { ...entry, goal: { id: scope.goalId, title: scope.title } as WorkItemListEntry["goal"] })
      : rawEntries;
    if (!goalContext.data?.length) return scopedEntries;
    const byId = new Map(goalContext.data.map((goal) => [goal.id, goal]));
    return scopedEntries.map((entry) => entry.goal || !entry.item.goalId ? entry : { ...entry, goal: byId.get(entry.item.goalId) });
  }, [goalContext.data, rawEntries, scope]);
  const terminalEntries = useMemo(
    () => terminalResult.data?.pages.flatMap((page) => page.items) ?? [],
    [terminalResult.data],
  );
  const visibleEntries = useMemo(() => {
    if (!terminalEntries.length || !scope || view !== "board" || filter !== "open") return entries;
    const seen = new Set(entries.map((entry) => entry.item.id));
    return [...entries, ...terminalEntries.filter((entry) => !seen.has(entry.item.id))];
  }, [entries, filter, scope, terminalEntries, view]);
  const complete = result.data?.pages.at(-1)?.complete ?? false;
  const selectedEntries = visibleEntries.filter((entry) => selected.has(entry.item.id));
  const activeFilterCount = Number(filter !== "open") + Number(kind !== "all");
  const terminalPending = Boolean(embedded && scope && view === "board" && filter === "open" && terminalResult.isPending);
  const contentPending = result.isPending || (missingGoalContext && goalContext.isPending) || terminalPending;
  const returnTo = `${location.pathname}${location.search}`;
  const handleTaskCreated = async (item: WorkItem, openItem: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ["work"] });
    setCreateGoalId("");
    if (openItem) {
      navigate(workDetailHref(`/work/tasks/${encodeURIComponent(item.id)}`, returnTo, "/work/tasks"));
    }
  };

  const setFilter = (next: WorkItemListFilter) => updateParams({ filter: next === "open" ? undefined : next });
  const setKind = (next: "all" | WorkItem["kind"]) => updateParams({ kind: next === "all" ? undefined : next });
  const clearFilters = () => {
    setQuery("");
    const next = new URLSearchParams();
    if (view !== "list") next.set("view", view);
    if (columnParam) next.set("columns", columnParam);
    setParams(next, { replace: true });
  };
  const setColumnVisible = (key: TaskColumnKey, visible: boolean) => {
    const next = new Set(visibleColumnKeys);
    if (visible) next.add(key); else next.delete(key);
    const ordered = TASK_COLUMN_KEYS.filter((candidate) => next.has(candidate));
    updateParams({ columns: ordered.join(",") === DEFAULT_TASK_COLUMNS.join(",") ? undefined : ordered.join(",") || "none" });
  };
  const reviewSelection = () => {
    setSelectionNotice(`${selected.size} selected ${selected.size === 1 ? "item is" : "items are"} ready to review. No Work changed.`);
    onAskKora?.(undefined, `Review these selected Work items without changing them:\n${selectedEntries.map((entry) => `- ${entry.item.title} (${entry.item.id})`).join("\n")}`);
  };
  const moveSelectedSequentially = async (targetState: "active") => {
    if (bulkBusy || result.isError) return;
    const candidates = selectedEntries.filter((entry) => entry.item.state !== targetState);
    if (!candidates.length) {
      setSelected(new Set());
      setBulkError("");
      setBulkRetryState(undefined);
      setSelectionNotice("Every selected item is already in progress. No Work changed.");
      return;
    }
    setBulkBusy(true);
    setBulkError("");
    setBulkRetryState(undefined);
    setSelectionNotice("");
    const succeeded: string[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const entry = candidates[index]!;
      try {
        const outcome = await services.updateWorkItem(entry.item.id, entry.item.version, {
          state: targetState,
          blocker: null,
          provenance: "gui_direct",
        });
        if (outcome.status !== "settled") throw new Error("This change requires approved access.");
        succeeded.push(entry.item.id);
      } catch (reason) {
        const remaining = candidates.slice(index);
        setSelected(new Set(remaining.map((candidate) => candidate.item.id)));
        setBulkRetryState(targetState);
        const detail = reason instanceof RuntimeRequestError && reason.code === "work_conflict"
          ? "It changed elsewhere."
          : reason instanceof Error ? reason.message : "The local mutation failed.";
        setBulkError(`${succeeded.length} ${succeeded.length === 1 ? "item was" : "items were"} started. ${entry.item.title} could not be started: ${detail} ${remaining.length} ${remaining.length === 1 ? "item remains" : "items remain"} selected for retry.`);
        await queryClient.invalidateQueries({ queryKey: ["work", "items"] });
        setBulkBusy(false);
        return;
      }
    }
    setSelected(new Set());
    setSelectionNotice(`${succeeded.length} selected ${succeeded.length === 1 ? "item is" : "items are"} now in progress.`);
    await queryClient.invalidateQueries({ queryKey: ["work", "items"] });
    setBulkBusy(false);
  };
  const clearListSelection = () => {
    setSelected(new Set());
    setBulkError("");
    setBulkRetryState(undefined);
    setSelectionNotice("Selection cleared. No Work changed.");
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="checkbox"][aria-label="Select all loaded rows"]')?.focus());
  };
  const clearBoardSelection = () => {
    const firstSelected = selectedEntries[0]?.item.id;
    setSelected(new Set());
    setBulkError("");
    setBulkRetryState(undefined);
    setSelectionNotice("Selection cleared. No Work changed.");
    requestAnimationFrame(() => {
      const card = [...document.querySelectorAll<HTMLElement>("[data-task-id]")].find((candidate) => candidate.dataset.taskId === firstSelected);
      card?.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
    });
  };

  const columns: DataColumn<WorkItemListEntry>[] = [
    {
      key: "item",
      header: "Work item",
      width: "auto",
      cellText: (entry) => `Open ${entry.item.title}`,
      cell: (entry) => <WorkItemRow entry={entry} />,
    },
    { key: "goal", header: "Project", width: "28%", cellText: (entry) => `Project: ${taskGoalLabel(entry)}`, cell: (entry) => <span className="work-task-goal">{taskGoalLabel(entry)}</span> },
    { key: "state", header: "State", width: "8.25rem", cellText: (entry) => stateLabel(entry.item.state), cell: (entry) => <Badge tone={stateTone(entry.item.state)} dot>{stateLabel(entry.item.state)}</Badge> },
    { key: "due", header: "Due", width: "8rem", cellText: (entry) => shortDate(entry.item.dueAt), cell: (entry) => entry.item.dueAt ? <span className="work-task-date"><CalendarDays size={13} aria-hidden="true" />{shortDate(entry.item.dueAt)}</span> : "—" },
    { key: "priority", header: "Priority", width: "5rem", cellText: (entry) => priorityLabel(entry.item.priority), cell: (entry) => priorityLabel(entry.item.priority) },
    { key: "focus", header: "Focus", width: "4.125rem", wideOnly: true, cellText: (entry) => entry.inUserAttention ? "In focus" : "Not in focus", cell: (entry) => entry.inUserAttention ? <Target size={15} aria-hidden="true" /> : "" },
  ];

  const hasActiveQuery = Boolean(deferredQuery || filter !== "open" || kind !== "all");
  const contentEntries = view === "board" ? visibleEntries : entries;
  const unavailable = result.isError && !contentEntries.length;
  const offline = result.error instanceof RuntimeRequestError && result.error.code === "runtime_disconnected";
  const trueEmpty = !unavailable && !result.isPending && !entries.length && !hasActiveQuery;
  const state: DataTableState | undefined = unavailable
      ? { mode: "replacement", kind: offline ? "offline" : "unavailable", title: offline ? "Tasks are offline" : "Tasks are unavailable right now", description: offline ? "Reconnect to Kora, then try again. Your existing Tasks haven't changed." : "Kora couldn't read your Tasks. Your existing Tasks haven't changed.", action: <Button onClick={() => void result.refetch()}>Try again</Button>, announcement: "assertive" }
      : !result.isPending && !contentEntries.length
      ? hasActiveQuery
        ? { mode: "replacement", kind: "filtered-empty", title: "Nothing matches this view", description: "Try a different search or clear your filters.", action: <Button onClick={clearFilters}>Clear filters</Button> }
        : { mode: "replacement", kind: "empty", title: "No Tasks yet", description: "Plan a first step with Kora. You can review it before anything changes." }
      : undefined;

  const proposalForm = onAskKora ? <form className={`work-task-proposal${unavailable ? " work-task-proposal--recovery" : ""}`} onSubmit={(event) => { event.preventDefault(); const draft = proposalDraft.trim(); onAskKora(undefined, draft ? `Help me plan this without changing Work yet: ${draft}` : "Help me identify the next useful Work without changing anything yet."); setSelectionNotice("Kora received planning context. No Work changed."); }}>
    <Field label="Plan something else" hint="Kora will discuss a proposal first. Nothing is created or changed from this field."><Input aria-label="Plan something else" value={proposalDraft} onChange={(event) => setProposalDraft(event.target.value)} placeholder="Describe the outcome or responsibility" /></Field>
    <Button type="submit"><Sparkles size={15} aria-hidden="true" />Plan this</Button>
  </form> : null;

  const pageContent = <>
      {!embedded ? <PageHeader
        title="Tasks"
        status={<span>{unavailable ? "Availability unknown" : complete ? `${entries.length} ${entries.length === 1 ? "item" : "items"}` : `${entries.length} loaded`}</span>}
        actions={<>
          <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />New task</Button>
          {onAskKora && !trueEmpty ? <Button tone="primary" onClick={() => onAskKora(undefined, "Help me plan the next useful Work for my Goals and responsibilities.")}>Plan with Kora</Button> : null}
        </>}
      /> : null}
      <PageToolbar
        sticky
        search={<SearchField inputRef={searchRef} value={query} onValueChange={setQuery} label="Search Tasks" placeholder="Search Tasks" />}
        controls={selected.size ? undefined : <><KoraSelect label="Task state" value={filter} onValueChange={(value) => setFilter(value as WorkItemListFilter)} options={FILTER_OPTIONS} /><Button className="work-task-customize" aria-label="Customize Task filters and list columns" onClick={() => setFiltersOpen(true)}><ListFilter size={15} aria-hidden="true" />Filters{kind !== "all" ? " · 1" : ""}</Button></>}
        secondaryActions={selected.size ? undefined : <>{!embedded ? <SegmentedControl label="Task view" layoutId="work-task-view" value={view} onValueChange={(next) => updateParams({ view: next === "list" ? undefined : next })} options={VIEW_OPTIONS} /> : null}{embedded && !createDisabledReason ? <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />New task</Button> : null}</>}
        compactControls={selected.size ? undefined : <Button aria-label={`Current view: ${view === "list" ? "List" : "Board"}. Open Task filters and display options`} onClick={() => setFiltersOpen(true)}><ListFilter size={15} aria-hidden="true" />Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</Button>}
      />
      {result.isError && entries.length && !result.isFetchNextPageError ? <ContentState state="stale" size="inline" announcement="assertive" title="Tasks could not refresh" body={`Last read ${readTime(result.dataUpdatedAt)}. Loaded Tasks remain readable; refresh before changing their state.`} action={<Button onClick={() => void result.refetch()}>Retry Task refresh</Button>} /> : null}
      {goalContext.isError && missingGoalContext ? <ContentState state="partial" size="inline" announcement="polite" title="Some Project names are unavailable" body="Your Tasks remain available. Unreadable Project names are marked unavailable." /> : null}
      {result.isFetchNextPageError ? <ContentState state="error" size="inline" announcement="assertive" title="More Tasks could not be loaded" body="Your current selection and loaded Work remain unchanged." /> : null}
      {selectionNotice ? <ContentState state="success" size="inline" announcement="polite" title={selectionNotice} /> : null}
      {bulkError ? <ContentState state="error" size="inline" announcement="assertive" title={bulkError} action={bulkRetryState ? <Button disabled={bulkBusy || result.isError} onClick={() => void moveSelectedSequentially(bulkRetryState)}>Retry remaining</Button> : undefined} /> : null}
      {view === "list" ? <DataTable
        rows={entries}
        columns={columns.filter((column) => column.key === "item" || ((column.key !== "goal" || !scope) && visibleColumnKeys.has(column.key as TaskColumnKey)))}
        rowKey={(entry) => entry.item.id}
        href={(entry) => workDetailHref(`/work/tasks/${encodeURIComponent(entry.item.id)}`, returnTo, "/work/tasks")}
        caption="Current personal Tasks"
        loading={contentPending}
        state={state}
        mobileSummary={(entry) => <WorkItemRow entry={entry} compact />}
        selection={{
          scope: "loaded",
          scopeKey: `${filter}:${kind}:${deferredQuery}`,
          selected,
          onChange: (next) => { setSelected(next); setSelectionNotice(""); setBulkError(""); setBulkRetryState(undefined); },
          label: (entry) => `Select ${entry.item.title}`,
          actions: <WorkBulkReview count={selected.size} busy={bulkBusy} readOnly={result.isError} onReview={reviewSelection} onStart={() => void moveSelectedSequentially("active")} onClear={clearListSelection} />,
        }}
        summary={result.isPending
          ? "Loading current view"
          : result.isError && !entries.length
            ? undefined
            : complete
              ? `${entries.length} loaded · end of current view`
              : `${entries.length} loaded · more remain`}
        onLoadMore={result.hasNextPage ? () => void result.fetchNextPage() : undefined}
        loadingMore={result.isFetchingNextPage}
      /> : contentPending ? <TaskBoardLoading /> : state ? <ContentState state={state.kind} title={state.title} body={state.description} action={state.action} announcement={state.announcement} /> : <WorkTaskBoard entries={visibleEntries} selected={selected} onSelectedChange={(next) => { setSelected(next); setSelectionNotice(""); setBulkError(""); setBulkRetryState(undefined); }} services={services} returnTo={returnTo} readOnly={result.isError || terminalResult.isError} />}
      {view === "board" && terminalResult.isError ? <ContentState state="partial" size="inline" announcement="polite" title="Finished Tasks could not be loaded" body="Open Tasks remain available. Retry to confirm the Finished column." action={<Button tone="ghost" onClick={() => void terminalResult.refetch()}>Retry Finished Tasks</Button>} /> : null}
      {!embedded && !contentPending && (unavailable && proposalForm ? <Disclosure
        className="work-task-recovery-planner"
        summary="Plan without current Task data"
        description="Open a proposal draft. Kora will not treat unavailable Tasks as an empty list or change Work from here."
        icon={<Sparkles size={15} aria-hidden="true" />}
      >
        {proposalForm}
      </Disclosure> : proposalForm)}
      {view === "board" && selected.size ? <div className="work-task-board-selection" role="status" aria-live="polite"><WorkBulkReview count={selected.size} showCount busy={bulkBusy} readOnly={result.isError} onReview={reviewSelection} onStart={() => void moveSelectedSequentially("active")} onClear={clearBoardSelection} /></div> : null}
      {view === "board" && result.hasNextPage ? <div className="work-task-load"><Button onClick={() => void result.fetchNextPage()} loading={result.isFetchingNextPage}>Load more Tasks</Button></div> : null}
      {view === "board" && terminalResult.hasNextPage ? <div className="work-task-load"><Button onClick={() => void terminalResult.fetchNextPage()} loading={terminalResult.isFetchingNextPage}>Load more Finished Tasks</Button></div> : null}
    </>;
  return <section className={`work-tasks-workspace${embedded ? " work-tasks-workspace--embedded" : ""}`}>
    {embedded ? pageContent : <PageFrame width="wide" sidebar={<WorkNavigation />} sidebarLabel="Work">{pageContent}</PageFrame>}
    <AddWorkItemModal
      open={creating}
      onOpenChange={(nextOpen) => {
        setCreating(nextOpen);
        if (!nextOpen) setCreateGoalId(scope?.goalId ?? "");
      }}
      goalId={scope?.goalId ?? createGoalId}
      parents={createParents}
      taskOnly={createTaskOnly}
      goalChoices={createTaskOnly ? createGoalChoices : undefined}
      goalChoicesPending={createTaskOnly && !scope && createGoals.isPending}
      goalChoicesError={createTaskOnly && !scope && createGoals.isError && !createGoalChoices.length ? "Projects are unavailable right now. Existing Work was not changed." : undefined}
      goalChoicesLoadMoreError={createTaskOnly && !scope && createGoals.isFetchNextPageError ? "More Projects could not be loaded. The Projects already shown remain available." : undefined}
      goalChoicesHasMore={createTaskOnly && !scope && Boolean(createGoals.hasNextPage)}
      goalChoicesLoadingMore={createTaskOnly && !scope && createGoals.isFetchingNextPage}
      onRetryGoalChoices={createTaskOnly && !scope ? () => void createGoals.refetch() : undefined}
      onLoadMoreGoalChoices={createTaskOnly && !scope ? () => void createGoals.fetchNextPage() : undefined}
      onGoalChange={setCreateGoalId}
      services={services}
      onCreated={handleTaskCreated}
    />
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Task filters" description="Narrow this view without changing Work." purpose="properties">
      <div className="work-task-filter-sheet"><WorkTaskFilters filter={filter} kind={kind} onFilterChange={setFilter} onKindChange={setKind} /><SegmentedControl label="Task view" layoutId="work-task-view-sheet" value={view} onValueChange={(next) => updateParams({ view: next === "list" ? undefined : next })} options={VIEW_OPTIONS} /><fieldset className="work-task-columns"><legend>List columns</legend>{TASK_COLUMN_KEYS.map((key) => <CheckboxChoice key={key} checked={visibleColumnKeys.has(key)} title={TASK_COLUMN_LABELS[key]} onCheckedChange={(checked) => setColumnVisible(key, checked)} />)}</fieldset>{activeFilterCount ? <Button tone="ghost" onClick={clearFilters}>Clear filters</Button> : null}</div>
    </Sheet>
  </section>;
}
