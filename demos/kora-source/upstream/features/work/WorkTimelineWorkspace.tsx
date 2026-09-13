import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Diamond,
  Flag,
  Handshake,
  ListTodo,
  MessageCircleMore,
  Pencil,
  Target,
  Trophy,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Button,
  Field,
  Input,
  KoraSelect,
  Modal,
  PageFrame,
  PageHeader,
  PageToolbar,
  Pressable,
  StateView,
} from "../../components/primitives";
import { useViewBar } from "../../app/ViewBar";
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
import "./work-timeline.css";

type TimelineRange = "30" | "90" | "180";
type TimelineStyle = CSSProperties &
  Record<
    "--timeline-start" | "--timeline-span" | "--timeline-position",
    string
  >;
type AgendaEntry = {
  id: string;
  dateKey: string;
  kind: "goal-start" | "goal-target" | "goal-deadline" | "task-attention" | WorkItem["kind"];
  title: string;
  context?: string;
  state: Goal["lifecycle"] | WorkItem["state"];
  href: string;
  editTarget: EditTarget;
};
type EditTarget =
  { type: "goal"; record: Goal } | { type: "item"; record: WorkItem; dateKind?: "due" | "attention" };
type TimelineGoal = Goal | NonNullable<WorkItemListEntry["goal"]>;
export type TimelineServices = Pick<
  typeof runtime,
  "goalsPage" | "workItems" | "updateGoal" | "updateWorkItem"
> & { goal?: typeof runtime.goal };

const RANGE_OPTIONS = [
  { value: "30", label: "30 days", description: "A close planning horizon" },
  { value: "90", label: "3 months", description: "A season of Work" },
  {
    value: "180",
    label: "6 months",
    description: "Longer outcomes and commitments",
  },
] satisfies Array<{ value: TimelineRange; label: string; description: string }>;
const RANGE_VALUES = new Set<TimelineRange>(
  RANGE_OPTIONS.map((option) => option.value),
);
const DAY_MS = 86_400_000;

export function isValidTimelineDateKey(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
}
function toDateKey(value?: string | null) {
  if (!value) return undefined;
  const key = value.slice(0, 10);
  return isValidTimelineDateKey(key) ? key : undefined;
}
function taskDateKey(value?: string | null) {
  if (!value) return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return undefined;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}
function taskDateOnLocalWallTime(dateKey: string, original?: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const originalDate = original ? new Date(original) : undefined;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(
    originalDate && !Number.isNaN(originalDate.getTime()) ? originalDate.getHours() : 12,
    originalDate && !Number.isNaN(originalDate.getTime()) ? originalDate.getMinutes() : 0,
    originalDate && !Number.isNaN(originalDate.getTime()) ? originalDate.getSeconds() : 0,
    originalDate && !Number.isNaN(originalDate.getTime()) ? originalDate.getMilliseconds() : 0,
  );
  return date.toISOString();
}
function dateNumber(key: string) {
  return Date.parse(`${key}T12:00:00Z`);
}
function shiftDate(key: string, days: number) {
  return new Date(dateNumber(key) + days * DAY_MS).toISOString().slice(0, 10);
}
function formatDate(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}
function shortDate(key: string, today: string) {
  return formatDate(key, {
    month: "short",
    day: "numeric",
    ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}
function longDate(key: string) {
  return formatDate(key, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function inRange(key: string | undefined, start: string, end: string) {
  return Boolean(key && key >= start && key <= end);
}
function overlaps(
  startKey: string | undefined,
  endKey: string | undefined,
  visibleStart: string,
  visibleEnd: string,
) {
  return Boolean(
    startKey && endKey && startKey <= visibleEnd && endKey >= visibleStart,
  );
}
function percent(key: string, start: string, end: string) {
  return Math.max(
    0,
    Math.min(
      100,
      ((dateNumber(key) - dateNumber(start)) /
        (dateNumber(end) - dateNumber(start))) *
        100,
    ),
  );
}
function itemIcon(kind: AgendaEntry["kind"]): ReactNode {
  if (kind === "goal-start") return <Flag size={14} aria-hidden="true" />;
  if (kind === "goal-target") return <Target size={14} aria-hidden="true" />;
  if (kind === "goal-deadline") return <CircleAlert size={14} aria-hidden="true" />;
  if (kind === "milestone") return <Diamond size={13} aria-hidden="true" />;
  if (kind === "commitment") return <Handshake size={14} aria-hidden="true" />;
  if (kind === "outcome") return <Trophy size={14} aria-hidden="true" />;
  return <ListTodo size={14} aria-hidden="true" />;
}
function kindLabel(kind: AgendaEntry["kind"]) {
  if (kind === "goal-start") return "Project starts";
  if (kind === "goal-target") return "Project target";
  if (kind === "goal-deadline") return "Hard deadline";
  if (kind === "task-attention") return "Attention";
  return kind === "milestone"
    ? "Milestone"
    : kind === "commitment"
      ? "Commitment"
      : kind === "outcome"
        ? "Outcome"
        : "Task due";
}
function stateLabel(state: Goal["lifecycle"] | WorkItem["state"]) {
  return state === "active"
    ? "In progress"
    : state.replace(/^./, (c) => c.toUpperCase());
}
function isEditableGoal(goal: TimelineGoal): goal is Goal {
  return "purposeMarkdown" in goal;
}

function LoadingTimeline() {
  return (
    <div className="work-timeline-skeleton" aria-hidden="true">
      <span className="work-timeline-skeleton__axis" />
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className="work-timeline-skeleton__lane" />
      ))}
    </div>
  );
}
function TimelineLegend() {
  return (
    <ul className="work-timeline-legend" aria-label="Timeline legend">
      <li>
        <span className="work-timeline-legend__goal" aria-hidden="true" />
        Project span
      </li>
      <li>
        <span className="work-timeline-legend__deadline" aria-hidden="true" />
        Hard deadline
      </li>
      <li>
        <span className="work-timeline-legend__task" aria-hidden="true" />
        Task or outcome
      </li>
      <li>
        <span className="work-timeline-legend__milestone" aria-hidden="true" />
        Milestone
      </li>
      <li>
        <span className="work-timeline-legend__commitment" aria-hidden="true" />
        Commitment
      </li>
      <li>
        <span className="work-timeline-legend__today" aria-hidden="true" />
        Today
      </li>
    </ul>
  );
}

function WorkPlanningTimeline({
  goals,
  items,
  start,
  end,
  today,
  onEdit,
}: {
  goals: GoalListEntry[];
  items: WorkItemListEntry[];
  start: string;
  end: string;
  today: string;
  onEdit: (target: EditTarget, trigger: HTMLElement) => void;
}) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const goalHref = (id: string) => workDetailHref(
    `/work/goals/${encodeURIComponent(id)}`,
    returnTo,
    "/work/goals",
  );
  const taskHref = (id: string) => workDetailHref(
    `/work/tasks/${encodeURIComponent(id)}`,
    returnTo,
    "/work/tasks",
  );
  const groups = new Map<
    string,
    { goal?: TimelineGoal; title: string; items: WorkItemListEntry[] }
  >();
  for (const entry of goals)
    groups.set(entry.goal.id, {
      goal: entry.goal,
      title: entry.goal.title,
      items: [],
    });
  for (const entry of items) {
    const key = entry.item.goalId ?? "independent";
    const found = groups.get(key);
    if (found) found.items.push(entry);
    else
      groups.set(key, {
        goal: entry.goal,
        title: entry.goal?.title ?? "Independent Work",
        items: [entry],
      });
  }
  const visible = [...groups.entries()]
    .map(([id, group]) => ({ id, ...group }))
    .filter((group) => {
      const a = toDateKey(group.goal?.plannedStart);
      const b = toDateKey(group.goal?.targetDate);
      const deadline = toDateKey(group.goal?.hardDeadline);
      return (
        overlaps(a, b, start, end) ||
        inRange(a ?? b, start, end) ||
        inRange(deadline, start, end) ||
          group.items.some((entry) =>
          inRange(taskDateKey(entry.item.dueAt), start, end) ||
          inRange(taskDateKey(entry.item.attentionAt), start, end),
        )
      );
    });
  const ticks = Array.from({ length: 7 }, (_, index) =>
    shiftDate(
      start,
      Math.round(
        (Number((dateNumber(end) - dateNumber(start)) / DAY_MS) * index) / 6,
      ),
    ),
  );
  return (
    <div
      className="work-planning-timeline"
      aria-label="Dated Work planning timeline"
    >
      <div className="work-timeline-scroll">
        <div className="work-timeline-canvas">
          <div className="work-timeline-axis">
            <span className="work-timeline-axis__corner">Project and Work</span>
            <div className="work-timeline-axis__scale" aria-hidden="true">
              {ticks.map((tick, index) => (
                <span
                  key={`${tick}-${index}`}
                  style={{ left: `${(index / 6) * 100}%` }}
                >
                  {shortDate(tick, today)}
                </span>
              ))}
            </div>
          </div>
          {inRange(today, start, end) ? (
            <span className="work-timeline-today" aria-hidden="true">
              <span
                className="work-timeline-today__track"
                style={
                  {
                    "--timeline-position": `${percent(today, start, end)}%`,
                  } as CSSProperties
                }
              >
                <span>Today</span>
              </span>
            </span>
          ) : null}
          <ol className="work-timeline-groups">
            {visible.map((group) => {
              const editableGoal = group.goal && isEditableGoal(group.goal) ? group.goal : undefined;
              const goalStart = toDateKey(group.goal?.plannedStart);
              const goalTarget = toDateKey(group.goal?.targetDate);
              const goalDeadline = toDateKey(group.goal?.hardDeadline);
              const boundedStart =
                goalStart && goalTarget
                  ? goalStart < start
                    ? start
                    : goalStart
                  : (goalStart ?? goalTarget);
              const boundedEnd =
                goalStart && goalTarget
                  ? goalTarget > end
                    ? end
                    : goalTarget
                  : (goalStart ?? goalTarget);
      const style =
                boundedStart && boundedEnd
                  ? ({
                      "--timeline-start": `${percent(boundedStart, start, end)}%`,
                      "--timeline-span": `${Math.max(0.9, percent(boundedEnd, start, end) - percent(boundedStart, start, end))}%`,
                      "--timeline-position": "0%",
                    } as TimelineStyle)
                  : undefined;
              const datedItems: Array<{
                entry: WorkItemListEntry;
                dateKey: string;
                kind: AgendaEntry["kind"];
                label: "due" | "attention";
              }> = group.items.flatMap((entry) => [
                ...(taskDateKey(entry.item.dueAt)
                  ? [{
                      entry,
                      dateKey: taskDateKey(entry.item.dueAt)!,
                      kind: entry.item.kind as AgendaEntry["kind"],
                      label: "due" as const,
                    }]
                  : []),
                ...(taskDateKey(entry.item.attentionAt)
                  ? [{
                      entry,
                      dateKey: taskDateKey(entry.item.attentionAt)!,
                      kind: "task-attention" as const,
                      label: "attention" as const,
                    }]
                  : []),
              ]).filter((marker) => inRange(marker.dateKey, start, end));
              return (
                <li key={group.id} className="work-timeline-group">
                  <div className="work-timeline-goal-row">
                    <div className="work-timeline-row-label">
                      {group.goal ? (
                        <Link to={goalHref(group.goal.id)}>
                          {group.title}
                        </Link>
                      ) : (
                        <strong>{group.title}</strong>
                      )}
                      <small>
                        {group.goal
                          ? stateLabel(group.goal.lifecycle)
                          : "No Project"}
                      </small>
                    </div>
                    <div className="work-timeline-track">
                      {style && editableGoal ? (
                        <Pressable
                          className="work-timeline-goal-span"
                          style={style}
                          onClick={(event) =>
                            onEdit(
                              {
                                type: "goal",
                                record: editableGoal,
                              },
                              event.currentTarget,
                            )
                          }
                          aria-label={`Edit dates for ${group.title}. ${goalStart ? `Starts ${longDate(goalStart)}` : "Start not recorded"}; ${goalTarget ? `target ${longDate(goalTarget)}` : "target not recorded"}`}
                        >
                          <span>
                            {goalStart && goalTarget
                              ? "Project span"
                              : goalTarget
                                ? "Target"
                                : "Start"}
                          </span>
                          <Pencil size={12} aria-hidden="true" />
                        </Pressable>
                      ) : goalDeadline && inRange(goalDeadline, start, end) && editableGoal ? null : (
                        <span className="work-timeline-unscheduled">
                          Project dates not recorded
                        </span>
                      )}
                      {goalDeadline && inRange(goalDeadline, start, end) && editableGoal ? (
                        <Pressable
                          className="work-timeline-deadline-marker"
                          data-kind="goal-deadline"
                          style={{
                            "--timeline-position": `${percent(goalDeadline, start, end)}%`,
                          } as CSSProperties}
                          onClick={(event) =>
                            onEdit({ type: "goal", record: editableGoal }, event.currentTarget)
                          }
                          aria-label={`Edit hard deadline for ${group.title}. ${longDate(goalDeadline)}`}
                        >
                          <CircleAlert size={13} aria-hidden="true" />
                          <span>Deadline · {shortDate(goalDeadline, today)}</span>
                        </Pressable>
                      ) : null}
                    </div>
                  </div>
                  {datedItems.length ? (
                    <ol className="work-timeline-items">
                      {datedItems.map((marker) => {
                        const { entry } = marker;
                        const due = marker.dateKey;
                        return (
                          <li
                            key={`${entry.item.id}-${marker.label}`}
                            className="work-timeline-item-row"
                          >
                            <div className="work-timeline-row-label work-timeline-row-label--item">
                              <Link to={taskHref(entry.item.id)}>
                                {entry.item.title}
                              </Link>
                              <small>
                                {kindLabel(entry.item.kind)} ·{" "}
                                {stateLabel(entry.item.state)}
                              </small>
                            </div>
                            <div className="work-timeline-track">
                              <Pressable
                                className="work-timeline-marker"
                                data-kind={marker.kind}
                                style={
                                  {
                                    "--timeline-position": `${percent(due, start, end)}%`,
                                  } as CSSProperties
                                }
                                onClick={(event) =>
                                  onEdit(
                                    {
                                type: "item",
                                record: entry.item,
                                dateKind: marker.label,
                                    },
                                    event.currentTarget,
                                  )
                                }
                                aria-label={`Edit ${marker.label} date for ${entry.item.title}, ${longDate(due)}`}
                              >
                                {itemIcon(entry.item.kind)}
                                <span>{marker.label === "attention" ? "Attention · " : "Due · "}{shortDate(due, today)}</span>
                              </Pressable>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function WorkPlanningAgenda({
  entries,
  today,
  spanningGoals,
  unscheduled,
  onEdit,
}: {
  entries: AgendaEntry[];
  today: string;
  spanningGoals: Goal[];
  unscheduled: Array<{
    id: string;
    title: string;
    kind: AgendaEntry["kind"];
    context?: string;
    state: AgendaEntry["state"];
    href: string;
    editTarget: EditTarget;
  }>;
  onEdit: (target: EditTarget, trigger: HTMLElement) => void;
}) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const detailHref = (href: string) => workDetailHref(
    href,
    returnTo,
    href.startsWith("/work/goals/") ? "/work/goals" : "/work/tasks",
  );
  const grouped = new Map<string, AgendaEntry[]>();
  for (const entry of entries)
    grouped.set(entry.dateKey, [...(grouped.get(entry.dateKey) ?? []), entry]);
  return (
    <div
      className="work-planning-agenda"
      aria-label="Dated Work planning agenda"
    >
      {spanningGoals.length ? (
        <section
          className="work-agenda-spans"
          aria-labelledby="work-agenda-spans-title"
        >
          <h2 id="work-agenda-spans-title">Spans this range</h2>
          <ol>
            {spanningGoals.map((goal) => (
              <li key={goal.id}>
                <Link to={detailHref(`/work/goals/${encodeURIComponent(goal.id)}`)}>
                  <span className="work-agenda-icon" data-kind="goal-start">
                    <Target size={14} aria-hidden="true" />
                  </span>
                  <span className="work-agenda-copy">
                    <strong>{goal.title}</strong>
                    <small>
                      {longDate(toDateKey(goal.plannedStart)!)}–
                      {longDate(toDateKey(goal.targetDate)!)}
                    </small>
                  </span>
                </Link>
                <Button
                  tone="ghost"
                  onClick={(event) =>
                    onEdit({ type: "goal", record: goal }, event.currentTarget)
                  }
                  aria-label={`Edit dates for ${goal.title}`}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit date
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {unscheduled.length ? (
        <section className="work-agenda-unscheduled" aria-labelledby="work-agenda-unscheduled-title">
          <h2 id="work-agenda-unscheduled-title">Unscheduled</h2>
          <ul>
            {unscheduled.map((entry) => (
              <li key={entry.id}>
                <Link to={detailHref(entry.href)}>
                  <span className="work-agenda-icon" data-kind={entry.kind}>
                    {itemIcon(entry.kind)}
                  </span>
                  <span className="work-agenda-copy">
                    <strong>{entry.title}</strong>
                    <small>{kindLabel(entry.kind)}{entry.context ? ` · ${entry.context}` : ""} · {stateLabel(entry.state)}</small>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
                <Button tone="ghost" onClick={(event) => onEdit(entry.editTarget, event.currentTarget)} aria-label={`Edit date for ${entry.title}`}>
                  <Pencil size={14} aria-hidden="true" />
                  Add date
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ol>
        {[...grouped.entries()].map(([key, values]) => (
          <li key={key} className="work-agenda-day">
            <time dateTime={key}>
              <span>{formatDate(key, { weekday: "short" })}</span>
              <strong>{shortDate(key, today)}</strong>
            </time>
            <ol>
              {values.map((entry) => (
                <li key={entry.id}>
                  <Link to={detailHref(entry.href)}>
                    <span className="work-agenda-icon" data-kind={entry.kind}>
                      {itemIcon(entry.kind)}
                    </span>
                    <span className="work-agenda-copy">
                      <strong>{entry.title}</strong>
                      <small>
                        {kindLabel(entry.kind)}
                        {entry.context ? ` · ${entry.context}` : ""} ·{" "}
                        {stateLabel(entry.state)}
                      </small>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                  <Button
                    tone="ghost"
                    onClick={(event) =>
                      onEdit(entry.editTarget, event.currentTarget)
                    }
                    aria-label={`Edit date for ${entry.title}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </Button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WorkTimelineWorkspace({
  onAskKora,
  services = runtime,
  now = () => new Date(),
  requestKey = () => crypto.randomUUID(),
  embedded = false,
  scope,
}: {
  onAskKora?: (
    reference?: ConversationContextReference,
    draft?: string,
  ) => void;
  services?: TimelineServices;
  now?: () => Date;
  requestKey?: string | (() => string);
  embedded?: boolean;
  scope?: { goal: Goal };
}) {
  useViewBar(() => (embedded ? {} : { title: "Work", titleRole: "label" }), [embedded]);
  const client = useQueryClient();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const detailHref = (href: string) => workDetailHref(
    href,
    returnTo,
    href.startsWith("/work/goals/") ? "/work/goals" : "/work/tasks",
  );
  const [params, setParams] = useSearchParams();
  const localNow = now();
  const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  const rangeParam = params.get("range") as TimelineRange | null;
  const range = rangeParam && RANGE_VALUES.has(rangeParam) ? rangeParam : "30";
  const anchor = isValidTimelineDateKey(params.get("date"))
    ? params.get("date")!
    : today;
  const rangeDays = Number(range);
  const start = shiftDate(anchor, -Math.floor(rangeDays / 2));
  const end = shiftDate(start, rangeDays);
  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes))
      value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const fixtureKey = typeof requestKey === "string" ? requestKey : "runtime";
  const scopeGoal = scope?.goal;
  const goalsQuery = useInfiniteQuery({
    queryKey: ["work", "timeline", "goals", fixtureKey, scopeGoal?.id ?? "global"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      services.goalsPage({ filter: "open", limit: 50, cursor: pageParam }),
    getNextPageParam: (page) => (page.complete ? undefined : page.cursor),
    enabled: !scopeGoal,
  });
  const itemsQuery = useInfiniteQuery({
    queryKey: ["work", "timeline", "items", fixtureKey, scopeGoal?.id ?? "global"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      services.workItems({ filter: "open", ...(scopeGoal ? { goalId: scopeGoal.id } : {}), limit: 50, cursor: pageParam }),
    getNextPageParam: (page) => (page.complete ? undefined : page.cursor),
  });
  const goals = useMemo(
    () => scopeGoal
      ? [{ goal: scopeGoal, visibleOpenWorkItemCount: 0, inUserAttention: false }]
      : goalsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [goalsQuery.data, scopeGoal],
  );
  const items = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [itemsQuery.data],
  );
  const goalTitle = new Map(
    goals.map((entry) => [entry.goal.id, entry.goal.title]),
  );
  const agenda = useMemo(() => {
    const result: AgendaEntry[] = [];
    for (const entry of goals) {
      const a = toDateKey(entry.goal.plannedStart);
      const b = toDateKey(entry.goal.targetDate);
      if (inRange(a, start, end))
        result.push({
          id: `${entry.goal.id}-start`,
          dateKey: a!,
          kind: "goal-start",
          title: entry.goal.title,
          state: entry.goal.lifecycle,
          href: `/work/goals/${encodeURIComponent(entry.goal.id)}`,
          editTarget: { type: "goal", record: entry.goal },
        });
      if (inRange(b, start, end))
        result.push({
          id: `${entry.goal.id}-target`,
          dateKey: b!,
          kind: "goal-target",
          title: entry.goal.title,
          state: entry.goal.lifecycle,
          href: `/work/goals/${encodeURIComponent(entry.goal.id)}`,
          editTarget: { type: "goal", record: entry.goal },
        });
      const hardDeadline = toDateKey(entry.goal.hardDeadline);
      if (inRange(hardDeadline, start, end))
        result.push({
          id: `${entry.goal.id}-hard-deadline`,
          dateKey: hardDeadline!,
          kind: "goal-deadline",
          title: entry.goal.title,
          state: entry.goal.lifecycle,
          href: `/work/goals/${encodeURIComponent(entry.goal.id)}`,
          editTarget: { type: "goal", record: entry.goal },
        });
    }
    for (const entry of items) {
      const due = taskDateKey(entry.item.dueAt);
      if (inRange(due, start, end))
        result.push({
          id: `${entry.item.id}-due`,
          dateKey: due!,
          kind: entry.item.kind,
          title: entry.item.title,
          context:
            entry.goal?.title ??
            (entry.item.goalId
              ? goalTitle.get(entry.item.goalId)
              : undefined),
          state: entry.item.state,
          href: `/work/tasks/${encodeURIComponent(entry.item.id)}`,
          editTarget: { type: "item", record: entry.item, dateKind: "due" },
        });
      const attention = taskDateKey(entry.item.attentionAt);
      if (inRange(attention, start, end))
        result.push({
          id: `${entry.item.id}-attention`,
          dateKey: attention!,
          kind: "task-attention",
          title: entry.item.title,
          context:
            entry.goal?.title ??
            (entry.item.goalId ? goalTitle.get(entry.item.goalId) : undefined),
          state: entry.item.state,
          href: `/work/tasks/${encodeURIComponent(entry.item.id)}`,
          editTarget: { type: "item", record: entry.item, dateKind: "attention" },
        });
    }
    return result.sort(
      (a, b) =>
        a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title),
    );
  }, [end, goals, goalTitle, items, start]);
  const [editTarget, setEditTarget] = useState<EditTarget>();
  const [draftDate, setDraftDate] = useState("");
  const [draftStart, setDraftStart] = useState("");
  const [draftTarget, setDraftTarget] = useState("");
  const [draftHardDeadline, setDraftHardDeadline] = useState("");
  const [editIssue, setEditIssue] = useState<{
    kind: "conflict" | "restricted" | "error";
    message: string;
  }>();
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const itemDateRef = useRef<HTMLInputElement>(null);
  const goalStartRef = useRef<HTMLInputElement>(null);
  const originalDate = editTarget
    ? editTarget.type === "item"
      ? (taskDateKey(editTarget.record[editTarget.dateKind === "attention" ? "attentionAt" : "dueAt"]) ?? "")
      : ""
    : "";
  const dirty = Boolean(
    editTarget &&
    (editTarget.type === "goal"
      ? draftStart !== (toDateKey(editTarget.record.plannedStart) ?? "") ||
        draftTarget !== (toDateKey(editTarget.record.targetDate) ?? "") ||
        draftHardDeadline !== (toDateKey(editTarget.record.hardDeadline) ?? "")
      : draftDate !== originalDate),
  );
  const trulyClose = () => {
    setEditTarget(undefined);
    setDraftDate("");
    setDraftStart("");
    setDraftTarget("");
    setDraftHardDeadline("");
    setEditIssue(undefined);
    setDiscardPrompt(false);
  };
  const requestClose = () => {
    if (save.isPending) return;
    if (dirty) {
      setDiscardPrompt(true);
      window.requestAnimationFrame(() => keepRef.current?.focus());
    } else trulyClose();
  };
  const openEdit = (target: EditTarget, trigger: HTMLElement) => {
    if (
      (target.type === "goal" && target.record.sensitivity === "restricted") ||
      !(target.type === "goal"
        ? ["idea", "planned", "active", "paused"].includes(target.record.lifecycle)
        : ["planned", "active", "blocked"].includes(target.record.state))
    )
      return;
    openerRef.current = trigger;
    setEditTarget(target);
    setDraftDate(
      target.type === "item"
        ? (taskDateKey(target.record[target.dateKind === "attention" ? "attentionAt" : "dueAt"]) ?? "")
        : "",
    );
    setDraftStart(
      target.type === "goal" ? (toDateKey(target.record.plannedStart) ?? "") : "",
    );
    setDraftTarget(
      target.type === "goal" ? (toDateKey(target.record.targetDate) ?? "") : "",
    );
    setDraftHardDeadline(
      target.type === "goal" ? (toDateKey(target.record.hardDeadline) ?? "") : "",
    );
    setEditIssue(undefined);
    setDiscardPrompt(false);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!editTarget)
        throw new Error("This dated record is no longer available.");
      if (draftDate && !isValidTimelineDateKey(draftDate))
        throw new Error("Enter a valid calendar date.");
      if (draftStart && !isValidTimelineDateKey(draftStart))
        throw new Error("Enter a valid start date.");
      if (draftTarget && !isValidTimelineDateKey(draftTarget))
        throw new Error("Enter a valid target date.");
      if (draftHardDeadline && !isValidTimelineDateKey(draftHardDeadline))
        throw new Error("Enter a valid hard deadline.");
      if (
        editTarget.type === "goal" &&
        draftStart &&
        draftTarget &&
        draftStart > draftTarget
      )
        throw new Error("Start date must be on or before the target date.");
      const key = (
        typeof requestKey === "string"
          ? `${requestKey}:${editTarget.record.id}:dates`
          : requestKey()
      ) as ReturnType<typeof crypto.randomUUID>;
      const outcome =
        editTarget.type === "goal"
          ? await services.updateGoal(
              editTarget.record.id,
              editTarget.record.version,
              {
                plannedStart: draftStart || null,
                targetDate: draftTarget || null,
                hardDeadline: draftHardDeadline || null,
                provenance: "gui_direct",
              },
              key,
            )
          : await services.updateWorkItem(
              editTarget.record.id,
              editTarget.record.version,
              {
                ...(editTarget.dateKind === "attention"
                  ? {
                      attentionAt: draftDate
                        ? taskDateOnLocalWallTime(draftDate, editTarget.record.attentionAt) ?? null
                        : null,
                    }
                  : {
                      dueAt: draftDate
                        ? taskDateOnLocalWallTime(draftDate, editTarget.record.dueAt) ?? null
                        : null,
                    }),
                provenance: "gui_direct",
              },
              key,
            );
      return editTarget.record.title;
    },
    onSuccess: async (title) => {
      setAnnouncement(`${title} date saved.`);
      trulyClose();
      await client.invalidateQueries({ queryKey: ["work"] });
    },
    onError: async (cause) => {
      const conflict =
        cause instanceof RuntimeRequestError && cause.code.includes("conflict");
      const restricted =
        cause instanceof RuntimeRequestError &&
        cause.code.includes("restricted");
      setEditIssue({
        kind: conflict ? "conflict" : restricted ? "restricted" : "error",
        message: conflict
          ? "This Work changed after Timeline loaded. The latest version is being refreshed; your draft date is preserved."
          : cause instanceof Error
            ? cause.message
            : "The date could not be saved.",
      });
      if (conflict) {
        const scopedGoalRefresh =
          scopeGoal && editTarget?.type === "goal"
            ? (services.goal ?? runtime.goal)(editTarget.record.id)
            : Promise.resolve(undefined);
        const [latestGoals, latestItems, latestScopedGoal] = await Promise.all([
          scopeGoal ? Promise.resolve(undefined) : goalsQuery.refetch(),
          itemsQuery.refetch(),
          scopedGoalRefresh,
        ]);
        setEditTarget((current) => {
          if (!current) return current;
          if (current.type === "goal") {
            const record = latestScopedGoal?.goal ?? (latestGoals as typeof goalsQuery | undefined)?.data?.pages
              .flatMap((page) => page.items)
              .find((entry) => entry.goal.id === current.record.id)?.goal;
            return record ? { type: "goal", record } : current;
          }
          const record = latestItems.data?.pages
            .flatMap((page) => page.items)
            .find((entry) => entry.item.id === current.record.id)?.item;
          return record ? { type: "item", record, dateKind: current.dateKind } : current;
        });
      }
    },
  });
  const goalsLoading = !scopeGoal && goalsQuery.isPending;
  const goalsError = !scopeGoal && goalsQuery.isError;
  const loading =
    (goalsLoading || itemsQuery.isPending) &&
    !goals.length &&
    !items.length;
  const totalError =
    goalsError && itemsQuery.isError && !goals.length && !items.length;
  const offline = [scopeGoal ? undefined : goalsQuery.error, itemsQuery.error].some(
    (error) => error instanceof RuntimeRequestError && error.code === "runtime_disconnected",
  );
  const totalLoaded = goals.length + items.length;
  const partialReasons = [
    goalsError ? "Projects could not be read" : null,
    itemsQuery.isError ? "Work items could not be read" : null,
    !scopeGoal && goalsQuery.isFetchNextPageError ? "More Projects could not be loaded" : null,
    itemsQuery.isFetchNextPageError
      ? "More Work items could not be loaded"
      : null,
    (!scopeGoal && goalsQuery.hasNextPage) || itemsQuery.hasNextPage
      ? "More records remain"
      : null,
  ].filter(Boolean) as string[];
  const retryablePartial =
    goalsError ||
    itemsQuery.isError ||
    goalsQuery.isFetchNextPageError ||
    itemsQuery.isFetchNextPageError;
  const unscheduled = [
    ...goals
      .filter((entry) => !toDateKey(entry.goal.plannedStart) && !toDateKey(entry.goal.targetDate) && !toDateKey(entry.goal.hardDeadline))
      .map((entry) => ({
        id: `${entry.goal.id}-unscheduled`,
        title: entry.goal.title,
        kind: "goal-start" as const,
        context: undefined,
        state: entry.goal.lifecycle,
        href: `/work/goals/${encodeURIComponent(entry.goal.id)}`,
        editTarget: { type: "goal", record: entry.goal } as EditTarget,
      })),
    ...items
      .filter((entry) => !taskDateKey(entry.item.dueAt) && !taskDateKey(entry.item.attentionAt))
      .map((entry) => ({
        id: `${entry.item.id}-unscheduled`,
        title: entry.item.title,
        kind: entry.item.kind,
        context: entry.goal?.title ?? (entry.item.goalId ? goalTitle.get(entry.item.goalId) : undefined),
        state: entry.item.state,
        href: `/work/tasks/${encodeURIComponent(entry.item.id)}`,
        editTarget: { type: "item", record: entry.item } as EditTarget,
      })),
  ];
  const unscheduledCount = unscheduled.length;
  const spanningGoals = goals
    .map((entry) => entry.goal)
    .filter((goal) => {
      const goalStart = toDateKey(goal.plannedStart);
      const goalTarget = toDateKey(goal.targetDate);
      return Boolean(
        overlaps(goalStart, goalTarget, start, end) &&
        !inRange(goalStart, start, end) &&
        !inRange(goalTarget, start, end),
      );
    });
  const timelineStatus = loading
    ? "Loading dated Work"
    : totalError
      ? "Availability unknown"
      : !totalLoaded && (goalsError || itemsQuery.isError)
        ? "Partial · count unavailable"
        : `${shortDate(start, today)}–${shortDate(end, today)} · ${agenda.length} dated ${agenda.length === 1 ? "entry" : "entries"}${unscheduledCount ? ` · ${unscheduledCount} without dates` : ""}`;
  let content: ReactNode;
  if (loading)
    content = (
      <StateView
        state="loading"
        title="Laying out dated Work"
        geometry={<LoadingTimeline />}
      />
    );
  else if (totalError)
    content = (
      <StateView
        state="error"
        title={offline ? "Timeline is offline" : "Timeline is unavailable"}
        body={offline ? "Kora's local runtime is disconnected. Dated Work could not be read and no records were changed; reconnect, then retry." : "Kora could not read Projects or Work items right now."}
        action={
          <Button
            onClick={() => {
              if (goalsError) void goalsQuery.refetch();
              void itemsQuery.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  else if (!totalLoaded && (goalsError || itemsQuery.isError))
    content = (
      <StateView
        state="partial"
        title="Timeline is only partly available"
        body="One Work collection is unavailable, so Kora cannot determine whether this timeline is empty."
        action={
          <Button
            onClick={() => {
              if (goalsError) void goalsQuery.refetch();
              if (itemsQuery.isError) void itemsQuery.refetch();
            }}
          >
            Retry unavailable data
          </Button>
        }
      />
    );
  else if (!totalLoaded)
    content = (
      <StateView
        state="empty"
        title="No Work to place yet"
        body="Create a Project or Task first. Timeline will arrange its recorded dates without creating a second schedule."
        action={
          onAskKora ? (
            <Button
              tone="primary"
              onClick={() =>
                onAskKora(
                  undefined,
                  "Help me define a Project and the first dated Work needed to move it forward.",
                )
              }
            >
              Plan with Kora
            </Button>
          ) : undefined
        }
      />
    );
  else if (
    !agenda.length &&
    !unscheduled.length &&
    !goals.some((g) =>
      overlaps(toDateKey(g.goal.plannedStart), toDateKey(g.goal.targetDate), start, end),
    )
  )
    content = (
      <StateView
        state="empty"
        title="Nothing is dated in this range"
        body="Your Work remains available. Move the window or choose a wider range to see other recorded dates."
        action={
          <Button onClick={() => updateParams({ range: "90" })}>
            Show 3 months
          </Button>
        }
      />
    );
  else
    content = (
      <>
        <WorkPlanningTimeline
          goals={goals}
          items={items}
          start={start}
          end={end}
          today={today}
          onEdit={openEdit}
        />
        {unscheduled.length ? (
          <section className="work-timeline-unscheduled-panel" aria-labelledby="work-timeline-unscheduled-title">
            <div className="work-timeline-unscheduled-panel__heading">
              <h2 id="work-timeline-unscheduled-title">Unscheduled</h2>
              <span>{unscheduled.length} {unscheduled.length === 1 ? "item" : "items"} without a date</span>
            </div>
            <ul>
              {unscheduled.map((entry) => (
                <li key={entry.id}>
                  <Link to={detailHref(entry.href)}>
                    <span className="work-agenda-icon" data-kind={entry.kind}>{itemIcon(entry.kind)}</span>
                    <span className="work-agenda-copy"><strong>{entry.title}</strong><small>{kindLabel(entry.kind)}{entry.context ? ` · ${entry.context}` : ""} · {stateLabel(entry.state)}</small></span>
                  </Link>
                  <Button tone="ghost" onClick={(event) => openEdit(entry.editTarget, event.currentTarget)} aria-label={`Edit date for ${entry.title}`}><Pencil size={14} aria-hidden="true" />Add date</Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <WorkPlanningAgenda
          entries={agenda}
          today={today}
          spanningGoals={spanningGoals}
          unscheduled={unscheduled}
          onEdit={openEdit}
        />
      </>
    );
  return (
    <section className="work-timeline-workspace">
      <PageFrame
        width="fill"
        scroll="page"
        sidebar={embedded ? undefined : <WorkNavigation />}
        sidebarLabel="Work"
      >
        {!embedded ? <PageHeader
          title="Timeline"
            description="See how dated Projects, milestones, commitments, and Tasks unfold. Calendar remains the home for time blocks and events."
          status={<span>{timelineStatus}</span>}
          actions={
            onAskKora ? (
              <Button
                tone="ghost"
                onClick={() =>
                  onAskKora(
                    undefined,
                    `Review my dated Work between ${start} and ${end}. Explain conflicts or missing next steps without changing anything.`,
                  )
                }
              >
                <MessageCircleMore size={15} aria-hidden="true" />
                Review with Kora
              </Button>
            ) : undefined
          }
        /> : null}
        <PageToolbar
          sticky
          controls={
            <>
              <KoraSelect
                label="Timeline range"
                value={range}
                onValueChange={(value) =>
                  updateParams({ range: value === "30" ? undefined : value })
                }
                options={RANGE_OPTIONS}
              />
              <div
                className="work-timeline-window-controls"
                role="group"
                aria-label="Timeline window"
              >
                <Button
                  tone="ghost"
                  aria-label={`Previous ${rangeDays} days`}
                  onClick={() =>
                    updateParams({ date: shiftDate(anchor, -rangeDays) })
                  }
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </Button>
                <Button onClick={() => updateParams({ date: undefined })}>
                  Today
                </Button>
                <Button
                  tone="ghost"
                  aria-label={`Next ${rangeDays} days`}
                  onClick={() =>
                    updateParams({ date: shiftDate(anchor, rangeDays) })
                  }
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </>
          }
          secondaryActions={
            (!scopeGoal && goalsQuery.hasNextPage) || itemsQuery.hasNextPage ? (
              <Button
                loading={
                  (!scopeGoal && goalsQuery.isFetchingNextPage) || itemsQuery.isFetchingNextPage
                }
                onClick={() => {
                  if (!scopeGoal && goalsQuery.hasNextPage) void goalsQuery.fetchNextPage();
                  if (itemsQuery.hasNextPage) void itemsQuery.fetchNextPage();
                }}
              >
                Load more planning data
              </Button>
            ) : undefined
          }
        />
        {!embedded ? <div className="work-timeline-context">
          <CalendarClock size={15} aria-hidden="true" />
          <span>
            Plan around your real Projects and Tasks. Timeline dates do not create
            Calendar events.
          </span>
        </div> : null}
        <TimelineLegend />
        {totalLoaded > 0 && partialReasons.length ? (
          <div className="work-timeline-qualification" role="status">
            <CircleAlert size={15} aria-hidden="true" />
            <span>
              <strong>Showing available planning data.</strong>{" "}
              {partialReasons.join("; ")}.
            </span>
            {retryablePartial ? (
              <Button
                tone="ghost"
                onClick={() => {
                  if (goalsError || goalsQuery.isFetchNextPageError)
                    void goalsQuery.refetch();
                  if (itemsQuery.isError || itemsQuery.isFetchNextPageError)
                    void itemsQuery.refetch();
                }}
              >
                Retry missing data
              </Button>
            ) : null}
          </div>
        ) : null}
        {announcement ? (
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        ) : null}
        {content}
      </PageFrame>
      <Modal
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
        title={
          editTarget
            ? `Edit ${editTarget.type === "item" && editTarget.dateKind === "attention" ? "attention date" : "date"} for “${editTarget.record.title}”`
            : "Edit Work date"
        }
        description="This updates the existing Work record. It does not create a Calendar event."
        purpose="focused-form"
        dismissPolicy="explicit"
        onDismissAttempt={requestClose}
        busy={save.isPending}
        finalFocus={openerRef}
      >
        <form
          className="work-timeline-date-editor"
          onSubmit={(event) => {
            event.preventDefault();
            setEditIssue(undefined);
            save.mutate();
          }}
        >
          {editIssue ? (
            <div
              className={`work-timeline-date-editor__issue is-${editIssue.kind}`}
              role="alert"
              tabIndex={-1}
            >
              <CircleAlert size={16} aria-hidden="true" />
              <span>
                <strong>
                  {editIssue.kind === "conflict"
                    ? "Review the latest version"
                    : editIssue.kind === "restricted"
                      ? "Approved access required"
                      : "Date was not saved"}
                </strong>
                {editIssue.message}
              </span>
            </div>
          ) : null}
          {editTarget?.type === "goal" ? (
            <div className="work-timeline-date-editor__goal-dates">
              <Field label="Start date">
                <Input
                  ref={goalStartRef}
                  type="date"
                  autoFocus
                  value={draftStart}
                  onChange={(event) => {
                    setDraftStart(event.target.value);
                    setEditIssue(undefined);
                    setDiscardPrompt(false);
                  }}
                />
              </Field>
              <Field
                label="Target date"
                hint="Must be on or after the start date."
              >
                <Input
                  type="date"
                  value={draftTarget}
                  onChange={(event) => {
                    setDraftTarget(event.target.value);
                    setEditIssue(undefined);
                    setDiscardPrompt(false);
                  }}
                />
              </Field>
              <Field label="Hard deadline" hint="The latest date this Project can be met.">
                <Input
                  type="date"
                  value={draftHardDeadline}
                  onChange={(event) => {
                    setDraftHardDeadline(event.target.value);
                    setEditIssue(undefined);
                    setDiscardPrompt(false);
                  }}
                />
              </Field>
            </div>
          ) : (
            <Field
              label={editTarget?.type === "item" && editTarget.dateKind === "attention" ? "Attention date" : "Due date"}
              hint="Timeline changes the calendar-date portion. An existing time is preserved; previously undated Work uses a neutral noon local-time anchor."
            >
              <Input
                ref={itemDateRef}
                type="date"
                autoFocus
                value={draftDate}
                onChange={(event) => {
                  setDraftDate(event.target.value);
                  setEditIssue(undefined);
                  setDiscardPrompt(false);
                }}
              />
            </Field>
          )}
          {discardPrompt ? (
            <div className="work-timeline-date-editor__discard" role="alert">
              <span>
                <strong>Discard unsaved changes?</strong>
                <small>The Work record has not changed.</small>
              </span>
              <Button
                ref={keepRef}
                type="button"
                onClick={() => {
                  (editTarget?.type === "goal"
                    ? goalStartRef.current
                    : itemDateRef.current
                  )?.focus();
                  setDiscardPrompt(false);
                }}
              >
                Keep editing
              </Button>
              <Button type="button" tone="danger" onClick={trulyClose}>
                Discard changes
              </Button>
            </div>
          ) : null}
          <div className="work-timeline-date-editor__actions">
            <Button type="button" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              loading={save.isPending}
              disabled={
                !dirty ||
                Boolean(
                  (draftDate && !isValidTimelineDateKey(draftDate)) ||
                  (draftStart && !isValidTimelineDateKey(draftStart)) ||
                  (draftTarget && !isValidTimelineDateKey(draftTarget)) ||
                  (draftHardDeadline && !isValidTimelineDateKey(draftHardDeadline)) ||
                  (editTarget?.type === "goal" &&
                    draftStart &&
                    draftTarget &&
                    draftStart > draftTarget),
                )
              }
            >
              Save date
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
