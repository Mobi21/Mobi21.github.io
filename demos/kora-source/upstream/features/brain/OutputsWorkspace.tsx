import { invoke } from "@tauri-apps/api/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Image,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, IconButton, Input, KoraPresenceMark, KoraSelect, Menu, Modal, PageFrame, PageHeader, PageToolbar, SearchField } from "../../components/primitives";
import { Tooltip } from "../../components/overlays";
import { Badge } from "../../components/display";
import { DataTable, type DataSort, type DataTableState } from "../../components/collections";
import { count, dateLabel, recordTitle } from "../../lib/language";
import { useViewBar } from "../../app/ViewBar";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import {
  runtime,
  type ArtifactReference,
  type BrainCursorPage,
  type BrainMutationOutcome,
  type OutputSummary,
} from "../../lib/runtime";
import "./outputs.css";
import { DUR, EASE } from "../../lib/motion";
import { BrainMarkdown } from "./BrainMarkdown";

export type OutputOrigin = {
  type: "conversation" | "schedule_run" | "work";
  id: string;
  label: string;
  route?: string;
  availability: "available" | "unavailable";
};

export type OutputWorkspaceView = {
  output: OutputSummary;
  previews: ArtifactReference[];
  origins: OutputOrigin[];
};

export type OutputContent = {
  blob: Blob;
  mediaType: string;
  title: string;
  byteSize: number;
  sha256: string;
};

export type OutputDeleteOutcome = {
  status: "settled" | "gone";
  id: string;
  surface: "artifact";
  negativeRead: boolean;
  replayed: boolean;
};

export type OutputPreviewOutcome = {
  status: "ready" | "generating" | "unsupported" | "failed";
  previews: ArtifactReference[];
  truncated?: boolean;
  message?: string;
  replayed: boolean;
};

export type OutputsClient = {
  outputsPage(input?: {
    query?: string;
    mediaTypes?: string[];
    origin?: "conversation" | "schedule" | "unowned";
    createdAfter?: string;
    createdBefore?: string;
    pageSize?: number;
    cursor?: string;
  }): Promise<BrainCursorPage<OutputSummary>>;
  outputWorkspace(id: string): Promise<OutputWorkspaceView>;
  outputContent(id: string, signal?: AbortSignal): Promise<OutputContent>;
  renameOutput(id: string, input: {
    title: string;
    expectedUpdatedAt: string;
    requestKey?: string;
  }): Promise<BrainMutationOutcome<OutputSummary>>;
  renderOutputPreview(id: string, input?: { requestKey?: string }): Promise<OutputPreviewOutcome>;
  deleteOutput(id: string, input: {
    expectedUpdatedAt: string;
    requestKey?: string;
  }): Promise<OutputDeleteOutcome>;
  attachImageOutput(id: string, input?: { requestKey?: string }): Promise<{
    artifact: ArtifactReference & { byteSize: number };
    replayed: boolean;
  }>;
  openArtifact(id: string): Promise<{ dispatched: true }>;
};

export type SaveOutputCopyResult = {
  saved: boolean;
  cancelled: boolean;
  fileName?: string;
};

type FormatFilter = "all" | "image" | "pdf" | "document" | "spreadsheet" | "presentation" | "text";
type OriginFilter = "all" | "conversation" | "schedule" | "unowned";
type OutputsDirectorySnapshot = {
  version: 1;
  artifactId?: string;
  query: string;
  format: FormatFilter;
  origin: OriginFilter;
  createdAfter: string;
  createdBefore: string;
  sort?: DataSort;
  scrollTop: number;
};
type OutputsRouteState = Record<string, unknown> & {
  outputsReturn?: OutputsDirectorySnapshot;
};
const OUTPUTS_RETURN_KEY = "outputsReturn";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOutputsDirectorySnapshot(value: unknown): OutputsDirectorySnapshot | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.query !== "string"
    || value.query.length > 1_000
    || !(["all", "image", "pdf", "document", "spreadsheet", "presentation", "text"] as string[]).includes(String(value.format))
    || !(["all", "conversation", "schedule", "unowned"] as string[]).includes(String(value.origin))
    || typeof value.createdAfter !== "string"
    || value.createdAfter.length > 32
    || typeof value.createdBefore !== "string"
    || value.createdBefore.length > 32
    || typeof value.scrollTop !== "number"
    || !Number.isFinite(value.scrollTop)
    || value.scrollTop < 0) return undefined;
  const artifactId = value.artifactId === undefined
    ? undefined
    : typeof value.artifactId === "string" && value.artifactId.length <= 300
      ? value.artifactId
      : undefined;
  if (value.artifactId !== undefined && artifactId === undefined) return undefined;
  let sort: DataSort | undefined;
  if (value.sort !== undefined) {
    if (!isRecord(value.sort)
      || typeof value.sort.key !== "string"
      || value.sort.key.length > 100
      || (value.sort.direction !== "asc" && value.sort.direction !== "desc")) return undefined;
    sort = { key: value.sort.key, direction: value.sort.direction };
  }
  return {
    version: 1,
    ...(artifactId ? { artifactId } : {}),
    query: value.query,
    format: value.format as FormatFilter,
    origin: value.origin as OriginFilter,
    createdAfter: value.createdAfter,
    createdBefore: value.createdBefore,
    ...(sort ? { sort } : {}),
    scrollTop: value.scrollTop,
  };
}

function readOutputsReturn(value: unknown): OutputsDirectorySnapshot | undefined {
  return isRecord(value) ? readOutputsDirectorySnapshot(value[OUTPUTS_RETURN_KEY]) : undefined;
}

function outputsRouteState(existing: unknown, snapshot: OutputsDirectorySnapshot): OutputsRouteState {
  return {
    ...(isRecord(existing) ? existing : {}),
    [OUTPUTS_RETURN_KEY]: snapshot,
  };
}

const outputsClient = runtime as typeof runtime & OutputsClient;
const settleEase = EASE.out;
const saveOutputCopy = (artifactId: string, suggestedName: string) =>
  invoke<SaveOutputCopyResult>("save_output_copy", { artifactId, suggestedName });

const MIME = {
  document: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  presentation: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const mediaTypesFor = (format: FormatFilter): string[] | undefined => {
  if (format === "all") return;
  if (format === "image") return ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (format === "pdf") return ["application/pdf"];
  if (format === "document") return [MIME.document];
  if (format === "spreadsheet") return [MIME.spreadsheet];
  if (format === "presentation") return [MIME.presentation];
  return ["text/plain", "text/markdown"];
};

const outputFormat = (mediaType: string) => {
  if (mediaType === "application/pdf") return "PDF";
  if (mediaType === MIME.document) return "Word document";
  if (mediaType === MIME.spreadsheet) return "Excel workbook";
  if (mediaType === MIME.presentation) return "PowerPoint";
  if (mediaType === "text/markdown") return "Markdown";
  if (mediaType === "text/plain") return "Plain text";
  if (mediaType === "image/jpeg") return "JPEG image";
  if (mediaType === "image/png") return "PNG image";
  if (mediaType === "image/gif") return "GIF image";
  if (mediaType === "image/webp") return "WebP image";
  return mediaType;
};

const outputIcon = (mediaType: string, size = 17) => {
  if (mediaType.startsWith("image/")) return <FileImage size={size} />;
  if (mediaType === MIME.spreadsheet) return <FileSpreadsheet size={size} />;
  if (mediaType === MIME.presentation) return <Presentation size={size} />;
  if (mediaType.startsWith("text/") || mediaType === MIME.document) return <FileText size={size} />;
  return <File size={size} />;
};

const humanBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fallbackTitle = (output: OutputSummary) => `Kora output · ${outputFormat(output.mediaType)}`;
const isImage = (mediaType: string) => ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType);
const isText = (mediaType: string) => mediaType === "text/plain" || mediaType === "text/markdown";
const needsRenderedPages = (mediaType: string) =>
  mediaType === "application/pdf" ||
  mediaType === MIME.document ||
  mediaType === MIME.spreadsheet ||
  mediaType === MIME.presentation;

const previewStateLabel = (state: OutputSummary["previewState"]) =>
  state === "ready" || state === "available" ? "Preview"
    : state === "unsupported" ? "Metadata"
    : "Not rendered";

const previewStatusCopy = (state: OutputSummary["previewState"]) =>
  state === "ready" || state === "available" ? "Preview ready"
    : state === "unsupported" ? "Preview unavailable for this format"
    : "Preview not generated";

/** Shared by the table's Origin column and the detail pane. */
const outputOrigin = (output: OutputSummary) =>
  output.ownerSessionId ? "Conversation" : output.ownerJobRunId ? "Scheduled run" : "Kora";

const outputSortValue = (output: OutputSummary, key: string): string | number => {
  switch (key) {
    case "format": return outputFormat(output.mediaType);
    case "origin": return outputOrigin(output);
    case "state": return previewStateLabel(output.previewState);
    case "created": return Date.parse(output.createdAt) || 0;
    default: return recordTitle(output.title, fallbackTitle(output)).toLocaleLowerCase();
  }
};

function useObjectUrl(content?: OutputContent) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!content) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(content.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [content]);
  return url;
}

function AuthenticatedImage({
  artifactId,
  alt,
  client,
  className = "",
}: {
  artifactId: string;
  alt: string;
  client: OutputsClient;
  className?: string;
}) {
  const content = useQuery({
    queryKey: ["brain", "output-content", artifactId],
    queryFn: ({ signal }) => client.outputContent(artifactId, signal),
  });
  const url = useObjectUrl(content.data);
  if (content.isLoading) return <div className={`output-page-loading ${className}`}><KoraPresenceMark state="gathering" label="Loading preview" /></div>;
  if (content.isError || !url) return <div className={`output-page-error ${className}`}><TriangleAlert size={18} />Preview page unavailable</div>;
  return <img className={className} src={url} alt={alt} draggable={false} />;
}

function DirectPreview({ output, client }: { output: OutputSummary; client: OutputsClient }) {
  const content = useQuery({
    queryKey: ["brain", "output-content", output.id],
    queryFn: ({ signal }) => client.outputContent(output.id, signal),
  });
  const url = useObjectUrl(content.data);
  const [text, setText] = useState<string>();
  useEffect(() => {
    let alive = true;
    if (content.data && isText(output.mediaType))
      void content.data.blob.text().then((value) => { if (alive) setText(value); });
    return () => { alive = false; };
  }, [content.data, output.mediaType]);

  if (content.isLoading) return <div className="output-preview-loading"><KoraPresenceMark state="gathering" label="Opening output" /><span>Opening output</span></div>;
  if (content.isError) return <div className="output-preview-unavailable"><TriangleAlert size={23} /><strong>Preview unavailable.</strong><span>Open in Windows or save a copy to use the original output.</span></div>;
  if (isImage(output.mediaType) && url)
    return <div className="output-image-stage"><img src={url} alt={output.title || "Kora image output"} draggable={false} /></div>;
  if (output.mediaType === "text/markdown")
    return <BrainMarkdown as="article" className="output-markdown-preview" headingBase={3}>{text ?? ""}</BrainMarkdown>;
  if (output.mediaType === "text/plain")
    return <pre className="output-text-preview">{text ?? ""}</pre>;
  return null;
}

function PreviewPlane({
  view,
  client,
}: {
  view: OutputWorkspaceView;
  client: OutputsClient;
}) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<OutputPreviewOutcome>();
  const renderPreview = useMutation({
    mutationFn: () => client.renderOutputPreview(view.output.id),
    onSuccess: async (outcome) => {
      setPreview(outcome);
      if (outcome.status === "ready") {
        queryClient.setQueryData<OutputWorkspaceView>(
          ["brain", "output", view.output.id],
          (current) => current ? {
            ...current,
            output: { ...current.output, previewState: "available" },
            previews: outcome.previews,
          } : current,
        );
        await queryClient.invalidateQueries({ queryKey: ["brain", "outputs"] });
      }
    },
  });
  const pages = preview?.status === "ready" ? preview.previews : view.previews;
  const state = preview?.status ??
    (pages.length ? "ready" : view.output.previewState === "unsupported" ? "unsupported" : "not_requested");

  if (isImage(view.output.mediaType) || isText(view.output.mediaType))
    return <DirectPreview output={view.output} client={client} />;

  if (needsRenderedPages(view.output.mediaType) && pages.length) {
    return (
      <div className="output-page-sequence">
        {pages.map((page, index) => (
          <motion.figure
            key={page.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, delay: Math.min(index * 0.035, 0.18), ease: settleEase }}
          >
            <AuthenticatedImage artifactId={page.id} alt={`${view.output.title || "Output"} page ${index + 1}`} client={client} />
            <figcaption>{page.title || `Page ${index + 1}`}</figcaption>
          </motion.figure>
        ))}
        {preview?.truncated && <p className="output-preview-truncated">Preview limited to the first {count(pages.length, "page")}. The original output is complete.</p>}
      </div>
    );
  }

  if (renderPreview.isPending || state === "generating")
    return <div className="output-preview-loading"><KoraPresenceMark state="gathering" label="Rendering preview" /><span>Rendering a local preview</span></div>;

  if (state === "failed" || state === "unsupported") {
    return (
      <div className="output-preview-unavailable">
        <FileOutput size={25} />
        <strong>{state === "unsupported" ? "This format does not have an in-app preview." : "The local preview could not be rendered."}</strong>
        <span>The original output is intact. Open it in Windows or save a copy.</span>
        {state === "failed" && <Button onClick={() => renderPreview.mutate()}><RefreshCw size={15} />Try preview again</Button>}
      </div>
    );
  }

  return (
    <div className="output-preview-unavailable">
      {outputIcon(view.output.mediaType, 27)}
      <strong>Preview this {outputFormat(view.output.mediaType).toLowerCase()}.</strong>
      <span>Kora will render a bounded local preview. The original output stays canonical.</span>
      <Button tone="primary" onClick={() => renderPreview.mutate()}>Generate preview</Button>
    </div>
  );
}

function OutputDetail({
  artifactId,
  client,
  saveCopy,
}: {
  artifactId: string;
  client: OutputsClient;
  saveCopy: (artifactId: string, suggestedName: string) => Promise<SaveOutputCopyResult>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const returnSnapshot = useMemo(() => readOutputsReturn(location.state), [location.state]);
  const backSnapshot = returnSnapshot ?? {
    version: 1 as const,
    query: "",
    format: "all" as const,
    origin: "all" as const,
    createdAfter: "",
    createdBefore: "",
    artifactId,
    scrollTop: 0,
  } satisfies OutputsDirectorySnapshot;
  const returnState = useMemo(
    () => outputsRouteState(location.state, backSnapshot),
    [backSnapshot, location.state],
  );
  const returnToCreated = { pathname: "/brain/outputs", search: location.search };
  const detail = useQuery({
    queryKey: ["brain", "output", artifactId],
    queryFn: () => client.outputWorkspace(artifactId),
  });
  const [renameOpen, setRenameOpen] = useState(false);
  const [discardRenameOpen, setDiscardRenameOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const view = detail.data;
  const output = view?.output;
  const persistedTitle = output ? output.title || fallbackTitle(output) : "";
  const renameDirty = renameOpen && title !== persistedTitle;
  useEffect(() => {
    if (output) setTitle(output.title || fallbackTitle(output));
  }, [output?.id, output?.updatedAt]);

  const closeRename = () => {
    setDiscardRenameOpen(false);
    setRenameOpen(false);
    setTitle(persistedTitle);
  };
  const requestRenameClose = () => {
    if (rename.isPending) return;
    if (renameDirty) setDiscardRenameOpen(true);
    else closeRename();
  };
  useDirtyDraftGuard({
    id: `output-rename-${artifactId}`,
    label: "Output name",
    dirty: renameDirty,
    onDiscard: closeRename,
  });

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(undefined), 1900);
  };

  const rename = useMutation({
    mutationFn: () => client.renameOutput(artifactId, {
      title: title.trim(),
      expectedUpdatedAt: output!.updatedAt,
    }),
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled") {
        if (outcome.status === "conflict") {
          queryClient.setQueryData<OutputWorkspaceView>(["brain", "output", artifactId], (current) =>
            current ? { ...current, output: outcome.current } : current);
          setTitle(outcome.current.title || fallbackTitle(outcome.current));
          setError("This output was renamed somewhere else. The latest name is shown.");
        } else setError(outcome.status === "gone" ? "This output no longer exists." : outcome.status === "validation_failure" ? outcome.message : "This output could not be renamed.");
        return;
      }
      queryClient.setQueryData<OutputWorkspaceView>(["brain", "output", artifactId], (current) =>
        current ? { ...current, output: outcome.record } : current);
      await queryClient.invalidateQueries({ queryKey: ["brain", "outputs"] });
      setRenameOpen(false);
      setError(undefined);
      showNotice(outcome.replayed ? "Already renamed" : "Renamed");
    },
    onError: () => setError("This output could not be renamed."),
  });

  const attach = useMutation({
    mutationFn: () => client.attachImageOutput(artifactId),
    onSuccess: (result) => showNotice(result.replayed ? "Already attached" : "Attached to current conversation"),
    onError: () => setError("The image could not be attached to the current conversation."),
  });

  const remove = useMutation({
    mutationFn: () => client.deleteOutput(artifactId, { expectedUpdatedAt: output!.updatedAt }),
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled" || !outcome.negativeRead) {
        setError(outcome.status === "gone" ? "This output is already gone." : "Kora could not confirm deletion.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["brain", "outputs"] });
      navigate(returnToCreated, { replace: true, state: returnState });
    },
    onError: () => setError("This output changed or could not be deleted."),
  });

  const open = async () => {
    try { await client.openArtifact(artifactId); }
    catch { setError("Windows could not open this output."); }
  };
  const save = async () => {
    try {
      const result = await saveCopy(artifactId, output!.title || fallbackTitle(output!));
      if (result.saved) showNotice("Copy saved");
    } catch {
      setError("A copy could not be saved.");
    }
  };

  if (detail.isLoading)
    return <div className="output-detail-state"><KoraPresenceMark state="gathering" label="Opening output" />Opening output</div>;
  if (detail.isError || !view || !output)
    return <div className="output-detail-state output-detail-state--error"><TriangleAlert size={23} /><strong>This output could not be opened.</strong><Link className="output-detail-back" to={returnToCreated} state={returnState}><ArrowLeft size={15} />Back to Created</Link><Button onClick={() => void detail.refetch()}>Try again</Button></div>;

  return (
    <motion.div
      className="output-detail"
      initial={{ opacity: 0, x: 9 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.base, ease: settleEase }}
    >
      <header className="output-detail__head">
        <div className="output-detail__identity">
          <Link className="output-detail-back" to={returnToCreated} state={returnState}><ArrowLeft size={15} />Back to Created</Link>
          <div className="output-detail__kind">
            <span className="output-detail__format">{outputIcon(output.mediaType)}{outputFormat(output.mediaType)}</span>
            <Badge tone={output.previewState === "unsupported" ? "quiet" : output.previewState === "not_requested" ? "neutral" : "success"}>
              {previewStatusCopy(output.previewState)}
            </Badge>
          </div>
          <h2>{output.title || fallbackTitle(output)}</h2>
          <small>{humanBytes(output.byteSize)} · {outputOrigin(output)} · Created {new Date(output.createdAt).toLocaleString()}</small>
        </div>
        <div className="output-detail__actions">
          <AnimatePresence>{notice && <motion.span className="output-settled" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={14} />{notice}</motion.span>}</AnimatePresence>
          {isImage(output.mediaType) && (
            <Button disabled={attach.isPending} onClick={() => attach.mutate()}><MessageSquarePlus size={15} />{attach.isPending ? "Attaching…" : "Attach to conversation"}</Button>
          )}
          <Button onClick={() => void open()}><ExternalLink size={15} />Open in Windows</Button>
          <Menu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            trigger={<IconButton label="More output actions" tooltip="More output actions"><MoreHorizontal size={18} /></IconButton>}
            actions={[
              { id: "save", label: "Save a copy", description: "Save the original bytes to a chosen folder", icon: <Download size={15} />, onSelect: () => void save() },
              { id: "rename", label: "Rename", description: "Change the display name without changing the bytes", icon: <Pencil size={15} />, onSelect: () => { setTitle(persistedTitle); setRenameOpen(true); } },
              { id: "delete", label: "Delete output", description: "Permanently remove this output and its previews", icon: <Trash2 size={15} />, danger: true, separatorBefore: true, onSelect: () => setDeleteOpen(true) },
            ]}
          />
        </div>
      </header>

      {error && <div className="output-action-error" role="alert"><TriangleAlert size={15} />{error}<IconButton label="Dismiss error" onClick={() => setError(undefined)}><X size={14} /></IconButton></div>}

      {/* The facts used to sit in a 250px right column, which made this detail
          area a third vertical band beside the global rail and the ledger — and
          squeezed the preview, which is the reason the page exists. They are now
          a horizontal strip under the preview: same information, one column. */}
      <div className="output-detail__workspace">
        <section className="output-preview-plane" aria-label="Output preview">
          <PreviewPlane view={view} client={client} />
        </section>
        <div className="output-facts" aria-label="Output details">
          <section>
            <h3>Origin</h3>
            {view.origins.length ? (
              <ul>
                {view.origins.map((origin) => (
                  <li key={`${origin.type}:${origin.id}`}>
                    {origin.route && origin.availability === "available"
                      ? <Link to={origin.route}>{origin.label}<ChevronRight size={14} /></Link>
                      : <span>{origin.label}<small>{origin.availability === "unavailable" ? "Unavailable" : origin.type.replace("_", " ")}</small></span>}
                  </li>
                ))}
              </ul>
            ) : <p>No canonical origin is attached.</p>}
          </section>
          <section>
            <h3>Details</h3>
            <dl>
              <div><dt>Format</dt><dd>{outputFormat(output.mediaType)}</dd></div>
              <div><dt>Size</dt><dd>{humanBytes(output.byteSize)}</dd></div>
              <div><dt>Updated</dt><dd>{new Date(output.updatedAt).toLocaleString()}</dd></div>
              <div>
                <dt>SHA-256</dt>
                <Tooltip content={output.sha256}>
                  <dd tabIndex={0}>{output.sha256.slice(0, 12)}…</dd>
                </Tooltip>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <Modal
        open={renameOpen}
        onOpenChange={(open) => { if (!open) requestRenameClose(); }}
        title="Rename output"
        description="Change the display name without changing the output bytes."
        purpose="focused-form"
        dismissPolicy="explicit"
        onDismissAttempt={requestRenameClose}
        busy={rename.isPending}
        actions={<><Button type="button" onClick={requestRenameClose} disabled={rename.isPending}>Cancel</Button><Button form="output-rename-form" type="submit" tone="primary" disabled={!title.trim() || rename.isPending}>{rename.isPending ? "Renaming…" : "Rename"}</Button></>}
      >
        <form id="output-rename-form" className="output-rename" onSubmit={(event) => { event.preventDefault(); if (title.trim()) rename.mutate(); }}>
          <label><span>Name</span><Input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
        </form>
      </Modal>

      <Modal
        open={discardRenameOpen}
        onOpenChange={setDiscardRenameOpen}
        title="Discard the new output name?"
        description="Your unsaved name will be lost. The saved output and its bytes will remain unchanged."
        purpose="confirm"
        actions={<><Button autoFocus onClick={() => setDiscardRenameOpen(false)}>Keep editing</Button><Button tone="danger" onClick={closeRename}>Discard changes</Button></>}
      >
        <p>Kora has not renamed this output yet.</p>
      </Modal>

      <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete “${output.title || fallbackTitle(output)}”?`} description="This permanently removes the canonical output and its generated previews. Originating conversations, schedules, and Work remain." purpose="confirm" busy={remove.isPending} actions={<><Button onClick={() => setDeleteOpen(false)}>Keep output</Button><Button tone="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting…" : "Delete output"}</Button></>}>
        <p>This output cannot be recovered from an archive.</p>
      </Modal>
    </motion.div>
  );
}

export function OutputsWorkspace({
  client = outputsClient,
  saveCopy = saveOutputCopy,
}: {
  client?: OutputsClient;
  saveCopy?: (artifactId: string, suggestedName: string) => Promise<SaveOutputCopyResult>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ artifactId?: string }>();
  const artifactId = params.artifactId;
  const returnSnapshot = useMemo(() => readOutputsReturn(location.state), [location.state]);
  const [query, setQuery] = useState(() => returnSnapshot?.query ?? "");
  const deferredQuery = useDeferredValue(query);
  const [format, setFormat] = useState<FormatFilter>(() => returnSnapshot?.format ?? "all");
  const [origin, setOrigin] = useState<OriginFilter>(() => returnSnapshot?.origin ?? "all");
  const [createdAfter, setCreatedAfter] = useState(() => returnSnapshot?.createdAfter ?? "");
  const [createdBefore, setCreatedBefore] = useState(() => returnSnapshot?.createdBefore ?? "");
  const [sort, setSort] = useState<DataSort | undefined>(() => returnSnapshot?.sort);
  const ledgerRef = useRef<HTMLElement>(null);
  const restoredReturn = useRef(false);

  const list = useInfiniteQuery({
    queryKey: ["brain", "outputs", deferredQuery, format, origin, createdAfter, createdBefore],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.outputsPage({
      query: deferredQuery.trim() || undefined,
      mediaTypes: mediaTypesFor(format),
      origin: origin === "all" ? undefined : origin,
      createdAfter: createdAfter ? new Date(`${createdAfter}T00:00:00`).toISOString() : undefined,
      createdBefore: createdBefore ? new Date(`${createdBefore}T23:59:59.999`).toISOString() : undefined,
      pageSize: 50,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.cursor,
  });
  const outputs = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const sortedOutputs = useMemo(() => {
    if (!sort) return outputs;
    return [...outputs].sort((left, right) => {
      const a = outputSortValue(left, sort.key), b = outputSortValue(right, sort.key);
      const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });
      return sort.direction === "asc" ? compared : -compared;
    });
  }, [outputs, sort]);
  const filtering = Boolean(query || format !== "all" || origin !== "all" || createdAfter || createdBefore);
  const directorySnapshot = (outputId?: string): OutputsDirectorySnapshot => ({
    version: 1,
    ...(outputId ? { artifactId: outputId } : {}),
    query,
    format,
    origin,
    createdAfter,
    createdBefore,
    ...(sort ? { sort } : {}),
    scrollTop: ledgerRef.current?.querySelector<HTMLElement>(".k-page-frame__viewport")?.scrollTop
      ?? ledgerRef.current?.scrollTop
      ?? 0,
  });
  const openOutput = (output: OutputSummary) => {
    const snapshot = directorySnapshot(output.id);
    navigate({
      pathname: `/brain/outputs/${encodeURIComponent(output.id)}`,
      search: location.search,
    }, {
      state: outputsRouteState(location.state, snapshot),
    });
  };

  useLayoutEffect(() => {
    if (artifactId || !returnSnapshot || restoredReturn.current || list.isLoading || list.isFetching) return;
    if (!list.data && !list.isError) return;
    const ledger = ledgerRef.current;
    if (!ledger) return;
    const scrollOwner = ledger.querySelector<HTMLElement>(".k-page-frame__viewport") ?? ledger;
    let frame: number | undefined;
    let attempts = 0;
    const restore = () => {
      if (artifactId || restoredReturn.current) return;
      const target = returnSnapshot.artifactId
        ? [...ledger.querySelectorAll<HTMLElement>("[data-row-return-id]")]
          .find((candidate) => candidate.dataset.rowReturnId === returnSnapshot.artifactId)
        : undefined;
      const focusTarget = target ?? (attempts >= 3
        ? ledger.querySelector<HTMLInputElement>('input[type="search"]')
        : undefined);
      if (focusTarget) {
        scrollOwner.scrollTop = returnSnapshot.scrollTop;
        focusTarget.focus({ preventScroll: true });
        restoredReturn.current = true;
        const nextState = isRecord(location.state) ? { ...location.state } : {};
        delete nextState[OUTPUTS_RETURN_KEY];
        navigate({ pathname: "/brain/outputs", search: location.search }, {
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
    restore();
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [artifactId, list.data, list.isError, list.isFetching, list.isLoading, location, navigate, returnSnapshot]);
  const collectionState: DataTableState | undefined = list.isError ? {
    mode: outputs.length ? "advisory" : "replacement",
    kind: "error",
    title: outputs.length ? "Outputs could not be refreshed" : "Outputs could not be loaded",
    description: outputs.length ? "Previously loaded outputs are still available below." : "Try loading your created outputs again.",
    action: <Button tone="link" onClick={() => void list.refetch()}>Try again</Button>,
    announcement: "polite",
  } : !list.isLoading && outputs.length === 0 ? {
    mode: "replacement",
    kind: filtering ? "filtered-empty" : "empty",
    title: filtering ? "No matching outputs" : "No outputs yet",
    description: filtering ? "Change the search, format, origin, or dates." : "Durable results Kora creates appear here.",
  } : undefined;

  useViewBar(() => ({
    title: "Created",
    meta: outputs.length ? `${outputs.length} shown` : undefined,
  }), [outputs.length]);

  return (
    <section className="outputs-workspace" data-has-selection={Boolean(artifactId)}>
      <aside ref={ledgerRef} className="outputs-ledger" aria-label="Created outputs">
        <PageFrame width="fill" scroll="page">
        <PageHeader title="Created" status={outputs.length ? `${outputs.length} shown` : undefined} />
        <PageToolbar search={<div className="outputs-search-row">
          <SearchField value={query} onValueChange={setQuery} label="Search created outputs" placeholder="Search created outputs" className="outputs-search" />
          {list.isFetching && !list.isLoading && <KoraPresenceMark state="gathering" label="Searching outputs" />}
        </div>} controls={<>
          <KoraSelect
            label="Output format"
            value={format}
            onValueChange={(value) => setFormat(value as FormatFilter)}
            options={[
              { value: "all", label: "All formats" },
              { value: "image", label: "Images" },
              { value: "pdf", label: "PDF" },
              { value: "document", label: "Word" },
              { value: "spreadsheet", label: "Excel" },
              { value: "presentation", label: "PowerPoint" },
              { value: "text", label: "Text & Markdown" },
            ]}
          />
          <KoraSelect
            label="Output origin"
            value={origin}
            onValueChange={(value) => setOrigin(value as OriginFilter)}
            options={[
              { value: "all", label: "Any origin" },
              { value: "conversation", label: "Conversation" },
              { value: "schedule", label: "Scheduled" },
              { value: "unowned", label: "Other Kora output" },
            ]}
          />
        </>} />
        <details className="outputs-date-filter">
          <summary>Date range</summary>
          <div>
            <label><span>From</span><Input type="date" value={createdAfter} onChange={(event) => setCreatedAfter(event.target.value)} /></label>
            <label><span>Through</span><Input type="date" value={createdBefore} onChange={(event) => setCreatedBefore(event.target.value)} /></label>
            {(createdAfter || createdBefore) && <Button tone="link" onClick={() => { setCreatedAfter(""); setCreatedBefore(""); }}>Clear dates</Button>}
          </div>
        </details>
        <div className="outputs-list">
            <DataTable
              caption="Output results"
              rows={sortedOutputs}
              rowKey={(output) => output.id}
              activeRowKey={artifactId}
              returnId={(output) => output.id}
              onOpen={openOutput}
              openLabel={(output) => `Preview ${recordTitle(output.title, fallbackTitle(output))}`}
              sort={sort}
              onSortChange={setSort}
              loading={list.isLoading}
              loadingRows={4}
              state={collectionState}
              mobileSummary={(output) => <span>{outputFormat(output.mediaType)} · {outputOrigin(output)}<br />{previewStateLabel(output.previewState)} · {dateLabel(output.createdAt)}</span>}
              summary={outputs.length ? `${outputs.length} loaded${list.hasNextPage ? " · sorting applies to loaded outputs" : ""}` : undefined}
              onLoadMore={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
              loadingMore={list.isFetchingNextPage}
              loadMoreLabel="Show more"
              columns={[
                {
                  key: "title",
                  header: "Name",
                  width: "auto",
                  cell: (output) => (
                    <span className="outputs-cell-name">
                      <span className="outputs-cell-name__icon" aria-hidden="true">{outputIcon(output.mediaType, 15)}</span>
                      <span className="outputs-cell-name__copy">
                        <strong>{recordTitle(output.title, fallbackTitle(output))}</strong>
                        <small>{outputFormat(output.mediaType)}</small>
                      </span>
                    </span>
                  ),
                  sortable: true,
                },
                {
                  key: "format",
                  header: "Format",
                  width: "10rem",
                  cell: (output) => outputFormat(output.mediaType),
                  sortable: true,
                },
                {
                  key: "origin",
                  header: "Origin",
                  width: "10rem",
                  cell: (output) => outputOrigin(output),
                  sortable: true,
                },
                {
                  key: "state",
                  header: "Preview",
                  width: "8rem",
                  cell: (output) => <Badge>{previewStateLabel(output.previewState)}</Badge>,
                  sortable: true,
                },
                {
                  key: "created",
                  header: "Created",
                  width: "8rem",
                  align: "end",
                  cell: (output) => dateLabel(output.createdAt) ?? "",
                  sortable: true,
                },
              ]}
            />
        </div>
        </PageFrame>
      </aside>
      <div className="output-canvas">
        {artifactId ? <PageHeader className="output-detail-page-header" title="Created" /> : null}
        <AnimatePresence mode="wait" initial={false}>
          {artifactId ? <OutputDetail key={artifactId} artifactId={artifactId} client={client} saveCopy={saveCopy} /> : <motion.div className="output-welcome" key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><FileOutput size={26} /><h2>Choose an output to preview.</h2><p>Open Kora’s durable results, trace where they came from, and save or reuse them.</p></motion.div>}
        </AnimatePresence>
      </div>
    </section>
  );
}
