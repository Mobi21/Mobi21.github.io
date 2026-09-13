import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CircleAlert, Columns3, LayoutGrid, List, ListFilter, Plus, Sparkles, Target } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge, Button, Field, Input, KoraSelect, Modal, PageFrame, PageHeader, PageToolbar,
  RadioGroup, SearchField, SegmentedControl, Sheet, StateView, Textarea, type BadgeTone,
} from "../../components/primitives";
import { runtime, RuntimeRequestError, type ConversationContextReference, type Goal, type GoalListFilter, type GoalListEntry, type GoalShape, type Project } from "../../lib/runtime";
import { useViewBar } from "../../app/ViewBar";
import { WorkNavigation } from "./WorkNavigation";
import { flattenCurrentWork, selectGoalNextMove } from "./work-selection";
import { workDetailHref } from "./work-navigation-state";
import "./work-goals.css";

type GoalView = "cards" | "list" | "board";
type GoalStage = "ideas" | "coming-up" | "in-progress" | "paused" | "finished";
export type WorkGoalsServices = Partial<Pick<typeof runtime,
  "goalsPage" | "goalWorkspace" | "updateGoal" | "createGoal" |
  "projectsPage" | "projectWorkspace" | "updateProject" | "createProject"
>>;

const FILTER_OPTIONS: Array<{ value: GoalListFilter; label: string }> = [
  { value: "open", label: "Open" }, { value: "active", label: "In progress" },
  { value: "planned", label: "Planned" }, { value: "paused", label: "Paused" },
  { value: "terminal", label: "Finished" },
];
const goalFromLegacyProject = (project: Project): Goal => ({
  id: project.id, title: project.title, ...(project.area ? { area: project.area } : {}),
  purposeMarkdown: project.purposeMarkdown, shape: "finish",
  lifecycle: project.state === "blocked" ? "paused" : project.state === "completed" ? "achieved" : project.state === "cancelled" ? "stopped" : project.state === "archived" ? "archived" : project.state,
  priority: project.priority, ...(project.startDate ? { plannedStart: project.startDate } : {}),
  ...(project.targetDate ? { targetDate: project.targetDate } : {}),
  ...(project.blocker ? { pauseReason: project.blocker } : {}),
  ...(project.resultMarkdown ? { resultMarkdown: project.resultMarkdown } : {}),
  ...(project.cancellationReason ? { stopReason: project.cancellationReason } : {}),
  sensitivity: "private", provenance: project.provenance, version: project.version,
  createdAt: project.createdAt, updatedAt: project.updatedAt,
  ...(project.completedAt ? { achievedAt: project.completedAt } : {}),
  ...(project.cancelledAt ? { stoppedAt: project.cancelledAt } : {}),
  ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
});
const VIEW_OPTIONS = [
  { value: "cards", label: <><LayoutGrid size={14} aria-hidden="true" />Cards</> },
  { value: "list", label: <><List size={14} aria-hidden="true" />List</> },
  { value: "board", label: <><Columns3 size={14} aria-hidden="true" />Board</> },
];
const FILTER_VALUES = new Set(FILTER_OPTIONS.map((option) => option.value));
const VIEW_VALUES = new Set(VIEW_OPTIONS.map((option) => option.value));
const stateLabel = (lifecycle: Goal["lifecycle"]) => lifecycle === "active" ? "In progress" : lifecycle === "achieved" ? "Achieved" : lifecycle === "stopped" ? "Stopped" : `${lifecycle[0].toUpperCase()}${lifecycle.slice(1)}`;
const stateTone = (lifecycle: Goal["lifecycle"]): BadgeTone => lifecycle === "active" ? "work" : lifecycle === "paused" ? "danger" : lifecycle === "achieved" ? "success" : lifecycle === "archived" || lifecycle === "stopped" ? "quiet" : "neutral";
const stageFor = (goal: Goal): GoalStage => ["achieved", "stopped", "archived"].includes(goal.lifecycle) ? "finished" : goal.lifecycle === "paused" ? "paused" : goal.lifecycle === "active" ? "in-progress" : goal.lifecycle === "idea" || (goal.lifecycle === "planned" && goal.priority === 0) ? "ideas" : "coming-up";
const stageLabel = (stage: GoalStage) => stage === "ideas" ? "Ideas" : stage === "coming-up" ? "Coming up" : stage === "in-progress" ? "In progress" : stage === "paused" ? "Paused" : "Finished";
const legalStages = (goal: Goal): GoalStage[] => goal.lifecycle === "idea" || goal.lifecycle === "planned"
  ? ["ideas", "coming-up", "in-progress", "paused"]
  : goal.lifecycle === "active"
    ? ["in-progress", "paused"]
    : ["finished"];
const shortDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) }).format(date);
};
const readTime = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(timestamp));
const validDateKey = (value: string) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function GoalSignals({ entry }: { entry: GoalListEntry }) {
  const target = shortDate(entry.goal.targetDate);
  const blocked = entry.visibleBlockedWorkItemCount ?? 0;
  const overdue = entry.visibleOverdueWorkItemCount ?? 0;
  return <div className="work-goal-signals">
    <span><strong>{entry.visibleOpenWorkItemCount}</strong> open</span>
    {blocked ? <span className="work-goal-signals__blocked"><CircleAlert size={13} aria-hidden="true" />{blocked} blocked</span> : null}
    {overdue ? <span className="work-goal-signals__blocked">{overdue} overdue</span> : target ? <span><CalendarDays size={13} aria-hidden="true" />{target}</span> : null}
  </div>;
}

function GoalPosition({ entry, compact = false }: { entry: GoalListEntry; compact?: boolean }) {
  const { goal, nextOpenWorkItem } = entry;
  const current = goal.currentPositionMarkdown || goal.pauseReason
    || `${stateLabel(goal.lifecycle)} · ${entry.visibleOpenWorkItemCount} open ${entry.visibleOpenWorkItemCount === 1 ? "item" : "items"}`;
  return <div className={`work-goal-position${compact ? " work-goal-position--compact" : ""}`}>
    <p><span>Current</span>{current}</p>
    <p><span>Next</span>{nextOpenWorkItem ? <Link to={`/work/tasks/${encodeURIComponent(nextOpenWorkItem.id)}`}>{nextOpenWorkItem.title}</Link> : entry.visibleOpenWorkItemCount ? "Next action unavailable" : "No next action recorded"}</p>
  </div>;
}

function GoalCard({ entry, returnTo }: { entry: GoalListEntry; returnTo: string }) {
  const { goal } = entry;
  return <article className="work-goal-card">
    <div className="work-goal-card__meta">
      <Badge tone={stateTone(goal.lifecycle)} dot>{stateLabel(goal.lifecycle)}</Badge>
      <span className="work-goal-card__context">{goal.area || "General"}{entry.inUserAttention ? <><Target size={13} aria-hidden="true" />In focus</> : null}</span>
    </div>
    <div className="work-goal-card__identity">
      <Link to={workDetailHref(`/work/goals/${encodeURIComponent(goal.id)}`, returnTo, "/work")}>{goal.title}</Link>
      <p>{goal.purposeMarkdown || "No outcome has been described yet."}</p>
    </div>
    <GoalPosition entry={entry} />
    <GoalSignals entry={entry} />
  </article>;
}

const goalAttentionOrder = (left: GoalListEntry, right: GoalListEntry) => {
  const leftUrgency = (left.goal.lifecycle === "paused" || left.goal.pauseReason || (left.visibleBlockedWorkItemCount ?? 0) > 0 || (left.visibleOverdueWorkItemCount ?? 0) > 0 ? 8 : 0)
    + (left.inUserAttention ? 4 : 0)
    + left.goal.priority;
  const rightUrgency = (right.goal.lifecycle === "paused" || right.goal.pauseReason || (right.visibleBlockedWorkItemCount ?? 0) > 0 || (right.visibleOverdueWorkItemCount ?? 0) > 0 ? 8 : 0)
    + (right.inUserAttention ? 4 : 0)
    + right.goal.priority;
  return rightUrgency - leftUrgency
    || Date.parse(right.lastActivityAt ?? right.goal.updatedAt)
      - Date.parse(left.lastActivityAt ?? left.goal.updatedAt);
};

function GoalPortfolio({ entries, returnTo }: { entries: GoalListEntry[]; returnTo: string }) {
  const ordered = [...entries].sort(goalAttentionOrder);
  const attention = ordered.filter((entry) => entry.inUserAttention
    || entry.goal.lifecycle === "paused"
    || Boolean(entry.goal.pauseReason)
    || (entry.visibleBlockedWorkItemCount ?? 0) > 0
    || (entry.visibleOverdueWorkItemCount ?? 0) > 0);
  const featured = (attention.length ? attention : ordered).slice(0, 2);
  const featuredIds = new Set(featured.map((entry) => entry.goal.id));
  const remaining = ordered.filter((entry) => !featuredIds.has(entry.goal.id));
  const visibleRemaining = remaining.slice(0, 6);
  const hiddenCount = remaining.length - visibleRemaining.length;
  const listParams = new URLSearchParams(returnTo.split("?")[1] ?? "");
  listParams.set("view", "list");
  const listHref = `${returnTo.split("?")[0]}?${listParams.toString()}`;
  return <section className="work-goal-portfolio" aria-labelledby="goal-portfolio-heading">
    <h2 id="goal-portfolio-heading" className="sr-only">Projects portfolio</h2>
    <section className="work-goal-portfolio__section" aria-labelledby="goal-portfolio-focus-heading">
      <div className="work-goal-portfolio__heading">
        <div><p>Right now</p><h3 id="goal-portfolio-focus-heading">Projects needing your attention</h3></div>
        <span>{featured.length} in focus</span>
      </div>
      <div className="work-goal-portfolio__featured">
        {featured.map((entry) => <GoalCard key={entry.goal.id} entry={entry} returnTo={returnTo} />)}
      </div>
    </section>
    {visibleRemaining.length ? <section className="work-goal-portfolio__section" aria-labelledby="goal-portfolio-other-heading">
      <div className="work-goal-portfolio__heading">
        <div><p>Everything else</p><h3 id="goal-portfolio-other-heading">Other open Projects</h3></div>
        <Link to={listHref}>View as list</Link>
      </div>
      <GoalList entries={visibleRemaining} returnTo={returnTo} />
      {hiddenCount > 0 ? <p className="work-goal-portfolio__more">{hiddenCount} more {hiddenCount === 1 ? "Project" : "Projects"} available in List view.</p> : null}
    </section> : null}
  </section>;
}

function GoalRow({ entry, returnTo }: { entry: GoalListEntry; returnTo: string }) {
  return <li>
      <span className={`work-goal-list__state work-goal-list__state--${entry.goal.lifecycle}`} aria-hidden="true" />
      <div className="work-goal-list__identity">
        <Link to={workDetailHref(`/work/goals/${encodeURIComponent(entry.goal.id)}`, returnTo, "/work")}>{entry.goal.title}</Link>
        <span className="work-goal-list__area">{entry.goal.area || "General"}{entry.nextOpenWorkItem ? ` · Next: ${entry.nextOpenWorkItem.title}` : " · No next action recorded"}</span>
      </div>
      <Badge tone={stateTone(entry.goal.lifecycle)} dot>{stateLabel(entry.goal.lifecycle)}</Badge>
      <GoalSignals entry={entry} />
      {entry.inUserAttention ? <Target className="work-goal-list__focus" size={15} aria-label="In focus" /> : null}
    </li>;
}

function GoalList({ entries, returnTo }: { entries: GoalListEntry[]; returnTo: string }) {
  return <ul className="work-goal-list" aria-label="Projects">
    {entries.map((entry) => <GoalRow key={entry.goal.id} entry={entry} returnTo={returnTo} />)}
  </ul>;
}

const BOARD_COLUMNS: Array<{ id: GoalStage; title: string; empty: string }> = [
  { id: "ideas", title: "Ideas", empty: "No ideas waiting." },
  { id: "coming-up", title: "Coming up", empty: "Nothing queued next." },
  { id: "in-progress", title: "In progress", empty: "No Projects moving now." },
  { id: "paused", title: "Paused", empty: "Nothing needs to wait." },
  { id: "finished", title: "Finished", empty: "Finished Projects appear here when included." },
];

function GoalBoardCard({ entry, onMove, busy, returnTo }: { entry: GoalListEntry; onMove: (entry: GoalListEntry, stage: GoalStage) => void; busy: boolean; returnTo: string }) {
  const stage = stageFor(entry.goal);
  return <article className="work-goal-board-card" data-goal-id={entry.goal.id}>
    <div className="work-goal-board-card__meta"><Badge tone={stateTone(entry.goal.lifecycle)} dot>{stageLabel(stage)}</Badge><span>{entry.goal.area || "General"}</span>{entry.inUserAttention ? <Target size={14} aria-label="In focus" /> : null}</div>
    <Link className="work-goal-board-card__title" to={workDetailHref(`/work/goals/${encodeURIComponent(entry.goal.id)}`, returnTo, "/work")}>{entry.goal.title}</Link>
    <GoalPosition entry={entry} compact />
    <GoalSignals entry={entry} />
    {stage !== "finished" ? <KoraSelect
      label={`Move ${entry.goal.title}`}
      value={stage}
      disabled={busy}
      onValueChange={(next) => onMove(entry, next as GoalStage)}
      options={legalStages(entry.goal).map((value) => ({ value, label: value === stage ? `Move · ${stageLabel(value)}` : `Move to ${stageLabel(value)}` }))}
    /> : null}
  </article>;
}

function GoalBoard({ entries, onCreate, services, returnTo, readOnly = false }: { entries: GoalListEntry[]; onCreate: () => void; services: WorkGoalsServices; returnTo: string; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [pauseTarget, setPauseTarget] = useState<GoalListEntry>();
  const [pauseReason, setPauseReason] = useState("");
  const [moveError, setMoveError] = useState<string>();
  const [moveErrorGoalId, setMoveErrorGoalId] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const [pendingFocusId, setPendingFocusId] = useState<string>();
  const moveErrorRef = useRef<HTMLDivElement>(null);
  const move = useMutation({
    mutationFn: async ({ entry, stage, reason }: { entry: GoalListEntry; stage: GoalStage; reason?: string }) => {
      const changes = stage === "ideas"
        ? { state: "planned" as const, priority: 0, provenance: "gui_direct" }
        : stage === "coming-up"
          ? { state: "planned" as const, priority: Math.max(1, entry.goal.priority), provenance: "gui_direct" }
          : stage === "in-progress"
            ? { state: "active" as const, provenance: "gui_direct" }
            : { state: "blocked" as const, blocker: reason?.trim() || null, provenance: "gui_direct" };
      const lifecycle: "planned" | "active" | "paused" | undefined = changes.state
        ? changes.state === "blocked" ? "paused" : changes.state
        : undefined;
      const canonicalChanges = {
        lifecycle: stage === "ideas" ? "idea" as const : lifecycle,
        ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
        ...(changes.blocker !== undefined ? { pauseReason: changes.blocker } : {}),
        provenance: changes.provenance,
      } as const;
      const result = services.updateGoal
        ? await services.updateGoal(entry.goal.id, entry.goal.version, canonicalChanges)
        : await services.updateProject!(entry.goal.id, entry.goal.version, changes);
      if (result.status !== "settled") throw new Error("This move requires approved access before it can be shown here.");
      return result;
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["work", "overview"] }),
      ]);
      setPauseTarget(undefined); setPauseReason(""); setMoveError(undefined); setMoveErrorGoalId(undefined);
      setAnnouncement(`${variables.entry.goal.title} moved to ${stageLabel(variables.stage)}.`);
      setPendingFocusId(variables.entry.goal.id);
    },
    onError: (reason, input) => {
      const conflict = reason instanceof RuntimeRequestError && reason.code === "work_conflict";
      setMoveErrorGoalId(input.entry.goal.id);
      setMoveError(conflict
        ? "This Project changed elsewhere. Refresh Projects, review the current state, and move it again."
          : reason instanceof Error
          ? `${reason.message} Loaded Projects remain unchanged.`
          : "This Project could not be moved. Loaded Projects remain unchanged.");
    },
  });
  useEffect(() => {
    if (!moveError || pauseTarget) return;
    moveErrorRef.current?.focus({ preventScroll: false });
  }, [moveError, pauseTarget]);
  useEffect(() => {
    if (!pendingFocusId || move.isPending) return;
    const timeout = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`.work-goal-board-card[data-goal-id="${CSS.escape(pendingFocusId)}"] [role="combobox"]`);
        if (!target) return;
        target.focus();
        setPendingFocusId(undefined);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [entries, move.isPending, pendingFocusId]);
  const requestMove = (entry: GoalListEntry, stage: GoalStage) => {
    if (readOnly) return;
    if (stage === stageFor(entry.goal)) return;
    setMoveError(undefined);
    if (stage === "paused") { setPauseTarget(entry); setPauseReason(entry.goal.pauseReason ?? ""); return; }
    move.mutate({ entry, stage });
  };
  return <>
    {moveError && !pauseTarget ? <div ref={moveErrorRef} className="work-goals-notice work-goals-move-error" role="alert" tabIndex={-1}>
      <span>{moveError}</span>
      <Button onClick={async () => {
        const goalId = moveErrorGoalId;
      setAnnouncement("Refreshing Projects.");
        await queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
        setMoveError(undefined);
        setMoveErrorGoalId(undefined);
        setAnnouncement("Projects refreshed. Review the current state before moving again.");
        if (goalId) setPendingFocusId(goalId);
      }}>Refresh Projects</Button>
    </div> : null}
    <div className="work-goal-board" aria-label="Projects by stage">
    {BOARD_COLUMNS.map((column) => {
      const items = entries.filter((entry) => stageFor(entry.goal) === column.id);
      return <section key={column.id} className="work-goal-board__column" aria-labelledby={`goal-column-${column.id}`}>
        <div className="work-goal-board__heading"><h2 id={`goal-column-${column.id}`}>{column.title}</h2><span>{items.length}</span></div>
        <div className="work-goal-board__items">
          {items.map((entry) => <GoalBoardCard key={entry.goal.id} entry={entry} onMove={requestMove} busy={move.isPending || readOnly} returnTo={returnTo} />)}
          {!items.length ? <p className="work-goal-board__empty">{column.empty}</p> : null}
        </div>
        {column.id === "ideas" ? <Button type="button" tone="ghost" className="work-goal-board__add" onClick={onCreate}><Plus size={14} aria-hidden="true" />Add Project</Button> : null}
      </section>;
    })}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <Modal open={Boolean(pauseTarget)} onOpenChange={(open) => { if (!open && !move.isPending) { setPauseTarget(undefined); setPauseReason(""); setMoveError(undefined); } }} title="Pause this Project" description="Name what is preventing progress so the Project remains understandable when you return." purpose="confirm" busy={move.isPending}>
      <form className="work-goal-pause" onSubmit={(event) => {
        event.preventDefault();
        if (!pauseTarget || !pauseReason.trim()) { setMoveError("Pausing a Project requires a reason."); return; }
        move.mutate({ entry: pauseTarget, stage: "paused", reason: pauseReason });
      }}>
        <Field label="Reason"><Textarea autoFocus value={pauseReason} onChange={(event) => { setPauseReason(event.target.value); setMoveError(undefined); }} rows={4} placeholder="What needs to change before this can continue?" /></Field>
        {moveError ? <p className="work-goal-form__error" role="alert"><CircleAlert size={14} aria-hidden="true" />{moveError}</p> : null}
        <div className="work-goal-pause__actions"><Button type="button" onClick={() => { setPauseTarget(undefined); setPauseReason(""); setMoveError(undefined); }}>Keep moving</Button><Button tone="primary" type="submit" loading={move.isPending}>Pause Project</Button></div>
      </form>
    </Modal>
  </>;
}

function NewGoal({ open, onOpenChange, onPlanWithKora, services }: { open: boolean; onOpenChange: (open: boolean) => void; onPlanWithKora: (draft: string) => void; services: WorkGoalsServices }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [purpose, setPurpose] = useState("");
  const [successDefinition, setSuccessDefinition] = useState("");
  const [shape, setShape] = useState<GoalShape>("finish");
  const [state, setState] = useState<"planned" | "active">("planned");
  const [priority, setPriority] = useState(2);
  const [plannedStart, setPlannedStart] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [hardDeadline, setHardDeadline] = useState("");
  const [currentPosition, setCurrentPosition] = useState("");
  const [error, setError] = useState<string>();
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const dirty = Boolean(title || area || purpose || successDefinition || shape !== "finish" || plannedStart || targetDate || hardDeadline || currentPosition || state !== "planned" || priority !== 2);
  const reset = () => {
    setTitle(""); setArea(""); setPurpose(""); setSuccessDefinition(""); setShape("finish"); setState("planned"); setPriority(2); setPlannedStart(""); setTargetDate(""); setHardDeadline(""); setCurrentPosition(""); setError(undefined); setDiscardPrompt(false);
    requestKey.current = crypto.randomUUID();
  };
  const close = () => {
    if (dirty && !discardPrompt) { setDiscardPrompt(true); return; }
    reset(); onOpenChange(false);
  };
  const create = useMutation({
    mutationFn: () => services.createGoal
      ? services.createGoal({ requestKey: requestKey.current, goal: { title: title.trim(), ...(area.trim() ? { area: area.trim() } : {}), purposeMarkdown: purpose.trim(), ...(successDefinition.trim() ? { successDefinitionMarkdown: successDefinition.trim() } : {}), shape, lifecycle: state, priority, ...(plannedStart ? { plannedStart } : {}), ...(targetDate ? { targetDate } : {}), ...(hardDeadline ? { hardDeadline } : {}), ...(currentPosition.trim() ? { currentPositionMarkdown: currentPosition.trim() } : {}), provenance: "gui_direct" } })
      : services.createProject!({ requestKey: requestKey.current, project: { title: title.trim(), ...(area.trim() ? { area: area.trim() } : {}), purposeMarkdown: purpose.trim(), state, priority, ...(targetDate ? { targetDate } : {}) } }) as Promise<any>,
    onSuccess: async (result) => {
      if (result.status !== "settled") throw new Error("This Goal requires approved access before it can be opened here.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["work", "overview"] }),
      ]);
      reset(); onOpenChange(false); navigate(`/work/goals/${encodeURIComponent(result.record.id)}`);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The Goal could not be created."),
  });
  useEffect(() => { if (open) window.requestAnimationFrame(() => titleRef.current?.focus()); }, [open]);
  return <Modal open={open} onOpenChange={(next) => { if (!next) close(); }} title="Create a Project" description="Name the outcome first. Add Tasks and Milestones after it has a clear home." purpose="focused-form" dismissPolicy="explicit" onDismissAttempt={close} busy={create.isPending} className="work-goal-form-modal">
    <form className="work-goal-form" onSubmit={(event) => {
      event.preventDefault();
      if (!title.trim() || !purpose.trim()) { setError("A Project needs both a name and a clear outcome."); return; }
      if (![plannedStart, targetDate, hardDeadline].every(validDateKey)) { setError("Enter valid calendar dates."); return; }
      if (plannedStart && targetDate && plannedStart > targetDate) { setError("Start date must be on or before the target date."); return; }
      if (targetDate && hardDeadline && targetDate > hardDeadline) { setError("Hard deadline must be on or after the target date."); return; }
      create.mutate();
    }}>
      <Field label="Project name" hint="Write the result you want to make true." error={error && !title.trim() ? error : undefined}>
        <Input ref={titleRef} value={title} onChange={(event) => { setTitle(event.target.value); setError(undefined); setDiscardPrompt(false); }} placeholder="Publish the portfolio refresh" maxLength={500} invalid={Boolean(error && !title.trim())} />
      </Field>
      <Field label="Outcome" hint="Keep this about success; the individual steps belong in Tasks." error={error && title.trim() && !purpose.trim() ? error : undefined}>
        <Textarea value={purpose} onChange={(event) => { setPurpose(event.target.value); setError(undefined); setDiscardPrompt(false); }} placeholder="What will be different when this Project is complete?" rows={5} maxLength={50_000} invalid={Boolean(error && !purpose.trim())} />
      </Field>
      <Field label="Success definition" hint="Optional. Describe the evidence that will tell you this Project is complete."><Textarea value={successDefinition} onChange={(event) => { setSuccessDefinition(event.target.value); setDiscardPrompt(false); }} placeholder="What will count as done?" rows={3} maxLength={50_000} /></Field>
      <Field label="Area" hint="Optional lightweight context, such as Career, Home, or Learning."><Input value={area} onChange={(event) => { setArea(event.target.value); setDiscardPrompt(false); }} placeholder="Career" maxLength={120} /></Field>
      <div className="work-goal-form__row">
        <div className="work-goal-form__planning"><fieldset className="work-goal-form__field-group"><legend>Project shape</legend><RadioGroup label="Project shape" value={shape} onValueChange={(value) => { setShape(value as GoalShape); setDiscardPrompt(false); }} options={[{ value: "finish", title: "Finish", hint: "Reach a clear completed outcome." }, { value: "target", title: "Target", hint: "Move toward a dated or measurable target." }, { value: "ongoing", title: "Ongoing", hint: "Maintain progress without a finish line." }]} /></fieldset><fieldset className="work-goal-form__field-group"><legend>Starting state</legend><RadioGroup label="Starting state" value={state} onValueChange={(value) => { setState(value as "planned" | "active"); setDiscardPrompt(false); }} options={[{ value: "planned", title: "Planned", hint: "Keep it ready without making it current." }, { value: "active", title: "In progress", hint: "This is something you are working on now." }]} /></fieldset></div>
        <div className="work-goal-form__planning">
          <Field label="Priority"><KoraSelect label="Goal priority" value={String(priority)} onValueChange={(value) => { setPriority(Number(value)); setDiscardPrompt(false); }} options={[{ value: "4", label: "Highest" }, { value: "3", label: "High" }, { value: "2", label: "Normal" }, { value: "1", label: "Low" }, { value: "0", label: "Someday" }]} /></Field>
          <Field label="Start date" hint="Optional"><Input type="date" value={plannedStart} onChange={(event) => { setPlannedStart(event.target.value); setError(undefined); setDiscardPrompt(false); }} /></Field>
          <Field label="Target date" hint="Optional"><Input type="date" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); setError(undefined); setDiscardPrompt(false); }} /></Field>
          <Field label="Hard deadline" hint="Optional"><Input type="date" value={hardDeadline} onChange={(event) => { setHardDeadline(event.target.value); setError(undefined); setDiscardPrompt(false); }} /></Field>
        </div>
      </div>
      <Field label="Current position" hint="Optional. Capture where this Project stands today; this is separate from task completion."><Textarea value={currentPosition} onChange={(event) => { setCurrentPosition(event.target.value); setDiscardPrompt(false); }} placeholder="What is true right now?" rows={3} maxLength={50_000} /></Field>
      {error && title.trim() && purpose.trim() ? <p className="work-goal-form__error" role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</p> : null}
      {discardPrompt ? <div className="work-goal-form__discard" role="alert"><span><strong>Discard this draft?</strong><small>Nothing has been saved yet.</small></span><Button type="button" tone="ghost" onClick={() => setDiscardPrompt(false)}>Keep editing</Button><Button type="button" tone="danger" onClick={close}>Discard</Button></div> : null}
      <div className="work-goal-form__actions">
        <Button type="button" tone="ghost" onClick={() => {
          const draft = dirty
            ? `Help me shape this Project and identify the first useful Tasks. Current draft:\n\nProject: ${title.trim() || "Not named yet"}\nOutcome: ${purpose.trim() || "Not described yet"}${area.trim() ? `\nArea: ${area.trim()}` : ""}${targetDate ? `\nTarget date: ${targetDate}` : ""}`
            : "Help me shape a new Project and identify the first useful Tasks.";
          reset(); onOpenChange(false); onPlanWithKora(draft);
        }}><Sparkles size={15} aria-hidden="true" />View conversation example</Button>
        <span />
        <Button type="button" tone="secondary" onClick={close}>Cancel</Button>
        <Button type="submit" tone="primary" loading={create.isPending}><Plus size={15} aria-hidden="true" />Create Project</Button>
      </div>
    </form>
  </Modal>;
}

export function ProjectsWorkspace({ onAskKora, services = runtime, requestKey = "live" }: { onAskKora: (reference?: ConversationContextReference, draft?: string) => void; services?: WorkGoalsServices; requestKey?: string }) {
  useViewBar(() => ({ title: "Work", titleRole: "label" }), []);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filterParam = params.get("filter") as GoalListFilter | null;
  const viewParam = params.get("view") as GoalView | null;
  const filter = filterParam && FILTER_VALUES.has(filterParam) ? filterParam : "open";
  const view = viewParam && VIEW_VALUES.has(viewParam) ? viewParam : "list";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    updateParams({ q: deferredQuery || undefined });
    // Deferred search is the sole owner of this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery]);
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setCreating(true);
    updateParams({ new: undefined });
    // Overview uses this one-shot flag to open the existing creation flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const focusLocalSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusLocalSearch, true);
    return () => window.removeEventListener("keydown", focusLocalSearch, true);
  }, []);
  const goals = useInfiniteQuery({
    queryKey: ["work", "projects", requestKey, filter, deferredQuery], initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!services.goalsPage) {
        const legacy = await services.projectsPage!({ filter: filter === "paused" ? "blocked" : filter === "idea" ? "planned" : filter, includeArchived: false, query: deferredQuery || undefined, limit: 50, cursor: pageParam });
        return { ...legacy, items: legacy.items.map((entry) => ({ ...entry, goal: goalFromLegacyProject(entry.project) })) };
      }
      const page = await services.goalsPage({ filter, includeArchived: false, query: deferredQuery || undefined, limit: 50, cursor: pageParam });
      return page;
    },
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const boardTerminal = useInfiniteQuery({
    queryKey: ["work", "projects", "board-terminal", requestKey, deferredQuery],
    initialPageParam: undefined as string | undefined,
    enabled: view === "board" && filter === "open",
    queryFn: async ({ pageParam }) => {
      if (!services.goalsPage) {
        const legacy = await services.projectsPage!({ filter: "terminal", includeArchived: true, query: deferredQuery || undefined, limit: 50, cursor: pageParam });
        return { ...legacy, items: legacy.items.map((entry) => ({ ...entry, goal: goalFromLegacyProject(entry.project) })) };
      }
      return services.goalsPage({ filter: "terminal", includeArchived: true, query: deferredQuery || undefined, limit: 50, cursor: pageParam });
    },
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
  });
  const rawEntries = useMemo(() => goals.data?.pages.flatMap((page) => page.items) ?? [], [goals.data]);
  const fallbackGoalIds = useMemo(() => rawEntries
    .filter((entry) => entry.visibleOpenWorkItemCount > 0 && (!entry.nextOpenWorkItem || entry.nextOpenWorkItem.kind === "milestone"))
    .map((entry) => entry.goal.id), [rawEntries]);
  const nextActionFallback = useQuery({
    queryKey: ["work", "goal-next-action-fallback", requestKey, fallbackGoalIds],
    // Canonical Goal pages own the next-action projection. The bounded
    // workspace fallback only exists for the deprecated Project adapter.
    enabled: !services.goalsPage && fallbackGoalIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => Promise.all(fallbackGoalIds.map(async (projectId) => {
      const workspace = services.goalWorkspace
        ? await services.goalWorkspace(projectId)
        : await services.projectWorkspace!(projectId);
      return [projectId, selectGoalNextMove(flattenCurrentWork(workspace.work.nodes))] as const;
    })),
  });
  const entries = useMemo(() => {
    if (!nextActionFallback.data?.length) return rawEntries;
    const byGoal = new Map(nextActionFallback.data);
    return rawEntries.map((entry) => entry.nextOpenWorkItem && entry.nextOpenWorkItem.kind !== "milestone" ? entry : { ...entry, nextOpenWorkItem: byGoal.get(entry.goal.id) });
  }, [nextActionFallback.data, rawEntries]);
  const terminalEntries = useMemo(() => boardTerminal.data?.pages.flatMap((page) => page.items) ?? [], [boardTerminal.data]);
  const boardEntries = useMemo(() => {
    if (view !== "board" || filter !== "open") return entries;
    const seen = new Set(entries.map((entry) => entry.goal.id));
    return [...entries, ...terminalEntries.filter((entry) => !seen.has(entry.goal.id))];
  }, [boardTerminal.data, entries, filter, terminalEntries, view]);
  const complete = goals.data?.pages.at(-1)?.complete ?? false;
  const goalActivityUnavailable = goals.data?.pages.some((page) =>
    page.coverage?.state === "partial"
    && page.coverage.omittedOrdinaryCollections.includes("goal_activity")) ?? false;
  const hasFilters = Boolean(deferredQuery || filter !== "open");
  const returnTo = `${location.pathname}${location.search}`;
  const clearFilters = () => { setQuery(""); setParams(new URLSearchParams(view === "list" ? {} : { view }), { replace: true }); };
  const primaryAction = <Button tone="primary" onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />New project</Button>;
  const headerActions = primaryAction;
  const offline = goals.error instanceof RuntimeRequestError && goals.error.code === "runtime_disconnected";
  const content = goals.isPending
    ? <div className="work-goals-skeleton" role="status" aria-live="polite" aria-busy="true"><span className="sr-only">Loading Projects</span><span /><span /><span /></div>
    : goals.isError && !entries.length
      ? <StateView state="error" title={offline ? "Projects are offline" : "Projects are unavailable"} body={goals.error instanceof Error ? goals.error.message : "Kora could not read Projects."} action={<Button onClick={() => void goals.refetch()}>Try again</Button>} />
      : entries.length === 0
        ? <StateView state="empty" title={hasFilters ? "Nothing matches this view" : "No projects yet"} body={hasFilters ? "Your other Projects remain available. Clear the current search and filter to see them." : "A Project gives any outcome—from a hobby to a job search—a clear home without turning life into project-management software."} action={hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : primaryAction} />
        : view === "cards" ? <GoalPortfolio entries={entries} returnTo={returnTo} />
          : view === "list" ? <GoalList entries={entries} returnTo={returnTo} /> : <><GoalBoard entries={boardEntries} onCreate={() => setCreating(true)} services={services} returnTo={returnTo} readOnly={goals.isError || boardTerminal.isError} />{boardTerminal.hasNextPage ? <div className="work-goals-load"><Button onClick={() => void boardTerminal.fetchNextPage()} loading={boardTerminal.isFetchingNextPage}>Load more finished Projects</Button></div> : null}</>;
  return <section className="work-goals-workspace">
    <PageFrame width={view === "board" ? "wide" : "standard"} sidebar={<WorkNavigation />} sidebarLabel="Work">
      <PageHeader title="Projects" description="Everything you are working toward, from the next small win to the things that take time." status={<span>{complete ? `${entries.length} ${entries.length === 1 ? "project" : "projects"}` : `${entries.length} loaded`}{goalActivityUnavailable ? " · partial coverage" : ""}</span>} actions={headerActions} />
      <PageToolbar sticky search={<SearchField inputRef={searchRef} value={query} onValueChange={setQuery} label="Search Projects" placeholder="Search Projects" />} controls={<div className="work-goals-controls"><KoraSelect label="Project state" value={filter} onValueChange={(next) => updateParams({ filter: next === "open" ? undefined : next })} options={FILTER_OPTIONS} /><SegmentedControl label="Project view" layoutId="work-goal-view" value={view} onValueChange={(next) => updateParams({ view: next === "list" ? undefined : next })} options={VIEW_OPTIONS} /></div>} compactControls={<Button aria-label={`Current view: ${view === "cards" ? "Cards" : view === "list" ? "List" : "Board"}. Open Project view and filters`} onClick={() => setFiltersOpen(true)}>{view === "cards" ? <LayoutGrid size={15} aria-hidden="true" /> : view === "list" ? <List size={15} aria-hidden="true" /> : <Columns3 size={15} aria-hidden="true" />}<span>{view === "cards" ? "Cards" : view === "list" ? "List" : "Board"} view</span><ListFilter size={15} aria-hidden="true" />Filters{filter !== "open" ? " · 1" : ""}</Button>} />
      {goalActivityUnavailable ? <p className="work-goals-notice" role="status"><strong>Project activity is unavailable.</strong> Available Projects remain usable; recent activity may be incomplete.</p> : null}
      {goals.isError && entries.length ? <div className="work-goals-notice" role="alert"><span>Projects could not refresh. Loaded local Projects were last read {readTime(goals.dataUpdatedAt)}. They remain readable, but refresh before moving a Project because later local changes may be missing.</span><Button tone="ghost" onClick={() => void goals.refetch()}>Retry Project refresh</Button></div> : null}
      {content}
      {goals.hasNextPage ? <div className="work-goals-load"><Button onClick={() => void goals.fetchNextPage()} loading={goals.isFetchingNextPage}>Load more Projects</Button></div> : null}
    </PageFrame>
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Project view and filters" description="Change how Projects are shown without changing the underlying Work." purpose="navigation" side="right"><div className="work-goals-sheet"><KoraSelect label="Project state" value={filter} onValueChange={(next) => updateParams({ filter: next === "open" ? undefined : next })} options={FILTER_OPTIONS} /><SegmentedControl label="Project view" layoutId="work-goal-view-sheet" value={view} onValueChange={(next) => updateParams({ view: next === "list" ? undefined : next })} options={VIEW_OPTIONS} /><Button tone="ghost" onClick={clearFilters}>Clear filters</Button></div></Sheet>
    <NewGoal open={creating} onOpenChange={setCreating} onPlanWithKora={(draft) => onAskKora(undefined, draft)} services={services} />
  </section>;
}
