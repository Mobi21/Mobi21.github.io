import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "../../app/connection-context";
import { Button, IconButton, Input, KoraPresenceMark, Modal, SegmentedControl, Tooltip } from "../../components/primitives";
import { DUR, EASE } from "../../lib/motion";
import { hasDraft } from "../../lib/persistence";
import {
  runtime,
  type SessionMetadata,
  type SessionNavigationEntry,
  type SessionSearchResult,
} from "../../lib/runtime";
import { requestSessionTransition } from "../../lib/session-transition";
import {
  conversationNameError,
  conversationRowMeta,
  conversationTitle,
  isPlaceholderConversationName,
  sessionNavigationLabel,
  sessionNavigationPreview,
} from "./conversation-session";

export type ConversationRailView = "conversations" | "history";

function groupConversations(sessions: SessionMetadata[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const groups = [
    { key: "today", label: "Today", sessions: [] as SessionMetadata[] },
    { key: "yesterday", label: "Yesterday", sessions: [] as SessionMetadata[] },
    { key: "week", label: "Previous 7 days", sessions: [] as SessionMetadata[] },
    { key: "older", label: "Older", sessions: [] as SessionMetadata[] },
  ];

  for (const session of sessions) {
    const age = Math.max(0, today.getTime() - new Date(session.updatedAt).setHours(0, 0, 0, 0));
    const group = age < day ? groups[0] : age < day * 2 ? groups[1] : age < day * 7 ? groups[2] : groups[3];
    group.sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length > 0);
}

function compactConversationMeta(session: SessionMetadata, draft: boolean) {
  if (draft) return "Draft";
  const updated = new Date(session.updatedAt);
  if (Number.isNaN(updated.getTime())) return "Saved";
  const today = new Date();
  const sameDay = updated.getFullYear() === today.getFullYear()
    && updated.getMonth() === today.getMonth()
    && updated.getDate() === today.getDate();
  return sameDay
    ? updated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : updated.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SearchResultRow({
  result,
  session,
  current,
  pending,
  disabled,
  onOpen,
}: {
  result?: SessionSearchResult;
  session: SessionMetadata;
  current: boolean;
  pending: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const title = conversationTitle(session);
  return <Button
    tone="ghost"
    className={`conversation-search-result${current ? " conversation-search-result--current" : ""}`}
    aria-current={current && !result ? "page" : undefined}
    aria-busy={pending || undefined}
    disabled={disabled}
    onClick={onOpen}
  >
    <span className="conversation-search-result__mark">{pending ? <LoaderCircle className="spin" size={15} /> : result ? <Search size={15} /> : <MessageSquareText size={15} />}</span>
    <span className="conversation-search-result__copy">
      <strong>{title}</strong>
      {result
        ? <><span>{result.excerpt}</span><small>{result.role === "user" ? "You" : "Kora"} · {conversationRowMeta({ ...session, updatedAt: result.occurredAt }, false)}</small></>
        : <small>{conversationRowMeta(session, hasDraft(session.id))}</small>}
    </span>
    {current ? <span className="conversation-search-result__current">Current</span> : result && <span className="conversation-search-result__current">Open conversation</span>}
  </Button>;
}

export function BranchHistory({
  entries,
  loading,
  error,
  active,
  pendingId,
  onRetry,
  onNavigate,
}: {
  entries: SessionNavigationEntry[];
  loading: boolean;
  error?: string;
  active: boolean;
  pendingId?: string;
  onRetry: () => void;
  onNavigate: (entry: SessionNavigationEntry) => void;
}) {
  if (loading) return <div className="conversation-rail-state" role="status"><LoaderCircle className="spin" size={18} /><strong>Reading this conversation’s history…</strong></div>;
  if (error) return <div className="conversation-rail-state conversation-rail-state--error"><AlertTriangle size={18} /><strong>History is unavailable.</strong><p>{error}</p><Button onClick={onRetry}>Try again</Button></div>;
  const turns = entries.filter((entry) => entry.kind === "message" && entry.role !== "system");
  if (turns.length === 0) return <div className="conversation-rail-state"><GitBranch size={20} /><strong>No branch history yet</strong><p>Fork and edit a message to explore another path without overwriting this one.</p></div>;
  return <nav className="conversation-history" aria-label="Conversation branch history">
    {active && <p className="conversation-history__locked"><KoraPresenceMark state="active" />History navigation returns when Kora finishes the current turn.</p>}
    <ol className="conversation-history__list">{turns.map((entry) => {
      const navigationLabel = sessionNavigationLabel(entry);
      const navigationPreview = sessionNavigationPreview(entry);
      return <li key={entry.id} data-depth={Math.min(entry.depth, 6)}><Button
        tone="ghost"
        key={entry.id}
        className={`conversation-history-row${entry.current ? " conversation-history-row--current" : ""}${entry.onCurrentPath ? " conversation-history-row--path" : ""}`}
        aria-current={entry.current ? "step" : undefined}
        aria-busy={pendingId === entry.id || undefined}
        disabled={active || entry.current || Boolean(pendingId)}
        onClick={() => onNavigate(entry)}
      >
        <span className="conversation-history-row__line" aria-hidden="true" />
        <span className="conversation-history-row__mark">{pendingId === entry.id ? <LoaderCircle className="spin" size={14} /> : entry.current ? <Check size={14} /> : <GitBranch size={14} />}</span>
        <span className="conversation-history-row__copy">
          <span className="conversation-history-row__heading"><strong>{navigationLabel}</strong></span>
          {navigationPreview && <span className="conversation-history-row__preview">{navigationPreview}</span>}
          <span className="conversation-history-row__footer">
            <small>{entry.role === "user" ? "You" : "Kora"} · {new Date(entry.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{entry.activityCount > 0 ? ` · ${entry.activityCount} internal ${entry.activityCount === 1 ? "step" : "steps"}` : ""}</small>
            <span className="conversation-history-row__status">{entry.branchPoint && <em>Fork</em>}{entry.current ? <em>Here</em> : entry.onCurrentPath && <em>On path</em>}</span>
          </span>
        </span>
      </Button></li>;
    })}</ol>
  </nav>;
}

export function ConversationRail({
  open,
  variant,
  view,
  onViewChange,
  onOpenChange,
}: {
  open: boolean;
  variant: "docked" | "sheet";
  view: ConversationRailView;
  onViewChange: (view: ConversationRailView) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { bootstrap, refresh } = useConnection();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState("");
  const [renameError, setRenameError] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<SessionMetadata>();
  const [busy, setBusy] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string>();
  const [pendingBranchId, setPendingBranchId] = useState<string>();
  const [error, setError] = useState<string>();
  const [titleSyncError, setTitleSyncError] = useState<string>();
  const railList = useRef<HTMLElement>(null);
  const active = bootstrap?.run.state === "active";

  const sessionSearch = useQuery({
    queryKey: ["conversation-session-search", debouncedQuery],
    queryFn: () => runtime.searchSessions(debouncedQuery, 20),
    enabled: open && view === "conversations" && debouncedQuery.length > 0,
    staleTime: 15_000,
  });
  const branchHistory = useQuery({
    queryKey: ["conversation-session-navigation", bootstrap?.session.id],
    queryFn: runtime.sessionNavigation,
    enabled: open && view === "history" && Boolean(bootstrap?.session.id),
    staleTime: 5_000,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(undefined);
    setTitleSyncError(undefined);
    setSessionsLoading(true);
    void (async () => {
      try {
        const result = await runtime.synchronizeSessionTitles();
        const failures = result.results.filter((item) => item.state === "failed");
        if (!cancelled && failures.length) setTitleSyncError(failures.length === 1 ? failures[0]!.message : `${failures.length} conversations could not be named automatically.`);
      } catch (reason) {
        if (!cancelled) setTitleSyncError(`Automatic conversation naming is unavailable. ${(reason as Error).message}`);
      }
      try {
        const result = await runtime.sessions();
        if (!cancelled) setSessions(result.sessions);
        await refresh();
      } catch (reason) {
        if (!cancelled) setError(`Conversations could not be loaded. ${(reason as Error).message}`);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, bootstrap?.session.id, bootstrap?.session.name, refresh]);

  const conversationGroups = useMemo(() => groupConversations(sessions), [sessions]);
  const conversationRows = useMemo(
    () => conversationGroups.flatMap((group) => group.sessions.map((session, index) => ({
      groupKey: group.key,
      groupLabel: group.label,
      firstInGroup: index === 0,
      session,
    }))),
    [conversationGroups],
  );
  const conversationVirtualizer = useVirtualizer({
    count: conversationRows.length,
    getScrollElement: () => railList.current,
    estimateSize: (index) => conversationRows[index]?.firstInGroup ? 68 : 44,
    getItemKey: (index) => conversationRows[index]?.session.id ?? index,
    overscan: 8,
  });
  const virtualConversationRows = conversationVirtualizer.getVirtualItems();
  const firstVisibleVirtualRow = virtualConversationRows.find((item) => item.end > (conversationVirtualizer.scrollOffset ?? 0));
  const stickyConversationGroup = firstVisibleVirtualRow ? conversationRows[firstVisibleVirtualRow.index]?.groupLabel : conversationRows[0]?.groupLabel;

  const searchRows = useMemo(() => {
    if (!debouncedQuery) return [] as Array<{ session: SessionMetadata; result?: SessionSearchResult }>;
    const needle = debouncedQuery.toLocaleLowerCase();
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));
    const seen = new Set<string>();
    const rows: Array<{ session: SessionMetadata; result?: SessionSearchResult }> = [];
    for (const result of sessionSearch.data?.results ?? []) {
      const session = sessionsById.get(result.sessionId);
      if (!session || seen.has(session.id)) continue;
      seen.add(session.id);
      rows.push({ session, result });
    }
    for (const session of sessions) {
      if (seen.has(session.id)) continue;
      if (`${conversationTitle(session)} ${session.id}`.toLocaleLowerCase().includes(needle)) rows.push({ session });
    }
    return rows;
  }, [debouncedQuery, sessionSearch.data?.results, sessions]);

  const refreshSessions = async () => {
    await refresh();
    const result = await runtime.sessions();
    setSessions(result.sessions);
  };
  const operate = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(undefined);
    try { await operation(); await refreshSessions(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const select = async (id?: string) => {
    if (busy || !bootstrap) return;
    setBusy(true); setPendingSessionId(id ?? "new"); setError(undefined);
    try {
      if (id !== bootstrap.session.id) {
        const result = await requestSessionTransition({ kind: id ? "resume" : "create", targetSessionId: id, expectedCurrentSessionId: bootstrap.session.id, origin: "conversation_rail" });
        if (result.state !== "settled") { setError(result.message); return; }
      }
      await queryClient.invalidateQueries({ queryKey: ["conversation-transcript"] });
      await refresh();
      if (variant === "sheet") onOpenChange(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); setPendingSessionId(undefined); }
  };
  const beginRename = (session: SessionMetadata) => {
    setEditingId(session.id);
    setEditName(isPlaceholderConversationName(session.name) ? "" : session.name!.trim());
    setRenameError(undefined);
  };
  const saveRename = (sessionId: string) => {
    const validation = conversationNameError(editName);
    if (validation) { setRenameError(validation); return; }
    void operate(async () => { await runtime.renameNamedSession(sessionId, editName.trim()); setEditingId(undefined); setRenameError(undefined); });
  };
  const remove = () => {
    if (!deleteTarget) return;
    void operate(async () => { await runtime.deleteSession(deleteTarget.id); setDeleteTarget(undefined); });
  };
  const navigateBranch = async (entry: SessionNavigationEntry) => {
    setPendingBranchId(entry.id); setError(undefined);
    try {
      await runtime.navigateSession(entry.id);
      await queryClient.invalidateQueries({ queryKey: ["conversation-transcript", bootstrap?.session.id] });
      await Promise.all([branchHistory.refetch(), refresh()]);
      if (variant === "sheet") onOpenChange(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setPendingBranchId(undefined); }
  };

  if (!open) return null;
  return <>
    <section id="conversation-rail" className={`conversation-rail conversation-rail--${variant}`} aria-label="Conversations and branches">
      {variant === "docked" ? (
        <header className="conversation-rail__head">
          <div className="conversation-rail__head-title"><span><strong>Conversations</strong><small>{sessions.length ? `${sessions.length} local` : "Local history"}</small></span></div>
        </header>
      ) : (
        <p className="conversation-rail__summary">{sessions.length ? `${sessions.length} conversations saved locally` : "Your local conversation history"}</p>
      )}
      <div className="conversation-rail__view-switch">
        <SegmentedControl value={view} onValueChange={(next) => onViewChange(next as ConversationRailView)} options={[{ value: "conversations", label: "Chats" }, { value: "history", label: "Branches" }]} label="Conversation manager view" layoutId="conversation-rail-view" />
      </div>
      {view === "conversations" ? <>
        <div className="conversation-rail__controls">
          <Button tone="ghost" className="conversation-rail__new" aria-busy={pendingSessionId === "new" || undefined} disabled={busy || active} onClick={() => void select()}><span className="conversation-rail__new-mark"><Plus size={16} /></span><span><strong>{pendingSessionId === "new" ? "Opening conversation…" : "New conversation"}</strong><small>Start with a clean context</small></span></Button>
          <label className="conversation-rail__search"><Search size={14} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search conversations" />{query && <IconButton type="button" label="Clear conversation search" onClick={() => setQuery("")}><X size={13} /></IconButton>}</label>
        </div>
        {titleSyncError && <p className="inline-error conversation-title-sync-error" role="status"><CircleAlert size={15} />{titleSyncError}</p>}
        {active && <p className="conversation-rail__working"><KoraPresenceMark state="active" /><span>Kora is working here. Switching, renaming, and deleting return when the turn finishes.</span></p>}
        {debouncedQuery ? <nav className="conversation-rail__search-results" aria-label="Conversation search results">
          {sessionSearch.isFetching && <p className="conversation-rail__searching" role="status"><LoaderCircle className="spin" size={14} />Searching message history…</p>}
          {sessionSearch.error && <div className="conversation-rail-state conversation-rail-state--error"><CircleAlert size={17} /><strong>Message search is unavailable.</strong><p>{(sessionSearch.error as Error).message}</p><Button onClick={() => void sessionSearch.refetch()}>Try again</Button></div>}
          {!sessionSearch.isFetching && !sessionSearch.error && searchRows.length === 0 && <div className="conversation-rail-state"><Search size={19} /><strong>No matching conversations</strong><p>Try a person, project, phrase, or conversation title.</p></div>}
          {searchRows.map(({ session, result }) => <SearchResultRow key={session.id} session={session} result={result} current={session.id === bootstrap?.session.id} pending={pendingSessionId === session.id} disabled={busy || active} onOpen={() => void select(session.id)} />)}
        </nav> : <nav ref={railList} className="conversation-rail__list" aria-label="Local conversations">
          {sessionsLoading && sessions.length === 0 && <div className="conversation-rail-state" role="status"><LoaderCircle className="spin" size={17} /><strong>Reading local conversations…</strong></div>}
          {stickyConversationGroup && <h2 className="conversation-rail__sticky-group" aria-hidden="true">{stickyConversationGroup}</h2>}
          <div className="conversation-rail__virtual-content" style={{ height: conversationVirtualizer.getTotalSize() }}>
            {virtualConversationRows.map((virtualRow) => {
              const { session, groupKey, groupLabel, firstInGroup } = conversationRows[virtualRow.index]!;
              const current = session.id === bootstrap?.session.id, pending = session.id === pendingSessionId;
              const title = conversationTitle(session), draft = hasDraft(session.id);
              return <div className="conversation-rail__virtual-row" data-index={virtualRow.index} key={virtualRow.key} ref={conversationVirtualizer.measureElement} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                {firstInGroup && <h2 id={`conversation-group-${groupKey}`}>{groupLabel}</h2>}
                <motion.div layout="position" aria-labelledby={`conversation-group-${groupKey}`} className={`conversation-rail-row${current ? " conversation-rail-row--current" : ""}${pending ? " conversation-rail-row--pending" : ""}`} transition={{ layout: { duration: DUR.base, ease: EASE.out } }}>
                  <AnimatePresence initial={false} mode="popLayout">{editingId === session.id ? <motion.form key="edit" className="conversation-rail-row__rename" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} onSubmit={(event) => { event.preventDefault(); saveRename(session.id); }}>
                    <label><span>Conversation name</span><Input autoFocus value={editName} onChange={(event) => { setEditName(event.target.value); setRenameError(undefined); }} invalid={Boolean(renameError)} aria-describedby={renameError ? `rename-error-${session.id}` : undefined} /></label>
                    {renameError && <p id={`rename-error-${session.id}`} role="alert">{renameError}</p>}
                    <div><Button type="button" tone="ghost" onClick={() => { setEditingId(undefined); setRenameError(undefined); }}>Cancel</Button><Button type="submit" tone="primary" loading={busy}>Save</Button></div>
                  </motion.form> : <motion.div key="row" className="conversation-rail-row__content">
                    <Tooltip content={`${title}. ${conversationRowMeta(session, draft)}`} side="right"><Button tone="ghost" className="conversation-rail-row__open" aria-current={current ? "page" : undefined} aria-busy={pending || undefined} disabled={busy || active || current} onClick={() => void select(session.id)}><span className="conversation-rail-row__title">{title}</span><span className="conversation-rail-row__meta">{compactConversationMeta(session, draft)}</span>{pending && <i aria-hidden="true" />}</Button></Tooltip>
                    <div className="conversation-rail-row__actions"><IconButton label={`Rename ${title}`} tooltip="Rename" disabled={busy || active} onClick={() => beginRename(session)}><Pencil size={14} /></IconButton>{!current && <IconButton label={`Delete ${title}`} tooltip="Delete" disabled={busy || active} onClick={() => setDeleteTarget(session)}><Trash2 size={14} /></IconButton>}</div>
                  </motion.div>}</AnimatePresence>
                </motion.div>
              </div>;
            })}
          </div>
          {!sessionsLoading && !error && sessions.length === 0 && <div className="conversation-rail-state"><MessageSquareText size={20} /><strong>No conversations yet</strong><p>Start a conversation and Kora will keep its local history here.</p></div>}
        </nav>}
      </> : <BranchHistory entries={branchHistory.data?.entries ?? []} loading={branchHistory.isLoading} error={branchHistory.error ? (branchHistory.error as Error).message : error} active={active} pendingId={pendingBranchId} onRetry={() => void branchHistory.refetch()} onNavigate={(entry) => void navigateBranch(entry)} />}
      {error && view === "conversations" && <p className="inline-error conversation-rail__error"><CircleAlert size={15} />{error}</p>}
    </section>
    <Modal open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!next && !busy) setDeleteTarget(undefined); }} title="Delete conversation?" description={deleteTarget ? `“${conversationTitle(deleteTarget)}” will be removed from Kora’s local conversation list.` : undefined} className="conversation-delete-modal">
      <div className="conversation-delete-copy"><AlertTriangle size={20} /><p>This removes the saved transcript from the GUI. It does not delete files or outputs that Kora stored separately.</p></div>
      {error && <p className="inline-error"><CircleAlert size={15} />{error}</p>}
      <div className="conversation-delete-actions"><Button disabled={busy} onClick={() => setDeleteTarget(undefined)}>Keep conversation</Button><Button tone="danger" loading={busy} onClick={remove}>Delete conversation</Button></div>
    </Modal>
  </>;
}
