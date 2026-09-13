import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArchiveRestore, CircleAlert, Goal, ListTodo } from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useViewBar } from "../../app/ViewBar";
import {
  Badge,
  Button,
  Field,
  KoraSelect,
  Modal,
  PageFrame,
  PageHeader,
  PageToolbar,
  SearchField,
  SegmentedControl,
  StateView,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type Goal as GoalRecord,
  type GoalListEntry,
  type WorkItem,
  type WorkItemListEntry,
} from "../../lib/runtime";
import { WorkNavigation } from "./WorkNavigation";
import "./work-archive.css";

const ARCHIVE_PAGE_SIZE = 15;

type ArchiveType = "all" | "goals" | "tasks";
type ArchiveEntry =
  | { type: "goal"; id: string; record: GoalRecord; goal?: never }
  | {
      type: "task";
      id: string;
      record: WorkItem;
      goal?: WorkItemListEntry["goal"];
    };
export type ArchiveServices = Pick<
  typeof runtime,
  "goalsPage" | "workItems" | "resumeGoal" | "reactivateWorkItem"
>;

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "goals", label: "Projects" },
  { value: "tasks", label: "Tasks" },
];
const TYPE_VALUES = new Set(TYPE_OPTIONS.map((option) => option.value));
const DESTINATION_OPTIONS = [
  {
    value: "active",
    label: "In progress",
    description: "Return it to current Work.",
  },
  {
    value: "planned",
    label: "Planned",
    description: "Return it without making it current.",
  },
];

const formatDate = (value?: string) => {
  if (!value) return "Archive date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Archive date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const previousContext = (record: GoalRecord | WorkItem) => {
  if (record.resultMarkdown?.trim())
    return `Result recorded: ${record.resultMarkdown.trim()}`;
  const stopped = "lifecycle" in record ? record.stopReason : record.cancellationReason;
  if (stopped?.trim())
    return `Stop recorded: ${stopped.trim()}`;
  return "Previous terminal state is not exposed in this index.";
};

const archiveSortValue = (entry: ArchiveEntry) => {
  if (!entry.record.archivedAt) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(entry.record.archivedAt);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
};

function ArchiveRestoreRow({
  entry,
  onRestore,
  readOnly = false,
}: {
  entry: ArchiveEntry;
  onRestore: (entry: ArchiveEntry, trigger: HTMLButtonElement) => void;
  readOnly?: boolean;
}) {
  const record = entry.record;
  const isGoal = entry.type === "goal";
  const detailHref = isGoal
    ? `/work/goals/${encodeURIComponent(entry.id)}`
    : `/work/tasks/${encodeURIComponent(entry.id)}`;
  const context = previousContext(record);
  return (
    <li
      className="work-archive-row"
      data-archive-key={`${entry.type}:${entry.id}`}
    >
      <span className="work-archive-row__mark" aria-hidden="true">
        {isGoal ? <Goal size={16} /> : <ListTodo size={16} />}
      </span>
      <div className="work-archive-row__identity">
        <div className="work-archive-row__title">
          <Link to={detailHref}>{record.title}</Link>
          <Badge tone="quiet">
            {entry.type === "goal" ? "Goal" : entry.record.kind}
          </Badge>
        </div>
        <p>{context}</p>
        {!isGoal && entry.goal ? <small>Goal: {entry.goal.title}</small> : null}
      </div>
      <dl className="work-archive-row__facts">
        <div>
          <dt>Archived</dt>
          <dd>
            {record.archivedAt ? (
              <time dateTime={record.archivedAt}>
                {formatDate(record.archivedAt)}
              </time>
            ) : (
              "Archive date unavailable"
            )}
          </dd>
        </div>
        <div>
          <dt>Recovery</dt>
          <dd>Can be restored</dd>
        </div>
      </dl>
      <Button disabled={readOnly} onClick={(event) => onRestore(entry, event.currentTarget)}>
        <ArchiveRestore size={15} aria-hidden="true" />
        Restore
      </Button>
    </li>
  );
}

export function WorkArchiveWorkspace({
  services = runtime,
  requestKey = () => crypto.randomUUID(),
}: { services?: ArchiveServices; requestKey?: string | (() => string) } = {}) {
  useViewBar(() => ({ title: "Work", titleRole: "label" }), []);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const typeParam = params.get("type") ?? "all";
  const type = (TYPE_VALUES.has(typeParam) ? typeParam : "all") as ArchiveType;
  const query = params.get("q") ?? "";
  const deferredQuery = useDeferredValue(query.trim());
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreReasonId = useId();
  const restoreIssueRef = useRef<HTMLDivElement>(null);
  const [restoreTarget, setRestoreTarget] = useState<{
    type: ArchiveEntry["type"];
    id: string;
  }>();
  const [destination, setDestination] = useState<"planned" | "active">(
    "active",
  );
  const [reason, setReason] = useState("");
  const [restoreIssue, setRestoreIssue] = useState<{
    kind: "conflict" | "error";
    message: string;
  }>();
  const [announcement, setAnnouncement] = useState("");
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const restoreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreSuccessFocusRef = useRef<HTMLElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const restoreReasonRef = useRef<HTMLTextAreaElement>(null);
  const initialReason = "";

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes))
      value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch, true);
    return () => window.removeEventListener("keydown", focusSearch, true);
  }, []);
  useEffect(() => {
    if (restoreIssue) restoreIssueRef.current?.focus();
  }, [restoreIssue]);

  const fixtureKey = typeof requestKey === "string" ? requestKey : "runtime";
  const goals = useInfiniteQuery({
    queryKey: ["work", "archive", "goals", deferredQuery, fixtureKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      services.goalsPage({
        filter: "terminal",
        includeArchived: true,
        query: deferredQuery || undefined,
        limit: ARCHIVE_PAGE_SIZE,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => (page.complete ? undefined : page.cursor),
    enabled: type !== "tasks",
  });
  const tasks = useInfiniteQuery({
    queryKey: ["work", "archive", "tasks", deferredQuery, fixtureKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      services.workItems({
        filter: "archived",
        query: deferredQuery || undefined,
        limit: ARCHIVE_PAGE_SIZE,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => (page.complete ? undefined : page.cursor),
    enabled: type !== "goals",
  });

  const archivedGoals = useMemo(
    () =>
      goals.data?.pages
        .flatMap((page) => page.items)
        .filter(
          (entry: GoalListEntry) => entry.goal.lifecycle === "archived",
        ) ?? [],
    [goals.data],
  );
  const taskResults = useMemo(
    () => tasks.data?.pages.flatMap((page) => page.items) ?? [],
    [tasks.data],
  );
  const taskArchiveUnqualified = taskResults.some(
    (entry) => entry.item.state !== "archived",
  );
  const archivedTasks = useMemo(
    () => taskResults.filter((entry) => entry.item.state === "archived"),
    [taskResults],
  );
  const entries = useMemo<ArchiveEntry[]>(() => {
    const combined: ArchiveEntry[] = [
      ...(type === "tasks"
        ? []
        : archivedGoals.map((entry) => ({
            type: "goal" as const,
            id: entry.goal.id,
            record: entry.goal,
          }))),
      ...(type === "goals"
        ? []
        : archivedTasks.map((entry) => ({
            type: "task" as const,
            id: entry.item.id,
            record: entry.item,
            goal: entry.goal,
          }))),
    ];
    return combined.sort(
      (left, right) => archiveSortValue(right) - archiveSortValue(left),
    );
  }, [archivedGoals, archivedTasks, type]);
  const currentTarget = entries.find(
    (entry) =>
      entry.type === restoreTarget?.type && entry.id === restoreTarget.id,
  );
  const activeQueries =
    type === "goals" ? [goals] : type === "tasks" ? [tasks] : [goals, tasks];
  const pending = activeQueries.some((result) => result.isPending);
  const errors = activeQueries.filter((result) => result.isError);
  const hasMore =
    (type !== "tasks" && goals.hasNextPage) ||
    (type !== "goals" && tasks.hasNextPage);
  const hasFilters = Boolean(deferredQuery || type !== "all");
  const archiveStatus =
    pending && !entries.length
      ? "Archive loading"
      : taskArchiveUnqualified
        ? "Archived count unavailable · returned records could not be qualified"
        : errors.length
          ? `${entries.length} archived ${entries.length === 1 ? "record" : "records"} loaded · partial`
          : `${entries.length} archived ${entries.length === 1 ? "record" : "records"}${hasMore ? " loaded" : ""}`;

  const trulyCloseRestore = (restoreFocus = true) => {
    if (restore.isPending) return;
    setRestoreTarget(undefined);
    setDestination("active");
    setReason("");
    setRestoreIssue(undefined);
    setDiscardPrompt(false);
    if (!restoreFocus) restoreTriggerRef.current = null;
  };
  const dirtyRestore = reason !== initialReason || destination !== "active";
  const requestCloseRestore = () => {
    if (restore.isPending) return;
    if (dirtyRestore) {
      setDiscardPrompt(true);
      window.requestAnimationFrame(() => keepEditingRef.current?.focus());
      return;
    }
    trulyCloseRestore();
  };
  const openRestore = (entry: ArchiveEntry, trigger: HTMLButtonElement) => {
    restoreSuccessFocusRef.current = null;
    restoreTriggerRef.current = trigger;
    setRestoreTarget({ type: entry.type, id: entry.id });
    setDestination("active");
    setReason("");
    setRestoreIssue(undefined);
    setDiscardPrompt(false);
  };
  const restore = useMutation({
    mutationFn: async () => {
      if (!currentTarget)
        throw new Error(
          "This archived record is no longer in the current view.",
        );
      const outcome =
        currentTarget.type === "goal"
          ? await services.resumeGoal(
              currentTarget.id,
              currentTarget.record.version,
              destination,
              reason.trim(),
              (typeof requestKey === "string"
                ? `${requestKey}:${currentTarget.id}`
                : requestKey()) as ReturnType<typeof crypto.randomUUID>,
            )
          : await services.reactivateWorkItem(
              currentTarget.id,
              currentTarget.record.version,
              destination,
              reason.trim(),
              (typeof requestKey === "string"
                ? `${requestKey}:${currentTarget.id}`
                : requestKey()) as ReturnType<typeof crypto.randomUUID>,
            );
      return currentTarget;
    },
    onSuccess: async (restored) => {
      const restoredIndex = entries.findIndex(
        (entry) => entry.type === restored.type && entry.id === restored.id,
      );
      const neighbor = entries[restoredIndex + 1] ?? entries[restoredIndex - 1];
      const nextFocusKey = neighbor
        ? `${neighbor.type}:${neighbor.id}`
        : undefined;
      restoreSuccessFocusRef.current =
        (nextFocusKey
          ? document.querySelector<HTMLElement>(
              `[data-archive-key="${CSS.escape(nextFocusKey)}"] a`,
            )
          : null) ??
        document.querySelector<HTMLElement>(".work-archive-workspace h1");
      setAnnouncement(
        `${restored.record.title} restored to ${destination === "active" ? "In progress" : "Planned"}.`,
      );
      // The trigger row is about to leave the archive. Do not let the modal's
      // ordinary dismissal focus path target a disappearing control; the
      // settled-list path below is the sole focus owner for successful restore.
      restoreTriggerRef.current = null;
      setRestoreTarget(undefined);
      setReason("");
      setRestoreIssue(undefined);
      await queryClient.invalidateQueries({ queryKey: ["work"] });
    },
    onError: async (cause) => {
      const conflict =
        cause instanceof RuntimeRequestError && cause.code.includes("conflict");
      setRestoreIssue({
        kind: conflict ? "conflict" : "error",
        message: conflict
          ? "This record changed after the Archive loaded. Its latest version is being refreshed; your reason is preserved. Review it, then try Restore again."
          : cause instanceof Error
            ? cause.message
            : "Kora could not restore this record.",
      });
      if (conflict)
        await Promise.all([
          type !== "tasks" ? goals.refetch() : Promise.resolve(),
          type !== "goals" ? tasks.refetch() : Promise.resolve(),
        ]);
    },
  });

  const clearFilters = () => {
    setParams(new URLSearchParams(), { replace: true });
  };
  const loadMore = () => {
    if (type !== "tasks" && goals.hasNextPage) void goals.fetchNextPage();
    if (type !== "goals" && tasks.hasNextPage) void tasks.fetchNextPage();
  };

  let content;
  if (pending && !entries.length) {
    content = (
      <div
        className="work-archive-skeleton"
        role="status"
        aria-label="Loading archived Work"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    );
  } else if (errors.length === activeQueries.length && !entries.length) {
    const message =
      errors[0]?.error instanceof Error
        ? errors[0].error.message
        : "Kora could not read archived Work.";
    content = (
      <StateView
        state="error"
        title="Archive is unavailable"
        body={message}
        action={
          <Button
            onClick={() =>
              activeQueries.forEach((result) => void result.refetch())
            }
          >
            Try again
          </Button>
        }
      />
    );
  } else if (!entries.length && taskArchiveUnqualified) {
    content = (
      <StateView
        state="partial"
        title="Archive data could not be qualified"
        body="The current runtime returned active Work to an archived-only request. Nothing is shown as archived until the runtime can prove that state. Restart the local Kora runtime, then retry."
        action={
          <Button onClick={() => void tasks.refetch()}>
            Retry archived Tasks
          </Button>
        }
      />
    );
  } else if (!entries.length && hasMore) {
    content = (
      <StateView
        state="partial"
        title="More terminal Work remains to check"
        body="Archived Projects can appear in later bounded pages. Load the next page before treating this Archive view as empty."
        action={
          <Button
            onClick={loadMore}
            loading={goals.isFetchingNextPage || tasks.isFetchingNextPage}
          >
            Load more archived Work
          </Button>
        }
      />
    );
  } else if (!entries.length) {
    content = (
      <StateView
        state="empty"
        title={
          hasFilters ? "Nothing matches this Archive view" : "Archive is empty"
        }
        body={
          hasFilters
            ? "Archived Work outside these filters remains unchanged. Clear the search and type filter to see it."
            : "Projects and Tasks you archive will remain recoverable here with their recorded context."
        }
        action={
          hasFilters ? (
            <Button onClick={clearFilters}>Clear filters</Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <div className="work-archive-index">
        <div className="work-archive-index__header" aria-hidden="true">
          <span />
          <span>Archived Work</span>
          <span><span>Archived</span><span>Recovery</span></span>
          <span>Action</span>
        </div>
        <ul className="work-archive-list" aria-label="Archived Work">
          {entries.map((entry) => (
            <ArchiveRestoreRow
              key={`${entry.type}:${entry.id}`}
              entry={entry}
              onRestore={openRestore}
              readOnly={errors.length > 0}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="work-archive-workspace">
      <PageFrame
        width="standard"
        sidebar={<WorkNavigation />}
        sidebarLabel="Work"
      >
        <PageHeader
          title="Archive"
          description="Removed Work stays readable and recoverable without competing with what you are doing now."
          status={<span>{archiveStatus}</span>}
        />
        <PageToolbar
          sticky
          search={
            <SearchField
              inputRef={searchRef}
              value={query}
              onValueChange={(value) => updateParams({ q: value || undefined })}
              label="Search Archive"
              placeholder="Search archived Work"
            />
          }
          controls={
            <SegmentedControl
              label="Archived record type"
              layoutId="work-archive-type"
              value={type}
              onValueChange={(next) =>
                updateParams({ type: next === "all" ? undefined : next })
              }
              options={TYPE_OPTIONS}
            />
          }
          compactControls={
            <KoraSelect
              label="Archived record type"
              value={type}
              onValueChange={(next) =>
                updateParams({ type: next === "all" ? undefined : next })
              }
              options={TYPE_OPTIONS}
            />
          }
        />
        {taskArchiveUnqualified && entries.length ? (
          <p className="work-archive-notice" role="status">
            Some Task results could not be qualified as archived and are
            omitted. Restart the local Kora runtime, then retry.
          </p>
        ) : null}
        {entries.length ? (
          <p className="work-archive-recovery-note">
            Archived Work can be restored. The runtime does not expose a
            recovery expiry.
          </p>
        ) : null}
        {errors.length > 0 && entries.length ? (
          <div className="work-archive-notice" role="status">
            <CircleAlert size={15} aria-hidden="true" />
            <span>
              Archive could not refresh. Last-confirmed records remain readable,
              but Restore is paused until Kora confirms the latest local versions.
            </span>
            <Button
              tone="ghost"
              onClick={() => errors.forEach((result) => void result.refetch())}
            >
              Retry missing collection
            </Button>
          </div>
        ) : null}
        {announcement ? (
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        ) : null}
        {content}
        {hasMore && entries.length ? (
          <div className="work-archive-load">
            <Button
              onClick={loadMore}
              loading={goals.isFetchingNextPage || tasks.isFetchingNextPage}
            >
              Load more archived Work
            </Button>
          </div>
        ) : null}
      </PageFrame>
      <Modal
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) requestCloseRestore();
        }}
        title={
          currentTarget
            ? `Restore “${currentTarget.record.title}”?`
            : "Restore archived Work?"
        }
        description="Restoring returns this record to active Work and preserves its existing history."
        purpose="confirm"
        busy={restore.isPending}
        dismissPolicy="explicit"
        onDismissAttempt={requestCloseRestore}
        finalFocus={
          restoreSuccessFocusRef.current
            ? restoreSuccessFocusRef
            : restoreTriggerRef
        }
      >
        <form
          className="work-archive-restore"
          onSubmit={(event) => {
            event.preventDefault();
            setRestoreIssue(undefined);
            restore.mutate();
          }}
        >
          {restoreIssue ? (
            <div
              ref={restoreIssueRef}
              className={`work-archive-restore__issue is-${restoreIssue.kind}`}
              role="alert"
              tabIndex={-1}
            >
              <CircleAlert size={16} aria-hidden="true" />
              <div>
                <strong>
                  {restoreIssue.kind === "conflict"
                    ? "Review the latest version"
                    : "Restore did not finish"}
                </strong>
                <p>{restoreIssue.message}</p>
              </div>
            </div>
          ) : null}
          <KoraSelect
            label="Return to"
            value={destination}
            onValueChange={(value) =>
              setDestination(value as "planned" | "active")
            }
            options={DESTINATION_OPTIONS}
          />
          <Field
            label="Why are you restoring this?"
            htmlFor={restoreReasonId}
            hint="This reason becomes part of the record history."
          >
            <Textarea
              ref={restoreReasonRef}
              id={restoreReasonId}
              autoFocus
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: This needs another pass before it is complete."
              required
            />
          </Field>
          {discardPrompt ? (
            <div className="work-archive-restore__discard" role="alert">
              <span>
                <strong>Discard unsaved changes?</strong>
                <small>This archived record has not changed.</small>
              </span>
              <Button
                ref={keepEditingRef}
                type="button"
                onClick={() => {
                  restoreReasonRef.current?.focus();
                  setDiscardPrompt(false);
                }}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                tone="danger"
                onClick={() => trulyCloseRestore()}
              >
                Discard changes
              </Button>
            </div>
          ) : null}
          <div className="work-archive-restore__actions">
            <Button type="button" onClick={() => trulyCloseRestore()}>
              Keep archived
            </Button>
            <Button
              type="submit"
              tone="primary"
              loading={restore.isPending}
              disabled={!reason.trim() || !currentTarget}
            >
              Restore
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
