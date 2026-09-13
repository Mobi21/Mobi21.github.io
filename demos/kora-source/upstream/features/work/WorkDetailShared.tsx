import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CircleAlert,
  Link2,
  Plus,
  Search,
  Trash2,
  UserRound,
  Unlink,
} from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Button,
  CheckboxChoice,
  Input,
  KoraPresenceMark,
  KoraSelect,
  Modal,
  StateView,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  type Goal,
  type WorkConnectionRelation,
  type WorkConnectionSummary,
  type WorkConnectionTarget,
  type WorkDeletionOutcome,
  type WorkItem,
} from "../../lib/runtime";

const localInstant = (value: string) =>
  value ? new Date(value).toISOString() : undefined;

export type AddWorkItemServices = Pick<typeof runtime, "createGoalWorkItem">;

export function AddWorkItemModal({
  open,
  onOpenChange,
  goalId,
  parents,
  onCreated,
  goalChoices = [],
  goalChoicesPending = false,
  goalChoicesError,
  goalChoicesLoadMoreError,
  goalChoicesHasMore = false,
  goalChoicesLoadingMore = false,
  onRetryGoalChoices,
  onLoadMoreGoalChoices,
  onGoalChange,
  taskOnly = false,
  services = runtime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  parents: WorkItem[];
  onCreated: (item: WorkItem, openItem: boolean) => void | Promise<void>;
  goalChoices?: readonly Pick<Goal, "id" | "title">[];
  goalChoicesPending?: boolean;
  goalChoicesError?: string;
  goalChoicesLoadMoreError?: string;
  goalChoicesHasMore?: boolean;
  goalChoicesLoadingMore?: boolean;
  onRetryGoalChoices?: () => void;
  onLoadMoreGoalChoices?: () => void;
  onGoalChange?: (goalId: string) => void;
  taskOnly?: boolean;
  services?: AddWorkItemServices;
}) {
  const formId = useId();
  const [kind, setKind] = useState<WorkItem["kind"]>("task");
  const [commitmentDirection, setCommitmentDirection] =
    useState<NonNullable<WorkItem["commitmentDirection"]>>("owed_by_user");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [parentWorkItemId, setParentWorkItemId] = useState("");
  const [state, setState] = useState<"planned" | "active" | "blocked">(
    "planned",
  );
  const [priority, setPriority] = useState(2);
  const [dueAt, setDueAt] = useState("");
  const [attentionAt, setAttentionAt] = useState("");
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const deferredPersonQuery = useDeferredValue(personQuery.trim());
  const people = useQuery({
    queryKey: ["work", "create-assignee", deferredPersonQuery],
    queryFn: () => runtime.searchWorkPeople(deferredPersonQuery, 12),
    enabled: deferredPersonQuery.length > 1,
  });
  const [blocker, setBlocker] = useState("");
  const [openAfter, setOpenAfter] = useState(false);
  const [error, setError] = useState<string>();
  const requestKey = useRef(crypto.randomUUID());
  const create = useMutation({
    mutationFn: () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("A title is required.");
      if (taskOnly && !goalChoices.some((goal) => goal.id === goalId))
        throw new Error("Choose an available Project before creating a Task.");
      return services.createGoalWorkItem(goalId, {
        requestKey: requestKey.current,
        item: {
          ...(!taskOnly && parentWorkItemId ? { parentWorkItemId } : {}),
          kind: taskOnly ? "task" : kind,
          ...(!taskOnly && kind === "commitment" ? { commitmentDirection } : {}),
          title: trimmedTitle,
          ...(area.trim() ? { area: area.trim() } : {}),
          ...(description.trim()
            ? { descriptionMarkdown: description.trim() }
            : {}),
          state,
          priority,
          ...(dueAt ? { dueAt: localInstant(dueAt) } : {}),
          ...(attentionAt ? { attentionAt: localInstant(attentionAt) } : {}),
          ...(personId ? { personId } : {}),
          ...(blocker.trim() ? { blocker: blocker.trim() } : {}),
        },
      });
    },
    onSuccess: async (result) => {
      if (result.status !== "settled")
        throw new Error("Native Work did not settle.");
      await onCreated(result.record, openAfter);
      onOpenChange(false);
    },
    onError: (reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "The Work item could not be created.",
      ),
  });
  useEffect(() => {
    if (open) return;
    setKind("task");
    setCommitmentDirection("owed_by_user");
    setTitle("");
    setArea("");
    setDescription("");
    setParentWorkItemId("");
    setState("planned");
    setPriority(2);
    setDueAt("");
    setAttentionAt("");
    setPersonId("");
    setPersonName("");
    setPersonQuery("");
    setBlocker("");
    setOpenAfter(false);
    setError(undefined);
    requestKey.current = crypto.randomUUID();
  }, [open]);
  const validParents = parents.filter((item) => item.kind === "outcome");
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={taskOnly ? "New Task" : "Add Work"}
      description={taskOnly
        ? "Create one Task inside an existing Project."
        : "Add one meaningful Task, Milestone, Outcome, or Commitment to this Project."}
      purpose="focused-form"
    >
      <form
        className="work-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return setError("A title is required.");
          if (taskOnly && !goalId) return setError("Choose a Project before creating a Task.");
          if (state === "blocked" && !blocker.trim())
            return setError("Blocked Work requires a blocker.");
          create.mutate();
        }}
      >
        {!taskOnly && <div className="work-create-form__split">
          <label>
            <span>Kind</span>
            <KoraSelect
              label="Kind"
              value={kind}
              onValueChange={(value) => setKind(value as WorkItem["kind"])}
              options={[
                { value: "outcome", label: "Outcome" },
                { value: "task", label: "Task" },
                { value: "milestone", label: "Milestone" },
                { value: "commitment", label: "Commitment" },
              ]}
            />
          </label>
          <label>
            <span>State</span>
            <KoraSelect
              label="State"
              value={state}
              onValueChange={(value) => setState(value as typeof state)}
              options={[
                { value: "planned", label: "Planned" },
                { value: "active", label: "Active" },
                { value: "blocked", label: "Blocked" },
              ]}
            />
          </label>
        </div>}
        {!taskOnly && kind === "commitment" && (
          <label>
            <span>Promise direction</span>
            <KoraSelect
              label="Promise direction"
              value={commitmentDirection}
              onValueChange={(value) =>
                setCommitmentDirection(
                  value as NonNullable<WorkItem["commitmentDirection"]>,
                )
              }
              options={[
                { value: "owed_by_user", label: "I owe this" },
                { value: "owed_to_user", label: "Owed to me" },
              ]}
            />
          </label>
        )}
        <label>
          <span>Title</span>
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={500}
            placeholder="Draft the travel itinerary"
          />
        </label>
        <label>
          <span>Area</span>
          <Input
            value={area}
            onChange={(event) => setArea(event.target.value)}
            maxLength={120}
            placeholder="Career, Home, Learning…"
          />
        </label>
        <label>
          <span>Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Useful detail, not a second title"
          />
        </label>
        {taskOnly && (
          goalChoicesPending ? <p className="work-form-help" role="status">Loading Projects…</p>
            : goalChoices.length ? <div className="work-create-form__goal-choice">
              <label>
                <span>Project</span>
                <KoraSelect
                  label="Project"
                  value={goalId}
                  required
                  onValueChange={(value) => onGoalChange?.(value)}
                  options={[
                    { value: "", label: "Select a Project", disabled: true },
                    ...goalChoices.map((goal) => ({ value: goal.id, label: goal.title })),
                  ]}
                />
              </label>
              {goalChoicesHasMore && onLoadMoreGoalChoices ? <Button
                type="button"
                tone="ghost"
                loading={goalChoicesLoadingMore}
                disabled={goalChoicesLoadingMore}
                onClick={onLoadMoreGoalChoices}
              >Load more Projects</Button> : null}
              {goalChoicesLoadMoreError ? <p className="work-form-error" role="alert">
                <CircleAlert size={15} />
                <span>{goalChoicesLoadMoreError}</span>
                {onLoadMoreGoalChoices ? <Button type="button" tone="ghost" onClick={onLoadMoreGoalChoices}>Retry Projects</Button> : null}
              </p> : null}
            </div>
            : goalChoicesError ? <div className="work-form-error" role="alert">
              <CircleAlert size={15} />
              <span>{goalChoicesError}</span>
              {onRetryGoalChoices ? <Button type="button" tone="ghost" onClick={onRetryGoalChoices}>Retry Projects</Button> : null}
              <Link to="/work/goals">Open Work Projects</Link>
            </div>
              : <div className="work-form-error" role="alert">
                <CircleAlert size={15} />
                <span>Create a Project before adding a Task.</span>
                <Link to="/work/goals">Open Work Projects</Link>
              </div>
        )}
        {!taskOnly && kind === "task" && validParents.length > 0 && (
          <label>
            <span>Parent outcome</span>
            <KoraSelect
              label="Parent outcome"
              value={parentWorkItemId}
              onValueChange={setParentWorkItemId}
              options={[
                { value: "", label: "Standalone task" },
                ...validParents.map((item) => ({
                  value: item.id,
                  label: item.title,
                })),
              ]}
            />
          </label>
        )}
        <div className="work-create-form__assignee">
          <label htmlFor={`${formId}-assignee`}>Assigned to</label>
          {personId ? (
            <div className="work-create-form__assignee-current">
              <UserRound size={15} aria-hidden="true" />
              <span>{personName || "Assigned person"}</span>
              <Button
                type="button"
                tone="ghost"
                onClick={() => {
                  setPersonId("");
                  setPersonName("");
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <Input
              id={`${formId}-assignee`}
              aria-label="Search assignees"
              value={personQuery}
              onChange={(event) => setPersonQuery(event.target.value)}
              placeholder="Search people"
            />
          )}
          {!personId && deferredPersonQuery.length > 1 && (
            <div className="work-create-form__assignee-results">
              {people.isFetching ? <p role="status">Searching people…</p> : null}
              {people.isError ? <p role="status">People are unavailable right now.</p> : null}
              {!people.isFetching && !people.isError && people.isSuccess && people.data.results.length === 0 ? <p role="status">No matching people.</p> : null}
              {people.data?.results.map((person) => (
                <Button
                  key={person.id}
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    setPersonId(person.id);
                    setPersonName(person.displayName);
                    setPersonQuery("");
                  }}
                >
                  <UserRound size={14} aria-hidden="true" />
                  <span>{person.displayName}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="work-create-form__split">
          <label>
            <span>Due</span>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
          <label>
            <span>Attention</span>
            <Input
              type="datetime-local"
              value={attentionAt}
              onChange={(event) => setAttentionAt(event.target.value)}
            />
          </label>
        </div>
        <label>
          <span>Priority</span>
          <KoraSelect
            label="Priority"
            value={String(priority)}
            onValueChange={(value) => setPriority(Number(value))}
            options={[
              { value: "4", label: "Highest" },
              { value: "3", label: "High" },
              { value: "2", label: "Normal" },
              { value: "1", label: "Low" },
              { value: "0", label: "Someday" },
            ]}
          />
        </label>
        {state === "blocked" && (
          <label>
            <span>Blocker</span>
            <Input
              value={blocker}
              onChange={(event) => setBlocker(event.target.value)}
              placeholder="What is preventing progress?"
            />
          </label>
        )}
        <div className="work-inline-check">
          <CheckboxChoice
            checked={openAfter}
            onCheckedChange={setOpenAfter}
            title="Open this Work item after creating it"
          />
        </div>
        {error && (
          <p className="work-form-error" role="alert">
            <CircleAlert size={15} />
            {error}
          </p>
        )}
        <div className="work-create-form__actions">
          <Button
            type="button"
            tone="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={create.isPending}>
            {create.isPending ? (
              <KoraPresenceMark state="gathering" />
            ) : (
              <Plus size={16} />
            )}
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type DeleteWorkServices = Pick<
  typeof runtime,
  "deleteWorkRecord" | "approveToolConfirmation" | "rejectToolConfirmation"
>;

export function DeleteWorkRecordModal({
  open,
  onOpenChange,
  surface,
  id,
  title,
  onDeleted,
  services = runtime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: "project" | "work_item";
  id: string;
  title: string;
  onDeleted: () => void;
  services?: DeleteWorkServices;
}) {
  const [outcome, setOutcome] = useState<WorkDeletionOutcome>();
  const [error, setError] = useState<string>();
  const requestKey = useRef(crypto.randomUUID());
  const execute = async () => {
    const result = await services.deleteWorkRecord(
      surface,
      id,
      requestKey.current,
    );
    setOutcome(result);
    if (result.status === "settled" || result.status === "gone") onDeleted();
    return result;
  };
  const deletion = useMutation({
    mutationFn: execute,
    onError: (reason) =>
      setError(
        reason instanceof Error ? reason.message : "Deletion could not settle.",
      ),
  });
  useEffect(() => {
    if (open) return;
    setOutcome(undefined);
    setError(undefined);
    requestKey.current = crypto.randomUUID();
  }, [open]);
  const waiting =
    outcome?.status === "waiting_confirmation" ? outcome : undefined;
  const reject = async () => {
    if (waiting) {
      for (const confirmation of waiting.confirmations)
        await services.rejectToolConfirmation(confirmation.confirmationId);
    }
    onOpenChange(false);
  };
  const confirm = async () => {
    if (!waiting) return;
    for (const confirmation of waiting.confirmations)
      await services.approveToolConfirmation(confirmation.confirmationId);
    await deletion.mutateAsync();
  };
  const startAgain = () => {
    setOutcome(undefined);
    setError(undefined);
    requestKey.current = crypto.randomUUID();
  };
  const outcomeMessage =
    outcome?.status === "stale" ||
    outcome?.status === "expired" ||
    outcome?.status === "rejected" ||
    outcome?.status === "uncertain"
      ? outcome.message
      : undefined;
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) void reject();
      }}
      title={
        waiting
          ? `Delete ${title}?`
          : `Delete ${surface === "project" ? "Project" : "Work item"}`
      }
      description={
        waiting?.consequence ??
        "Kora will first return the exact consequence and require explicit confirmation."
      }
      purpose="confirm"
      dismissPolicy="explicit"
      onDismissAttempt={(reason) => { if (reason === "close-press") void reject(); }}
    >
      <div className="work-delete-flow">
        <Trash2 size={20} />
        <p>
          {waiting
            ? "This action removes exactly this local record. Independent sources remain independent."
            : `Request exact deletion for “${title}”. Nothing is removed until the confirmation boundary settles.`}
        </p>
        {error && (
          <p className="work-form-error" role="alert">
            {error}
          </p>
        )}
        {outcomeMessage && (
          <div className="work-form-error" role="alert">
            <strong>
              {outcome?.status === "stale"
                ? "This record changed"
                : outcome?.status === "uncertain"
                  ? "Deletion is not yet confirmed"
                  : "Deletion approval ended"}
            </strong>
            <span>{outcomeMessage}</span>
          </div>
        )}
        <div>
          <Button tone="ghost" onClick={() => void reject()}>
            Cancel
          </Button>
          {outcome?.status === "uncertain" ? (
            <Button
              tone="primary"
              onClick={() => deletion.mutate()}
              disabled={deletion.isPending}
            >
              Retry confirmation
            </Button>
          ) : outcomeMessage ? (
            <Button tone="primary" onClick={startAgain}>
              Review current record
            </Button>
          ) : waiting ? (
            <Button
              tone="primary"
              onClick={() => void confirm()}
              disabled={deletion.isPending}
            >
              Confirm exact deletion
            </Button>
          ) : (
            <Button
              tone="primary"
              onClick={() => deletion.mutate()}
              disabled={deletion.isPending}
            >
              Review deletion
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

type ConnectionCandidate = {
  key: string;
  label: string;
  kindLabel: string;
  relation: WorkConnectionRelation;
  target: WorkConnectionTarget;
};

type WorkConnectionsPage = {
  items: WorkConnectionSummary[];
  cursor?: string;
  complete: boolean;
};
type ProjectedConnection = WorkConnectionSummary & {
  destination?: { kind: string; path: string };
};
type WorkConnectionsRuntime = typeof runtime & {
  workConnections?: (input: {
    recordType: "project" | "work_item";
    id: string;
    limit?: number;
    cursor?: string;
  }) => Promise<WorkConnectionsPage>;
};
const workConnectionsRuntime = runtime as WorkConnectionsRuntime;
const connectionTargetType = (connection: WorkConnectionSummary) => {
  const target = connection.target as unknown as { type?: string };
  if (target.type === "unavailable" || connection.availability === "unavailable") return "Unavailable";
  if (target.type === "page") return "Page";
  if (target.type === "person") return "Person";
  if (target.type === "knowledge_source") return "Source";
  if (target.type === "project") return "Project";
  if (target.type === "work_item") return "Task";
  if (target.type === "session") return "Session";
  if (target.type === "artifact") return "Artifact";
  if (target.type === "provider_record") return "Provider record";
  if (target.type === "provider_operation") return "Provider operation";
  if (target.type === "workspace_path") return "Workspace file";
  return "Connected record";
};
const connectionDestination = (connection: WorkConnectionSummary) => {
  const projected = connection as ProjectedConnection;
  const target = connection.target as unknown as { type?: string };
  if (target.type === "unavailable" || connection.availability !== "available") return undefined;
  const destination = projected.destination ?? (target as { destination?: { kind: string; path: string } }).destination;
  if (!destination || !destination.path || !destination.kind) return undefined;
  return destination;
};

export function ConnectionsSection({
  recordType,
  recordId,
  connections,
  cursor,
  complete = true,
  readOnly = false,
}: {
  recordType: "project" | "work_item";
  recordId: string;
  connections: WorkConnectionSummary[];
  cursor?: string;
  complete?: boolean;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [moreConnections, setMoreConnections] = useState<WorkConnectionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState(cursor);
  const [connectionsComplete, setConnectionsComplete] = useState(complete);
  const [connectionsError, setConnectionsError] = useState<string>();
  const [unlinkError, setUnlinkError] = useState<{ id: string; label: string; message: string }>();
  const deferred = useDeferredValue(query.trim());
  const searchEnabled = open && deferred.length > 1;
  const pages = useInfiniteQuery({
    queryKey: ["work", "connection-picker", "pages", deferred],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.pagesPage({ query: deferred, pageSize: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
    enabled: searchEnabled,
  });
  const people = useInfiniteQuery({
    queryKey: ["work", "connection-picker", "people", deferred],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.peoplePage({ query: deferred, pageSize: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
    enabled: searchEnabled,
  });
  const sources = useInfiniteQuery({
    queryKey: ["work", "connection-picker", "sources", deferred],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.knowledgeSourcesPage({ query: deferred, pageSize: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor,
    enabled: searchEnabled,
  });
  const candidates: ConnectionCandidate[] = [
    ...(pages.data?.pages.flatMap((page) => page.items) ?? []).map((page) => ({
      key: `page:${page.id}`,
      label: page.title,
      kindLabel: "Page",
      relation: "supporting_page" as const,
      target: { type: "page" as const, id: page.id },
    })),
    ...(people.data?.pages.flatMap((page) => page.items) ?? []).map((person) => ({
      key: `person:${person.id}`,
      label: person.displayName,
      kindLabel: "Person",
      relation: "related_person" as const,
      target: { type: "person" as const, id: person.id },
    })),
    ...(sources.data?.pages.flatMap((page) => page.items) ?? []).map((source) => ({
      key: `source:${source.id}`,
      label: source.label,
      kindLabel: "Source",
      relation: "supporting_source" as const,
      target: { type: "knowledge_source" as const, id: source.id },
    })),
  ];
  const searches = [pages, people, sources];
  const searchPending = searches.some((candidate) => candidate.isFetching);
  const searchPartial = searches.some((candidate) => candidate.isError);
  const searchComplete = searches.every(
    (candidate) => candidate.data?.pages.at(-1)?.complete === true,
  );
  const searchHasMore = searches.some((candidate) => candidate.hasNextPage);
  const loadMoreSearch = async () => {
    await Promise.all(searches.filter((candidate) => candidate.hasNextPage).map((candidate) => candidate.fetchNextPage()));
  };
  const connectionSignature = connections.map((connection) => connection.id).join("|");
  useEffect(() => {
    setMoreConnections([]);
    setNextCursor(cursor);
    setConnectionsComplete(complete);
    setConnectionsError(undefined);
  }, [complete, connectionSignature, cursor, recordId]);
  const visibleConnections = [...connections, ...moreConnections].filter((connection, index, all) => all.findIndex((candidate) => candidate.id === connection.id) === index);
  const loadMoreConnections = useMutation({
    mutationFn: async () => {
      const load = (workConnectionsRuntime as unknown as { workConnections?: WorkConnectionsRuntime["workConnections"] }).workConnections;
      if (!load || !nextCursor) throw new Error("More connected context is not available yet.");
      return load({ recordType, id: recordId, limit: 50, cursor: nextCursor });
    },
    onMutate: () => setConnectionsError(undefined),
    onSuccess: (page) => {
      setMoreConnections((current) => [...current, ...page.items]);
      setNextCursor(page.cursor);
      setConnectionsComplete(page.complete || !page.cursor);
    },
    onError: (reason) => setConnectionsError(reason instanceof Error ? reason.message : "More connected context could not load."),
  });
  const link = useMutation({
    mutationFn: (candidate: ConnectionCandidate) =>
      runtime.createWorkConnection({
        requestKey: crypto.randomUUID(),
        from: { type: recordType, id: recordId },
        relation: candidate.relation,
        target: candidate.target,
      }),
    onSuccess: async () => {
      setOpen(false);
      setQuery("");
      await queryClient.invalidateQueries({
        queryKey: ["work"],
      });
    },
  });
  const unlink = useMutation({
    mutationFn: (id: string) => runtime.unlinkWorkConnection(id),
    onMutate: () => setUnlinkError(undefined),
    onSuccess: async () => {
      setMoreConnections([]);
      setNextCursor(cursor);
      setConnectionsComplete(complete);
      setConnectionsError(undefined);
      setUnlinkError(undefined);
      await queryClient.invalidateQueries({ queryKey: ["work"] });
    },
    onError: (reason, id) => {
      const connection = visibleConnections.find((candidate) => candidate.id === id);
      setUnlinkError({
        id,
        label: connection && connectionTargetType(connection) === "Unavailable" ? "Unavailable connection" : connection?.label ?? "connected context",
        message: reason instanceof Error ? reason.message : "The connection could not be removed.",
      });
    },
  });
  return (
    <section className="work-context-section">
      <div className="work-section-heading">
        <div>
          <Link2 size={15} />
          <h2>Connected context</h2>
        </div>
        <Button tone="ghost" onClick={() => setOpen(true)} disabled={readOnly}>
          <Plus size={14} />
          Attach
        </Button>
      </div>
      {visibleConnections.length === 0 ? (
        <p className="work-section-empty">No connected context yet.</p>
      ) : (
        <ul className="work-connection-list">
          {visibleConnections.map((connection) => {
            const destination = connectionDestination(connection);
            const label = connectionTargetType(connection) === "Unavailable" ? "Unavailable connection" : connection.label;
            const copy = <span>
              <strong>{label}</strong>
              <small>
                {connectionTargetType(connection)} · {connection.relation.replaceAll("_", " ")} · {connection.availability === "unverified" ? "Not yet verified" : connection.availability}
              </small>
            </span>;
            return (
            <li key={connection.id}>
              {destination ? destination.path.startsWith("/") ? <Link to={destination.path} state={{ workOrigin: { returnTo: `${location.pathname}${location.search}` } }}>{copy}</Link> : <a href={destination.path}>{copy}</a> : copy}
              <Button
                tone="ghost"
                aria-label={`Unlink ${label}`}
                onClick={() => unlink.mutate(connection.id)}
                disabled={readOnly || unlink.isPending || loadMoreConnections.isPending}
              >
                <Unlink size={14} />
              </Button>
            </li>
            );
          })}
        </ul>
      )}
      {unlinkError ? (
        <p className="work-form-error" role="alert">
          <CircleAlert size={15} />
          <span>Could not unlink {unlinkError.label}. It is still shown. {unlinkError.message}</span>
          <Button tone="ghost" onClick={() => unlink.mutate(unlinkError.id)} disabled={readOnly || unlink.isPending}>Try again</Button>
        </p>
      ) : null}
      {connectionsError ? <p className="work-form-error" role="alert"><CircleAlert size={15} /><span>{connectionsError}</span><Button tone="ghost" onClick={() => loadMoreConnections.mutate()}>Try again</Button></p> : null}
      {!connectionsComplete && nextCursor && typeof (workConnectionsRuntime as unknown as { workConnections?: unknown }).workConnections === "function" ? <Button tone="ghost" onClick={() => loadMoreConnections.mutate()} loading={loadMoreConnections.isPending} disabled={readOnly || loadMoreConnections.isPending || unlink.isPending}>Load more connected context</Button> : null}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Attach context"
        description="Choose an existing ordinary Brain record. A connection never grants access."
        purpose="focused-form"
      >
        <div className="work-context-picker">
          <label>
            <Search size={16} />
            <Input
              aria-label="Search pages, people, and sources"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, people, and sources"
            />
          </label>
          {!searchEnabled && (
            <p>
              Type at least two characters to search canonical Brain records.
            </p>
          )}
          {searchPending && (
            <p>
              <KoraPresenceMark state="gathering" />
              Searching Personal Brain
            </p>
          )}
          {searchEnabled &&
            !searchPending &&
            candidates.length === 0 &&
            searchComplete && (
              <StateView
                state="empty"
                title="No matching records"
                body="Try a different name or phrase."
              />
            )}
          {searchEnabled && searchPartial && (
            <StateView
              state="partial"
              title="Some Brain collections are unavailable"
              body="Available Pages, People, and Sources are still shown below."
            />
          )}
          <div>
            {candidates.map((candidate) => (
              <Button
                tone="ghost"
                key={candidate.key}
                onClick={() => link.mutate(candidate)}
              >
                <span>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.kindLabel}</small>
                </span>
                <Plus size={14} />
              </Button>
            ))}
          </div>
          {searchEnabled && searchHasMore ? <Button type="button" tone="ghost" onClick={() => void loadMoreSearch()} loading={searches.some((candidate) => candidate.isFetchingNextPage)}>Load more results</Button> : null}
          {link.isError && (
            <p className="work-form-error" role="alert">
              {link.error.message}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}

export function ActivitySection({
  items,
}: {
  items: Array<{
    id: string;
    operation: string;
    summary: string;
    occurredAt: string;
  }>;
}) {
  const activityLabel = (summary: string) => {
    const normalized = summary
      .replaceAll("_", " ")
      .replace(/\s+completed$/i, "")
      .trim()
      .toLowerCase();
    if (normalized.startsWith("add work focus"))
      return "Added this record to focus";
    if (normalized.startsWith("remove work focus"))
      return "Removed this record from focus";
    if (normalized.startsWith("create project")) return "Created this Project";
    if (normalized.startsWith("create work item"))
      return "Created this Work item";
    if (normalized.startsWith("add work")) return "Added Work";
    if (!normalized) return "Updated this record";
    return `${normalized[0].toUpperCase()}${normalized.slice(1).replace(/\bgoal\b/g, "Project")}`;
  };
  return (
    <section className="work-context-section">
      <div className="work-section-heading">
        <div>
          <Activity size={15} />
          <h2>Activity</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="work-section-empty">No recorded activity yet.</p>
      ) : (
        <ol className="work-activity-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>{activityLabel(item.summary)}</span>
              <time dateTime={item.occurredAt}>
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(item.occurredAt))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
