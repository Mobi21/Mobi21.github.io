import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronLeft, ChevronRight, CircleAlert, Eye, EyeOff, Landmark, MessageCircleMore, ReceiptText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import { Badge, Button, PageFrame, PageHeader, Sheet, StateNotice } from "../../components/primitives";
import { runtime, type ConversationContextReference, type FinanceAccount, type FinanceAccountsRead, type FinanceConnectionSource } from "../../lib/runtime";
import { MoneyNavigation } from "./MoneyNavigation";
import "./money-accounts.css";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
type AccountPageInput = { cursor?: string; pageSize?: number };
export type MoneyAccountsLoaders = { accounts: (input?: string | AccountPageInput) => Promise<FinanceAccountsRead> };
const liveLoaders: MoneyAccountsLoaders = { accounts: runtime.financeAccounts };

export function MoneyAccountsWorkspace({ onAskKora, loaders = liveLoaders, requestKey = "live" }: { onAskKora: Ask; loaders?: MoneyAccountsLoaders; requestKey?: string }) {
  const queryClient = useQueryClient();
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const navigate = useNavigate();
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();
  const [params, setParams] = useSearchParams();
  const compactDetail = useCompactDetail();
  const selectedId = routeAccountId ?? params.get("account") ?? undefined;
  const pageCursor = params.get("accountPageCursor") ?? undefined;
  const pageHistory = parseCursorHistory(params.get("accountPageHistory"));
  const collection = useQuery({ queryKey: ["money-accounts", requestKey, "collection", pageCursor], queryFn: () => loaders.accounts({ cursor: pageCursor, pageSize: 50 }) });
  const exact = useQuery({ queryKey: ["money-accounts", requestKey, "exact", selectedId], queryFn: () => loaders.accounts(selectedId!), enabled: Boolean(selectedId) });
  const accounts = uniqueAccounts(collection.data?.accounts ?? []);
  const connections = collection.data?.connections ?? [];
  const selectedAccount = exact.data?.accounts[0];
  const selectedSource = (exact.data?.connections ?? connections).find((source) => source.connectionId === selectedAccount?.connectionId);
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("account");
    if (routeAccountId) {
      void navigate({ pathname: "/life/finances/accounts", search: next.size ? `?${next}` : "" }, { replace: true });
      return;
    }
    setParams(next, { replace: true });
  };
  const accountHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.delete("account");
    return `/life/finances/accounts/${encodeURIComponent(id)}${next.size ? `?${next}` : ""}`;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["money-accounts", requestKey] });
  const paginationFocus = useRef<HTMLSpanElement>(null);
  const restoreScrollTop = useRef<number | undefined>(undefined);
  const pendingPageFocus = useRef(false);
  const changePage = (cursor: string | undefined, history: string[]) => {
    const owner = document.querySelector<HTMLElement>(".life-stage");
    restoreScrollTop.current = owner?.scrollTop;
    pendingPageFocus.current = true;
    const next = new URLSearchParams(params);
    next.delete("account");
    cursor ? next.set("accountPageCursor", cursor) : next.delete("accountPageCursor");
    history.length ? next.set("accountPageHistory", history.join(".")) : next.delete("accountPageHistory");
    if (routeAccountId) {
      void navigate({ pathname: "/life/finances/accounts", search: next.size ? `?${next}` : "" });
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
  useEffect(() => { const previous = previousSelected.current; previousSelected.current = selectedId; if (!previous || selectedId) return; requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-account-id="${CSS.escape(previous)}"]`) ?? document.querySelector<HTMLElement>(".money-accounts-workspace .k-page-header"))?.focus()); }, [selectedId]);

  const currentSources = connections.filter((source) => source.state === "current").length;
  const manualSources = connections.filter((source) => source.state === "manual").length;
  const attentionSources = connections.filter((source) => source.state === "stale" || source.state === "partial" || source.state === "reauthorization_required").length;
  const unavailableSources = connections.filter((source) => source.state === "unavailable" || source.state === "not_configured").length;
  const lastSuccessful = connections.map((source) => source.lastSuccessfulAt).filter((value): value is string => Boolean(value)).sort().at(-1);
  const status = collection.isPending ? "Reading account coverage"
    : collection.isError ? "Account coverage unavailable"
    : !connections.length ? "No configured account source"
    : manualSources === connections.length ? `${manualSources} manual ${manualSources === 1 ? "source" : "sources"}`
    : [currentSources ? `${currentSources} ${currentSources === 1 ? "source" : "sources"} current` : "", attentionSources ? `${attentionSources} ${attentionSources === 1 ? "source needs" : "sources need"} attention` : "", manualSources ? `${manualSources} local ${manualSources === 1 ? "source" : "sources"}` : "", unavailableSources ? `${unavailableSources} ${unavailableSources === 1 ? "source" : "sources"} unavailable` : ""].filter(Boolean).join(" · ");
  const totalAccounts = collection.data?.total ?? accounts.length;
  const accountCountLabel = `${totalAccounts} ${totalAccounts === 1 ? "account" : "accounts"}`;
  const accountStatus = collection.isPending ? "Accounts loading"
    : collection.isError ? "Accounts unavailable"
    : !connections.length ? `${accounts.length} saved ${accounts.length === 1 ? "account" : "accounts"}`
    : accountCountLabel;
  const detail = selectedId && !compactDetail ? <AccountDetailState account={selectedAccount} source={selectedSource} pending={exact.isPending} error={exact.isError} hidden={amountsHidden} viewerTimeZone={exact.data?.viewerTimeZone ?? collection.data?.viewerTimeZone} onClose={closeDetail} onAskKora={onAskKora} /> : undefined;
  const sheetDetail = selectedId && compactDetail ? <AccountDetailState account={selectedAccount} source={selectedSource} pending={exact.isPending} error={exact.isError} hidden={amountsHidden} viewerTimeZone={exact.data?.viewerTimeZone ?? collection.data?.viewerTimeZone} onClose={closeDetail} onAskKora={onAskKora} showHeader={false} /> : undefined;

  return <section className="money-accounts-workspace">
    <PageFrame width="wide" inspector={detail} inspectorLabel="Account details">
      <PageHeader tabIndex={-1} title="Accounts & sources" description="Accounts, balances, and their sources." status={<><span>{accountStatus}</span><span aria-hidden="true">·</span><span>{status}</span></>} actions={<Button tone="secondary" aria-label={amountsHidden ? "Show amounts" : "Hide amounts"} onClick={toggleAmounts}>{amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}<span className="money-accounts-viewbar-label">{amountsHidden ? "Show amounts" : "Hide amounts"}</span></Button>} />
      <MoneyNavigation variant="bar" />
      {collection.isPending ? <StateNotice role="status" icon={<CircleAlert size={20} />} title="Opening account coverage" body="Reading local accounts and their provider qualification." />
        : collection.isError ? <StateNotice role="alert" tone="danger" icon={<CircleAlert size={20} />} title={pageCursor ? "This account page is unavailable" : "Account coverage is unavailable"} body={pageCursor ? "Kora could not read this bounded page. Earlier pages and the exact account route remain unchanged." : "Kora could not read accounts or source state. This is not being presented as an empty account list."} action={<>{pageHistory.length ? <Button tone="secondary" onClick={previousPage}><ChevronLeft size={14} />Previous page</Button> : null}<Button onClick={() => void collection.refetch()}>Try again</Button></>} />
        : <>
          <div className="money-accounts-panels">
            <AccountCollection accounts={accounts} connections={connections} hidden={amountsHidden} viewerTimeZone={collection.data?.viewerTimeZone} hrefFor={accountHref} />
            <section className="money-accounts-panel money-accounts-panel--sources" aria-label="Source coverage">
              <CoverageSummary connections={connections} accountCount={totalAccounts} lastSuccessful={lastSuccessful} viewerTimeZone={collection.data?.viewerTimeZone} />
              <SourceCollection connections={connections} viewerTimeZone={collection.data?.viewerTimeZone} />
            </section>
          </div>
          {(pageHistory.length || collection.data?.cursor) ? <nav className="money-collection-pagination" aria-label="Account pages">
            <Button tone="secondary" disabled={!pageHistory.length} onClick={previousPage}><ChevronLeft size={14} />Previous</Button>
            <span ref={paginationFocus} tabIndex={-1}>Page {pageHistory.length + 1} · {accounts.length} shown{collection.data?.total != null ? ` of ${collection.data.total}` : ""}</span>
            <Button tone="secondary" disabled={!collection.data?.cursor} onClick={nextPage}>Next<ChevronRight size={14} /></Button>
          </nav> : null}
        </>}
    </PageFrame>
    <Sheet open={Boolean(selectedId && compactDetail)} onOpenChange={(open) => { if (!open) closeDetail(); }} title={selectedAccount?.name ?? "Account"} description="Exact account, source, and calculation context." purpose="inspector">{sheetDetail}</Sheet>
  </section>;
}

function parseCursorHistory(value: string | null): string[] {
  if (!value) return [];
  return value.split(".").filter((entry) => entry === "~" || /^[A-Za-z0-9_-]{1,2048}$/.test(entry)).slice(-50);
}

function uniqueAccounts(accounts: FinanceAccount[]): FinanceAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => !seen.has(account.accountId) && Boolean(seen.add(account.accountId)));
}

function CoverageSummary({ connections, accountCount, lastSuccessful, viewerTimeZone }: { connections: FinanceConnectionSource[]; accountCount: number; lastSuccessful?: string; viewerTimeZone?: string }) {
  const current = connections.filter((source) => source.state === "current").length;
  const manual = connections.filter((source) => source.state === "manual").length;
  const attention = connections.filter((source) => source.state === "stale" || source.state === "partial" || source.state === "reauthorization_required").length;
  const unavailable = connections.filter((source) => source.state === "unavailable" || source.state === "not_configured").length;
  const heading = !connections.length ? "No account source is configured"
    : attention || unavailable ? `${current} of ${connections.length} sources are current`
    : manual === connections.length ? `${accountCount} ${accountCount === 1 ? "account is" : "accounts are"} maintained locally`
    : `${accountCount} accounts are currently covered`;
  const detail = !connections.length ? "Set up a supported source in Settings. Money never collects provider credentials here."
    : attention || unavailable ? "Each source keeps its own state; saved balances remain labeled as last-confirmed or unavailable."
    : manual === connections.length ? "Manual sources are available without provider synchronization; their balances remain explicitly labeled as manual."
    : `All configured provider sources are current${lastSuccessful ? `; most recent successful read ${dateTime(lastSuccessful, viewerTimeZone)}` : ""}.`;
  const needsRecovery = !connections.length || attention > 0 || unavailable > 0;
  const recoveryLabel = !connections.length ? "Set up a source" : "Review connections";
  return <section className="money-accounts-coverage" aria-labelledby="money-account-coverage-title"><CircleAlert size={17} aria-hidden="true" /><div><span>Coverage</span><h2 id="money-account-coverage-title">{heading}</h2><p>{detail}</p></div>{connections.length ? <ul aria-label="Coverage breakdown"><li><b>{current}</b> {current === 1 ? "source" : "sources"} current</li>{attention ? <li><b>{attention}</b> {attention === 1 ? "source needs" : "sources need"} attention</li> : null}{manual ? <li><b>{manual}</b> local {manual === 1 ? "source" : "sources"}</li> : null}{unavailable ? <li><b>{unavailable}</b> {unavailable === 1 ? "source" : "sources"} unavailable</li> : null}<li><b>{accountCount}</b> {accountCount === 1 ? "account" : "accounts"}</li></ul> : null}{needsRecovery ? <Link className="button button--secondary" to="/settings/integrations">{recoveryLabel}</Link> : null}</section>;
}

function SourceCollection({ connections, viewerTimeZone }: { connections: FinanceConnectionSource[]; viewerTimeZone?: string }) {
  if (!connections.length) return null;
  const groups = [
    { key: "current", label: "Current", states: ["current"] },
    { key: "attention", label: "Needs attention", states: ["stale", "partial", "reauthorization_required"] },
    { key: "manual", label: "Manual / local", states: ["manual"] },
    { key: "unavailable", label: "Unavailable", states: ["unavailable", "not_configured"] },
  ].map((group) => ({ ...group, items: connections.filter((source) => group.states.includes(source.state)).sort((a, b) => a.providerId.localeCompare(b.providerId)) })).filter((group) => group.items.length);
  return <section className="money-accounts-section money-sources" aria-labelledby="money-sources-heading"><header><div><h2 id="money-sources-heading">Sources</h2><p>Connection health and recovery stay separate from account balances.</p></div></header><div className="money-source-groups">{groups.map((group) => <section key={group.key} aria-labelledby={`money-source-${group.key}`}><h3 id={`money-source-${group.key}`}>{group.label}</h3><ol className="money-source-list">{group.items.map((source) => <li key={source.connectionId}><div className="money-source-row"><span className="money-source-icon"><Building2 size={16} /></span><span className="money-source-identity"><strong>{providerLabel(source.providerId)}</strong><small>{source.accountCount} {source.accountCount === 1 ? "account" : "accounts"} · {source.coveredDataKinds.length ? source.coveredDataKinds.map(humanize).join(", ") : source.state === "manual" ? "Local balance" : "Coverage not reported"}</small></span><span className="money-source-freshness"><strong>{source.lastSuccessfulAt ? `Last successful read ${dateTime(source.lastSuccessfulAt, viewerTimeZone)}` : source.state === "manual" ? "Local source" : "No successful update yet"}</strong><small>{source.unavailableReason || `Recovery: ${source.recoveryOwner}`}</small></span><Badge tone={sourceTone(source.state)} dot>{sourceLabel(source.state)}</Badge></div><details><summary>Inspect source</summary><dl><div><dt>Permissions reported</dt><dd>{source.permissions.length ? source.permissions.join(", ") : source.state === "manual" ? "Not applicable" : "Not reported"}</dd></div><div><dt>Last checked</dt><dd>{source.lastCheckedAt ? dateTime(source.lastCheckedAt, viewerTimeZone) : source.state === "manual" ? "Not applicable" : "Unavailable"}</dd></div><div><dt>Recovery</dt><dd>{source.recoveryOwner}</dd></div></dl></details></li>)}</ol></section>)}</div></section>;
}

function AccountCollection({ accounts, connections, hidden, viewerTimeZone, hrefFor }: { accounts: FinanceAccount[]; connections: FinanceConnectionSource[]; hidden: boolean; viewerTimeZone?: string; hrefFor: (id: string) => string }) {
  if (!accounts.length && !connections.length) return null;
  if (!accounts.length) { const successfulZero = connections.length > 0 && connections.every((source) => source.state === "current" || source.state === "manual"); return <section className="money-accounts-panel money-accounts-panel--accounts money-accounts-section" aria-labelledby="money-accounts-heading"><header><div><h2 id="money-accounts-heading">Accounts</h2><p>Balances retain their source and freshness; unavailable never becomes zero.</p></div></header><StateNotice role="status" tone={successfulZero ? "neutral" : "warning"} icon={<CircleAlert size={20} />} title={!connections.length ? "Accounts are not configured" : successfulZero ? "No accounts were returned" : "Account availability is not confirmed"} body={!connections.length ? "Set up a supported source from Accounts & integrations." : successfulZero ? "The source was checked successfully and returned zero accounts." : "Source coverage needs attention, so zero returned rows are not treated as a confirmed empty account list."} /></section>; }
  const sourceMap = new Map(connections.map((source) => [source.connectionId, source]));
  return <section className="money-accounts-panel money-accounts-panel--accounts money-accounts-section" aria-labelledby="money-accounts-heading"><header><div><h2 id="money-accounts-heading">Accounts</h2><p>Balances retain their source and freshness; unavailable never becomes zero.</p></div><span>{accounts.length} shown</span></header><ol className="money-account-list">{accounts.map((account) => { const source = sourceMap.get(account.connectionId); return <li key={account.accountId}><Link to={hrefFor(account.accountId)} data-account-id={account.accountId}><span className="money-account-icon"><Landmark size={16} /></span><span className="money-account-identity"><strong>{account.name}</strong><small>{providerLabel(source?.providerId ?? account.providerId ?? "Unknown source")} · {accountTypeLabel(account.type)}</small></span><span className="money-account-freshness"><strong>{balanceQualificationLabel(account.balanceQualification)}</strong><small>{account.lastSyncedAt ? dateTime(account.lastSyncedAt, viewerTimeZone) : account.connectionState === "manual" ? "Manual update time unavailable" : "Sync time unavailable"}</small></span><Badge tone={sourceTone(account.connectionState ?? "unavailable")} dot>{sourceLabel(account.connectionState ?? "unavailable")}</Badge><AccountAmount account={account} hidden={hidden} /></Link></li>; })}</ol></section>;
}

function AccountDetailState({ account, source, pending, error, hidden, viewerTimeZone, onClose, onAskKora, showHeader = true }: { account?: FinanceAccount; source?: FinanceConnectionSource; pending: boolean; error: boolean; hidden: boolean; viewerTimeZone?: string; onClose: () => void; onAskKora: Ask; showHeader?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { if (!account) requestAnimationFrame(() => heading.current?.focus()); }, [account, pending, error]);
  if (!account) return <section className="money-account-detail"><header><div><span>Account</span><h2 ref={heading} tabIndex={-1}>{pending ? "Opening account" : error ? "Account unavailable" : "Account not found"}</h2></div>{showHeader ? <Button tone="ghost" aria-label="Close account details" onClick={onClose}><X size={16} /></Button> : null}</header><p>{pending ? "Reading this saved account and its source details." : error ? "Kora could not read this account. The collection remains unchanged." : "This account is no longer returned by its source."}</p></section>;
  return <AccountDetail account={account} source={source} hidden={hidden} viewerTimeZone={viewerTimeZone} onClose={onClose} onAskKora={onAskKora} showHeader={showHeader} />;
}

function AccountDetail({ account, source, hidden, viewerTimeZone, onClose, onAskKora, showHeader }: { account: FinanceAccount; source?: FinanceConnectionSource; hidden: boolean; viewerTimeZone?: string; onClose: () => void; onAskKora: Ask; showHeader: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { if (showHeader) requestAnimationFrame(() => heading.current?.focus()); }, [account.accountId, showHeader]);
  const activityCurrent = source?.state === "current" || source?.state === "manual";
 return <section className="money-account-detail" aria-label={showHeader ? undefined : "Account details"}>{showHeader ? <header><div><span>{accountTypeLabel(account.type)}</span><h2 ref={heading} tabIndex={-1}>{account.name}</h2></div><Button tone="ghost" aria-label="Close account details" onClick={onClose}><X size={16} /></Button></header> : null}<div className="money-account-detail__balance"><AccountAmount account={account} hidden={hidden} /><Badge tone={sourceTone(account.connectionState ?? "unavailable")} dot>{balanceQualificationLabel(account.balanceQualification)}</Badge></div><dl className="money-account-detail__facts"><div><dt>Source</dt><dd>{providerLabel(source?.providerId ?? account.providerId ?? "Unknown")}<small>{source ? sourceLabel(source.state) : "Source detail unavailable"}</small></dd></div><div><dt>Balance freshness</dt><dd>{account.lastSyncedAt ? dateTime(account.lastSyncedAt, viewerTimeZone) : "Unavailable"}<small>{balanceQualificationLabel(account.balanceQualification)}</small></dd></div><div><dt>Current plan</dt><dd>{account.includedInAllowance ? "Included" : "Not included"}<small>{account.allowanceInclusionReason || "Plan inclusion is unavailable"}</small></dd></div><div><dt>Recurring records</dt><dd>{account.linkedRecurringCount ?? "Unknown"}<small>Active local bills and subscriptions linked to this account.</small></dd></div></dl><section><h3>{activityCurrent ? "Recent activity" : "Last-confirmed activity"}</h3>{!activityCurrent && account.recentActivity?.length ? <p role="status">Unable to check the latest connected activity; these saved rows may be out of date.</p> : null}{account.recentActivity?.length ? <ol className="money-account-detail__activity">{account.recentActivity.map((item) => <li key={item.id}><ReceiptText size={15} /><span><strong>{item.merchant?.trim() || item.description?.trim() || "Untitled transaction"}</strong><small>{dateTime(item.occurredAt, viewerTimeZone)} · {item.pending ? "Pending" : "Posted"}</small></span><span>{hidden ? <span aria-label="Amount hidden">••••••</span> : money(-item.amountMinor, item.currency)}</span></li>)}</ol> : <p>{account.recentActivity ? "No recent activity was returned for this account." : "Recent activity is still loading or unavailable."}</p>}</section><details><summary>Advanced account details</summary><dl><div><dt>Account ID</dt><dd>{account.accountId}</dd></div><div><dt>Provider account ID</dt><dd>{account.providerAccountId || "Unavailable"}</dd></div><div><dt>Raw account type</dt><dd>{account.type || "Unavailable"}</dd></div><div><dt>Currency</dt><dd>{account.currency}</dd></div><div><dt>Provider limitations</dt><dd>{source?.unavailableReason || (source?.coveredDataKinds.length ? `Coverage reported for ${source.coveredDataKinds.join(", ")}.` : "Provider coverage details unavailable.")}</dd></div></dl></details><div className="money-account-detail__actions"><Button tone="secondary" onClick={() => onAskKora(hidden ? undefined : { kind: "finance_record", id: account.accountId, title: account.name }, `Explain finance account ${account.accountId} from its exact local account, source coverage, freshness, and calculation inclusion. ${hidden ? "Amounts are hidden; do not attach, repeat, infer, or expose monetary values." : "Use the attached exact account."} Do not characterize affordability, financial health, fraud, or advice.`)}><MessageCircleMore size={14} />Ask Kora</Button></div></section>;
}

function AccountAmount({ account, hidden }: { account: FinanceAccount; hidden: boolean }) { if (hidden) return <span className="money-account-amount" aria-label="Amount hidden">••••••</span>; if (account.balanceMinor == null) return <span className="money-account-amount money-account-muted">Balance unavailable</span>; return <span className="money-account-amount">{money(account.balanceMinor, account.currency)}</span>; }
function sourceLabel(state: FinanceConnectionSource["state"]) { return state === "reauthorization_required" ? "Reauthorization required" : humanize(state); }
function sourceTone(state: FinanceConnectionSource["state"]): "success" | "warning" | "quiet" | "neutral" { return state === "current" ? "success" : state === "manual" ? "neutral" : state === "stale" || state === "partial" || state === "reauthorization_required" ? "warning" : "quiet"; }
function balanceQualificationLabel(value?: FinanceAccount["balanceQualification"]) { return value === "current" ? "Current balance" : value === "last_confirmed" ? "Last-confirmed balance" : value === "manual" ? "Manual balance" : "Balance unavailable"; }
function providerLabel(value: string) { return value.replaceAll(/[-_:]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function accountTypeLabel(value: string) { const raw = value.trim(); const normalized = raw.toLowerCase().replaceAll("_", ":").replaceAll("-", ":"); if (normalized === "credit:card") return "Credit card"; if (/(^|:)checking$/.test(normalized) || /\bchecking$/.test(normalized)) return "Checking"; if (/(^|:)savings$/.test(normalized) || /\bsavings$/.test(normalized)) return "Savings"; return raw ? humanize(raw) : "Account type unavailable"; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(minor: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100); }
function dateTime(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(value)); }
function useCompactDetail() { const [compact, setCompact] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1180px)").matches); useEffect(() => { if (typeof window.matchMedia !== "function") return; const media = window.matchMedia("(max-width: 1180px)"); const update = () => setCompact(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []); return compact; }
