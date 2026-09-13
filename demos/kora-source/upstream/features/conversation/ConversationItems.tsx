import {
  AlertTriangle, ArrowUp, Camera, Check, CheckCheck, ChevronDown, CircleStop, Clipboard, Clock3, Download, ExternalLink, FileText,
  Globe2, Image, KeyRound, Link2, LoaderCircle, MousePointer2, Navigation, Plus, Route, ScanSearch, Search, ShieldCheck, Sparkles, Wrench,
} from "lucide-react";
import { useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Streamdown,
  StreamdownContext,
  extractTableDataFromElement,
  tableDataToCSV,
  tableDataToMarkdown,
  tableDataToTSV,
  type LinkSafetyModalProps,
} from "streamdown";
import "streamdown/styles.css";
import { Button, Input, Menu, Modal, Tooltip } from "../../components/primitives";
import {
  isRemoteDevelopment,
  runtime,
  type ConversationItem,
  type KoraBrainCitationReceipt,
  type NativeArtifact,
} from "../../lib/runtime";
import { DUR, EASE, SPRING } from "../../lib/motion";
import { copyText } from "../../lib/clipboard";

const statusLabel = (status: ConversationItem["status"]) => {
  switch (status) {
    case "queued": return "Queued";
    case "starting": return "Starting";
    case "running": return "Running";
    case "waiting": return "Waiting";
    case "stopped": return "Stopped";
    case "failed": return "Failed";
    case "completed": return "Completed";
  }
};

const statusFallback = (status: ConversationItem["status"]) => {
  switch (status) {
    case "queued": return "Queued; no public detail is available yet.";
    case "starting": return "Starting; no public detail is available yet.";
    case "running": return "In progress; no public detail is available yet.";
    case "waiting": return "Waiting for approval or another input.";
    case "stopped": return "Stopped before a public summary was recorded.";
    case "failed": return "This activity failed before a public summary was recorded.";
    case "completed": return "Completed without additional public detail.";
  }
};

const markdownControls = {
  table: { copy: true, download: true, fullscreen: true },
  code: { copy: true, download: true },
} as const;

type TableCopyFormat = "csv" | "tsv" | "md";
type TableDownloadFormat = "csv" | "markdown";

function tableExportContent(table: HTMLTableElement, format: TableCopyFormat | TableDownloadFormat) {
  const data = extractTableDataFromElement(table);
  if (format === "csv") return { content: tableDataToCSV(data), mediaType: "text/csv", extension: "csv" };
  if (format === "tsv") return { content: tableDataToTSV(data), mediaType: "text/tab-separated-values", extension: "tsv" };
  return { content: tableDataToMarkdown(data), mediaType: "text/markdown", extension: "md" };
}

function TableActions({
  tableRef,
  disabled = false,
  onFullscreen,
}: {
  tableRef: RefObject<HTMLTableElement | null>;
  disabled?: boolean;
  onFullscreen?: () => void;
}) {
  const [feedback, setFeedback] = useState<string>();
  const [error, setError] = useState<string>();

  const runCopy = async (format: TableCopyFormat) => {
    const table = tableRef.current;
    if (!table) return;
    setError(undefined);
    try {
      await copyText(tableExportContent(table, format).content);
      setFeedback(format === "md" ? "Markdown copied" : `${format.toUpperCase()} copied`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const runDownload = (format: TableDownloadFormat) => {
    const table = tableRef.current;
    if (!table) return;
    setError(undefined);
    try {
      const exported = tableExportContent(table, format);
      const url = URL.createObjectURL(new Blob([exported.content], { type: exported.mediaType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kora-table.${exported.extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("Download started");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <div className="streamdown-table-actions">
    <Menu
      trigger={<Button tone="ghost" size="sm" className="streamdown-table-action" disabled={disabled}><Clipboard size={14} aria-hidden="true" /><span>Copy</span></Button>}
      actions={[
        { id: "markdown", label: "Markdown", onSelect: () => void runCopy("md") },
        { id: "csv", label: "CSV", onSelect: () => void runCopy("csv") },
        { id: "tsv", label: "TSV", onSelect: () => void runCopy("tsv") },
      ]}
      className="streamdown-table-menu"
    />
    <Menu
      trigger={<Button tone="ghost" size="sm" className="streamdown-table-action" disabled={disabled}><Download size={14} aria-hidden="true" /><span>Download</span></Button>}
      actions={[
        { id: "csv", label: "CSV", onSelect: () => runDownload("csv") },
        { id: "markdown", label: "Markdown", onSelect: () => runDownload("markdown") },
      ]}
      className="streamdown-table-menu"
    />
    {onFullscreen && <Button tone="ghost" size="sm" className="streamdown-table-action" aria-label="View fullscreen" disabled={disabled} onClick={onFullscreen}><ExternalLink size={14} aria-hidden="true" /><span>Full screen</span></Button>}
    {feedback && <span className="streamdown-table-feedback" role="status">{feedback}</span>}
    {error && <span className="streamdown-table-error" role="alert">Couldn’t export this table. {error}</span>}
  </div>;
}

function KoraMarkdownTable({ children, className, disabled = false }: { children?: ReactNode; className?: string; disabled?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const fullscreenTableRef = useRef<HTMLTableElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  return <>
    <div className="streamdown-table" data-streamdown="table-wrapper">
      <div className="streamdown-table__toolbar"><TableActions tableRef={tableRef} disabled={disabled} onFullscreen={() => setFullscreen(true)} /></div>
      <div className="streamdown-table__scroll"><table ref={tableRef} className={className} data-streamdown="table">{children}</table></div>
    </div>
    <Modal
      open={fullscreen}
      onOpenChange={setFullscreen}
      title="View fullscreen"
      description="Inspect and export this table."
      closeLabel="Exit fullscreen"
      className="streamdown-table-modal"
    >
      <div data-streamdown="table-fullscreen" className="streamdown-table-fullscreen">
        <div role="presentation">
          <div className="streamdown-table-fullscreen__toolbar"><TableActions tableRef={fullscreenTableRef} disabled={disabled} /></div>
          <div className="streamdown-table-fullscreen__scroll" tabIndex={0} aria-label="Scrollable fullscreen table">
            <table ref={fullscreenTableRef} className={className} data-streamdown="table">{children}</table>
          </div>
        </div>
      </div>
    </Modal>
  </>;
}

function MarkdownTableRenderer(props: { children?: ReactNode; className?: string }) {
  const { isAnimating } = useContext(StreamdownContext);
  return <KoraMarkdownTable {...props} disabled={isAnimating} />;
}

const markdownComponents = { table: MarkdownTableRenderer };

function LinkSafetyModal({ isOpen, onClose, onConfirm, url }: LinkSafetyModalProps) {
  const confirm = () => { onConfirm(); onClose(); };
  return <Modal
    open={isOpen}
    onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
    title="Open external link?"
    description="You're about to visit an external website."
    actions={<><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={confirm}>Open link</Button></>}
    className="streamdown-link-safety-modal"
  >
    <p className="streamdown-link-safety-modal__url">{url}</p>
  </Modal>;
}

const markdownLinkSafety = { enabled: true, renderModal: (props: LinkSafetyModalProps) => <LinkSafetyModal {...props} /> };

function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const markdownClassName = `conversation-streamdown-${useId().replaceAll(":", "")}`;
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.querySelector<HTMLElement>(`.${markdownClassName}`);
    if (!root) return undefined;
    const listeners = new Map<HTMLElement, (event: KeyboardEvent) => void>();
    const enhanceScrollableRegions = () => {
      const scrollables = root.querySelectorAll<HTMLElement>('[data-streamdown="table-wrapper"] > :last-child, [data-streamdown="code-block-body"]');
      scrollables.forEach((scrollable) => {
        if (listeners.has(scrollable)) return;
        scrollable.tabIndex = 0;
        scrollable.setAttribute("data-kora-scrollable", "true");
        scrollable.setAttribute("aria-label", scrollable.matches('[data-streamdown="code-block-body"]') ? "Scrollable code block" : "Scrollable table");
        const onKeyDown = (event: KeyboardEvent) => {
          const step = Math.max(48, Math.round(scrollable.clientWidth * 0.75));
          if (event.key === "ArrowLeft") { event.preventDefault(); scrollable.scrollLeft -= step; }
          else if (event.key === "ArrowRight") { event.preventDefault(); scrollable.scrollLeft += step; }
          else if (event.key === "Home") { event.preventDefault(); scrollable.scrollLeft = 0; }
          else if (event.key === "End") { event.preventDefault(); scrollable.scrollLeft = scrollable.scrollWidth; }
        };
        scrollable.addEventListener("keydown", onKeyDown);
        listeners.set(scrollable, onKeyDown);
      });
    };
    enhanceScrollableRegions();
    const observer = new MutationObserver(enhanceScrollableRegions);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      listeners.forEach((onKeyDown, scrollable) => scrollable.removeEventListener("keydown", onKeyDown));
    };
  }, [markdownClassName]);
  const animation = streaming ? { duration: 0, stagger: 0 } : false;
  return <Streamdown
    className={markdownClassName}
    controls={markdownControls}
    animated={animation}
    isAnimating={streaming}
    linkSafety={markdownLinkSafety}
    components={markdownComponents}
  >{children}</Streamdown>;
}

function UserMessage({ item, onForkEdit }: { item: Extract<ConversationItem, { kind: "user_message" }>; onForkEdit?: (item: Extract<ConversationItem, { kind: "user_message" }>) => Promise<void> }) {
  return <div className="conversation-user" aria-label="You">
    {item.content.map((part, index) => part.type === "text"
      ? <p key={index}>{part.text}</p>
      : part.type === "image"
        ? <UserImagePart key={part.artifactId} artifactId={part.artifactId} mediaType={part.mediaType} name={part.name} />
        : <span className="context-chip" key={`${part.reference.display.objectKind}:${part.reference.display.title}:${index}`} data-state={part.reference.state}><Link2 size={13} /><span>{part.reference.display.title}</span><small>{part.reference.display.objectKind.replaceAll("_", " ")} · {part.reference.state}</small></span>)}
    {onForkEdit && <Button tone="ghost" className="user-fork-edit" onClick={() => void onForkEdit(item)}>Fork & edit</Button>}
  </div>;
}

function UserImagePart({ artifactId, mediaType, name }: { artifactId: string; mediaType: string; name?: string }) {
  const [preview, setPreview] = useState<NativeArtifact>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    void runtime.artifact(artifactId).then(
      (artifact) => { if (current) setPreview(artifact); },
      (reason: Error) => { if (current) setError(reason.message); },
    );
    return () => { current = false; };
  }, [artifactId]);
  const title = name ?? "Attached image";
  if (!preview && !error) return <span className="attachment-chip" role="status"><LoaderCircle className="spin" size={14} /><span>{title}</span><small>Loading preview</small></span>;
  if (error || !preview?.data) return <span className="attachment-chip attachment-chip--unavailable"><AlertTriangle size={14} /><span>{title} unavailable</span></span>;
  return <figure className="conversation-user-image"><img src={`data:${preview.mediaType || mediaType};base64,${preview.data}`} alt={title} /><figcaption>{title}</figcaption></figure>;
}

function ActivityItem({ item, showLive = true }: { item: Extract<ConversationItem, { kind: "tool_activity" | "skill_activity" | "capability_activity" }>; showLive?: boolean }) {
  if (item.kind === "tool_activity" && item.toolName.startsWith("browser_"))
    return <BrowserJourneyItem item={item} showLive={showLive} />;
  const Icon = item.kind === "skill_activity" ? Sparkles : item.kind === "capability_activity" ? Route : Wrench;
  const title = item.kind === "tool_activity" ? item.label : item.name;
  const detail = item.kind === "tool_activity" ? item.summary : item.kind === "skill_activity" ? item.description : item.summary;
  const live = item.status === "running" || item.status === "starting";
  const [open, setOpen] = useState(false);
  return <motion.div className={`activity-row activity-row--${item.status}`} layout="position" initial={live ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: DUR.base, ease: EASE.out }}>
    <Button tone="ghost" className="activity-row__summary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="activity-row__icon"><AnimatePresence initial={false} mode="wait"><motion.span key={live ? "live" : item.status} initial={{ opacity: 0, scale: .65 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }} transition={{ duration: DUR.quick, ease: EASE.out }}>{live && showLive ? <span className="activity-row__live" /> : item.status === "failed" ? <AlertTriangle size={15} /> : <Icon size={15} />}</motion.span></AnimatePresence></span>
      <span className="activity-row__title">{title}</span>
      <span className="activity-row__state">{item.status === "completed" ? <span role="img" aria-label="Completed"><Check size={14} /></span> : <>{statusLabel(item.status)}{item.kind === "tool_activity" && item.durationMs !== undefined ? ` · ${item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}` : ""}</>}</span>
      {(detail || item.kind === "tool_activity") && <motion.span className="activity-row__chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: DUR.quick, ease: EASE.out }}><ChevronDown size={14} /></motion.span>}
    </Button>
    <AnimatePresence initial={false}>{open && <motion.div className="activity-row__detail" initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -3 }} transition={{ duration: DUR.base, ease: EASE.out }}>
      <p>{detail?.trim() || statusFallback(item.status)}</p>
      {item.kind === "tool_activity" && <code>{item.toolName}</code>}
    </motion.div>}</AnimatePresence>
  </motion.div>;
}

function BrowserJourneyItem({ item, showLive = true }: { item: Extract<ConversationItem, { kind: "tool_activity" }>; showLive?: boolean }) {
  const live = item.status === "running" || item.status === "starting",
    [open, setOpen] = useState(false),
    { Icon, phase, label } = browserJourneyPresentation(item.toolName, item.label);
  return <motion.div
    className={`browser-journey browser-journey--${item.status}`}
    layout="position"
    initial={live ? { opacity: 0, x: -7, filter: "blur(2px)" } : false}
    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
    transition={{ duration: DUR.base, ease: EASE.out }}
  >
    <Button tone="ghost" type="button" className="browser-journey__summary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="browser-journey__icon"><Icon size={14} />{live && showLive && <i />}</span>
      <span className="browser-journey__copy"><strong>{label}</strong><small>{phase}</small></span>
      <span className="browser-journey__state">{item.status === "completed" ? <span role="img" aria-label="Completed"><Check size={13} /></span> : <>{statusLabel(item.status)}{item.durationMs !== undefined ? ` · ${item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}` : ""}</>}</span>
      <motion.span className="browser-journey__chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: DUR.quick, ease: EASE.out }}><ChevronDown size={13} /></motion.span>
    </Button>
    <AnimatePresence initial={false}>{open && <motion.div className="browser-journey__detail" initial={{ opacity: 0, height: 0, y: -3 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -3 }} transition={{ duration: DUR.base, ease: EASE.out }}>
      <p>{item.summary?.trim() || statusFallback(item.status)}</p>
      <code>{item.toolName}</code>
    </motion.div>}</AnimatePresence>
  </motion.div>;
}

function browserJourneyPresentation(toolName: string, fallback: string) {
  if (toolName === "browser_observe" || toolName === "browser_find")
    return { Icon: ScanSearch, phase: "Reading the live page", label: toolName === "browser_find" ? "Finding the right target" : "Looking at the page" };
  if (toolName === "browser_navigate" || toolName === "browser_tabs" || toolName === "browser_windows")
    return { Icon: Navigation, phase: "Moving through Chrome", label: fallback };
  if (toolName === "browser_fill_secret" || toolName === "browser_saved_credentials")
    return { Icon: KeyRound, phase: "Protected sign-in", label: toolName === "browser_fill_secret" ? "Filling a protected sign-in" : "Checking available sign-ins" };
  if (toolName === "browser_screenshot")
    return { Icon: Camera, phase: "Taking a page snapshot", label: "Capturing the page" };
  if (["browser_click", "browser_type", "browser_select", "browser_check", "browser_hover", "browser_press", "browser_confirmed_action"].includes(toolName))
    return { Icon: MousePointer2, phase: "Acting on the page", label: fallback };
  return { Icon: Globe2, phase: "Using personal Chrome", label: fallback };
}

type Activity = Extract<ConversationItem, { kind: "tool_activity" | "skill_activity" | "capability_activity" }>;
type WorkItem = Activity | Extract<ConversationItem, { kind: "reasoning_summary" }>;

function LiveBarCascade() {
  return <span className="live-bar-cascade" aria-hidden="true"><i /><i /><i /></span>;
}

function WorkGroup({ items }: { items: WorkItem[] }) {
  const live = items.some((item) => item.status === "running" || item.status === "starting");
  const waiting = !live && items.some((item) => item.status === "waiting");
  const failed = items.some((item) => item.status === "failed");
  const stopped = !live && !waiting && !failed && items.some((item) => item.status === "stopped");
  const queued = !live && !waiting && !failed && !stopped && items.some((item) => item.status === "queued");
  const groupStatus = live ? "live" : waiting ? "waiting" : failed ? "failed" : stopped ? "stopped" : queued ? "queued" : "completed";
  const current = [...items].reverse().find((item) => live
    ? item.status === "running" || item.status === "starting"
    : waiting ? item.status === "waiting" : queued && item.status === "queued");
  const currentLabel = current?.kind === "tool_activity" ? current.label : current?.kind === "skill_activity" || current?.kind === "capability_activity" ? current.name : undefined;
  const actionCount = items.filter((item) => item.kind !== "reasoning_summary").length;
  const automaticOpen = live || waiting || failed;
  const [manualOpen, setManualOpen] = useState<boolean>();
  const open = manualOpen ?? automaticOpen;
  const label = live ? currentLabel ?? "Kora is thinking" : waiting ? currentLabel ?? "Kora is waiting" : failed ? "Kora hit a problem" : stopped ? "Kora stopped this work" : queued ? "Kora's work is queued" : "Kora's work";
  const stateKey = `${groupStatus}:${currentLabel ?? "work"}`;
  const stateText = live ? statusLabel(current?.status ?? "running") : groupStatus === "completed" ? statusLabel("completed") : statusLabel(groupStatus as ConversationItem["status"]);
  return <motion.section className={`work-group${live ? " work-group--live" : ""}${waiting ? " work-group--waiting" : ""}${failed ? " work-group--failed" : ""}${stopped ? " work-group--stopped" : ""}${queued ? " work-group--queued" : ""}`} layout transition={{ layout: { duration: DUR.base, ease: EASE.out } }}>
    <Button tone="ghost" className="work-group__trigger" type="button" aria-expanded={open} onClick={() => setManualOpen(!open)}><span className="work-group__mark"><AnimatePresence initial={false} mode="wait"><motion.span key={groupStatus} initial={{ opacity: 0, scale: .62, rotate: -18 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: .7, rotate: 12 }} transition={{ duration: DUR.base, ease: EASE.out }}>{live ? <LiveBarCascade /> : waiting || queued ? <Clock3 size={14} /> : failed ? <AlertTriangle size={14} /> : stopped ? <CircleStop size={14} /> : <Check size={14} />}</motion.span></AnimatePresence></span><span className="work-group__summary"><AnimatePresence initial={false} mode="wait"><motion.strong key={stateKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: DUR.base, ease: EASE.out }}>{label}</motion.strong></AnimatePresence><small>{live || waiting || failed || stopped || queued ? stateText : actionCount > 0 ? `${actionCount} ${actionCount === 1 ? "step" : "steps"}` : "Thinking summary"}</small></span><motion.span className="work-group__chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: DUR.quick, ease: EASE.out }}><ChevronDown size={14} /></motion.span></Button>
    <AnimatePresence initial={false}>{open && <motion.div className="work-group__items" initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }} animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }} exit={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }} transition={{ duration: live ? .26 : DUR.base, ease: EASE.out }}>{items.map((item) => item.kind === "reasoning_summary"
      ? item.content && <motion.div className="work-reasoning" key={item.id} layout="position" initial={item.status === "running" ? { opacity: 0, y: 5 } : false} animate={{ opacity: 1, y: 0 }}><Markdown streaming={item.status === "running"}>{item.content}</Markdown></motion.div>
      : <ActivityItem key={item.id} item={item} showLive={false} />)}</motion.div>}</AnimatePresence>
  </motion.section>;
}

function CommandResult({ item, onExecute }: { item: Extract<ConversationItem, { kind: "command_result" }>; onExecute?: (command: string) => Promise<void> }) {
  const result = item.result;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [optionQuery, setOptionQuery] = useState("");
  const execute = async (value: string) => { if (!onExecute || busy) return; setBusy(value); setError(undefined); try { await onExecute(value); } catch (reason) { setError((reason as Error).message); } finally { setBusy(undefined); } };
  const openSurface = (surface: Extract<typeof result, { kind: "open_surface" }>["surface"], reference?: string) => {
    if (surface === "session_tree") window.dispatchEvent(new CustomEvent("kora:open-session-manager", { detail: { view: "history" } }));
    else if (surface === "model_auth") window.dispatchEvent(new CustomEvent("kora:open-model-control", { detail: { provider: reference } }));
    else window.location.hash = "/settings";
  };
  const copyResult = async (content: string) => { setBusy("clipboard"); setError(undefined); try { await copyText(content); } catch (reason) { setError((reason as Error).message); } finally { setBusy(undefined); } };
  const downloadResult = (fileName: string, mediaType: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mediaType })), anchor = document.createElement("a");
    anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const modelPicker = result.kind === "selection_required" && item.command.trim() === "/model";
  const visibleOptions = result.kind === "selection_required"
    ? result.options.filter((option) => `${option.label} ${option.description ?? ""}`.toLocaleLowerCase().includes(optionQuery.trim().toLocaleLowerCase())).slice(0, 20)
    : [];
  return <section className="command-result" aria-label={`Command ${item.command}`}>
    {result.kind === "message" && <Markdown>{result.content}</Markdown>}
    {result.kind === "facts" && <div className="command-facts"><strong>{result.title}</strong><dl>{result.facts.map((fact) => <div key={fact.label} data-state={fact.state ?? "neutral"}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></div>}
    {result.kind === "selection_required" && (modelPicker
      ? <div className="command-action"><div><strong>{result.title}</strong><p>Choose from Kora's live model catalog with provider and reasoning controls.</p></div><Button onClick={() => openSurface("model_auth")}><Sparkles size={14} />Choose model</Button></div>
      : <div className="command-options"><strong>{result.title}</strong>{result.options.length > 8 && <label className="command-options__search"><Search size={14} /><Input value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} placeholder="Filter options…" aria-label={`Filter ${item.command} options`} /></label>}<div className="command-options__list">{visibleOptions.map((option) => <Button tone="ghost" key={option.id} disabled={Boolean(busy)} onClick={() => void execute(option.value)}><span>{option.label}</span>{option.description && <small>{option.description}</small>}{busy === option.value && <LoaderCircle size={14} className="spin" />}</Button>)}</div>{visibleOptions.length === 0 && <p>No matching options.</p>}{result.options.length > visibleOptions.length && <small className="command-options__count">{optionQuery ? `${visibleOptions.length} of ${result.options.length} options shown` : `Showing the first ${visibleOptions.length} of ${result.options.length} options`}</small>}</div>)}
    {result.kind === "session_changed" && <p>{result.summary ?? "Conversation changed."}</p>}
    {result.kind === "run_started" && <div className="command-action"><div><strong>Kora started the requested work.</strong><p>It is continuing in this conversation.</p></div></div>}
    {result.kind === "open_surface" && <div className="command-open-surface"><p>{result.surface === "session_tree" ? "Open this conversation's canonical history." : result.surface === "model_auth" ? "Open model and provider controls." : `Open ${result.surface.replaceAll("_", " ")}.`}</p><Button onClick={() => openSurface(result.surface, result.reference)}>Open</Button></div>}
    {result.kind === "clipboard" && <div className="command-action"><div><strong>{result.label}</strong><p>Ready to copy from this conversation.</p></div><Button disabled={Boolean(busy)} onClick={() => void copyResult(result.content)}><Clipboard size={14} />{busy === "clipboard" ? "Copying…" : "Copy"}</Button></div>}
    {result.kind === "download" && <div className="command-action"><div><strong>{result.summary}</strong><p>{result.fileName}</p></div><Button onClick={() => downloadResult(result.fileName, result.mediaType, result.content)}><Download size={14} />Save HTML</Button></div>}
    {result.kind === "external_link" && <div className="command-action"><div><strong>{result.summary ?? "Private share is ready."}</strong><p>{result.label}</p></div><Button onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}><ExternalLink size={14} />Open</Button></div>}
    {result.kind === "failure" && <div className="command-failure" role="alert"><AlertTriangle size={17} /><div><strong>{result.title}</strong><p>{result.message}</p><code>{result.code}</code></div></div>}
    {result.kind === "completed" && <p>{result.summary ?? "Command completed."}</p>}
    {error && <p className="item-failure"><AlertTriangle size={14} />{error}</p>}
  </section>;
}

function ApprovalItem({ item, onResolve }: { item: Extract<ConversationItem, { kind: "approval" }>; onResolve?: (item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => Promise<void> }) {
  const resolved = Boolean(item.resolvedAs);
  const [busy, setBusy] = useState<"approved" | "rejected">();
  const [error, setError] = useState<string>();
  const resolve = async (disposition: "approved" | "rejected") => { if (!onResolve || busy) return; setBusy(disposition); setError(undefined); try { await onResolve(item, disposition); } catch (reason) { setError((reason as Error).message); } finally { setBusy(undefined); } };
  return <motion.div
    className={`approval-item${resolved ? " approval-item--resolved" : ""}`}
    aria-label={resolved ? "Approval resolved" : "Approval required"}
    {...(!resolved ? { role: "alert" as const } : {})}
    initial={!resolved ? { opacity: 0, y: 10, scale: .985 } : false}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={SPRING.ui}
  >
    <div className="approval-item__mark"><ShieldCheck size={19} /></div>
    <div className="approval-item__copy"><span>{resolved ? "Decision recorded" : "Your approval is needed"}</span><h3>{item.title}</h3><p><strong>{item.target}</strong> — {item.consequence}</p>{item.expiresAt && !resolved && <small><Clock3 size={13} />Expires {new Date(item.expiresAt).toLocaleString()}</small>}</div>
    {!resolved && <div className="approval-item__actions"><Button disabled={!onResolve || Boolean(busy)} onClick={() => void resolve("rejected")}>{busy === "rejected" ? "Rejecting…" : "Reject"}</Button><Button tone="primary" disabled={!onResolve || Boolean(busy)} onClick={() => void resolve("approved")}>{busy === "approved" ? "Approving…" : "Approve & continue"}</Button></div>}
    {resolved && <span className="approval-resolution"><Check size={14} />{item.resolvedAs}</span>}
    {error && <p className="approval-item__error"><AlertTriangle size={13} />{error}</p>}
  </motion.div>;
}

function artifactFormatLabel(mediaType: string) {
  const labels: Record<string, string> = {
    "application/pdf": "PDF document",
    "application/json": "JSON document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel workbook",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint presentation",
    "text/html": "HTML document",
    "text/markdown": "Markdown document",
    "text/plain": "Plain text",
  };
  if (labels[mediaType]) return labels[mediaType];
  if (mediaType.startsWith("image/")) return "Image";
  if (mediaType.startsWith("audio/")) return "Audio";
  if (mediaType.startsWith("video/")) return "Video";
  return mediaType;
}

type ArtifactAction = "open" | "save" | "copy" | "context";

function ArtifactItem({ item }: { item: Extract<ConversationItem, { kind: "artifact" }> }) {
  const [artifact, setArtifact] = useState<NativeArtifact>();
  const [previews, setPreviews] = useState<NativeArtifact[]>([]);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<{ action: ArtifactAction; message: string }>();
  const [actionNotice, setActionNotice] = useState<ArtifactAction>();
  const [showSource, setShowSource] = useState(false);
  const [actionBusy, setActionBusy] = useState<ArtifactAction>();
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);
  const inspect = async () => {
    const currentRequest = ++requestId.current;
    setOpen(true); setLoadError(undefined);
    try {
      const detail = await runtime.artifact(item.artifact.id);
      if (currentRequest !== requestId.current) return;
      setArtifact(detail);
      setShowSource(false);
      const nextPreviews = await Promise.all((detail.previews ?? []).map((preview) => runtime.artifact(preview.id)));
      if (currentRequest === requestId.current) setPreviews(nextPreviews);
    } catch (reason) {
      if (currentRequest === requestId.current) setLoadError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const runAction = async <T,>(action: ArtifactAction, task: () => Promise<T> | T) => {
    setActionBusy(action); setActionError(undefined); setActionNotice(undefined);
    try { await task(); setActionNotice(action); }
    catch (reason) { setActionError({ action, message: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setActionBusy(undefined); }
  };
  const openInWindows = () => runAction("open", () => runtime.openArtifact(item.artifact.id));
  const saveCopy = () => {
    if (!artifact) return;
    void runAction("save", () => {
      const bytes = artifact.data ? Uint8Array.from(atob(artifact.data), (value) => value.charCodeAt(0)) : artifact.text !== undefined ? new TextEncoder().encode(artifact.text) : undefined;
      if (!bytes) throw new Error("This artifact is too large to export from the conversation preview.");
      const extension = ({ "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/plain": "txt", "text/markdown": "md" } as Record<string, string>)[artifact.mediaType] ?? "bin";
      const baseName = (artifact.title ?? item.artifact.title ?? "kora-output").replace(/[^a-z0-9._-]+/gi, "-").replace(new RegExp(`\\.${extension}$`, "i"), "");
      const url = URL.createObjectURL(new Blob([bytes], { type: artifact.mediaType }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${baseName}.${extension}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };
  const addToTurn = () => {
    if (!artifact?.data || !artifact.mediaType.startsWith("image/")) return;
    void runAction("context", () => { window.dispatchEvent(new CustomEvent("kora:add-artifact-to-turn", { detail: { artifact, title: item.artifact.title } })); setOpen(false); });
  };
  const copyArtifact = () => {
    if (artifact?.text === undefined) return;
    void runAction("copy", () => copyText(artifact.text!));
  };
  const retryAction = () => {
    if (!actionError) return;
    if (actionError.action === "open") void openInWindows();
    else if (actionError.action === "save") saveCopy();
    else if (actionError.action === "copy") copyArtifact();
    else addToTurn();
  };
  const title = artifact?.title ?? item.artifact.title ?? "Kora output";
  const format = artifactFormatLabel(artifact?.mediaType ?? item.artifact.mediaType);
  const actionLabel = actionError?.action === "open" ? "open this output" : actionError?.action === "save" ? "save a copy" : actionError?.action === "copy" ? "copy this text" : "add this image to the next turn";
  return <><Button tone="ghost" className="artifact-item" onClick={() => void inspect()}>
    <span className="artifact-item__icon"><FileText size={19} /></span>
    <span><strong>{item.artifact.title ?? format}</strong><small>{format}{item.provenance ? ` · ${item.provenance}` : ""}</small></span>
    <ArrowUp size={16} />
  </Button><Modal open={open} onOpenChange={setOpen} title={title} description={`${format}${item.provenance ? ` · ${item.provenance}` : ""}`}>
    {!artifact && !loadError && <div className="artifact-preview-loading"><LoaderCircle className="spin" size={18} />Loading verified output…</div>}
    {loadError && <div className="artifact-preview-error" role="alert"><AlertTriangle size={18} /><div><strong>Output could not be loaded.</strong><p>{loadError}</p></div><Button onClick={() => void inspect()}>Retry loading</Button></div>}
    {artifact?.data && artifact.mediaType.startsWith("image/") && <img className="artifact-preview-image" src={`data:${artifact.mediaType};base64,${artifact.data}`} alt={title} />}
    {previews.length > 0 && <div className="artifact-preview-pages" aria-label={`${title} preview`}>
      {previews.map((preview, index) => preview.data && <figure key={preview.id}><img src={`data:${preview.mediaType};base64,${preview.data}`} alt={`${title}, page ${index + 1}`} /><figcaption>Page {index + 1}</figcaption></figure>)}
    </div>}
    {artifact?.text !== undefined && (artifact.mediaType === "text/markdown" ? <div className="artifact-preview-markdown"><div className="artifact-preview-markdown__toolbar"><strong>Rendered Markdown</strong><Button tone="ghost" aria-pressed={showSource} onClick={() => setShowSource((value) => !value)}>{showSource ? "Show rendered" : "Show source"}</Button></div>{showSource ? <pre className="artifact-preview-text">{artifact.text}</pre> : <div className="artifact-preview-markdown__content assistant-message"><Markdown>{artifact.text}</Markdown></div>}</div> : <pre className="artifact-preview-text">{artifact.text}</pre>)}
    {artifact && previews.length === 0 && !artifact.data && artifact.text === undefined && <div className="artifact-preview-unsupported"><FileText size={24} /><strong>Preview isn’t available for this format.</strong><p>The saved output is still available through its actions below.</p></div>}
    {artifact && <dl className="artifact-preview-meta"><div><dt>Format</dt><Tooltip content={artifact.mediaType}><dd>{format}</dd></Tooltip></div><div><dt>Size</dt><dd>{artifact.byteSize.toLocaleString()} bytes</dd></div><div><dt>Created</dt><dd>{new Date(artifact.createdAt).toLocaleString()}</dd></div></dl>}
    {actionError && <div className="artifact-action-error" role="alert"><AlertTriangle size={16} /><div><strong>Couldn’t {actionLabel}.</strong><p>{actionError.message}</p></div><Button onClick={retryAction}>Retry {actionError.action === "open" ? "open" : actionError.action === "save" ? "save" : actionError.action === "copy" ? "copy" : "add"}</Button></div>}
    {actionNotice && <p className="artifact-action-success" role="status">{actionNotice === "copy" ? "Copied to clipboard." : actionNotice === "save" ? "Download started." : actionNotice === "open" ? "Open request sent." : "Added to the next turn."}</p>}
    {artifact && <div className="artifact-preview-actions"><Button disabled={Boolean(actionBusy)} onClick={() => void openInWindows()}><ExternalLink size={14} />{actionBusy === "open" ? "Opening…" : isRemoteDevelopment ? "Open on host PC" : "Open in Windows"}</Button><Button disabled={Boolean(actionBusy) || (!artifact.data && artifact.text === undefined)} onClick={saveCopy}><Download size={14} />{actionBusy === "save" ? "Saving…" : actionNotice === "save" ? "Save another copy" : "Save a copy"}</Button>{artifact.text !== undefined && <Button disabled={Boolean(actionBusy)} onClick={copyArtifact}><Clipboard size={14} />{actionBusy === "copy" ? "Copying…" : actionNotice === "copy" ? "Copied" : "Copy text"}</Button>}<Button disabled={Boolean(actionBusy) || !artifact.data || !artifact.mediaType.startsWith("image/")} tone="primary" onClick={addToTurn}><Plus size={14} />Add to next turn</Button></div>}
  </Modal></>;
}

export type BrainCitationInspectionHandler = (citation: KoraBrainCitationReceipt) => void;

export function ConversationItemView({ item, onResolveApproval, onExecuteCommand, onForkEdit, onInspectCitation }: { item: ConversationItem; onResolveApproval?: (item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => Promise<void>; onExecuteCommand?: (command: string) => Promise<void>; onForkEdit?: (item: Extract<ConversationItem, { kind: "user_message" }>) => Promise<void>; onInspectCitation?: BrainCitationInspectionHandler }) {
  if (item.kind === "user_message") return <UserMessage item={item} onForkEdit={onForkEdit} />;
  if (item.kind === "assistant_message") return item.content.trim() ? <AssistantMessage item={item} onInspectCitation={onInspectCitation} /> : null;
  if (item.kind === "reasoning_summary") return <WorkGroup items={[item]} />;
  if (item.kind === "tool_activity" || item.kind === "skill_activity" || item.kind === "capability_activity") return <ActivityItem item={item} />;
  if (item.kind === "command_result") return <CommandResult item={item} onExecute={onExecuteCommand} />;
  if (item.kind === "approval") return <ApprovalItem item={item} onResolve={onResolveApproval} />;
  if (item.kind === "artifact") return <ArtifactItem item={item} />;
  return <div className="conversation-recovery" role="status"><AlertTriangle size={18} /><div><strong>Kora can’t display this activity yet.</strong><p>The unsupported item stayed hidden without exposing its private payload.</p></div></div>;
}

type AssistantMessageItem = Extract<ConversationItem, { kind: "assistant_message" }>;
type CitationStatus = KoraBrainCitationReceipt["status"] | "invalid";

function isUtf16Boundary(content: string, index: number) {
  if (index <= 0 || index >= content.length) return true;
  const previous = content.charCodeAt(index - 1), next = content.charCodeAt(index);
  return !(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF);
}

function citationSnippet(content: string, citation: KoraBrainCitationReceipt) {
  const { start, end, unit } = citation.statement;
  if (
    unit !== "utf16_code_unit"
    || !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end <= start
    || end > content.length
    || !isUtf16Boundary(content, start)
    || !isUtf16Boundary(content, end)
  ) return undefined;
  const snippet = content.slice(start, end).trim();
  return snippet || undefined;
}

function citationStateCopy(status: CitationStatus) {
  switch (status) {
    case "supported": return { label: "Verified for this reply", detail: "Kora verified this source when the response completed." };
    case "deferred": return { label: "Not read in this turn", detail: "This evidence does not support the quoted statement yet. Ask Kora to revisit it in a follow-up." };
    case "changed": return { label: "Changed since this reply", detail: "Ask Kora to verify the current source before relying on the quoted statement." };
    case "gone": return { label: "Source no longer available", detail: "Choose another source or ask Kora to answer without this evidence." };
    case "expired": return { label: "Evidence access expired", detail: "Ask Kora to refresh access before using this evidence again." };
    case "unavailable": return { label: "Temporarily unavailable", detail: "Try again later, or ask Kora to answer without this evidence." };
    case "invalid": return { label: "Statement link unavailable", detail: "The reply remains readable. Ask Kora to verify this statement again." };
  }
}

function CitationStatusIcon({ status }: { status: CitationStatus }) {
  if (status === "supported") return <Check size={14} aria-hidden="true" />;
  if (status === "deferred" || status === "expired") return <Clock3 size={14} aria-hidden="true" />;
  return <AlertTriangle size={14} aria-hidden="true" />;
}

function BrainCitationDisclosure({ item, onInspectCitation }: { item: AssistantMessageItem; onInspectCitation?: BrainCitationInspectionHandler }) {
  const receipts = item.citations ?? [];
  const disclosureId = useId();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (receipts.length === 0 && !item.grounding) return null;

  const citations = receipts.map((receipt) => {
    const snippet = citationSnippet(item.content, receipt);
    return { receipt, snippet, status: snippet ? receipt.status : "invalid" as const };
  });
  const supportedCount = citations.filter(({ status }) => status === "supported").length;
  const needsAttention = citations.some(({ status }) => status !== "supported");
  const hasUsableReceipt = citations.some(({ status }) => status !== "invalid");
  const grounding = item.grounding === "unsupported"
    ? supportedCount > 0 ? "partial" : "unsupported"
    : (item.grounding === "partial" || needsAttention) && hasUsableReceipt
      ? "partial"
      : supportedCount > 0 && supportedCount === citations.length
        ? "supported"
        : "unsupported";
  const sourceLabel = `${citations.length} ${citations.length === 1 ? "source" : "sources"}`;
  const summary = grounding === "supported"
    ? sourceLabel
    : grounding === "partial"
      ? "Evidence needs attention"
      : "Evidence is not available for this answer";

  return <section className="brain-citations" data-grounding={grounding} aria-label="Evidence for Kora's response">
    <Button
      tone="ghost"
      className="brain-citations__trigger"
      type="button"
      aria-expanded={open}
      aria-controls={disclosureId}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="brain-citations__mark"><CitationStatusIcon status={grounding === "supported" ? "supported" : grounding === "partial" ? "changed" : "unavailable"} /></span>
      <span>{summary}</span>
      {grounding !== "supported" && citations.length > 0 && <small>{sourceLabel}</small>}
      <motion.span className="brain-citations__chevron" animate={{ rotate: open && !reduceMotion ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : DUR.quick, ease: EASE.out }}><ChevronDown size={14} aria-hidden="true" /></motion.span>
    </Button>
    <AnimatePresence initial={false}>{open && <motion.div
      id={disclosureId}
      className="brain-citations__content"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }}
      transition={{ duration: reduceMotion ? 0 : DUR.quick, ease: EASE.out }}
    >
      {citations.length > 0
        ? <ul className="brain-citations__list">{citations.map(({ receipt, snippet, status }, index) => {
          const copy = citationStateCopy(status);
          return <li className="brain-citation" data-state={status} key={`${receipt.display.objectKind}:${receipt.display.title}:${index}`}>
            <div className="brain-citation__heading">
              <span className="brain-citation__icon"><CitationStatusIcon status={status} /></span>
              <span><strong>{receipt.display.title}</strong><small>{receipt.display.originLabel ?? receipt.display.objectKind.replaceAll("_", " ")}</small></span>
              <span className="brain-citation__status">{copy.label}</span>
            </div>
            {snippet && <blockquote className="brain-citation__statement">{snippet}</blockquote>}
            <p>{copy.detail}</p>
            {onInspectCitation && snippet && <Button tone="link" className="brain-citation__inspect" onClick={() => onInspectCitation(receipt)}>Inspect evidence</Button>}
          </li>;
        })}</ul>
        : <p className="brain-citations__empty">Kora could not verify usable evidence for this answer.</p>}
      {!onInspectCitation && <p className="brain-citations__availability">Deeper evidence opening is not available in this build.</p>}
    </motion.div>}</AnimatePresence>
  </section>;
}

function AssistantMessage({ item, onInspectCitation }: { item: AssistantMessageItem; onInspectCitation?: BrainCitationInspectionHandler }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string>();
  const copy = async () => {
    setCopyError(undefined);
    try { await copyText(item.content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch (reason) { setCopyError((reason as Error).message); }
  };
  return <motion.div className={`assistant-message assistant-message--${item.status}`} aria-label="Kora" layout="position" initial={item.status === "running" ? { opacity: 0, y: 5 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE.out }}><Markdown streaming={item.status === "running"}>{item.content}</Markdown><AnimatePresence initial={false}>{item.status === "running" && <motion.span className="stream-caret" initial={{ opacity: 0, scaleY: .4 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: .4 }} />}</AnimatePresence>{item.status === "failed" && <p className="item-failure"><AlertTriangle size={15} />Kora couldn’t complete this response.</p>}<BrainCitationDisclosure item={item} onInspectCitation={onInspectCitation} />{item.status === "completed" && item.content && <Button tone="ghost" className="message-copy" onClick={() => void copy()} aria-label="Copy Kora's response">{copied ? <CheckCheck size={13} /> : <Clipboard size={13} />}{copied ? "Copied" : "Copy"}</Button>}{copyError && <p className="message-copy-error" role="alert"><AlertTriangle size={13} />Couldn’t copy this response. {copyError}</p>}</motion.div>;
}

export function responseItems(items: ConversationItem[], onResolveApproval?: (item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => Promise<void>, onExecuteCommand?: (command: string) => Promise<void>, onInspectCitation?: BrainCitationInspectionHandler) {
  const output: React.ReactNode[] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (item.kind === "reasoning_summary" || item.kind === "tool_activity" || item.kind === "skill_activity" || item.kind === "capability_activity") {
      const work: WorkItem[] = [];
      while (index < items.length) {
        const candidate = items[index];
        if (candidate.kind === "assistant_message" && !candidate.content.trim()) { index += 1; continue; }
        if (candidate.kind !== "reasoning_summary" && candidate.kind !== "tool_activity" && candidate.kind !== "skill_activity" && candidate.kind !== "capability_activity") break;
        work.push(candidate); index += 1;
      }
      output.push(<WorkGroup key={`work:${work[0].id}`} items={work} />);
      continue;
    }
    output.push(<ConversationItemView key={item.id} item={item} onResolveApproval={onResolveApproval} onExecuteCommand={onExecuteCommand} onInspectCitation={onInspectCitation} />); index += 1;
  }
  return output;
}
