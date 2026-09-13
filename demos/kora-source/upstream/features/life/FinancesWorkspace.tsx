import { useQueries } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CalendarClock, CircleDollarSign, Eye, EyeOff, MessageCircleMore, ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import { Button, Input } from "../../components/primitives";
import { CoverageStrip, PageFrame, PageHeader, PageSection, StateNotice } from "../../components/workspace";
import { runtime, type ConversationContextReference, type FinanceAccountsRead, type FinanceAllowance, type FinanceBill, type FinanceConnectionSource, type FinanceGoal, type FinanceReceipt, type FinanceSnapshot, type FinanceSubscription, type LifeSourceState } from "../../lib/runtime";
import "./finances.css";
import { MoneyNavigation } from "./MoneyNavigation";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
type FinanceResponse<T, K extends string> = Record<K, T[]> & { sources: Record<string, LifeSourceState> };
export type MoneyOverviewLoaders = {
  accounts: () => Promise<FinanceAccountsRead>;
  snapshot: () => Promise<FinanceSnapshot>;
  allowance: () => Promise<FinanceAllowance>;
  bills: (state?: string | null) => Promise<FinanceResponse<FinanceBill, "bills">>;
  subscriptions: (state?: string | null) => Promise<FinanceResponse<FinanceSubscription, "subscriptions">>;
  goals: (state?: string | null) => Promise<FinanceResponse<FinanceGoal, "goals">>;
  receipts: () => Promise<{ items: FinanceReceipt[]; complete: boolean; sources: Record<string, LifeSourceState> }>;
};
const liveLoaders: MoneyOverviewLoaders = { accounts: () => runtime.financeAccounts(), snapshot: () => runtime.financeSnapshot(), allowance: () => runtime.financeAllowance(), bills: () => runtime.financeBills("active"), subscriptions: () => runtime.financeSubscriptions("active"), goals: () => runtime.financeGoals("active"), receipts: () => runtime.financeReceipts() };
const financeReference = (id: string, title: string): ConversationContextReference => ({ kind: "finance_record", id, title });

export function FinancesWorkspace({ onAskKora, loaders = liveLoaders, requestKey = "live", now = new Date() }: { onAskKora: Ask; loaders?: MoneyOverviewLoaders; requestKey?: string; now?: Date }) {
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const [accounts, snapshot, allowance, bills, subscriptions, goals, receipts] = useQueries({ queries: [
    { queryKey: ["money", requestKey, "accounts"], queryFn: () => loaders.accounts() },
    { queryKey: ["money", requestKey, "snapshot"], queryFn: () => loaders.snapshot() },
    { queryKey: ["money", requestKey, "allowance"], queryFn: () => loaders.allowance() },
    { queryKey: ["money", requestKey, "bills", "active"], queryFn: () => loaders.bills("active") },
    { queryKey: ["money", requestKey, "subscriptions", "active"], queryFn: () => loaders.subscriptions("active") },
    { queryKey: ["money", requestKey, "goals", "active"], queryFn: () => loaders.goals("active") },
    { queryKey: ["money", requestKey, "receipts"], queryFn: () => loaders.receipts() },
  ] });
  const queries = [accounts, snapshot, allowance, bills, subscriptions, goals, receipts];
  const loading = queries.every((query) => query.isLoading);
  const failed = queries.filter((query) => query.isError);
  const retry = () => void Promise.all(queries.map((query) => query.refetch()));
  const plaid = accounts.data?.sources.plaid ?? { state: loading ? "loading" as const : "unavailable" as const, reason: "Connected account coverage could not be read." };
  const positionSource = allowance.data?.sources.plaid ?? { state: "unavailable" as const, reason: "The planning calculation could not be read." };
  const activitySource = snapshot.data?.sources.plaid ?? { state: "unavailable" as const, reason: "Connected activity could not be read." };
  const syncTime = latestSync(accounts.data?.connections ?? snapshot.data?.connections ?? []);
  const viewerTimeZone = accounts.data?.viewerTimeZone ?? snapshot.data?.viewerTimeZone ?? allowance.data?.viewerTimeZone;
  const accountCount = accounts.data?.accounts.length ?? snapshot.data?.accounts.length ?? 0;
  const successfulEmptyAccountRead = accounts.data?.sources.plaid.state === "ok" && accounts.data.accounts.length === 0;
  const hasReportableFailures = failed.some((query) => query !== allowance || !successfulEmptyAccountRead);
  const coverage = deriveCoverage(accounts.data, plaid, accountCount, syncTime, viewerTimeZone);
  const explainPosition = () => onAskKora(
    amountsHidden ? undefined : financeReference("allowance", "Current financial position"),
    amountsHidden
      ? "Explain the current Money position using its source qualifications and limitations. Amounts are hidden: do not attach, repeat, infer, or expose any monetary value."
      : "Explain the qualified financial position currently visible, including its sources and limitations.",
  );
  if (loading) return <MoneyLoading />;
  if (failed.length === queries.length) return <MoneyUnavailable onRetry={retry} />;

  const currentBills = bills.data?.bills ?? [], currentSubscriptions = subscriptions.data?.subscriptions ?? [];
  const anchorTime = snapshot.data?.generatedAt ?? allowance.data?.generatedAt ?? now.toISOString();
  const knownAccounts = accounts.data?.accounts ?? snapshot.data?.accounts ?? [];
  const currencies = new Set(knownAccounts.map((account) => account.currency));
  const transactionCurrencies = new Set(snapshot.data?.transactions.map((transaction) => transaction.currency) ?? []);
  const currency = allowance.data?.currency ?? (currencies.size === 1 ? [...currencies][0] : currencies.size === 0 && transactionCurrencies.size === 1 ? [...transactionCurrencies][0] : undefined);
  const activityCurrencies = new Set([
    ...knownAccounts.map((account) => account.currency),
    ...(snapshot.data?.transactions.map((transaction) => transaction.currency) ?? []),
    ...(snapshot.data?.dailyPostedOutflows.flatMap((point) => point.currency ? [point.currency] : []) ?? []),
  ]);
  const positionQualified = Boolean(allowance.data && allowance.data.status !== "unsupported" && allowance.data.currency && positionSource.state === "ok");
  const showActivityPulse = activitySource.state === "ok" && Boolean(snapshot.data);
  const horizon = buildHorizon(currentBills, bills.data?.sources.plaid, currentSubscriptions, subscriptions.data?.sources.plaid, anchorTime, viewerTimeZone);
  const attention = buildAttention(snapshot.data, allowance.data, receipts.data?.items ?? [], currentBills, currentSubscriptions, positionQualified);
  return <section className="money-overview-workspace"><PageFrame width="wide" className="money-workspace">
    <PageHeader title="Money" description="Your position, the next two weeks, and what needs a decision." status={syncTime ? <time dateTime={syncTime}>Last successful read {compactDateTime(syncTime, viewerTimeZone)}</time> : successfulEmptyAccountRead ? <span>Account read complete · no accounts returned</span> : undefined} actions={<>
      <Button tone="secondary" aria-label={amountsHidden ? "Show amounts" : "Hide amounts"} onClick={toggleAmounts}>{amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}<span className="money-viewbar-label">{amountsHidden ? "Show amounts" : "Hide amounts"}</span></Button>
      <Button tone="secondary" aria-label="Explain position" onClick={explainPosition}><MessageCircleMore size={15} /><span className="money-viewbar-label">Explain position</span></Button>
    </>} />
    <MoneyNavigation variant="bar" />
    <CoverageStrip
      aria-label="Money source coverage"
      state={coverage.state}
      title={coverage.title}
      description={coverage.detail}
      action={<Link to={coverage.setup ? "/settings/integrations/plaid" : "/life/finances/accounts"}>{coverage.setup ? "Set up" : "Review sources"}<ArrowRight size={14} /></Link>}
    />
    <div className="money-work-grid money-overview-columns">
      <div className="money-overview-columns__primary">
        <MoneyHorizon items={horizon} hidden={amountsHidden} viewerTimeZone={viewerTimeZone} />
        <AttentionList items={attention} />
      </div>
      <div className="money-overview-columns__companion">
        <FinancialPosition allowance={allowance.data} currency={currency} qualified={positionQualified} multiCurrency={currencies.size > 1} hidden={amountsHidden} source={positionSource} successfulEmptyAccountRead={successfulEmptyAccountRead} setup={coverage.setup} />
        <MoneyGoalsPreview goals={goals.data?.goals ?? []} hidden={amountsHidden} viewerTimeZone={viewerTimeZone} />
      </div>
    </div>
    {showActivityPulse ? <PageSection className="money-activity-section" title="Activity pulse" description="Posted outflow over the last 30 days; pending activity remains separate."><ActivityPulse snapshot={snapshot.data} source={activitySource} currency={currency} hidden={amountsHidden} multiCurrency={activityCurrencies.size > 1} /></PageSection> : null}
    {snapshot.data ? <RecentActivity snapshot={snapshot.data} hidden={amountsHidden} setup={coverage.setup} /> : null}
    {hasReportableFailures ? <div className="money-query-warning" role="status"><AlertCircle size={16} /><span>Some local Money details did not load. Available values remain qualified.</span><Button tone="ghost" onClick={retry}><RefreshCw size={14} />Retry</Button></div> : null}
    <footer className="money-privacy"><ShieldCheck size={15} /><span>Hiding amounts also removes numeric chart and accessible-label values.</span></footer>
  </PageFrame></section>;
}

type CoveragePresentation = { short: string; title: string; detail: string; state: FinanceConnectionSource["state"] | "loading" | "empty"; setup: boolean };
function FinancialPosition({ allowance, currency, qualified, multiCurrency, hidden, source, successfulEmptyAccountRead, setup }: { allowance?: FinanceAllowance; currency?: string; qualified: boolean; multiCurrency: boolean; hidden: boolean; source: LifeSourceState | { state: "loading" }; successfulEmptyAccountRead: boolean; setup: boolean }) {
  const supported = allowance?.status !== "unsupported" ? allowance : undefined;
  const endDay = supported?.remainingDays != null ? calendarDayNumber(supported.generatedAt, supported.viewerTimeZone) + Math.max(0, supported.remainingDays - 1) : undefined;
  const endLabel = endDay == null ? undefined : compactCalendarDay(endDay);
  const shortage = supported?.planningRemainderMinor != null ? Math.abs(Math.min(0, supported.planningRemainderMinor)) : 0;
  const headline = !qualified || !supported ? "A daily amount cannot be confirmed." : supported.isNonPositive ? <>The current plan is short by <MoneyAmount value={shortage} currency={currency} hidden={hidden} /> through {endLabel}.</> : <>Available through {endLabel}: <MoneyAmount value={supported.dailyAllowanceMinor} currency={currency} hidden={hidden} /> per day.</>;
  const mixedCurrency = allowance ? allowance.status === "unsupported" && allowance.unsupportedReason === "mixed_currency" : multiCurrency;
  const reason = mixedCurrency ? "Your accounts use different currencies. A daily amount is available only when the plan uses one currency." : setup ? "Connect an account source to calculate a daily amount." : successfulEmptyAccountRead ? "No accounts are connected, so there is no balance to use for a daily amount." : source.state !== "ok" || !allowance ? "Account balances could not be refreshed. Your saved records remain available, but a current daily amount cannot be confirmed." : "A planning guide from confirmed cash, recorded obligations, protected money, and your buffer—not a live account balance.";
  const terms = supported ? [["cash", supported.availableBalanceMinor, ""], ["expected", supported.incomeExpectedMinor, "+"], ["obligations", supported.upcomingObligationsMinor, "−"], ["floor", supported.dailyFloorMinor, "−"], ["buffer", supported.bufferMinor, "−"]] as const : [];
  const sourceDetail = source.state === "ok" ? "Current connected balances and saved plan records" : source.state === "partial" ? `Not current; unavailable sources: ${source.unavailableSources.join(", ") || "unspecified"}` : source.state === "unavailable" ? `Unavailable${source.reason ? `: ${source.reason}` : ""}` : "Source read in progress";
  const termFreshness = supported ? `calculation generated ${compactDateTime(supported.generatedAt, supported.viewerTimeZone)}` : "no calculation timestamp available";
  const equation = terms.length ? qualified ? terms.map(([label, value, operator]) => <span key={label} className="money-position__term"><i aria-hidden="true">{operator}</i><strong><MoneyAmount value={value} currency={currency} hidden={hidden} /></strong><small>{label}</small></span>) : <div className="money-position__unqualified"><span>cash <i>+</i> expected <i>−</i> obligations <i>−</i> floor <i>−</i> buffer</span><strong>Inputs not confirmed</strong></div> : <div className="money-position__missing"><AlertCircle size={18} /><span>{successfulEmptyAccountRead ? "No planning inputs returned." : "Planning inputs are unavailable."}</span></div>;
  return <section className="money-position" aria-labelledby="money-position-title" data-qualified={qualified ? "true" : "false"}>
    <div className="money-position__lead"><span className="money-module-label">Through {endLabel ?? "the current horizon"}</span><h2 id="money-position-title">{headline}</h2><p>{reason}</p></div>
    <div className="money-position__flow" aria-label="Position calculation">{equation}</div>
    <details className="money-position__details"><summary>Inspect sources and qualification</summary><div className="money-position__source-note"><ShieldCheck size={15} /><span>{qualified && supported ? `Calculated ${compactDateTime(supported.generatedAt, supported.viewerTimeZone)} from connected balances and local planning records.` : mixedCurrency ? "Daily amount unavailable because your accounts use different currencies." : setup ? "Connect an account source to calculate a daily amount." : successfulEmptyAccountRead ? "No balance is available to inspect because no accounts are connected." : source.state !== "ok" || !allowance ? "Account balances could not be refreshed. Saved records remain available, but a current daily amount cannot be confirmed." : "Inputs remain unavailable until connected coverage can qualify them."}</span></div>{terms.length ? <ul>{terms.map(([label]) => <li key={label}><strong>{label}</strong><span>{sourceDetail} · {termFreshness}</span></li>)}</ul> : null}</details>
  </section>;
}

type HorizonItem = { id: string; title: string; date: string; amount?: number | null; currency?: string; state: "expected" | "uncertain"; qualification: "current" | "last_confirmed"; kind: "inflow" | "obligation" };
function MoneyHorizon({ items, hidden, viewerTimeZone }: { items: HorizonItem[]; hidden: boolean; viewerTimeZone?: string }) {
  return <PageSection className="money-horizon" title="The next 14 days" description="Expected money and recorded obligations, in time order.">{items.length ? <>
    <ol className="money-horizon__list">{items.map((item) => <li key={item.id}><Link to={recurringRecordHref(item.id)}><time dateTime={item.date}>{compactDay(item.date, viewerTimeZone)}<small>{compactDate(item.date, viewerTimeZone)}</small></time><span><strong>{item.title}</strong><small>{item.state === "uncertain" ? "Needs confirmation" : item.kind === "inflow" ? "Expected inflow" : "Recorded obligation"}{item.qualification === "last_confirmed" ? " · last confirmed" : ""}</small></span><MoneyAmount value={item.amount} currency={item.currency} hidden={hidden} unavailable="Amount uncertain" /></Link></li>)}</ol>
  </> : <StateNotice presentation="bounded" icon={<CalendarClock size={19} />} title="No recorded items in the next two weeks" body="This is based on successfully read local recurring and obligation records." />}</PageSection>;
}

function ActivityPulse({ snapshot, source, currency, hidden, multiCurrency }: { snapshot?: FinanceSnapshot; source: LifeSourceState | { state: "loading" }; currency?: string; hidden: boolean; multiCurrency: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (hidden) return <StateNotice presentation="bounded" icon={<EyeOff size={19} />} title="Activity visualization hidden" body="Show amounts to restore values and relative chart geometry." />;
  if (multiCurrency) return <StateNotice presentation="bounded" tone="warning" icon={<AlertCircle size={19} />} title="Activity currencies cannot be combined" body="No trusted currency conversion is available, so Kora has not produced an aggregate or numeric chart labels." />;
  if (source.state !== "ok" || !snapshot) return <StateNotice presentation="bounded" tone="warning" icon={<AlertCircle size={19} />} title="Current spending trend unavailable" body="Local plans and recurring records remain available above." />;
  if (!currency) return <StateNotice presentation="bounded" tone="warning" icon={<AlertCircle size={19} />} title="Activity currency unavailable" body="Posted activity is present, but its currency is unavailable, so Kora has not produced an aggregate." />;
  if (!snapshot.dailyPostedOutflows.length) return <StateNotice presentation="bounded" icon={<CircleDollarSign size={19} />} title="No posted outflow in this range" body="The connected source returned a successful empty 30-day result." />;
  const upperScaleMinor = Math.max(0, ...snapshot.dailyPostedOutflows.map((point) => point.amountMinor));
  const geometryScaleMinor = upperScaleMinor || 1;
  const total = snapshot.dailyPostedOutflows.reduce((sum, point) => sum + point.amountMinor, 0);
  const chartPoints = snapshot.dailyPostedOutflows.map((point, index) => ({ ...point, x: snapshot.dailyPostedOutflows.length === 1 ? 150 : index / (snapshot.dailyPostedOutflows.length - 1) * 300, y: 42 - point.amountMinor / geometryScaleMinor * 36 }));
  const activeIndex = Math.min(selectedIndex, chartPoints.length - 1);
  const activePoint = chartPoints[activeIndex]!;
  const line = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M ${chartPoints[0]!.x} 44 L ${chartPoints.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${chartPoints.at(-1)!.x} 44 Z`;
  return <div className="money-pulse"><div className="money-pulse__summary"><strong>{money(total, currency)}</strong><span>posted outflow across {snapshot.dailyPostedOutflows.length} recorded days</span></div><div className="money-pulse__plot-row"><div className="money-pulse__scale" aria-hidden="true"><span data-scale-bound="upper">{money(upperScaleMinor, currency)}</span><span data-scale-bound="zero">{money(0, currency)}</span></div><div className="money-pulse__plot" role="group" aria-label="Thirty-day posted outflow chart"><svg viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true"><path d={area} /><polyline points={line} /><line className="money-pulse__selection-line" x1={activePoint.x} y1="4" x2={activePoint.x} y2="44" /><circle className="money-pulse__selection-marker" data-date={activePoint.date} cx={activePoint.x} cy={activePoint.y} r="4" /></svg><Input className="money-pulse__scrubber" type="range" min={0} max={chartPoints.length - 1} step={1} value={activeIndex} aria-label="Explore posted outflow" aria-valuetext={`${fullDate(activePoint.date)}: ${money(activePoint.amountMinor, currency)}`} onChange={(event) => setSelectedIndex(Number(event.currentTarget.value))} onKeyDown={(event) => { let next: number | undefined; if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(chartPoints.length - 1, activeIndex + 1); else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, activeIndex - 1); else if (event.key === "Home") next = 0; else if (event.key === "End") next = chartPoints.length - 1; if (next != null) { event.preventDefault(); setSelectedIndex(next); } }} /></div></div><div className="money-pulse__axis-row"><span aria-hidden="true" /><div className="money-pulse__axis" aria-hidden="true"><span>{compactCalendarDate(snapshot.dailyPostedOutflows[0]!.date)}</span><span>{fullDate(activePoint.date)} · {money(activePoint.amountMinor, currency)}</span><span>{compactCalendarDate(snapshot.dailyPostedOutflows.at(-1)!.date)}</span></div></div><details><summary>View activity data</summary><table><caption className="sr-only">Posted outflow by day</caption><thead><tr><th scope="col">Date</th><th scope="col">Posted outflow</th></tr></thead><tbody>{snapshot.dailyPostedOutflows.map((point) => <tr key={point.date}><td>{fullDate(point.date)}</td><td>{money(point.amountMinor, currency)}</td></tr>)}</tbody></table></details></div>;
}

type AttentionItem = { id: string; title: string; detail: string; tone: "warning" | "danger" | "quiet"; href: string; action: string };
function AttentionList({ items }: { items: AttentionItem[] }) { return <PageSection className="money-attention" title="Needs attention" description={`${items.length} ${items.length === 1 ? "item" : "items"}`}>{items.length ? <ol>{items.slice(0, 3).map((item) => <li key={item.id} data-tone={item.tone}><Link to={item.href}><span /><div><strong>{item.title}</strong><small>{item.detail}</small><em>{item.action}<ArrowRight size={12} /></em></div></Link></li>)}</ol> : <ListEmpty icon={<ShieldCheck size={17} />} text="No confirmed Money review item needs attention." />}</PageSection>; }
function RecentActivity({ snapshot, hidden, setup }: { snapshot: FinanceSnapshot; hidden: boolean; setup: boolean }) { const activityAvailable = snapshot.sources.plaid?.state === "ok"; const total = activityAvailable ? snapshot.window.totalTransactions : undefined; const visible = snapshot.transactions.slice(0, 5).length; const description = setup ? "No account source is configured" : !activityAvailable ? "Connected activity unavailable" : total == null ? "Connected activity unavailable" : total === 0 ? "No transactions in this range" : `Latest ${visible} of ${total} last-confirmed entries`; const emptyText = setup ? "Connect an account source to make recent activity available." : activityAvailable ? "No transactions were found in this range." : "Unable to read connected activity. Local Money records are still available."; return <div className="money-recent"><div className="money-recent__header"><div><h2>Recent activity</h2><p>{description}</p></div><Link to="/life/finances/activity">Open Activity<ArrowRight size={14} /></Link></div>{snapshot.transactions.length ? <ol>{snapshot.transactions.slice(0, 5).map((item, index) => <li key={`${item.connectionId}:${item.occurredAt}:${index}`}><span className="money-row-icon" data-direction={item.amountMinor < 0 ? "in" : "out"}><ArrowRight size={13} /></span><span><strong>{item.merchant?.trim() || item.description?.trim() || "Untitled transaction"}</strong><small>{item.accountName} · {compactDate(item.occurredAt, snapshot.viewerTimeZone)}{item.pending ? " · Pending" : " · Posted"}</small></span><MoneyAmount value={Math.abs(item.amountMinor)} currency={item.currency} hidden={hidden} prefix={item.amountMinor < 0 ? "+" : "−"} /></li>)}</ol> : <ListEmpty icon={<ReceiptText size={17} />} text={emptyText} />}</div>; }
function MoneyGoalsPreview({ goals, hidden, viewerTimeZone }: { goals: FinanceGoal[]; hidden: boolean; viewerTimeZone?: string }) { return <PageSection className="money-goals-preview" title="Goals in progress" description="Saved targets remain separate by currency." actions={<Link to="/life/finances/plan">Open Plan<ArrowRight size={14} /></Link>}>{goals.length ? <ol>{goals.slice(0, 3).map((goal) => { const hasProgress = goal.currentAmountMinor != null && goal.targetAmountMinor != null && goal.targetAmountMinor > 0; const progress = hasProgress ? Math.max(0, Math.min(100, goal.currentAmountMinor! / goal.targetAmountMinor! * 100)) : 0; return <li key={goal.id}><Link to={`/life/finances/plan/targets/${encodeURIComponent(goal.id)}`}><span className="money-goal-preview__copy"><strong>{goal.displayName}</strong><small>{humanize(goal.goalKind)} · {goal.currency} · Updated {compactDate(goal.updatedAt, viewerTimeZone)}</small></span><span className="money-goal-preview__progress" aria-hidden="true"><span style={{ width: hidden ? "0%" : `${progress}%` }} /></span><span className="money-goal-preview__value">{hasProgress ? <span className="money-goal-preview__amounts"><MoneyAmount value={goal.currentAmountMinor} currency={goal.currency} hidden={hidden} /><span aria-hidden="true">of</span><MoneyAmount value={goal.targetAmountMinor} currency={goal.currency} hidden={hidden} /></span> : <MoneyAmount value={goal.currentAmountMinor} currency={goal.currency} hidden={hidden} unavailable="Progress unavailable" />}<small>{hasProgress ? "current of target" : "Progress unavailable"}</small></span></Link></li>; })}</ol> : <div className="money-goals-preview__empty"><span>No active goals yet.</span><Link to="/life/finances/plan">Open Plan<ArrowRight size={14} /></Link></div>}</PageSection>; }
function ListEmpty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="money-list-empty">{icon}<span>{text}</span></div>; }
function MoneyAmount({ value, currency, hidden, prefix = "", unavailable = "Unavailable" }: { value?: number | null; currency?: string; hidden: boolean; prefix?: string; unavailable?: string }) { if (value == null) return <span className="money-amount" data-unavailable>{unavailable}</span>; if (hidden) return <span className="money-amount" aria-label="Amount hidden">••••••</span>; if (!currency) return <span className="money-amount" data-unavailable>{unavailable === "Amount uncertain" ? "Amount currency unavailable" : "Currency unavailable"}</span>; return <span className="money-amount">{prefix}{money(value, currency)}</span>; }
function MoneyLoading() { return <PageFrame width="wide" className="money-workspace money-workspace--loading" aria-label="Opening Money"><PageHeader title="Money" /><MoneyNavigation variant="bar" /><div className="k-coverage-strip money-skeleton" aria-hidden="true" /><div className="money-work-grid money-overview-columns" data-loading-module="collections"><div className="money-overview-columns__primary"><div className="money-horizon money-skeleton" aria-hidden="true" /><div className="money-skeleton money-overview-loading-panel" aria-hidden="true" /></div><div className="money-overview-columns__companion"><div className="money-position money-skeleton" aria-hidden="true" /><div className="money-skeleton money-overview-loading-panel" aria-hidden="true" /></div></div><div className="money-activity-section money-skeleton" data-loading-module="activity" aria-hidden="true" /></PageFrame>; }
function MoneyUnavailable({ onRetry }: { onRetry: () => void }) { return <PageFrame width="wide" className="money-workspace"><MoneyNavigation variant="bar" /><section className="money-unavailable" role="alert"><AlertCircle size={24} /><div><h1>Money could not be opened.</h1><p>Kora could not read saved Money data. No unavailable value has been converted to zero.</p></div><Button tone="primary" onClick={onRetry}><RefreshCw size={15} />Try again</Button><Link to="/settings/integrations">Review connections</Link></section></PageFrame>; }

function deriveCoverage(read: FinanceAccountsRead | undefined, source: LifeSourceState | { state: "loading" }, fallbackCount: number, syncTime?: string, viewerTimeZone?: string): CoveragePresentation {
  if (!read) {
    if (source.state === "loading") return { short: "Reading sources", title: "Reading connected accounts", detail: "Local Money records remain available.", state: "loading", setup: false };
    if (source.state === "partial") return { short: "Partial account coverage", title: `${fallbackCount} last-confirmed ${fallbackCount === 1 ? "account" : "accounts"}`, detail: syncTime ? `Values marked ${compactDate(syncTime, viewerTimeZone)} may be stale` : "Some connected account reads failed", state: "partial", setup: false };
    return { short: "Connected accounts unavailable", title: "Connected accounts unavailable", detail: "Local plans and recurring records still work when they are available.", state: "unavailable", setup: false };
  }
  if (!read.accounts.length && !read.connections.length && read.sources.plaid?.state === "unavailable") return { short: "Accounts not configured", title: "No account source is configured", detail: "Set up a supported source in Settings. Money never collects provider credentials here.", state: "not_configured", setup: true };
  const states = new Map(read.connections.map((connection) => [connection.connectionId, connection.state]));
  const manual = read.accounts.filter((account) => account.connectionState === "manual" || states.get(account.connectionId) === "manual").length;
  const connectedAccounts = read.accounts.filter((account) => account.connectionState !== "manual" && states.get(account.connectionId) !== "manual");
  const current = connectedAccounts.filter((account) => (account.connectionState ?? states.get(account.connectionId)) === "current").length;
  const total = connectedAccounts.length;
  const connectionStates = read.connections.map((connection) => connection.state);
  const allNotConfigured = connectionStates.length > 0 && connectionStates.every((state) => state === "not_configured");
  if (allNotConfigured) return { short: "Accounts not configured", title: "No connected accounts configured", detail: manual ? `${manual} local ${manual === 1 ? "account remains" : "accounts remain"} available.` : "Local plans and recurring records can still be used.", state: "not_configured", setup: true };
  const reauth = connectionStates.includes("reauthorization_required");
  const degradedConnections = read.connections.filter((connection) => connection.state === "stale" || connection.state === "partial" || connection.state === "unavailable" || connection.state === "reauthorization_required");
  const degradedAccounts = connectedAccounts.filter((account) => (account.connectionState ?? states.get(account.connectionId)) !== "current");
  const degradedConfirmation = latestConfirmation([...degradedConnections, ...degradedAccounts]);
  const degraded = reauth || degradedConnections.length > 0 || degradedAccounts.length > 0 || source.state !== "ok";
  if (degraded) return { short: "Partial account coverage", title: current ? `${current} of ${total} accounts current` : total ? `${total} last-confirmed ${total === 1 ? "account" : "accounts"}` : "Connected account coverage unavailable", detail: reauth ? "Account access needs to be restored before balances are current." : degradedConfirmation ? `Some values were last confirmed ${compactDate(degradedConfirmation, viewerTimeZone)}.` : "Some connected account reads failed.", state: reauth ? "reauthorization_required" : "partial", setup: false };
  if (!total && manual) return { short: `${manual} local ${manual === 1 ? "account" : "accounts"}`, title: `${manual} local ${manual === 1 ? "account" : "accounts"}`, detail: "No provider-synced account is included.", state: "manual", setup: false };
  if (!total) return { short: "No accounts returned", title: "No accounts returned", detail: "The account read completed successfully and returned no accounts.", state: "empty", setup: false };
  return { short: `${total} ${total === 1 ? "account" : "accounts"} current`, title: `${total} ${total === 1 ? "account" : "accounts"} current`, detail: syncTime ? `Updated ${compactDateTime(syncTime, viewerTimeZone)}` : "Current read; timestamp unavailable", state: "current", setup: false };
}
function buildAttention(snapshot: FinanceSnapshot | undefined, allowance: FinanceAllowance | undefined, receipts: FinanceReceipt[], bills: FinanceBill[], subscriptions: FinanceSubscription[], qualified: boolean): AttentionItem[] { const items: AttentionItem[] = []; const review = receipts.filter((item) => !item.reviewedByUser && (item.matchState === "ambiguous" || item.matchState === "unmatched")); if (review.length) items.push({ id: "receipts", title: `${review.length} receipt ${review.length === 1 ? "match needs" : "matches need"} review`, detail: "Candidate evidence has not been settled by you.", tone: "warning", href: "/life/finances/activity", action: "Review receipts in Activity" }); const undated = [...bills, ...subscriptions].filter((item) => !item.nextExpectedAt); if (undated.length) items.push({ id: "undated", title: `${undated.length} recurring ${undated.length === 1 ? "record needs" : "records need"} a confirmed next date`, detail: "Add a next date to include these records in your upcoming schedule.", tone: "warning", href: "/life/finances/recurring", action: "Open Recurring" }); if (snapshot?.window.pendingTransactions) items.push({ id: "pending", title: `${snapshot.window.pendingTransactions} pending ${snapshot.window.pendingTransactions === 1 ? "transaction" : "transactions"}`, detail: "Pending activity is excluded from posted totals.", tone: "quiet", href: "/life/finances/activity?posting=only", action: "Review pending activity" }); if (qualified && allowance?.isNonPositive) items.push({ id: "short", title: "The current plan is below its protected position", detail: "Review recorded obligations, floor, and buffer before changing the plan.", tone: "danger", href: "/life/finances/plan", action: "Review plan" }); return items; }
function buildHorizon(bills: FinanceBill[], billSource: LifeSourceState | undefined, subscriptions: FinanceSubscription[], subscriptionSource: LifeSourceState | undefined, generatedAt: string, viewerTimeZone?: string): HorizonItem[] { const startDay = calendarDayNumber(generatedAt, viewerTimeZone), endDay = startDay + 13, rows: HorizonItem[] = []; for (const bill of bills) { const dueDay = bill.nextExpectedAt ? calendarDayNumber(bill.nextExpectedAt, viewerTimeZone) : undefined; if (dueDay == null || !Number.isFinite(dueDay) || dueDay < startDay || dueDay > endDay) continue; const inflow = (bill.expectedAmountMinor ?? 0) < 0; rows.push({ id: `bill:${bill.id}`, title: bill.billerName, date: bill.nextExpectedAt!, amount: bill.expectedAmountMinor == null ? null : Math.abs(bill.expectedAmountMinor), currency: bill.currency ?? undefined, state: bill.expectedAmountMinor == null ? "uncertain" : "expected", qualification: billSource?.state === "ok" ? "current" : "last_confirmed", kind: inflow ? "inflow" : "obligation" }); } for (const sub of subscriptions) { const dueDay = sub.nextExpectedAt ? calendarDayNumber(sub.nextExpectedAt, viewerTimeZone) : undefined; if (dueDay == null || !Number.isFinite(dueDay) || dueDay < startDay || dueDay > endDay) continue; rows.push({ id: `subscription:${sub.id}`, title: sub.merchantName, date: sub.nextExpectedAt!, amount: sub.expectedAmountMinor, currency: sub.currency ?? undefined, state: sub.expectedAmountMinor == null ? "uncertain" : "expected", qualification: subscriptionSource?.state === "ok" ? "current" : "last_confirmed", kind: "obligation" }); } return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)); }

function recurringRecordHref(recordKey: string): string {
  const separator = recordKey.indexOf(":");
  const kind = recordKey.slice(0, separator);
  const recordId = recordKey.slice(separator + 1);
  if (separator <= 0 || !recordId || (kind !== "bill" && kind !== "subscription")) return "/life/finances/recurring";
  return `/life/finances/recurring/${kind}/${encodeURIComponent(recordId)}`;
}
function latestSync(rows: Array<{ lastSyncedAt?: string | null }>) { return rows.map((row) => row.lastSyncedAt).filter((value): value is string => Boolean(value)).sort().at(-1); }
function latestConfirmation(rows: Array<{ lastSuccessfulAt?: string | null; lastSyncedAt?: string | null }>) { return rows.map((row) => row.lastSuccessfulAt ?? row.lastSyncedAt).filter((value): value is string => Boolean(value)).sort().at(-1); }
function compactDay(value: string, viewerTimeZone?: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", ...(viewerTimeZone ? { timeZone: viewerTimeZone } : {}) }).format(new Date(value)); }
function compactDate(value: string, viewerTimeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(viewerTimeZone ? { timeZone: viewerTimeZone } : {}) }).format(new Date(value)); }
function compactCalendarDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function compactCalendarDay(dayNumber: number) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(dayNumber * 86_400_000)); }
function compactDateTime(value: string, viewerTimeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(viewerTimeZone ? { timeZone: viewerTimeZone } : {}) }).format(new Date(value)); }
function fullDate(value: string) { const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value); return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date); }
function calendarDayNumber(value: string, timeZone?: string) { const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(value)); const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value); return Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000); }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100); }
