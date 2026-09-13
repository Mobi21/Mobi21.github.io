import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowRight,
  Archive,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  MessageCircleMore,
  RotateCcw,
  MoreHorizontal,
  FileX2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ConnectionPhase } from "../../app/connection-context";
import { Button, CoverageStrip, Disclosure, KoraBriefing, PageFrame, PageHeader, Skeleton, StateView } from "../../components/primitives";
import { Menu } from "../../components/overlays";
import { createTodayOrigin, readTodayOrigin, type TodayOrigin } from "./today-navigation";
import {
  runtime,
  type CalendarEvent,
  type ConversationContextReference,
  type LifeOverview,
  type LifeOverviewDomain,
  type LifeOverviewMoment,
  type LifeOverviewSource,
  type LifeSourceState,
  type LifeTodayFeed,
  type BrainPage,
  type WorkItem,
} from "../../lib/runtime";
import "./today.css";

type AskKora = (reference?: ConversationContextReference, draft?: string) => void;

export type TodayDaySelection = { viewerDate: string; viewerTimeZone: string };

export type TodayRecentPagesPage = { items: BrainPage[]; cursor?: string; complete: boolean };

export type TodayLoaders = {
  feed: () => Promise<LifeTodayFeed>;
  life: (day?: TodayDaySelection) => Promise<LifeOverview>;
  pages?: () => Promise<TodayRecentPagesPage>;
};

export type TodayActionServices = Pick<typeof runtime, "completeWorkItem">;

export type TodayContinuityReference = {
  id: string;
  title: string;
  state: "archived" | "cancelled" | "deleted";
  destination?: string;
};

export type TodayPresentationScope = {
  label: string;
  onClear: () => void;
};

const liveLoaders: TodayLoaders = {
  feed: () => runtime.lifeTodayFeed(),
  life: (day) => runtime.lifeOverview(undefined, 1, day),
  pages: () => runtime.pagesPage({ state: "active", pageSize: 3 }),
};

const DOMAIN_META: Record<LifeOverviewDomain, { label: "Money" | "Wellbeing" | "About You"; icon: typeof CircleDollarSign }> = {
  money: { label: "Money", icon: CircleDollarSign },
  wellbeing: { label: "Wellbeing", icon: HeartPulse },
  about_you: { label: "About You", icon: UserRound },
};

type TodayMoment = {
  id: string;
  source: "Calendar" | "Work" | "Money" | "Wellbeing" | "About You" | "Brain";
  title: string;
  detail: string;
  destination: string;
  timeLabel: string;
  sortAt: number;
  active?: boolean;
  completed?: boolean;
  terminalState?: "completed" | "cancelled";
  qualification?: string;
  context?: ConversationContextReference;
  workItem?: WorkItem;
  workKind?: WorkItem["kind"];
  attentionOnly?: boolean;
};

type TodayWorkEntryLike = {
  item: WorkItem;
  canonicalRoute: string;
  attention?: { kind: "instant"; instant: string; viewerDate: string };
};

type CompletionFailure = { message: string; retryable: boolean; uncertain: boolean };
type TodayActionError = CompletionFailure & { id: string; refreshing?: boolean };

function completionFailure(reason: unknown): CompletionFailure {
  const candidate = reason as { code?: string; status?: number; message?: string } | null;
  const code = candidate?.code ?? "";
  const diagnostic = `${code} ${candidate?.message ?? ""}`;
  const conflict = candidate?.status === 409 || /conflict|version|stale/i.test(diagnostic);
  const uncertain = /transport|timeout|network|disconnect|unreachable|uncertain/i.test(diagnostic);
  if (conflict) return { message: "This Work item changed while Today was open. Today refreshed the current record; review its new version before completing it again.", retryable: false, uncertain: false };
  if (uncertain) return { message: "Completion may have reached Work. Today refreshed its current state; open Work to confirm before trying again.", retryable: false, uncertain: true };
  return { message: candidate?.message ?? "The Work item could not be completed.", retryable: true, uncertain: false };
}

export function TodayWorkspace({
  onAskKora,
  loaders = liveLoaders,
  actionServices = runtime,
  requestKey = "live",
  connectionPhase = "ready",
  currentInstant,
  continuityReferences = [],
  presentationScope,
}: {
  onAskKora: AskKora;
  loaders?: TodayLoaders;
  actionServices?: TodayActionServices;
  requestKey?: string;
  connectionPhase?: ConnectionPhase;
  currentInstant?: string;
  continuityReferences?: TodayContinuityReference[];
  presentationScope?: TodayPresentationScope;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refreshInFlight = useRef(false);
  const returnRestoration = useRef<{ locationKey: string; focusId: string; restoredTarget?: HTMLElement; hasRestored: boolean; userMoved: boolean } | undefined>(undefined);
  const actionFocus = useRef<{ trigger: HTMLElement; nextId?: string; sectionId?: string } | undefined>(undefined);
  const [resumeRefreshing, setResumeRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [observedInstant, setObservedInstant] = useState(() => currentInstant ?? new Date().toISOString());
  const [actionErrors, setActionErrors] = useState<Record<string, TodayActionError>>({});
  const [recoveryFocusId, setRecoveryFocusId] = useState<string>();
  useEffect(() => {
    if (currentInstant) {
      setObservedInstant(currentInstant);
      return;
    }
    const observeCurrentDay = () => setObservedInstant(new Date().toISOString());
    observeCurrentDay();
    const timer = window.setInterval(observeCurrentDay, 30_000);
    return () => window.clearInterval(timer);
  }, [currentInstant]);
  const feedQuery = useQuery({
    queryKey: ["today", "feed", requestKey],
    queryFn: loaders.feed,
    placeholderData: (previous) => previous,
  });
  const feed = feedQuery.data;
  const lifeDay = feed ? { viewerDate: feed.date, viewerTimeZone: feed.viewerTimeZone } : undefined;
  const lifeQuery = useQuery({
    queryKey: ["today", "life", requestKey, lifeDay?.viewerDate, lifeDay?.viewerTimeZone],
    queryFn: () => loaders.life(lifeDay),
    enabled: Boolean(lifeDay),
  });
  const pagesQuery = useQuery({
    queryKey: ["brain", "pages", "recently-updated"],
    queryFn: () => (loaders.pages ?? (() => Promise.resolve({ items: [], complete: true })))(),
    enabled: Boolean(feed),
    staleTime: 15_000,
  });
  const refreshAfterResume = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setResumeRefreshing(true);
    try {
      await Promise.allSettled([feedQuery.refetch(), lifeQuery.refetch()]);
    } finally {
      refreshInFlight.current = false;
      setResumeRefreshing(false);
    }
  }, [feedQuery.refetch, lifeQuery.refetch]);
  const openNewDay = useCallback(async () => {
    await Promise.allSettled([feedQuery.refetch(), lifeQuery.refetch()]);
    requestAnimationFrame(() => {
      const title = document.querySelector<HTMLElement>(".k-page-header__title, #main-content h1, .view-bar__title");
      if (!title) return;
      if (!title.matches("[tabindex], button, a, input, select, textarea")) title.tabIndex = -1;
      title.focus({ preventScroll: true });
    });
  }, [feedQuery.refetch, lifeQuery.refetch]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshAfterResume();
    };
    const onPageShow = () => void refreshAfterResume();
    const onFocus = () => void refreshAfterResume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshAfterResume]);
  const date = feed ? formatPlainDate(feed.date) : "Opening current local day";

  const refreshing = resumeRefreshing || feedQuery.isFetching || lifeQuery.isFetching;
  const recordActionError = useCallback((error: TodayActionError) => {
    setActionErrors((current) => ({ ...current, [error.id]: error }));
    setRecoveryFocusId(error.id);
  }, []);
  const clearActionError = useCallback((id: string) => {
    setActionErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const completeWork = useMutation({
    mutationFn: async (item: WorkItem) => {
      const result = await actionServices.completeWorkItem(item.id, item.version, "");
      if (result.status !== "settled") {
        throw new Error("This Work item now requires approved access. Open it in Work to review the current record.");
      }
      return result;
    },
    onMutate: (item) => {
      setAnnouncement("");
      clearActionError(item.id);
    },
    onSuccess: async (_result, item) => {
      setAnnouncement(`${item.title} was completed in Work.`);
      await queryClient.invalidateQueries({ queryKey: ["work"] });
      const refreshed = await feedQuery.refetch();
      if (refreshed.isError || !refreshed.data || refreshed.data.sources.native_work.state !== "ok") {
        recordActionError({ id: item.id, message: "Work completed, but Today could not refresh. Refresh Work state or open Work to confirm the current record.", retryable: false, uncertain: true });
      } else {
        clearActionError(item.id);
      }
      requestAnimationFrame(() => restoreActionFocus(actionFocus.current, false));
    },
    onError: async (reason, item) => {
      const failure = completionFailure(reason);
      await queryClient.invalidateQueries({ queryKey: ["work"] });
      const reconciled = await feedQuery.refetch();
      if (reconciled.isError || !reconciled.data) {
        recordActionError({ id: item.id, message: "The completion request did not settle, and Today could not refresh its Work state. Refresh Work state or open Work to confirm before trying again.", retryable: false, uncertain: true });
        return;
      }
      if (reconciled.data.sources.native_work.state !== "ok") {
        recordActionError({ id: item.id, message: "Today could not confirm the Work state after the completion request. Refresh Work state or open Work to review the current record before trying again.", retryable: false, uncertain: true });
        return;
      }
      const current = reconciled.data.work.current.items.find((entry) => entry.item.id === item.id);
      const attention = reconciled.data.work.attention?.items.find((entry) => entry.item.id === item.id);
      if (!current && !attention) {
        setAnnouncement(`${item.title} no longer appears as an open Work item. Today refreshed its current state.`);
        clearActionError(item.id);
        requestAnimationFrame(() => restoreActionFocus(actionFocus.current, false));
        return;
      }
      recordActionError({
        id: item.id,
        message: failure.uncertain
          ? "Completion may have reached Work. Today refreshed its current state; open Work to confirm before trying again."
          : failure.message,
        retryable: failure.retryable,
        uncertain: failure.uncertain,
      });
    },
  });
  useEffect(() => {
    if (!recoveryFocusId) return;
    const frame = requestAnimationFrame(() => {
      const recovery = [...document.querySelectorAll<HTMLElement>("[data-today-recovery-id]")]
        .find((candidate) => candidate.dataset.todayRecoveryId === recoveryFocusId);
      recovery?.focus({ preventScroll: true });
      setRecoveryFocusId(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [recoveryFocusId]);
  const refreshWorkState = useCallback(async (item: WorkItem) => {
    const existing = actionErrors[item.id];
    if (!existing || completeWork.isPending || existing.refreshing) return;
    setActionErrors((current) => ({ ...current, [item.id]: { ...existing, refreshing: true } }));
    await queryClient.invalidateQueries({ queryKey: ["work"] });
    const refreshed = await feedQuery.refetch();
    if (refreshed.isError || !refreshed.data || refreshed.data.sources.native_work.state !== "ok") {
      recordActionError({ id: item.id, message: "Today still could not confirm the Work state. Refresh Work state again or open Work before trying again.", retryable: false, uncertain: true });
      return;
    }
    const work = refreshed.data.work;
    const current = work.current.items.find((entry) => entry.item.id === item.id);
    const attention = work.attention?.items.find((entry) => entry.item.id === item.id);
    const coverageClipped = work.current.clipped || Boolean(work.attention?.clipped);
    if (!current && !attention && coverageClipped) {
      recordActionError({ id: item.id, message: "Today refreshed Work, but its bounded result did not include this record. Open Work to confirm before trying again.", retryable: false, uncertain: true });
      return;
    }
    if (!current && !attention) {
      clearActionError(item.id);
      setAnnouncement(`${item.title} no longer appears as an open Work item. Today refreshed its current state.`);
      requestAnimationFrame(() => restoreActionFocus(actionFocus.current, false));
      return;
    }
    // Clearing the local lock only after a successful, native-work-qualified
    // refetch lets the rendered record carry the fresh version. Nothing is
    // resubmitted by this recovery action.
    clearActionError(item.id);
    setAnnouncement(`Work state refreshed for ${item.title}. Review the current record before completing it.`);
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>("[data-today-moment-id]")]
        .find((candidate) => candidate.dataset.todayMomentId === `work:${item.id}`);
      target?.focus({ preventScroll: true });
    });
  }, [actionErrors, completeWork.isPending, feedQuery.refetch, queryClient, recordActionError, clearActionError]);
  const openMoment = useCallback((moment: TodayMoment, trigger: HTMLElement) => {
    const viewport = trigger.closest(".k-page-frame")?.querySelector<HTMLElement>(".k-page-frame__viewport");
    const entry = createTodayOrigin(moment.destination, moment.id, viewport?.scrollTop ?? 0);
    if (!entry) return;
    navigate(entry.route, { replace: true, state: { ...(location.state as object | null), todayReturn: entry } });
    navigate(moment.destination, { state: { todayOrigin: entry } });
  }, [location.pathname, location.search, location.state, navigate]);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const restoration = returnRestoration.current;
      if (!restoration || restoration.locationKey !== location.key || !restoration.hasRestored) return;
      if (event.target !== restoration.restoredTarget) restoration.userMoved = true;
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [location.key]);
  useEffect(() => {
    const entry = readTodayOrigin({ todayOrigin: (location.state as { todayReturn?: TodayOrigin } | null)?.todayReturn });
    if (!entry || entry.route !== `${location.pathname}${location.search}`) return;
    const restoration = returnRestoration.current?.locationKey === location.key
      ? returnRestoration.current
      : (returnRestoration.current = { locationKey: location.key, focusId: entry.focusId, hasRestored: false, userMoved: false });
    const frame = requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>("[data-today-moment-id]")].find((candidate) => candidate.dataset.todayMomentId === entry.focusId);
      const brainOrigin = entry.focusId.startsWith("brain:page:");
      const lifeOrigin = entry.focusId.startsWith("life:");
      // A cached row can disappear when an authoritative return refresh
      // settles. Wait for the source that owns the returned row, including
      // Brain pages, before choosing a target or fallback.
      if (feedQuery.isPending || feedQuery.isFetching || (brainOrigin && (pagesQuery.isPending || pagesQuery.isFetching)) || (lifeOrigin && (lifeQuery.isPending || lifeQuery.isFetching))) return;
      if (restoration.hasRestored) {
        if (restoration.userMoved) return;
        if (restoration.restoredTarget?.isConnected) return;
      }
      const viewport = document.querySelector<HTMLElement>(".today.k-page-frame .k-page-frame__viewport");
      if (viewport) viewport.scrollTop = entry.scrollTop;
      if (target) {
        if (restoration.hasRestored && restoration.restoredTarget === target && document.activeElement === target) return;
        target.focus({ preventScroll: true });
        restoration.restoredTarget = target;
      } else {
        const fallback = document.querySelector<HTMLElement>(".today .k-page-header__title, .today h1")
          ?? document.getElementById("today-needs-attention-title");
        if (fallback) {
          if (restoration.hasRestored && restoration.restoredTarget === fallback && document.activeElement === fallback) return;
          if (!fallback.matches("[tabindex], button, a, input, select, textarea")) fallback.tabIndex = -1;
          fallback.focus({ preventScroll: true });
          restoration.restoredTarget = fallback;
        }
      }
      restoration.hasRestored = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [feedQuery.data, feedQuery.isFetching, feedQuery.isPending, lifeQuery.data, lifeQuery.isFetching, lifeQuery.isPending, location.key, location.pathname, location.search, location.state, pagesQuery.data, pagesQuery.isError, pagesQuery.isFetching, pagesQuery.isPending]);
  const requestCompletion = useCallback((moment: TodayMoment, trigger: HTMLElement) => {
    const error = moment.workItem ? actionErrors[moment.workItem.id] : undefined;
    if (!moment.workItem || completeWork.isPending || error && (!error.retryable || error.uncertain || error.refreshing)) return;
    const row = trigger.closest("li[data-today-row]");
    const rowMoment = row?.querySelector<HTMLElement>("[data-today-moment-id]");
    const momentLinks = [...document.querySelectorAll<HTMLElement>("[data-today-moment-id]")];
    const rowIndex = rowMoment ? momentLinks.indexOf(rowMoment) : -1;
    const nextRow = rowIndex >= 0 ? momentLinks.slice(rowIndex + 1).find((candidate) => !row?.contains(candidate)) : undefined;
    const section = row?.closest<HTMLElement>("section[aria-labelledby]");
    actionFocus.current = { trigger, nextId: nextRow?.dataset.todayMomentId, sectionId: section?.getAttribute("aria-labelledby") ?? undefined };
    completeWork.mutate(moment.workItem);
  }, [actionErrors, completeWork]);

  if (feedQuery.isPending && !feed) return <TodayLoading />;

  if (feedQuery.isError && !feed) {
    return (
      <PageFrame width="wide" className="today today--unavailable">
        <PageHeader title="Today" description="Current day · Feed unavailable" />
        <StateView
          state="error"
          title="Today could not be opened"
          body="Kora could not establish the daily feed. Work, Calendar, Money, Wellbeing, and About You may still be opened directly; no missing result has been treated as an all-clear."
          action={<div className="today-state-actions"><Button onClick={() => void feedQuery.refetch()}><RefreshCw size={15} aria-hidden="true" />Try again</Button><Link to="/calendar">Open Calendar</Link><Link to="/work/tasks">Open Work</Link><Link to="/life">Open Life</Link></div>}
        />
      </PageFrame>
    );
  }

  if (!feed) return <TodayLoading />;

  const overview = lifeQuery.data;
  const rolloverDate = plainDateAt(observedInstant, feed.viewerTimeZone) === feed.date ? undefined : plainDateAt(observedInstant, feed.viewerTimeZone);
  const previousDay = Boolean(rolloverDate);
  const model = buildTodayModel(feed, overview, observedInstant, previousDay);
  const feedContinuityReferences: TodayContinuityReference[] = (feed.continuityReferences ?? []).map((reference) => reference.state === "deleted"
    ? { id: `${reference.objectKind}:${reference.id}`, title: "", state: "deleted" }
    : { id: `${reference.objectKind}:${reference.id}`, title: reference.title, state: reference.state, destination: reference.canonicalRoute });
  const visibleContinuityReferences = [...continuityReferences, ...feedContinuityReferences]
    .filter((reference, index, entries) => entries.findIndex((candidate) => candidate.id === reference.id) === index);
  const offline = connectionPhase === "disconnected";
  const hasSourceAttention = sourceAttention(feed, overview, lifeQuery.isError, feedQuery.isError) || offline || refreshing;
  const coverageRows = sourceRows(feed, overview, lifeQuery.isPending, lifeQuery.isError, offline, refreshing, feedQuery.isError);
  const prominentCoverage = coverageRows.some((row) => row.state !== "current");
  const prominentCoverageHeadline = prominentCoverage
    ? coverageHeadline(feed, overview, lifeQuery.isPending, lifeQuery.isError, offline, refreshing, feedQuery.isError)
    : undefined;
  const conflicts = todayConflicts(feed);
  const pagesVisible = Boolean(pagesQuery.isPending || pagesQuery.isError || pagesQuery.data?.items.length);
  const hasVisibleMoments = Boolean(model.active.length || model.upcoming.length || model.schedule.length || model.attention.length || model.completed.length || feed.pendingConfirmations.length || model.outcomes.length || visibleContinuityReferences.length || pagesVisible);
  const filteredEmpty = Boolean(presentationScope && !hasVisibleMoments);
  const trueEmpty = !model.schedule.length
    && !model.active.length
    && !model.upcoming.length
    && !model.attention.length
    && !model.completed.length
    && !feed.pendingConfirmations.length
    && !model.outcomes.length
    && !visibleContinuityReferences.length
    && !pagesVisible
    && !presentationScope
    && !hasSourceAttention
    && !refreshing;

  return (
    <PageFrame width="wide" className="today">
      <PageHeader
        title="Today"
        status={<p className="today__orientation" aria-label="Today context"><time dateTime={feed.date}>{date}</time><span aria-hidden="true">·</span><time dateTime={observedInstant}>{clockTime(observedInstant, feed.viewerTimeZone)}</time><span aria-hidden="true">·</span><span>{timezoneLabel(feed)}</span></p>}
        actions={<><Button className="today-ask-full" tone="secondary" onClick={() => onAskKora(undefined, todayAskDraft(feed))}><MessageCircleMore size={15} aria-hidden="true" />Ask Kora about today</Button><Menu className="today-ask-menu" trigger={<Button className="today-ask-overflow" tone="secondary" aria-label="More Today actions"><MoreHorizontal size={18} aria-hidden="true" />More</Button>} actions={[{ id: "ask-kora", label: "Ask Kora about today", icon: <MessageCircleMore size={15} aria-hidden="true" />, onSelect: () => onAskKora(undefined, todayAskDraft(feed)) }]} /></>}
      />

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {refreshing ? <p className="today-refresh-status" role="status"><RefreshCw className="spin" size={15} aria-hidden="true" />Refreshing source freshness before connected moments are marked current…</p> : null}

      {rolloverDate ? <DayRolloverNotice date={rolloverDate} onOpen={() => void openNewDay()} /> : null}
      {prominentCoverageHeadline ? <CoverageStrip
        state={coverageStripState(coverageRows)}
        title={prominentCoverageHeadline.title}
        description={prominentCoverageHeadline.body}
      /> : null}

      {filteredEmpty ? (
        <StateView
          className="today__empty"
          state="empty"
          title="No moments match this Today scope"
          body={`The active scope is “${presentationScope!.label}”. Other current moments remain available in their own areas.`}
          action={<Button onClick={presentationScope!.onClear}>Clear Today scope</Button>}
        />
      ) : trueEmpty ? (
        <StateView
          className="today__empty"
          state="empty"
          icon={<ShieldCheck size={22} aria-hidden="true" />}
          title="Your day is open from the current sources"
          body="Calendar, Work, approvals, schedules, Money, Wellbeing, and About You returned no time-bound moment or required decision for this day."
          action={<div className="today-state-actions"><Link to="/calendar">Open Calendar</Link><Link to="/work/tasks">Open Work</Link></div>}
        />
      ) : (
        <div className="today__layout">
          <div className="today__primary today__spine">
            {feed.pendingConfirmations.length ? <DecisionQueue confirmations={feed.pendingConfirmations} /> : null}
            {model.attention.length ? <UnscheduledAttentionGroup moments={model.attention.slice(0, 4)} total={model.attentionTotal} onAskKora={onAskKora} onOpen={openMoment} onComplete={requestCompletion} onRefreshWork={refreshWorkState} completingId={completeWork.isPending ? completeWork.variables?.id : undefined} completionPending={completeWork.isPending} actionErrors={actionErrors} /> : null}
          </div>
          <SchedulePanel className="today__rail" model={model} conflicts={conflicts} previousDay={previousDay} now={observedInstant} viewerTimeZone={feed.viewerTimeZone} onAskKora={onAskKora} onOpen={openMoment} />
          <RecentPagesPanel query={pagesQuery} onOpen={openMoment} />
          {model.outcomes.length ? <TodayKoraBriefing outcomes={model.outcomes} totalCount={model.outcomesTotal} clipped={model.outcomesClipped} viewAllRoute={model.outcomesViewAllRoute} viewerTimeZone={feed.viewerTimeZone} onAskKora={onAskKora} /> : null}
          {visibleContinuityReferences.length ? <TodayContinuityReferences references={visibleContinuityReferences} /> : null}
          {model.completed.length ? <CompletedMomentsDisclosure moments={model.completed} onOpen={openMoment} workTotal={model.completedWorkTotal} workLoaded={model.completedWorkLoaded} workClipped={model.completedWorkClipped} calendarLoaded={model.completedCalendarLoaded} calendarKnownTotal={model.completedCalendarKnownTotal} calendarClipped={model.completedCalendarClipped} /> : null}
          <BoundedRemainder model={model} />
          <DailySourceSummary feed={feed} overview={overview} lifeLoading={lifeQuery.isPending} lifeError={lifeQuery.isError} feedError={feedQuery.isError} offline={offline} refreshing={refreshing} onRetry={() => { void feedQuery.refetch(); void lifeQuery.refetch(); }} showHeadline={!prominentCoverage} compact />
        </div>
      )}
    </PageFrame>
  );
}

function TodayLoading() {
  return (
    <PageFrame width="wide" className="today today--loading" aria-label="Opening Today" aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">Loading Today</span>
      <PageHeader title="Today" description="Opening current local day" />
      <div className="today__layout">
        <div className="today__spine">
          <section className="today-now today-skeleton-block" aria-label="Loading current moment"><Skeleton rows={3} /></section>
          <section className="today-moment-section today-skeleton-block" aria-label="Loading next moments"><Skeleton rows={4} /></section>
          <section className="today-decisions today-skeleton-block" aria-label="Loading decisions"><Skeleton rows={3} /></section>
        </div>
        <aside className="today__rail" aria-label="Loading sources"><div className="today-skeleton-block"><Skeleton rows={4} /></div></aside>
      </div>
    </PageFrame>
  );
}

function DayRolloverNotice({ date, onOpen }: { date: string; onOpen: () => void }) {
  return <section className="today-rollover" role="status" aria-label="A new local day is available"><CalendarClock size={18} aria-hidden="true" /><div><strong>It’s now {formatPlainDate(date)}.</strong><p>This view is dated to the earlier day. Resuming Today may refresh it to the new local day; open the new day when you want to continue there.</p></div><Button onClick={onOpen}>Open the new day</Button></section>;
}

type TodayConflict = {
  id: string;
  title: string;
  detail: string;
  destinations: Array<{ label: string; href: string }>;
};

function TodayConflictNotice({ conflicts }: { conflicts: TodayConflict[] }) {
  return <section className="today-conflicts" aria-labelledby="today-conflicts-title"><div className="today-section-heading"><h2 id="today-conflicts-title">Schedule conflict</h2><span>{conflicts.length}</span></div><p>These exact times overlap. Today has not chosen what to move.</p><ol>{conflicts.slice(0, 3).map((conflict) => <li key={conflict.id}><CircleAlert size={16} aria-hidden="true" /><div><strong>{conflict.title}</strong><span>{conflict.detail}</span><div>{conflict.destinations.map((destination) => <Link key={destination.href} to={destination.href}>{destination.label}</Link>)}</div></div></li>)}</ol>{conflicts.length > 3 ? <p>{conflicts.length - 3} more conflicts remain visible in Calendar and Work.</p> : null}</section>;
}

function TodayContinuityReferences({ references }: { references: TodayContinuityReference[] }) {
  return <section className="today-references" aria-labelledby="today-references-title"><div className="today-section-heading"><h2 id="today-references-title">Referenced records</h2><span>{references.length}</span></div><p>These records are mentioned by a decision or recorded outcome, but their current state has changed.</p><ol>{references.map((reference) => <li key={reference.id}>{reference.state === "archived" ? <Archive size={16} aria-hidden="true" /> : <FileX2 size={16} aria-hidden="true" />}<div><strong>{reference.state === "deleted" ? "Record no longer available" : reference.title}</strong><span>{reference.state === "archived" ? "Archived · the record remains recoverable in Work Archive." : reference.state === "cancelled" ? "Cancelled · the terminal Work record remains available for context." : "Deleted · Today does not retain a dead record link or repeat deleted content."}</span></div>{reference.state !== "deleted" && reference.destination ? <Link to={reference.destination}>{reference.state === "archived" ? "Open in Archive" : "Open in Work"}</Link> : null}</li>)}</ol></section>;
}

function SchedulePanel({
  className = "",
  model,
  conflicts,
  previousDay,
  now,
  viewerTimeZone,
  onAskKora,
  onOpen,
}: {
  className?: string;
  model: ReturnType<typeof buildTodayModel>;
  conflicts: TodayConflict[];
  previousDay: boolean;
  now: string;
  viewerTimeZone: string;
  onAskKora: AskKora;
  onOpen: (moment: TodayMoment, trigger: HTMLElement) => void;
}) {
  const schedule = previousDay ? model.schedule : [...model.active, ...model.upcoming];
  const next = model.upcoming.filter((moment) => moment.source === "Calendar" || moment.source === "Money" || moment.source === "Wellbeing" || moment.source === "About You");
  const shownCount = previousDay ? schedule.length : model.active.length + Math.min(next.length, 5);
  return (
    <section className={`today-schedule ${className}`.trim()} aria-labelledby="today-schedule-title">
      <div className="today-section-heading"><div><h2 id="today-schedule-title">Schedule</h2><p className="today-panel-description">{previousDay ? "Retained day · dated agenda" : "Current and upcoming commitments"}</p></div><span>{schedule.length ? countLabel(shownCount, schedule.length) : "—"}</span></div>
      {previousDay ? (
        <div className="today-schedule__group">
          <h3>Previous day</h3>
          <ol>{schedule.map((moment) => <li key={moment.id}><DayMoment moment={{ ...moment, active: false }} onAskKora={onAskKora} onOpen={onOpen} /></li>)}</ol>
        </div>
      ) : (
        <>
          <div className="today-schedule__group"><div className="today-schedule__group-heading"><h3>Now</h3><time dateTime={now}>{clockTime(now, viewerTimeZone)}</time></div>{model.active.length ? <ol>{model.active.map((moment) => <li key={moment.id}><DayMoment moment={moment} onAskKora={onAskKora} onOpen={onOpen} prominent /></li>)}</ol> : <p className="today-schedule__empty"><Clock3 size={17} aria-hidden="true" />No current timed moment is established yet.</p>}</div>
          {next.length ? <div className="today-schedule__group"><h3>Next</h3><ol>{next.slice(0, 5).map((moment) => <li key={moment.id}><DayMoment moment={moment} onAskKora={onAskKora} onOpen={onOpen} /></li>)}</ol></div> : null}
          {!next.length && model.active.length ? <p className="today-schedule__empty"><Clock3 size={17} aria-hidden="true" />No upcoming scheduled moment is established yet.</p> : null}
        </>
      )}
      {conflicts.length ? <TodayConflictNotice conflicts={conflicts} /> : null}
    </section>
  );
}

function RecentPagesPanel({ query, onOpen }: { query: UseQueryResult<TodayRecentPagesPage, Error>; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void }) {
  const pages = query.data?.items ?? [];
  const visiblePages = pages.slice(0, 3);
  return (
    <section className="today-recent-pages" aria-labelledby="today-recent-pages-title">
      <div className="today-section-heading"><div><h2 id="today-recent-pages-title">Recently updated pages</h2><p className="today-panel-description">Active Brain pages · up to 3</p></div><span>{pages.length ? countLabel(visiblePages.length, pages.length) : "—"}</span></div>
      {query.isPending ? <p className="today-panel-state">Checking active pages…</p> : query.isError ? <div className="today-panel-state today-panel-state--error"><p>Recently updated pages are unavailable right now.</p><Button tone="ghost" onClick={() => void query.refetch()}><RefreshCw size={14} aria-hidden="true" />Try again</Button></div> : pages.length ? <ol className="today-recent-pages__items">{visiblePages.map((page) => {
        const moment: TodayMoment = { id: `brain:page:${page.id}`, source: "Brain", title: page.title, detail: "Active personal knowledge", destination: `/brain/pages/${encodeURIComponent(page.id)}`, timeLabel: compactMomentTime(page.updatedAt), sortAt: Date.parse(page.updatedAt) };
        return <li key={page.id}><DayMoment moment={moment} onAskKora={() => undefined} onOpen={onOpen} /></li>;
      })}</ol> : <p className="today-panel-state">No active pages have been updated recently.</p>}
    </section>
  );
}

type TodayOutcomeView = { id: string; title: string; summary: string; occurredAt: string; evidenceRoute: string; affectedLabel?: string; context: ConversationContextReference };

function TodayKoraBriefing({ outcomes, totalCount, clipped, viewAllRoute, viewerTimeZone, onAskKora }: { outcomes: TodayOutcomeView[]; totalCount: number; clipped: boolean; viewAllRoute: string; viewerTimeZone: string; onAskKora: AskKora }) {
  const visible = outcomes.slice(0, 2);
  const [expanded, setExpanded] = useState(true);
  const shownTotal = Math.max(visible.length, totalCount);
  const outcomeCountLabel = shownTotal === 1 ? "1 meaningful outcome" : `${countLabel(visible.length, shownTotal)} meaningful outcomes`;
  return (
    <KoraBriefing meta={<span className="today-briefing__heading-meta"><span>{outcomeCountLabel}{clipped ? " · bounded" : ""}</span><Button tone="ghost" aria-expanded={expanded} aria-controls="today-briefing-outcomes" onClick={() => setExpanded((current) => !current)}>{expanded ? "Collapse" : "Show"}</Button></span>}>
      {expanded ? <div id="today-briefing-outcomes" className="today-briefing__outcomes">
        {visible.map((outcome) => (
          <article key={outcome.id}>
            <strong className="today-trust-label">Recorded outcome</strong>
            <p>{outcome.summary}</p>
            <div className="today-briefing__evidence"><span>{outcome.title}</span><time dateTime={outcome.occurredAt}>{clockTime(outcome.occurredAt, viewerTimeZone)}</time>{outcome.affectedLabel ? <span>{outcome.affectedLabel}</span> : null}</div>
            <div className="today-briefing__actions"><Link to={outcome.evidenceRoute}>Open evidence</Link><Button tone="ghost" onClick={() => onAskKora(outcome.context)}>Discuss this outcome</Button></div>
          </article>
        ))}
      </div> : <p id="today-briefing-outcomes" className="today-briefing__collapsed">Recorded outcomes stay available here without displacing the daily spine.</p>}
      {shownTotal > visible.length || clipped ? <Link className="today-view-all" to={viewAllRoute}>View all {shownTotal} outcomes<ArrowRight size={14} /></Link> : null}
    </KoraBriefing>
  );
}

function DailySpine({
  model,
  conflicts,
  confirmations,
  continuityReferences,
  now,
  viewerTimeZone,
  onAskKora,
  onOpen,
  onComplete,
  completingId,
  actionError,
}: {
  model: ReturnType<typeof buildTodayModel>;
  conflicts: TodayConflict[];
  confirmations: LifeTodayFeed["pendingConfirmations"];
  continuityReferences: TodayContinuityReference[];
  now: string;
  viewerTimeZone: string;
  onAskKora: AskKora;
  onOpen: (moment: TodayMoment, trigger: HTMLElement) => void;
  onComplete: (moment: TodayMoment, trigger: HTMLElement) => void;
  completingId?: string;
  actionError?: { id: string; message: string; retryable?: boolean; uncertain?: boolean };
}) {
  return (
    <div className="today__spine" aria-label="Daily spine">
      <div className="today__immediate">
        <NowSection active={model.active} next={model.upcoming[0]} now={now} viewerTimeZone={viewerTimeZone} onAskKora={onAskKora} onOpen={onOpen} />
        {conflicts.length ? <TodayConflictNotice conflicts={conflicts} /> : null}
        <MomentSection title="Next" moments={model.upcoming.slice(0, 1)} onAskKora={onAskKora} onOpen={onOpen} emptyCopy="No later timed moment is established yet." />
      </div>
      {confirmations.length ? <DecisionQueue confirmations={confirmations} /> : null}
      {model.attention.length ? <UnscheduledAttentionGroup moments={model.attention.slice(0, 4)} onAskKora={onAskKora} onOpen={onOpen} onComplete={onComplete} onRefreshWork={() => undefined} completingId={completingId} actionErrors={actionError ? { [actionError.id]: { id: actionError.id, message: actionError.message, retryable: actionError.retryable ?? false, uncertain: actionError.uncertain ?? false } } : {}} /> : null}
      {model.upcoming.length > 1 ? <MomentSection title="Later" moments={model.upcoming.slice(1, 5)} onAskKora={onAskKora} onOpen={onOpen} /> : null}
      <BoundedRemainder model={model} />
      {continuityReferences.length ? <TodayContinuityReferences references={continuityReferences} /> : null}
      {model.completed.length ? <CompletedMomentsDisclosure moments={model.completed} onOpen={onOpen} workTotal={model.completedWorkTotal} workLoaded={model.completedWorkLoaded} workClipped={model.completedWorkClipped} calendarLoaded={model.completedCalendarLoaded} calendarKnownTotal={model.completedCalendarKnownTotal} calendarClipped={model.completedCalendarClipped} /> : null}
    </div>
  );
}

function NowSection({ active, next, now, viewerTimeZone, onAskKora, onOpen }: { active: TodayMoment[]; next?: TodayMoment; now: string; viewerTimeZone: string; onAskKora: AskKora; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void }) {
  return (
    <section className="today-now" aria-labelledby="today-now-title">
      <div className="today-now__marker"><span aria-hidden="true" /><div><h2 id="today-now-title">Now</h2><time dateTime={now}>{clockTime(now, viewerTimeZone)}</time></div></div>
      {active.length ? <div className="today-now__moments">{active.map((moment) => <DayMoment key={moment.id} moment={moment} onAskKora={onAskKora} onOpen={onOpen} prominent />)}</div> : <div className="today-now__open"><Clock3 size={18} aria-hidden="true" /><div><strong>No active timed moment</strong><p>{next ? `Next is ${next.title} at ${next.timeLabel}.` : "No later timed moment is established from current sources."}</p></div></div>}
      {active.length > 1 ? <p className="today-now__conflict" role="status"><CircleAlert size={15} aria-hidden="true" />{active.length} moments overlap now. Open Calendar to review the conflict; Today has not chosen between them.</p> : null}
    </section>
  );
}

function MomentSection({ title, moments, total = moments.length, onAskKora, onOpen, onComplete, onRefreshWork, completingId, completionPending = false, actionErrors = {}, emptyCopy }: { title: string; moments: TodayMoment[]; total?: number; onAskKora: AskKora; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void; onComplete?: (moment: TodayMoment, trigger: HTMLElement) => void; onRefreshWork?: (item: WorkItem) => void; completingId?: string; completionPending?: boolean; actionErrors?: Record<string, TodayActionError>; emptyCopy?: string }) {
  return (
    <section className="today-moment-section" aria-labelledby={`today-${slug(title)}-title`}>
      <div className="today-section-heading"><h2 id={`today-${slug(title)}-title`}>{title}</h2>{moments.length ? <span>{countLabel(moments.length, total)}</span> : null}</div>
      {moments.length ? <ol>{moments.map((moment) => <li key={moment.id} data-today-row><DayMoment moment={moment} onAskKora={onAskKora} onOpen={onOpen} onComplete={onComplete} onRefreshWork={onRefreshWork} completing={completingId === moment.workItem?.id} completionPending={completionPending} actionError={moment.workItem ? actionErrors[moment.workItem.id] : undefined} /></li>)}</ol> : emptyCopy ? <p className="today-section-empty">{emptyCopy}</p> : null}
    </section>
  );
}

function UnscheduledAttentionGroup({ moments, total = moments.length, onAskKora, onOpen, onComplete, onRefreshWork, completingId, completionPending = false, actionErrors }: { moments: TodayMoment[]; total?: number; onAskKora: AskKora; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void; onComplete: (moment: TodayMoment, trigger: HTMLElement) => void; onRefreshWork: (item: WorkItem) => void; completingId?: string; completionPending?: boolean; actionErrors: Record<string, TodayActionError> }) {
  return <MomentSection title="Needs attention" moments={moments} total={total} onAskKora={onAskKora} onOpen={onOpen} onComplete={onComplete} onRefreshWork={onRefreshWork} completingId={completingId} completionPending={completionPending} actionErrors={actionErrors} />;
}

function DayMoment({ moment, onAskKora, onOpen, onComplete, onRefreshWork, completing = false, completionPending = false, actionError, prominent = false }: { moment: TodayMoment; onAskKora: AskKora; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void; onComplete?: (moment: TodayMoment, trigger: HTMLElement) => void; onRefreshWork?: (item: WorkItem) => void; completing?: boolean; completionPending?: boolean; actionError?: TodayActionError; prominent?: boolean }) {
  const completionBlocked = Boolean(actionError && (!actionError.retryable || actionError.uncertain || actionError.refreshing));
  return (
    <article className="today-moment" data-source={slug(moment.source)} data-prominent={prominent || undefined}>
      <div className="today-moment__time"><span>{moment.timeLabel}</span>{moment.active ? <em>In progress</em> : null}</div>
      <div className="today-moment__content">
        <Link
          to={moment.destination}
          data-today-moment-id={moment.id}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onOpen(moment, event.currentTarget);
          }}
        ><strong>{moment.title}</strong><ArrowRight size={15} aria-hidden="true" /></Link>
        <p>{moment.detail}</p>
        <div className="today-moment__meta"><span>Observed from {moment.source}</span>{moment.qualification ? <span>{moment.qualification}</span> : null}</div>
      </div>
      <div className="today-moment__actions">
        {moment.workItem && onComplete ? <Button tone="ghost" loading={completing} disabled={completing || completionPending || completionBlocked} onClick={(event) => onComplete(moment, event.currentTarget)}><CheckCircle2 size={15} aria-hidden="true" />Complete</Button> : null}
        {moment.context ? <Button tone="ghost" className="today-moment__ask" onClick={() => onAskKora(moment.context)}>{moment.source === "Work" ? moment.workKind === "task" ? "Ask about this task" : moment.workKind === "commitment" ? "Ask about this commitment" : "Ask about this Work item" : "Ask Kora about this moment"}</Button> : null}
      </div>
      {actionError && onComplete ? <div className="today-moment__action-error" role="alert"><span>{actionError.message}{actionError.retryable && !actionError.uncertain ? " The prior Work state remains visible." : ""}</span>{completionBlocked ? <>{onRefreshWork && moment.workItem ? <Button data-today-recovery-id={moment.workItem.id} tone="ghost" disabled={completionPending || actionError.refreshing} onClick={() => onRefreshWork(moment.workItem!)}><RefreshCw size={14} aria-hidden="true" />{actionError.refreshing ? "Refreshing Work state…" : "Refresh Work state"}</Button> : null}<Link to={moment.destination}>Open in Work</Link></> : <Button data-today-recovery-id={moment.workItem?.id} tone="ghost" disabled={completionPending || completing} onClick={(event) => onComplete(moment, event.currentTarget)}><RotateCcw size={14} aria-hidden="true" />Retry</Button>}</div> : null}
    </article>
  );
}

function DecisionQueue({ confirmations }: { confirmations: LifeTodayFeed["pendingConfirmations"] }) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  return (
    <section className="today-decisions" aria-labelledby="today-decisions-title">
      <div className="today-section-heading"><h2 id="today-decisions-title">Needs a decision</h2>{confirmations.length ? <span>{countLabel(Math.min(confirmations.length, 3), confirmations.length)}</span> : null}</div>
      {confirmations.length ? <ol>{confirmations.slice(0, 3).map((item) => {
        const proposal = item.presentation.calendar;
        const affected = proposal?.affectedEvents.length ?? 0;
        const evidence = proposal
          ? `${affected} ${affected === 1 ? "event" : "events"} · ${proposal.source.label} · ${proposal.scope}`
          : item.presentation.target;
        return <li key={item.id}><ShieldAlert size={16} aria-hidden="true" /><div><strong className="today-trust-label">Proposal awaiting review</strong><Link to={`/approvals/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(returnTo)}`}><strong>{item.presentation.action}</strong><ArrowRight size={14} aria-hidden="true" /></Link><p>{item.presentation.consequence}</p><small>{evidence} · {riskLabel(item.presentation.risk)}</small></div></li>;
      })}</ol> : <div className="today-decisions__empty"><CheckCircle2 size={18} aria-hidden="true" /><p>Kora is not waiting on a recorded approval.</p></div>}
      {confirmations.length > 3 ? <Link className="today-view-all" to="/approvals">View all {confirmations.length} decisions<ArrowRight size={14} /></Link> : null}
    </section>
  );
}

function DailySourceSummary({ feed, overview, lifeLoading, lifeError, feedError, offline, refreshing, onRetry, compact = false, showHeadline = true }: { feed: LifeTodayFeed; overview?: LifeOverview; lifeLoading: boolean; lifeError: boolean; feedError: boolean; offline: boolean; refreshing: boolean; onRetry: () => void; compact?: boolean; showHeadline?: boolean }) {
  const rows = sourceRows(feed, overview, lifeLoading, lifeError, offline, refreshing, feedError);
  const attention = rows.filter((row) => row.state !== "current").length;
  const coverage = coverageHeadline(feed, overview, lifeLoading, lifeError, offline, refreshing, feedError);
  const coverageState = coverageStripState(rows);
  return (
    <section className={`today-sources${compact ? " today-sources--compact" : ""}`} aria-label="Today source coverage">
      {attention && showHeadline ? <CoverageStrip state={coverageState} title={coverage.title} description={coverage.body} /> : null}
      <Disclosure
        defaultOpen={false}
        summary="Source coverage"
        description={attention ? "Inspect the affected areas, saved information, and safest recovery path." : "All required sources completed; details stay available without repeating status on every row."}
        meta={attention ? `${attention} to review` : "Current"}
        icon={<ShieldCheck size={16} />}
      >
        <div className="today-sources__rows">
          {rows.map((row) => <div key={row.label}><span><strong>{row.label}</strong><small>{row.detail}</small></span><em data-state={row.state}>{sourceStateLabel(row.state)}</em></div>)}
        </div>
        <div className="today-sources__actions"><Button tone="ghost" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Refresh sources</Button><Link to="/life">Open Life sources</Link></div>
      </Disclosure>
    </section>
  );
}

function CompletedMomentsDisclosure({ moments, onOpen, workTotal, workLoaded, workClipped, calendarLoaded, calendarKnownTotal, calendarClipped }: { moments: TodayMoment[]; onOpen: (moment: TodayMoment, trigger: HTMLElement) => void; workTotal: number; workLoaded: number; workClipped: boolean; calendarLoaded: number; calendarKnownTotal?: number; calendarClipped: boolean }) {
  const visible = moments.slice(-6);
  const shownWork = visible.filter((moment) => moment.source === "Work").length;
  const shownCalendar = visible.filter((moment) => moment.source === "Calendar").length;
  const knownWorkTotal = Math.max(workTotal, workLoaded, shownWork);
  const knownCalendarTotal = calendarKnownTotal === undefined ? undefined : Math.max(calendarKnownTotal, calendarLoaded, shownCalendar);
  const workOmitted = knownWorkTotal > shownWork || workClipped;
  const calendarOmitted = (knownCalendarTotal !== undefined && knownCalendarTotal > shownCalendar) || calendarClipped;
  const countParts = [
    knownWorkTotal ? `Work: ${shownWork} shown · ${workLoaded} loaded · ${knownWorkTotal} total` : "",
    knownCalendarTotal !== undefined && knownCalendarTotal ? `Calendar: ${shownCalendar} shown · ${calendarLoaded} loaded · ${knownCalendarTotal} total` : calendarLoaded || calendarClipped ? `Calendar: ${shownCalendar} shown · ${calendarLoaded} loaded${calendarClipped ? " · source clipped; total unavailable" : ""}` : "",
  ].filter(Boolean);
  return (
    <section className="today-completed-section" aria-labelledby="today-completed-title">
      <h2 id="today-completed-title" className="sr-only">Completed</h2>
      <Disclosure summary="Completed" description="Earlier settled moments remain linked to their original areas for the rest of this view." meta={`${visible.length} shown`} icon={<CheckCircle2 size={16} />} className="today-completed">
        <div className="today-completed__counts" aria-label="Completed item counts">{countParts.map((part) => <span key={part}>{part}</span>)}</div>
        <ol>{visible.map((moment) => <li key={moment.id}><time>{moment.timeLabel}</time><Link to={moment.destination} data-today-moment-id={moment.id} onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(moment, event.currentTarget); }}>{moment.title}</Link><span>{moment.terminalState === "cancelled" ? "Cancelled" : moment.source}</span></li>)}</ol>
        {moments.length > visible.length ? <p>{moments.length - visible.length} loaded moments are omitted from this bounded view.</p> : null}
        {workOmitted || calendarOmitted ? <div className="today-completed__actions">{workOmitted ? <Link to="/work/tasks">View all completed Work</Link> : null}{calendarOmitted ? <Link to="/calendar">View all completed Calendar</Link> : null}</div> : null}
      </Disclosure>
    </section>
  );
}

function BoundedRemainder({ model }: { model: ReturnType<typeof buildTodayModel> }) {
  const hiddenLater = Math.max(0, model.upcoming.length - 5);
  const hiddenAttention = Math.max(0, model.attentionTotal - 4);
  const hiddenLifeProjection = model.lifeDayClipped ? Math.max(0, model.lifeDayTotal - model.lifeDayVisible) : 0;
  if (!hiddenLater && !hiddenAttention && !model.futureWorkTotal && !hiddenLifeProjection) return null;
  const hiddenUpcoming = model.upcoming.slice(5);
  const hiddenAttentionItems = model.attention.slice(4);
  const hiddenCalendar = hiddenUpcoming.filter((item) => item.source === "Calendar").length;
  const hiddenLife = hiddenUpcoming.filter((item) => item.source !== "Calendar").length;
  const hiddenWork = hiddenAttentionItems.filter((item) => item.source === "Work").length;
  const hiddenAttentionLife = hiddenAttentionItems.filter((item) => item.source !== "Work").length;
  const showLifeLink = Boolean(hiddenLife || hiddenAttentionLife || hiddenLifeProjection);
  const summaries = [
    hiddenLater ? `${hiddenLater} later ${hiddenLater === 1 ? "moment" : "moments"}` : "",
    hiddenAttention ? `${hiddenAttention} additional attention ${hiddenAttention === 1 ? "item" : "items"}` : "",
    hiddenLifeProjection ? `${hiddenLifeProjection} additional Life ${hiddenLifeProjection === 1 ? "moment remains" : "moments remain"} in Life` : "",
    model.futureWorkTotal ? `${model.futureWorkTotal} future Work ${model.futureWorkTotal === 1 ? "item stays" : "items stay"} in Work` : "",
  ].filter(Boolean);
  return <div className="today-bounded" role="status"><span>{summaries.join(" · ")}.</span><div>{hiddenCalendar ? <Link to="/calendar">View all in Calendar</Link> : null}{showLifeLink ? <Link to="/life">View all in Life</Link> : null}{hiddenWork || model.futureWorkTotal ? <Link to="/work/tasks">View all in Work</Link> : null}</div></div>;
}

function buildTodayModel(feed: LifeTodayFeed, overview?: LifeOverview, observed = feed.generatedAt, previousDay = false) {
  const now = Date.parse(observed);
  const calendar = feed.calendar.map((event) => calendarMoment(event, feed.viewerTimeZone, now));
  const selectedLifeMoments = overview ? selectTodayLifeMoments(overview, feed.date, feed.viewerTimeZone) : [];
  const lifeMoments = selectedLifeMoments.map((moment) => lifeMoment(moment, overview!.sources, feed.viewerTimeZone));
  const lifeMomentById = new Map(selectedLifeMoments.map((moment, index) => [lifeMoments[index].id, moment]));
  const scheduledLife = lifeMoments.filter((moment) => lifeMomentById.get(moment.id)?.kind === "wellbeing_care");
  const attentionLife = lifeMoments.filter((moment) => lifeMomentById.get(moment.id)?.kind !== "wellbeing_care");
  const schedule = [...calendar.filter((item) => !item.completed || previousDay).map((item) => previousDay ? { ...item, active: false, completed: false, terminalState: undefined } : item), ...scheduledLife].sort((left, right) => left.sortAt - right.sortAt || left.id.localeCompare(right.id));
  const timed = schedule.filter((item) => !item.completed);
  const active = timed.filter((item) => item.active);
  const upcoming = timed.filter((item) => !item.active && item.sortAt > now);
  const elapsedLife = [...(previousDay ? [] : timed.filter((item) => !item.active && item.sortAt <= now && item.source !== "Calendar")), ...attentionLife].sort((left, right) => left.sortAt - right.sortAt || left.id.localeCompare(right.id));
  const workProjection = feed.work as LifeTodayFeed["work"] & { attention?: { items: TodayWorkEntryLike[]; totalCount: number; clipped: boolean } };
  const currentEntries = workProjection?.current?.items?.length
    ? workProjection.current.items
    : feed.dueCommitments.map((item) => ({ item, canonicalRoute: `/work/tasks/${encodeURIComponent(item.id)}` } as TodayWorkEntryLike));
  const currentIds = new Set(currentEntries.map((entry) => entry.item.id));
  const attentionEntries = (workProjection?.attention?.items ?? []).filter((entry) => !currentIds.has(entry.item.id));
  const currentWork = currentEntries.map((entry) => workMoment(entry.item, feed.viewerTimeZone, now, entry.canonicalRoute));
  const attentionWork = attentionEntries.map((entry) => workMoment(entry.item, feed.viewerTimeZone, now, entry.canonicalRoute, true, entry.attention?.instant));
  const attention = [...currentWork, ...attentionWork, ...elapsedLife]
    .sort((left, right) => left.sortAt - right.sortAt || left.id.localeCompare(right.id));
  const settledWork = (feed.work?.settled.items ?? []).map((entry): TodayMoment => ({
    id: `work:${entry.item.id}`,
    source: "Work",
    title: entry.item.title,
    detail: entry.disposition === "cancelled" ? "Cancelled in Work" : "Completed in Work",
    destination: entry.canonicalRoute,
    timeLabel: clockTime(entry.settledAt, feed.viewerTimeZone),
    sortAt: Date.parse(entry.settledAt),
    completed: true,
    terminalState: entry.disposition,
  }));
  const completed = [...calendar.filter((item) => item.completed), ...settledWork].sort((left, right) => left.sortAt - right.sortAt);
  const typedOutcomes: TodayOutcomeView[] = (feed.outcomes?.items ?? [])
    .filter((outcome) => outcome.relevance.viewerDate === feed.date)
    .map((outcome) => ({
    id: outcome.id,
    title: outcome.title,
    summary: outcome.summary,
    occurredAt: outcome.occurredAt,
    evidenceRoute: outcome.evidence.canonicalRoute,
    affectedLabel: outcome.affectedObjects.length ? `${outcome.affectedObjects.length} affected ${outcome.affectedObjects.length === 1 ? "record" : "records"}` : undefined,
    context: { kind: "assistant_run", id: outcome.evidence.runId, title: outcome.title },
    }));
  const legacyOutcomes: TodayOutcomeView[] = feed.assistantActivity
    .filter(({ run }) => Boolean(run.resultText?.trim()) && run.state === "finished")
    .map(({ scheduleName, run, project }) => ({
      id: run.id,
      title: scheduleName,
      summary: run.resultText!.trim(),
      occurredAt: run.finishedAt ?? run.claimedAt,
      evidenceRoute: `/settings/schedules/${encodeURIComponent(run.scheduleId)}/runs/${encodeURIComponent(run.id)}`,
      affectedLabel: project?.title,
      context: { kind: "assistant_run", id: run.id, title: scheduleName },
    }));
  const outcomes = feed.outcomes ? typedOutcomes : legacyOutcomes;
  return {
    active,
    upcoming,
    attention,
    schedule,
    attentionTotal: (workProjection?.current?.totalCount ?? feed.dueCommitments.length) + (workProjection?.attention?.totalCount ?? attentionEntries.length) + elapsedLife.length,
    attentionWorkTotal: (workProjection?.current?.totalCount ?? feed.dueCommitments.length) + (workProjection?.attention?.totalCount ?? attentionEntries.length),
    attentionLifeTotal: elapsedLife.length,
    futureWorkTotal: feed.work?.future.totalCount ?? 0,
    completed,
    outcomes,
    outcomesTotal: feed.outcomes?.totalCount ?? outcomes.length,
    outcomesClipped: feed.outcomes?.clipped ?? false,
    outcomesViewAllRoute: feed.outcomes?.viewAllRoute ?? "/settings/schedules",
    completedWorkTotal: feed.work?.settled.totalCount ?? settledWork.length,
    completedWorkLoaded: feed.work?.settled.items.length ?? settledWork.length,
    completedWorkClipped: feed.work?.settled.clipped ?? false,
    completedCalendarLoaded: calendar.filter((item) => item.completed).length,
    completedCalendarKnownTotal: feed.sources.calendar.state === "ok" ? calendar.filter((item) => item.completed).length : undefined,
    completedCalendarClipped: feed.sources.calendar.state === "partial",
    lifeDayTotal: overview?.day?.totalCount ?? selectedLifeMoments.length,
    lifeDayVisible: selectedLifeMoments.length,
    lifeDayClipped: overview?.day?.clipped ?? false,
  };
}

function todayConflicts(feed: LifeTodayFeed): TodayConflict[] {
  const events = feed.calendar.filter((event) => event.status !== "cancelled" && event.availability === "busy" && !event.allDay && event.start.kind === "dateTime" && event.end.kind === "dateTime") as Array<CalendarEvent & { start: { kind: "dateTime"; instant: string; timeZone: string }; end: { kind: "dateTime"; instant: string; timeZone: string } }>;
  const conflicts: TodayConflict[] = [];
  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    const left = events[leftIndex];
    const leftStart = Date.parse(left.start.instant), leftEnd = Date.parse(left.end.instant);
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const right = events[rightIndex];
      const rightStart = Date.parse(right.start.instant), rightEnd = Date.parse(right.end.instant);
      if (leftStart >= rightEnd || rightStart >= leftEnd) continue;
      conflicts.push({
        id: `events:${left.calendarId}:${left.eventId}:${right.calendarId}:${right.eventId}`,
        title: `${left.title} overlaps ${right.title}`,
        detail: `${clockTime(left.start.instant, feed.viewerTimeZone)} and ${clockTime(right.start.instant, feed.viewerTimeZone)} Calendar starts overlap.`,
        destinations: [{ label: `Open ${left.title}`, href: `/calendar/event/${encodeURIComponent(left.calendarId)}/${encodeURIComponent(left.eventId)}` }, { label: `Open ${right.title}`, href: `/calendar/event/${encodeURIComponent(right.calendarId)}/${encodeURIComponent(right.eventId)}` }],
      });
    }
    for (const item of feed.dueCommitments) {
      if (!item.dueAt) continue;
      const due = Date.parse(item.dueAt);
      if (due < leftStart || due >= leftEnd) continue;
      conflicts.push({
        id: `work:${left.calendarId}:${left.eventId}:${item.id}`,
        title: `${item.title} is due during ${left.title}`,
        detail: `The Work due time falls inside this Calendar event. No reschedule has been proposed or applied.`,
        destinations: [{ label: "Open Calendar event", href: `/calendar/event/${encodeURIComponent(left.calendarId)}/${encodeURIComponent(left.eventId)}` }, { label: "Open Work item", href: `/work/tasks/${encodeURIComponent(item.id)}` }],
      });
    }
  }
  return conflicts;
}

function calendarMoment(event: CalendarEvent, timeZone: string, now: number): TodayMoment {
  // Plain-date events do not represent UTC instants. Today already receives a
  // viewer-day-bounded Calendar projection, so noon UTC is only a stable sort
  // key and cannot shift the record into an adjacent viewer date.
  const start = event.start.kind === "dateTime" ? Date.parse(event.start.instant) : Date.parse(`${event.start.date}T12:00:00Z`);
  const end = event.end.kind === "dateTime" ? Date.parse(event.end.instant) : start;
  const active = event.status !== "cancelled" && (event.allDay || (start <= now && end > now));
  const completed = event.status === "cancelled" || (!event.allDay && end <= now);
  const qualification = event.syncState === "stale"
    ? `Last confirmed${event.lastSyncedAt ? ` ${dateTime(event.lastSyncedAt, timeZone)}` : ""}`
    : event.status === "tentative" ? "Tentative" : event.providerId === "kora" ? "Kora calendar" : "Connected calendar";
  return {
    id: `calendar:${event.calendarId}:${event.eventId}`,
    source: "Calendar",
    title: event.title,
    detail: event.location ?? (event.allDay ? "All-day Calendar event" : event.availability === "free" ? "Marked free" : "Scheduled time"),
    destination: `/calendar/event/${encodeURIComponent(event.calendarId)}/${encodeURIComponent(event.eventId)}`,
    timeLabel: event.allDay ? "All day" : clockTime(event.start.kind === "dateTime" ? event.start.instant : `${event.start.date}T12:00:00Z`, timeZone, event.start.kind === "dateTime" && event.end.kind === "dateTime" && zoneAbbreviation(event.start.instant, timeZone) !== zoneAbbreviation(event.end.instant, timeZone)),
    sortAt: start,
    active,
    completed,
    terminalState: event.status === "cancelled" ? "cancelled" : completed ? "completed" : undefined,
    qualification,
  };
}

function workMoment(item: WorkItem, timeZone: string, now: number, destination = `/work/tasks/${encodeURIComponent(item.id)}`, attentionOnly = false, attentionInstant?: string): TodayMoment {
  const due = item.dueAt ? Date.parse(item.dueAt) : Number.POSITIVE_INFINITY;
  const reviewAt = attentionInstant ?? item.attentionAt;
  const dueReason = item.kind === "task"
    ? "Task due for review"
    : item.commitmentDirection === "owed_to_user" ? "Owed to you" : "Commitment you owe";
  return {
    id: `work:${item.id}`,
    source: "Work",
    title: item.title,
    detail: attentionOnly ? `Review ${item.kind === "task" ? "this task" : "this Work commitment"}` : dueReason,
    destination,
    timeLabel: attentionOnly
      ? `Review · ${reviewAt ? dateTime(reviewAt, timeZone) : Number.isFinite(due) ? dateTime(item.dueAt!, timeZone) : "Today"}`
      : Number.isFinite(due) ? due < now ? `Overdue · ${dateTime(item.dueAt!, timeZone)}` : `Due ${dateTime(item.dueAt!, timeZone)}` : "Due time unavailable",
    sortAt: attentionOnly && reviewAt ? Date.parse(reviewAt) : due,
    qualification: item.state === "blocked" ? "Blocked" : "Private Work record",
    context: { kind: "work_item", id: item.id, title: item.title },
    workKind: item.kind,
    // Native Work permits no-summary completion only for Tasks. Commitments,
    // milestones, and outcomes remain canonical links because their owner
    // requires additional result evidence before completing them.
    workItem: item.kind === "task" ? item : undefined,
    attentionOnly,
  };
}

function lifeMoment(item: LifeOverviewMoment, sources: LifeOverviewSource[], timeZone: string): TodayMoment {
  const meta = DOMAIN_META[item.domain];
  const source = sources.find((candidate) => candidate.id === item.sourceId);
  const timestamp = Date.parse(item.horizon);
  return {
    id: `life:${item.domain}:${item.id}`,
    source: meta.label,
    title: item.title,
    detail: item.explanation,
    destination: item.destination,
    timeLabel: Number.isFinite(timestamp) ? dateTime(item.horizon, timeZone) : item.horizon,
    sortAt: Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER,
    qualification: sourceQualification(source, item.sourceFreshness, timeZone),
  };
}

function dedupeLifeMoments(overview: LifeOverview) {
  const seen = new Set<string>();
  const result: LifeOverviewMoment[] = [];
  const projection = overview.day?.items ?? [overview.rightNow, ...overview.next];
  for (const item of projection) {
    if (!item || seen.has(item.id)) continue;
    const source = overview.sources.find((candidate) => candidate.id === item.sourceId);
    if (source?.state === "unavailable" || source?.state === "not_configured") continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function selectTodayLifeMoments(overview: LifeOverview, date: string, timeZone: string) {
  return dedupeLifeMoments(overview).filter((item) => {
    const timestamp = Date.parse(item.horizon);
    if (!Number.isFinite(timestamp) || plainDateAt(item.horizon, timeZone) !== date) return false;
    return true;
  });
}

type SourceRow = { label: string; state: "current" | "refreshing" | "partial" | "stale" | "offline" | "unavailable" | "not_configured" | "restricted" | "loading"; detail: string };

function sourceRows(feed: LifeTodayFeed, overview: LifeOverview | undefined, lifeLoading: boolean, lifeError: boolean, offline = false, refreshing = false, feedError = false): SourceRow[] {
  const rows: SourceRow[] = [
    offline
      ? { label: "Connected Calendar refresh", state: "offline", detail: "Refresh is paused. Local Work and local Calendar moments remain usable; provider moments are last-confirmed." }
      : refreshing
        ? { label: "Calendar", state: "refreshing", detail: "Rechecking connected freshness. Existing local and last-confirmed moments remain visible." }
      : feedSourceRow("Calendar", feed.sources.calendar, feed.calendar.some((event) => event.syncState === "stale"), feedError),
    feedSourceRow("Work", feed.sources.native_work, false, feedError),
    feedSourceRow("Approvals", feed.sources.confirmations, false, feedError),
    feedSourceRow("Kora outcomes", feed.sources.schedules, false, feedError),
  ];
  if (overview) rows.push(...overview.sources.map((source) => lifeSourceRow(source, refreshing, lifeError, feed.viewerTimeZone)));
  else if (lifeLoading) rows.push({ label: "Money, Wellbeing, and About You", state: "loading", detail: "Checking the qualified Life projection." });
  else if (lifeError) rows.push({ label: "Money, Wellbeing, and About You", state: "unavailable", detail: "The Life summary could not be read; open each relevant area for its saved state." });
  if (overview?.day?.clipped) rows.push({ label: "Life day projection", state: "partial", detail: `Showing ${overview.day.items.length} of ${overview.day.totalCount} time-bound Life moments; open Life for the complete bounded projection.` });
  if (overview?.restrictedOmitted) rows.push({ label: "Restricted personal context", state: "restricted", detail: "Titles, values, categories, and counts remain omitted." });
  return rows;
}

function feedSourceRow(label: string, source: LifeSourceState, stale = false, readError = false): SourceRow {
  if (readError) return { label, state: "stale", detail: "Latest refresh failed; last-confirmed source data remains visible." };
  if (stale) return { label, state: "stale", detail: "Last-confirmed source data remains visible; inspect individual timestamps for the established observation." };
  if (source.state === "ok") return { label, state: "current", detail: "The source completed for this feed." };
  if (source.state === "partial") { const reason = source.reason; const unavailable = source.unavailableSources.length ? `Unavailable: ${source.unavailableSources.join(", ")}.` : "Some source records are unavailable."; return { label, state: "partial", detail: `${reason ? `${reason} ` : ""}${unavailable}` }; }
  return { label, state: "unavailable", detail: source.reason ?? "The source could not be read." };
}

function lifeSourceRow(source: LifeOverviewSource, refreshing = false, readError = false, timeZone?: string): SourceRow {
  return {
    label: source.label,
    state: readError ? "stale" : refreshing && source.state === "current" ? "refreshing" : source.state,
    detail: readError
      ? `Last confirmed${source.lastSuccessfulRead ? ` ${compactMomentTime(source.lastSuccessfulRead, timeZone)}` : ""}; refresh failed.`
      : refreshing && source.state === "current"
      ? `Checking ${source.authority}; the last saved value remains visible meanwhile.`
      : source.state === "current"
      ? `${source.authority}${source.lastSuccessfulRead ? ` · Updated ${compactMomentTime(source.lastSuccessfulRead, timeZone)}` : ""}`
      : source.limitation ?? (source.state === "not_configured" ? "No source has been set up." : "Open the relevant area for coverage details."),
  };
}

function sourceAttention(feed: LifeTodayFeed, overview?: LifeOverview, lifeError = false, feedError = false) {
  return Object.values(feed.sources).some((source) => source.state !== "ok")
    || feed.calendar.some((event) => event.syncState === "stale")
    || Boolean(overview && (overview.status === "partial" || overview.status === "unavailable" || overview.restrictedOmitted))
    || Boolean(overview?.day?.clipped)
    || lifeError
    || feedError;
}

function coverageStripState(rows: SourceRow[]) {
  if (rows.some((row) => row.state === "unavailable" || row.state === "restricted")) return "unavailable" as const;
  if (rows.some((row) => row.state === "partial" || row.state === "offline")) return "partial" as const;
  if (rows.some((row) => row.state === "stale")) return "stale" as const;
  if (rows.some((row) => row.state === "loading" || row.state === "refreshing")) return "loading" as const;
  if (rows.some((row) => row.state === "not_configured")) return "not_configured" as const;
  return "current" as const;
}

function coverageHeadline(feed: LifeTodayFeed, overview: LifeOverview | undefined, lifeLoading: boolean, lifeError: boolean, offline = false, refreshing = false, feedError = false) {
  if (offline) return { title: "Connected refresh is paused while Kora is offline", body: "Local Work and local Calendar moments remain usable. Connected moments are shown only when last-confirmed and labeled." };
  if (refreshing) return { title: "Today is rechecking source freshness", body: "Local content remains visible. Connected moments are not labeled current until this refresh settles." };
  const rows = sourceRows(feed, overview, lifeLoading, lifeError, offline, refreshing, feedError);
  const restricted = rows.some((row) => row.state === "restricted");
  const unavailable = rows.filter((row) => row.state === "unavailable").map((row) => row.label);
  const stale = rows.filter((row) => row.state === "stale" || row.state === "partial").map((row) => row.label);
  if (feedError) return { title: "Today is showing last-confirmed content", body: "The latest feed refresh failed. Saved moments remain visible with their previous source state; retry before treating the day as clear." };
  if (unavailable.length) return { title: "Today has partial coverage", body: `${unavailable.join(", ")} ${unavailable.length === 1 ? "is" : "are"} unavailable. Available local and last-confirmed moments remain visible.` };
  if (stale.length) return { title: "Some moments are last-confirmed", body: `${stale.join(", ")} may be incomplete. Affected moments carry their own timestamp or qualification.` };
  if (restricted) return { title: "Restricted personal context stays omitted", body: "Today does not reveal its titles, values, categories, or counts without exact approved access." };
  return { title: "Today is checking personal context", body: "Calendar, Work, and approvals remain usable while the Life projection loads." };
}

function timezoneLabel(feed: LifeTodayFeed) {
  if (feed.viewerTimeZoneAuthority.source === "profile") return feed.viewerTimeZone;
  if (feed.viewerTimeZoneAuthority.source === "system") return `${feed.viewerTimeZone} · Windows timezone`;
  return `UTC fallback${feed.viewerTimeZoneAuthority.reason ? " · configured timezone unavailable" : ""}`;
}

function sourceQualification(source: LifeOverviewSource | undefined, freshness: string, timeZone?: string) {
  const readableFreshness = Number.isFinite(Date.parse(freshness)) ? `Updated ${compactMomentTime(freshness, timeZone)}` : freshness;
  if (!source) return readableFreshness;
  if (source.state === "partial") return `Partial · ${readableFreshness}`;
  return source.state === "current" ? readableFreshness : `${source.state.replace("_", " ")} · ${readableFreshness}`;
}

function sourceStateLabel(state: SourceRow["state"]) {
  if (state === "not_configured") return "Not set up";
  if (state === "stale") return "Last confirmed";
  if (state === "offline") return "Offline";
  if (state === "refreshing") return "Refreshing";
  return state[0].toUpperCase() + state.slice(1);
}

function countLabel(shown: number, total: number) {
  return total > shown ? `${shown} shown · ${total} total` : String(total);
}

function todayAskDraft(feed: LifeTodayFeed) {
  return `Review Today for ${feed.date} in ${feed.viewerTimeZone}. Inspect the current Calendar, Work, Life, and approval state, then explain what needs attention before suggesting any changes.`;
}

function restoreActionFocus(target: { trigger: HTMLElement; nextId?: string; sectionId?: string } | undefined, failed: boolean) {
  if (!target) return;
  if (failed && target.trigger.isConnected) {
    target.trigger.focus({ preventScroll: true });
    return;
  }
  const next = target.nextId
    ? [...document.querySelectorAll<HTMLElement>("[data-today-moment-id]")].find((candidate) => candidate.dataset.todayMomentId === target.nextId)
    : undefined;
  if (next) {
    next.focus({ preventScroll: true });
    return;
  }
  const heading = target.sectionId ? document.getElementById(target.sectionId) : undefined;
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  } else if (target.trigger.isConnected) target.trigger.focus({ preventScroll: true });
}

function riskLabel(risk: LifeTodayFeed["pendingConfirmations"][number]["presentation"]["risk"]) {
  return risk === "high_risk_local" ? "High-risk local change" : `${risk[0].toUpperCase()}${risk.slice(1)} change`;
}

function clockTime(value: string, timeZone: string, includeZone = false) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone, ...(includeZone ? { timeZoneName: "short" as const } : {}) }).format(new Date(value));
}

function zoneAbbreviation(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date(value)).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

function dateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

function compactMomentTime(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date);
}

function formatPlainDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function plainDateAt(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}
