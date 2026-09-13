import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleStop, LoaderCircle, MessageSquareText, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Disclosure, IconButton, KoraPresenceMark, Modal } from "../../components/primitives";
import { useConnection } from "../../app/connection-context";
import { runtime, type BrainCitationEvidenceInspection, type BrainCitationTraceSummary, type CanonicalConversationTurn, type ConversationContextSelection, type ConversationItem, type ConversationRunSnapshot, type ConversationTranscript, type KoraBrainCitationReceipt } from "../../lib/runtime";
import { applyConversationEvent, isConversationRunLive, phaseCopy } from "./conversation-model";
import { canonicalTurnSettlesRun, reconcileConversationMessages } from "./conversation-reconciliation";
import { KoraAssistantThread } from "./KoraAssistantThread";
import { SessionScopedComposer } from "./SessionScopedComposer";
import { ConversationItemView, responseItems } from "./ConversationItems";
import "./conversation.css";
import { DUR, EASE } from "../../lib/motion";
import { useViewBar } from "../../app/ViewBar";
import { conversationTitle } from "./conversation-session";
import { placeConversationAtLatest } from "./conversation-viewport";
import { useConversationRunState } from "./conversation-run-state";
import { conversationFailureRecovery, conversationRetryAttempt, createModelAccessEvent, type ConversationRetryAttempt } from "./conversation-recovery";

function turnTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type EvidenceInspectionView =
  | { phase: "loading"; display: KoraBrainCitationReceipt["display"] }
  | { phase: "settled"; inspection: BrainCitationEvidenceInspection };

const evidenceStateCopy: Record<Exclude<BrainCitationEvidenceInspection["state"], "ready">, { title: string; detail: string }> = {
  denied: {
    title: "Evidence access was denied",
    detail: "Kora could not access this source, so no source text is shown.",
  },
  deferred: {
    title: "This source was not read",
    detail: "The reply linked this source, but Kora did not read an exact window from it during that turn.",
  },
  changed: {
    title: "The cited evidence changed",
    detail: "The exact window used for this reply no longer matches the current source, so Kora will not show stale text as current.",
  },
  gone: {
    title: "The cited evidence is gone",
    detail: "The original source is no longer available. No cached source text is shown.",
  },
  expired: {
    title: "Evidence access expired",
    detail: "The original citation receipt is no longer valid. Re-open the source in a new turn to use current evidence.",
  },
  unavailable: {
    title: "Evidence is unavailable",
    detail: "Kora cannot safely open this citation receipt. The source text remains hidden.",
  },
};

function traceTruth(trace?: BrainCitationTraceSummary) {
  if (!trace) return "No usable read trace is available for this receipt.";
  const exact = trace.sourceWasCited
    ? "This exact source window was read and cited in the reply."
    : trace.sourceWasRead
      ? "This exact source window was read, but it was not cited in the reply."
      : "This source was not read for the reply.";
  return `${exact} Turn totals: ${trace.readCount} read, ${trace.citedCount} cited.`;
}

export function ConversationEvidenceInspector({
  open,
  view,
  onOpenChange,
}: {
  open: boolean;
  view?: EvidenceInspectionView;
  onOpenChange: (open: boolean) => void;
}) {
  const display = view?.phase === "loading"
    ? view.display
    : view?.inspection.display;
  return <Modal
    open={open}
    onOpenChange={onOpenChange}
    title="Evidence used for this reply"
    description="A live check of the exact source window Kora actually used."
    className="conversation-evidence-modal"
  >
    {view?.phase === "loading" && <div className="evidence-inspection-state" role="status"><LoaderCircle className="spin" size={18} /><div><strong>Checking the original evidence…</strong><p>Kora is revalidating the citation before showing any source text.</p></div></div>}
    {view?.phase === "settled" && view.inspection.state === "ready" && <div className="evidence-inspection-ready">
      <div className="evidence-inspection-source"><span><Check size={15} aria-hidden="true" /></span><div><strong>{view.inspection.display.title}</strong><small>{view.inspection.display.originLabel ?? view.inspection.display.objectKind.replaceAll("_", " ")}</small></div></div>
      <p className="evidence-inspection-truth">{traceTruth(view.inspection.trace)}</p>
      <pre className="evidence-inspection-excerpt" aria-label="Exact cited excerpt">{view.inspection.excerpt.text}</pre>
    </div>}
    {view?.phase === "settled" && view.inspection.state !== "ready" && <div className="evidence-inspection-state evidence-inspection-state--non-current" role="status" data-state={view.inspection.state}>
      <ShieldAlert size={20} aria-hidden="true" />
      <div><strong>{evidenceStateCopy[view.inspection.state].title}</strong>{display && <small>{display.title}</small>}<p>{evidenceStateCopy[view.inspection.state].detail}</p>{view.inspection.trace && <p className="evidence-inspection-truth">{traceTruth(view.inspection.trace)}</p>}</div>
    </div>}
  </Modal>;
}

export function useConversationEvidenceInspector() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<EvidenceInspectionView>();
  const requestSequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    requestSequence.current += 1;
    setOpen(false);
    setView(undefined);
    queueMicrotask(() => returnFocus.current?.focus());
  }, []);
  const onOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) setOpen(true);
    else close();
  }, [close]);
  const inspect = useCallback((citation: KoraBrainCitationReceipt) => {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    const sequence = ++requestSequence.current,
      display = { ...citation.display };
    setView({ phase: "loading", display });
    setOpen(true);
    void runtime.inspectConversationCitation({
      citationHandle: citation.citationHandle,
      traceHandle: citation.traceHandle,
    }).then(({ inspection }) => {
      if (requestSequence.current === sequence) setView({ phase: "settled", inspection });
    }).catch(() => {
      if (requestSequence.current === sequence)
        setView({ phase: "settled", inspection: { state: "unavailable", display } });
    });
  }, []);
  return { open, view, inspect, onOpenChange, close };
}

export function ConversationWorkspace({ pendingContext = [], pendingDraft, onContextAttached, conversationRailControlId }: {
  pendingContext?: ConversationContextSelection[];
  pendingDraft?: string;
  onContextAttached?: () => void;
  conversationRailControlId?: string;
} = {}) {
  const { bootstrap, refresh } = useConnection();
  const queryClient = useQueryClient();
  const sessionId = bootstrap?.session.id;
  const transcript = useQuery<ConversationTranscript>({ queryKey: ["conversation-transcript", sessionId], queryFn: () => runtime.conversationTranscript(sessionId), enabled: Boolean(sessionId) });
  const [olderTurns, setOlderTurns] = useState<CanonicalConversationTurn[]>([]);
  const [olderPage, setOlderPage] = useState<ConversationTranscript["page"]>();
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState<string>();
  const visibleTurns = useMemo(() => {
    const byId = new Map<string, CanonicalConversationTurn>();
    for (const turn of olderTurns) byId.set(turn.id, turn);
    for (const turn of transcript.data?.turns ?? []) byId.set(turn.id, turn);
    return [...byId.values()];
  }, [olderTurns, transcript.data?.turns]);
  const [run, setRun] = useConversationRunState({
    sessionId,
    bootstrapSnapshot: bootstrap?.run.snapshot,
    canonicalTurns: visibleTurns,
  });
  const [streamError, setStreamError] = useState<string>();
  const [userAwayFromBottom, setUserAwayFromBottom] = useState(false);
  const evidenceInspector = useConversationEvidenceInspector();
  const viewport = useRef<HTMLDivElement>(null);
  const retryAttempt = useRef<ConversationRetryAttempt | undefined>(undefined);
  const refreshConversation = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["conversation-transcript"] });
    await refresh();
  }, [queryClient, refresh]);
  const acceptRun = useCallback((nextRun: ConversationRunSnapshot) => {
    setRun(nextRun);
    if (!nextRun.terminalStatus) return;
    void refreshConversation();
  }, [refreshConversation]);
  const executeCommand = useCallback(async (command: string) => {
    if (!bootstrap) throw new Error("Kora's foreground conversation is unavailable.");
    const result = await runtime.createConversationRun({ sessionId: bootstrap.session.id, clientRequestId: crypto.randomUUID(), invocation: { kind: "command", command } });
    acceptRun(result.run);
  }, [acceptRun, bootstrap]);
  const resolveApproval = useCallback(async (item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => {
    if (!bootstrap) throw new Error("Kora’s foreground conversation is unavailable.");
    const result = disposition === "approved" ? await runtime.approveToolConfirmation(item.approvalId) : await runtime.rejectToolConfirmation(item.approvalId);
    if (!result.confirmation) throw new Error("This approval has already changed or expired.");
    setRun((current) => current ? { ...current, items: current.items.map((candidate) => candidate.kind === "approval" && candidate.approvalId === item.approvalId ? { ...candidate, status: "completed", resolvedAs: disposition } : candidate) } : current);
    await queryClient.invalidateQueries({ queryKey: ["conversation-transcript", sessionId] });
    await refresh();
  }, [bootstrap, queryClient, refresh, sessionId]);
  const forkAndEdit = useCallback(async (item: Extract<ConversationItem, { kind: "user_message" }>) => {
    setStreamError(undefined);
    try {
      const forked = await runtime.forkSession(item.id, "before"), text = item.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"), contextReceiptCount = item.content.filter((part) => part.type === "context").length, attachments: import("../../lib/runtime").ConversationAttachmentReference[] = [];
      for (const part of item.content) if (part.type === "image") {
        const source = await runtime.artifact(part.artifactId);
        if (!source.data || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(source.mediaType)) continue;
        const copied = await runtime.ingestConversationAttachment({ sessionId: forked.sessionId, attachment: { type: "image", mediaType: source.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: source.data, name: part.name } });
        attachments.push({ artifactId: copied.artifact.id, mediaType: copied.artifact.mediaType, name: part.name });
      }
      await queryClient.invalidateQueries({ queryKey: ["conversation-transcript"] });
      await refresh();
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("kora:set-conversation-draft", { detail: { text, attachments, contextReceiptCount } })), 0);
    } catch (reason) { setStreamError(`That turn could not be forked: ${(reason as Error).message}`); }
  }, [queryClient, refresh]);

  useEffect(() => { setStreamError(undefined); }, [sessionId]);
  useEffect(() => {
    setOlderTurns([]);
    setOlderPage(undefined);
    setOlderError(undefined);
    setUserAwayFromBottom(false);
    evidenceInspector.close();
  }, [evidenceInspector.close, sessionId]);
  useEffect(() => {
    if (!sessionId || transcript.data?.sessionId !== sessionId) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        placeConversationAtLatest(viewport.current);
        setUserAwayFromBottom(false);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [sessionId, transcript.data?.sessionId]);
  useEffect(() => {
    if (!run || run.terminalStatus) return;
    const controller = new AbortController();
    let cursor = run.lastSequence;
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          setStreamError(undefined);
          await runtime.streamConversation(run.runId, cursor, controller.signal, (event) => {
            cursor = Math.max(cursor, event.sequence);
            setRun((current) => current ? applyConversationEvent(current, event) : current);
            if (event.type === "run.completed") void refreshConversation();
          });
          const latest = await runtime.conversationRun(run.runId);
          setRun(latest.run);
          if (latest.run.terminalStatus) {
            await queryClient.invalidateQueries({ queryKey: ["conversation-transcript", sessionId] });
            await refresh();
            break;
          }
        } catch (reason) {
          if (controller.signal.aborted) break;
          setStreamError((reason as Error).message);
          try {
            const latest = await runtime.conversationRun(run.runId);
            cursor = latest.run.lastSequence;
            setRun(latest.run);
            if (latest.run.terminalStatus) {
              await queryClient.invalidateQueries({ queryKey: ["conversation-transcript", sessionId] });
              await refresh();
              setStreamError(undefined);
              break;
            }
          } catch { /* retry stream */ }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    })();
    return () => controller.abort();
  }, [queryClient, refresh, refreshConversation, run?.runId, sessionId]);

  const canonicalRunSettled = Boolean(run && visibleTurns.some((turn) => canonicalTurnSettlesRun(turn, run)));
  const presentationMessages = useMemo(() => reconcileConversationMessages(visibleTurns, run), [run, visibleTurns]);
  const live = isConversationRunLive(run);
  useViewBar(() => ({
    variant: "conversation",
    leading: <IconButton
      className="conversation-rail-toggle"
      label="Toggle conversations"
      tooltip="Toggle conversations"
      aria-controls={conversationRailControlId}
      onClick={() => window.dispatchEvent(new CustomEvent("kora:toggle-session-manager", { detail: { view: "conversations" } }))}
    ><MessageSquareText size={16} /><span className="conversation-rail-toggle__label">Conversations</span></IconButton>,
    title: bootstrap?.session ? conversationTitle(bootstrap.session) : "Conversation",
    meta: live ? <span>{phaseCopy[run!.phase]}</span> : undefined,
  }), [bootstrap?.session.id, bootstrap?.session.name, conversationRailControlId, live, run?.phase]);
  const page = olderPage ?? transcript.data?.page;
  const loadOlder = async () => {
    if (!sessionId || !page?.hasMore || !page.nextBefore || olderBusy) return;
    const node = viewport.current, priorHeight = node?.scrollHeight ?? 0, priorTop = node?.scrollTop ?? 0;
    setOlderBusy(true); setOlderError(undefined);
    try {
      const result = await runtime.conversationTranscript(sessionId, page.nextBefore);
      setOlderTurns((current) => {
        const byId = new Map([...result.turns, ...current].map((turn) => [turn.id, turn]));
        return [...byId.values()];
      });
      setOlderPage(result.page);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (node) node.scrollTop = priorTop + Math.max(0, node.scrollHeight - priorHeight); }));
    } catch (reason) { setOlderError((reason as Error).message); }
    finally { setOlderBusy(false); }
  };
  const empty = !transcript.isLoading && presentationMessages.length === 0;
  const retryRun = async () => {
    if (!run || !bootstrap) return;
    if (run.invocation.kind === "user_message" && run.invocation.content.some((part) => part.type === "context")) {
      setStreamError("Reattach the Brain context before retrying this turn; its original handles cannot be replayed.");
      return;
    }
    retryAttempt.current = conversationRetryAttempt(retryAttempt.current, run.runId, () => crypto.randomUUID());
    const result = await runtime.retryConversationRun({
      sessionId: bootstrap.session.id,
      acceptedEntryId: run.acceptedEntryId,
      clientRequestId: retryAttempt.current.clientRequestId,
    });
    setRun(result.run);
  };
  const failureRecovery = conversationFailureRecovery(run?.failure, bootstrap?.model.access.state);
  const recoverFailure = () => {
    if (failureRecovery.kind === "open_model_access") window.dispatchEvent(createModelAccessEvent(bootstrap?.model.provider));
    else if (failureRecovery.kind === "retry") void retryRun();
    else {
      const text = run?.invocation.kind === "user_message" ? run.invocation.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : run?.invocation.command ?? "";
      window.dispatchEvent(new CustomEvent("kora:set-conversation-draft", { detail: { text } }));
    }
  };
  const submitFromAssistantUi = useCallback(async (text: string) => {
    if (!bootstrap) throw new Error("Kora's foreground conversation is unavailable.");
    const invocation = text.startsWith("/") || text.startsWith("!")
      ? { kind: "command" as const, command: text }
      : { kind: "user_message" as const, content: [{ type: "text" as const, text }] };
    const result = await runtime.createConversationRun({ sessionId: bootstrap.session.id, clientRequestId: crypto.randomUUID(), invocation });
    setRun(result.run);
    window.dispatchEvent(new CustomEvent("kora:set-conversation-draft", { detail: { text: "" } }));
  }, [bootstrap]);
  const observeViewport = useCallback<React.UIEventHandler<HTMLDivElement>>((event) => {
    const node = event.currentTarget;
    setUserAwayFromBottom(node.scrollHeight - node.scrollTop - node.clientHeight > 24);
  }, []);
  const renderAssistantUiItems = useCallback((items: ConversationItem[], options: { live: boolean; role: "user" | "assistant"; createdAt: string }) => {
    if (options.role === "user") return <article className="conversation-turn conversation-turn--user">
      <header className="conversation-turn__meta"><strong>You</strong><time dateTime={options.createdAt}>{turnTime(options.createdAt)}</time></header>
      {items.map((item) => <ConversationItemView key={item.id} item={item} onResolveApproval={resolveApproval} onExecuteCommand={executeCommand} onForkEdit={!options.live ? forkAndEdit : undefined} />)}
    </article>;
    const presenceState = !options.live ? "idle" : run?.phase === "queued" || run?.phase === "preparing" ? "gathering" : run?.phase === "waiting_for_approval" ? "waiting" : "active";
    return <article className="conversation-turn conversation-turn--assistant">
      {(items.length > 0 || options.live) && <motion.header className="kora-turn-header" layout="position" role={options.live ? "status" : undefined} aria-live={options.live ? "polite" : undefined} initial={options.live ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: DUR.base, ease: EASE.out }}><KoraPresenceMark state={presenceState} /><strong>Kora</strong><time dateTime={options.createdAt}>{turnTime(options.createdAt)}</time><AnimatePresence initial={false} mode="wait">{options.live && run && <motion.span className="kora-turn-header__state" key={`${run.phase}:${run.stopRequested}`} initial={{ opacity: 0, y: 4, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -3 }} transition={{ duration: DUR.quick, ease: EASE.out }}>{run.stopRequested ? "Stopping safely…" : phaseCopy[run.phase]}</motion.span>}</AnimatePresence></motion.header>}
      <div className="conversation-turn__response">{responseItems(items, resolveApproval, executeCommand, evidenceInspector.inspect)}</div>
    </article>;
  }, [evidenceInspector.inspect, executeCommand, forkAndEdit, resolveApproval, run]);
  return <section className="conversation-workspace" aria-label="Kora conversation" data-user-away={userAwayFromBottom || undefined}>
    <ConversationEvidenceInspector open={evidenceInspector.open} view={evidenceInspector.view} onOpenChange={evidenceInspector.onOpenChange} />
    <KoraAssistantThread
      messages={presentationMessages}
      running={isConversationRunLive(run)}
      renderItems={renderAssistantUiItems}
      onNew={submitFromAssistantUi}
      viewportRef={viewport}
      onScroll={observeViewport}
      userAwayFromBottom={userAwayFromBottom}
      beforeMessages={<>
        {transcript.isLoading && <div className="transcript-loading" aria-label="Loading conversation"><span /><span /><span /></div>}
        {transcript.error && <div className="conversation-recovery"><AlertTriangle size={18} /><div><strong>Conversation history is paused.</strong><p>{(transcript.error as Error).message}</p></div><Button onClick={() => void transcript.refetch()}>Try again</Button></div>}
        {page?.hasMore && <div className="older-history"><Button disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? <><LoaderCircle size={14} className="spin" />Loading earlier turns…</> : "Load earlier turns"}</Button>{olderError && <p><AlertTriangle size={13} />{olderError}</p>}</div>}
        {empty && <motion.div className="conversation-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.base }}><span className="conversation-empty__presence"><KoraPresenceMark state="idle" /></span><small>Your conversation with Kora</small><h2>What should we make easier?</h2><p>Ask a question, think through a plan, or pick up where you left off. Add an image or a reference from Brain or Work when it helps.</p></motion.div>}
      </>}
      afterMessages={<>
        <AnimatePresence initial={false}>
          {run?.terminalStatus === "failed" && <motion.div className="run-recovery" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><AlertTriangle size={18} /><div><strong>{run.failure?.message ?? "Kora couldn’t finish that turn."}</strong><p>{failureRecovery.description}</p><Disclosure className="run-recovery__details" trigger={<Button type="button" tone="link">Failure details</Button>}><code>{run.failure?.code ?? "conversation_run_failed"}</code><span>Reference {run.failure?.requestId ?? run.runId}</span></Disclosure></div><Button onClick={recoverFailure}>{failureRecovery.label}</Button></motion.div>}
          {run?.terminalStatus === "stopped" && !canonicalRunSettled && <motion.div className="run-stopped" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleStop size={15} />Stopped. Review the work above before continuing.</motion.div>}
          {streamError && <motion.div className="stream-recovery" role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><LoaderCircle className="spin" size={15} />Reconnecting to Kora’s live work…</motion.div>}
        </AnimatePresence>
      </>}
      composer={<SessionScopedComposer sessionId={sessionId} run={run && !run.terminalStatus ? run : undefined} onRun={acceptRun} pendingContext={pendingContext} pendingDraft={pendingDraft} onContextAttached={onContextAttached} />}
      onCancel={async () => { if (run && !run.terminalStatus) await runtime.stop(); }}
    />
  </section>;
}
