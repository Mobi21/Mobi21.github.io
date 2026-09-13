import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Database,
  Eye,
  EyeOff,
  HeartPulse,
  History,
  MessageCircleMore,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type ReactNode, type SetStateAction } from "react";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import { Button } from "../../components/primitives";
import { PageFrame, PageHeader, SourceInspector, StateNotice } from "../../components/workspace";
import {
  runtime,
  type ConversationContextReference,
  type LifeOverview,
  type LifeOverviewDomain,
  type LifeOverviewMoment,
  type LifeOverviewSignal,
  type LifeOverviewSource,
  type LifeOverviewThreadEvent,
} from "../../lib/runtime";
import { LifeAreaRow, LifeAttentionRow, LifeSourceStatus, type LifeSourceStatusState } from "./LifeOverviewPrimitives";
import { LifeQuickCapture } from "./LifeQuickCapture";
import "./life-overview.css";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
type LifeOptionalModule = {
  id: string;
  label: string;
  summary: string;
  destination: `/life/${string}`;
  populated: boolean;
  source: {
    state: Exclude<LifeSourceStatusState, "loading">;
    authority: string;
    freshness?: string;
    limitation?: string;
    privacyEffect: string;
  };
};
type LifeOverviewProjection = LifeOverview & { optionalModules?: LifeOptionalModule[] };
export type LifeOverviewPageLoader = (cursor?: string, pageSize?: number) => Promise<LifeOverviewProjection>;

const loadLiveOverview: LifeOverviewPageLoader = async (cursor, pageSize) =>
  runtime.lifeOverview(cursor, pageSize) as Promise<LifeOverviewProjection>;

const DOMAIN_META: Record<LifeOverviewDomain, { icon: typeof CircleDollarSign; label: string }> = {
  money: { icon: CircleDollarSign, label: "Money" },
  wellbeing: { icon: HeartPulse, label: "Wellbeing" },
  about_you: { icon: UserRound, label: "About You" },
};

const LIFE_RETURN_STATE = "lifeOverviewReturn";
type LifeReturnContext = {
  version: 1;
  route: "/life";
  targetId: string;
  scrollTop: number;
  expandedClusterIds?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLifeReturnContext(state: unknown): LifeReturnContext | undefined {
  if (!isRecord(state)) return undefined;
  const value = state[LIFE_RETURN_STATE];
  if (!isRecord(value) || value.version !== 1 || value.route !== "/life") return undefined;
  if (typeof value.targetId !== "string" || value.targetId.length < 1 || value.targetId.length > 240) return undefined;
  if (typeof value.scrollTop !== "number" || !Number.isFinite(value.scrollTop) || value.scrollTop < 0 || value.scrollTop > 10_000_000) return undefined;
  const expandedClusterIds = value.expandedClusterIds;
  if (expandedClusterIds !== undefined && (!Array.isArray(expandedClusterIds) || expandedClusterIds.length > 100 || expandedClusterIds.some((id) => typeof id !== "string" || id.length < 1 || id.length > 1000))) return undefined;
  return { version: 1, route: "/life", targetId: value.targetId, scrollTop: value.scrollTop, ...(expandedClusterIds ? { expandedClusterIds: [...expandedClusterIds] as string[] } : {}) };
}

function lifeOverviewFrame() {
  return document.querySelector<HTMLElement>(".life-overview");
}

function lifeScrollOwner(frame = lifeOverviewFrame()) {
  const pageFrame = frame?.matches(".k-page-frame")
    ? frame
    : frame?.querySelector<HTMLElement>(".k-page-frame");
  return pageFrame?.querySelector<HTMLElement>(":scope > .k-page-frame__viewport")
    ?? frame?.closest<HTMLElement>(".life-stage")
    ?? document.scrollingElement as HTMLElement | null;
}

function LifeReturnLink({ to, returnId, expandedClusterIds, className, children }: { to: string; returnId: string; expandedClusterIds?: readonly string[]; className?: string; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const rememberReturn = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    const currentState = isRecord(location.state) ? location.state : {};
    const context: LifeReturnContext = { version: 1, route: "/life", targetId: returnId, scrollTop: lifeScrollOwner()?.scrollTop ?? 0, ...(expandedClusterIds?.length ? { expandedClusterIds: [...new Set(expandedClusterIds)].slice(0, 100) } : {}) };
    event.preventDefault();
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: { ...currentState, [LIFE_RETURN_STATE]: context } });
    navigate(to);
  };
  return <Link to={to} className={className} data-life-return-id={returnId} onClick={rememberReturn}>{children}</Link>;
}

export function LifeOverviewWorkspace({ onAskKora, loadPage = loadLiveOverview, requestKey = "live" }: { onAskKora: Ask; loadPage?: LifeOverviewPageLoader; requestKey?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const [inspectedSource, setInspectedSource] = useState<LifeOverviewSource | null>(null);
  const [requestedEarlier, setRequestedEarlier] = useState(false);
  const returnContext = navigationType === "POP" ? readLifeReturnContext(location.state) : undefined;
  const [expandedClusterIds, setExpandedClusterIds] = useState<Set<string>>(() => new Set(returnContext?.expandedClusterIds ?? []));
  const sourceTriggerRef = useRef<HTMLElement | null>(null);
  const compactOverview = useMediaMatch("(max-width: 759px)");
  const result = useInfiniteQuery({
    queryKey: ["life", "overview", requestKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => loadPage(pageParam, 12),
    getNextPageParam: (page) => page.thread.complete ? undefined : page.thread.cursor,
  });
  const overview = result.data?.pages[0];
  const retainedOverviewError = Boolean(overview && result.isError && !result.isFetchNextPageError);
  const thread = useMemo(() => {
    const byId = new Map<string, LifeOverviewThreadEvent>();
    for (const page of result.data?.pages ?? []) for (const event of page.thread.items) byId.set(event.id, event);
    return [...byId.values()].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
  }, [result.data]);
  useEffect(() => {
    const context = navigationType === "POP" ? readLifeReturnContext(location.state) : undefined;
    if (!context || location.pathname !== context.route || !overview) return;
    const frame = lifeOverviewFrame();
    const target = [...(frame?.querySelectorAll<HTMLElement>("[data-life-return-id]") ?? [])]
      .find((candidate) => candidate.dataset.lifeReturnId === context.targetId);
    const fallback = !target && context.expandedClusterIds?.length
      ? [...(frame?.querySelectorAll<HTMLElement>("[data-life-cluster-key]") ?? [])]
        .find((candidate) => context.expandedClusterIds?.includes(candidate.dataset.lifeClusterKey ?? ""))
      : undefined;
    if (!target && !fallback) return;
    const frameOwner = lifeScrollOwner(frame);
    const nextState = isRecord(location.state) ? { ...location.state } : {};
    delete nextState[LIFE_RETURN_STATE];
    const animationFrame = requestAnimationFrame(() => {
      if (frameOwner) frameOwner.scrollTop = context.scrollTop;
      (target ?? fallback)?.focus({ preventScroll: true });
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: Object.keys(nextState).length ? nextState : null });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [expandedClusterIds, location.hash, location.pathname, location.search, location.state, navigate, navigationType, overview, thread.length]);
  const meta = retainedOverviewError ? "Refresh needed" : overview ? overview.status === "current" ? "Current" : overview.status === "review" ? "1 to review" : overview.status === "partial" ? "Partial coverage" : overview.status === "setup" ? "Ready to set up" : "Unavailable" : result.isError ? "Unavailable" : "Opening";

  const inspect = (source: LifeOverviewSource, trigger: HTMLElement) => {
    sourceTriggerRef.current = trigger;
    setInspectedSource(source);
  };

  useEffect(() => {
    if (!inspectedSource) return;
    const nextTrigger = lifeOverviewFrame()?.querySelector<HTMLElement>(`[data-life-source-id="${inspectedSource.id}"]`);
    if (nextTrigger) sourceTriggerRef.current = nextTrigger;
  }, [compactOverview, inspectedSource]);

  if (result.isLoading) return <LifeLoading />;
  if (!overview) return <LifeUnavailable onRetry={() => result.refetch()} />;

  return <PageFrame width="standard" className="life-overview">
    <PageHeader
      title="Life"
      description="The parts of your day and personal context that deserve attention now."
      status={meta}
      actions={<Button className="life-amount-toggle" tone="secondary" onClick={toggleAmounts}>{amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}{amountsHidden ? "Show amounts" : "Hide amounts"}</Button>}
    />
    <p className="life-overview__orientation">
      <time dateTime={overview.generatedAt}>{formatOrientationDate(overview.generatedAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{retainedOverviewError ? "Last successful overview shown" : orientationPriority(overview.status, overview.orientation.needsReview)}</span>
    </p>

    {retainedOverviewError ? <div className="life-overview__refresh-warning" role="alert"><AlertCircle size={16} /><span>Life could not refresh. This page shows the last successful overview.</span><Button tone="ghost" onClick={() => void result.refetch()}><RefreshCw size={15} />Retry Life refresh</Button></div> : null}

    <Coverage overview={overview} />

    {compactOverview ? <>
      <RightNow
        item={overview.rightNow}
        source={overview.rightNow ? overview.sources.find((source) => source.id === overview.rightNow!.sourceId) : undefined}
        recoverySource={overview.status === "partial" ? overview.sources.find((source) => source.state === "partial" || source.state === "unavailable") : undefined}
        status={overview.status}
        onAskKora={onAskKora}
      />
      <LifeSignals overview={overview} amountsHidden={amountsHidden} onInspect={inspect} />
      <OptionalLifeModules modules={overview.optionalModules ?? []} />
      <NextInLife items={overview.next} sources={overview.sources} />
    </> : <>
      <div className="life-overview__lead-grid" data-empty-next={!overview.next.length || undefined}>
        <RightNow
          item={overview.rightNow}
          source={overview.rightNow ? overview.sources.find((source) => source.id === overview.rightNow!.sourceId) : undefined}
          recoverySource={overview.status === "partial" ? overview.sources.find((source) => source.state === "partial" || source.state === "unavailable") : undefined}
          status={overview.status}
          onAskKora={onAskKora}
        />
        <NextInLife items={overview.next} sources={overview.sources} />
      </div>
      <LifeSignals overview={overview} amountsHidden={amountsHidden} onInspect={inspect} />
      <OptionalLifeModules modules={overview.optionalModules ?? []} />
    </>}

    <LifeQuickCapture onPrepare={(draft) => onAskKora(undefined, draft)} />

    <LifeThread
      events={thread}
      viewerTimeZone={overview.day?.viewerTimeZone}
      hasNextPage={Boolean(result.hasNextPage)}
      requestedEarlier={requestedEarlier}
      expandedClusterIds={expandedClusterIds}
      onExpandedClusterIdsChange={setExpandedClusterIds}
      loading={result.isFetchingNextPage}
      failed={result.isFetchNextPageError}
      onEarlier={() => { setRequestedEarlier(true); void result.fetchNextPage(); }}
      onRetry={() => { void result.fetchNextPage(); }}
    />

    <footer className="life-overview__privacy"><ShieldCheck size={15} /><span>Life summarizes saved information you have permitted. Restricted records stay omitted unless you open the relevant area and authorize access.</span></footer>

    <SourceInspector
      open={Boolean(inspectedSource)}
      onOpenChange={(open) => { if (!open) setInspectedSource(null); }}
      title={inspectedSource ? `${inspectedSource.label} source` : "Life source"}
      description="Freshness, coverage, source, and privacy effect."
      finalFocus={sourceTriggerRef}
      status={inspectedSource ? <LifeSourceStatus state={inspectedSource.state} /> : undefined}
      facts={inspectedSource ? [
        { label: "Source", value: inspectedSource.authority },
        { label: "Last successful read", value: inspectedSource.lastSuccessfulRead ? fullDate(inspectedSource.lastSuccessfulRead) : "No successful update yet" },
        { label: "Known limitation", value: inspectedSource.limitation ?? "No known limitation in the latest summary." },
        { label: "Privacy effect", value: inspectedSource.privacyEffect },
        ...(inspectedSource.state === "current" ? [] : [{ label: "Recovery", value: sourceRecoveryLabel(inspectedSource) }]),
      ] : []}
    >
      {inspectedSource && sourceRecoveryAction(inspectedSource, () => void result.refetch())}
    </SourceInspector>
  </PageFrame>;
}

function Coverage({ overview }: { overview: LifeOverview }) {
  const coverage = overview.status === "current" || overview.status === "review" || overview.status === "partial" ? null : overview.status === "setup"
      ? ["Life is ready to become useful", "Set up only the areas you want Kora to help you understand."]
      : ["Life coverage is unavailable", "Open the relevant area below to inspect its saved state or recovery path."];
  if (!coverage && !overview.restrictedOmitted) return null;
  return <div className="life-coverage-stack">
    {coverage ? <StateNotice presentation="inline" tone={overview.status === "unavailable" ? "danger" : "warning"} icon={<AlertCircle size={16} />} title={coverage[0]} body={coverage[1]} /> : null}
    {overview.restrictedOmitted ? <p className="life-overview__restriction"><ShieldCheck size={15} /><span>Restricted records are omitted from this summary; their titles, values, categories, and counts are not shown here.</span></p> : null}
  </div>;
}

function LifeSignals({ overview, amountsHidden, onInspect }: { overview: LifeOverview; amountsHidden: boolean; onInspect: (source: LifeOverviewSource, trigger: HTMLElement) => void }) {
  return <section className="life-overview__signals" aria-labelledby="life-signals-title">
    <div className="life-section-heading"><h2 id="life-signals-title">Life signals</h2></div>
    <div className="life-signal-grid">
      {overview.signals.map((signal) => <LifeSignal key={signal.domain} signal={signal} source={overview.sources.find((source) => source.id === signal.sourceId)!} amountsHidden={amountsHidden} onInspect={onInspect} />)}
    </div>
  </section>;
}

function OptionalLifeModules({ modules }: { modules: LifeOptionalModule[] }) {
  if (!modules.length) return null;
  return <section className="life-overview__optional" aria-labelledby="life-optional-title">
    <div className="life-section-heading">
      <div><h2 id="life-optional-title">Your other Life areas</h2><p>Only enabled areas with their own Life state appear here.</p></div>
    </div>
    <div className="life-optional-list">
      {modules.map((module) => <LifeAreaRow
        key={module.id}
        areaId={module.id}
        className="life-optional-area"
        icon={<Sparkles size={16} aria-hidden="true" />}
        label={module.label}
        sourceAction={<LifeSourceStatus state={module.source.state} />}
      >
        <Link className="life-optional-area__body" to={module.destination}>
          <span><strong>{module.summary}</strong><small>{module.source.authority}{module.source.freshness ? ` · ${module.source.freshness}` : ""}</small></span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </LifeAreaRow>)}
    </div>
  </section>;
}

function RightNow({ item, source, recoverySource, status, onAskKora }: { item: LifeOverviewMoment | null; source?: LifeOverviewSource; recoverySource?: LifeOverviewSource; status: LifeOverview["status"]; onAskKora: Ask }) {
  const fallback = fallbackFor(status, recoverySource);
  const FallbackIcon = status === "partial" || status === "unavailable" ? AlertCircle : ShieldCheck;
  const discussionReference = item ? focalDiscussionReference(item) : undefined;
  const sourceRead = item ? freshness(item.sourceFreshness) : undefined;
  return <section className="life-right-now" aria-labelledby="life-right-now-title" data-steady={!item || undefined} data-status={!item ? status : undefined}>
    <div className="life-module-label"><span>Right now</span>{source ? <LifeSourceStatus state={source.state} /> : <LifeSourceStatus state={fallback.state} label={fallback.label} />}</div>
    {item ? <>
      <h2 id="life-right-now-title">{item.title}</h2>
      <p>{item.explanation}</p>
      <div className="life-right-now__actions"><div className="life-right-now__context"><span><Clock3 size={14} />{formatHorizon(item.horizon, item.horizonTimeZone)}</span>{sourceRead ? <span><Database size={14} />{sourceRead}</span> : null}</div><div className="life-right-now__decision-actions">{discussionReference ? <Button className="life-focal-discuss" tone="secondary" aria-label={`Discuss ${item.title} with Kora`} onClick={() => onAskKora(discussionReference, "Help me review this exact Life item. Explain what matters now, the limits of the attached evidence, and the safest next step.")}><MessageCircleMore size={15} />Discuss with Kora</Button> : null}<LifeReturnLink className="life-primary-link" to={item.destination} returnId={`focal:${item.id}`}>Review in {DOMAIN_META[item.domain].label}<ArrowRight size={16} /></LifeReturnLink></div></div>
    </> : <>
      <h2 id="life-right-now-title">{fallback.title}</h2>
      <p>{fallback.body}</p>
      <div className="life-right-now__fallback-actions"><span className="life-right-now__quiet"><FallbackIcon size={15} />{fallback.note}</span>{fallback.destination ? <Link className="life-primary-link" to={fallback.destination}>Review {fallback.destinationLabel}<ArrowRight size={16} /></Link> : null}</div>
    </>}
  </section>;
}

function NextInLife({ items, sources }: { items: LifeOverviewMoment[]; sources: LifeOverviewSource[] }) {
  return <section className="life-next" aria-labelledby="life-next-title" data-empty={!items.length || undefined}>
    <div className="life-section-heading"><h2 id="life-next-title">Next in Life</h2></div>
    {items.length ? <ol>{items.slice(0, 3).map((item) => {
      const source = sources.find((candidate) => candidate.id === item.sourceId);
      return <li key={item.id}><LifeReturnLink to={item.destination} returnId={`next:${item.id}`}><LifeAttentionRow
        leading={<time dateTime={item.horizon}>{compactDate(item.horizon, item.horizonTimeZone)}</time>}
        title={item.title}
        description={<>{DOMAIN_META[item.domain].label}{source && source.state !== "current" ? <> · {source.state === "not_configured" ? "Not set up" : source.state[0].toUpperCase() + source.state.slice(1)}{source.lastSuccessfulRead ? ` · last confirmed ${compactDate(source.lastSuccessfulRead)}` : ""}</> : null}</>}
        trailing={<ArrowRight size={14} aria-hidden="true" />}
      /></LifeReturnLink></li>;
    })}</ol> : <div className="life-next__empty"><CalendarClock size={18} /><p>No upcoming personal moments are available from the current Life sources.</p></div>}
  </section>;
}

function LifeSignal({ signal, source, amountsHidden, onInspect }: { signal: LifeOverviewSignal; source: LifeOverviewSource; amountsHidden: boolean; onInspect: (source: LifeOverviewSource, trigger: HTMLElement) => void }) {
  const Icon = DOMAIN_META[signal.domain].icon;
  return <LifeAreaRow className="life-signal" areaId={signal.domain} icon={<Icon size={17} />} label={signal.label} sourceAction={<Button className="life-source-button" data-life-source-id={source.id} aria-label={`Inspect ${source.label} source`} onClick={(event) => onInspect(source, event.currentTarget)}><LifeSourceStatus state={source.state} /></Button>}>
    <LifeReturnLink to={signal.destination} returnId={`signal:${signal.domain}`} className="life-signal__body">
      <LifeSignalContent signal={signal} source={source} amountsHidden={amountsHidden} />
      <span className="life-signal__open"><span className="sr-only">Open {signal.label}</span><ArrowRight size={15} /></span>
    </LifeReturnLink>
  </LifeAreaRow>;
}

function LifeSignalContent({ signal, source, amountsHidden }: { signal: LifeOverviewSignal; source: LifeOverviewSource; amountsHidden: boolean }) {
  const freshness = signal.updatedAt ? `${source.state === "current" ? "Updated" : "Last confirmed"} ${compactDate(signal.updatedAt)}` : null;
  return <div className="life-signal__summary">
    <div className="life-signal__state">
      <strong>{signal.state}</strong>
      {signal.domain === "money" && signal.amountMinor != null ? <b>{amountsHidden ? <><span aria-hidden="true">••••••</span><span className="sr-only">Amount hidden</span></> : money(signal.amountMinor, signal.currency ?? "USD")}</b> : null}
    </div>
    <p>{signal.support}</p>
    {freshness ? <small className="life-signal__freshness">{freshness}</small> : null}
  </div>;
}

function LifeThread({ events, viewerTimeZone, hasNextPage, requestedEarlier, expandedClusterIds, onExpandedClusterIdsChange, loading, failed, onEarlier, onRetry }: { events: LifeOverviewThreadEvent[]; viewerTimeZone?: string; hasNextPage: boolean; requestedEarlier: boolean; expandedClusterIds: Set<string>; onExpandedClusterIdsChange: Dispatch<SetStateAction<Set<string>>>; loading: boolean; failed: boolean; onEarlier: () => void; onRetry: () => void }) {
  const earlierButtonRef = useRef<HTMLButtonElement>(null);
  const grouped = groupEvents(events, viewerTimeZone);
  return <section className="life-thread" aria-labelledby="life-thread-title">
    <div className="life-section-heading"><h2 id="life-thread-title">Recent Life thread</h2><History size={18} /></div>
    {!events.length ? <div className="life-thread__empty"><History size={20} /><div><strong>No meaningful changes yet</strong><p>Changes from Money, Wellbeing, and About You will collect here when available.</p></div></div> : <div className="life-thread__groups">{grouped.map(([date, items]) => <section key={date} aria-labelledby={`life-date-${date}`}><h3 id={`life-date-${date}`}>{dateLabel(date, viewerTimeZone)}</h3><ol>{clusterEvents(date, items).flatMap((cluster) => {
      const expanded = expandedClusterIds.has(cluster.key);
      const toggle = () => onExpandedClusterIdsChange((current) => { const next = new Set(current); if (next.has(cluster.key)) next.delete(cluster.key); else next.add(cluster.key); return next; });
      return <Fragment key={cluster.key}><ThreadClusterRow clusterKey={cluster.key} events={cluster.events} viewerTimeZone={viewerTimeZone} expanded={expanded} expandedClusterIds={[...expandedClusterIds]} onToggle={toggle} />{expanded ? cluster.events.map((event) => <ThreadRow key={event.id} event={event} viewerTimeZone={viewerTimeZone} expandedClusterIds={[...expandedClusterIds]} nested />) : null}</Fragment>;
    })}</ol></section>)}</div>}
    {(hasNextPage || requestedEarlier) && <div className="life-thread__earlier" data-error={failed || undefined}><Button ref={earlierButtonRef} onClick={() => { if (failed) onRetry(); else if (hasNextPage && !loading) onEarlier(); }} aria-disabled={loading || (!hasNextPage && !failed)}>{loading ? "Loading earlier changes…" : failed ? "Retry earlier changes" : hasNextPage ? "Earlier" : "All earlier changes loaded"}</Button>{failed ? <span role="alert">Earlier changes could not be loaded. The changes already shown are still available.</span> : <span role="status" aria-live="polite">{requestedEarlier && !loading ? `${events.length} meaningful changes shown` : ""}</span>}</div>}
  </section>;
}

function ThreadRow({ event, viewerTimeZone, expandedClusterIds, nested = false }: { event: LifeOverviewThreadEvent; viewerTimeZone?: string; expandedClusterIds?: readonly string[]; nested?: boolean }) {
  const Icon = DOMAIN_META[event.domain].icon;
  return <li className="life-thread-item" data-nested={nested || undefined}><time dateTime={event.occurredAt}>{timeLabel(event.occurredAt, viewerTimeZone)}</time><span className="life-thread-item__rail"><i /><span><Icon size={13} /></span></span><LifeReturnLink to={event.destination} returnId={`thread:${event.id}`} expandedClusterIds={expandedClusterIds}><strong>{event.title}</strong><small>{event.detail}</small><em>{DOMAIN_META[event.domain].label}<ArrowRight size={13} /></em></LifeReturnLink></li>;
}

function ThreadClusterRow({ clusterKey, events, viewerTimeZone, expanded, expandedClusterIds, onToggle }: { clusterKey: string; events: LifeOverviewThreadEvent[]; viewerTimeZone?: string; expanded: boolean; expandedClusterIds: readonly string[]; onToggle: () => void }) {
  const first = events[0], Icon = DOMAIN_META[first.domain].icon, domain = DOMAIN_META[first.domain].label;
  if (events.length === 1) return <ThreadRow event={first} viewerTimeZone={viewerTimeZone} expandedClusterIds={expandedClusterIds} />;
  return <li className="life-thread-item life-thread-cluster"><time dateTime={first.occurredAt}>{timeLabel(first.occurredAt, viewerTimeZone)}</time><span className="life-thread-item__rail"><i /><span><Icon size={13} /></span></span><Button className="life-thread-cluster__toggle" data-life-cluster-key={clusterKey} aria-expanded={expanded} onClick={onToggle}><strong>{events.length} {domain} changes</strong><small>{events.length} related changes grouped together.</small><em>{expanded ? "Hide changes" : "Show changes"}</em></Button></li>;
}

function focalDiscussionReference(item: LifeOverviewMoment): ConversationContextReference | undefined {
  const mapping = item.kind === "obligation_due" && item.domain === "money"
    ? { prefix: "bill:", kind: "finance_record" as const }
    : item.kind === "wellbeing_care" && item.domain === "wellbeing"
      ? { prefix: "wellbeing:", kind: "wellbeing_record" as const }
      : undefined;
  if (!mapping || !item.id.startsWith(mapping.prefix)) return undefined;
  const id = item.id.slice(mapping.prefix.length);
  if (!id || id.length > 240 || /[\u0000-\u001f\u007f]/.test(id)) return undefined;
  return { kind: mapping.kind, id, title: item.title };
}
function fallbackFor(status: LifeOverview["status"], recoverySource?: LifeOverviewSource): {
  state: LifeSourceStatusState;
  label: string;
  title: string;
  body: string;
  note: string;
  destination?: string;
  destinationLabel?: string;
} {
  const destination = recoverySource ? recoveryDestination(recoverySource.id) : undefined;
  const destinationLabel = recoverySource?.label;
  if (status === "unavailable") return { state: "unavailable", label: "Unavailable", title: recoverySource ? `Review ${recoverySource.label} directly.` : "Life cannot identify what needs attention yet.", body: recoverySource ? `${recoverySource.label} could not be read for this summary. Open the relevant area to inspect the saved state and available recovery path.` : "The Life summary could not read its sources. Money, Wellbeing, and About You can still be opened and checked individually.", note: "Missing information has not been treated as an all-clear.", destination, destinationLabel };
  if (status === "setup") return { state: "not_configured", label: "Not set up", title: "Start with the part of life you want help with.", body: "Add Money, Wellbeing, or About You context only when it would be useful. Kora will not fill in the gaps by assumption.", note: "Nothing personal is inferred before you choose what to add.", destination: undefined, destinationLabel: undefined };
  if (status === "partial") return { state: "partial", label: "Partial coverage", title: "No priority found in available saved information.", body: "Some Life coverage is incomplete, so this summary may be missing context. Open a Life area below to review what is saved.", note: "Missing information has not been treated as an all-clear.", destination: undefined, destinationLabel: undefined };
  return { state: "current", label: "Steady", title: "Nothing in Life needs your attention right now.", body: "Current Money, Wellbeing, and About You information has no time-bound exception. Recent changes remain available below.", note: "Based only on current, permitted sources.", destination: undefined, destinationLabel: undefined };
}
function recoveryDestination(domain: LifeOverviewDomain) { return domain === "money" ? "/life/finances" : domain === "wellbeing" ? "/life/wellbeing" : "/life/about-you"; }
function sourceRecoveryLabel(source: LifeOverviewSource) {
  if (source.recoveryOwner === "provider") return "Review connection setup in Settings";
  if (source.recoveryOwner === "user") return `Review ${source.label}`;
  return "Retry Life refresh";
}
function sourceRecoveryAction(source: LifeOverviewSource, onRetry: () => void): ReactNode {
  if (source.state === "current") return null;
  if (source.recoveryOwner === "provider") return <><p className="life-source-recovery__copy">Review connection setup in Settings to restore this source when it is ready.</p><Link className="button button--secondary" to="/settings/integrations">Review connection setup</Link></>;
  if (source.recoveryOwner === "user") return <><p className="life-source-recovery__copy">Open {source.label} to review the saved information and any available setup.</p><Link className="button button--secondary" to={recoveryDestination(source.id)}>Review {source.label}</Link></>;
  return <><p className="life-source-recovery__copy">Life could not refresh this saved summary. The rest of the page remains available.</p><Button tone="secondary" onClick={onRetry}><RefreshCw size={15} />Retry Life refresh</Button></>;
}
function orientationPriority(status: LifeOverview["status"], needsReview: number) {
  if (needsReview) return `${needsReview} needs review`;
  if (status === "partial") return "Qualified view";
  if (status === "unavailable") return "Priority unavailable";
  if (status === "setup") return "No sources set up";
  return "Nothing needs attention";
}
function LifeLoading() { return <PageFrame width="wide" className="life-overview life-overview--loading" role="status" aria-label="Opening Life"><PageHeader title="Life" description="Opening your current personal context." status="Opening" /><div className="life-overview__orientation life-skeleton" /><div className="life-overview__lead-grid"><div className="life-right-now life-skeleton" /><div className="life-next life-skeleton" /></div><div className="life-signal-grid">{[0, 1, 2].map((item) => <div key={item} className="life-signal life-skeleton" />)}</div><div className="life-thread life-skeleton" /></PageFrame>; }
function LifeUnavailable({ onRetry }: { onRetry: () => void }) { return <PageFrame width="wide" className="life-overview"><PageHeader title="Life" description="Your personal context and daily signals." status="Unavailable" /><section className="life-overview-unavailable" role="alert"><AlertCircle size={24} /><div><h2>Life could not be opened.</h2><p>Kora could not read the latest Life summary. Independently available areas remain accessible.</p></div><Button tone="primary" onClick={onRetry}><RefreshCw size={15} />Try again</Button><nav aria-label="Life areas"><Link to="/life/finances">Money</Link><Link to="/life/wellbeing">Wellbeing</Link><Link to="/life/about-you">About You</Link></nav></section></PageFrame>; }

function viewerDayKey(value: string, timeZone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
  } catch {
    // A malformed optional timezone should not hide an otherwise readable event.
  }
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function groupEvents(events: LifeOverviewThreadEvent[], timeZone?: string) { const groups = new Map<string, LifeOverviewThreadEvent[]>(); for (const event of events) { const key = viewerDayKey(event.occurredAt, timeZone); groups.set(key, [...(groups.get(key) ?? []), event]); } return [...groups.entries()]; }
function clusterEvents(date: string, events: LifeOverviewThreadEvent[]) { const groups = new Map<string, LifeOverviewThreadEvent[]>(); for (const event of events) { const key = `${date}:${event.domain}:${event.kind}:${event.title}`; groups.set(key, [...(groups.get(key) ?? []), event]); } return [...groups.entries()].map(([key, items]) => ({ key, events: items })); }
function formatOrientationDate(value: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(value)); }
function formatHorizon(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(new Date(value)); }
function compactDate(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(value)); }
function fullDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function dateLabel(value: string, timeZone?: string) { const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); const today = viewerDayKey(new Date().toISOString(), timeZone); if (value === today) return "Today"; return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(date); }
function timeLabel(value: string, timeZone?: string) { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value)); }
function freshness(value: string) { return Number.isFinite(Date.parse(value)) ? `Source read ${compactDate(value)}` : undefined; }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100); }

function useMediaMatch(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
