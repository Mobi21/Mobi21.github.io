import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Cloud,
  Cpu,
  Database,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ContentState,
  Disclosure,
  Field,
  IconButton,
  KoraPresenceMark,
  SearchField,
  StateView,
  Switch,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type BrainDeletionOutcome,
  type ConversationContextReference,
  type MemoryPipelineHealth,
  type MemoryRevision,
} from "../../lib/runtime";
import { ExactOperationConfirmation } from "./ExactOperationConfirmation";
import { useOperationIntent } from "./useOperationIntent";
import "./memory.css";
import { detailFromRow, DUR, EASE } from "../../lib/motion";
import { useViewBar } from "../../app/ViewBar";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import { Badge, Item } from "../../components/display";
import { useLedgerKeyboard, type LedgerRowProps } from "../../lib/use-ledger-keyboard";

export type BrainMemoryRecord = {
  id: string;
  content: string;
  status: "active" | "expired";
  provenance: string;
  confidence: number;
  sourceSessionId?: string;
  sourceUserEntryId?: string;
  sourceAssistantEntryId?: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
  score?: number;
};

type BrainCollectionPage<T> = {
  items: T[];
  nextCursor?: string;
  complete: boolean;
};

type BrainMutationOutcome<T> =
  | { status: "settled"; record: T; replayed?: boolean }
  | { status: "conflict"; current: T; message?: string }
  | { status: "gone"; replayed?: boolean }
  | { status: "not_available"; message: string }
  | { status: "needs_input"; message: string };

type ExpectedBrainRuntime = {
  memoryPage(input?: {
    query?: string;
    status?: "active" | "expired";
    provenance?: string;
    limit?: number;
    cursor?: string;
  }): Promise<BrainCollectionPage<BrainMemoryRecord>>;
  brainRecord(
    surface: "memory",
    id: string,
  ): Promise<{ record: BrainMemoryRecord }>;
  createMemory(input: {
    content: string;
    requestKey: string;
  }): Promise<BrainMutationOutcome<BrainMemoryRecord>>;
  correctMemory(
    id: string,
    input: {
      content: string;
      expectedUpdatedAt: string;
      requestKey: string;
    },
  ): Promise<BrainMutationOutcome<BrainMemoryRecord>>;
  deleteBrainRecord(
    surface: "memory",
    id: string,
    input: { requestKey: string; expectedUpdatedAt?: string },
  ): Promise<BrainDeletionOutcome>;
  memoryPipelineHealth(): Promise<MemoryPipelineHealth>;
  updateMemorySettings(input: {
    enabled: boolean;
    expectedUpdatedAt: string;
    requestKey: string;
  }): Promise<{
    enabled: boolean;
    updatedAt: string;
    replayed: boolean;
  }>;
};

const brainRuntime = runtime as unknown as ExpectedBrainRuntime;

const isUnavailableReadError = (reason: unknown) =>
  reason instanceof RuntimeRequestError && (
    reason.code.startsWith("runtime_")
    || reason.code.includes("unavailable")
    || reason.status === 503
  );

const isGoneReadError = (reason: unknown) =>
  reason instanceof RuntimeRequestError && (
    reason.code === "not_found"
    || reason.code.endsWith("_not_found")
    || reason.status === 404
    || reason.status === 410
  );

function useCompactMemoryPane() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 680px)").matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

/**
 * Memory is memory-only. Profile facts moved to the Life workspace in Phase 4C
 * and are rendered by `features/life/LifeProfileWorkspace`.
 *
 * This was previously a two-surface union with a `Segment` type, a `segmentFrom`
 * URL parser, a tab strip, and profile branches through the create strip, the
 * detail pane, the editor, and the delete confirmation — all of it unreachable,
 * because the component hardcoded `const segment = "learned"`. The wrapper shape
 * is kept (rather than collapsing to a bare record) because the detail pane and
 * the Kora context reference both key off `surface`.
 */
type SelectedRecord = { surface: "memory"; record: BrainMemoryRecord };
type MemoryDirectorySnapshot = {
  version: 1;
  memoryId?: string;
  query: string;
  scrollTop: number;
};
type MemoryRouteState = Record<string, unknown> & {
  memoryReturn?: MemoryDirectorySnapshot;
};
type MemoryDetailState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "gone" }
  | { state: "unavailable" }
  | { state: "error" }
  | { state: "ready"; record: SelectedRecord };
type MemoryCorrectionPayload = {
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMemoryDirectorySnapshot(value: unknown): MemoryDirectorySnapshot | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.query !== "string" || value.query.length > 1_000) return undefined;
  const memoryId = value.memoryId === undefined
    ? undefined
    : typeof value.memoryId === "string" && value.memoryId.length <= 300
      ? value.memoryId
      : undefined;
  if (value.memoryId !== undefined && memoryId === undefined) return undefined;
  const scrollTop = typeof value.scrollTop === "number" && Number.isFinite(value.scrollTop) && value.scrollTop >= 0
    ? value.scrollTop
    : undefined;
  if (scrollTop === undefined) return undefined;
  return { version: 1, ...(memoryId ? { memoryId } : {}), query: value.query, scrollTop };
}

function readMemoryReturn(value: unknown): MemoryDirectorySnapshot | undefined {
  return isRecord(value) ? readMemoryDirectorySnapshot(value.memoryReturn) : undefined;
}

function memoryRouteState(existing: unknown, snapshot: MemoryDirectorySnapshot): MemoryRouteState {
  return {
    ...(isRecord(existing) ? existing : {}),
    memoryReturn: snapshot,
  };
}

const memoryDirectoryPath = (search: string) => ({ pathname: "/brain/memory", search });

const provenanceLabel = (value: string) =>
  value === "automatic_turn"
    ? "Learned from conversation"
    : value === "user_correction"
      ? "Corrected by you"
      : value === "user_explicit"
        ? "Explicitly saved"
        : value === "mem0"
          ? "Migrated memory"
          : "Other saved origin";

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(value).getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(new Date(value));

function recordIdentity(record: SelectedRecord) {
  return `${record.surface}:${record.record.id}`;
}

function MemoryRow({
  record,
  selected,
  onSelect,
  rowProps,
}: {
  record: BrainMemoryRecord;
  selected: boolean;
  onSelect: () => void;
  rowProps: LedgerRowProps;
}) {
  const queryClient = useQueryClient();
  return (
    <motion.li
      data-memory-id={record.id}
      layout="position"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      {/* Was a hand-rolled .brain-ledger-row. On ListRow now, so Memory shares one
          row grammar, one hover, one press, and one moving selection rail with
          every other ledger in the app. `lines={2}` because a memory whose whole
          content is its title cannot be read at one line. */}
      <Item kind="action"
        title={record.content}
        description={
          <>
            {provenanceLabel(record.provenance)}
            <span aria-hidden="true"> · </span>
            {dateLabel(record.updatedAt)}
          </>
        }
        leading={<Brain size={16} />}
        trailing={record.status === "expired" ? <Badge>Expired</Badge> : undefined}
        selected={selected}
        onAction={onSelect}
        lines={2}
        rowProps={rowProps}
      />
    </motion.li>
  );
}

function CreateStrip({
  onClose,
  onSettled,
}: {
  onClose: (restoreTriggerFocus: boolean) => void;
  onSettled: (record: SelectedRecord) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const firstField = useRef<HTMLTextAreaElement>(null);
  const dirty = Boolean(value.trim());
  const resetDraft = useCallback(() => {
    setValue("");
    setError(undefined);
  }, []);
  const draftGuard = useDirtyDraftGuard({
    id: "brain-memory:create",
    label: "Remember draft",
    dirty,
    onDiscard: () => {
      resetDraft();
      onClose(false);
    },
  });
  const discardAndClose = () => {
    draftGuard.release();
    resetDraft();
    onClose(true);
  };
  useEffect(() => firstField.current?.focus(), []);
  const create = useMutation({
    mutationFn: async () => {
      const outcome = await brainRuntime.createMemory({
        content: value.trim(),
        requestKey: crypto.randomUUID(),
      });
      if (outcome.status !== "settled")
        throw new Error(
          outcome.status === "gone"
              ? "This memory is no longer available."
              : outcome.message,
        );
      return outcome.record;
    },
    onSuccess: (record) => {
      draftGuard.release();
      resetDraft();
      onSettled({ surface: "memory", record });
      onClose(false);
    },
    onError: () =>
      setError("Kora could not save this memory. Your draft is still here."),
  });
  const valid = Boolean(value.trim());
  return (
    <motion.section
      className="brain-create-strip"
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
      aria-label="Remember something"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || create.isPending)
          return;
        event.preventDefault();
        event.stopPropagation();
        discardAndClose();
      }}
    >
      <div className="brain-create-strip__head">
        <div>
          <Brain size={17} />
          <strong>Remember something</strong>
        </div>
        <IconButton label="Close editor" onClick={discardAndClose}><X size={16} /></IconButton>
      </div>
      <div className="brain-create-strip__fields">
        <Field label="Memory content">
          <Textarea
            ref={firstField}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="What should Kora remember?"
            aria-label="Memory content"
            rows={3}
          />
        </Field>
      </div>
      {error && <p className="brain-inline-error" role="alert"><CircleAlert size={14} />{error}</p>}
      <div className="brain-create-strip__actions">
        <Button tone="ghost" onClick={discardAndClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending
            ? <><KoraPresenceMark state="active" />Saving</>
            : "Remember"}
        </Button>
      </div>
    </motion.section>
  );
}

function RecordDetail({
  selected,
  onSettled,
  onDeleted,
  onClose,
  onAskKora,
  focusRef,
}: {
  selected: SelectedRecord;
  onSettled: (record: SelectedRecord) => void;
  onDeleted: () => void;
  onClose: () => void;
  onAskKora?: (reference: ConversationContextReference) => void;
  focusRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const queryClient = useQueryClient();
  const title = "What Kora remembers";
  const initialValue = selected.record.content;
  const displayValue = initialValue;
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWaiting, setDeleteWaiting] = useState<Extract<BrainDeletionOutcome, {
    status: "waiting_confirmation";
  }>>();
  const [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const saveOperation = useOperationIntent<
    MemoryCorrectionPayload,
    { id: string; expectedUpdatedAt: string }
  >();
  const deleteOperation = useOperationIntent<
    Record<string, never>,
    { id: string; expectedUpdatedAt: string }
  >();
  const identity = recordIdentity(selected);
  const history = useQuery({
    queryKey: ["brain", "memory", selected.record.id, "history"],
    queryFn: () => runtime.memoryHistory(selected.record.id),
  });
  const resetEditor = useCallback(() => {
    setValue(selected.record.content);
    setEditing(false);
    setConflict(undefined);
    setError(undefined);
    setConfirmDelete(false);
  }, [identity]);
  const draftDirty = editing && value !== selected.record.content;
  const draftGuard = useDirtyDraftGuard({
    id: `brain-memory:correction:${selected.record.id}`,
    label: "Memory correction draft",
    dirty: draftDirty,
    onDiscard: resetEditor,
  });
  const requestClose = () => {
    if (draftDirty) {
      setError("Save or cancel this correction before returning to Memory.");
      return;
    }
    onClose();
  };
  useEffect(() => {
    setValue(selected.record.content);
    setEditing(false);
    setConflict(undefined);
    setError(undefined);
    setConfirmDelete(false);
    setDeleteWaiting(undefined);
    setDeleteApprovalOpen(false);
    saveOperation.cancel();
    deleteOperation.cancel();
  }, [identity]);

  const save = useMutation({
    mutationKey: ["brain", "memory", "detail-operation"],
    mutationFn: async (intent: ReturnType<typeof saveOperation.capture>) => {
      const outcome = await brainRuntime.correctMemory(intent.concurrency.id, {
        ...intent.payload,
        expectedUpdatedAt: intent.concurrency.expectedUpdatedAt,
        requestKey: intent.requestKey,
      });
      if (outcome.status === "conflict") {
        saveOperation.markTransientFailure();
        const message = outcome.message ?? "This changed elsewhere. Your draft is still here; review the latest value before saving again.";
        throw new RuntimeRequestError(message, { code: "memory_conflict" });
      }
      if (outcome.status === "gone") {
        saveOperation.markGone();
        throw new Error("This memory no longer exists. Your draft is still here.");
      }
      if (outcome.status !== "settled") throw new Error(outcome.message);
      return outcome.record;
    },
    onSuccess: (record) => {
      draftGuard.release();
      saveOperation.settle();
      onSettled({ surface: "memory", record });
      void queryClient.invalidateQueries({
        queryKey: ["brain", "memory", selected.record.id, "history"],
      });
      setEditing(false);
      setConflict(undefined);
    },
    onError: (reason) => {
      if (
        reason instanceof RuntimeRequestError &&
        reason.code.includes("conflict")
      )
        setConflict(reason.message);
      else
        setError("Kora could not save this correction. Your draft is still here.");
    },
  });

  const requestSave = () => {
    setError(undefined);
    const payload: MemoryCorrectionPayload = {
      content: value.trim(),
    };
    save.mutate(saveOperation.capture(payload, {
      id: selected.record.id,
      expectedUpdatedAt: selected.record.updatedAt,
    }));
  };
  const deletion = useMutation({
    mutationKey: ["brain", "memory", "detail-operation"],
    mutationFn: async (intent: ReturnType<typeof deleteOperation.capture>) => {
      const result = await brainRuntime.deleteBrainRecord(
        "memory",
        intent.concurrency.id,
        {
          requestKey: intent.requestKey,
          expectedUpdatedAt: intent.concurrency.expectedUpdatedAt,
        },
      );
      if (result.status === "waiting_confirmation") {
        deleteOperation.markWaitingForConfirmation();
        setDeleteWaiting(result);
        setDeleteApprovalOpen(true);
        return result;
      }
      if (result.status === "conflict") throw new Error("This record changed before it could be deleted.");
      if (result.status === "rejected" || result.status === "expired" || result.status === "uncertain")
        throw new Error("Kora did not confirm deletion. This memory remains unchanged.");
      return result;
    },
    onSuccess: (result) => {
      if (result.status === "waiting_confirmation") return;
      deleteOperation.settle();
      setDeleteWaiting(undefined);
      setDeleteApprovalOpen(false);
      onDeleted();
    },
    onError: (reason) => {
      deleteOperation.markTransientFailure();
      setError(
        reason instanceof Error && reason.message === "This record changed before it could be deleted."
          ? reason.message
          : "Kora could not delete this memory. It remains unchanged.",
      );
    },
  });
  const requestDeletion = () => {
    setError(undefined);
    deletion.mutate(deleteOperation.capture({}, {
      id: selected.record.id,
      expectedUpdatedAt: selected.record.updatedAt,
    }));
  };
  const reference: ConversationContextReference = {
    kind: "memory",
    id: selected.record.id,
    title: selected.record.content.slice(0, 80),
  };
  return (
    <>
    <motion.article
      key={identity}
      className="brain-record-detail"
      {...detailFromRow()}
    >
      <header>
        <div className="brain-detail-mark">
          <Brain size={19} />
          <motion.span
            initial={{ opacity: 0, scale: 0.72, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
          />
        </div>
        <div>
          <span>{provenanceLabel(selected.record.provenance)}</span>
          <h2 ref={focusRef} tabIndex={-1}>{title}</h2>
        </div>
        <IconButton
          className="brain-detail-close"
          label="Back to Memory"
          onClick={requestClose}
        >
          <ArrowLeft size={16} />
        </IconButton>
        {!editing && <Button tone="secondary" onClick={() => setEditing(true)}>Edit</Button>}
      </header>

      <div className="brain-detail-body">
        {editing ? (
          <motion.div
            className="brain-record-editor"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Textarea
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={6}
              aria-label="Correct memory"
            />
            {conflict && (
              <div className="brain-conflict" role="alert">
                <CircleAlert size={16} />
                <div>
                  <strong>Keep this draft open.</strong>
                  <p>{conflict}</p>
                </div>
              </div>
            )}
            <div className="brain-record-editor__actions">
              <Button tone="ghost" onClick={() => {
                draftGuard.release();
                resetEditor();
              }}>Cancel</Button>
              <Button
                tone="primary"
                disabled={!value.trim() || save.isPending}
                onClick={() => {
                  setError(undefined);
                  requestSave();
                }}
              >
                {save.isPending
                  ? <><KoraPresenceMark state="active" />Saving</>
                  : <><Check size={15} />Save correction</>}
              </Button>
            </div>
          </motion.div>
        ) : (
          <p className="brain-record-value">{displayValue}</p>
        )}

        {error && <p className="brain-inline-error" role="alert"><CircleAlert size={14} />{error}</p>}

        <div className="brain-detail-actions">
          {onAskKora && (
            <Button tone="ghost" onClick={() => onAskKora(reference)}>
              <Sparkles size={15} />Ask Kora about this
            </Button>
          )}
          <Button tone="link" className="brain-delete-trigger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />Forget
          </Button>
        </div>

        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              className="brain-delete-confirmation"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div>
                <strong>Forget this memory?</strong>
                <p>Kora will erase this learned memory and its revision content. Its source conversation is separate and remains under conversation retention.</p>
              </div>
              <Button tone="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button
                tone="danger"
                disabled={deletion.isPending}
                onClick={requestDeletion}
              >
                {deletion.isPending ? "Forgetting…" : "Forget exactly this"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <Disclosure
          className="brain-record-context"
          summary="Record details"
          description="Origin, recall, and revision history"
          meta={provenanceLabel(selected.record.provenance)}
          icon={<Clock3 size={16} />}
        >
          <dl className="brain-provenance">
            <div>
              <dt>Origin</dt>
              <dd>
                {provenanceLabel(selected.record.provenance)}
                {selected.record.sourceSessionId && (
                  <> · <Link to={`/kora?session=${encodeURIComponent(selected.record.sourceSessionId)}`}>Open conversation</Link></>
                )}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd><Clock3 size={13} />{dateLabel(selected.record.updatedAt)}</dd>
            </div>
            {selected.record.expirationDate && (
              <div>
                <dt>Expiration</dt>
                <dd>{dateLabel(selected.record.expirationDate)}</dd>
              </div>
            )}
            <div>
              <dt>Recall</dt>
              <dd>{selected.record.status === "expired"
                  ? "Expired · excluded from ordinary recall"
                  : "Available to Kora when relevant"}</dd>
            </div>
          </dl>

          <MemoryHistory history={history.data?.revisions} pending={history.isPending} failed={history.isError} />
        </Disclosure>
      </div>
    </motion.article>
    <ExactOperationConfirmation
      open={deleteApprovalOpen}
      confirmationIds={deleteWaiting?.confirmations.map(({ confirmationId }) => confirmationId) ?? []}
      title="Forget this memory?"
      description={deleteWaiting?.consequence ?? "Nothing is removed until each exact approval is accepted."}
      approveLabel="Forget exactly this"
      approveTone="danger"
      onOpenChange={setDeleteApprovalOpen}
      onApproved={async () => {
        const intent = deleteOperation.retry();
        if (!intent) throw new Error("The exact deletion intent is no longer available.");
        await deletion.mutateAsync(intent);
      }}
      onRejected={() => {
        deleteOperation.cancel();
        setDeleteWaiting(undefined);
        setConfirmDelete(false);
        setError("Deletion was not approved. This memory is unchanged.");
      }}
    />
    </>
  );
}

function MemoryHistory({
  history,
  pending,
  failed,
}: {
  history?: MemoryRevision[];
  pending: boolean;
  failed: boolean;
}) {
  return (
    <section className="brain-memory-history" aria-labelledby="memory-history-title">
      <div>
        <h3 id="memory-history-title">History</h3>
        <p>How this learned memory changed over time.</p>
      </div>
      {pending ? (
        <p role="status">Loading history…</p>
      ) : failed ? (
        <p role="alert">History is unavailable right now.</p>
      ) : history?.length ? (
        <ol>
          {history.map((revision, index) => (
            <li key={`${revision.occurredAt}-${index}`}>
              <div>
                <strong>{revision.action === "remembered" ? "Remembered" : "Corrected"}</strong>
                <time dateTime={revision.occurredAt}>{dateLabel(revision.occurredAt)}</time>
              </div>
              {revision.previousContent && <del>{revision.previousContent}</del>}
              <p>{revision.content}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>No revision history yet.</p>
      )}
    </section>
  );
}

const pipelineStateCopy = (health: MemoryPipelineHealth) => {
  const { processing } = health;
  if (processing.state === "never_run")
    return "No learning activity has been recorded yet.";
  if (processing.state === "processing") {
    const count = processing.pending + processing.processing;
    return `${count} learning ${count === 1 ? "run is" : "runs are"} in progress.`;
  }
  if (processing.state === "attention") {
    if (processing.failed > 0)
      return `${processing.failed} learning ${processing.failed === 1 ? "run needs" : "runs need"} attention.`;
    return "A learning run has been waiting for more than five minutes.";
  }
  return "Recent learning activity is settled.";
};

const pipelineStateLabel: Record<MemoryPipelineHealth["processing"]["state"], string> = {
  never_run: "No activity yet",
  idle: "Idle",
  processing: "In progress",
  attention: "Needs attention",
};

const recentStateLabel: Record<MemoryPipelineHealth["recent"][number]["state"], string> = {
  processing: "Processing",
  empty: "No durable memory found",
  completed: "Saved",
  retryable_failure: "Will retry",
  skipped: "Skipped",
};

const failureRecovery: Record<NonNullable<MemoryPipelineHealth["recent"][number]["failureCategory"]>, string> = {
  credentials: "Check model credentials in Settings. This conversation was not replayed from here.",
  embedding_runtime: "Check local learning availability. A future conversation can make a new attempt.",
  provider: "Check model access. A future conversation can make a new attempt.",
  storage: "Restart Kora and check local activity before relying on automatic learning.",
  unknown: "This conversation cannot be safely reconstructed here. A future conversation can make a new attempt.",
};

const failureRecoveryCopy = (item: MemoryPipelineHealth["recent"][number]) => {
  if (!item.failureCategory) return undefined;
  const next = failureRecovery[item.failureCategory];
  return item.state === "retryable_failure"
    ? `Kora will retry this conversation after restart. ${next}`
    : next;
};

function pipelineDateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MemoryPipelineHealthPanel() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string>();
  const health = useQuery({
    queryKey: ["brain", "memory", "pipeline-health"],
    queryFn: () => brainRuntime.memoryPipelineHealth(),
    retry: false,
  });
  const update = useMutation({
    mutationFn: (input: {
      enabled: boolean;
      expectedUpdatedAt: string;
      requestKey: string;
    }) => brainRuntime.updateMemorySettings(input),
    onMutate: () => setMutationError(undefined),
    onSuccess: (settings) => {
      queryClient.setQueryData<MemoryPipelineHealth>(
        ["brain", "memory", "pipeline-health"],
        (current) => current ? {
          ...current,
          automaticLearning: {
            enabled: settings.enabled,
            updatedAt: settings.updatedAt,
          },
        } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["brain", "memory"] });
    },
    onError: (reason, input) => {
      setMutationError(
        reason instanceof RuntimeRequestError && reason.code === "conflict"
          ? "Memory learning controls changed elsewhere. Reloaded the current settings; choose again if needed."
          : "Kora could not change automatic learning. The current setting is unchanged.",
      );
      void queryClient.invalidateQueries({
        queryKey: ["brain", "memory", "pipeline-health"],
      });
    },
  });

  if (health.isPending)
    return <StateView state="loading" title="Loading Memory activity" body="Checking recorded Memory activity." className="memory-health memory-health--loading" />;

  if (health.isError || !health.data)
    return <StateView state="unavailable" title="Memory activity is unavailable" body="This does not change explicit Remember." action={<Button tone="ghost" onClick={() => void health.refetch()}>Try again</Button>} className="memory-health memory-health--unavailable" />;

  const data = health.data;
  const recent = data.recent.slice(0, 6);
  return <Disclosure
    className="memory-health"
    panelClassName="memory-health__panel"
    trigger={<Button tone="ghost" className="memory-health__trigger" aria-label="Memory learning activity">
      <span className="memory-health__presence" data-state={data.processing.state}><Activity size={15} /></span>
      <span><strong>Automatic learning {data.automaticLearning.enabled ? "on" : "off"}</strong><small>{pipelineStateLabel[data.processing.state]}</small></span>
      <ChevronDown className="memory-health__chevron" size={15} aria-hidden="true" />
    </Button>}
  >
    <div className="memory-health__settings" aria-busy={update.isPending || undefined}>
      <div className="memory-health__setting">
        <div>
          <strong>Learn from future conversations</strong>
          <small>{data.automaticLearning.enabled
            ? "Kora may extract durable facts after completed conversations."
            : "Automatic learning is paused. Explicit Remember still works."}</small>
        </div>
        <Switch
          checked={data.automaticLearning.enabled}
          disabled={update.isPending}
          label="Learn from future conversations"
          onCheckedChange={(enabled) => update.mutate({
            enabled,
            expectedUpdatedAt: data.automaticLearning.updatedAt,
            requestKey: crypto.randomUUID(),
          })}
        />
      </div>
      <p className="memory-health__processing-copy">
        When learning runs, Kora sends the conversation text from that turn to your selected model for extraction. Embeddings and saved memories stay on this device. Turning automatic learning off does not remove memories already saved.
      </p>
    </div>
    {mutationError && <p className="memory-health__error" role="alert">{mutationError}</p>}

    <div className="memory-health__summary" role="status">
      <strong>{pipelineStateCopy(data)}</strong>
      <small>Recorded activity only; it does not confirm current connection health.</small>
    </div>

    <div className="memory-health__boundary" aria-label="How automatic learning works">
      <span><Cloud size={14} /><strong>Model</strong><small>Selected Kora model</small></span>
      <span><Cpu size={14} /><strong>Learning</strong><small>Embeddings created on this device</small></span>
      <span><Database size={14} /><strong>Memory</strong><small>Saved on this device</small></span>
    </div>

    <div className="memory-health__recent memory-health__recent--attempts">
      <div className="memory-health__recent-title"><strong>Recent learning activity</strong>{data.processing.lastSuccessAt && <small>Last settled {pipelineDateLabel(data.processing.lastSuccessAt)}</small>}</div>
      {recent.length === 0
        ? <p>No learning activity yet. Kora may learn after a completed conversation when automatic learning is on and the turn contains durable personal context.</p>
        : <ol>{recent.map((item, index) => <li key={`${item.updatedAt}:${index}`} data-state={item.state}>
          <span className="memory-health__event-mark" aria-hidden="true" />
          <span><strong>{recentStateLabel[item.state]}</strong><small>{item.attempts} {item.attempts === 1 ? "attempt" : "attempts"}{item.state === "completed" ? ` · ${item.acceptedCount} accepted` : ""}</small>{failureRecoveryCopy(item) && <em>{failureRecoveryCopy(item)}</em>}</span>
          <time dateTime={item.updatedAt}>{pipelineDateLabel(item.updatedAt)}</time>
        </li>)}</ol>}
    </div>
    <div className="memory-health__recent memory-health__recent--deletions">
      <div className="memory-health__recent-title"><strong>Recent permanent deletions</strong><small>Receipts are kept for 30 days</small></div>
      {data.deletionReceipts.length === 0
        ? <p>No permanent Memory deletions recorded in the last 30 days.</p>
        : <ol>{data.deletionReceipts.map((receipt, index) => <li key={`${receipt.occurredAt}:${index}`} data-state="completed">
          <span className="memory-health__event-mark" aria-hidden="true" />
          <span><strong>Memory permanently forgotten</strong><small>The Memory and reconstructable history were removed.</small></span>
          <time dateTime={receipt.occurredAt}>{pipelineDateLabel(receipt.occurredAt)}</time>
        </li>)}</ol>}
    </div>
  </Disclosure>;
}

export function MemoryWorkspace({
  onAskKora,
}: {
  onAskKora?: (reference: ConversationContextReference) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const route = useParams<{ memoryId?: string }>();
  const selectedId = route.memoryId;
  const returnSnapshot = useMemo(
    () => readMemoryReturn(location.state),
    [location.state],
  );
  const [query, setQuery] = useState(() => returnSnapshot?.query ?? "");
  const deferredQuery = useDeferredValue(query.trim());
  const searchHandle = useMemo(() => crypto.randomUUID(), [deferredQuery]);
  const [createOpen, setCreateOpen] = useState(false);
  const rememberTriggerRef = useRef<HTMLButtonElement>(null);
  const [settled, setSettled] = useState<SelectedRecord>();
  const [notice, setNotice] = useState<string>();
  const [detailState, setDetailState] = useState<MemoryDetailState>(() =>
    selectedId ? { state: "loading" } : { state: "idle" },
  );
  const [deepReadAttempt, setDeepReadAttempt] = useState(0);
  const detailReadRevision = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const compact = useCompactMemoryPane();
  const [compactPane, setCompactPane] = useState<"directory" | "detail">(
    selectedId ? "detail" : "directory",
  );
  const ledgerRef = useRef<HTMLElement>(null);
  const ledgerScrollTop = useRef(0);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const originatingRowId = useRef<string | undefined>(undefined);
  const restoreDirectoryFocus = useRef(false);
  const restoredReturn = useRef(false);
  const detailFocusRef = useRef<HTMLHeadingElement>(null);
  const detailStateFocusRef = useRef<HTMLDivElement>(null);

  const closeCreate = useCallback((restoreTriggerFocus: boolean) => {
    setCreateOpen(false);
    if (restoreTriggerFocus)
      queueMicrotask(() => rememberTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    setSettled((current) => current?.record.id === selectedId ? current : undefined);
    setDetailState(selectedId ? { state: "loading" } : { state: "idle" });
  }, [selectedId]);

  const collection = useInfiniteQuery<
    BrainCollectionPage<BrainMemoryRecord>,
    Error,
    InfiniteData<BrainCollectionPage<BrainMemoryRecord>, string | undefined>,
    string[],
    string | undefined
  >({
    queryKey: ["brain", "memory", "search", searchHandle],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      brainRuntime.memoryPage({
        query: deferredQuery || undefined,
        limit: 50,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const records = useMemo(
    () => collection.data?.pages.flatMap((page) => page.items) ?? [],
    [collection.data],
  );
  const collectionComplete = collection.data?.pages.length
    ? collection.data.pages.at(-1)?.complete === true && !collection.hasNextPage
    : true;
  const selectedFromCollection: SelectedRecord | undefined = (() => {
    if (!selectedId) return undefined;
    const record = records.find(({ id }) => id === selectedId);
    return record ? { surface: "memory", record } : undefined;
  })();
  const deepSelected = detailState.state === "ready" ? detailState.record : undefined;
  const activeSelected = settled ?? selectedFromCollection ?? deepSelected;

  useEffect(() => {
    if (
      !selectedId
      || selectedFromCollection
      || settled
      || detailState.state !== "loading"
    ) return;
    const revision = ++detailReadRevision.current;
    setDetailState({ state: "loading" });
    void brainRuntime.brainRecord("memory", selectedId).then(
      ({ record }) => {
        if (detailReadRevision.current !== revision) return;
        setDetailState({ state: "ready", record: { surface: "memory", record } });
      },
      (reason: unknown) => {
        if (detailReadRevision.current !== revision) return;
        setDetailState(
          isGoneReadError(reason)
              ? { state: "gone" }
              : isUnavailableReadError(reason)
                ? { state: "unavailable" }
                : { state: "error" },
        );
      },
    );
    return () => { detailReadRevision.current += 1; };
  }, [deepReadAttempt, detailState.state, selectedId, selectedFromCollection, settled]);

  const retryDeepRead = () => {
    setDetailState({ state: "loading" });
    setDeepReadAttempt((value) => value + 1);
  };

  useEffect(() => () => {
    detailReadRevision.current += 1;
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(undefined), 2200);
  }, []);

  const directorySnapshot = (memoryId?: string): MemoryDirectorySnapshot => ({
    version: 1,
    ...(memoryId ? { memoryId } : {}),
    query,
    scrollTop: ledgerRef.current?.scrollTop ?? ledgerScrollTop.current,
  });
  const navigateToMemory = (memoryId: string, snapshot: MemoryDirectorySnapshot, replace = false) => {
    navigate({
      pathname: `/brain/memory/${encodeURIComponent(memoryId)}`,
      search: location.search,
    }, {
      replace,
      state: memoryRouteState(location.state, snapshot),
    });
  };
  const chooseRecord = (record: SelectedRecord) => {
    ledgerScrollTop.current = ledgerRef.current?.scrollTop ?? 0;
    originatingRowId.current = record.record.id;
    setDetailState({ state: "idle" });
    setSettled(record);
    navigateToMemory(record.record.id, directorySnapshot(record.record.id));
    setCompactPane("detail");
  };
  const settle = (record: SelectedRecord) => {
    setSettled(record);
    setDetailState({ state: "idle" });
    navigateToMemory(record.record.id, directorySnapshot(record.record.id), true);
    setCompactPane("detail");
    void queryClient.invalidateQueries({ queryKey: ["brain", "memory"] });
    showNotice("Memory saved.");
  };
  const deleted = () => {
    const snapshot = returnSnapshot ?? directorySnapshot(selectedId ?? originatingRowId.current);
    setSettled(undefined);
    setDetailState({ state: "idle" });
    navigate(memoryDirectoryPath(location.search), {
      replace: true,
      state: memoryRouteState(location.state, snapshot),
    });
    restoreDirectoryFocus.current = true;
    setCompactPane("directory");
    void queryClient.invalidateQueries({ queryKey: ["brain", "memory"] });
    showNotice("Removed from Brain.");
  };
  const closeDetail = () => {
    detailReadRevision.current += 1;
    const snapshot = returnSnapshot ?? directorySnapshot(selectedId ?? originatingRowId.current);
    setSettled(undefined);
    setDetailState({ state: "idle" });
    navigate(memoryDirectoryPath(location.search), {
      state: memoryRouteState(location.state, snapshot),
    });
    restoreDirectoryFocus.current = true;
    setCompactPane("directory");
  };

  useLayoutEffect(() => {
    if (compact && compactPane === "detail") {
      (activeSelected ? detailFocusRef.current : detailStateFocusRef.current)?.focus();
      return;
    }
    if (!restoreDirectoryFocus.current || returnSnapshot) return;
    restoreDirectoryFocus.current = false;
    if (ledgerRef.current) ledgerRef.current.scrollTop = ledgerScrollTop.current;
    const id = originatingRowId.current;
    const returnTarget = id
      ? rowRefs.current.get(id)
      : ledgerRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
    returnTarget?.focus();
  }, [activeSelected, compact, compactPane, detailState.state, returnSnapshot]);

  useLayoutEffect(() => {
    if (selectedId || !returnSnapshot || restoredReturn.current || collection.isPending || collection.isFetching) return;
    if (!collection.data && !collection.isError) return;
    const directory = ledgerRef.current;
    if (!directory) return;

    let frame: number | undefined;
    let attempts = 0;
    const restore = () => {
      if (selectedId || restoredReturn.current) return;
      const row = returnSnapshot.memoryId
        ? [...directory.querySelectorAll<HTMLElement>("[data-memory-id]")]
          .find((candidate) => candidate.dataset.memoryId === returnSnapshot.memoryId)
          ?.querySelector<HTMLElement>("a,button")
        : undefined;
      const target = row ?? (attempts >= 3
        ? directory.querySelector<HTMLInputElement>('input[type="search"]')
        : undefined);
      if (target) {
        directory.scrollTop = returnSnapshot.scrollTop;
        target.focus({ preventScroll: true });
        restoredReturn.current = true;
        const nextState = isRecord(location.state) ? { ...location.state } : {};
        delete nextState.memoryReturn;
        navigate(memoryDirectoryPath(location.search), {
          replace: true,
          state: Object.keys(nextState).length ? nextState : undefined,
        });
        return;
      }
      if (attempts < 3) {
        attempts += 1;
        frame = window.requestAnimationFrame(restore);
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [collection.data, collection.isError, collection.isFetching, collection.isPending, location, navigate, returnSnapshot, selectedId]);

  useEffect(() => {
    if (!compact) return;
    setCompactPane(activeSelected || selectedId ? "detail" : "directory");
  }, [activeSelected, compact, selectedId]);

  /* Contributes to the shell's single view bar rather than rendering a band.
     What this replaces: a 94px banner with an <h1> and the subhead "What Kora has
     learned from your conversations and corrections", then briefly a 40px pane
     toolbar whose title duplicated the sidebar entry directly above it. The
     learning state was the only load-bearing content and survives as meta. */
  useViewBar(() => ({
    title: "Memory",
    actions: (
      <Button ref={rememberTriggerRef} tone="primary" onClick={() => setCreateOpen(true)}>
        <Plus size={15} />
        Remember
      </Button>
    ),
  }), []);

  // Roving focus, Arrow Up/Down, Home/End, PageUp/Down, Enter, Escape.
  // Enter is handled by ListRow's own button, so no onActivate is passed —
  // arrowing moves focus only and never opens a record in passing.
  const ledger = useLedgerKeyboard({
    count: records.length,
    onEscape: () => {
      if (activeSelected) closeDetail();
    },
  });
  const ledgerRowProps = (index: number, id: string): LedgerRowProps => {
    const base = ledger.rowProps(index);
    return {
      ...base,
      ref: (node) => {
        base.ref(node);
        if (node) rowRefs.current.set(id, node);
        else rowRefs.current.delete(id);
      },
    };
  };

  return (
    <div className="memory-workspace">
      <AnimatePresence initial={false}>
        {createOpen && (
          <CreateStrip
            onClose={closeCreate}
            onSettled={settle}
          />
        )}
      </AnimatePresence>

      <MemoryPipelineHealthPanel />

      <div
        className="memory-workspace__canvas"
        data-compact-pane={compactPane}
        data-empty={!selectedId && records.length === 0 ? "true" : undefined}
      >
        <section
          ref={ledgerRef}
          className="brain-ledger"
          aria-label="Learned memories"
          aria-hidden={compact && compactPane === "detail" ? true : undefined}
          hidden={compact && compactPane === "detail"}
          inert={compact && compactPane === "detail" ? true : undefined}
          {...ledger.ledgerProps}
        >
          <div className="brain-ledger-search">
            <SearchField
              value={query}
              onValueChange={setQuery}
              label="Search memories"
              placeholder="Search memories"
              className="memory-search"
            />
            {collection.isFetching && !collection.isFetchingNextPage && (
              <KoraPresenceMark state="gathering" />
            )}
          </div>

          {collection.isPending ? (
            <StateView
              state="loading"
              title="Gathering Memory"
              className="brain-ledger-state"
            />
          ) : collection.isError && records.length === 0 ? (
            <ContentState
              state={isUnavailableReadError(collection.error) ? "unavailable" : "error"}
              title="Memory could not be gathered"
              body={isUnavailableReadError(collection.error)
                ? "The Memory collection is temporarily unavailable. Nothing was changed."
                : "Kora could not read the current Memory collection. Nothing was changed."}
              action={<Button tone="secondary" onClick={() => void collection.refetch()}>Try again</Button>}
              size="page"
              headingLevel={2}
              className="brain-ledger-state"
            />
          ) : records.length === 0 ? (
            <ContentState
              state={deferredQuery ? "filtered-empty" : "empty"}
              icon={<Brain size={22} />}
              title={deferredQuery ? "Nothing matches that search" : "No memories in this view"}
              body={deferredQuery
                ? "Try another phrase or clear the search."
                : "Use Remember when there is something you want Kora to keep."}
              action={deferredQuery
                ? <Button tone="ghost" onClick={() => setQuery("")}>Clear search</Button>
                : <Button tone="secondary" onClick={() => setCreateOpen(true)}>Remember something</Button>}
              size="page"
              headingLevel={2}
              className="brain-ledger-state"
            />
          ) : (
            <>
              <motion.ul layout className="brain-ledger-list">
                <AnimatePresence initial={false}>
                  {records.map((record, index) => (
                    <MemoryRow
                      key={record.id}
                      record={record}
                      selected={activeSelected?.record.id === record.id}
                      onSelect={() => chooseRecord({ surface: "memory", record })}
                      rowProps={ledgerRowProps(index, record.id)}
                    />
                  ))}
                </AnimatePresence>
              </motion.ul>
              {(collection.isError || (!collection.hasNextPage && !collectionComplete)) && (
                <StateView
                  state="partial"
                  title="Some memories remain visible"
                  body="Kora could not confirm that this collection is complete. The loaded memories were preserved."
                  action={<Button tone="ghost" onClick={() => void collection.refetch()}>Try again</Button>}
                  className="memory-collection-state"
                />
              )}
              {collection.hasNextPage && (
                <Button
                  tone="ghost"
                  className="brain-load-more"
                  disabled={collection.isFetchingNextPage}
                  onClick={() => void collection.fetchNextPage()}
                >
                  {collection.isFetchingNextPage ? "Gathering more…" : "Show more"}
                </Button>
              )}
            </>
          )}
        </section>

        <section
          className="brain-detail-region"
          aria-label="Selected Brain record"
          aria-hidden={compact && compactPane === "directory" ? true : undefined}
          hidden={compact && compactPane === "directory"}
          inert={compact && compactPane === "directory" ? true : undefined}
        >
          <AnimatePresence mode="wait">
            {activeSelected ? (
              <RecordDetail
                selected={activeSelected}
                onSettled={settle}
                onDeleted={deleted}
                onClose={closeDetail}
                onAskKora={onAskKora}
                focusRef={detailFocusRef}
              />
            ) : (!selectedId && records.length === 0 ? null : (
              <div ref={detailStateFocusRef} tabIndex={-1} className="brain-detail-state-focus">
                {detailState.state === "loading" ? (
                  <StateView state="loading" title="Opening the selected memory" className="brain-detail-state" />
                ) : detailState.state === "gone" ? (
                  <StateView
                    state="unavailable"
                    title="This memory is no longer available"
                    body="Kora confirmed that the exact record no longer exists."
                    action={<Button onClick={closeDetail}>Back to Memory</Button>}
                    align="center"
                    className="brain-detail-state"
                  />
                ) : detailState.state === "unavailable" ? (
                  <StateView
                    state="unavailable"
                    title="Memory detail is temporarily unavailable"
                    body="The directory remains available. Try this exact read again when Kora reconnects."
                    action={<><Button onClick={retryDeepRead}>Try again</Button><Button tone="ghost" onClick={closeDetail}>Back to Memory</Button></>}
                    align="center"
                    className="brain-detail-state"
                  />
                ) : detailState.state === "error" ? (
                  <StateView
                    state="error"
                    title="Memory could not be opened"
                    body="The exact record was not changed. Return to the directory and try it again."
                    action={<><Button onClick={retryDeepRead}>Try again</Button><Button tone="ghost" onClick={closeDetail}>Back to Memory</Button></>}
                    align="center"
                    className="brain-detail-state"
                  />
                ) : (
                  <div ref={detailStateFocusRef} tabIndex={-1} className="brain-detail-welcome">
                    <span className="brain-detail-welcome__icon" aria-hidden="true"><Brain size={22} /></span>
                    <div>
                      <h2>Choose a memory</h2>
                      <p>Open one to read its current value, origin, and correction history.</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </AnimatePresence>
        </section>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="brain-settle-notice"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5 }}
            role="status"
          >
            <Check size={14} />{notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
