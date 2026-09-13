import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, Eye, EyeOff, MessageCircleMore, Pencil, Plus, ReceiptText, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import { Badge, Button, Field, Input, KoraSelect, PageFrame, PageHeader, PageToolbar, SearchField, Sheet, StateNotice } from "../../components/primitives";
import { RuntimeRequestError, runtime, type ConversationContextReference, type FinanceAccount, type FinanceBill, type FinanceSources, type FinanceSubscription, type LifeSourceState } from "../../lib/runtime";
import { MoneyNavigation } from "./MoneyNavigation";
import "./money-recurring.css";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
type BillRead = { bills: FinanceBill[]; archivedCount: number; complete: boolean; cursor?: string; total?: number; viewerTimeZone: string; sources: FinanceSources };
type SubscriptionRead = { subscriptions: FinanceSubscription[]; archivedCount: number; complete: boolean; cursor?: string; total?: number; viewerTimeZone: string; sources: FinanceSources };
type RecurringRead = { bills: FinanceBill[]; subscriptions: FinanceSubscription[]; archivedCount: number; complete: boolean; cursor?: string; total: number; viewerTimeZone: string; sources: FinanceSources };
export type RecurringLoaders = {
  bills: () => Promise<BillRead>;
  subscriptions: () => Promise<SubscriptionRead>;
  recurring?: (input: { state?: string; query?: string; cursor?: string; pageSize?: number }) => Promise<RecurringRead>;
  bill: (id: string) => Promise<BillRead>;
  subscription: (id: string) => Promise<SubscriptionRead>;
  accounts: () => Promise<{ accounts: FinanceAccount[]; sources: FinanceSources }>;
  createBill: typeof runtime.createFinanceBill;
  updateBill: typeof runtime.updateFinanceBill;
  createSubscription: typeof runtime.createFinanceSubscription;
  updateSubscription: typeof runtime.updateFinanceSubscription;
};

const liveLoaders: RecurringLoaders = {
  bills: () => runtime.financeBills(null), subscriptions: () => runtime.financeSubscriptions(null),
  recurring: runtime.financeRecurring,
  bill: runtime.financeBill, subscription: runtime.financeSubscription, accounts: () => runtime.financeAccounts(),
  createBill: runtime.createFinanceBill, updateBill: runtime.updateFinanceBill,
  createSubscription: runtime.createFinanceSubscription, updateSubscription: runtime.updateFinanceSubscription,
};

type RecurringRecord = {
  key: string; kind: "bill" | "subscription"; id: string; name: string; amountMinor?: number | null;
  amountMinMinor?: number | null; amountMaxMinor?: number | null; category?: string | null;
  currency?: string | null; accountId?: string | null; accountName?: string | null; cadence?: string | null;
  timingRule?: string | null; nextExpectedAt?: string | null; provenance?: string | null; state: string;
  updatedAt: string; evidence: FinanceBill["reconciliationEvidence"]; raw: FinanceBill | FinanceSubscription;
};

const recurringStateOptions = [
  { value: "all", label: "All states" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "completed", label: "Completed" },
];

export function MoneyRecurringWorkspace({ onAskKora, loaders = liveLoaders, requestKey = "live", now = new Date() }: { onAskKora: Ask; loaders?: RecurringLoaders; requestKey?: string; now?: Date }) {
  const queryClient = useQueryClient();
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const navigate = useNavigate();
  const { recordKind: routeRecordKind, recordId: routeRecordId } = useParams<{ recordKind?: string; recordId?: string }>();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecurringRecord>();
  const [announcement, setAnnouncement] = useState("");
  const compactDetail = useCompactDetail();
  const query = params.get("q") ?? "";
  const lifecycle = params.get("state") ?? "all";
  const pageCursor = params.get("recurringPageCursor") ?? undefined;
  const pageHistory = parseCursorHistory(params.get("recurringPageHistory"));
  const selectedKey = routeRecordId
    ? `${routeRecordKind ?? "unknown"}:${routeRecordId}`
    : params.get("record") ?? undefined;
  const collection = useQuery({
    queryKey: ["money-recurring", requestKey, "collection", lifecycle, query, pageCursor],
    queryFn: async () => {
      if (loaders.recurring) return loaders.recurring({
        state: lifecycle === "all" ? undefined : lifecycle,
        query: query || undefined,
        cursor: pageCursor,
        pageSize: 50,
      });
      const [billRead, subscriptionRead] = await Promise.all([loaders.bills(), loaders.subscriptions()]);
      return {
        bills: billRead.bills,
        subscriptions: subscriptionRead.subscriptions,
        archivedCount: billRead.archivedCount + subscriptionRead.archivedCount,
        complete: billRead.complete && subscriptionRead.complete,
        total: (billRead.total ?? billRead.bills.length) + (subscriptionRead.total ?? subscriptionRead.subscriptions.length),
        viewerTimeZone: billRead.viewerTimeZone || subscriptionRead.viewerTimeZone,
        sources: mergeFinanceSources(billRead.sources, subscriptionRead.sources),
      };
    },
  });
  const accounts = useQuery({ queryKey: ["money-recurring", requestKey, "accounts"], queryFn: () => loaders.accounts() });
  const selectedKindValue = selectedKey?.split(":", 1)[0];
  const selectedKind = selectedKindValue === "bill" || selectedKindValue === "subscription"
    ? selectedKindValue
    : undefined;
  const selectedId = selectedKey?.slice((selectedKind?.length ?? 0) + 1);
  const records = useMemo(() => uniqueRecurringRecords(normalizeRecords(collection.data?.bills ?? [], collection.data?.subscriptions ?? [])), [collection.data?.bills, collection.data?.subscriptions]);
  const loadedRecord = records.find((record) => record.key === selectedKey);
  const exact = useQuery({
    queryKey: ["money-recurring", requestKey, "exact", selectedKey],
    queryFn: async () => selectedKind === "bill" ? loaders.bill(selectedId!) : loaders.subscription(selectedId!),
    enabled: Boolean(selectedId && selectedKind && !loadedRecord),
  });
  const exactBill = selectedKind === "bill" ? (exact.data as BillRead | undefined)?.bills[0] : undefined;
  const exactSubscription = selectedKind === "subscription" ? (exact.data as SubscriptionRead | undefined)?.subscriptions[0] : undefined;
  const selectedRecord = loadedRecord ?? (exactBill || exactSubscription ? normalizeRecords(exactBill ? [exactBill] : [], exactSubscription ? [exactSubscription] : [])[0] : undefined);
  const source = collection.data?.sources.plaid ?? (collection.isPending ? { state: "loading" as const } : { state: "unavailable" as const });
  const viewerTimeZone = collection.data?.viewerTimeZone;
  const selectedSource = loadedRecord || !exact.data ? source : exactSource(exact.data.sources.plaid, exact.data.complete);
  const selectedViewerTimeZone = loadedRecord || !exact.data ? viewerTimeZone : exact.data.viewerTimeZone;
  const failedAll = collection.isError;
  const pendingAll = collection.isPending;
  const localCollectionConfirmed = collection.isSuccess;
  const recordCountMeta = failedAll ? "Record count unavailable" : pendingAll ? "Reading local records" : `${collection.data?.total ?? records.length} local records`;
  const filtered = records;
  const groups = groupRecords(filtered, now, viewerTimeZone);
  const updateParams = (patch: Record<string, string | undefined>, resetPage = false) => { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key); if (resetPage) { next.delete("recurringPageCursor"); next.delete("recurringPageHistory"); } setParams(next, { replace: true }); };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("record");
    if (routeRecordId) {
      void navigate({ pathname: "/life/finances/recurring", search: next.size ? `?${next}` : "" }, { replace: true });
      return;
    }
    setParams(next, { replace: true });
  };
  const beginEdit = (record: RecurringRecord) => {
    setEditingRecord(record);
    if (compactDetail) closeDetail();
  };
  const openHref = (record: RecurringRecord) => {
    const next = new URLSearchParams(params);
    next.delete("record");
    return `/life/finances/recurring/${record.kind}/${encodeURIComponent(record.id)}${next.size ? `?${next}` : ""}`;
  };
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["money-recurring", requestKey] });
  const paginationFocus = useRef<HTMLSpanElement>(null);
  const restoreScrollTop = useRef<number | undefined>(undefined);
  const pendingPageFocus = useRef(false);
  const changePage = (cursor: string | undefined, history: string[]) => {
    const owner = document.querySelector<HTMLElement>(".life-stage");
    restoreScrollTop.current = owner?.scrollTop;
    pendingPageFocus.current = true;
    const next = new URLSearchParams(params);
    next.delete("record");
    cursor ? next.set("recurringPageCursor", cursor) : next.delete("recurringPageCursor");
    history.length ? next.set("recurringPageHistory", history.join(".")) : next.delete("recurringPageHistory");
    if (routeRecordId) {
      void navigate({ pathname: "/life/finances/recurring", search: next.size ? `?${next}` : "" });
    } else {
      setParams(next);
    }
  };
  const nextPage = () => { if (collection.data?.cursor) changePage(collection.data.cursor, [...pageHistory, pageCursor ?? "~"]); };
  const previousPage = () => { const history = [...pageHistory]; const previous = history.pop(); changePage(previous && previous !== "~" ? previous : undefined, history); };
  useEffect(() => {
    if (!pendingPageFocus.current || collection.isFetching) return;
    pendingPageFocus.current = false;
    requestAnimationFrame(() => {
      paginationFocus.current?.focus({ preventScroll: true });
      const owner = document.querySelector<HTMLElement>(".life-stage");
      if (owner && restoreScrollTop.current != null) owner.scrollTop = restoreScrollTop.current;
    });
  }, [collection.dataUpdatedAt, collection.isError, collection.isFetching]);

  const previousSelected = useRef<string | undefined>(undefined);
  useEffect(() => { const previous = previousSelected.current; previousSelected.current = selectedKey; if (!previous || selectedKey || editingRecord) return; requestAnimationFrame(() => { const target = document.querySelector<HTMLElement>(`[data-recurring-key="${CSS.escape(previous)}"]`); (target ?? document.querySelector<HTMLElement>(".money-recurring-workspace .k-page-header"))?.focus(); }); }, [editingRecord, selectedKey]);
  const detail = selectedKey && !compactDetail ? selectedRecord
    ? <RecurringDetail record={selectedRecord} source={selectedSource} viewerTimeZone={selectedViewerTimeZone} hidden={amountsHidden} onClose={closeDetail} onEdit={() => beginEdit(selectedRecord)} onAskKora={onAskKora} />
    : <RecurringDetailState pending={exact.isPending} error={exact.isError} onClose={closeDetail} /> : undefined;
  const sheetDetail = selectedKey && compactDetail ? selectedRecord
    ? <RecurringDetail record={selectedRecord} source={selectedSource} viewerTimeZone={selectedViewerTimeZone} hidden={amountsHidden} onClose={closeDetail} onEdit={() => beginEdit(selectedRecord)} onAskKora={onAskKora} showHeader={false} />
    : <RecurringDetailState pending={exact.isPending} error={exact.isError} onClose={closeDetail} /> : undefined;

  return <section className="money-recurring-workspace">
    <PageFrame width="wide" inspector={detail} inspectorLabel="Recurring details">
      <PageHeader tabIndex={-1} title="Recurring" description="Know what is expected next, what has evidence, and what still needs confirmation." status={<><span>{recordCountMeta}</span><span aria-hidden="true">·</span><span>{sourceLabel(source)}</span></>} actions={<>
        <Button tone="secondary" aria-label={amountsHidden ? "Show amounts" : "Hide amounts"} onClick={toggleAmounts}>{amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}<span className="money-viewbar-label">{amountsHidden ? "Show amounts" : "Hide amounts"}</span></Button>
        <Button tone="primary" aria-label="Add recurring" onClick={() => setCreating(true)}><Plus size={15} /><span className="money-viewbar-label">Add recurring</span></Button>
      </>} />
      <MoneyNavigation variant="bar" />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {source.state !== "ok" && localCollectionConfirmed ? <div className="money-recurring-notice" role="status"><CircleAlert size={16} /><span>{records.length ? "Local recurring records remain available." : "The local recurring collection was read successfully."} Unable to check latest connected activity.</span><Link to="/settings/integrations">Review connection</Link></div> : null}
      <PageToolbar
        sticky
        search={<SearchField label="Search recurring" placeholder="Search names or accounts" value={query} onValueChange={(value) => updateParams({ q: value || undefined }, true)} />}
        controls={<KoraSelect label="Recurring state" value={lifecycle} options={recurringStateOptions} onValueChange={(value) => updateParams({ state: value === "all" ? undefined : value }, true)} />}
        compactControls={<KoraSelect label="Recurring state" value={lifecycle} options={recurringStateOptions} onValueChange={(value) => updateParams({ state: value === "all" ? undefined : value }, true)} />}
      />
      {pendingAll ? <StateNotice role="status" icon={<CircleAlert size={20} />} title="Opening recurring records" body="Reading local obligations and their source qualification." />
        : failedAll ? <StateNotice role="alert" tone="danger" icon={<CircleAlert size={20} />} title={pageCursor ? "This recurring page is unavailable" : "Recurring records are unavailable"} body={pageCursor ? "Kora could not read this bounded page. Earlier pages and saved record links remain unchanged." : "Kora could not read bills or subscriptions. This is not being presented as an empty list."} action={<>{pageHistory.length ? <Button tone="secondary" onClick={previousPage}><ChevronLeft size={14} />Previous page</Button> : null}<Button onClick={() => void collection.refetch()}>Try again</Button></>} />
        : filtered.length ? <section className="money-recurring-collection" aria-label="Recurring chronology"><div className="money-recurring-collection__intro"><strong>Chronology</strong><span>{recordCountMeta}</span></div><div className="money-recurring-groups">{groups.map((group) => <section key={group.key} aria-labelledby={`recurring-${group.key}`}><header><h2 id={`recurring-${group.key}`}>{group.label}</h2><span>{group.items.length}</span></header><ol>{group.items.map((record) => <RecurringRow key={record.key} record={record} href={openHref(record)} viewerTimeZone={viewerTimeZone} hidden={amountsHidden} source={source} />)}</ol></section>)}</div>
          {(pageHistory.length || collection.data?.cursor) ? <nav className="money-collection-pagination" aria-label="Recurring pages"><Button tone="secondary" disabled={!pageHistory.length} onClick={previousPage}><ChevronLeft size={14} />Previous</Button><span ref={paginationFocus} tabIndex={-1}>Page {pageHistory.length + 1} · {records.length} shown{collection.data?.total != null ? ` of ${collection.data.total}` : ""}</span><Button tone="secondary" disabled={!collection.data?.cursor} onClick={nextPage}>Next<ChevronRight size={14} /></Button></nav> : null}</section>
        : query || lifecycle !== "all" ? <StateNotice role="status" icon={<CircleAlert size={20} />} title="Nothing matches this view" body="Other recurring records remain unchanged." action={<Button onClick={() => updateParams({ q: undefined, state: undefined })}>Clear filters</Button>} />
        : localCollectionConfirmed ? <StateNotice role="status" icon={<CircleAlert size={20} />} title="No recurring records yet" body="The local collection is empty. Add a confirmed bill or subscription when you want Kora to keep its timing and evidence inspectable." action={<Button onClick={() => setCreating(true)}><Plus size={14} />Add recurring</Button>} />
        : <StateNotice role="status" tone="warning" icon={<CircleAlert size={20} />} title="Recurring coverage could not be confirmed" body="No local recurring records are visible, and connected activity is unavailable. You can still add a local expectation without waiting for the provider." action={<><Button tone="primary" onClick={() => setCreating(true)}><Plus size={14} />Add a local record</Button><Link className="button button--secondary" to="/settings/integrations">Review connection</Link></>} />}
    </PageFrame>
    <Sheet open={Boolean(selectedKey && compactDetail)} onOpenChange={(open) => { if (!open) closeDetail(); }} title={selectedRecord?.name ?? "Recurring record"} description="Saved record and evidence." purpose="inspector">{sheetDetail}</Sheet>
    <RecurringEditor open={creating} mode="create" accounts={accounts.data?.accounts ?? []} hidden={amountsHidden} loaders={loaders} onClose={() => setCreating(false)} onSaved={async () => { await refresh(); setAnnouncement("Recurring record created."); setCreating(false); }} />
    {editingRecord ? <RecurringEditor open mode="edit" record={editingRecord} accounts={accounts.data?.accounts ?? []} hidden={amountsHidden} loaders={loaders} onClose={() => setEditingRecord(undefined)} onSaved={async () => { await refresh(); setAnnouncement("Recurring record updated."); setEditingRecord(undefined); }} /> : null}
  </section>;
}

function RecurringRow({ record, href, viewerTimeZone, hidden, source }: { record: RecurringRecord; href: string; viewerTimeZone?: string; hidden: boolean; source: LifeSourceState | { state: "loading" } }) { const status = recordStatus(record, source); return <li><Link to={href} data-recurring-key={record.key}><span className="money-recurring-date" aria-label={record.nextExpectedAt ? fullDate(record.nextExpectedAt, viewerTimeZone) : "Expected date uncertain"}>{record.nextExpectedAt ? <><b>{dateMonth(record.nextExpectedAt, viewerTimeZone)}</b><strong>{dateDay(record.nextExpectedAt, viewerTimeZone)}</strong></> : <><b>Date</b><strong>?</strong></>}</span><span className="money-recurring-identity"><strong>{record.name}</strong><small>{record.kind === "bill" ? "Bill" : humanize(record.cadence || "Subscription")} · {timingLabel(record)} · {record.accountName || "No linked account"}</small></span><span className="money-recurring-trust"><Badge tone={status.tone} dot>{status.label}</Badge><small>{provenanceLabel(record.provenance)}{record.currency ? ` · ${record.currency}` : " · Currency unavailable"}</small></span><ExpectedAmount record={record} hidden={hidden} /></Link></li>; }
function ExpectedAmount({ record, hidden }: { record: RecurringRecord; hidden: boolean }) { if (hidden) return <span className="money-recurring-amount" aria-label="Amount hidden">••••••</span>; if (!record.currency && (record.amountMinor != null || record.amountMinMinor != null)) return <span className="money-recurring-amount money-recurring-muted">Currency unavailable</span>; if (record.amountMinMinor != null && record.amountMaxMinor != null && record.currency) return <span className="money-recurring-amount">{money(record.amountMinMinor, record.currency)}–{money(record.amountMaxMinor, record.currency)}</span>; if (record.amountMinor == null) return <span className="money-recurring-amount money-recurring-muted">Amount uncertain</span>; return <span className="money-recurring-amount">{money(record.amountMinor, record.currency!)}</span>; }

function RecurringDetail({ record, source, viewerTimeZone, hidden, onClose, onEdit, onAskKora, showHeader = true }: { record: RecurringRecord; source: LifeSourceState | { state: "loading" }; viewerTimeZone?: string; hidden: boolean; onClose: () => void; onEdit: () => void; onAskKora: Ask; showHeader?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { if (showHeader) requestAnimationFrame(() => heading.current?.focus()); }, [record.key, showHeader]); const status = recordStatus(record, source);
  const observed = record.evidence.filter((item) => item.observedAmountMinor != null && item.observedCurrency);
  return <section className="money-recurring-detail" aria-label={showHeader ? undefined : "Recurring details"}>{showHeader ? <header><div><span>{record.kind === "bill" ? "Bill" : "Subscription"}</span><h2 ref={heading} tabIndex={-1}>{record.name}</h2></div><Button tone="ghost" aria-label="Close recurring details" onClick={onClose}><X size={16} /></Button></header> : null}<div className="money-recurring-detail__lead"><ExpectedAmount record={record} hidden={hidden} /><Badge tone={status.tone} dot>{status.label}</Badge></div><dl><div><dt>Next expected</dt><dd>{record.nextExpectedAt ? fullDate(record.nextExpectedAt, viewerTimeZone) : "Uncertain"}<small>{record.timingRule ? timingLabel(record) : "No qualified rule"}</small></dd></div><div><dt>Account</dt><dd>{record.accountName || "Not linked"}<small>{record.currency ? `Amounts are recorded in ${record.currency}` : "Amount currency is unavailable"}</small></dd></div><div><dt>Category</dt><dd>{record.category || "Not set"}<small>{record.category ? "Local recurring category." : "No category is recorded."}</small></dd></div><div><dt>Latest activity check</dt><dd>{source.state === "ok" ? "Source coverage available" : "Unable to check latest activity"}<small>This does not confirm payment or a current-cycle match.</small></dd></div><div><dt>Local record</dt><dd>{shortDateTime(record.updatedAt, viewerTimeZone)}<small>{provenanceLabel(record.provenance)}</small></dd></div></dl><section><h3>Evidence history</h3>{record.evidence.length ? <ol>{record.evidence.map((item) => <li key={item.actionKey}><ReceiptText size={15} /><span><strong>{item.evidenceKind === "installment_settlement" ? "Installment evidence recorded" : "Recurring pattern corroborated"}</strong><small>{shortDateTime(item.createdAt, viewerTimeZone)} · Receipt {item.receiptId}{!hidden && item.observedAmountMinor != null && item.observedCurrency ? ` · ${money(item.observedAmountMinor, item.observedCurrency)}` : ""}</small></span></li>)}</ol> : <p>No reconciliation evidence is attached. Absence is not treated as missed.</p>}<p className="money-recurring-detail__qualification">{occurrenceSummary(observed, hidden)}</p></section><details><summary>Advanced record details</summary><dl><div><dt>Record ID</dt><dd className="money-recurring-detail__id">{record.id}</dd></div><div><dt>Recorded rule</dt><dd>{record.timingRule || "None"}</dd></div><div><dt>State</dt><dd>{humanize(record.state)}</dd></div></dl></details><div className="money-recurring-detail__actions"><Button disabled={hidden} onClick={onEdit}><Pencil size={14} />Edit record</Button><Button tone="secondary" onClick={() => onAskKora(hidden ? undefined : { kind: "finance_record", id: record.id, title: record.name }, `Explain recurring ${record.kind} ${record.id} from its exact local record and evidence. ${hidden ? "Amounts are hidden; do not attach, repeat, infer, or expose monetary values." : "Use the attached exact record."} Do not call it paid, missed, affordable, fraudulent, or current unless the typed evidence explicitly establishes that claim.`)}><MessageCircleMore size={14} />Ask Kora</Button></div></section>;
}
function RecurringDetailState({ pending, error, onClose }: { pending: boolean; error: boolean; onClose: () => void }) { const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { requestAnimationFrame(() => heading.current?.focus()); }, [pending, error]); return <section className="money-recurring-detail"><header><div><span>Recurring record</span><h2 ref={heading} tabIndex={-1}>{pending ? "Opening record" : error ? "Record unavailable" : "Record not found"}</h2></div><Button tone="ghost" aria-label="Close recurring details" onClick={onClose}><X size={16} /></Button></header><p>{pending ? "Reading this saved record." : error ? "Kora could not read this record. The collection remains unchanged." : "This recurring record is no longer present."}</p></section>; }

function RecurringEditor({ open, mode, record, accounts, hidden, loaders, onClose, onSaved }: { open: boolean; mode: "create" | "edit"; record?: RecurringRecord; accounts: FinanceAccount[]; hidden: boolean; loaders: RecurringLoaders; onClose: () => void; onSaved: () => Promise<void> }) {
  const formId = useId();
  const [draft, setDraft] = useState(() => recurringDraft());
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<RecurringRecord>();
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string>();
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [dismissWarning, setDismissWarning] = useState(false);
  const initializedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!open) { initializedFor.current = undefined; return; }
    const identity = mode === "create" ? "create" : record?.key;
    if (!identity || initializedFor.current === identity) return;
    initializedFor.current = identity;
    setConflict(false);
    setDismissWarning(false);
    setLatest(undefined);
    setExpectedUpdatedAt(record?.updatedAt);
    setDraft(recurringDraft(record));
  }, [open, mode, record]);
  const selectedAccount = accounts.find((item) => item.accountId === draft.accountId);
  const amount = draft.amount.trim() ? cents(draft.amount) : undefined;
  const amountMaximum = draft.amountMax.trim() ? cents(draft.amountMax) : undefined;
  const usesRange = amountMaximum != null;
  const dueDay = Number(draft.dueDay);
  const preservesExactBill = mode === "edit" && record?.kind === "bill" && !record.timingRule?.startsWith("day:");
  const amountQualified = (amount == null && amountMaximum == null) || Boolean(selectedAccount?.currency);
  const rangeValid = amountMaximum === undefined || (amount != null && amountMaximum !== null && amountMaximum >= amount);
  const valid = Boolean(!hidden && draft.name.trim() && amount !== null && amountMaximum !== null && rangeValid && amountQualified && (draft.kind === "subscription" || preservesExactBill || (Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(recurringDraft(record));
  const requestClose = () => dirty ? setDismissWarning(true) : onClose();
  const readLatest = async () => {
    if (!record) return;
    setLoadingLatest(true);
    try {
      const response = record.kind === "bill" ? await loaders.bill(record.id) : await loaders.subscription(record.id);
      const normalized = normalizeRecords(record.kind === "bill" ? (response as BillRead).bills : [], record.kind === "subscription" ? (response as SubscriptionRead).subscriptions : [])[0];
      setLatest(normalized);
    } catch {
      setLatest(undefined);
    } finally {
      setLoadingLatest(false);
    }
  };
  const handleMutationError = (error: Error) => {
    if (!isRecurringConflict(error)) return;
    setConflict(true);
    void readLatest();
  };
const mutation = useMutation({ mutationFn: async () => { const accountId = draft.accountId === "none" ? undefined : draft.accountId; const amounts = usesRange ? { expectedAmountMinor: null, expectedAmountMinMinor: amount!, expectedAmountMaxMinor: amountMaximum! } : { expectedAmountMinor: amount ?? null, expectedAmountMinMinor: null, expectedAmountMaxMinor: null }; const category = draft.category.trim() || null; if (mode === "create") return draft.kind === "bill" ? loaders.createBill({ billerName: draft.name.trim(), ...(usesRange ? { expectedAmountMinMinor: amount!, expectedAmountMaxMinor: amountMaximum! } : amount != null ? { expectedAmountMinor: amount } : {}), ...(category ? { category } : {}), dueRule: `day:${dueDay}`, accountId }) : loaders.createSubscription({ merchantName: draft.name.trim(), ...(usesRange ? { expectedAmountMinMinor: amount!, expectedAmountMaxMinor: amountMaximum! } : amount != null ? { expectedAmountMinor: amount } : {}), ...(category ? { category } : {}), accountId, cadence: draft.cadence, ...(draft.lastSeen ? { lastSeenDate: `${draft.lastSeen}T12:00:00.000Z` } : {}) }); if (!record) throw new Error("Recurring record unavailable"); const changes = record.kind === "bill" ? { billerName: draft.name.trim(), ...amounts, category, accountId: accountId ?? null, ...(draft.dueDay ? { dueRule: `day:${dueDay}` } : {}), state: draft.state } : { merchantName: draft.name.trim(), ...amounts, category, accountId: accountId ?? null, cadence: draft.cadence, lastSeenDate: draft.lastSeen ? `${draft.lastSeen}T12:00:00.000Z` : null, state: draft.state }; return record.kind === "bill" ? loaders.updateBill(record.id, changes, expectedUpdatedAt) : loaders.updateSubscription(record.id, changes, expectedUpdatedAt); }, onSuccess: onSaved, onError: handleMutationError });
  const lifecycleMutation = useMutation({ mutationFn: async () => { if (!record) throw new Error("Recurring record unavailable"); const changes = { state: record.state === "archived" ? "active" : "archived" }; return record.kind === "bill" ? loaders.updateBill(record.id, changes, expectedUpdatedAt) : loaders.updateSubscription(record.id, changes, expectedUpdatedAt); }, onSuccess: onSaved, onError: handleMutationError });
  const pending = mutation.isPending || lifecycleMutation.isPending || loadingLatest;
  const mutationError = lifecycleMutation.error ?? mutation.error;
  const actions = <div className="money-recurring-sheet-actions">
    {mode === "edit" && record ? <Button type="button" tone="ghost" loading={lifecycleMutation.isPending} disabled={pending || conflict || hidden} onClick={() => lifecycleMutation.mutate()}>{record.state === "archived" ? <RotateCcw size={14} /> : <Archive size={14} />}{record.state === "archived" ? "Restore" : "Archive"}</Button> : <span />}
    <span><Button type="button" tone="ghost" disabled={pending} onClick={requestClose}>Cancel</Button><Button form={formId} type="submit" tone="primary" loading={mutation.isPending} disabled={pending || !valid || conflict}>{mode === "create" ? "Add record" : "Save changes"}</Button></span>
  </div>;
  return <Sheet open={open} onOpenChange={(next) => { if (!next) requestClose(); }} title={mode === "create" ? "Add recurring" : "Edit recurring record"} description="Save a local expectation. Kora does not move money or contact the provider." purpose="properties" busy={pending} actions={actions}>
    <form id={formId} className="money-recurring-form" onSubmit={(event) => { event.preventDefault(); if (valid && !conflict) mutation.mutate(); }}>
      {hidden ? <p className="money-recurring-form__privacy" role="status">Amounts are hidden. Show amounts to edit these fields.</p> : null}
      {mode === "create" ? <Field label="Record type"><KoraSelect label="Record type" value={draft.kind} options={[{ value: "bill", label: "Bill" }, { value: "subscription", label: "Subscription" }]} disabled={hidden} onValueChange={(kind) => setDraft({ ...draft, kind })} /></Field> : null}
      <Field label="Name"><Input autoFocus aria-label="Recurring name" value={draft.name} disabled={hidden} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
      <Field label="Category" hint="Optional local grouping; it does not change provider data."><Input aria-label="Recurring category" value={draft.category} disabled={hidden} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></Field>
      <Field label="Linked account" hint="A linked account supplies the currency for any amount."><KoraSelect label="Linked account" value={draft.accountId} options={[{ value: "none", label: "No linked account" }, ...accounts.map((item) => ({ value: item.accountId, label: `${item.name} · ${item.currency}` }))]} disabled={hidden} onValueChange={(accountId) => setDraft({ ...draft, accountId })} /></Field>
      <Field label={`Expected amount${selectedAccount ? ` (${selectedAccount.currency})` : ""}`} hint={selectedAccount ? "Optional local expectation." : "Select an account before entering an amount; Kora never assumes currency."}><Input aria-label="Expected amount" inputMode="decimal" disabled={hidden || !selectedAccount} value={hidden ? "" : draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></Field>
      <Field label={`Range maximum${selectedAccount ? ` (${selectedAccount.currency})` : ""}`} hint="Optional. When set, the expected amount becomes the range minimum."><Input aria-label="Range maximum" inputMode="decimal" disabled={hidden || !selectedAccount} value={hidden ? "" : draft.amountMax} onChange={(event) => setDraft({ ...draft, amountMax: event.target.value })} /></Field>
      {draft.kind === "bill" ? preservesExactBill ? <Field label="Due timing" hint="This record uses an exact-date rule. Other edits preserve that rule."><Input aria-label="Due timing" value={record?.timingRule ?? "Exact recorded date"} disabled /></Field> : <Field label="Due day" hint="Recorded monthly day, from 1–31."><Input aria-label="Due day" type="number" min={1} max={31} value={draft.dueDay} disabled={hidden} onChange={(event) => setDraft({ ...draft, dueDay: event.target.value })} /></Field> : <><Field label="Cadence"><KoraSelect label="Cadence" value={draft.cadence} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" }]} disabled={hidden} onValueChange={(cadence) => setDraft({ ...draft, cadence })} /></Field><Field label="Last observed date" hint="Optional evidence anchor; it is not proof of the next payment."><Input aria-label="Last observed date" type="date" value={draft.lastSeen} disabled={hidden} onChange={(event) => setDraft({ ...draft, lastSeen: event.target.value })} /></Field></>}
      {mode === "edit" && record && record.state !== "archived" ? <Field label="Lifecycle"><KoraSelect label="Lifecycle" value={draft.state} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, ...(record.kind === "bill" && record.state === "completed" ? [{ value: "completed", label: "Completed" }] : [])]} disabled={hidden} onValueChange={(state) => setDraft({ ...draft, state })} /></Field> : null}
      {dismissWarning ? <div className="money-recurring-conflict" role="alert"><strong>Discard this draft?</strong><p>The saved recurring record has not changed.</p><div className="money-recurring-conflict__actions"><Button type="button" tone="danger" onClick={() => { setDismissWarning(false); onClose(); }}>Discard draft</Button><Button type="button" tone="ghost" onClick={() => setDismissWarning(false)}>Keep editing</Button></div></div> : null}
 {conflict ? <div className="money-recurring-conflict" role="alert"><strong>This record changed elsewhere</strong><p>Your draft remains intact. Compare every submitted value before deciding.</p>{latest ? <div className="money-recurring-conflict__comparison"><section><span>Latest saved</span><strong>{latest.name}</strong><small>{conflictRecordAmount(latest, hidden)}</small><small>Category: {latest.category || "Not set"}</small><small>{latest.accountName || latest.accountId || "No linked account"}</small><small>{timingLabel(latest)} · {humanize(latest.state)}</small>{latest.kind === "subscription" ? <small>Last observed: {subscriptionLastSeen(latest) || "Not set"}</small> : null}</section><section><span>Your draft</span><strong>{draft.name}</strong><small>{conflictDraftAmount(draft.amount, draft.amountMax, selectedAccount?.currency, hidden)}</small><small>Category: {draft.category.trim() || "Not set"}</small><small>{selectedAccount?.name || (draft.accountId === "none" ? "No linked account" : draft.accountId)}</small><small>{draft.kind === "bill" ? draft.dueDay ? `Due day ${draft.dueDay}` : timingLabel(record!) : `${humanize(draft.cadence)} cadence`} · {humanize(draft.state)}</small>{draft.kind === "subscription" ? <small>Last observed: {draft.lastSeen || "Not set"}</small> : null}</section></div> : <p>{loadingLatest ? "Reading the latest saved record…" : "The latest saved record could not be read. Cancel to avoid overwriting unknown changes."}</p>}<div className="money-recurring-conflict__actions"><Button type="button" tone="secondary" disabled={!latest || hidden} onClick={() => { if (!latest) return; setDraft(recurringDraft(latest)); setExpectedUpdatedAt(latest.updatedAt); mutation.reset(); lifecycleMutation.reset(); setConflict(false); }}>Use latest</Button><Button type="button" tone="secondary" disabled={!latest || hidden} onClick={() => { if (!latest) return; setExpectedUpdatedAt(latest.updatedAt); mutation.reset(); lifecycleMutation.reset(); setConflict(false); }}>Keep editing</Button><Button type="button" tone="ghost" onClick={onClose}>Cancel</Button></div></div> : mutationError ? <p className="money-recurring-form__error" role="alert">{mutationError.message}</p> : null}
    </form>
  </Sheet>;
}

function recurringDraft(record?: RecurringRecord) {
  return record ? {
    kind: record.kind,
    name: record.name,
    amount: record.amountMinMinor != null && record.currency ? String(record.amountMinMinor / 100) : record.amountMinor != null && record.currency ? String(record.amountMinor / 100) : "",
    amountMax: record.amountMaxMinor != null && record.currency ? String(record.amountMaxMinor / 100) : "",
    category: record.category ?? "",
    accountId: record.accountId || "none",
    cadence: record.kind === "subscription" ? record.cadence || "monthly" : "monthly",
    dueDay: record.kind === "bill" && record.timingRule?.startsWith("day:") ? record.timingRule.slice(4) : "",
    lastSeen: record.kind === "subscription" ? String((record.raw as FinanceSubscription).lastSeenDate ?? "").slice(0, 10) : "",
    state: record.state,
  } : { kind: "bill", name: "", amount: "", amountMax: "", category: "", accountId: "none", cadence: "monthly", dueDay: "1", lastSeen: "", state: "active" };
}

function normalizeRecords(bills: FinanceBill[], subscriptions: FinanceSubscription[]): RecurringRecord[] { return [...bills.map((row): RecurringRecord => ({ key: `bill:${row.id}`, kind: "bill", id: row.id, name: row.billerName, amountMinor: row.expectedAmountMinor, amountMinMinor: row.expectedAmountMinMinor, amountMaxMinor: row.expectedAmountMaxMinor, category: row.category, currency: row.currency, accountId: row.accountId, accountName: row.accountName, timingRule: row.dueRule, nextExpectedAt: row.nextExpectedAt, provenance: row.provenance, state: row.state, updatedAt: row.updatedAt, evidence: row.reconciliationEvidence, raw: row })), ...subscriptions.map((row): RecurringRecord => ({ key: `subscription:${row.id}`, kind: "subscription", id: row.id, name: row.merchantName, amountMinor: row.expectedAmountMinor, amountMinMinor: row.expectedAmountMinMinor, amountMaxMinor: row.expectedAmountMaxMinor, category: row.category, currency: row.currency, accountId: row.accountId, accountName: row.accountName, cadence: row.cadence, timingRule: row.cadence, nextExpectedAt: row.nextExpectedAt, provenance: row.provenance, state: row.state, updatedAt: row.updatedAt, evidence: row.reconciliationEvidence, raw: row }))]; }
function uniqueRecurringRecords(records: RecurringRecord[]) { const seen = new Set<string>(); return records.filter((record) => { if (seen.has(record.key)) return false; seen.add(record.key); return true; }); }
function parseCursorHistory(value: string | null): string[] { if (!value) return []; return value.split(".").filter((entry) => entry === "~" || /^[A-Za-z0-9_-]{1,2048}$/.test(entry)).slice(-50); }
function mergeFinanceSources(left: FinanceSources, right: FinanceSources): FinanceSources { const result: FinanceSources = { ...left }; for (const [key, candidate] of Object.entries(right)) { const current = result[key]; if (!current || sourceRank(candidate) > sourceRank(current)) result[key] = candidate; } return result; }
function sourceRank(source: LifeSourceState) { return source.state === "unavailable" ? 3 : source.state === "partial" ? 2 : 1; }
function groupRecords(records: RecurringRecord[], now: Date, timeZone?: string) { const buckets = new Map<string, RecurringRecord[]>([["past", []], ["week", []], ["later", []], ["uncertain", []], ["paused", []], ["completed", []], ["archived", []]]); const today = calendarOrdinal(now, timeZone); for (const record of records) { const expected = record.nextExpectedAt ? calendarOrdinal(new Date(record.nextExpectedAt), timeZone) : undefined; let key = record.state === "archived" ? "archived" : record.state === "paused" ? "paused" : record.state === "completed" ? "completed" : expected == null ? "uncertain" : expected < today ? "past" : expected <= today + 7 ? "week" : "later"; buckets.get(key)!.push(record); } const labels: Record<string, string> = { past: "Expected date passed — not yet matched", week: "Next 7 days", later: "Later expectations", uncertain: "Timing needs confirmation", paused: "Paused", completed: "Completed", archived: "Archived" }; return [...buckets].filter(([, items]) => items.length).map(([key, items]) => ({ key, label: labels[key], items: items.sort((a, b) => (a.nextExpectedAt || "z").localeCompare(b.nextExpectedAt || "z") || a.name.localeCompare(b.name)) })); }
function recordStatus(record: RecurringRecord, source: LifeSourceState | { state: "loading" }): { label: string; tone: "quiet" | "warning" | "success" | "neutral" } { if (record.state === "archived") return { label: "Archived", tone: "quiet" }; if (record.state === "paused") return { label: "Paused", tone: "neutral" }; if (record.state === "completed") return { label: record.evidence.length ? "Matched / completed" : "Completed", tone: "success" }; if (!record.nextExpectedAt) return { label: "Uncertain", tone: "warning" }; if (source.state !== "ok") return { label: "Latest unchecked", tone: "warning" }; if (record.evidence.length) return { label: "Matched evidence", tone: "success" }; return { label: "Not yet matched", tone: "quiet" }; }
function exactSource(source?: LifeSourceState, complete = true): LifeSourceState | { state: "loading" } { if (!source) return { state: "unavailable" }; if (!complete && source.state === "ok") return { state: "partial", unavailableSources: ["exact recurring record"] }; return source; }
function sourceLabel(source: LifeSourceState | { state: "loading" }) { return source.state === "ok" ? "Connected coverage available" : source.state === "partial" ? "Partial connected coverage" : source.state === "loading" ? "Reading coverage" : "Connected activity unavailable"; }
function provenanceLabel(value?: string | null) { return value?.startsWith("receipt:") ? "Added from a receipt" : value === "user:confirmed" ? "Confirmed by you" : value ? "Saved source" : "Source unavailable"; }
function timingLabel(record: RecurringRecord) { return record.kind === "bill" ? record.timingRule?.startsWith("day:") ? `Due day ${record.timingRule.slice(4)}` : "Exact recorded date" : `${humanize(record.cadence || "Unknown")} cadence`; }
function money(minor: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100); }
function cents(value: string) { if (value.trim() === "") return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null; }
function conflictRecordAmount(record: RecurringRecord, hidden?: boolean) { if (hidden) return "Amount hidden"; if (!record.currency && (record.amountMinor != null || record.amountMinMinor != null)) return "Amount currency unavailable"; if (record.amountMinMinor != null && record.amountMaxMinor != null && record.currency) return `${money(record.amountMinMinor, record.currency)}–${money(record.amountMaxMinor, record.currency)}`; if (record.amountMinor == null) return "Amount not set"; return money(record.amountMinor, record.currency!); }
function conflictDraftAmount(value: string, maximum: string, currency?: string, hidden?: boolean) { if (hidden) return "Amount hidden"; const minor = cents(value), max = cents(maximum); if (minor == null) return "Amount not set"; if (!currency) return "Amount currency unavailable"; return max != null ? `${money(minor, currency)}–${money(max, currency)}` : money(minor, currency); }
function occurrenceSummary(items: RecurringRecord["evidence"], hidden: boolean) {
  if (!items.length) return "No linked payment amounts are attached to this recurring record.";
  if (hidden) return `${items.length} linked ${items.length === 1 ? "occurrence" : "occurrences"}; amounts are hidden.`;
  const byCurrency = new Map<string, number[]>();
  for (const item of items) if (item.observedAmountMinor != null && item.observedCurrency) byCurrency.set(item.observedCurrency, [...(byCurrency.get(item.observedCurrency) ?? []), item.observedAmountMinor]);
  const summaries = [...byCurrency].map(([currency, values]) => {
    const minimum = Math.min(...values), maximum = Math.max(...values);
    return minimum === maximum ? money(minimum, currency) : `${money(minimum, currency)}–${money(maximum, currency)}`;
  });
  return `${items.length} linked ${items.length === 1 ? "occurrence" : "occurrences"}: ${summaries.join(" · ")}.`;
}
function subscriptionLastSeen(record: RecurringRecord) { return record.kind === "subscription" ? String((record.raw as FinanceSubscription).lastSeenDate ?? "").slice(0, 10) : ""; }
function isRecurringConflict(error: Error) { if (error instanceof RuntimeRequestError) return error.status === 409 || error.code === "conflict"; return error.message === "Finance bill changed; refresh and try again" || error.message === "Finance subscription changed; refresh and try again"; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function shortDate(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function dateMonth(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)).toUpperCase(); }
function dateDay(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { day: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function fullDate(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function shortDateTime(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function calendarOrdinal(value: Date, timeZone?: string) { const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).formatToParts(value); const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value); return Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000); }
function useCompactDetail() { const [compact, setCompact] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1180px)").matches); useEffect(() => { if (typeof window.matchMedia !== "function") return; const media = window.matchMedia("(max-width: 1180px)"); const update = () => setCompact(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []); return compact; }
