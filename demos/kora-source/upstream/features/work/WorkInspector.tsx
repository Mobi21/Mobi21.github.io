import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  CircleAlert,
  CircleStop,
  Clock3,
  History,
  Link2,
  MessageCircleMore,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  IconButton,
  Input,
  KoraPresenceMark,
  KoraSelect,
  Modal,
  Sheet,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type Goal,
  type GoalChanges,
  type WorkItem,
  type WorkItemChanges,
  type WorkMutationOutcome,
} from "../../lib/runtime";
import "./work-detail.css";

export type SelectedWork =
  | { type: "goal"; record: Goal }
  | { type: "work_item"; record: WorkItem; assignee?: { id: string; displayName: string } };

type FormState = {
  title: string;
  area: string;
  body: string;
  successDefinition: string;
  shape: Goal["shape"];
  currentPosition: string;
  state: "idea" | "planned" | "active" | "paused" | "blocked";
  priority: number;
  blocker: string;
  firstDate: string;
  secondDate: string;
  hardDeadline: string;
  kind: WorkItem["kind"];
  commitmentDirection: NonNullable<WorkItem["commitmentDirection"]>;
  goalId: string;
  parentWorkItemId: string;
  personId: string;
};
type Transition =
  | { kind: "complete"; title: string; label: string; placeholder: string }
  | { kind: "cancel"; title: string; label: string; placeholder: string }
  | { kind: "reactivate"; title: string; label: string; placeholder: string }
  | { kind: "archive"; title: string; label: string; placeholder: string };

// datetime-local expects the viewer's wall time, not a sliced UTC timestamp.
const dateInputValue = (instant?: string) => {
  if (!instant) return "";
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formFrom = (selected: SelectedWork): FormState => {
  const record = selected.record;
  const goal = selected.type === "goal" ? selected.record : undefined;
  const item = selected.type === "work_item" ? selected.record : undefined;
  return {
    title: record.title,
    area: record.area ?? "",
    body: goal ? goal.purposeMarkdown : (item?.descriptionMarkdown ?? ""),
    successDefinition: goal?.successDefinitionMarkdown ?? "",
    shape: goal?.shape ?? "finish",
    currentPosition: goal?.currentPositionMarkdown ?? "",
    state: selected.type === "goal"
      ? (["idea", "planned", "active", "paused"].includes(goal!.lifecycle)
        ? goal!.lifecycle as FormState["state"] : "planned")
      : (["planned", "active", "blocked"].includes(item!.state)
        ? item!.state as FormState["state"] : "planned"),
    priority: record.priority,
    blocker: selected.type === "goal" ? goal!.pauseReason ?? "" : item!.blocker ?? "",
    firstDate: goal
      ? (goal.plannedStart ?? "")
      : dateInputValue(item?.dueAt),
    secondDate: goal
      ? (goal.targetDate ?? "")
      : dateInputValue(item?.attentionAt),
    hardDeadline: goal?.hardDeadline ?? "",
    kind: item?.kind ?? "outcome",
    commitmentDirection: item?.commitmentDirection ?? "owed_by_user",
    goalId: item?.goalId ?? "",
    parentWorkItemId: item?.parentWorkItemId ?? "",
    personId: item?.personId ?? "",
  };
};
const workStateLabel = (state: string) => {
  if (state === "active") return "In progress";
  if (state === "planned") return "Planned";
  if (state === "blocked") return "Blocked";
  if (state === "paused") return "Paused";
  if (state === "idea") return "Idea";
  if (state === "completed") return "Completed";
  if (state === "cancelled") return "Cancelled";
  if (state === "achieved") return "Completed";
  if (state === "stopped") return "Cancelled";
  return state.replace(/^./, (character) => character.toUpperCase());
};
const priorityLabel = (priority: number) =>
  ["Someday", "Low", "Normal", "High", "Highest"][priority] ?? `Priority ${priority}`;
const goalShapeLabel = (shape: Goal["shape"]) =>
  shape === "finish" ? "Finish" : shape === "target" ? "Target" : "Ongoing";
const isoInstant = (value: string, original?: string) =>
  // Preserve seconds and an ambiguous DST instant when the field was not edited.
  value === dateInputValue(original) ? original ?? null : value ? new Date(value).toISOString() : null;
const formatWhen = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const transitionCopy: Record<Transition["kind"], Transition> = {
  complete: {
    kind: "complete",
    title: "Complete this work",
    label: "Actual result",
    placeholder: "What was achieved?",
  },
  cancel: {
    kind: "cancel",
    title: "Cancel this work",
    label: "Reason",
    placeholder: "Why is this no longer being pursued?",
  },
  reactivate: {
    kind: "reactivate",
    title: "Reactivate this work",
    label: "Reason",
    placeholder: "Why is this returning to active work?",
  },
  archive: {
    kind: "archive",
    title: "Archive this work",
    label: "Archive",
    placeholder: "",
  },
};

function RelationName({ kind, value, displayName }: { kind: "goal" | "work_item" | "person"; value: string; displayName?: string }) {
  const label = kind === "goal" ? "Project" : kind === "person" ? "Person" : "Parent task";
  const name = useQuery({
    queryKey: ["work", "relation-name", kind, value],
    queryFn: async () => kind === "goal" ? (await runtime.goal(value)).goal.title
      : (await runtime.workItem(value)).item.title,
    enabled: kind !== "person",
    staleTime: 30_000,
  });
  const resolvedName = kind === "person" ? displayName : name.data;
  return <span className="work-relation__name">
    <span>{resolvedName ?? (kind === "person" ? "Assignee unavailable" : name.isError ? `${label} unavailable` : `Loading ${label.toLowerCase()}…`)}</span>
    {kind !== "person" && name.isError && <Button size="sm" tone="ghost" onClick={() => void name.refetch()} aria-label={`Retry loading ${label.toLowerCase()}`}>Retry</Button>}
  </span>;
}

function RelationLookup({
  kind,
  value,
  goalId,
  onChange,
  onLabelChange,
  personDisplayName,
}: {
  kind: "goal" | "work_item" | "person";
  value: string;
  goalId?: string;
  onChange: (value: string) => void;
  onLabelChange?: (projection?: { id: string; displayName: string }) => void;
  personDisplayName?: string;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const records = useQuery({
    queryKey: ["work", "relation", kind, deferred],
    queryFn: () =>
      runtime.searchWork(
        deferred,
        kind === "goal" ? "project_parent" : "work",
        kind === "goal" ? ["project"] : ["work_item"],
        20,
      ),
    enabled: kind !== "person" && deferred.length > 1,
  });
  const people = useQuery({
    queryKey: ["work", "relation", "person", deferred],
    queryFn: () => runtime.searchWorkPeople(deferred, 12),
    enabled: kind === "person" && deferred.length > 1,
  });
  const matches = records.data?.results.filter(entry =>
    kind !== "work_item" || !goalId || (entry.record as WorkItem).goalId === goalId) ?? [];
  const search = kind === "person" ? people : records;
  const matchCount = kind === "person" ? people.data?.results.length ?? 0 : matches.length;
  return (
    <div className="work-relation">
      <label>
        {kind === "person" ? <UserRound size={15} /> : <Link2 size={15} />}
        <span>
          {kind === "goal"
            ? "Project"
            : kind === "work_item"
              ? "Parent Work item"
              : "Assigned to"}
        </span>
      </label>
      {value && (
        <div className="work-relation__value">
           <RelationName kind={kind} value={value} displayName={personDisplayName} />
          <IconButton
            label={`Clear ${kind} relationship`}
             onClick={() => {
               onChange("");
               onLabelChange?.(undefined);
             }}
          >
            <X size={13} />
          </IconButton>
        </div>
      )}
      <Input
        aria-label={`Find a ${kind === "work_item" ? "parent Work item" : kind === "person" ? "assignee" : kind === "goal" ? "project" : kind}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Find a ${kind === "work_item" ? "parent Work item" : kind === "person" ? "assignee" : kind === "goal" ? "project" : kind}`}
      />
      {deferred.length > 1 && (
        <div className="work-relation__results">
          {search.isFetching && <p role="status">Searching…</p>}
          {search.isError && <p role="status">Search is unavailable. <Button size="sm" tone="ghost" onClick={() => void search.refetch()}>Retry search</Button></p>}
          {!search.isFetching && !search.isError && search.isSuccess && matchCount === 0
            && <p role="status">No matching {kind === "person" ? "people" : kind === "goal" ? "projects" : "tasks"}.</p>}
          {kind !== "person"
            ? matches.map((entry) => (
                  <Button
                    tone="ghost"
                    type="button"
                    key={entry.record.id}
                    onClick={() => {
                      onChange(entry.record.id);
                      setQuery("");
                    }}
                  >
                    <span>{entry.record.title}</span>
                    <Plus size={14} />
                  </Button>
                ))
            : people.data?.results.map((person) => (
                <Button
                  tone="ghost"
                  type="button"
                  key={person.id}
                  onClick={() => {
                    onChange(person.id);
                    onLabelChange?.({ id: person.id, displayName: person.displayName });
                    setQuery("");
                  }}
                >
                  <span>
                    {person.displayName}
                    <small>{person.relationship}</small>
                  </span>
                  <Plus size={14} />
                </Button>
              ))}
        </div>
      )}
    </div>
  );
}

export function WorkInspector({
  selected,
  activeVersion,
  inFocus,
  onClose,
  onChanged,
  onFocusChange,
  focusBusy,
  onAskKora,
  initialEditing = false,
  onDelete,
}: {
  selected: SelectedWork;
  activeVersion?: number;
  inFocus: boolean;
  onClose: () => void;
  onChanged: (next: SelectedWork, message?: string) => void;
  onFocusChange: (action: "add" | "remove") => void;
  focusBusy: boolean;
  onAskKora: () => void;
  initialEditing?: boolean;
  onDelete?: () => void;
}) {
  const queryClient = useQueryClient();
  const editRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const originRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dismissOriginRef = useRef<HTMLElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [form, setForm] = useState(() => formFrom(selected));
  const [assigneeProjection, setAssigneeProjection] = useState(
    () => selected.type === "work_item" ? selected.assignee : undefined,
  );
  const [discardIntent, setDiscardIntent] = useState<"editor" | "inspector">();
  const [transition, setTransition] = useState<Transition>();
  const [transitionText, setTransitionText] = useState("");
  const [reactivationDestination, setReactivationDestination] = useState<
    "planned" | "active"
  >("active");
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(formFrom(selected)),
    [form, selected],
  );
  useEffect(() => {
    setForm(formFrom(selected));
    setAssigneeProjection(selected.type === "work_item" ? selected.assignee : undefined);
    setDiscardIntent(undefined);
    setError(undefined);
    setConflict(false);
  }, [selected.record.id, selected.record.version]);
  useEffect(() => {
    setEditing(initialEditing);
  }, [initialEditing, selected.record.id]);
  const keepEditing = () => setDiscardIntent(undefined);
  const requestDismiss = (intent: "editor" | "inspector") => {
    if (editing && dirty) {
      dismissOriginRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : titleRef.current;
      setDiscardIntent(intent);
      return;
    }
    if (intent === "inspector") onClose();
    else {
      setForm(formFrom(selected));
      setEditing(false);
      editRef.current?.focus();
    }
  };
  const discardChanges = () => {
    const intent = discardIntent;
    // Cancel belongs to the editor and disappears on discard. Return the
    // confirmation to the surviving Edit control, or the inspector's opener.
    dismissOriginRef.current = intent === "inspector" ? originRef.current : editRef.current;
    setForm(formFrom(selected));
    setEditing(false);
    setDiscardIntent(undefined);
    if (intent === "inspector") onClose();
  };

  const activity = useQuery({
    queryKey: ["work-activity", selected.type, selected.record.id],
    queryFn: () => runtime.workActivity(selected.type === "goal" ? "project" : "work_item", selected.record.id),
  });
  const settle = async (
    execute: () => Promise<
      WorkMutationOutcome<Goal> | WorkMutationOutcome<WorkItem>
    >,
    message: string,
  ) => {
    setError(undefined);
    setConflict(false);
    try {
      const result = await execute();
      if (result.status !== "settled")
        throw new Error("Native Work did not settle.");
      const next = selected.type === "work_item"
        ? {
            type: selected.type,
            record: result.record as WorkItem,
            assignee: form.personId
              ? assigneeProjection?.id === form.personId
                ? assigneeProjection
                : selected.assignee?.id === form.personId
                  ? selected.assignee
                  : undefined
              : undefined,
          }
        : { type: selected.type, record: result.record as Goal };
      onChanged(next, message);
      await queryClient.invalidateQueries({ queryKey: ["work"] });
      await queryClient.invalidateQueries({
        queryKey: ["work-activity", selected.type, selected.record.id],
      });
      return next;
    } catch (cause) {
      const requestError = cause as RuntimeRequestError;
      if (requestError.code === "work_conflict") {
        setConflict(true);
        setError(
          "This Work changed elsewhere. Review the refreshed version before saving again.",
        );
        if (selected.type === "goal") {
          onChanged({ type: "goal", record: (await runtime.goal(selected.record.id)).goal });
        } else {
          const refreshed = await runtime.workItemWorkspace(selected.record.id);
          onChanged({ type: "work_item", record: refreshed.item, assignee: refreshed.assignee });
        }
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "The Work change did not settle.",
        );
      throw cause;
    }
  };
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selected.type === "goal") {
        const changes: GoalChanges = {
          title: form.title.trim(),
          area: form.area.trim() || null,
          purposeMarkdown: form.body,
          successDefinitionMarkdown: form.successDefinition.trim() || null,
          shape: form.shape,
          lifecycle: form.state === "blocked" ? "paused" : form.state,
          priority: form.priority,
          plannedStart: form.firstDate || null,
          targetDate: form.secondDate || null,
          hardDeadline: form.hardDeadline || null,
          currentPositionMarkdown: form.currentPosition.trim() || null,
          pauseReason: form.state === "paused" ? form.blocker || null : null,
          provenance: "gui_direct",
        };
        return settle(
          () =>
            runtime.updateGoal(
              selected.record.id,
              selected.record.version,
              changes,
            ),
          "Work updated.",
        );
      }
      const changes: WorkItemChanges = {
        title: form.title.trim(),
        area: form.area.trim() || null,
        descriptionMarkdown: form.body,
        state: form.state === "idea" || form.state === "paused" ? "planned" : form.state,
        priority: form.priority,
        kind: form.kind,
        commitmentDirection:
          form.kind === "commitment" ? form.commitmentDirection : null,
        dueAt: isoInstant(form.firstDate, selected.record.dueAt),
        attentionAt: isoInstant(form.secondDate, selected.record.attentionAt),
        goalId: form.goalId || null,
        parentWorkItemId: form.parentWorkItemId || null,
        personId: form.personId || null,
        blocker: form.blocker || null,
        provenance: "gui_direct",
      };
      return settle(
        () =>
          runtime.updateWorkItem(
            selected.record.id,
            selected.record.version,
            changes,
          ),
        "Work updated.",
      );
    },
    onSuccess: () => setEditing(false),
  });
  const transitionMutation = useMutation({
    mutationFn: async () => {
      const record = selected.record;
      if (!transition) throw new Error("Choose a transition.");
      if (transition.kind === "complete")
        return settle(
          () =>
            selected.type === "goal"
              ? runtime.achieveGoal(
                  record.id,
                  record.version,
                  transitionText,
                )
              : runtime.completeWorkItem(
                  record.id,
                  record.version,
                  transitionText,
                ),
          "Work completed.",
        );
      if (transition.kind === "cancel")
        return settle(
          () =>
            selected.type === "goal"
              ? runtime.stopGoal(record.id, record.version, transitionText)
              : runtime.cancelWorkItem(
                  record.id,
                  record.version,
                  transitionText,
                ),
          "Work cancelled.",
        );
      if (transition.kind === "reactivate")
        return settle(
          () =>
            selected.type === "goal"
              ? runtime.resumeGoal(
                  record.id,
                  record.version,
                  reactivationDestination,
                  transitionText,
                )
              : runtime.reactivateWorkItem(
                  record.id,
                  record.version,
                  reactivationDestination,
                  transitionText,
                ),
          "Work reactivated.",
        );
      return settle(
        () =>
          selected.type === "goal"
            ? runtime.archiveGoal(record.id, record.version)
            : runtime.archiveWorkItem(record.id, record.version),
        "Work archived.",
      );
    },
    onSuccess: () => {
      setTransition(undefined);
      setTransitionText("");
    },
  });
  const record = selected.record;
  const goal = selected.type === "goal" ? selected.record : undefined;
  const item = selected.type === "work_item" ? selected.record : undefined;
  const completionResultRequired =
    selected.type === "goal" || item?.kind !== "task";
  const transitionTextRequired = Boolean(
    transition &&
    transition.kind !== "archive" &&
    (transition.kind !== "complete" || completionResultRequired),
  );
  const recordStatus = selected.type === "goal" ? selected.record.lifecycle : selected.record.state;
  const terminal = selected.type === "goal"
    ? ["achieved", "stopped", "archived"].includes(selected.record.lifecycle)
    : ["completed", "cancelled", "archived"].includes(selected.record.state);
  return (
    <Sheet
      open
      onOpenChange={(open) => { if (!open) requestDismiss("inspector"); }}
      dismissPolicy="explicit"
      onDismissAttempt={() => requestDismiss("inspector")}
      purpose="inspector"
      className="work-inspector"
      title={<>{record.title}{" "}<span className="sr-only">details</span></>}
      description={`${goal ? "Project" : item?.kind} · ${workStateLabel(recordStatus)}`}
      closeLabel="Close Work details"
      initialFocus={initialEditing ? titleRef : undefined}
      finalFocus={originRef}
      actions={editing ? <>
        <Button type="button" onClick={() => requestDismiss("editor")}>
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          tone="primary"
          disabled={!dirty || !form.title.trim() || saveMutation.isPending}
        >
          {saveMutation.isPending ? <KoraPresenceMark state="gathering" /> : <Save size={15} />}
          Save changes
        </Button>
      </> : undefined}
    >
      <div className="work-inspector__actions">
        <Button onClick={onAskKora}>
          <MessageCircleMore size={15} />
          Ask Kora
        </Button>
        {!terminal && (
          <Button
            ref={editRef}
            onClick={() =>
              editing ? requestDismiss("editor") : setEditing(true)
            }
          >
            <Pencil size={14} />
            {editing ? "Close editor" : "Edit"}
          </Button>
        )}
        <Button
          onClick={() => onFocusChange(inFocus ? "remove" : "add")}
          disabled={focusBusy || activeVersion === undefined}
        >
          {inFocus ? <X size={14} /> : <Plus size={14} />}
          {inFocus ? "Unfocus" : "Add focus"}
        </Button>
        {onDelete && (
          <Button tone="ghost" onClick={onDelete}>
            <Trash2 size={14} />
            Delete
          </Button>
        )}
      </div>
      <div className="work-inspector__body">
        {error && (
          <p
            className={`work-inspector__error${conflict ? " work-inspector__error--conflict" : ""}`}
            role="alert"
          >
            <CircleAlert size={15} />
            {error}
          </p>
        )}
        {editing ? (
          <form
            id={formId}
            className="work-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
          >
            <label className="work-field work-field--title">
              <span>Title</span>
              <Input
                ref={titleRef}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
            </label>
            <label className="work-field">
              <span>Area</span>
              <Input
                value={form.area}
                onChange={(event) =>
                  setForm({ ...form, area: event.target.value })
                }
                maxLength={120}
                placeholder="Career, Home, Learning…"
              />
            </label>
            <label className="work-field">
              <span>{selected.type === "goal" ? "Purpose" : "Details"}</span>
              <Textarea
                rows={5}
                value={form.body}
                onChange={(event) =>
                  setForm({ ...form, body: event.target.value })
                }
                />
            </label>
            {selected.type === "goal" && (
              <>
                <label className="work-field">
                  <span>Definition of success</span>
                  <Textarea
                    rows={4}
                    value={form.successDefinition}
                    onChange={(event) =>
                      setForm({ ...form, successDefinition: event.target.value })
                    }
                    placeholder="What will be true when this Project is complete?"
                  />
                </label>
                <label className="work-field">
                  <span>Current position</span>
                  <Textarea
                    rows={3}
                    value={form.currentPosition}
                    onChange={(event) =>
                      setForm({ ...form, currentPosition: event.target.value })
                    }
                    placeholder="Where this Project stands today"
                  />
                </label>
              </>
            )}
            <div className="work-field-row">
              <label className="work-field">
                <span>Status</span>
                <KoraSelect
                  label="Status"
                  value={form.state}
                  onValueChange={(value) =>
                    setForm({ ...form, state: value as FormState["state"] })
                  }
                  options={selected.type === "goal" ? [
                  { value: "idea", label: "Idea" },
                  { value: "planned", label: "Planned" },
                  { value: "active", label: "In progress" },
                  { value: "paused", label: "Paused" },
                ] : [
                  { value: "planned", label: "Planned" },
                  { value: "active", label: "In progress" },
                  { value: "blocked", label: "Blocked" },
                ]}
                />
              </label>
              <label className="work-field">
                <span>Priority</span>
                <KoraSelect
                  label="Priority"
                  value={String(form.priority)}
                  onValueChange={(value) =>
                    setForm({ ...form, priority: Number(value) })
                  }
                  options={[
                    { value: "0", label: "Someday" },
                    { value: "1", label: "Low" },
                    { value: "2", label: "Normal" },
                    { value: "3", label: "High" },
                    { value: "4", label: "Highest" },
                  ]}
                />
              </label>
            </div>
            {selected.type === "goal" && (
              <label className="work-field">
                <span>Shape</span>
                <KoraSelect
                  label="Shape"
                  value={form.shape}
                  onValueChange={(value) =>
                    setForm({ ...form, shape: value as Goal["shape"] })
                  }
                  options={[
                    { value: "finish", label: "Finish" },
                    { value: "target", label: "Target" },
                    { value: "ongoing", label: "Ongoing" },
                  ]}
                />
              </label>
            )}
            {selected.type === "work_item" && (
              <label className="work-field">
                <span>Kind</span>
                <KoraSelect
                  label="Kind"
                  value={form.kind}
                  onValueChange={(value) =>
                    setForm({ ...form, kind: value as WorkItem["kind"] })
                  }
                  options={[
                    { value: "outcome", label: "Outcome" },
                    { value: "task", label: "Task" },
                    { value: "milestone", label: "Milestone" },
                    { value: "commitment", label: "Commitment" },
                  ]}
                />
              </label>
            )}
            {selected.type === "work_item" && form.kind === "commitment" && (
              <label className="work-field">
                <span>Promise direction</span>
                <KoraSelect
                  label="Promise direction"
                  value={form.commitmentDirection}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      commitmentDirection:
                        value as FormState["commitmentDirection"],
                    })
                  }
                  options={[
                    { value: "owed_by_user", label: "I owe this" },
                    { value: "owed_to_user", label: "Owed to me" },
                  ]}
                />
              </label>
            )}
            {(form.state === "blocked" || form.state === "paused") && (
              <label className="work-field">
                <span>{selected.type === "goal" ? "Why is it paused?" : "What is blocking it?"}</span>
                <Textarea
                  rows={3}
                  value={form.blocker}
                  onChange={(event) =>
                    setForm({ ...form, blocker: event.target.value })
                  }
                />
              </label>
            )}
            <div className="work-field-row work-field-row--dates">
              <label className="work-field">
                <span>{selected.type === "goal" ? "Starts" : "Due"}</span>
                <Input
                  type={selected.type === "goal" ? "date" : "datetime-local"}
                  value={form.firstDate}
                  onChange={(event) =>
                    setForm({ ...form, firstDate: event.target.value })
                  }
                />
              </label>
              <label className="work-field">
                <span>
                  {selected.type === "goal" ? "Target" : "Needs attention"}
                </span>
                <Input
                  type={selected.type === "goal" ? "date" : "datetime-local"}
                  value={form.secondDate}
                  onChange={(event) =>
                    setForm({ ...form, secondDate: event.target.value })
                  }
                />
              </label>
              {selected.type === "goal" && (
                <label className="work-field">
                  <span>Hard deadline</span>
                  <Input
                    type="date"
                    value={form.hardDeadline}
                    onChange={(event) =>
                      setForm({ ...form, hardDeadline: event.target.value })
                    }
                  />
                </label>
              )}
            </div>
            {selected.type === "work_item" && (
              <>
                <RelationLookup
                  kind="goal"
                  value={form.goalId}
                  onChange={(goalId) => setForm({ ...form, goalId })}
                />
                <RelationLookup
                  kind="work_item"
                  value={form.parentWorkItemId}
                  goalId={form.goalId}
                  onChange={(parentWorkItemId) =>
                    setForm({ ...form, parentWorkItemId })
                  }
                />
                <RelationLookup
                  kind="person"
                  value={form.personId}
                  personDisplayName={assigneeProjection?.id === form.personId ? assigneeProjection.displayName : undefined}
                  onChange={(personId) => setForm({ ...form, personId })}
                  onLabelChange={setAssigneeProjection}
                />
              </>
            )}
          </form>
        ) : (
          <div className="work-read">
            <p className="work-read__body">
              {goal
                ? goal.purposeMarkdown
                : item?.descriptionMarkdown || "No additional details yet."}
            </p>
            {goal?.successDefinitionMarkdown && (
              <div className="work-read__supporting-field">
                <span>Definition of success</span>
                <p>{goal.successDefinitionMarkdown}</p>
              </div>
            )}
            {goal?.currentPositionMarkdown && (
              <div className="work-read__supporting-field">
                <span>Current position</span>
                <p>{goal.currentPositionMarkdown}</p>
              </div>
            )}
            {(selected.type === "goal" ? goal?.pauseReason : item?.blocker) && (
              <div className="work-blocker">
                <CircleStop size={16} />
                <div>
                  <span>{selected.type === "goal" ? "Paused because" : "Blocked by"}</span>
                  <p>{selected.type === "goal" ? goal?.pauseReason : item?.blocker}</p>
                </div>
              </div>
            )}
            <dl className="work-facts">
              <div>
                <dt>Status</dt>
                <dd>{workStateLabel(recordStatus)}</dd>
              </div>
              {goal && (
                <div>
                  <dt>Shape</dt>
                  <dd>{goalShapeLabel(goal.shape)}</dd>
                </div>
              )}
              <div>
                <dt>Area</dt>
                <dd>{record.area ?? "General"}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{priorityLabel(record.priority)}</dd>
              </div>
              {goal?.plannedStart && (
                <div>
                  <dt>Starts</dt>
                  <dd>{goal.plannedStart}</dd>
                </div>
              )}
              {goal?.targetDate && (
                <div>
                  <dt>Target</dt>
                  <dd>{goal.targetDate}</dd>
                </div>
              )}
              {goal?.hardDeadline && (
                <div>
                  <dt>Hard deadline</dt>
                  <dd>{goal.hardDeadline}</dd>
                </div>
              )}
              {item?.dueAt && (
                <div>
                  <dt>Due</dt>
                  <dd>{formatWhen(item.dueAt)}</dd>
                </div>
              )}
              {item?.attentionAt && (
                <div>
                  <dt>Attention</dt>
                  <dd>{formatWhen(item.attentionAt)}</dd>
                </div>
              )}
              {item?.commitmentDirection && (
                <div>
                  <dt>Direction</dt>
                  <dd>
                    {item.commitmentDirection === "owed_by_user"
                      ? "I owe this"
                      : "Owed to me"}
                  </dd>
                </div>
              )}
              {item?.goalId && (
                <div>
                  <dt>Project</dt>
                  <dd><RelationName kind="goal" value={item.goalId} /></dd>
                </div>
              )}
              {item?.personId && (
                <div>
                  <dt>Assigned to</dt>
                  <dd><RelationName kind="person" value={item.personId} displayName={selected.type === "work_item" && selected.assignee?.id === item.personId ? selected.assignee.displayName : undefined} /></dd>
                </div>
              )}
            </dl>
            {record.resultMarkdown && (
              <div className="work-result">
                <Check size={16} />
                <div>
                  <span>Actual result</span>
                  <p>{record.resultMarkdown}</p>
                </div>
              </div>
            )}
            {(selected.type === "goal" ? goal?.stopReason : item?.cancellationReason) && (
              <div className="work-result work-result--cancelled">
                <CircleStop size={16} />
                <div>
                  <span>{selected.type === "goal" ? "Stop reason" : "Cancellation reason"}</span>
                  <p>{selected.type === "goal" ? goal?.stopReason : item?.cancellationReason}</p>
                </div>
              </div>
            )}
            <div className="work-lifecycle">
              {!terminal && (
                <>
                  <Button
                    tone="primary"
                    onClick={() => setTransition(transitionCopy.complete)}
                  >
                    <Check size={15} />
                    Complete
                  </Button>
                  <Button onClick={() => setTransition(transitionCopy.cancel)}>
                    <CircleStop size={15} />
                    Cancel
                  </Button>
                </>
              )}
              {terminal && recordStatus !== "archived" && (
                <Button
                  onClick={() => setTransition(transitionCopy.reactivate)}
                >
                  <RotateCcw size={15} />
                  Reactivate
                </Button>
              )}
              {(selected.type === "goal"
                ? ["achieved", "stopped"].includes(selected.record.lifecycle)
                : ["completed", "cancelled"].includes(selected.record.state)) && (
                <Button onClick={() => setTransition(transitionCopy.archive)}>
                  <Archive size={15} />
                  Archive
                </Button>
              )}
            </div>
            <section className="work-activity">
              <h3>
                <History size={15} />
                Recent activity
              </h3>
              {activity.isPending ? (
                <p>Gathering activity…</p>
              ) : activity.data?.items.length ? (
                <ol>
                  {activity.data.items.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <Clock3 size={13} />
                      <span>
                        <strong>{item.summary}</strong>
                        <small>{formatWhen(item.occurredAt)}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No recorded changes yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
      <Modal
        open={Boolean(transition)}
        onOpenChange={(open) => {
          if (!open) setTransition(undefined);
        }}
        title={transition?.title ?? "Change Work"}
        description={
          transition?.kind === "archive"
            ? "This keeps the record and its history, but removes it from active views."
            : "Kora records the outcome so the history stays truthful."
        }
        purpose="confirm"
      >
        <form
          className="work-transition"
          onSubmit={(event) => {
            event.preventDefault();
            transitionMutation.mutate();
          }}
        >
          {transition?.kind === "reactivate" && (
            <label className="work-field">
              <span>Return to</span>
              <KoraSelect
                label="Return to"
                value={reactivationDestination}
                onValueChange={(value) =>
                  setReactivationDestination(value as "planned" | "active")
                }
                options={[
                  { value: "active", label: "Active" },
                  { value: "planned", label: "Planned" },
                ]}
              />
            </label>
          )}
          {transition && transition.kind !== "archive" && (
            <label className="work-field">
              <span>
                {transition.label}
                {transition.kind === "complete" && !completionResultRequired
                  ? " (optional)"
                  : ""}
              </span>
              <Textarea
                autoFocus
                rows={5}
                value={transitionText}
                onChange={(event) => setTransitionText(event.target.value)}
                placeholder={
                  transition.kind === "complete" && !completionResultRequired
                    ? "Add a useful result when there is one."
                    : transition.placeholder
                }
                required={transitionTextRequired}
              />
            </label>
          )}
          <div>
            <Button type="button" onClick={() => setTransition(undefined)}>
              Keep as is
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={
                transitionMutation.isPending ||
                (transitionTextRequired && !transitionText.trim())
              }
            >
              {transitionMutation.isPending ? (
                <KoraPresenceMark state="gathering" />
              ) : transition?.kind === "archive" ? (
                <Archive size={15} />
              ) : (
                <Check size={15} />
              )}
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(discardIntent)}
        onOpenChange={(open) => {
          if (!open) keepEditing();
        }}
        title="Discard unsaved changes?"
        description="Your edits have not been saved. Choose whether to keep working or return to the last saved version."
        purpose="confirm"
        initialFocus={keepEditingRef}
        finalFocus={dismissOriginRef}
        closeLabel="Close discard prompt and keep editing"
        actions={
          <>
            <Button ref={keepEditingRef} type="button" onClick={keepEditing}>
              Keep editing
            </Button>
            <Button type="button" tone="danger" onClick={discardChanges}>
              Discard changes
            </Button>
          </>
        }
      >
        <p>
          Discarding removes only the unsaved edits in this editor. The saved
          Work record is unchanged.
        </p>
      </Modal>
    </Sheet>
  );
}
