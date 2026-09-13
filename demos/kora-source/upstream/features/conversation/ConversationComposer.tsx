import { ComposerPrimitive } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUp, Brain, Check, CircleStop, Clock3, Command,
  Image, ImagePlus, Link2, LoaderCircle, Paperclip, Search, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, FileInput, IconButton, Input, Modal, Popover, StateView } from "../../components/primitives";
import { useConnection } from "../../app/connection-context";
import { useAttachmentDraft, useContextDraft, useDraft } from "../../lib/persistence";
import { profileLabel, profileValueSummary } from "../../lib/language";
import { requestSessionTransition } from "../../lib/session-transition";
import {
  runtime,
  type ConversationAttachmentReference,
  type ConversationContextSelection,
  type ConversationRunSnapshot,
  type NativeArtifact,
  type PersonalBrainSearchResult,
} from "../../lib/runtime";
import { applyComposerCompletion, getComposerCompletionContext, getForcedCommandCompletionContext, getSkillCompletionDisplayName, shouldPickComposerCompletion, type ComposerCompletionContext } from "./composer-completion";
import { conversationContextExpired, conversationContextKey, conversationContextReady, mergeConversationContext } from "./conversation-context";
import { DUR, EASE } from "../../lib/motion";
import { ModelControl } from "./ConversationModelControl";

type CommandChoice = { value: string; label: string; syntax?: string; description?: string; disabled: boolean; hint?: string };

const contextDisplayTitle = (display: { objectKind: string; title: string }) =>
  display.objectKind === "profile" ? profileLabel(display.title) : display.title;

const contextKindLabel = (kind: string) => kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function getComposerComboboxProps(listboxId: string, _expanded: boolean, activeOptionId?: string) {
  return {
    "aria-autocomplete": "list" as const,
    "aria-controls": listboxId,
    "aria-haspopup": "listbox" as const,
    ...(activeOptionId ? { "aria-activedescendant": activeOptionId } : {}),
  };
}

function commandOptionId(listboxId: string, value: string) {
  return `${listboxId}-option-${encodeURIComponent(value.trim())}`;
}

function PendingAttachmentPreview({ attachment, onRemove }: { attachment: ConversationAttachmentReference; onRemove: (artifactId: string) => Promise<void> }) {
  const preview = useQuery({
    queryKey: ["conversation-attachment-preview", attachment.artifactId],
    queryFn: () => runtime.artifact(attachment.artifactId),
    staleTime: Infinity,
  });
  const source = preview.data?.data && preview.data.mediaType.startsWith("image/")
    ? `data:${preview.data.mediaType};base64,${preview.data.data}`
    : undefined;
  const name = attachment.name ?? "Image";
  return <motion.span layout className={`pending-attachment${preview.error ? " pending-attachment--error" : ""}`} aria-busy={preview.isLoading || undefined} initial={{ opacity: 0, scale: .94, x: -5 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .94, x: -4 }} transition={{ duration: DUR.base, ease: EASE.out }}>
    <span className="pending-attachment__preview">{source ? <img src={source} alt="" /> : preview.isLoading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : preview.error ? <AlertTriangle size={15} aria-hidden="true" /> : <Image size={15} aria-hidden="true" />}</span>
    <span><strong>{name}</strong><small>{preview.error ? "Preview unavailable — attachment retained" : attachment.mediaType.replace("image/", "").toUpperCase()}</small></span>
    <IconButton label={`Remove ${name}`} onClick={() => void onRemove(attachment.artifactId)}><X size={13} /></IconButton>
  </motion.span>;
}

function PendingContextPreview({
  reference,
  onRemove,
}: {
  reference: ConversationContextSelection;
  onRemove: () => void;
}) {
  const expired = conversationContextExpired(reference);
  const ready = conversationContextReady(reference);
  const title = contextDisplayTitle(reference.display);
  const kind = contextKindLabel(reference.display.objectKind);
  let status: string;
  if (reference.state === "ready") status = expired ? "Expired · reattach" : "Available to Kora";
  else if (reference.state === "approval_required") status = "Approval required";
  else status = reference.reason === "gone" ? "No longer available" : reference.reason === "stale" ? "Changed · reattach" : "Unavailable";
  return <motion.span
    layout
    className="pending-context"
    data-state={ready ? "ready" : reference.state}
    initial={{ opacity: 0, scale: .94, x: -5 }}
    animate={{ opacity: 1, scale: 1, x: 0 }}
    exit={{ opacity: 0, scale: .94, x: -4 }}
    transition={{ duration: DUR.base, ease: EASE.out }}
  >
    {ready ? <Link2 size={14} /> : <AlertTriangle size={14} />}
    <span>{title}</span>
    <small>{kind} · {status}</small>
    <IconButton label={`Remove ${title}`} onClick={onRemove}><X size={13} /></IconButton>
  </motion.span>;
}

export function CommandSurface({ id, choices, context, selected, dismissed, loading, error, noMatches = false, onRetry, onSelected, onPick }: { id: string; choices: CommandChoice[]; context?: ComposerCompletionContext; selected: number; dismissed: boolean; loading: boolean; error?: string; noMatches?: boolean; onRetry: () => void; onSelected: (index: number) => void; onPick: (value: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const open = !dismissed && Boolean(context) && (choices.length > 0 || loading || Boolean(error) || noMatches);
  useEffect(() => {
    if (!open) return;
    const container = list.current;
    const selectedRow = container?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!container || !selectedRow) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = selectedRow.getBoundingClientRect();
    if (rowRect.top < containerRect.top || rowRect.bottom > containerRect.bottom) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  }, [open, selected]);
  return <AnimatePresence initial={false}>
    {open && <motion.div
      ref={list}
      id={id}
      className="command-surface"
      role="listbox"
      aria-label={context?.kind === "inline_skill" ? "Kora skills" : "Kora commands"}
      initial={{ opacity: 0, y: 6, scale: .99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: .995 }}
      transition={{ duration: DUR.quick, ease: EASE.out }}
    >
      <div className="command-surface__head"><span>{context?.kind === "inline_skill" ? "Skills" : "Commands"}</span><small>↑↓ choose · Enter insert · Esc close</small></div>
      {loading && choices.length === 0 && <div className="command-surface__state" role="status"><LoaderCircle className="spin" size={15} />Finding matches…</div>}
      {error && <div className="command-surface__state command-surface__state--error"><AlertTriangle size={15} /><span>Completions are unavailable.</span><Button tone="link" type="button" onClick={onRetry}>Try again</Button></div>}
      {noMatches && !loading && !error && <div className="command-surface__state" role="status"><Search size={15} /><span>No matching commands or skills. Try a different name.</span></div>}
      {choices.map((choice, index) => <Button tone="ghost" id={commandOptionId(id, choice.value)} key={choice.value} role="option" aria-selected={selected === index} disabled={choice.disabled} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => onSelected(index)} onClick={() => onPick(choice.value)}>
        <span className="command-choice__identity"><strong>{choice.label}</strong>{choice.syntax && choice.syntax.trim() !== choice.label.trim() && <code>{choice.syntax}</code>}</span><span className="command-choice__description">{choice.description}</span>{choice.hint && <small>{choice.hint}</small>}
      </Button>)}
    </motion.div>}
  </AnimatePresence>;
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [delay, value]);
  return debounced;
}

function QueueTray({ run }: { run: ConversationRunSnapshot }) {
  if (run.queue.length === 0) return null;
  return <motion.div className="queue-tray" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="queue-tray__label"><Clock3 size={14} />Coming next</div>
    {run.queue.map((entry, index) => <div className="queue-entry" key={entry.id}><span>{index + 1}</span><p>{entry.content || (entry.attachments?.length ? "Image attachment" : "Kora context")}{entry.attachments?.length ? ` · ${entry.attachments.length} image${entry.attachments.length === 1 ? "" : "s"}` : ""}{entry.context?.length ? ` · ${entry.context.length} reference${entry.context.length === 1 ? "" : "s"}` : ""}</p><small>{entry.kind === "steer" ? "Steers this run" : "Runs after this turn"}</small></div>)}
  </motion.div>;
}

export function ContextPicker({
  open,
  onOpenChange,
  selected,
  onAdd,
  client = runtime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: ConversationContextSelection[];
  onAdd: (reference: ConversationContextSelection) => void;
  client?: Pick<typeof runtime, "personalBrainSearchPage">;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 180);
  const search = useQuery({
    queryKey: ["personal-brain-context", debounced],
    queryFn: ({ signal }) => client.personalBrainSearchPage({ query: debounced, pageSize: 30 }, signal),
    enabled: open && debounced.length > 0,
    staleTime: 15_000,
  });
  return <Modal open={open} onOpenChange={onOpenChange} title="Add Kora context" description="Add a Brain or Work reference to this turn.">
    <label className="context-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search Kora context</span><Input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Brain and Work…" />{search.isFetching ? <LoaderCircle size={15} className="spin" /> : <span />}</label>
    {!debounced && <div className="context-picker-empty"><Link2 size={22} /><strong>Choose context for this turn.</strong><p>Kora checks the reference again when you send.</p></div>}
    {search.error && <div className="conversation-recovery"><AlertTriangle size={18} /><div><strong>Context search is unavailable.</strong><p>{(search.error as Error).message}</p></div><Button onClick={() => void search.refetch()}>Try again</Button></div>}
    {debounced && search.data?.state === "ok" && search.data.complete && search.data.results.length === 0 && <div className="context-picker-empty"><Search size={22} /><strong>No matching records</strong><p>Every requested collection completed. Try a project title, person, page, or memory.</p></div>}
    {debounced && search.data && search.data.results.length === 0 && (search.data.state === "partial" || (search.data.state === "ok" && !search.data.complete)) && <StateView state="partial" title="Search may be incomplete" body="Some Brain sources are still loading, so there may be more matches." />}
    {debounced && search.data?.state === "unavailable" && <StateView state="unavailable" title="Context search is unavailable" body="Kora could not reach the requested Brain sources." action={<Button onClick={() => void search.refetch()}>Try again</Button>} />}
    <div className="context-results">{search.data?.results.map((result: PersonalBrainSearchResult) => {
      const chosen = selected.some((item) => "selectionId" in item && "selectionId" in result.context && item.selectionId === result.context.selectionId);
      const usable = conversationContextReady(result.context);
      const preview = result.scope === "profile"
        ? profileValueSummary(result.preview)
        : typeof result.preview === "string"
          ? result.preview.slice(0, 110)
          : undefined;
      return <Button tone="ghost" key={`${result.scope}:${conversationContextKey(result.context)}`} disabled={chosen || !usable} onClick={() => onAdd(result.context)}><span className="context-result__mark"><Link2 size={15} /></span><span><strong>{contextDisplayTitle(result.display)}</strong><small>{result.display.originLabel ?? result.display.objectKind.replaceAll("_", " ")}{preview ? ` · ${preview}` : ""}</small></span><i>{chosen ? "Added" : usable ? "Add" : "Unavailable"}</i></Button>;
    })}</div>
  </Modal>;
}

export function FullComposer({ run, onRun, pendingContext = [], pendingDraft, onContextAttached }: { run?: ConversationRunSnapshot; onRun: (run: ConversationRunSnapshot) => void; pendingContext?: ConversationContextSelection[]; pendingDraft?: string; onContextAttached?: () => void }) {
  const { bootstrap, phase, refresh } = useConnection();
  const { draft, setDraft, discard, selection, setSelection, checkpoint } = useDraft(bootstrap?.session.id, "workspace:/kora");
  const { attachments, setAttachments, discardAttachments, attachmentRecoveryNeeded } = useAttachmentDraft(bootstrap?.session.id, "workspace:/kora");
  const { context, setContext, discardContext, contextRecoveryNeeded } = useContextDraft(bootstrap?.session.id, "workspace:/kora");
  const [contextOpen, setContextOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [mode, setMode] = useState<"next" | "steer">("next");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [steerFallback, setSteerFallback] = useState(false);
  const [commandSelected, setCommandSelected] = useState(0);
  const [commandDismissed, setCommandDismissed] = useState(false);
  const [commandForcedOpen, setCommandForcedOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [composerCursor, setComposerCursor] = useState(draft.length);
  const [transitioning, setTransitioning] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState<string>();
  const [commandDraftNotice, setCommandDraftNotice] = useState(false);
  const appliedTransferKey = useRef<string | undefined>(undefined);
  const acknowledgedTransferKey = useRef<string | undefined>(undefined);
  const commandListboxId = `composer-commands-${useId().replaceAll(":", "")}`;
  const commandDraftNoticeId = `${commandListboxId}-draft-notice`;
  const [restoredDraftNotice, setRestoredDraftNotice] = useState(Boolean(draft.trim() || attachments.length || context.length || contextRecoveryNeeded));
  useEffect(() => {
    setRestoredDraftNotice(Boolean(draft.trim() || attachments.length || context.length || contextRecoveryNeeded));
    // Draft hooks synchronously restore by session key; ordinary typing must not
    // keep reopening this notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.session.id]);
  useEffect(() => {
    const transition = (event: Event) => setTransitioning((event as CustomEvent<{ state?: string }>).detail?.state === "requesting");
    const storageError = (event: Event) => setDraftStorageError((event as CustomEvent<{ message?: string }>).detail?.message ?? "Kora could not checkpoint this draft.");
    window.addEventListener("kora:session-transition", transition);
    window.addEventListener("kora:draft-storage-error", storageError);
    return () => {
      window.removeEventListener("kora:session-transition", transition);
      window.removeEventListener("kora:draft-storage-error", storageError);
    };
  }, []);
  useEffect(() => {
    const setFromAction = (event: Event) => {
      const detail = (event as CustomEvent<{
        text?: string;
        context?: ConversationContextSelection[];
        appendContext?: boolean;
        attachments?: import("../../lib/runtime").ConversationAttachmentReference[];
        contextReceiptCount?: number;
      }>).detail;
      if (typeof detail?.text === "string") setDraft(detail.text);
      if (detail?.context) setContext(detail.appendContext ? mergeConversationContext(context, detail.context) : detail.context);
      if (detail?.attachments) setAttachments(detail.attachments);
      if (detail?.contextReceiptCount) setError("The forked text is ready. Reattach any Brain context you still want Kora to use.");
    };
    window.addEventListener("kora:set-conversation-draft", setFromAction);
    return () => window.removeEventListener("kora:set-conversation-draft", setFromAction);
  }, [context, setAttachments, setContext, setDraft]);
  useEffect(() => {
    const hasPendingTransfer = pendingContext.length > 0 || pendingDraft !== undefined;
    if (!hasPendingTransfer) {
      appliedTransferKey.current = undefined;
      acknowledgedTransferKey.current = undefined;
      return;
    }
    if (!bootstrap?.session.id) return;
    const transferKey = `${pendingDraft ?? ""}\u0000${pendingContext.map(conversationContextKey).join("\u0001")}`;
    const draftMatches = pendingDraft === undefined || draft === pendingDraft;
    const contextMatches = pendingContext.every((pending) => context.some((current) => conversationContextKey(current) === conversationContextKey(pending)));
    if (!draftMatches || !contextMatches) {
      // The persistence hook can replay its session restore after this effect
      // (notably under StrictMode). Keep the transfer pending until the live
      // hook state reflects it, so the restored draft cannot win the race.
      appliedTransferKey.current = transferKey;
      acknowledgedTransferKey.current = undefined;
      if (!draftMatches && pendingDraft !== undefined) setDraft(pendingDraft);
      if (!contextMatches && pendingContext.length) setContext(mergeConversationContext(context, pendingContext));
      return;
    }
    appliedTransferKey.current = transferKey;
    if (acknowledgedTransferKey.current !== transferKey) {
      acknowledgedTransferKey.current = transferKey;
      onContextAttached?.();
    }
  }, [bootstrap?.session.id, context, draft, onContextAttached, pendingContext, pendingDraft, setContext, setDraft]);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  useEffect(() => {
    if (!composerInput.current || !selection) return;
    const input = composerInput.current;
    requestAnimationFrame(() => {
      input.setSelectionRange(selection.start, selection.end, selection.direction);
      input.focus({ preventScroll: true });
    });
  }, [bootstrap?.session.id]);
  const commands = useQuery({ queryKey: ["conversation-commands"], queryFn: runtime.commands, staleTime: 60_000 }).data?.commands ?? [];
  const active = Boolean(run && !run.terminalStatus);
  const completionContext = commandForcedOpen
    ? getForcedCommandCompletionContext(draft)
    : getComposerCompletionContext(draft, composerCursor);
  const debouncedCompletion = useDebouncedValue(completionContext?.input ?? "", 90);
  const completionQuery = useQuery({ queryKey: ["command-completion", debouncedCompletion], queryFn: () => runtime.completeCommand({ input: debouncedCompletion }), enabled: Boolean(completionContext && debouncedCompletion), staleTime: 10_000 });
  const completions = completionQuery.data?.candidates ?? [];
  const visibleCompletions = completionContext?.kind === "inline_skill" ? completions.filter((completion) => completion.value.startsWith("/skill:")) : completions;
  const commandChoices: CommandChoice[] = visibleCompletions.slice(0, 30).map((completion) => {
    const name = completion.value.slice(1).split(/\s+/, 1)[0], definition = commands.find((command) => command.name === name || command.aliases.includes(name));
    const needsArgument = definition?.arguments.length && !completion.value.includes(" ");
    const label = completionContext?.kind === "inline_skill"
      ? getSkillCompletionDisplayName(completion.value)
      : completion.label;
    const syntax = completion.value.trim() === label.trim() ? undefined : completion.value;
    return { value: `${completion.value}${needsArgument ? " " : ""}`, label, syntax, description: completion.description, disabled: Boolean(active && definition?.availability === "idle_only"), ...(active && definition?.availability === "idle_only" ? { hint: "When idle" } : {}) };
  });
  const commandNoMatches = Boolean(completionContext && completionQuery.isFetched && !completionQuery.isFetching && !completionQuery.error && commandChoices.length === 0 && completionContext.input.trim());
  const commandSurfaceOpen = !commandDismissed && Boolean(completionContext) && (commandChoices.length > 0 || completionQuery.isFetching || Boolean(completionQuery.error) || commandNoMatches);
  const activeCommandOptionId = commandSurfaceOpen && commandChoices[commandSelected]
    ? commandOptionId(commandListboxId, commandChoices[commandSelected]!.value)
    : undefined;
  const pickCompletion = (value: string) => {
    if (!completionContext) return;
    const nextDraft = applyComposerCompletion(draft, completionContext, value);
    setDraft(nextDraft);
    setComposerCursor(nextDraft.length);
    setCommandDismissed(true);
    setCommandForcedOpen(false);
    window.requestAnimationFrame(() => {
      composerInput.current?.focus();
      composerInput.current?.setSelectionRange(nextDraft.length, nextDraft.length);
    });
  };
  const contextCanSend = context.every((reference) => conversationContextReady(reference));
  const send = async () => {
    const value = draft.trim();
    if ((!value && attachments.length === 0 && context.length === 0) || busy || !bootstrap) return;
    if (contextRecoveryNeeded) { setError("Reattach or remove the context from this restored draft before sending."); return; }
    if (!contextCanSend) { setError("Every Kora context item must be ready and unexpired before sending."); return; }
    setBusy(true); setError(undefined); setSteerFallback(false);
    try {
      if ((value.startsWith("/") || value.startsWith("!")) && (attachments.length || context.length)) throw new Error("Commands, images, and Kora context must be sent separately.");
      const [sessionCommand, targetSessionId] = value.split(/\s+/, 2);
      if (!active && (sessionCommand === "/new" || sessionCommand === "/resume")) {
        if (sessionCommand === "/resume" && !targetSessionId) throw new Error("Choose a conversation to resume.");
        const transition = await requestSessionTransition({
          kind: sessionCommand === "/new" ? "create" : "resume",
          targetSessionId,
          expectedCurrentSessionId: bootstrap.session.id,
          origin: "command",
        });
        if (transition.state !== "settled") throw new Error(transition.message);
        discard(); discardAttachments(); discardContext();
        await refresh();
        return;
      }
      if (active) {
        if (mode === "steer") await runtime.steer(value, crypto.randomUUID(), attachments, context); else await runtime.followUp(value, crypto.randomUUID(), attachments, context);
        discard(); discardAttachments(); discardContext(); setMode("next");
      } else {
        const visibleMessage = value || (attachments.length ? "Please review this image." : "Please use this Kora context.");
        const content = [{ type: "text" as const, text: visibleMessage }, ...attachments.map((attachment) => ({ type: "image" as const, ...attachment })), ...context.map((reference) => ({ type: "context" as const, reference }))];
        const invocation = value.startsWith("/") || value.startsWith("!") ? { kind: "command" as const, command: value } : { kind: "user_message" as const, content };
        const result = await runtime.createConversationRun({ sessionId: bootstrap.session.id, clientRequestId: crypto.randomUUID(), invocation });
        discard(); discardAttachments(); discardContext(); onRun(result.run);
      }
    } catch (reason) { setError((reason as Error).message); if (active && mode === "steer") setSteerFallback(true); }
    finally { setBusy(false); }
  };
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(undefined);
    if (!bootstrap) return;
    const accepted = [...attachments];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is not a supported image or is larger than 10 MB.`); continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        const ingested = await runtime.ingestConversationAttachment({ sessionId: bootstrap.session.id, attachment: { type: "image", name: file.name, mediaType: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: dataUrl.slice(dataUrl.indexOf(",") + 1) } });
        accepted.push({ artifactId: ingested.artifact.id, mediaType: ingested.artifact.mediaType, name: file.name });
        setAttachments([...accepted]);
      } catch (reason) { setError((reason as Error).message); }
    }
    setAttachments(accepted);
    if (fileInput.current) fileInput.current.value = "";
  };
  const removeAttachment = async (artifactId: string) => {
    setError(undefined);
    try {
      const result = await runtime.deleteConversationAttachment(artifactId);
      if (!result.deleted) throw new Error("The attachment was already removed or is no longer available.");
      setAttachments(attachments.filter((candidate) => candidate.artifactId !== artifactId));
    } catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => {
    const addArtifact = (event: Event) => { void (async () => {
      const detail = (event as CustomEvent<{ artifact?: NativeArtifact; title?: string }>).detail, artifact = detail?.artifact;
      if (!bootstrap || !artifact?.data || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(artifact.mediaType)) return;
      setError(undefined);
      try {
        const ingested = await runtime.ingestConversationAttachment({ sessionId: bootstrap.session.id, attachment: { type: "image", mediaType: artifact.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: artifact.data, name: detail.title ?? "Kora output" } });
        setAttachments([...attachments, { artifactId: ingested.artifact.id, mediaType: ingested.artifact.mediaType, name: detail.title ?? "Kora output" }]);
      } catch (reason) { setError((reason as Error).message); }
    })(); };
    window.addEventListener("kora:add-artifact-to-turn", addArtifact);
    return () => window.removeEventListener("kora:add-artifact-to-turn", addArtifact);
  }, [attachments, bootstrap, setAttachments]);
  return <div className="conversation-compose-region">
    <ContextPicker open={contextOpen} onOpenChange={setContextOpen} selected={context} onAdd={(reference) => { setContext([...context, reference]); setContextOpen(false); }} />
    {run && <QueueTray run={run} />}
    <ComposerPrimitive.Root
      className={`full-composer${active ? " full-composer--active" : ""}${dropActive ? " full-composer--drop-active" : ""}`}
      onSubmit={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDropActive(false);
        void addFiles(event.dataTransfer.files);
      }}
    >
      <AnimatePresence initial={false}>{dropActive && <motion.div className="composer-drop-zone" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><ImagePlus size={18} />Drop images to attach</motion.div>}</AnimatePresence>
      <CommandSurface id={commandListboxId} choices={commandChoices} context={completionContext} selected={commandSelected} dismissed={commandDismissed} loading={completionQuery.isFetching} error={completionQuery.error ? (completionQuery.error as Error).message : undefined} noMatches={Boolean(commandNoMatches)} onRetry={() => void completionQuery.refetch()} onSelected={setCommandSelected} onPick={pickCompletion} />
      {bootstrap?.model.authenticationRequired && <div className="composer-auth"><AlertTriangle size={15} /><span><strong>Model sign-in required</strong>Kora needs provider access before she can respond.</span><Button onClick={() => window.dispatchEvent(new CustomEvent("kora:open-model-control", { detail: { provider: bootstrap.model.provider } }))}>Set up</Button></div>}
      {bootstrap?.model.access.state === "selected_model_unavailable" && <div className="composer-auth"><AlertTriangle size={15} /><span><strong>Selected model unavailable</strong>This account cannot currently use {bootstrap.model.model}.</span><Button onClick={() => window.dispatchEvent(new CustomEvent("kora:open-model-control", { detail: { provider: bootstrap.model.provider } }))}>Review access</Button></div>}
      {attachmentRecoveryNeeded && <div className="composer-error"><AlertTriangle size={14} /><span>Your text is safe. Reattach the files from this draft before sending.</span></div>}
      {contextRecoveryNeeded && <div className="composer-error"><AlertTriangle size={14} /><span>Your text is safe. Context handles expire on restart; find and attach the records again before sending.</span><Button tone="link" type="button" onClick={discardContext}>Remove missing context</Button></div>}
      {restoredDraftNotice && <div className="composer-restored" role="status"><Check size={13} /><span>Draft restored for this conversation</span><IconButton type="button" label="Dismiss restored draft notice" onClick={() => setRestoredDraftNotice(false)}><X size={12} /></IconButton></div>}
      {(attachments.length > 0 || context.length > 0) && <div className="composer-resource-shelves" role="region" aria-label="Images and Kora context attached to this turn">
        <AnimatePresence initial={false}>{attachments.length > 0 && <motion.div className="attachment-shelf" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{attachments.map((attachment) => <PendingAttachmentPreview attachment={attachment} onRemove={removeAttachment} key={attachment.artifactId} />)}</motion.div>}</AnimatePresence>
        <AnimatePresence initial={false}>{context.length > 0 && <motion.div className="context-shelf" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{context.map((reference) => <PendingContextPreview key={conversationContextKey(reference)} reference={reference} onRemove={() => setContext(context.filter((item) => conversationContextKey(item) !== conversationContextKey(reference)))} />)}</motion.div>}</AnimatePresence>
      </div>}
      <ComposerPrimitive.Input ref={composerInput} value={draft} disabled={transitioning} onBlur={() => checkpoint()} onCompositionEnd={(event) => { setDraft(event.currentTarget.value); checkpoint(); }} onChange={(event) => { setDraft(event.target.value); setComposerCursor(event.currentTarget.selectionStart); setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd, direction: event.currentTarget.selectionDirection }); setCommandSelected(0); setCommandDismissed(false); setCommandForcedOpen(false); setCommandDraftNotice(false); }} onSelect={(event) => { setComposerCursor(event.currentTarget.selectionStart); setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd, direction: event.currentTarget.selectionDirection }); }} onPaste={(event) => { if (event.clipboardData.files.length === 0) return; event.preventDefault(); void addFiles(event.clipboardData.files); }} minRows={1} maxRows={8} submitMode="none" placeholder={transitioning ? "Changing conversation…" : active ? mode === "steer" ? "Guide what Kora is doing now…" : "Add something for Kora to do next…" : "Talk to Kora…"} aria-label="Message Kora" aria-busy={transitioning || undefined} {...getComposerComboboxProps(commandListboxId, commandSurfaceOpen, activeCommandOptionId)} onKeyDown={(event) => {
        const commandOpen = !commandDismissed && Boolean(completionContext) && commandChoices.length > 0;
        if (commandOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setCommandSelected((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + commandChoices.length) % commandChoices.length); return; }
         if (commandSurfaceOpen && event.key === "Escape") { event.preventDefault(); setCommandDismissed(true); setCommandForcedOpen(false); return; }
        if (commandOpen && shouldPickComposerCompletion(event.key, event.nativeEvent.isComposing)) { event.preventDefault(); const choice = commandChoices[commandSelected]; if (choice && !choice.disabled) pickCompletion(choice.value); return; }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
      }} />
      <AnimatePresence initial={false}>{commandDraftNotice && <motion.div id={commandDraftNoticeId} className="composer-command-notice" role="status" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: DUR.quick, ease: EASE.out }}><Command size={13} aria-hidden="true" /><span>Send or clear this draft before choosing a command. Your text is unchanged.</span><IconButton type="button" label="Dismiss command notice" onClick={() => setCommandDraftNotice(false)}><X size={12} /></IconButton></motion.div>}</AnimatePresence>
      {error && <div className="composer-error"><AlertTriangle size={14} /><span>{error}</span>{steerFallback && <Button tone="link" onClick={() => { setMode("next"); setSteerFallback(false); setError(undefined); }}>Send next instead</Button>}</div>}
      {draftStorageError && <div className="composer-error" role="alert"><AlertTriangle size={14} /><span>{draftStorageError} Keep this window open while you copy anything important.</span><Button tone="link" type="button" onClick={() => { checkpoint(); setDraftStorageError(undefined); }}>Try again</Button></div>}
      <div className="full-composer__footer">
        <div className="full-composer__tools">
          <FileInput ref={fileInput} className="composer-file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple tabIndex={-1} aria-hidden="true" onChange={(event) => void addFiles(event.target.files)} />
          <Popover open={attachmentMenuOpen} onOpenChange={setAttachmentMenuOpen} side="top" sideOffset={8} align="start" className="composer-add-menu" trigger={<Button tone="ghost" type="button" className="composer-tool-button" aria-label="Add images or Kora context"><Paperclip size={16} /><span>Add</span></Button>}>
              <Button tone="ghost" type="button" onClick={() => { setAttachmentMenuOpen(false); fileInput.current?.click(); }}><ImagePlus size={16} /><span><strong>Choose images</strong><small>Attach from this computer</small></span></Button>
              <Button tone="ghost" type="button" onClick={() => { setAttachmentMenuOpen(false); setContextOpen(true); }}><Brain size={16} /><span><strong>Personal Brain context</strong><small>Reference Brain or Work</small></span></Button>
          </Popover>
          <Button tone="ghost" type="button" className="composer-tool-button" aria-label="Kora commands" aria-describedby={commandDraftNotice ? commandDraftNoticeId : undefined} onClick={() => {
            if (draft.trim()) {
              setCommandDraftNotice(true);
              setCommandForcedOpen(false);
              window.requestAnimationFrame(() => composerInput.current?.focus({ preventScroll: true }));
              return;
            }
            setCommandDraftNotice(false);
            setCommandSelected(0);
            setCommandDismissed(false);
            setCommandForcedOpen((open) => !open);
            window.requestAnimationFrame(() => composerInput.current?.focus());
          }}><Command size={15} /><span>Commands</span></Button>
          <ModelControl active={active} />
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div className="full-composer__actions" key={active ? "active" : "idle"} layout initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: DUR.quick, ease: EASE.out }}>
            {active && <div className="send-mode" role="group" aria-label="Active run message mode"><Button tone="ghost" type="button" aria-pressed={mode === "next"} onClick={() => setMode("next")}>Next</Button><Button tone="ghost" type="button" aria-pressed={mode === "steer"} onClick={() => setMode("steer")}>Steer</Button></div>}
            {active && <ComposerPrimitive.Cancel asChild><Button className="stop-button" disabled={run?.stopRequested}><CircleStop size={15} />{run?.stopRequested ? "Stopping…" : "Stop"}</Button></ComposerPrimitive.Cancel>}
            {!active && attachments.length === 0 && context.length === 0 && !attachmentRecoveryNeeded && !contextRecoveryNeeded
              ? <ComposerPrimitive.Send asChild><IconButton className="send-button" label="Send message" disabled={transitioning || !draft.trim() || busy || (phase !== "ready" && phase !== "degraded")}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={18} strokeWidth={2.2} />}</IconButton></ComposerPrimitive.Send>
              : <IconButton className="send-button" label={active ? mode === "steer" ? "Steer current run" : "Send next" : "Send message"} disabled={transitioning || attachmentRecoveryNeeded || contextRecoveryNeeded || !contextCanSend || (!draft.trim() && attachments.length === 0 && context.length === 0) || busy || (phase !== "ready" && phase !== "degraded")} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={18} strokeWidth={2.2} />}</IconButton>}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="composer-footnote"><span>{active ? mode === "steer" ? "Steer updates the current run immediately." : "Next waits until the current turn is done." : "Enter to send · Shift + Enter for a new line"}</span></div>
    </ComposerPrimitive.Root>
  </div>;
}
