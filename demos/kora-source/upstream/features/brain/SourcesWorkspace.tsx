import { invoke } from "@tauri-apps/api/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  File,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderOpen,
  Link2Off,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useDeferredValue,
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
  DangerZone,
  Field,
  Input,
  KoraSelect,
  KoraPresenceMark,
  Modal,
  SearchField,
  SegmentedControl,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type BrainCursorPage,
  type BrainDeletionOutcome,
  type ConversationContextReference,
  type KnowledgeSource,
  type KnowledgeSourceRetrievalRole,
  type KnowledgeSourceTemporalScope,
  type KnowledgeSourceIngestionFailureCategory,
  type KnowledgeSourceMutationOutcome,
} from "../../lib/runtime";
import "./sources.css";
import { Item, StateView } from "../../components/display";
import { count } from "../../lib/language";
import { useViewBar } from "../../app/ViewBar";
import { useLedgerKeyboard, type LedgerRowProps } from "../../lib/use-ledger-keyboard";
import { DUR, EASE } from "../../lib/motion";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import { useOperationIntent } from "./useOperationIntent";
import { BrainMarkdown } from "./BrainMarkdown";
import {
  ExactOperationConfirmation,
  type ExactOperationConfirmationClient,
} from "./ExactOperationConfirmation";

export type KnowledgeSourceSpan = {
  sourceId: string;
  label: string;
  version: number;
  start: number;
  end: number;
  text: string;
  retrievalRole: KnowledgeSourceRetrievalRole;
  temporalScope: KnowledgeSourceTemporalScope;
  updatedAt: string;
};

export type KnowledgeSourceDeleteOutcome = BrainDeletionOutcome & {
  externalFilePreserved?: boolean;
};

export type SourcesClient = ExactOperationConfirmationClient & {
  knowledgeSourcesPage(input?: {
    query?: string;
    sourceKind?: KnowledgeSource["sourceKind"];
    state?: "active" | "unavailable";
    pageSize?: number;
    cursor?: string;
  }): Promise<BrainCursorPage<KnowledgeSource>>;
  knowledgeSourceWorkspace(id: string): Promise<{ source: KnowledgeSource }>;
  knowledgeSourceSpans(
    id: string,
    input?: { pageSize?: number; cursor?: string },
  ): Promise<{ items: KnowledgeSourceSpan[]; cursor?: string; complete: boolean }>;
  registerKnowledgeSource(input:
    | {
      sourceKind: "file";
      label: string;
      path: string;
      retrievalRole?: KnowledgeSourceRetrievalRole;
      temporalScope?: KnowledgeSourceTemporalScope;
      requestKey?: string;
    }
    | {
      sourceKind: "inline";
      label: string;
      contentMarkdown: string;
      retrievalRole?: KnowledgeSourceRetrievalRole;
      temporalScope?: KnowledgeSourceTemporalScope;
      requestKey?: string;
    }
  ): Promise<KnowledgeSourceMutationOutcome<KnowledgeSource>>;
  updateKnowledgeSource(id: string, input: {
    expectedVersion: number;
    priorContentHash: string;
    label?: string;
    contentMarkdown?: string;
    retrievalRole?: KnowledgeSourceRetrievalRole;
    temporalScope?: KnowledgeSourceTemporalScope;
    requestKey?: string;
  }): Promise<KnowledgeSourceMutationOutcome<KnowledgeSource>>;
  reconcileKnowledgeSource(id: string, input: {
    expectedVersion: number;
    priorContentHash: string;
    requestKey?: string;
  }): Promise<KnowledgeSourceMutationOutcome<KnowledgeSource>>;
  unregisterKnowledgeSource(id: string, input: {
    expectedVersion: number;
    priorContentHash: string;
    requestKey?: string;
  }): Promise<KnowledgeSourceDeleteOutcome>;
};

export type SourceFileSelection = {
  path: string;
  name: string;
};

type SourceFilter = "all" | "file" | "inline" | "attention";
type SourceDraft = {
  label: string;
  contentMarkdown: string;
  retrievalRole: KnowledgeSourceRetrievalRole;
  temporalScope: KnowledgeSourceTemporalScope;
};

type SourceSavePayload = {
  id: string;
  label: string;
  contentMarkdown?: string;
  retrievalRole: KnowledgeSourceRetrievalRole;
  temporalScope: KnowledgeSourceTemporalScope;
};

type SourceMutationConcurrency = {
  expectedVersion: number;
  priorContentHash: string;
};

const sourceClient = runtime as typeof runtime & SourcesClient;
const settleEase = EASE.out;
const SOURCE_WINDOW_SIZE = 64_000;
const MAX_SOURCE_WINDOWS = 40;
const KNOWLEDGE_SOURCE_FILE_EXTENSIONS = [
  "md",
  "markdown",
  "txt",
  "json",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
] as const;
const KNOWLEDGE_SOURCE_FORMAT_COPY =
  "Markdown (.md/.markdown), text (.txt), JSON, PDF, Word (.docx), Excel (.xlsx), or PowerPoint (.pptx)";
const chooseSourceFile = () =>
  invoke<SourceFileSelection | null>("pick_knowledge_source_file", {
    extensions: [...KNOWLEDGE_SOURCE_FILE_EXTENSIONS],
  });

const observedState = (source: KnowledgeSource) =>
  source.observedState ?? (source.state === "unavailable" ? "unavailable" : "current");

const isUnavailableSourceReadError = (reason: unknown) =>
  reason instanceof RuntimeRequestError && (
    reason.code.startsWith("runtime_")
    || reason.code.includes("unavailable")
    || reason.status === 503
  );

const isGoneSourceReadError = (reason: unknown) =>
  reason instanceof RuntimeRequestError && (
    reason.code === "not_found"
    || reason.code.endsWith("_not_found")
    || reason.status === 404
    || reason.status === 410
  );

const sourceDraft = (source: KnowledgeSource, contentMarkdown = ""): SourceDraft => ({
  label: source.label,
  contentMarkdown,
  retrievalRole: source.retrievalRole,
  temporalScope: source.temporalScope,
});

const retrievalRoleOptions = [
  { value: "default", label: "Core reference", description: "Prefer for broad questions about you and your life." },
  { value: "task_relevant", label: "Relevant reference", description: "Use when its subject matches the task." },
  { value: "deep_research", label: "Deep research", description: "Use for detailed investigation and analysis." },
  { value: "evidence_only", label: "Supporting evidence", description: "Keep searchable without treating it as primary personal truth." },
];
const temporalScopeOptions = [
  { value: "current", label: "Current", description: "Primarily describes your present situation." },
  { value: "mixed", label: "Current and historical", description: "Contains both present and past information." },
  { value: "historical", label: "Historical", description: "Primarily describes earlier events or prior states." },
  { value: "unknown", label: "Unspecified", description: "No reliable time scope has been assigned." },
];

const safeFileName = (pathLabel?: string) =>
  pathLabel?.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? "Document on this computer";

const sourceFormatLabel = (pathLabel?: string) => {
  const extension = safeFileName(pathLabel).split(".").at(-1)?.toLowerCase();
  if (extension === "md" || extension === "markdown") return "Markdown";
  if (extension === "txt") return "Plain text";
  if (extension === "json") return "JSON";
  if (extension === "pdf") return "PDF text";
  if (extension === "docx") return "Word document";
  if (extension === "xlsx") return "Excel workbook";
  if (extension === "pptx") return "PowerPoint presentation";
  return "Document";
};

const sourceProjectionCopy = (pathLabel?: string) => {
  const extension = safeFileName(pathLabel).split(".").at(-1)?.toLowerCase();
  if (extension === "pdf") return "Kora indexes extracted page text and preserves page boundaries. Image-only pages are not treated as searched text.";
  if (extension === "docx") return "Kora indexes main-body paragraphs and tables. Headers and footers are not included.";
  if (extension === "xlsx") return "Kora indexes sheets in order with sheet names, used cell addresses, values, formula text, and cached results when present. Kora never recalculates formulas.";
  if (extension === "pptx") return "Kora indexes slide text and tables in slide order. Speaker notes are not included.";
  if (extension === "json") return "Kora indexes a bounded deterministic text projection of this JSON document.";
  return "Kora indexes a bounded text projection while the original document remains canonical on this computer.";
};

function useCompactSourcesPane() {
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

type SourceMutationAction = "add" | "save" | "refresh";

const ingestionFailureCopy: Record<
  KnowledgeSourceIngestionFailureCategory,
  { reason: string; recovery: string }
> = {
  unsupported_format: {
    reason: "Kora doesn't support this document format.",
    recovery: "Use Markdown, text, JSON, PDF, DOCX, XLSX, or PPTX.",
  },
  invalid_signature: {
    reason: "This file's contents don't match its document type.",
    recovery: "Check its extension or export a fresh copy.",
  },
  malformed_document: {
    reason: "Kora couldn't read this document safely. It may be damaged.",
    recovery: "Export a fresh copy or paste the text instead.",
  },
  encrypted_document: {
    reason: "This document is encrypted or password-protected, so Kora did not index this version.",
    recovery: "Save an unencrypted copy before trying again.",
  },
  image_only_pdf: {
    reason: "This PDF has no extractable text. Kora did not index its images or treat them as searched knowledge.",
    recovery: "Add a text-searchable PDF or paste its text instead.",
  },
  source_too_large: {
    reason: "This document is larger than Kora's source limit.",
    recovery: "Use a smaller document.",
  },
  extracted_text_too_large: {
    reason: "This document produced more searchable text than Kora's source limit.",
    recovery: "Split it into smaller documents.",
  },
  processing_limit_exceeded: {
    reason: "Kora stopped processing this document before it could exceed a safe work limit.",
    recovery: "Split it into smaller documents, then add the smaller files separately.",
  },
  source_changed: {
    reason: "This document changed while Kora was reading it.",
    recovery: "Wait for changes to finish, then try again.",
  },
  unavailable: {
    reason: "This document became unavailable before Kora could finish.",
    recovery: "Make it available on this computer, then try again.",
  },
};

const mutationFallback: Record<SourceMutationAction, string> = {
  add: "Kora couldn't add this source. Nothing was added, and this draft is still here.",
  save: "Kora couldn't save this source. Nothing changed, and your draft is still here.",
  refresh: "Kora couldn't refresh this document. The registered source was left unchanged.",
};

const ingestionFailureMessage = (
  category: KnowledgeSourceIngestionFailureCategory,
  action: SourceMutationAction,
) => {
  const copy = ingestionFailureCopy[category];
  const preserved = action === "add"
    ? "Nothing was added, and this draft is still here."
    : action === "save"
      ? "Nothing changed, and your draft is still here."
      : "The registered source was left unchanged.";
  return `${copy.reason} ${preserved} ${copy.recovery}`;
};

const mutationMessage = (
  outcome: Exclude<KnowledgeSourceMutationOutcome<KnowledgeSource>, { status: "settled" }>,
  action: SourceMutationAction,
) => {
  if (outcome.status === "conflict") return "This source changed somewhere else. Its latest version has been reopened.";
  if (outcome.status === "gone") return "This source is no longer registered.";
  if (outcome.status === "ingestion_failure") return ingestionFailureMessage(outcome.category, action);
  return mutationFallback[action];
};

function SourceState({ source }: { source: KnowledgeSource }) {
  const state = observedState(source);
  return (
    <span className={`source-state source-state--${state}`}>
      <span aria-hidden />
      {state === "current" ? "Current" : state === "changed" ? "Changed" : "Unavailable"}
    </span>
  );
}

function SourceRow({
  source,
  current,
  rowProps,
}: {
  source: KnowledgeSource;
  current: boolean;
  rowProps: LedgerRowProps;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const sourceKind = source.sourceKind === "file"
    ? `${sourceFormatLabel(source.pathLabel)} · ${safeFileName(source.pathLabel)}`
    : "Editable inline text";
  return (
    <motion.li layout={reducedMotion ? false : "position"} transition={{ duration: DUR.base, ease: settleEase }}>
      <Item kind="link"
        title={source.label}
        description={
          <>
            <span className="source-row__kind">{sourceKind}</span>
            <span aria-hidden> · </span>
            {new Date(source.updatedAt).toLocaleDateString()}
          </>
        }
        leading={source.sourceKind === "file" ? <File size={16} /> : <FileText size={16} />}
        trailing={<SourceState source={source} />}
        selected={current}
        href={`/brain/sources/${encodeURIComponent(source.id)}`}
        lines={2}
        rowProps={rowProps}
      />
    </motion.li>
  );
}

function SourceCreate({
  client,
  chooseFile,
  onBack,
  focusRef,
}: {
  client: SourcesClient;
  chooseFile: () => Promise<SourceFileSelection | null>;
  onBack: () => void;
  focusRef: RefObject<HTMLHeadingElement | null>;
}) {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<KnowledgeSource["sourceKind"]>();
  const [file, setFile] = useState<SourceFileSelection>();
  const [draft, setDraft] = useState<SourceDraft>({
    label: "",
    contentMarkdown: "",
    retrievalRole: "task_relevant",
    temporalScope: "unknown",
  });
  const [error, setError] = useState<string>();
  const dirty = Boolean(
    kind || file || draft.label || draft.contentMarkdown
  );
  const draftGuard = useDirtyDraftGuard({
    id: "brain-source:new",
    label: "New source draft",
    dirty,
    onDiscard: () => {
      setKind(undefined);
      setFile(undefined);
      setDraft({
        label: "",
        contentMarkdown: "",
        retrievalRole: "task_relevant",
        temporalScope: "unknown",
      });
      setError(undefined);
    },
  });

  const register = useMutation({
    mutationFn: () => {
      if (!draft.label.trim()) throw new Error("Give this source a clear name.");
      if (kind === "file") {
        if (!file) throw new Error("Choose a supported document first.");
        return client.registerKnowledgeSource({
          sourceKind: "file",
          label: draft.label.trim(),
          path: file.path,
          retrievalRole: draft.retrievalRole,
          temporalScope: draft.temporalScope,
        });
      }
      if (kind === "inline") {
        if (!draft.contentMarkdown.trim()) throw new Error("Paste or write some source text first.");
        return client.registerKnowledgeSource({
          sourceKind: "inline",
          label: draft.label.trim(),
          contentMarkdown: draft.contentMarkdown,
          retrievalRole: draft.retrievalRole,
          temporalScope: draft.temporalScope,
        });
      }
      throw new Error("Choose how to add this source.");
    },
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled") {
        setError(mutationMessage(outcome, "add"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["brain", "sources"] });
      draftGuard.release();
      navigate(`/brain/sources/${encodeURIComponent(outcome.record.id)}`, { replace: true });
    },
    onError: () => setError("Kora couldn't add this source. Nothing was added, and this draft is still here."),
  });

  useLayoutEffect(() => {
    focusRef.current?.focus();
  }, [focusRef]);

  const pick = async () => {
    setError(undefined);
    try {
      const selected = await chooseFile();
      if (!selected) return;
      const safeSelection = { ...selected, name: safeFileName(selected.name) };
      setFile(safeSelection);
      setDraft((current) => ({
        ...current,
        label: current.label || safeSelection.name.replace(/\.[^.]+$/i, ""),
      }));
    } catch {
      setError("The file picker could not be opened. Nothing in this draft changed.");
    }
  };

  return (
    <motion.div
      className="source-create"
      initial={{ opacity: 0, x: reducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.base, ease: settleEase }}
    >
      <Button tone="link" className="source-mobile-back" onClick={onBack}>
        <ArrowLeft size={16} /> Sources
      </Button>

      <header className="source-create__head">
        <span>Add to Kora's local knowledge</span>
        <h2 ref={focusRef} tabIndex={-1}>Add knowledge source</h2>
        <p>Choose a document that stays canonical on this computer, or keep editable text directly in Kora.</p>
      </header>

      {!kind ? (
        <div className="source-create__choices">
          <Button tone="ghost" className="source-create__choice" onClick={() => setKind("file")}>
            <FolderOpen size={22} />
            <span><strong>Choose a document</strong><small>{KNOWLEDGE_SOURCE_FORMAT_COPY}. The original stays on your computer.</small></span>
            <ChevronRight size={17} />
          </Button>
          <Button tone="ghost" className="source-create__choice" onClick={() => setKind("inline")}>
            <FilePenLine size={22} />
            <span><strong>Paste text</strong><small>Keep a directly editable Markdown source inside Kora.</small></span>
            <ChevronRight size={17} />
          </Button>
        </div>
      ) : (
        <div className="source-create__form">
          <div className="source-create__mode">
            <Button tone="link" onClick={() => { setKind(undefined); setFile(undefined); }}>
              <ArrowLeft size={15} /> Change type
            </Button>
            <span>{kind === "file" ? <File size={15} /> : <FileText size={15} />}{kind === "file" ? "File" : "Inline text"}</span>
          </div>

          {kind === "file" && (
            <div className="source-file-pick">
              <div role="status" aria-live="polite">
                <span>{file ? "Ready to register" : "No file chosen"}</span>
                <strong>{file?.name ?? "Choose a supported document"}</strong>
                <small>{file ? "Only the file name is shown here. Its path stays private." : KNOWLEDGE_SOURCE_FORMAT_COPY}</small>
              </div>
              <Button onClick={() => void pick()}><FolderOpen size={15} />{file ? "Choose another" : "Choose file"}</Button>
            </div>
          )}

          <Field label="Name" className="source-field">
            <Input
              value={draft.label}
              autoFocus={kind === "inline"}
              maxLength={200}
              placeholder={kind === "file" ? "A useful name for this file" : "A useful name for this text"}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </Field>

          <div className="source-retrieval-fields">
            <Field
              label="How Kora should use it"
              hint="This affects retrieval priority, not who can access the source."
            >
              <KoraSelect
                label="How Kora should use this source"
                value={draft.retrievalRole}
                options={retrievalRoleOptions}
                onValueChange={(value) => setDraft({
                  ...draft,
                  retrievalRole: value as KnowledgeSourceRetrievalRole,
                })}
              />
            </Field>
            <Field
              label="Time scope"
              hint="Helps Kora separate your present situation from history."
            >
              <KoraSelect
                label="Time scope"
                value={draft.temporalScope}
                options={temporalScopeOptions}
                onValueChange={(value) => setDraft({
                  ...draft,
                  temporalScope: value as KnowledgeSourceTemporalScope,
                })}
              />
            </Field>
          </div>

          {kind === "inline" && (
            <Field
              label="Source text"
              hint="Markdown is supported. This text is stored locally in Kora."
              className="source-writing-field"
            >
              <Textarea
                className="source-writing-input"
                aria-label="Source text"
                value={draft.contentMarkdown}
                placeholder="Paste or write the reference material Kora should be able to use…"
                onChange={(event) => setDraft({ ...draft, contentMarkdown: event.target.value })}
              />
            </Field>
          )}

          <div className="source-create__footer">
            <Button
              tone="primary"
              loading={register.isPending}
              disabled={!draft.label.trim() || (kind === "file" ? !file : !draft.contentMarkdown.trim())}
              onClick={() => register.mutate()}
            >
              <FilePlus2 size={15} />Add source
            </Button>
          </div>
          {error && <p className="source-action-error" role="alert"><TriangleAlert size={15} />{error}</p>}
        </div>
      )}
    </motion.div>
  );
}

function SourceDetail({
  sourceId,
  client,
  onAskKora,
  onBack,
  focusRef,
  focusOnReady,
}: {
  sourceId: string;
  client: SourcesClient;
  onAskKora?: (reference: ConversationContextReference) => void;
  onBack: () => void;
  focusRef: RefObject<HTMLHeadingElement | null>;
  focusOnReady: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const queryClient = useQueryClient();
  const routeEditing = location.pathname.endsWith("/edit");
  const [draft, setDraft] = useState<SourceDraft>();
  const [baseline, setBaseline] = useState<SourceDraft>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [loadingFullSource, setLoadingFullSource] = useState(false);
  const [removeConfirmationIds, setRemoveConfirmationIds] = useState<string[]>([]);
  const saveOperation = useOperationIntent<SourceSavePayload, SourceMutationConcurrency>();
  const reconcileOperation = useOperationIntent<{ id: string }, SourceMutationConcurrency>();
  const removeOperation = useOperationIntent<
    { id: string },
    { expectedVersion: number; priorContentHash: string }
  >();

  const detail = useQuery({
    queryKey: ["brain", "source", sourceId],
    queryFn: () => client.knowledgeSourceWorkspace(sourceId),
  });
  const source = detail.data?.source;
  const spans = useInfiniteQuery({
    queryKey: ["brain", "source-spans", sourceId, source?.version],
    enabled: Boolean(source && observedState(source) === "current"),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.knowledgeSourceSpans(sourceId, {
      pageSize: SOURCE_WINDOW_SIZE,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.cursor,
  });
  const allSpans = useMemo(
    () => spans.data?.pages.flatMap((page) => page.items).sort((a, b) => a.start - b.start) ?? [],
    [spans.data],
  );
  const canonicalContent = allSpans.map((span) => span.text).join("");
  const spansComplete = Boolean(spans.data?.pages.at(-1)?.complete && !spans.hasNextPage);

  useLayoutEffect(() => {
    if (focusOnReady && source) focusRef.current?.focus();
  }, [focusOnReady, focusRef, source?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!source || (source.sourceKind === "inline" && !spansComplete)) return;
    const next = sourceDraft(source, source.sourceKind === "inline" ? canonicalContent : "");
    setDraft((current) => {
      const hasLocalDraft = Boolean(current && baseline && (
        current.label !== baseline.label ||
        current.contentMarkdown !== baseline.contentMarkdown ||
        current.retrievalRole !== baseline.retrievalRole ||
        current.temporalScope !== baseline.temporalScope
      ));
      return hasLocalDraft ? current : next;
    });
    setBaseline(next);
    setError(undefined);
  }, [source?.id, source?.version, spansComplete, canonicalContent]);

  const dirty = Boolean(draft && baseline && (
    draft.label !== baseline.label ||
    draft.contentMarkdown !== baseline.contentMarkdown ||
    draft.retrievalRole !== baseline.retrievalRole ||
    draft.temporalScope !== baseline.temporalScope
  ));
  const draftGuard = useDirtyDraftGuard({
    id: `brain-source:${sourceId}`,
    label: "Source draft",
    dirty,
    onDiscard: () => {
      setDraft(baseline);
      setError(undefined);
    },
  });

  const loadFullSourceForEditing = async () => {
    if (!spans.hasNextPage || loadingFullSource) return;
    setLoadingFullSource(true);
    setError(undefined);
    try {
      let result = await spans.fetchNextPage();
      let loadedWindows = 2;
      while (result.hasNextPage && loadedWindows < MAX_SOURCE_WINDOWS) {
        result = await spans.fetchNextPage();
        loadedWindows += 1;
      }
      if (result.hasNextPage) {
        setError("Kora stopped loading this source because its continuation did not finish safely.");
      }
    } catch (reason) {
      setError((reason as Error).message || "Kora could not load the rest of this source.");
    } finally {
      setLoadingFullSource(false);
    }
  };

  const settle = async (record: KnowledgeSource, message: string) => {
    queryClient.setQueryData(["brain", "source", record.id], { source: record });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["brain", "sources"] }),
      queryClient.invalidateQueries({ queryKey: ["brain", "source-spans", record.id] }),
    ]);
    setNotice(message);
  };

  const save = useMutation({
    mutationFn: (intent: NonNullable<typeof saveOperation.intent>) =>
      client.updateKnowledgeSource(intent.payload.id, {
        expectedVersion: intent.concurrency.expectedVersion,
        priorContentHash: intent.concurrency.priorContentHash,
        label: intent.payload.label,
        retrievalRole: intent.payload.retrievalRole,
        temporalScope: intent.payload.temporalScope,
        ...(intent.payload.contentMarkdown !== undefined
          ? { contentMarkdown: intent.payload.contentMarkdown }
          : {}),
        requestKey: intent.requestKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled") {
        if (outcome.status === "conflict") saveOperation.resolveConflict();
        else if (outcome.status === "gone") saveOperation.markGone();
        else saveOperation.cancel();
        setError(mutationMessage(outcome, "save"));
        if (outcome.status === "conflict") {
          queryClient.setQueryData(["brain", "source", sourceId], { source: outcome.current });
          await queryClient.invalidateQueries({ queryKey: ["brain", "source-spans", sourceId] });
        }
        return;
      }
      saveOperation.settle();
      setError(undefined);
      await settle(outcome.record, outcome.replayed ? "Already saved" : "Saved");
      draftGuard.release();
      navigate(`/brain/sources/${encodeURIComponent(sourceId)}`, { replace: true });
    },
    onError: () => {
      saveOperation.markTransientFailure();
      setError("Kora couldn't save this source. Nothing changed, and your draft is still here. Try again.");
    },
  });

  const beginSave = () => {
    if (!source || !draft?.label.trim()) return;
    const payload: SourceSavePayload = {
      id: sourceId,
      label: draft.label.trim(),
      retrievalRole: draft.retrievalRole,
      temporalScope: draft.temporalScope,
      ...(source.sourceKind === "inline" ? { contentMarkdown: draft.contentMarkdown } : {}),
    };
    setError(undefined);
    save.mutate(saveOperation.capture(payload, {
      expectedVersion: source.version,
      priorContentHash: source.contentHash,
    }));
  };

  const reconcile = useMutation({
    mutationFn: (intent: NonNullable<typeof reconcileOperation.intent>) =>
      client.reconcileKnowledgeSource(intent.payload.id, {
        expectedVersion: intent.concurrency.expectedVersion,
        priorContentHash: intent.concurrency.priorContentHash,
        requestKey: intent.requestKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled") {
        if (outcome.status === "conflict") reconcileOperation.resolveConflict();
        else if (outcome.status === "gone") reconcileOperation.markGone();
        else reconcileOperation.cancel();
        setError(mutationMessage(outcome, "refresh"));
        if (outcome.status === "conflict")
          queryClient.setQueryData(["brain", "source", sourceId], { source: outcome.current });
        return;
      }
      reconcileOperation.settle();
      setError(undefined);
      await settle(
        outcome.record,
        observedState(outcome.record) === "unavailable" ? "Marked unavailable" : "Source refreshed",
      );
    },
    onError: () => {
      reconcileOperation.markTransientFailure();
      setError("Kora couldn't refresh this document. The registered source was left unchanged. Try again.");
    },
  });

  const beginReconcile = () => {
    if (!source) return;
    setError(undefined);
    reconcile.mutate(reconcileOperation.capture(
      { id: sourceId },
      { expectedVersion: source.version, priorContentHash: source.contentHash },
    ));
  };

  const remove = useMutation({
    mutationFn: (intent: NonNullable<typeof removeOperation.intent>) =>
      client.unregisterKnowledgeSource(intent.payload.id, {
        expectedVersion: intent.concurrency.expectedVersion,
        priorContentHash: intent.concurrency.priorContentHash,
        requestKey: intent.requestKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.status === "waiting_confirmation") {
        removeOperation.markWaitingForConfirmation();
        setRemoveConfirmationIds(outcome.confirmations.map((item) => item.confirmationId));
        setConfirmRemove(false);
        return;
      }
      if (outcome.status !== "settled" || !outcome.negativeRead) {
        if (outcome.status === "uncertain") removeOperation.markTransientFailure();
        else if (outcome.status === "gone") removeOperation.markGone();
        else if (outcome.status === "conflict") removeOperation.resolveConflict();
        else removeOperation.cancel();
        setError(outcome.status === "gone" ? "This source is already unregistered." : "Kora could not confirm that the source was removed.");
        return;
      }
      removeOperation.settle();
      setRemoveConfirmationIds([]);
      await queryClient.invalidateQueries({ queryKey: ["brain", "sources"] });
      draftGuard.release();
      navigate("/brain/sources", { replace: true });
    },
    onError: () => {
      removeOperation.markTransientFailure();
      setError("Kora couldn't verify that this source was unregistered. It remains listed; try again.");
    },
  });

  if (detail.isLoading || (source?.sourceKind === "inline" && spans.isLoading)) {
    return <StateView className="source-detail-state" state="loading" title="Opening source" />;
  }
  if (detail.isError || !source) {
    const unavailable = detail.isError && isUnavailableSourceReadError(detail.error);
    const gone = detail.isError && isGoneSourceReadError(detail.error);
    return (
      <StateView
        className="source-detail-state"
        state={gone ? "denied" : unavailable ? "unavailable" : "error"}
        title={gone ? "This source is no longer registered" : "This source could not be opened"}
        body={gone
          ? "The directory no longer contains this exact source. Nothing was changed."
          : unavailable
            ? "The source read is temporarily unavailable. Nothing was changed."
            : "Nothing was changed. Try the exact read again."}
        action={<><Button onClick={() => void detail.refetch()}>Try again</Button><Button tone="ghost" onClick={onBack}>Back to Sources</Button></>}
        align="center"
      />
    );
  }

  const state = observedState(source);
  return (
    <motion.div
      className="source-detail"
      key={source.id}
      initial={{ opacity: 0, x: reducedMotion ? 0 : 9 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.base, ease: settleEase }}
    >
      <header className="source-detail__head">
        <Button tone="link" className="source-mobile-back" onClick={onBack}>
          <ArrowLeft size={16} /> Sources
        </Button>
        <div className="source-detail__identity">
          <span>{source.sourceKind === "file" ? <File size={16} /> : <FileText size={16} />}{source.sourceKind === "file" ? "External file" : "Inline source"}</span>
          <h2 ref={focusRef} tabIndex={-1}>{source.label}</h2>
          <SourceState source={source} />
        </div>
        <div className="source-detail__actions">
          <AnimatePresence>
            {notice && (
              <motion.span role="status" aria-live="polite" className="source-settled" initial={{ opacity: 0, y: reducedMotion ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Check size={14} />{notice}
              </motion.span>
            )}
          </AnimatePresence>
          {onAskKora && (
            <Button tone="ghost" onClick={() => onAskKora({ kind: "knowledge_source", id: source.id, title: source.label })}>
              <Sparkles size={15} />Ask Kora
            </Button>
          )}
          {routeEditing ? (
            <>
              <Button tone="ghost" onClick={() => navigate(`/brain/sources/${encodeURIComponent(source.id)}`)}>Cancel</Button>
              <Button
                tone="primary"
                loading={save.isPending}
                disabled={(source.sourceKind === "inline" && !spansComplete) || !dirty || !draft?.label.trim()}
                onClick={beginSave}
              >
                Save
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate(`/brain/sources/${encodeURIComponent(source.id)}/edit`)}>Edit</Button>
          )}
        </div>
      </header>

      {error && <div className="source-action-error" role="alert"><TriangleAlert size={15} />{error}</div>}

      {source.sourceKind === "file" && (
        <motion.section
          className={`source-observation source-observation--${state}`}
          initial={state === "current" || reducedMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <div>
            {state === "current" ? <Check size={18} /> : state === "changed" ? <RefreshCw size={18} /> : <ShieldAlert size={18} />}
            <span>
              <strong>{state === "current" ? "Kora’s index matches this file." : state === "changed" ? "This file has changed." : "This file is unavailable."}</strong>
              <small>
                {state === "current"
                  ? "The external file remains canonical."
                  : state === "changed"
                    ? "Reviewing will adopt the file’s current content and rebuild Kora’s searchable index."
                    : "Kora is not serving stale content. Reconcile to settle the source’s current state."}
              </small>
            </span>
          </div>
          {state !== "current" && (
            <Button loading={reconcile.isPending} onClick={beginReconcile}>
              <RefreshCw size={15} />
              {state === "changed" ? "Refresh from file" : "Reconcile"}
            </Button>
          )}
        </motion.section>
      )}

      {routeEditing && source.sourceKind === "inline" && spans.isError && !spans.data ? (
        <StateView
          className="source-content-state"
          state="error"
          title="The source text could not be opened"
          body="Nothing has been made editable. Try the bounded read again."
          action={<Button onClick={() => void spans.refetch()}>Try again</Button>}
        />
      ) : routeEditing && source.sourceKind === "inline" && !spansComplete ? (
        <StateView
          className="source-content-state"
          state="partial"
          title="Load the complete source before editing"
          body="Kora opened only a bounded preview. Loading the remaining sections first prevents a partial document from replacing the full source."
          action={(
            <Button
              loading={loadingFullSource || spans.isFetchingNextPage}
              disabled={loadingFullSource || spans.isFetchingNextPage || !spans.hasNextPage}
              onClick={() => void loadFullSourceForEditing()}
            >
              Load full source to edit
            </Button>
          )}
        />
      ) : routeEditing && draft ? (
        <div className="source-editor">
          <Field label="Name" className="source-field">
            <Input value={draft.label} maxLength={200} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          </Field>
          <div className="source-retrieval-fields">
            <Field
              label="How Kora should use it"
              hint="This affects retrieval priority, not who can access the source."
            >
              <KoraSelect
                label="How Kora should use this source"
                value={draft.retrievalRole}
                options={retrievalRoleOptions}
                onValueChange={(value) => setDraft({
                  ...draft,
                  retrievalRole: value as KnowledgeSourceRetrievalRole,
                })}
              />
            </Field>
            <Field
              label="Time scope"
              hint="Helps Kora separate your present situation from history."
            >
              <KoraSelect
                label="Time scope"
                value={draft.temporalScope}
                options={temporalScopeOptions}
                onValueChange={(value) => setDraft({
                  ...draft,
                  temporalScope: value as KnowledgeSourceTemporalScope,
                })}
              />
            </Field>
          </div>
          {source.sourceKind === "inline" && (
            <Field
              label="Source text"
              hint="Ctrl+S saves the complete current document."
              className="source-writing-field"
            >
              <Textarea
                className="source-writing-input"
                aria-label="Source text"
                value={draft.contentMarkdown}
                onChange={(event) => setDraft({ ...draft, contentMarkdown: event.target.value })}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    if (dirty && !save.isPending) beginSave();
                  }
                }}
              />
            </Field>
          )}
        </div>
      ) : (
        <div className="source-reader">
          {source.sourceKind === "inline" ? (
            <>
              {spans.isError && !spans.data ? (
                <StateView
                  className="source-content-state"
                  state="error"
                  title="The source text could not be opened"
                  body="Kora has not treated this source as empty. Retry the bounded read."
                  action={<Button onClick={() => void spans.refetch()}>Try again</Button>}
                />
              ) : (
                <section className="source-content-block" aria-labelledby="source-content-title">
                  <div className="source-content-block__head">
                    <h3 id="source-content-title">Source content</h3>
                    <span>{spansComplete ? "Complete text" : "Bounded preview"}</span>
                  </div>
                  <BrainMarkdown
                    as="article"
                    className="source-reader__markdown"
                    headingBase={4}
                  >
                    {canonicalContent || (spansComplete ? "_This inline source is empty._" : "_Opening the first source section…_")}
                  </BrainMarkdown>
                </section>
              )}
              {spans.data && !spansComplete && (
                <StateView
                  className="source-content-state source-content-state--continuation"
                  state={spans.isFetchNextPageError ? "error" : "partial"}
                  title={spans.isFetchNextPageError ? "The next source section could not be loaded" : "More source text is available"}
                  body="This is a bounded preview. Continue when you want to read more; Kora will not fetch the whole source in the background."
                  action={(
                    <Button
                      loading={spans.isFetchingNextPage}
                      disabled={spans.isFetchingNextPage || !spans.hasNextPage}
                      onClick={() => void spans.fetchNextPage()}
                    >
                      {spans.isFetchNextPageError ? "Try next section again" : "Load next section"}
                    </Button>
                  )}
                />
              )}
            </>
          ) : (
            <>
              <section className="source-file-truth">
                <span>{sourceFormatLabel(source.pathLabel)}</span>
                <strong><File size={17} />{safeFileName(source.pathLabel)}</strong>
                <p>{sourceProjectionCopy(source.pathLabel)}</p>
                <small>The local path and internal integrity values stay private.</small>
              </section>
              {state !== "current" ? (
                <StateView
                  className="source-content-state"
                  state="unavailable"
                  title="Searchable text preview is paused"
                  body={state === "changed"
                    ? "The document changed after Kora indexed it. Refresh the source before viewing or searching its extracted text."
                    : "The original document is unavailable. Kora is not serving its prior extracted text as current."}
                />
              ) : spans.isLoading ? (
                <StateView className="source-content-state" state="loading" title="Opening searchable text preview" />
              ) : spans.isError && !spans.data ? (
                <StateView
                  className="source-content-state"
                  state="error"
                  title="The searchable text preview could not be opened"
                  body="Kora has not treated this document as empty. Retry the bounded read."
                  action={<Button onClick={() => void spans.refetch()}>Try again</Button>}
                />
              ) : (
                <section className="source-document-preview" aria-label="Searchable text preview">
                  <h3>Searchable text preview</h3>
                  <pre>{canonicalContent || "No searchable text was extracted from this document."}</pre>
                </section>
              )}
              {spans.data && !spansComplete && (
                <StateView
                  className="source-content-state source-content-state--continuation"
                  state={spans.isFetchNextPageError ? "error" : "partial"}
                  title={spans.isFetchNextPageError ? "The next preview section could not be loaded" : "More searchable text is available"}
                  body="This is a bounded preview. Kora will not fetch the complete projection in the background."
                  action={(
                    <Button
                      loading={spans.isFetchingNextPage}
                      disabled={spans.isFetchingNextPage || !spans.hasNextPage}
                      onClick={() => void spans.fetchNextPage()}
                    >
                      {spans.isFetchNextPageError ? "Try next section again" : "Load next section"}
                    </Button>
                  )}
                />
              )}
            </>
          )}
          <dl className="source-metadata">
            <div><dt>Retrieval use</dt><dd>{retrievalRoleOptions.find((option) => option.value === source.retrievalRole)?.label ?? source.retrievalRole}</dd></div>
            <div><dt>Time scope</dt><dd>{temporalScopeOptions.find((option) => option.value === source.temporalScope)?.label ?? source.temporalScope}</dd></div>
            <div><dt>Revision</dt><dd>{source.version}</dd></div>
            <div><dt>Search status</dt><dd>{state === "current" ? "Ready for local retrieval" : state === "changed" ? "Paused until refreshed" : "Not available for search"}</dd></div>
            <div><dt>Updated</dt><dd>{new Date(source.updatedAt).toLocaleString()}</dd></div>
          </dl>
        </div>
      )}

      {!routeEditing && (
        <DangerZone
          title="Unregister source"
          body={source.sourceKind === "file" ? "Remove Kora’s index and metadata. Your external file stays untouched." : "Remove this inline source and its searchable content."}
        >
          <Button tone="ghost" onClick={() => setConfirmRemove(true)}><Link2Off size={15} />Unregister</Button>
        </DangerZone>
      )}

      <Modal
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Unregister “${source.label}”?`}
        description={source.sourceKind === "file"
          ? "Kora will remove her metadata and searchable index. The external file on your computer will be preserved."
          : "Kora will remove this inline source and its searchable content."}
        className="source-remove-modal"
      >
        <div className="source-remove-actions">
          <Button onClick={() => setConfirmRemove(false)}>Keep source</Button>
          <Button
            tone="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(removeOperation.capture(
              { id: sourceId },
              { expectedVersion: source.version, priorContentHash: source.contentHash },
            ))}
          >
            Unregister source
          </Button>
        </div>
      </Modal>
      <ExactOperationConfirmation
        open={removeConfirmationIds.length > 0}
        confirmationIds={removeConfirmationIds}
        title="Approve this exact source removal"
        description={source.sourceKind === "file"
          ? "Kora will remove only her index and metadata. The external file on your computer remains untouched."
          : "Kora will remove only this inline source and its searchable content."}
        approveLabel="Unregister this source"
        approveTone="danger"
        client={client}
        onOpenChange={(open) => {
          if (!open && removeConfirmationIds.length) {
            removeOperation.cancel();
            setRemoveConfirmationIds([]);
          }
        }}
        onApproved={async () => {
          const intent = removeOperation.retry();
          if (intent) await remove.mutateAsync(intent);
        }}
        onRejected={() => {
          removeOperation.cancel();
          setRemoveConfirmationIds([]);
        }}
      />
    </motion.div>
  );
}

export function SourcesWorkspace({
  onAskKora,
  client = sourceClient,
  chooseFile = chooseSourceFile,
}: {
  onAskKora?: (reference: ConversationContextReference) => void;
  client?: SourcesClient;
  chooseFile?: () => Promise<SourceFileSelection | null>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const params = useParams<{ sourceId?: string }>();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const isNew = location.pathname.endsWith("/new");
  const sourceId = params.sourceId;
  const compact = useCompactSourcesPane();
  const ledgerRef = useRef<HTMLDivElement>(null);
  const ledgerScrollTop = useRef(0);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const originatingRowId = useRef<string | undefined>(undefined);
  const addTriggerRef = useRef<HTMLAnchorElement>(null);
  const restoreDirectoryFocus = useRef(false);
  const detailFocusRef = useRef<HTMLHeadingElement>(null);

  const closeCanvas = useCallback(() => {
    restoreDirectoryFocus.current = true;
    navigate("/brain/sources");
  }, [navigate]);

  const list = useInfiniteQuery({
    queryKey: ["brain", "sources", deferredQuery, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.knowledgeSourcesPage({
      query: deferredQuery.trim() || undefined,
      sourceKind: filter === "file" || filter === "inline" ? filter : undefined,
      // `changed` is an observed file state layered over an active source, so
      // the attention view reads both registered states and filters locally.
      state: undefined,
      pageSize: 50,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.cursor,
  });
  const sources = useMemo(() => {
    const all = list.data?.pages.flatMap((page) => page.items) ?? [];
    return filter === "attention"
      ? all.filter((source) => observedState(source) !== "current")
      : all;
  }, [filter, list.data]);
  const hasSelection = isNew || Boolean(sourceId);

  useLayoutEffect(() => {
    if (compact && hasSelection) return;
    if (!restoreDirectoryFocus.current) return;
    restoreDirectoryFocus.current = false;
    if (ledgerRef.current) ledgerRef.current.scrollTop = ledgerScrollTop.current;
    const target = originatingRowId.current === "add-source"
      ? addTriggerRef.current
      : originatingRowId.current
        ? rowRefs.current.get(originatingRowId.current)
        : ledgerRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
    target?.focus();
  }, [compact, hasSelection]);

  useViewBar(() => ({
    title: "Sources",
    meta: sources.length ? count(sources.length, "source") : undefined,
    actions: (
      <Link
        ref={addTriggerRef}
        to="/brain/sources/new"
        className="sources-new"
        onClick={() => {
          originatingRowId.current = "add-source";
          ledgerScrollTop.current = ledgerRef.current?.scrollTop ?? 0;
        }}
      >
        <FilePlus2 size={15} />Add
      </Link>
    ),
  }), [sources.length]);

  const ledger = useLedgerKeyboard({ count: sources.length });
  const rowProps = (index: number, source: KnowledgeSource): LedgerRowProps => {
    const shared = ledger.rowProps(index);
    return {
      ...shared,
      ref: (node) => {
        shared.ref(node);
        if (node) rowRefs.current.set(source.id, node);
        else rowRefs.current.delete(source.id);
      },
      onFocus: () => {
        shared.onFocus();
        originatingRowId.current = source.id;
        ledgerScrollTop.current = ledgerRef.current?.scrollTop ?? 0;
      },
    };
  };

  return (
    <section
      className="sources-workspace"
      data-has-selection={hasSelection}
      data-empty={!hasSelection && sources.length === 0 ? "true" : undefined}
    >
      <aside
        className="sources-ledger"
        aria-label="Knowledge Sources"
        aria-hidden={compact && hasSelection ? true : undefined}
        hidden={compact && hasSelection}
        inert={compact && hasSelection ? true : undefined}
      >
        <div className="sources-search-row">
          <SearchField value={query} onValueChange={setQuery} label="Search Knowledge Sources" placeholder="Search sources" className="sources-search" />
          {list.isFetching && !list.isLoading && <KoraPresenceMark state="gathering" label="Searching sources" />}
        </div>
        <div className="sources-filters">
          <SegmentedControl
            value={filter}
            onValueChange={(value) => setFilter(value as SourceFilter)}
            label="Filter sources"
            layoutId="sources-filter-selection"
            options={[
              { value: "all", label: "All" },
              { value: "file", label: "Files" },
              { value: "inline", label: "Inline" },
              { value: "attention", label: "Attention" },
            ]}
          />
        </div>
        <div ref={ledgerRef} className="sources-list" {...ledger.ledgerProps}>
          {list.isLoading ? (
            <StateView className="sources-list__state" state="loading" title="Opening sources" />
          ) : list.isError && sources.length === 0 ? (
            <ContentState
              className="sources-list__state"
              state={isUnavailableSourceReadError(list.error) ? "unavailable" : "error"}
              title="Sources could not be loaded"
              body={isUnavailableSourceReadError(list.error)
                ? "The Sources directory is temporarily unavailable. Nothing was changed."
                : "Nothing was changed. Try the collection read again."}
              action={<Button tone="ghost" onClick={() => void list.refetch()}>Try again</Button>}
              size="page"
              headingLevel={2}
            />
          ) : sources.length === 0 ? (
            <ContentState
              className="sources-list__state"
              state={query || filter !== "all" ? "filtered-empty" : "empty"}
              icon={<FileText size={22} />}
              title={query
                ? "No matching sources"
                : filter === "attention"
                  ? list.hasNextPage ? "No attention in the first page" : "Everything is current"
                  : "No sources yet"}
              body={query
                ? filter === "attention" && list.hasNextPage
                  ? "No matching source is visible in the loaded page. Check the next page or clear the search."
                  : "Try a different phrase or clear the search."
                : filter === "attention"
                  ? list.hasNextPage
                    ? "Continue loading to check the rest of this collection."
                    : "Kora's registered sources do not need attention."
                  : filter !== "all"
                    ? "Show all sources to return to the complete collection."
                    : "Add a supported document or inline text Kora should be able to reference."}
              action={filter === "attention" && list.hasNextPage
                ? <Button tone="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Check next page</Button>
                : query
                  ? <Button tone="ghost" onClick={() => setQuery("")}>Clear search</Button>
                  : filter !== "all"
                    ? <Button tone="ghost" onClick={() => setFilter("all")}>Show all sources</Button>
                    : <Button tone="secondary" onClick={() => navigate("/brain/sources/new")}>Add source</Button>}
              size="page"
              headingLevel={2}
            />
          ) : (
            <>
              <motion.ul layout={reducedMotion ? false : true} aria-label="Source results">
                {sources.map((source, index) => <SourceRow key={source.id} source={source} current={source.id === sourceId} rowProps={rowProps(index, source)} />)}
              </motion.ul>
              {list.isError && (
                <StateView
                  className="sources-collection-state"
                  state="partial"
                  title="Some sources remain visible"
                  body="Kora could not confirm that this collection is complete. The loaded sources were preserved."
                  action={<Button tone="ghost" onClick={() => void list.refetch()}>Try again</Button>}
                />
              )}
              {list.hasNextPage && (
                <Button
                  tone="ghost"
                  className="sources-more"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  Show more
                </Button>
              )}
            </>
          )}
        </div>
      </aside>

      <div
        className="source-canvas"
        aria-label="Selected knowledge source"
        aria-hidden={compact && !hasSelection ? true : undefined}
        hidden={compact && !hasSelection}
        inert={compact && !hasSelection ? true : undefined}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isNew ? (
            <SourceCreate
              key="new"
              client={client}
              chooseFile={chooseFile}
              onBack={closeCanvas}
              focusRef={detailFocusRef}
            />
          ) : sourceId ? (
            <SourceDetail
              key={sourceId}
              sourceId={sourceId}
              client={client}
              onAskKora={onAskKora}
              onBack={closeCanvas}
              focusRef={detailFocusRef}
              focusOnReady={compact}
            />
          ) : sources.length > 0 ? (
            <motion.div className="source-welcome" key="welcome" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
              <FileText size={25} />
              <h2>Choose a source to inspect.</h2>
              <p>See exactly what Kora can reference, where it comes from, and whether it is current.</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
