import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { Activity, CalendarRange, Database, EyeOff, Layers3, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AccessibleTimeSeriesChart,
  Badge,
  Button,
  CheckboxChoice,
  Field,
  Input,
  KoraSelect,
  PageHeader,
  SegmentedControl,
  Sheet,
  ContentState,
} from "../../components/primitives";
import {
  runtime,
  type ConversationContextReference,
  type WellbeingTrendEvidencePage,
  type WellbeingTrendMetricCatalog,
  type WellbeingTrendRangeKey,
  type WellbeingTrendResult,
  type WellbeingRecord,
  type WellbeingRecordRevision,
} from "../../lib/runtime";
import { WellbeingFrame } from "./WellbeingNavigation";
import { useWellbeingReturnContext, wellbeingRecordReturnId } from "./wellbeing-return-context";
import "./wellbeing-trends.css";

export type WellbeingTrendsLoaders = {
  metrics: () => Promise<WellbeingTrendMetricCatalog>;
  trend: (input: {
    metricKey: string;
    range: WellbeingTrendRangeKey;
    customStart?: string;
    customEnd?: string;
    overlayKeys?: string[];
  }) => Promise<WellbeingTrendResult>;
  evidence: (input: {
    metricKey: string;
    range: WellbeingTrendRangeKey;
    evidenceHandle: string;
    customStart?: string;
    customEnd?: string;
    overlayKeys?: string[];
    pageSize?: number;
    cursor?: string;
  }) => Promise<WellbeingTrendEvidencePage>;
  read?: (id: string) => Promise<{ record: WellbeingRecord; history: WellbeingRecordRevision[] }>;
};

const defaultLoaders: WellbeingTrendsLoaders = {
  metrics: runtime.wellbeingTrendMetrics,
  trend: runtime.wellbeingTrend,
  evidence: runtime.wellbeingTrendEvidence,
  read: runtime.wellbeingRecord,
};

const RANGES: Array<{ value: WellbeingTrendRangeKey; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "3m", label: "3m" },
  { value: "6m", label: "6m" },
  { value: "1y", label: "1y" },
  { value: "custom", label: "Custom" },
];
const RANGE_KEYS = new Set(RANGES.map((range) => range.value));

function dateLabel(instant: string, timeZone: string, withTime = false) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    }).format(new Date(instant));
  } catch {
    return instant;
  }
}

function metricLabel(metric: { metric: string; unit: string }) {
  return `${metric.metric} · ${metric.unit}`;
}

function TrendStateNotice({ result }: { result: WellbeingTrendResult }) {
  if (result.status === "unavailable" || result.status === "metric_unavailable") return null;
  const interval = result.missingSpans.length || result.outageAnnotations.length
    ? `${result.missingSpans.length.toLocaleString()} explicit missing ${result.missingSpans.length === 1 ? "span" : "spans"} and ${result.outageAnnotations.length.toLocaleString()} source ${result.outageAnnotations.length === 1 ? "outage" : "outages"} are shown as breaks, never connected lines.`
    : "";
  if (result.status === "sufficient_no_supported_pattern") {
    return <div className="wellbeing-trends__healthy-context">
      <p className="wellbeing-trends__healthy-summary" data-domain-state={result.status} role="status"><Activity size={16} aria-hidden="true" /><span>{result.seriesQualification.exactRecordCount.toLocaleString()} readings · {result.seriesQualification.recordedDayCount.toLocaleString()} days</span></p>
      {interval ? <p className="wellbeing-trends__interval-summary" role="note"><TriangleAlert size={15} aria-hidden="true" /><span>{interval}</span></p> : null}
    </div>;
  }
  const baseline = result.baseline.qualification === "qualified"
    ? `Personal recorded baseline: ${result.baseline.exactRecordCount.toLocaleString()} preceding records across ${result.baseline.recordedDayCount.toLocaleString()} days; this is not a healthy range.`
    : `No personal recorded baseline is shown: ${result.baseline.reason}`;
  const intervalQualification = interval ? ` ${interval}` : "";
  const copy = result.status === "no_records"
    ? ["No records in this range", `${result.seriesQualification.reason} ${baseline}`]
    : result.status === "insufficient"
      ? ["More recorded days are needed", `${result.seriesQualification.reason}${result.seriesQualification.requiredRecords !== undefined && result.seriesQualification.requiredDays !== undefined ? ` The metric-specific display threshold is ${result.seriesQualification.requiredRecords} records across ${result.seriesQualification.requiredDays} days.` : ""} ${baseline}`]
      : ["This view is partial", `${result.seriesQualification.reason}${intervalQualification} ${baseline}`];
  return <ContentState
    size="inline"
    state={result.status === "no_records" ? "empty" : result.status === "insufficient" || result.status === "partial" ? "partial" : "success"}
    data-domain-state={result.status}
    announcement="polite"
    aria-atomic="true"
    icon={<Activity size={17} />}
    title={copy[0]}
    body={copy[1]}
  />;
}

function EvidenceSheet({
  open,
  handle,
  title,
  metricKey,
  range,
  customStart,
  customEnd,
  overlayKeys,
  loaders,
  finalFocus,
  onClose,
  onOpenRecord,
  onReturnTargetSettled,
}: {
  open: boolean;
  handle: string;
  title: string;
  metricKey: string;
  range: WellbeingTrendRangeKey;
  customStart?: string;
  customEnd?: string;
  overlayKeys: string[];
  loaders: WellbeingTrendsLoaders;
  finalFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenRecord: (id: string) => void;
  onReturnTargetSettled?: () => void;
}) {
  const evidence = useInfiniteQuery({
    queryKey: ["wellbeing", "trends", "evidence", metricKey, range, customStart, customEnd, overlayKeys, handle],
    enabled: open && Boolean(handle && metricKey),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => loaders.evidence({ metricKey, range, evidenceHandle: handle, customStart, customEnd, overlayKeys, pageSize: 50, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.cursor,
    retry: false,
  });
  const ids = [...new Set(evidence.data?.pages.flatMap((page) => page.recordIds) ?? [])];
  const total = evidence.data?.pages[0]?.totalExactRecords;
  const recordQueries = useQueries({
    queries: loaders.read
      ? ids.map((id) => ({
        queryKey: ["wellbeing", "trends", "evidence-record", id],
        queryFn: () => loaders.read!(id),
        enabled: open,
        retry: false,
      }))
      : [],
  });
  const recordRows = ids.map((id, index) => ({
    id,
    detail: recordQueries[index]?.data,
    pending: Boolean(recordQueries[index]?.isPending),
  }));
  const detailsPending = recordRows.some((row) => row.pending);
  const visibleRows = recordRows.filter((row) => row.detail?.record.privacy !== "restricted" && !row.pending);
  const restrictedOmitted = recordRows.some((row) => row.detail?.record.privacy === "restricted");
  const loadedPages = Boolean(evidence.data?.pages.length);
  const nextPageError = Boolean(evidence.isFetchNextPageError);
  useEffect(() => {
    if (!open || evidence.isLoading || detailsPending) return;
    onReturnTargetSettled?.();
  }, [detailsPending, evidence.isLoading, ids.length, onReturnTargetSettled, open]);
  return <Sheet
    open={open}
    onOpenChange={(next) => { if (!next) onClose(); }}
    title={title || "Trend evidence"}
    description="Permitted saved records behind this presentation. Restricted record content is not exposed here."
    purpose="inspector"
    finalFocus={finalFocus}
    className="wellbeing-trends-evidence"
  >
    {evidence.isLoading && !loadedPages ? <div className="wellbeing-trends-evidence__loading" role="status">Loading saved evidence…</div> : evidence.isError && !loadedPages ? <div className="wellbeing-trends-evidence__error" role="alert"><strong>Evidence unavailable</strong><span>{evidence.error instanceof Error ? evidence.error.message : "The saved evidence page could not be read."}</span><Button tone="secondary" onClick={() => void evidence.refetch()}>Retry evidence</Button></div> : <>
      {nextPageError ? <div className="wellbeing-trends-evidence__warning" role="alert"><strong>More evidence could not be loaded</strong><span>The records already shown remain available. Retry the same next page to continue this evidence set.</span></div> : null}
      <div className="wellbeing-trends-evidence__summary"><strong>{typeof total === "number" ? total.toLocaleString() : "—"}</strong><span>saved {total === 1 ? "record" : "records"}</span></div>
      {restrictedOmitted ? <p className="wellbeing-trends-evidence__complete">Restricted record details remain omitted.</p> : null}
      {detailsPending ? <div className="wellbeing-trends-evidence__loading" role="status">Reading permitted record details…</div> : null}
      <ol className="wellbeing-trends-evidence__list" aria-label="Permitted saved evidence records">
        {visibleRows.map((row) => <li key={row.id}>
          <Button tone="link" data-row-return-id={wellbeingRecordReturnId(row.id)} onClick={() => onOpenRecord(row.id)}>{row.detail?.record.title ?? "Open saved record details"}</Button>
          {row.detail?.record ? <small>{row.detail.record.kind.replaceAll("_", " ")} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.detail.record.recordedAt))}</small> : null}
        </li>)}
      </ol>
      {!detailsPending && !visibleRows.length && ids.length ? <p className="wellbeing-trends-evidence__complete">No permitted record details are available for the loaded evidence.</p> : null}
      {evidence.hasNextPage || nextPageError ? <Button tone="secondary" loading={evidence.isFetchingNextPage} onClick={() => void evidence.fetchNextPage()}>{nextPageError ? "Retry next page" : "Load more records"}</Button> : ids.length ? <p className="wellbeing-trends-evidence__complete">All permitted records for this evidence are loaded.</p> : null}
    </>}
  </Sheet>;
}

export function WellbeingTrendsWorkspace({
  loaders = defaultLoaders,
  onAskKora,
}: {
  loaders?: WellbeingTrendsLoaders;
  onAskKora?: (references: ConversationContextReference[], draft?: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [metricSearch, setMetricSearch] = useState("");
  const [recoveryAnnouncement, setRecoveryAnnouncement] = useState("");
  const workspaceRef = useRef<HTMLElement | null>(null);
  const metricSearchRef = useRef<HTMLInputElement | null>(null);
  const metricSearchTriggerRef = useRef<HTMLElement | null>(null);
  const recoveryPending = useRef<"catalog" | "trend" | null>(null);
  const evidenceOrigin = useRef<HTMLElement | null>(null);
  const evidenceOriginKey = useRef<{ kind: "chart" | "overlay"; key: string } | null>(null);
  const evidenceOpenedHere = useRef(false);
  const metricKey = params.get("metric") ?? "";
  const requestedRange = params.get("range") as WellbeingTrendRangeKey | null;
  const range = requestedRange && RANGE_KEYS.has(requestedRange) ? requestedRange : "30d";
  const customStart = params.get("start") ?? undefined;
  const customEnd = params.get("end") ?? undefined;
  const customReady = range !== "custom" || Boolean(customStart && customEnd);
  const overlayKeys = [...new Set(params.getAll("overlay"))].slice(0, 20);
  const evidenceHandle = params.get("evidence") ?? "";
  const pointId = params.get("point") ?? undefined;
  const [overlaySearch, setOverlaySearch] = useState("");
  const [showAllOverlays, setShowAllOverlays] = useState(false);

  const resolveEvidenceOrigin = useCallback(() => {
    const key = evidenceOriginKey.current;
    const owner = workspaceRef.current;
    if (!key || !owner) return undefined;
    return [...owner.querySelectorAll<HTMLElement>("[data-chart-evidence-id], [data-overlay-evidence-key]")]
      .find((candidate) => key.kind === "chart"
        ? candidate.dataset.chartEvidenceId === key.key
        : candidate.dataset.overlayEvidenceKey === key.key);
  }, []);

  const resolveReturnTarget = useCallback((targetId: string) => {
    const owner = document.querySelector<HTMLElement>(".wellbeing-trends-evidence");
    return [...(owner?.querySelectorAll<HTMLElement>("[data-row-return-id]") ?? [])]
      .find((candidate) => candidate.dataset.rowReturnId === targetId);
  }, []);

  const catalog = useQuery({ queryKey: ["wellbeing", "trends", "metrics"], queryFn: loaders.metrics, retry: false });
  const catalogMetrics = catalog.data?.metrics ?? [];
  const selectedMetric = catalogMetrics.find((metric) => metric.key === metricKey);

  const commit = (mutate: (next: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace });
  };

  useEffect(() => {
    if (requestedRange && RANGE_KEYS.has(requestedRange)) return;
    commit((next) => next.set("range", "30d"), true);
  // URL normalization intentionally follows external back/forward state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRange]);

  useEffect(() => {
    if (!catalog.data || metricKey || !catalogMetrics[0]) return;
    commit((next) => next.set("metric", catalogMetrics[0]!.key), true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data, catalogMetrics, metricKey]);

  const trend = useQuery({
    queryKey: ["wellbeing", "trends", metricKey, range, customStart, customEnd, overlayKeys],
    enabled: catalog.isSuccess && Boolean(selectedMetric) && customReady,
    queryFn: () => loaders.trend({ metricKey, range, customStart, customEnd, overlayKeys }),
    retry: false,
  });
  const responseMatchesRequest = Boolean(trend.data
    && (trend.data.metric?.key === metricKey || (trend.data.status === "metric_unavailable" && !trend.data.metric))
    && trend.data.range.key === range
    && (range !== "custom" || (trend.data.range.startDate === customStart && trend.data.range.endDate === customEnd)));
  const result = responseMatchesRequest ? trend.data : undefined;
  const visibleMetrics = useMemo(() => {
    const query = metricSearch.trim().toLocaleLowerCase();
    const values = query ? catalogMetrics.filter((metric) => metricLabel(metric).toLocaleLowerCase().includes(query)) : catalogMetrics;
    if (metricKey && !values.some((metric) => metric.key === metricKey))
      return [{ key: metricKey, metric: "Unavailable metric", unit: "Selection retained", visibleRecordCount: 0, firstRecordedAt: "", lastRecordedAt: "", sources: [] }, ...values];
    return values;
  }, [catalogMetrics, metricKey, metricSearch]);

  const openEvidence = (handle: string, selectedPointId?: string, originKey?: { kind: "chart" | "overlay"; key: string }) => {
    evidenceOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    evidenceOriginKey.current = originKey ?? (selectedPointId ? { kind: "chart", key: selectedPointId } : handle.startsWith("overlay:") ? { kind: "overlay", key: handle.slice("overlay:".length) } : null);
    evidenceOpenedHere.current = true;
    commit((next) => {
      next.set("evidence", handle);
      if (selectedPointId) next.set("point", selectedPointId);
      else next.delete("point");
    });
  };
  const closeEvidence = () => {
    evidenceOrigin.current = resolveEvidenceOrigin() ?? evidenceOrigin.current;
    if (evidenceOpenedHere.current) {
      evidenceOpenedHere.current = false;
      navigate(-1);
      return;
    }
    commit((next) => { next.delete("evidence"); next.delete("point"); }, true);
  };

  const resultUnavailable = result?.status === "unavailable" || result?.status === "metric_unavailable";
  const analyticalResult = result && !resultUnavailable ? result : undefined;
  const points = analyticalResult?.points.map((point) => ({
    id: point.id,
    time: point.time,
    timeLabel: dateLabel(point.time, analyticalResult.viewerTimeZone, true),
    value: point.value,
    valueLabel: `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(point.value)} ${point.unit}`,
    label: point.mode === "aggregated" ? `${point.exactRecordCount.toLocaleString()} saved records · arithmetic mean` : "Saved measurement",
    source: point.sourceLabels.join(", ") || "Source not named",
    evidence: { label: point.evidenceComplete ? "Open record" : `Open ${point.exactRecordCount.toLocaleString()} records`, onActivate: (selectedPointId: string) => openEvidence(point.evidenceHandle, selectedPointId) },
  })) ?? [];
  const eventMarkers = analyticalResult?.selectedOverlays.items.map((item) => ({ id: item.id, time: item.time, label: item.label })) ?? [];
  const missingSpans = analyticalResult?.missingSpans.map((span) => ({ id: span.id, startTime: span.start, endTime: span.end, label: span.label })) ?? [];
  const outages = analyticalResult?.outageAnnotations.map((outage) => ({ id: outage.id, startTime: outage.start, endTime: outage.end, label: outage.label, source: outage.source.label })) ?? [];
  const evidenceTitle = result?.points.find((point) => point.evidenceHandle === evidenceHandle)
    ? "Measurement evidence"
    : result?.overlayCatalog.items.find((item) => item.evidenceHandle === evidenceHandle)?.label ?? "Trend evidence";
  const customIncomplete = range === "custom" && !customReady;
  const requestMismatch = Boolean(trend.data && !responseMatchesRequest);
  const wellbeingReturn = useWellbeingReturnContext({
    ready: Boolean(trend.data && responseMatchesRequest),
    rootSelector: ".wellbeing-trends-workspace",
    fallbackRef: evidenceOrigin,
    restoreKey: `${metricKey}:${range}:${customStart ?? ""}:${customEnd ?? ""}:${overlayKeys.join(",")}:${pointId ?? ""}`,
    waitForTarget: Boolean(evidenceHandle),
    resolveTarget: resolveReturnTarget,
  });
  const settleEvidenceReturn = useCallback(() => {
    if (wellbeingReturn.returnTargetId) wellbeingReturn.settleReturnFocus();
  }, [wellbeingReturn.returnTargetId, wellbeingReturn.settleReturnFocus]);
  useEffect(() => {
    if (!evidenceHandle || evidenceOrigin.current?.isConnected) return;
    if (!evidenceOriginKey.current) evidenceOriginKey.current = pointId
      ? { kind: "chart", key: pointId }
      : evidenceHandle.startsWith("overlay:")
        ? { kind: "overlay", key: evidenceHandle.slice("overlay:".length) }
        : null;
    if (!evidenceOriginKey.current) return;
    evidenceOrigin.current = resolveEvidenceOrigin() ?? null;
  }, [evidenceHandle, metricKey, pointId, resolveEvidenceOrigin, selectedMetric, overlayKeys]);
  const openRecord = (id: string) => {
    wellbeingReturn.rememberAndOpen(`/life/wellbeing/records?record=${encodeURIComponent(id)}`, wellbeingRecordReturnId(id));
  };
  const chartState = customIncomplete
    ? "ready"
    : trend.isError || requestMismatch
      ? "unavailable"
      : trend.isLoading || !result
        ? "loading"
        : result.status === "unavailable" || result.status === "metric_unavailable"
          ? "unavailable"
          : "ready";
  const chartTitle = customIncomplete
    ? "Complete the custom range"
    : trend.isError
      ? "Trend could not be loaded"
      : requestMismatch
        ? "Trend response did not match this selection"
        : result?.status === "metric_unavailable"
          ? "Metric unavailable"
          : chartState === "loading"
            ? "Loading saved measurements"
            : result?.status === "unavailable"
              ? "Trend unavailable"
              : result?.status === "no_records"
                ? "No records in this range"
                : undefined;
  const chartBody = customIncomplete
    ? "Choose both From and Through dates. No earlier range is shown under this selection."
    : trend.isError
      ? trend.error instanceof Error ? trend.error.message : "The selected trend request failed."
      : requestMismatch
        ? "The returned metric or range was different, so Kora withheld the analytical presentation."
      : result?.seriesQualification.reason ?? "Loading qualified measurement history.";
  const suppressAnalytics = catalog.isError || Boolean(catalog.data && !catalogMetrics.length);
  const retryTrendAction = trend.isError || requestMismatch || result?.status === "unavailable"
    ? <div className="wellbeing-trends__recovery"><Button tone="secondary" loading={trend.isFetching} onClick={() => { recoveryPending.current = "trend"; setRecoveryAnnouncement(""); void trend.refetch(); }}>Retry trend</Button></div>
    : undefined;

  useEffect(() => {
    const owner = recoveryPending.current;
    if (!owner || catalog.isFetching || catalog.isError || trend.isFetching || trend.isError || requestMismatch) return;
    if (!catalog.isSuccess) return;
    if (selectedMetric && customReady && !result) return;
    const target = workspaceRef.current?.querySelector<HTMLElement>('[role="slider"]') ?? metricSearchTriggerRef.current;
    target?.focus();
    setRecoveryAnnouncement(owner === "catalog" ? "Measurement metrics recovered." : `Trend recovered${selectedMetric ? ` for ${selectedMetric.metric}` : ""}.`);
    recoveryPending.current = null;
  }, [catalog.isError, catalog.isFetching, catalog.isSuccess, customReady, requestMismatch, result, selectedMetric, trend.isError, trend.isFetching]);

  const overlayItems = analyticalResult?.overlayCatalog.items ?? [];
  const overlayCatalog = analyticalResult?.overlayCatalog;
  const overlaySearchQuery = overlaySearch.trim();
  const filteredOverlayItems = useMemo(() => {
    const query = overlaySearch.trim().toLocaleLowerCase();
    return query ? overlayItems.filter((item) => item.label.toLocaleLowerCase().includes(query)) : overlayItems;
  }, [overlayItems, overlaySearch]);
  const visibleOverlayItems = showAllOverlays ? filteredOverlayItems : filteredOverlayItems.slice(0, 8);
  const overlayBoundary = overlaySearchQuery
    ? `Showing ${visibleOverlayItems.length.toLocaleString()} of ${filteredOverlayItems.length.toLocaleString()} matching context choices.`
    : `Showing ${visibleOverlayItems.length.toLocaleString()} of ${filteredOverlayItems.length.toLocaleString()} context choices.`;
  const overlayCatalogQualification = overlayCatalog && !overlayCatalog.complete
    ? ` ${overlayItems.length.toLocaleString()} of ${overlayCatalog.totalItems.toLocaleString()} available context choices are loaded from a bounded catalog.`
    : "";

  return <section className="wellbeing-trends-workspace" ref={workspaceRef}>
    <WellbeingFrame>
      <PageHeader title="Trends" description="Your saved measurements, over time." status={<><span>Private by default · Trends</span>{trend.isFetching && result ? <><span aria-hidden="true">·</span><span>Refreshing qualified history…</span></> : null}</>} />

      <section className="wellbeing-trends__primary-panel" aria-labelledby="trend-primary-title">
        <h2 id="trend-primary-title" className="sr-only">Saved measurement trend</h2>
        <div className="wellbeing-trends__command" role="group" aria-label="Trend controls">
          <div className="wellbeing-trends__metric-control">
            <div className="wellbeing-trends__metric-heading"><span className="wellbeing-trends__control-label">Metric</span><details className="wellbeing-trends__metric-search">
              <summary ref={metricSearchTriggerRef} data-wellbeing-return-fallback><Search size={16} aria-hidden="true" />Find a metric</summary>
              <Field label="Find a metric" htmlFor="wellbeing-trend-search">
                <div className="wellbeing-trends__search"><Search size={16} aria-hidden="true" /><Input ref={metricSearchRef} id="wellbeing-trend-search" value={metricSearch} onChange={(event) => setMetricSearch(event.target.value)} placeholder="Search saved measurements" /></div>
              </Field>
            </details></div>
            <KoraSelect
              label="Measurement metric"
              value={metricKey}
              disabled={catalog.isLoading || visibleMetrics.length === 0}
              options={visibleMetrics.map((metric) => ({ value: metric.key, label: metricLabel(metric), description: metric.visibleRecordCount ? `${metric.visibleRecordCount.toLocaleString()} saved ${metric.visibleRecordCount === 1 ? "record" : "records"}` : "Not in the current catalog" }))}
              onValueChange={(value) => commit((next) => { next.set("metric", value); next.delete("evidence"); next.delete("point"); })}
            />
          </div>
          <div className="wellbeing-trends__range-control">
            <span className="wellbeing-trends__control-label">Range</span>
            <div className="wellbeing-trends__range-segmented"><SegmentedControl label="Trend range" layoutId="wellbeing-trend-range" value={range} options={RANGES} onValueChange={(value) => commit((next) => { next.set("range", value); next.delete("evidence"); next.delete("point"); })} /></div>
            <div className="wellbeing-trends__range-select"><KoraSelect label="Trend range" value={range} options={RANGES} onValueChange={(value) => commit((next) => { next.set("range", value); next.delete("evidence"); next.delete("point"); })} /></div>
            {range === "custom" ? <div className="wellbeing-trends__custom-dates">
              <Field label="From" htmlFor="wellbeing-trend-start"><Input id="wellbeing-trend-start" type="date" value={customStart ?? ""} onChange={(event) => commit((next) => { if (event.target.value) next.set("start", event.target.value); else next.delete("start"); next.delete("evidence"); next.delete("point"); }, true)} /></Field>
              <Field label="Through" htmlFor="wellbeing-trend-end"><Input id="wellbeing-trend-end" type="date" value={customEnd ?? ""} onChange={(event) => commit((next) => { if (event.target.value) next.set("end", event.target.value); else next.delete("end"); next.delete("evidence"); next.delete("point"); }, true)} /></Field>
            </div> : null}
          </div>
        </div>

        {recoveryAnnouncement ? <span className="sr-only" role="status">{recoveryAnnouncement}</span> : null}
        {catalog.isError ? <div className="wellbeing-trends__catalog-error" role="alert"><strong>Measurement metrics unavailable</strong><span>{catalog.error instanceof Error ? catalog.error.message : "The metric catalog could not be read."}</span><Button tone="secondary" onClick={() => { recoveryPending.current = "catalog"; setRecoveryAnnouncement(""); void catalog.refetch(); }}>Retry metrics</Button></div> : catalog.data && !catalogMetrics.length ? <div className="wellbeing-trends__true-empty" role="status"><Database size={20} aria-hidden="true" /><div><strong>No saved measurement metrics yet</strong><span>Measurements recorded in Care will appear here. Trends does not substitute notes, symptoms, or inferred values.</span></div><Link to="/life/wellbeing/care">Open Care</Link></div> : null}

        {!suppressAnalytics && result ? <TrendStateNotice result={result} /> : null}
        {!suppressAnalytics ? <AccessibleTimeSeriesChart
        title={selectedMetric ? selectedMetric.metric : "Selected measurement"}
        description={result ? `${dateLabel(result.range.start, result.viewerTimeZone)}–${dateLabel(result.range.end, result.viewerTimeZone)} · ${result.seriesMode === "aggregated" ? "bounded arithmetic-mean presentation" : "exact presentation points"}` : "Qualified saved measurements over the selected range."}
        caption={result ? `${result.totalExactRecords.toLocaleString()} exact saved records represented by ${result.points.length.toLocaleString()} presentation points. ${result.status === "sufficient_no_supported_pattern" ? "No supported pattern claim is available." : ""}` : "Qualified trend data."}
        xAxisLabel="Recorded time"
        yAxisLabel={selectedMetric ? metricLabel(selectedMetric) : "Selected measurement"}
        formatValueTick={(value) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}${selectedMetric ? ` ${selectedMetric.unit}` : ""}`}
        points={points}
        initialSelectedId={pointId}
        baseline={analyticalResult?.baseline.qualification === "qualified" ? { qualification: "qualified", lower: analyticalResult.baseline.lower, upper: analyticalResult.baseline.upper, label: analyticalResult.baseline.label } : analyticalResult ? { qualification: "unqualified", label: analyticalResult.baseline.label, reason: analyticalResult.baseline.reason } : undefined}
        eventMarkers={eventMarkers}
        missingSpans={missingSpans}
        outages={outages}
        state={chartState}
        stateTitle={chartTitle}
        stateBody={chartBody}
        ownerAction={retryTrendAction}
        tablePageSize={50}
        tableRowCap={500}
        /> : null}
      </section>

      {!suppressAnalytics && analyticalResult ? <div className="wellbeing-trends__lower">
        <section className="wellbeing-trends__coverage" aria-labelledby="trend-coverage-title">
          <details className="wellbeing-trends__coverage-details">
            <summary className="wellbeing-trends__section-heading"><div><h2 id="trend-coverage-title">Coverage</h2><p>Source, baseline, and interval limits.</p></div><ShieldCheck size={18} aria-hidden="true" /></summary>
            <div className="wellbeing-trends__coverage-body">
              <dl>
                <div><dt>Current range</dt><dd>{analyticalResult.seriesQualification.exactRecordCount.toLocaleString()} saved records · {analyticalResult.seriesQualification.recordedDayCount.toLocaleString()} recorded days</dd></div>
                <div><dt>Display threshold</dt><dd>{analyticalResult.seriesQualification.requiredRecords !== undefined && analyticalResult.seriesQualification.requiredDays !== undefined ? `${analyticalResult.seriesQualification.requiredRecords} records across ${analyticalResult.seriesQualification.requiredDays} days` : "No policy for this exact metric and unit"} · {analyticalResult.seriesQualification.state}</dd></div>
                <div><dt>Source scope</dt><dd>{analyticalResult.sourceQualification.state} · Measurement-record series only</dd></div>
                <div><dt>Interval evidence</dt><dd>{analyticalResult.intervalCoverage.state === "explicit" ? "Supported · complete explicit intervals" : analyticalResult.intervalCoverage.state === "partial" ? "Supported · partial explicit intervals" : "Unsupported"} · {analyticalResult.intervalCoverage.reason}</dd></div>
                <div><dt>Baseline</dt><dd>{analyticalResult.baseline.qualification === "qualified" ? `${analyticalResult.baseline.exactRecordCount} preceding records across ${analyticalResult.baseline.recordedDayCount} days` : analyticalResult.baseline.reason}</dd></div>
              </dl>
              <div className="wellbeing-trends__qualifiers">
                {analyticalResult.restrictedOmitted || analyticalResult.baseline.restrictedOmitted ? <Badge tone="warning"><EyeOff size={13} aria-hidden="true" /> Restricted records omitted</Badge> : null}
                {analyticalResult.intervalCoverage.restrictedOmitted ? <Badge tone="warning"><EyeOff size={13} aria-hidden="true" /> Restricted interval evidence omitted</Badge> : null}
                {analyticalResult.excludedRecordCount || analyticalResult.baseline.excludedRecordCount ? <Badge tone="warning">Invalid values excluded · {(analyticalResult.excludedRecordCount + analyticalResult.baseline.excludedRecordCount).toLocaleString()}</Badge> : null}
                {!analyticalResult.baseline.complete ? <Badge tone="warning">Preceding window incomplete</Badge> : null}
              </div>
              <p className="wellbeing-trends__limitation">{analyticalResult.sourceQualification.limitation ?? analyticalResult.intervalCoverage.reason}</p>
              {analyticalResult.intervalCoverage.state === "partial" ? <p className="wellbeing-trends__conclusion">Interval evidence is partial; the displayed series must not be read as complete interval coverage.</p> : null}
              {analyticalResult.status === "sufficient_no_supported_pattern" ? <p className="wellbeing-trends__conclusion">No supported pattern claim · {analyticalResult.seriesQualification.reason}</p> : null}
            </div>
          </details>
        </section>

        <section className="wellbeing-trends__overlays" aria-labelledby="trend-overlays-title">
          <div className="wellbeing-trends__section-heading"><div><h2 id="trend-overlays-title">Recorded context</h2><p>Place explicit saved events on the timeline.</p></div><Layers3 size={18} aria-hidden="true" /></div>
          {overlayItems.length ? <>
            <div className="wellbeing-trends__overlay-toolbar">
              <div className="wellbeing-trends__overlay-search"><Search size={16} aria-hidden="true" /><Input aria-label="Search recorded context" value={overlaySearch} onChange={(event) => setOverlaySearch(event.target.value)} placeholder="Search saved context" /></div>
              {filteredOverlayItems.length > 8 ? <Button tone="link" onClick={() => setShowAllOverlays((current) => !current)}>{showAllOverlays ? "Show fewer context choices" : `Show all ${filteredOverlayItems.length} context choices`}</Button> : null}
            </div>
            {visibleOverlayItems.length ? <div className="wellbeing-trends__overlay-list">
              {visibleOverlayItems.map((item) => <div className="wellbeing-trends__overlay-row" key={item.key}>
                <CheckboxChoice checked={overlayKeys.includes(item.key)} title={item.label} hint={`${item.exactRecordCount.toLocaleString()} exact ${item.exactRecordCount === 1 ? "record" : "records"}${item.complete ? "" : " · preview bounded"}`} onCheckedChange={(checked) => commit((next) => { const current = new Set(next.getAll("overlay")); checked ? current.add(item.key) : current.delete(item.key); next.delete("overlay"); [...current].slice(0, 20).forEach((key) => next.append("overlay", key)); next.delete("evidence"); next.delete("point"); })} />
                <Button tone="link" data-overlay-evidence-key={item.key} onClick={() => openEvidence(item.evidenceHandle, undefined, { kind: "overlay", key: item.key })}>Evidence</Button>
              </div>)}
            </div> : <p className="wellbeing-trends__empty-copy">No saved context choices match this search.</p>}
          </> : <p className="wellbeing-trends__empty-copy">No explicit saved meal tags, symptoms, or routine check-ins are available in this range.</p>}
          <p className="wellbeing-trends__overlay-boundary">{overlayBoundary}{overlayCatalogQualification} {analyticalResult.selectedOverlays.items.length.toLocaleString()} of {analyticalResult.selectedOverlays.totalExactRecords.toLocaleString()} selected markers are drawn. Timing alone does not establish a relationship or cause.</p>
        </section>

        <section className="wellbeing-trends__review" aria-labelledby="trend-review-title">
          <div className="wellbeing-trends__section-heading"><div><h2 id="trend-review-title">Review with Kora</h2><p>Evidence-bound review, not a health interpretation.</p></div><CalendarRange size={18} aria-hidden="true" /></div>
          {analyticalResult.koraContext ? <>
            <p>{analyticalResult.koraContext.exactRecordIds.length.toLocaleString()} of {analyticalResult.koraContext.totalExactRecords.toLocaleString()} record IDs are prepared for a bounded review. {analyticalResult.koraContext.caution}</p>
            <Button
              disabled={!onAskKora}
              title={onAskKora ? "Attach the bounded record set to Kora" : "Conversation is unavailable in this surface"}
              onClick={() => onAskKora?.(
                analyticalResult.koraContext!.exactRecordIds.map((id, index) => ({
                  kind: "wellbeing_record",
                  id,
                  title: `${analyticalResult.metric?.metric ?? "Wellbeing"} evidence ${index + 1}`,
                })),
                `Review this bounded set of exact saved Wellbeing records for ${analyticalResult.metric?.metric ?? "the selected metric"} from ${analyticalResult.range.startDate} through ${analyticalResult.range.endDate}. ${analyticalResult.koraContext!.caution} Distinguish recorded evidence from interpretation and do not diagnose or infer causality.`,
              )}
            >Review saved evidence with Kora</Button>
            <small>{analyticalResult.koraContext.complete ? "The complete saved record set is attached." : `This review is intentionally bounded to ${analyticalResult.koraContext.exactRecordIds.length.toLocaleString()} saved records; the selected range contains ${analyticalResult.koraContext.totalExactRecords.toLocaleString()}.`}</small>
          </> : <p>No bounded Kora context is available for this selection.</p>}
        </section>
      </div> : null}

      <EvidenceSheet open={Boolean(evidenceHandle)} handle={evidenceHandle} title={evidenceTitle} metricKey={metricKey} range={range} customStart={customStart} customEnd={customEnd} overlayKeys={overlayKeys} loaders={loaders} finalFocus={evidenceOrigin} onClose={closeEvidence} onOpenRecord={openRecord} onReturnTargetSettled={settleEvidenceReturn} />
    </WellbeingFrame>
  </section>;
}
