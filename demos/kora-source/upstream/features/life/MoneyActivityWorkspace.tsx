import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CircleAlert, Eye, EyeOff, MessageCircleMore, ReceiptText, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import { Badge, Button, ContentState, DataTable, Input, KoraSelect, PageFrame, PageHeader, PageToolbar, SearchField, Sheet, type DataColumn, type DataTableState } from "../../components/primitives";
import { Textarea } from "../../components/form";
import { runtime, type ConversationContextReference, type FinanceAccount, type FinanceReceipt, type FinanceReceiptQuery, type FinanceSnapshot, type FinanceSources, type FinanceTransaction, type FinanceTransactionQuery, type LifeSourceState } from "../../lib/runtime";
import { MoneyNavigation } from "./MoneyNavigation";
import "./money-activity.css";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
type TransactionPage = {
  items: FinanceTransaction[];
  cursor?: string;
  complete: boolean;
  total?: number;
  needsReviewTotal?: number;
  categories?: string[];
  sources: FinanceSources;
};
export type MoneyActivityLoaders = {
  accounts: () => Promise<{ accounts: FinanceAccount[]; sources: FinanceSources }>;
  transactions: (input: FinanceTransactionQuery) => Promise<TransactionPage>;
  receipts: (input?: FinanceReceiptQuery) => Promise<{ items: FinanceReceipt[]; cursor?: string; complete: boolean; sources: FinanceSources }>;
  context: () => Promise<Pick<FinanceSnapshot, "generatedAt" | "viewerTimeZone">>;
  updateAnnotation?: typeof runtime.updateFinanceTransactionAnnotation;
  resolveReceipt?: typeof runtime.resolveFinanceReceipt;
};

const liveLoaders: MoneyActivityLoaders = {
  accounts: runtime.financeAccounts,
  transactions: runtime.financeTransactions,
  receipts: runtime.financeReceipts,
  context: runtime.financeSnapshot,
  updateAnnotation: runtime.updateFinanceTransactionAnnotation,
  resolveReceipt: runtime.resolveFinanceReceipt,
};
const loadingSource = { state: "loading" as const };
const unavailableSource = { state: "unavailable" as const };

const financeReference = (id: string, title: string): ConversationContextReference => ({ kind: "finance_record", id, title });
const rangeOptions = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "Any date" },
];
const directionOptions = [
  { value: "all", label: "Any direction" },
  { value: "outflow", label: "Money out" },
  { value: "inflow", label: "Money in" },
];
const postingOptions = [
  { value: "all", label: "Any posting state" },
  { value: "exclude", label: "Posted only" },
  { value: "only", label: "Pending only" },
];
const evidenceOptions = [
  { value: "all", label: "Any evidence state" },
  { value: "needs_review", label: "Needs evidence review" },
  { value: "matched", label: "Receipt linked" },
  { value: "none", label: "No linked receipt" },
];
const freshnessOptions = [
  { value: "all", label: "Any freshness" },
  { value: "current", label: "Current" },
  { value: "last_confirmed", label: "Last confirmed" },
  { value: "manual", label: "Manual/local" },
];
const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Amount: high to low" },
  { value: "amount_asc", label: "Amount: low to high" },
];

export function MoneyActivityWorkspace({ onAskKora, loaders = liveLoaders, requestKey = "live" }: { onAskKora: Ask; loaders?: MoneyActivityLoaders; requestKey?: string }) {
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const navigate = useNavigate();
  const { transactionId: routeTransactionId } = useParams<{ transactionId?: string }>();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const compactDetail = useMediaMatch("(max-width: 1180px)");
  const compactCollection = useMediaMatch("(max-width: 899px)");
  const query = params.get("q") ?? "";
  const deferredQuery = useDeferredValue(query.trim());
  const accountId = params.get("account") ?? "all";
  const direction = (params.get("flow") ?? "all") as NonNullable<FinanceTransactionQuery["direction"]>;
  const posting = (params.get("posting") ?? "all") as NonNullable<FinanceTransactionQuery["pending"]>;
  const category = params.get("category") ?? "all";
  const evidence = (params.get("evidence") ?? "all") as NonNullable<FinanceTransactionQuery["evidence"]>;
  const freshness = (params.get("freshness") ?? "all") as NonNullable<FinanceTransactionQuery["freshness"]>;
  const sort = (params.get("sort") ?? "newest") as NonNullable<FinanceTransactionQuery["sort"]>;
  const range = params.get("range") ?? "30";
  const reviewMode = params.get("view") === "review";
  const legacyTransactionId = params.get("transaction") ?? undefined;
  const selectedId = routeTransactionId ?? legacyTransactionId;
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [pendingPage, setPendingPage] = useState<{ cursor: string; pageCursors: Array<string | undefined> }>();
  const pageCursor = pageCursors[pageCursors.length - 1];
  const now = useRef(new Date()).current;
  const context = useQuery({ queryKey: ["money-activity", requestKey, "context"], queryFn: loaders.context });
  const accounts = useQuery({ queryKey: ["money-activity", requestKey, "accounts"], queryFn: loaders.accounts });
  const dateWindow = useMemo(() => rangeWindow(range, now), [now, range]);
  const filterKey = [deferredQuery, accountId, direction, posting, category, evidence, freshness, sort, range, reviewMode].join("|");
  const previousFilterKey = useRef(filterKey);
  const lastSuccessfulPage = useRef<{ filterKey: string; page: TransactionPage } | undefined>(undefined);
  useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    lastSuccessfulPage.current = undefined;
    setPageCursors([undefined]);
    setPendingPage(undefined);
    setSelected(new Set());
  }, [filterKey]);
  const requestedPageCursor = pendingPage?.cursor ?? pageCursor;
  const effectivePageCursor = previousFilterKey.current === filterKey ? requestedPageCursor : undefined;
  const activity = useQuery({
    queryKey: ["money-activity", requestKey, "collection", filterKey, dateWindow.fromDate, dateWindow.toDate, effectivePageCursor],
    queryFn: () => loaders.transactions({
      pageSize: 100,
      ...(deferredQuery ? { query: deferredQuery } : {}),
      ...(accountId !== "all" ? { accountId } : {}),
      direction,
      pending: posting,
      ...(category !== "all" ? { category } : {}),
      evidence,
      freshness,
      ...(reviewMode ? { review: "only" as const } : {}),
      sort,
      ...dateWindow,
      ...(effectivePageCursor ? { cursor: effectivePageCursor } : {}),
    }),
    placeholderData: keepPreviousData,
  });
  const loadedActivityPage = activity.isSuccess && activity.data && !activity.isPlaceholderData ? activity.data : undefined;
  useEffect(() => {
    if (activity.isSuccess && activity.data && !activity.isPlaceholderData)
      lastSuccessfulPage.current = { filterKey, page: activity.data };
    if (pendingPage && activity.isSuccess && activity.data && !activity.isPlaceholderData && activity.data === loadedActivityPage) {
      setPageCursors(pendingPage.pageCursors);
      setPendingPage(undefined);
    }
  }, [activity.data, activity.isPlaceholderData, activity.isSuccess, filterKey, loadedActivityPage, pendingPage]);
  const retainedActivityPage = lastSuccessfulPage.current?.filterKey === filterKey ? lastSuccessfulPage.current.page : undefined;
  const activityPage = loadedActivityPage ?? retainedActivityPage;
  const visiblePageCursors = pendingPage && loadedActivityPage ? pendingPage.pageCursors : pageCursors;
  const pageIndex = visiblePageCursors.length - 1;
  const rows = activityPage?.items ?? [];
  const ledgerUnavailable = activity.isError && !activityPage;
  const accountOptions = useMemo(() => [{ value: "all", label: "All accounts" }, ...(accounts.data?.accounts ?? []).map((account) => ({ value: account.accountId, label: account.name }))], [accounts.data?.accounts]);
  const categoryOptions = useMemo(() => {
    const values = new Set(activityPage?.categories ?? []);
    if (category !== "all" && category !== "uncategorized") values.add(category);
    return [
      { value: "all", label: "Any category" },
      { value: "uncategorized", label: "Uncategorized" },
      ...[...values].sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value })),
    ];
  }, [activityPage?.categories, category]);
  const source = ledgerUnavailable
    ? unavailableSource
    : activityPage?.sources.plaid ?? accounts.data?.sources.plaid ?? (activity.isPending ? loadingSource : unavailableSource);
  const sourceMeta = sourceLabel(source);
  const total = activityPage?.total ?? rows.length;
  const needsReviewTotal = activityPage?.needsReviewTotal ?? (reviewMode ? total : rows.filter((item) => item.evidenceState === "needs_review" || !item.category?.trim()).length);
  const pageStart = rows.length ? pageIndex * 100 + 1 : 0;
  const pageEnd = rows.length ? pageStart + rows.length - 1 : 0;
  const activeFilterCount = Number(accountId !== "all") + Number(direction !== "all") + Number(posting !== "all") + Number(category !== "all") + Number(evidence !== "all") + Number(freshness !== "all") + Number(range !== "30") + Number(sort !== "newest");
  const filtered = Boolean(deferredQuery || activeFilterCount);
  const disconnectedEmpty = !rows.length && !activity.isPending && !activity.isError && !filtered && !selectedId && source.state !== "ok";
  const loadedMeta = disconnectedEmpty ? "Activity unavailable" : ledgerUnavailable ? "Result count unavailable" : total > rows.length ? `${total.toLocaleString()} results` : `${total} ${total === 1 ? "result" : "results"}`;
  const dateScopeLabel = rangeLabel(range);
  const loadedSelection = selectedId ? rows.find((item) => item.id === selectedId) : undefined;
  const selectedRecord = useQuery({
    queryKey: ["money-activity", requestKey, "transaction", selectedId],
    queryFn: () => loaders.transactions({ transactionId: selectedId, pageSize: 1 }),
    enabled: Boolean(selectedId && !loadedSelection),
  });
  const selectedTransaction = loadedSelection ?? selectedRecord.data?.items[0] ?? null;
  const viewerTimeZone = context.data?.viewerTimeZone;
  const selectedEvidence = useQuery({
    queryKey: ["money-activity", requestKey, "transaction-evidence", selectedId],
    queryFn: () => loaders.receipts({ transactionIds: selectedId ? [selectedId] : [], pageSize: 200 }),
    enabled: Boolean(selectedId),
  });
  const receiptMatches = selectedEvidence.data?.items ?? [];
  const updateParams = (patch: Record<string, string | undefined>, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of ["q", "account", "flow", "posting", "category", "evidence", "freshness", "range", "sort"]) next.delete(key);
    setParams(next, { replace: true });
  };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("transaction");
    if (routeTransactionId) {
      void navigate({
        pathname: "/life/finances/activity",
        search: next.size ? `?${next}` : "",
      }, { replace: true });
      return;
    }
    setParams(next, { replace: true });
  };
  const closeInspectorOnEscape = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true'], [role='combobox'], [data-popup-open], [data-dismiss-policy='explicit']")) return;
    event.preventDefault();
    event.stopPropagation();
    closeDetail();
  };
  const transactionHref = (item: FinanceTransaction) => {
    const next = new URLSearchParams(params);
    next.delete("transaction");
    const search = next.size ? `?${next}` : "";
    return `/life/finances/activity/${encodeURIComponent(item.id)}${search}`;
  };

  const previousSelected = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previous = previousSelected.current;
    previousSelected.current = selectedId;
    if (!previous || selectedId) return;
    requestAnimationFrame(() => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>(".money-activity-workspace [data-row-return-id]")]
        .find((candidate) => candidate.dataset.rowReturnId === previous);
      if (link) link.focus();
      else document.querySelector<HTMLElement>(".money-activity-workspace .k-page-header")?.focus();
    });
  }, [selectedId]);

  const evidenceQualified = activityPage?.sources.gmail?.state === "ok";
  const evidenceState = (item: FinanceTransaction) => item.evidenceState ?? "unknown";

  const columns: DataColumn<FinanceTransaction>[] = [
    { key: "transaction", header: "Transaction", width: "auto", cellText: (item) => `Open ${merchant(item)}`, cell: (item) => <span className="money-activity-subject"><span className="money-activity-direction" data-direction={item.amountMinor < 0 ? "in" : "out"}>{item.amountMinor < 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span><span><strong>{merchant(item)}</strong>{transactionDescription(item) ? <small>{transactionDescription(item)}</small> : null}</span></span> },
    { key: "amount", header: "Amount", width: "8rem", align: "end", cellText: (item) => amountsHidden ? "Amount hidden" : signedMoney(item), cell: (item) => <ActivityAmount item={item} hidden={amountsHidden} /> },
    { key: "date", header: "Date", width: "8rem", wideOnly: true, cellText: (item) => fullDate(item.occurredAt, viewerTimeZone), cell: (item) => <span className="money-activity-date"><CalendarDays size={13} />{shortDate(item.occurredAt, viewerTimeZone)}</span> },
    { key: "account", header: "Account", width: "12rem", wideOnly: true, cellText: (item) => `${item.accountName} · ${accountTypeLabel(item.accountType)}`, cell: (item) => <span className="money-activity-account"><strong>{item.accountName}</strong><small>{accountTypeLabel(item.accountType)}</small></span> },
    { key: "category", header: "Category", width: "10rem", wideOnly: true, cellText: (item) => item.category?.trim() || "Uncategorized", cell: (item) => <span className="money-activity-category" data-empty={!item.category?.trim() || undefined}>{item.category?.trim() || "Uncategorized"}</span> },
    { key: "evidence", header: "Evidence", width: "10rem", wideOnly: true, cellText: (item) => evidenceLabel(evidenceState(item)), cell: (item) => <span className="money-activity-evidence" data-evidence={evidenceState(item)}>{evidenceLabel(evidenceState(item))}</span> },
    { key: "state", header: "State", width: "7rem", cellText: (item) => `${item.pending ? "Pending" : "Posted"} · ${freshnessLabel(item.freshness)}`, cell: (item) => <span className="money-activity-state"><Badge tone={item.pending ? "warning" : "quiet"} dot>{item.pending ? "Pending" : "Posted"}</Badge><small className="money-activity-state__freshness">{freshnessLabel(item.freshness)}</small></span> },
  ];

  const evidenceAbsenceUnqualified = evidence === "none" && !evidenceQualified;
  const state: DataTableState | undefined = activity.isError && !rows.length
    ? { mode: "replacement", announcement: "assertive", kind: "error", title: "Activity is unavailable", description: "Kora could not read the local transaction ledger. No missing amount has been converted to zero.", action: <Button onClick={() => void activity.refetch()}><RefreshCw size={14} />Try again</Button> }
    : evidenceAbsenceUnqualified
      ? { mode: rows.length ? "advisory" : "replacement", kind: "partial", title: "Receipt absence cannot be confirmed", description: "Receipt coverage is unavailable, so Kora will not classify missing evidence as a true absence.", action: <Button onClick={() => updateParams({ evidence: undefined })}>Show all evidence states</Button> }
    : !activity.isPending && !rows.length
      ? filtered
        ? reviewMode
          ? { mode: "replacement", kind: "filtered-empty", title: "Nothing needs review in this view", description: "The complete filtered collection has no uncategorized transaction or unresolved receipt candidate.", action: <Button onClick={clearFilters}>Clear filters</Button> }
          : { mode: "replacement", kind: "filtered-empty", title: "Nothing matches these filters", description: source.state === "ok" ? "Other recorded activity remains unchanged." : `No saved activity matches these filters. Connected coverage is ${source.state}, so other saved activity may remain outside this view.`, action: <Button onClick={clearFilters}>Clear filters</Button> }
        : source.state !== "ok"
          ? { mode: "replacement", kind: "unavailable", title: "Activity could not be confirmed", description: "Connect an account to see transactions. Your saved goals and recurring records are still available.", action: <Link className="button button--secondary" to="/settings/integrations">Review connections</Link> }
          : reviewMode
            ? { mode: "replacement", kind: "filtered-empty", title: "Nothing needs review in this view", description: "The complete filtered collection has no uncategorized transaction or unresolved receipt candidate.", action: undefined }
            : { mode: "replacement", kind: "empty", title: "No recorded transactions", description: "The transaction source returned a successful empty result for this range." }
      : undefined;
  const replacementState = state?.mode === "replacement" && !rows.length ? state : undefined;
  const canLoadNextPage = Boolean(activityPage && !activityPage.complete && activityPage.cursor);
  const nextPageFailed = Boolean(pendingPage && activity.isError);
  const requestNextPage = () => {
    const cursor = activityPage?.cursor;
    if (!cursor || activityPage?.complete) return;
    if (pendingPage?.cursor === cursor) {
      void activity.refetch();
      return;
    }
    setSelected(new Set());
    setPendingPage({ cursor, pageCursors: [...visiblePageCursors, cursor] });
  };

  const detailEvidenceState: EvidenceReadState = selectedEvidence.isPending ? "loading" : selectedEvidence.isError ? "error" : selectedEvidence.data?.complete && selectedEvidence.data.sources.gmail?.state === "ok" ? "complete" : "partial";
  const detailState = selectedId && !selectedTransaction
    ? <TransactionDetailState pending={selectedRecord.isPending} error={selectedRecord.isError} onClose={closeDetail} showHeader={!compactDetail} />
    : undefined;
  const detailSource = loadedSelection ? source : selectedRecord.data?.sources.plaid ?? (selectedRecord.isPending ? loadingSource : unavailableSource);
  const inspectorDetail = selectedId && !compactDetail ? selectedTransaction
    ? <TransactionDetail item={selectedTransaction} source={detailSource} evidence={receiptMatches} evidenceState={detailEvidenceState} viewerTimeZone={viewerTimeZone} hidden={amountsHidden} onClose={closeDetail} onAskKora={onAskKora} loaders={loaders} requestKey={requestKey} />
    : detailState : undefined;
  const sheetDetail = selectedId && compactDetail ? selectedTransaction
    ? <TransactionDetail item={selectedTransaction} source={detailSource} evidence={receiptMatches} evidenceState={detailEvidenceState} viewerTimeZone={viewerTimeZone} hidden={amountsHidden} onClose={closeDetail} onAskKora={onAskKora} showHeader={false} loaders={loaders} requestKey={requestKey} />
    : detailState : undefined;
  return <section className="money-activity-workspace">
    <PageFrame width="wide" scroll="internal" inspector={inspectorDetail ? <div className="money-activity-inspector" onKeyDown={closeInspectorOnEscape}>{inspectorDetail}</div> : undefined} inspectorLabel="Transaction details">
      <PageHeader tabIndex={-1} title="Activity" description="Transactions, evidence, and items that still need confirmation." status={<><span>{loadedMeta}</span><span aria-hidden="true">·</span><span>{sourceMeta}</span></>} actions={disconnectedEmpty ? undefined : <>
        <Button tone="secondary" aria-label={amountsHidden ? "Show amounts" : "Hide amounts"} onClick={toggleAmounts}>{amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}<span className="money-viewbar-label">{amountsHidden ? "Show amounts" : "Hide amounts"}</span></Button>
        <Button tone="secondary" aria-label="Explain activity" onClick={() => onAskKora(undefined, `Explain the currently filtered Money activity. Read the relevant transaction records and name their source qualifications before drawing conclusions. Amounts are ${amountsHidden ? "hidden and every amount value must remain omitted" : "visible in the workspace"}.`)}><MessageCircleMore size={15} /><span className="money-viewbar-label">Explain activity</span></Button>
      </>} />
      <MoneyNavigation variant="bar" />
      {disconnectedEmpty ? null : <div className="money-activity-panel money-activity-panel--controls">
        <nav className="money-activity-views" aria-label="Activity views"><Link to={activityViewHref(params, false)} aria-current={!reviewMode ? "page" : undefined}><span>All activity</span>{!reviewMode ? <small>{loadedMeta}</small> : null}</Link><Link to={activityViewHref(params, true)} aria-current={reviewMode ? "page" : undefined}><span>Needs review</span><small>{ledgerUnavailable ? "Review coverage unavailable" : `${needsReviewTotal.toLocaleString()} ${needsReviewTotal === 1 ? "item" : "items"}`}</small></Link><p>Needs review is qualified across the complete filtered ledger: uncategorized transactions and unresolved receipt candidates.</p></nav>
        <PageToolbar sticky search={<SearchField value={query} onValueChange={(value) => updateParams({ q: value || undefined })} label="Search activity" placeholder="Merchant, description, account, or note" />} controls={<><Button onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={15} />Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</Button><ActivityDateScope label={dateScopeLabel} /></>} />
      </div>}
      <div className={`money-activity-panel money-activity-panel--collection${disconnectedEmpty ? " money-activity-panel--empty" : ""}`}>
        {source.state !== "ok" && rows.length ? <div className="money-activity-notice" role="status"><CircleAlert size={16} /><span>{sourceNoticeLabel(source)}</span><Link to="/settings/integrations">Review connections</Link></div> : null}
        {activity.isError && rows.length ? <div className="money-activity-notice" role="alert"><CircleAlert size={16} /><span>{nextPageFailed ? "The next page could not be loaded. This page remains visible and unchanged." : "This page could not be loaded. The current results remain visible and unchanged."}</span><Button tone="ghost" onClick={() => void activity.refetch()}>{nextPageFailed ? "Retry next page" : "Try again"}</Button></div> : null}
        {replacementState ? <ContentState state={replacementState.kind} title={replacementState.title} body={replacementState.description} action={replacementState.action} announcement={replacementState.announcement} size="section" /> : <DataTable rows={rows} columns={columns} rowKey={(item) => item.id} returnId={(item) => item.id} href={transactionHref} caption={reviewMode ? "Money activity needing review" : "Money activity"} loading={activity.isPending && !rows.length} loadingRows={3} state={state} mobileSummary={(item) => <span className="money-activity-mobile"><span className="money-activity-mobile__context">{shortDate(item.occurredAt, viewerTimeZone)} · {item.accountName}<small>{item.category?.trim() || "Uncategorized"} · {evidenceLabel(evidenceState(item))} · {freshnessLabel(item.freshness)}</small></span><span className="money-activity-mobile__trailing"><Badge tone={item.pending ? "warning" : "quiet"} dot>{item.pending ? "Pending" : "Posted"}</Badge><ActivityAmount item={item} hidden={amountsHidden} /></span></span>} intermediateSummary={(item) => <span className="money-activity-intermediate"><span>{shortDate(item.occurredAt, viewerTimeZone)} · {item.accountName}</span><small>{item.category?.trim() || "Uncategorized"} · {evidenceLabel(evidenceState(item))} · {freshnessLabel(item.freshness)}</small></span>} selection={{ scope: "page", scopeKey: `${filterKey}|${pendingPage?.cursor ?? visiblePageCursors[visiblePageCursors.length - 1] ?? "first"}`, selected, onChange: setSelected, label: (item) => `Select ${merchant(item)}`, actions: <><Button onClick={() => onAskKora(undefined, `Review these transaction identifiers without changing them: ${rows.filter((item) => selected.has(item.id)).map((item) => item.id).join(", ")}. Read each exact transaction record before drawing conclusions. Amounts are ${amountsHidden ? "hidden and must remain omitted" : "visible in the workspace"}.`)}>Review selection</Button><Button tone="ghost" onClick={() => setSelected(new Set())}>Clear</Button></> }} summary={ledgerUnavailable ? "Activity unavailable · result count unknown" : rows.length ? `Showing ${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()} results` : undefined} onPreviousPage={pageIndex > 0 ? () => { setSelected(new Set()); setPendingPage(undefined); setPageCursors((current) => current.slice(0, -1)); } : undefined} onLoadMore={canLoadNextPage ? requestNextPage : undefined} loadingMore={Boolean(pendingPage && activity.isFetching)} loadMoreLabel={nextPageFailed ? "Retry next page" : "Next page"} windowSize={compactCollection ? 12 : undefined} />}
      </div>
    </PageFrame>
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Activity filters" description="Narrow the complete ledger without changing any Money records." purpose="properties"><div className="money-activity-filter-sheet"><ActivityFilters accountOptions={accountOptions} categoryOptions={categoryOptions} accountId={accountId} direction={direction} posting={posting} category={category} evidence={evidence} freshness={freshness} range={range} sort={sort} update={updateParams} />{filtered ? <Button tone="ghost" onClick={() => { clearFilters(); setFiltersOpen(false); }}>Clear filters</Button> : null}</div></Sheet>
    <Sheet open={Boolean(selectedId && compactDetail)} onOpenChange={(open) => { if (!open) closeDetail(); }} title={selectedTransaction ? merchant(selectedTransaction) : "Transaction"} description="Transaction details, how it was added, and receipt review." purpose="inspector">{sheetDetail}</Sheet>
  </section>;
}

function ActivityFilters({ accountOptions, categoryOptions, accountId, direction, posting, category, evidence, freshness, range, sort, update }: {
  accountOptions: Array<{ value: string; label: string }>;
  categoryOptions: Array<{ value: string; label: string }>;
  accountId: string;
  direction: NonNullable<FinanceTransactionQuery["direction"]>;
  posting: NonNullable<FinanceTransactionQuery["pending"]>;
  category: string;
  evidence: NonNullable<FinanceTransactionQuery["evidence"]>;
  freshness: NonNullable<FinanceTransactionQuery["freshness"]>;
  range: string;
  sort: NonNullable<FinanceTransactionQuery["sort"]>;
  update: (patch: Record<string, string | undefined>) => void;
}) {
  return <div className="money-activity-filters">
    <FilterField label="Date"><KoraSelect label="Date" value={range} options={rangeOptions} onValueChange={(value) => update({ range: value === "30" ? undefined : value })} /></FilterField>
    <FilterField label="Account"><KoraSelect label="Account" value={accountId} options={accountOptions} onValueChange={(value) => update({ account: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Category"><KoraSelect label="Category" value={category} options={categoryOptions} onValueChange={(value) => update({ category: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Direction"><KoraSelect label="Direction" value={direction} options={directionOptions} onValueChange={(value) => update({ flow: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Posting"><KoraSelect label="Posting" value={posting} options={postingOptions} onValueChange={(value) => update({ posting: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Evidence"><KoraSelect label="Evidence" value={evidence} options={evidenceOptions} onValueChange={(value) => update({ evidence: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Freshness"><KoraSelect label="Freshness" value={freshness} options={freshnessOptions} onValueChange={(value) => update({ freshness: value === "all" ? undefined : value })} /></FilterField>
    <FilterField label="Sort"><KoraSelect label="Sort" value={sort} options={sortOptions} onValueChange={(value) => update({ sort: value === "newest" ? undefined : value })} /></FilterField>
  </div>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="money-activity-filter"><span className="money-activity-filter__label">{label}</span>{children}</div>;
}

function ActivityDateScope({ label }: { label: string }) {
  return <span className="money-activity-date-scope" aria-label={`Date scope: ${label}`} data-activity-date-scope><CalendarDays size={14} aria-hidden="true" /><span>Date scope</span><strong>{label}</strong></span>;
}

type EvidenceReadState = "loading" | "error" | "partial" | "complete";

function TransactionDetail({ item, source, evidence, evidenceState, viewerTimeZone, hidden, onClose, onAskKora, loaders, requestKey, showHeader = true }: { item: FinanceTransaction; source: LifeSourceState | { state: "loading" }; evidence: FinanceReceipt[]; evidenceState: EvidenceReadState; viewerTimeZone?: string; hidden: boolean; onClose: () => void; onAskKora: Ask; loaders: MoneyActivityLoaders; requestKey: string; showHeader?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const [note, setNote] = useState(item.note ?? "");
  const [category, setCategory] = useState(item.category ?? "");
  const [annotationVersion, setAnnotationVersion] = useState(item.annotationVersion ?? 0);
  const [annotationConflict, setAnnotationConflict] = useState<Extract<Awaited<ReturnType<NonNullable<MoneyActivityLoaders["updateAnnotation"]>>>, { status: "conflict" }> | undefined>();
  const [noteFeedback, setNoteFeedback] = useState<string>();
  const [receiptFeedback, setReceiptFeedback] = useState<string>();
  const receiptIntent = useRef<{ receiptId: string; action: "confirm_match" | "reject_match" | "dismiss"; transactionId?: string; expectedVersion: number; requestKey: string } | undefined>(undefined);
  useEffect(() => { if (showHeader) requestAnimationFrame(() => heading.current?.focus()); }, [item.id, showHeader]);
  useEffect(() => { setNote(item.note ?? ""); setCategory(item.category ?? ""); setAnnotationVersion(item.annotationVersion ?? 0); setAnnotationConflict(undefined); setNoteFeedback(undefined); setReceiptFeedback(undefined); }, [item.id, item.note, item.category, item.annotationVersion]);
  const saveNote = useMutation({
    mutationFn: () => (loaders.updateAnnotation ?? runtime.updateFinanceTransactionAnnotation)(item.id, {
      note,
      category: category.trim() || null,
      expectedVersion: annotationVersion,
    }),
    onSuccess: async (outcome) => {
      if (outcome.status === "conflict") {
        setAnnotationConflict(outcome);
        setNoteFeedback(undefined);
        return;
      }
      if (outcome.status === "gone") {
        setAnnotationConflict(undefined);
        setNoteFeedback("This transaction is no longer available. Your draft was not saved.");
        return;
      }
      setAnnotationConflict(undefined);
      setAnnotationVersion(outcome.annotation.version);
      setNoteFeedback("Note saved locally. It remains available when the provider is unavailable.");
      await queryClient.invalidateQueries({ queryKey: ["money-activity", requestKey] });
    },
    onError: () => setNoteFeedback("The note could not be saved. Your draft is still here; try again."),
  });
  const settleReceipt = useMutation({
    mutationFn: (intent?: typeof receiptIntent.current) => {
      const active = intent ?? receiptIntent.current;
      if (!active) throw new Error("No receipt review is waiting.");
      receiptIntent.current = active;
      const { receiptId, ...requestBody } = active;
      return (loaders.resolveReceipt ?? runtime.resolveFinanceReceipt)(receiptId, requestBody);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === "conflict") {
        setReceiptFeedback("This receipt review changed elsewhere. Refresh the exact evidence before choosing again.");
        return;
      }
      if (outcome.status === "gone") {
        setReceiptFeedback("This receipt evidence is no longer available. No match was recorded.");
        return;
      }
      receiptIntent.current = undefined;
      setReceiptFeedback("Receipt review complete and saved to its history.");
      await queryClient.invalidateQueries({ queryKey: ["money-activity", requestKey] });
    },
    onError: () => setReceiptFeedback("The receipt review could not be settled. Retry will use the same exact request."),
  });
  const resolve = (receipt: FinanceReceipt, action: "confirm_match" | "reject_match" | "dismiss", transactionId?: string) => {
    const intent = { receiptId: receipt.id, action, ...(transactionId ? { transactionId } : {}), expectedVersion: receipt.version ?? 1, requestKey: crypto.randomUUID() };
    setReceiptFeedback(undefined);
    settleReceipt.mutate(intent);
  };
  return <section className="money-transaction-detail" aria-labelledby={showHeader ? "money-transaction-detail-title" : undefined} aria-label={showHeader ? undefined : "Transaction details"}>
    {showHeader ? <header><div><span>Transaction</span><h2 id="money-transaction-detail-title" ref={heading} tabIndex={-1}>{merchant(item)}</h2></div><Button tone="ghost" aria-label="Close transaction details" onClick={onClose}><X size={16} /></Button></header> : null}
    <div className="money-transaction-detail__amount"><ActivityAmount item={item} hidden={hidden} /><Badge tone={item.pending ? "warning" : "quiet"} dot>{item.pending ? "Pending" : "Posted"}</Badge></div>
    <dl><div><dt>Date</dt><dd>{fullDateTime(item.occurredAt, viewerTimeZone)}</dd></div><div><dt>Account</dt><dd>{item.accountName}<small>{accountTypeLabel(item.accountType)}</small></dd></div><div><dt>Source status</dt><dd>{sourceLabel(source)} · {freshnessLabel(item.freshness)}<small>{item.freshness === "last_confirmed" && item.lastSyncedAt ? `Last successful read ${shortDateTime(item.lastSyncedAt, viewerTimeZone)}` : `Record updated ${shortDateTime(item.updatedAt, viewerTimeZone)}`}</small></dd></div><div><dt>Currency</dt><dd>{item.currency}</dd></div></dl>
    <section className="money-transaction-note" aria-labelledby="money-transaction-note-title"><h3 id="money-transaction-note-title">Your transaction note</h3><p>This local note and category remain usable even when the connected transaction provider cannot refresh.</p><label><span>Note</span><Textarea value={note} rows={5} maxLength={10_000} onChange={(event) => setNote(event.target.value)} /></label><label><span>Category</span><Input value={category} maxLength={240} onChange={(event) => setCategory(event.target.value)} /></label>{annotationConflict ? <div className="money-transaction-conflict" role="alert"><strong>This note changed elsewhere</strong><p>Compare the latest saved values with your retained draft before trying again.</p><dl><div><dt>Latest saved</dt><dd><strong>{annotationConflict.current.category?.trim() || "Uncategorized"}</strong><span>{annotationConflict.current.note.trim() || "No note"}</span><small>Saved version {annotationConflict.current.version} · {annotationConflict.current.updatedAt ? shortDateTime(annotationConflict.current.updatedAt, viewerTimeZone) : "update time unavailable"}</small></dd></div><div><dt>Your draft</dt><dd><strong>{category.trim() || "Uncategorized"}</strong><span>{note.trim() || "No note"}</span><small>Based on saved version {annotationVersion}</small></dd></div></dl><div className="money-transaction-conflict__actions"><Button tone="secondary" onClick={() => { setNote(annotationConflict.current.note); setCategory(annotationConflict.current.category ?? ""); setAnnotationVersion(annotationConflict.current.version); setAnnotationConflict(undefined); }}>Use latest</Button><Button tone="secondary" onClick={() => { setAnnotationVersion(annotationConflict.current.version); setAnnotationConflict(undefined); }}>Keep editing</Button><Button tone="ghost" onClick={onClose}>Cancel edit</Button></div></div> : <Button tone="secondary" disabled={saveNote.isPending} onClick={() => saveNote.mutate(undefined)}>{saveNote.isPending ? "Saving note" : "Save note"}</Button>}{noteFeedback ? <p role={saveNote.isError ? "alert" : "status"}>{noteFeedback}</p> : null}</section>
    <section className="money-receipt-read"><h3>Receipt evidence</h3>{evidence.length ? <ul>{evidence.map((receipt) => <li key={receipt.id}><ReceiptText size={15} /><div><strong>{receipt.extractedMerchant ?? "Receipt metadata"}</strong><small>{receipt.subject ?? "No message subject"}{receipt.sender ? ` · ${receipt.sender}` : ""}</small><dl><div><dt>Match</dt><dd>{humanize(receipt.matchState)}{receipt.matchConfidence ? ` · ${humanize(receipt.matchConfidence)} confidence` : ""}</dd></div><div><dt>Extraction</dt><dd>{humanize(receipt.extractionConfidence)} confidence</dd></div><div><dt>Extracted</dt><dd>{receipt.extractedDate ? calendarDate(receipt.extractedDate, viewerTimeZone) : "Date unavailable"} · <ReceiptAmount receipt={receipt} hidden={hidden} /></dd></div><div><dt>How it was added</dt><dd>{evidenceState === "complete" ? "From Gmail" : "Gmail coverage is partial"}<small>Receipt updated {shortDateTime(receipt.updatedAt, viewerTimeZone)}</small></dd></div></dl><ReceiptCandidates receipt={receipt} hidden={hidden} viewerTimeZone={viewerTimeZone} disabled={settleReceipt.isPending} onResolve={resolve} />{receipt.history?.length ? <details><summary>Review history</summary><ol>{receipt.history.map((entry) => <li key={`${entry.version}-${entry.action}`}>{humanize(entry.action)} · {humanize(entry.outcome)} · {shortDateTime(entry.recordedAt, viewerTimeZone)}</li>)}</ol></details> : null}</div></li>)}</ul> : <p>{evidenceEmptyCopy(evidenceState)}</p>}{evidenceState === "partial" ? <small>Receipt coverage is partial; absence is not confirmed.</small> : null}{receiptFeedback ? <p role={settleReceipt.isError ? "alert" : "status"}>{receiptFeedback}{settleReceipt.isError && receiptIntent.current ? <Button tone="ghost" onClick={() => settleReceipt.mutate(undefined)}>Retry exact review</Button> : null}</p> : null}</section>
    <details><summary>Advanced source details</summary><dl><div><dt>Transaction ID</dt><dd className="money-transaction-detail__id">{item.id}</dd></div><div><dt>Provider transaction ID</dt><dd className="money-transaction-detail__id">{item.providerTransactionId}</dd></div><div><dt>Connection ID</dt><dd className="money-transaction-detail__id">{item.connectionId}</dd></div><div><dt>Account ID</dt><dd className="money-transaction-detail__id">{item.accountId}</dd></div><div><dt>Account type</dt><dd>{accountTypeLabel(item.accountType)}<small>Raw value: {item.accountType}</small></dd></div>{evidence.map((receipt) => <div key={`receipt-source-${receipt.id}`}><dt>Receipt message ID</dt><dd className="money-transaction-detail__id"><strong>{receipt.extractedMerchant ?? "Receipt metadata"}</strong><small>Subject: {receipt.subject ?? "No message subject"}{receipt.sender ? ` · ${receipt.sender}` : ""}</small><span>Message {receipt.gmailMessageId}</span></dd></div>)}</dl></details>
    <Button onClick={() => onAskKora(hidden ? undefined : financeReference(item.id, merchant(item)), `Explain transaction ${item.id} using its receipt evidence and source status. ${hidden ? "Amounts are hidden: do not attach, repeat, infer, or expose any amount value." : "Use the attached exact transaction record."} Do not infer fraud, affordability, or causation.`)}><MessageCircleMore size={15} />Ask Kora about this record</Button>
  </section>;
}

function TransactionDetailState({ pending, error, onClose, showHeader = true }: { pending: boolean; error: boolean; onClose: () => void; showHeader?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (showHeader) requestAnimationFrame(() => heading.current?.focus()); }, [error, pending, showHeader]);
  return <section className="money-transaction-detail" aria-label="Transaction details">{showHeader ? <header><div><span>Transaction</span><h2 ref={heading} tabIndex={-1}>{pending ? "Opening transaction" : error ? "Transaction unavailable" : "Transaction not found"}</h2></div><Button tone="ghost" aria-label="Close transaction details" onClick={onClose}><X size={16} /></Button></header> : <p><strong>{pending ? "Opening transaction" : error ? "Transaction unavailable" : "Transaction not found"}</strong></p>}<p>{pending ? "Reading the exact transaction record." : error ? "Kora could not read this exact transaction. The activity list remains unchanged." : "This transaction is not present in the current ledger."}</p></section>;
}

function ReceiptCandidates({ receipt, hidden, viewerTimeZone, disabled, onResolve }: {
  receipt: FinanceReceipt;
  hidden: boolean;
  viewerTimeZone?: string;
  disabled: boolean;
  onResolve: (receipt: FinanceReceipt, action: "confirm_match" | "reject_match" | "dismiss", transactionId?: string) => void;
}) {
  if (receipt.reviewedByUser)
    return <div className="money-receipt-candidates"><strong>Review settled</strong><p>{receipt.matchedTransactionId ? `Matched to transaction ${receipt.matchedTransactionId}.` : "Marked unmatched by the user."}</p></div>;
  const candidates = receipt.candidates ?? [];
  const unresolvedCandidateIds = candidates.length ? [] : receipt.candidateTransactionIds;
  return <div className="money-receipt-candidates"><strong>Possible matches</strong>{candidates.length ? <ol>{candidates.map((candidate) => <li key={candidate.transactionId}><div><span><strong>{candidate.merchant?.trim() || candidate.transactionId}</strong><Badge tone={candidate.confidence === "high" ? "success" : "warning"}>{humanize(candidate.confidence)} confidence</Badge></span><small>{candidate.accountName} · {shortDate(candidate.occurredAt, viewerTimeZone)}</small><small>Amount: {candidateAmount(candidate, hidden)}</small>{candidate.reasons.length ? hidden ? <small>Show amounts to inspect match reasons.</small> : <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}</div><Button tone="secondary" disabled={disabled} onClick={() => onResolve(receipt, "confirm_match", candidate.transactionId)}>Confirm this match</Button></li>)}</ol> : unresolvedCandidateIds.length ? <ol>{unresolvedCandidateIds.map((transactionId) => <li key={transactionId}><div><strong>Transaction details unavailable</strong><small>Identifier {transactionId}</small><p>You can confirm this match once Activity can read the transaction details.</p></div></li>)}</ol> : <p>No transaction match is available to confirm.</p>}<div className="money-receipt-candidates__actions"><Button tone="ghost" disabled={disabled} onClick={() => onResolve(receipt, "reject_match")}>Mark unmatched</Button><Button tone="ghost" disabled={disabled} onClick={() => onResolve(receipt, "dismiss")}>Dismiss review</Button></div>{hidden ? <small>Amounts stay hidden in candidate details.</small> : null}</div>;
}

function ActivityAmount({ item, hidden }: { item: FinanceTransaction; hidden: boolean }) { return hidden ? <span className="money-activity-amount" aria-label="Amount hidden">••••••</span> : <span className="money-activity-amount" data-direction={item.amountMinor < 0 ? "in" : "out"}>{signedMoney(item)}</span>; }
function ReceiptAmount({ receipt, hidden }: { receipt: FinanceReceipt; hidden: boolean }) { if (receipt.extractedAmountMinor == null || !receipt.extractedCurrency) return <span>Amount unavailable</span>; if (hidden) return <span aria-label="Amount hidden">••••••</span>; return <span>{new Intl.NumberFormat("en-US", { style: "currency", currency: receipt.extractedCurrency }).format(receipt.extractedAmountMinor / 100)}</span>; }
function sourceLabel(source: LifeSourceState | { state: "loading" }) { return source.state === "ok" ? "Current source read" : source.state === "partial" ? "Partial source coverage" : source.state === "loading" ? "Reading sources" : "Source unavailable"; }
function sourceNoticeLabel(source: LifeSourceState | { state: "loading" }) { return source.state === "partial" ? "Saved activity · Partial coverage" : source.state === "unavailable" ? "Saved activity · Coverage unavailable" : source.state === "loading" ? "Saved activity · Reading coverage" : "Saved activity · Coverage needs review"; }
function evidenceLabel(value: "matched" | "needs_review" | "none" | "unknown") { return value === "matched" ? "Receipt linked" : value === "needs_review" ? "Needs review" : value === "none" ? "No receipt found" : "Evidence not fully checked"; }
function freshnessLabel(value?: FinanceTransaction["freshness"]) { return value === "current" ? "Current" : value === "manual" ? "Manual/local" : value === "last_confirmed" ? "Last confirmed" : "Freshness unavailable"; }
function evidenceEmptyCopy(state: EvidenceReadState) { return state === "loading" ? "Checking receipt evidence…" : state === "error" ? "Receipt evidence could not be checked." : state === "partial" ? "Receipt evidence is not fully available." : "No receipt evidence is linked to this transaction."; }
function merchant(item: FinanceTransaction) { return item.merchant?.trim() || item.description?.trim() || "Untitled transaction"; }
function transactionDescription(item: FinanceTransaction) {
  const merchantName = item.merchant?.trim();
  const description = item.description?.trim();
  return merchantName && description && merchantName.toLocaleLowerCase() !== description.toLocaleLowerCase() ? description : undefined;
}
function accountTypeLabel(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "depository:checking") return "Checking";
  if (normalized === "depository:savings") return "Savings";
  if (normalized === "credit:card") return "Credit card";
  if (normalized === "credit") return "Credit";
  return humanize(value);
}
function candidateAmount(candidate: { amountMinor?: number | null; currency?: string | null }, hidden: boolean) {
  if (hidden) return "Amount hidden";
  if (candidate.amountMinor == null || !candidate.currency) return "Amount unavailable";
  return signedMoneyValue(candidate.amountMinor, candidate.currency);
}
function signedMoney(item: FinanceTransaction) { return signedMoneyValue(item.amountMinor, item.currency); }
function signedMoneyValue(amountMinor: number, currency: string) { return `${amountMinor < 0 ? "+" : "−"}${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(amountMinor) / 100)}`; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function shortDate(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function calendarDate(value: string, timeZone?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "Date unavailable";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : shortDate(value, timeZone);
}
function fullDate(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function shortDateTime(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function fullDateTime(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function activityViewHref(params: URLSearchParams, review: boolean) { const next = new URLSearchParams(params); next.delete("transaction"); if (review) next.set("view", "review"); else next.delete("view"); return `/life/finances/activity${next.size ? `?${next}` : ""}`; }
function rangeLabel(range: string) { return rangeOptions.find((option) => option.value === range)?.label ?? "Last 30 days"; }
function rangeWindow(range: string, now: Date) { if (range === "all") return {}; const days = range === "90" ? 90 : 30; return { fromDate: new Date(now.getTime() - days * 86_400_000).toISOString(), toDate: now.toISOString() }; }
function useMediaMatch(query: string) { const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches); useEffect(() => { if (typeof window.matchMedia !== "function") return undefined; const media = window.matchMedia(query); const update = () => setMatches(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, [query]); return matches; }
