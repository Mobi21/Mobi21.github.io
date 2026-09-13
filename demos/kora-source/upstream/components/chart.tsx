import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "./button";
import "./chart.css";

export type ChartEvidenceTarget = {
  label: string;
  onActivate: (pointId: string) => void;
};

export type ChartPresentationPoint = {
  id: string;
  time: string;
  timeLabel: string;
  value: number;
  valueLabel: string;
  label: string;
  source: string;
  evidence?: ChartEvidenceTarget;
};

export type ChartMissingSpan = {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
};

export type ChartOutageAnnotation = ChartMissingSpan & {
  source: string;
};

export type ChartBaselineBand =
  | { qualification: "qualified"; lower: number; upper: number; label: string }
  | { qualification: "unqualified"; label: string; reason: string };

export type ChartEventMarker = {
  id: string;
  time: string;
  label: string;
};

export type AccessibleTimeSeriesChartProps = {
  title: string;
  description?: string;
  caption: string;
  xAxisLabel: string;
  yAxisLabel: string;
  formatValueTick: (value: number) => string;
  points: readonly ChartPresentationPoint[];
  missingSpans?: readonly ChartMissingSpan[];
  outages?: readonly ChartOutageAnnotation[];
  baseline?: ChartBaselineBand;
  eventMarkers?: readonly ChartEventMarker[];
  initialSelectedId?: string;
  onPointActivate?: (point: ChartPresentationPoint) => void;
  state?: "ready" | "loading" | "unavailable";
  stateTitle?: string;
  stateBody?: string;
  ownerAction?: ReactNode;
  tablePageSize?: number;
  tableRowCap?: number;
};

type PositionedPoint = ChartPresentationPoint & { x: number; y: number; epoch: number };
type ClippedSpan<T extends ChartMissingSpan> = T & { start: number; end: number };
type TickAnchor = "start" | "middle" | "end";
type TickPosition = PositionedPoint & { labelLeft: number; labelRight: number; anchor: TickAnchor };

const DEFAULT_WIDTH = 640;
const HEIGHT = 240;
const PLOT_LEFT = 72;
const PLOT_RIGHT = 18;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 200;
const MAX_TABLE_ROWS = 500;
const MIN_TICK_GAP = 12;
const MIN_MARKER_GAP = 6;

function timeValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function spanContains(start: number, end: number, pointA: number, pointB: number) {
  return start < pointB && end > pointA;
}

function createSegments(
  points: readonly PositionedPoint[],
  spans: readonly { start: number; end: number }[],
) {
  if (!points.length) return [];
  const segments: PositionedPoint[][] = [[points[0]!]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    if (spans.some((span) => spanContains(span.start, span.end, previous.epoch, point.epoch)))
      segments.push([point]);
    else segments.at(-1)!.push(point);
  }
  return segments;
}

function clipSpans<T extends ChartMissingSpan>(
  spans: readonly T[],
  minTime: number,
  maxTime: number,
): ClippedSpan<T>[] {
  return spans.flatMap((span) => {
    const first = timeValue(span.startTime);
    const second = timeValue(span.endTime);
    if (!Number.isFinite(first) || !Number.isFinite(second) || first === second)
      return [];
    const start = Math.min(first, second);
    const end = Math.max(first, second);
    if (end <= minTime || start >= maxTime) return [];
    return [{ ...span, start: Math.max(start, minTime), end: Math.min(end, maxTime) }];
  });
}

function pointSummary(point: ChartPresentationPoint, position: number, total: number) {
  return `${point.timeLabel}: ${point.valueLabel}. ${point.label}. Source: ${point.source}. Point ${position + 1} of ${total}.`;
}

function labelWidth(label: string) {
  // This intentionally has no upper cap: long localized labels need a box as wide
  // as their content instead of being silently treated as short labels.
  return Math.max(12, Array.from(label).reduce((width, character) => {
    if (/\s/u.test(character)) return width + 4;
    if (/[MW@#%]/u.test(character)) return width + 9;
    return width + 7;
  }, 0));
}

function tickBox(point: PositionedPoint, anchor: TickAnchor): TickPosition {
  const width = labelWidth(point.timeLabel);
  const labelLeft = anchor === "start" ? point.x : anchor === "end" ? point.x - width : point.x - width / 2;
  return { ...point, anchor, labelLeft, labelRight: labelLeft + width };
}

function boxesSeparated(previous: TickPosition, next: TickPosition) {
  return next.labelLeft >= previous.labelRight + MIN_TICK_GAP;
}

function tickFitsPlot(tick: TickPosition, plotStart: number, plotEnd: number) {
  return tick.labelLeft >= plotStart && tick.labelRight <= plotEnd;
}

function singletonTick(point: PositionedPoint, plotWidth: number) {
  const plotStart = PLOT_LEFT;
  const plotEnd = PLOT_LEFT + plotWidth;
  const centered = tickBox(point, "middle");
  if (tickFitsPlot(centered, plotStart, plotEnd)) return centered;

  const edgeTicks = [tickBox(point, "start"), tickBox(point, "end")]
    .filter((tick) => tickFitsPlot(tick, plotStart, plotEnd));
  if (edgeTicks.length) {
    return edgeTicks.reduce((closest, tick) => {
      const closestDistance = Math.abs((closest.labelLeft + closest.labelRight) / 2 - point.x);
      const tickDistance = Math.abs((tick.labelLeft + tick.labelRight) / 2 - point.x);
      return tickDistance < closestDistance ? tick : closest;
    });
  }

  // A label wider than the plot cannot fit with any anchor. Keep it attached
  // to the nearest edge so a feasible narrow label never clips the plot start.
  if (point.x <= plotStart) return tickBox(point, "start");
  if (point.x >= plotEnd) return tickBox(point, "end");
  return centered;
}

function nearestPointAtX(points: readonly PositionedPoint[], target: number) {
  return points.reduce((nearest, point) => Math.abs(point.x - target) < Math.abs(nearest.x - target) ? point : nearest, points[0]!);
}

function chooseTimeTicks(points: readonly PositionedPoint[], plotWidth: number) {
  if (!points.length) return [] as TickPosition[];
  const targetCount = Math.min(5, Math.max(2, Math.floor(plotWidth / 120) + 1));
  const candidates = Array.from({ length: targetCount }, (_, index) => nearestPointAtX(points, PLOT_LEFT + (plotWidth * index) / Math.max(1, targetCount - 1)))
    .filter((point, index, all) => all.findIndex((candidate) => candidate.id === point.id) === index)
    .sort((left, right) => left.x - right.x || left.epoch - right.epoch || left.id.localeCompare(right.id));
  const first = candidates[0] ?? points[0]!;
  const last = candidates.at(-1) ?? points.at(-1)!;
  if (first.id === last.id || first.x === last.x) return [singletonTick(first, plotWidth)];

  const firstTick = tickBox(first, "start");
  const lastTick = tickBox(last, "end");
  if (!boxesSeparated(firstTick, lastTick)) return [firstTick];

  const selected: TickPosition[] = [firstTick];
  for (const candidate of candidates.slice(1, -1)) {
    const next = tickBox(candidate, "middle");
    if (boxesSeparated(selected.at(-1)!, next) && boxesSeparated(next, lastTick)) selected.push(next);
  }
  while (selected.length > 1 && !boxesSeparated(selected.at(-1)!, lastTick)) selected.pop();
  return [...selected, lastTick];
}

function pointBucket(point: PositionedPoint) {
  return Math.floor((point.x - PLOT_LEFT) / MIN_MARKER_GAP);
}

function representativePoints(segment: readonly PositionedPoint[]) {
  if (segment.length < 2 || !segment.some((point, index) => index > 0 && point.x - segment[index - 1]!.x < MIN_MARKER_GAP)) return [...segment];
  const buckets = new Map<number, PositionedPoint[]>();
  for (const point of segment) {
    const bucket = pointBucket(point);
    const values = buckets.get(bucket) ?? [];
    values.push(point);
    buckets.set(bucket, values);
  }
  const retained = new Map<string, PositionedPoint>();
  const keep = (point: PositionedPoint | undefined) => { if (point) retained.set(point.id, point); };
  keep(segment[0]);
  keep(segment.at(-1));
  for (const values of buckets.values()) {
    keep(values[0]);
    keep(values.at(-1));
    keep(values.reduce((lowest, point) => point.y > lowest.y ? point : lowest, values[0]!));
    keep(values.reduce((highest, point) => point.y < highest.y ? point : highest, values[0]!));
  }
  return [...retained.values()].sort((left, right) => left.epoch - right.epoch || left.id.localeCompare(right.id));
}

function markerPoints(points: readonly PositionedPoint[], selected: PositionedPoint) {
  if (points.length > MAX_TABLE_ROWS) return [selected];
  const buckets = new Map<number, PositionedPoint[]>();
  for (const point of points) {
    const bucket = pointBucket(point);
    const values = buckets.get(bucket) ?? [];
    values.push(point);
    buckets.set(bucket, values);
  }
  const clustered = [...buckets.values()].some((values) => values.length > 1);
  const visible = clustered ? [...buckets.values()].filter((values) => values.length === 1).map((values) => values[0]!) : [...points];
  if (!visible.some((point) => point.id === selected.id)) visible.push(selected);
  return visible;
}

export function AccessibleTimeSeriesChart({
  title,
  description,
  caption,
  xAxisLabel,
  yAxisLabel,
  formatValueTick,
  points,
  missingSpans = [],
  outages = [],
  baseline,
  eventMarkers = [],
  initialSelectedId,
  onPointActivate,
  state = "ready",
  stateTitle,
  stateBody,
  ownerAction,
  tablePageSize = 100,
  tableRowCap = 500,
}: AccessibleTimeSeriesChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const plotWrapRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [plotWidth, setPlotWidth] = useState(DEFAULT_WIDTH);
  const sortedPoints = useMemo(
    () => [...points]
      .filter((point) => Number.isFinite(timeValue(point.time)) && Number.isFinite(point.value))
      .sort((left, right) => timeValue(left.time) - timeValue(right.time) || left.id.localeCompare(right.id)),
    [points],
  );
  const [selectedId, setSelectedId] = useState(
    initialSelectedId ?? sortedPoints[0]?.id ?? "",
  );
  const requestedCap = Number.isFinite(tableRowCap) ? Math.floor(tableRowCap) : MAX_TABLE_ROWS;
  const safeTableCap = Math.max(1, Math.min(MAX_TABLE_ROWS, requestedCap));
  const requestedPageSize = Number.isFinite(tablePageSize) ? Math.floor(tablePageSize) : 100;
  const safePageSize = Math.max(1, Math.min(safeTableCap, requestedPageSize));
  const [tableLimit, setTableLimit] = useState(safePageSize);

  useEffect(() => {
    if (sortedPoints.some((point) => point.id === selectedId)) return;
    setSelectedId(sortedPoints[0]?.id ?? "");
  }, [selectedId, sortedPoints]);

  useEffect(() => setTableLimit(safePageSize), [points, safePageSize]);

  useEffect(() => {
    const element = plotWrapRef.current;
    if (!element) return;
    const updateWidth = (candidate?: number) => {
      const measured = candidate ?? element.getBoundingClientRect().width;
      if (Number.isFinite(measured) && measured > 0) setPlotWidth(Math.round(measured));
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const contentWidth = entries[0]?.contentRect.width;
      updateWidth(contentWidth && contentWidth > 0 ? contentWidth : undefined);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sortedPoints.length, state]);

  const selectedIndex = Math.max(0, sortedPoints.findIndex((point) => point.id === selectedId));
  const selected = sortedPoints[selectedIndex];
  const qualifiedBaseline = baseline?.qualification === "qualified"
    && Number.isFinite(baseline.lower)
    && Number.isFinite(baseline.upper)
    && baseline.lower <= baseline.upper
    ? baseline
    : undefined;
  const plotMetrics = useMemo(() => ({
    width: Math.max(PLOT_LEFT + PLOT_RIGHT + 1, plotWidth),
    plotWidth: Math.max(1, plotWidth - PLOT_LEFT - PLOT_RIGHT),
  }), [plotWidth]);
  const bounds = useMemo(() => {
    const epochs = sortedPoints.map((point) => timeValue(point.time));
    const values = sortedPoints.map((point) => point.value);
    if (qualifiedBaseline) values.push(qualifiedBaseline.lower, qualifiedBaseline.upper);
    const minTime = Math.min(...epochs);
    const maxTime = Math.max(...epochs);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    return {
      minTime,
      maxTime,
      minValue,
      maxValue,
      timeRange: Math.max(1, maxTime - minTime),
      valueRange: Math.max(1, maxValue - minValue),
    };
  }, [qualifiedBaseline, sortedPoints]);
  const positioned = useMemo<PositionedPoint[]>(
    () =>
      sortedPoints.map((point) => {
        const epoch = timeValue(point.time);
        return {
          ...point,
          epoch,
          x: PLOT_LEFT + ((epoch - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth,
          y:
            PLOT_BOTTOM -
            ((point.value - bounds.minValue) / bounds.valueRange) *
              (PLOT_BOTTOM - PLOT_TOP),
        };
      }),
    [bounds, plotMetrics.plotWidth, sortedPoints],
  );
  const clippedMissing = useMemo(
    () => clipSpans(missingSpans, bounds.minTime, bounds.maxTime),
    [bounds.maxTime, bounds.minTime, missingSpans],
  );
  const clippedOutages = useMemo(
    () => clipSpans(outages, bounds.minTime, bounds.maxTime),
    [bounds.maxTime, bounds.minTime, outages],
  );
  const visibleEvents = useMemo(
    () => eventMarkers.flatMap((marker) => {
      const epoch = timeValue(marker.time);
      return Number.isFinite(epoch) && epoch >= bounds.minTime && epoch <= bounds.maxTime
        ? [{ ...marker, epoch }]
        : [];
    }),
    [bounds.maxTime, bounds.minTime, eventMarkers],
  );
  const segments = useMemo(
    () => createSegments(positioned, [...clippedMissing, ...clippedOutages]),
    [clippedMissing, clippedOutages, positioned],
  );
  const renderedSegments = useMemo(
    () => segments.map((segment) => representativePoints(segment)),
    [segments],
  );
  const renderedMarkers = useMemo(
    () => {
      const selectedPoint = positioned.find((point) => point.id === selected?.id);
      return selectedPoint ? markerPoints(positioned, selectedPoint) : [];
    },
    [positioned, selected],
  );

  const selectIndex = (next: number) => {
    const point = sortedPoints[clamp(next, 0, sortedPoints.length - 1)];
    if (point) setSelectedId(point.id);
  };
  const selectFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const plotStart = rect.left + PLOT_LEFT;
    const plotWidth = Math.max(1, rect.width - PLOT_LEFT - PLOT_RIGHT);
    const ratio = clamp((event.clientX - plotStart) / plotWidth, 0, 1);
    const targetEpoch = bounds.minTime + ratio * bounds.timeRange;
    let nearest = 0;
    sortedPoints.forEach((point, index) => {
      if (Math.abs(timeValue(point.time) - targetEpoch) < Math.abs(timeValue(sortedPoints[nearest]!.time) - targetEpoch)) nearest = index;
    });
    selectIndex(nearest);
  };
  const handleExplorerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") selectIndex(selectedIndex + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") selectIndex(selectedIndex - 1);
    else if (event.key === "Home") selectIndex(0);
    else if (event.key === "End") selectIndex(sortedPoints.length - 1);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selected.evidence) selected.evidence.onActivate(selected.id);
      else onPointActivate?.(selected);
      return;
    } else return;
    event.preventDefault();
  };

  if (state !== "ready")
    return (
      <section className="k-chart" aria-labelledby={titleId} aria-busy={state === "loading" || undefined}>
        <header className="k-chart__header"><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div></header>
        <div className="k-chart__axis-names"><span>Vertical: {yAxisLabel}</span><span>Horizontal: {xAxisLabel}</span></div>
        <div className="k-chart__state" data-state={state} role={state === "unavailable" ? "alert" : "status"}>
          <div className="k-chart__state-plot" aria-hidden="true"><span /><span /><span /></div>
          <strong>{stateTitle ?? (state === "loading" ? "Loading chart" : "Chart unavailable")}</strong>
          {stateBody ? <p>{stateBody}</p> : null}
          {ownerAction ? <div>{ownerAction}</div> : null}
        </div>
      </section>
    );

  if (sortedPoints.length === 0)
    return (
      <section className="k-chart" aria-labelledby={titleId}>
        <header className="k-chart__header"><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div></header>
        <div className="k-chart__empty" role="status">
          <svg viewBox={`0 0 ${plotMetrics.width} ${HEIGHT}`} aria-hidden="true"><path d={`M 0 ${PLOT_BOTTOM} H ${plotMetrics.width}`} /></svg>
          <strong>{stateTitle ?? "Not enough recorded points"}</strong>
          {stateBody ? <p>{stateBody}</p> : null}
          {ownerAction ? <div>{ownerAction}</div> : null}
        </div>
      </section>
    );

  const selectedPosition = positioned[selectedIndex]!;
  const visibleRows = sortedPoints.slice(0, Math.min(tableLimit, safeTableCap));
  const baselineTop = qualifiedBaseline
    ? PLOT_BOTTOM - ((qualifiedBaseline.upper - bounds.minValue) / bounds.valueRange) * (PLOT_BOTTOM - PLOT_TOP)
    : 0;
  const baselineBottom = qualifiedBaseline
    ? PLOT_BOTTOM - ((qualifiedBaseline.lower - bounds.minValue) / bounds.valueRange) * (PLOT_BOTTOM - PLOT_TOP)
    : 0;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = bounds.maxValue - (bounds.valueRange * index) / 4;
    return { value, y: PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * index) / 4 };
  });
  const xTicks = chooseTimeTicks(positioned, plotMetrics.plotWidth);
  const tableHasCap = sortedPoints.length > safeTableCap;

  return (
    <section className="k-chart" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
      <header className="k-chart__header">
        <div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
        <span className="k-chart__count">{sortedPoints.length.toLocaleString()} {sortedPoints.length === 1 ? "point" : "points"}</span>
      </header>
      {sortedPoints.length === 1 && stateBody ? <p className="k-chart__qualification"><CircleAlert size={16} aria-hidden="true" /><span><strong>{stateTitle ?? "One exact point"}.</strong> {stateBody}</span></p> : null}
      {baseline?.qualification === "unqualified" ? <p className="k-chart__qualification"><CircleAlert size={16} aria-hidden="true" /><span><strong>{baseline.label} unavailable.</strong> {baseline.reason}</span></p> : null}
      <div className="k-chart__axis-names"><span>Vertical: {yAxisLabel}</span><span>Horizontal: {xAxisLabel}</span></div>
      <div className="k-chart__plot-wrap" ref={plotWrapRef}>
        <svg className="k-chart__plot" viewBox={`0 0 ${plotMetrics.width} ${HEIGHT}`} aria-hidden="true">
          {yTicks.map((tick, index) => <g key={index} data-compact-hidden={index % 2 === 1 || undefined}><line className="k-chart__grid" x1={PLOT_LEFT} x2={plotMetrics.width - PLOT_RIGHT} y1={tick.y} y2={tick.y} /><text className="k-chart__y-tick" x={PLOT_LEFT - 10} y={tick.y + 4} textAnchor="end">{formatValueTick(tick.value)}</text></g>)}
          <path className="k-chart__axis" d={`M ${PLOT_LEFT} ${PLOT_TOP} V ${PLOT_BOTTOM} H ${plotMetrics.width - PLOT_RIGHT}`} />
          {qualifiedBaseline ? <g><rect className="k-chart__baseline" x={PLOT_LEFT} y={baselineTop} width={plotMetrics.plotWidth} height={Math.max(1, baselineBottom - baselineTop)} /><text className="k-chart__svg-label" x={PLOT_LEFT + 10} y={Math.max(14, baselineTop - 5)}>{qualifiedBaseline.label}</text></g> : null}
          {clippedMissing.map((span) => {
            const start = PLOT_LEFT + ((span.start - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth;
            const end = PLOT_LEFT + ((span.end - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth;
            return <rect key={span.id} className="k-chart__missing" x={start} y={PLOT_TOP} width={end - start} height={PLOT_BOTTOM - PLOT_TOP} />;
          })}
          {clippedOutages.map((outage) => {
            const start = PLOT_LEFT + ((outage.start - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth;
            const end = PLOT_LEFT + ((outage.end - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth;
            return <rect key={outage.id} className="k-chart__outage" x={start} y={PLOT_TOP} width={end - start} height={PLOT_BOTTOM - PLOT_TOP} />;
          })}
          {renderedSegments.map((segment, index) => segment.length > 1 ? <polyline key={index} className="k-chart__line" data-representative-ids={segment.map((point) => point.id).join(",")} points={segment.map((point) => `${point.x},${point.y}`).join(" ")} /> : null)}
          {renderedMarkers.map((point) => <circle key={point.id} className="k-chart__point" data-point-id={point.id} data-selected={point.id === selected?.id || undefined} cx={point.x} cy={point.y} r={point.id === selected?.id ? 5 : 3} />)}
          {visibleEvents.map((marker) => {
            const x = PLOT_LEFT + ((marker.epoch - bounds.minTime) / bounds.timeRange) * plotMetrics.plotWidth;
            return <g key={marker.id}><line className="k-chart__event" x1={x} x2={x} y1={PLOT_TOP} y2={PLOT_BOTTOM} /><circle className="k-chart__event-dot" cx={x} cy={PLOT_TOP} r="4" /></g>;
          })}
          <line className="k-chart__selection" x1={selectedPosition.x} x2={selectedPosition.x} y1={PLOT_TOP} y2={PLOT_BOTTOM} />
          {xTicks.map((tick, index) => <g key={tick.id} data-tick-id={tick.id} data-label-left={tick.labelLeft} data-label-right={tick.labelRight} data-compact-hidden={xTicks.length > 3 && index % 2 === 1 || undefined}><line className="k-chart__x-mark" x1={tick.x} x2={tick.x} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM + 5} /><text className="k-chart__x-tick" x={tick.x} y={PLOT_BOTTOM + 21} textAnchor={tick.anchor}>{tick.timeLabel}</text></g>)}
        </svg>
        <div
          ref={explorerRef}
          className="k-chart__explorer"
          role="slider"
          tabIndex={0}
          aria-label={`Explore ${title}`}
          aria-valuemin={1}
          aria-valuemax={sortedPoints.length}
          aria-valuenow={selectedIndex + 1}
          aria-valuetext={pointSummary(selected!, selectedIndex, sortedPoints.length)}
          aria-orientation="horizontal"
          onKeyDown={handleExplorerKey}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            selectFromPointer(event);
            explorerRef.current?.focus({ preventScroll: true });
          }}
          onPointerMove={(event) => { if (dragging.current) selectFromPointer(event); }}
          onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture?.(event.pointerId); }}
          onPointerCancel={() => { dragging.current = false; }}
        >
          <span className="k-chart__thumb" style={{ left: `${(selectedPosition.x / plotMetrics.width) * 100}%`, top: `${(selectedPosition.y / HEIGHT) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
      <div className="k-chart__selected" aria-live="polite" aria-atomic="true">
        <div><strong>{selected!.valueLabel}</strong><span>{selected!.timeLabel} · {selected!.label}</span><small>Source: {selected!.source}</small></div>
        {selected!.evidence ? <Button tone="ghost" data-chart-evidence-id={selected!.id} onClick={() => selected!.evidence!.onActivate(selected!.id)}>{selected!.evidence.label}</Button> : onPointActivate ? <Button tone="ghost" onClick={() => onPointActivate(selected!)}>Open point</Button> : null}
      </div>
      {(clippedMissing.length || clippedOutages.length || visibleEvents.length) ? <ul className="k-chart__annotations" aria-label="Chart annotations">
        {clippedMissing.map((span) => <li key={span.id}><strong>Missing:</strong> {span.label}</li>)}
        {clippedOutages.map((outage) => <li key={outage.id}><strong>{outage.source} unavailable:</strong> {outage.label}</li>)}
        {visibleEvents.map((marker) => <li key={marker.id}><strong>Event:</strong> {marker.label}</li>)}
      </ul> : null}
      <details className="k-chart__data">
        <summary>View chart data</summary>
        <div className="k-chart__table-wrap">
          <table><caption><span>{caption}</span><small>Showing {visibleRows.length.toLocaleString()} of {sortedPoints.length.toLocaleString()} presentation {sortedPoints.length === 1 ? "point" : "points"}.{tableHasCap ? ` Table is limited to ${safeTableCap.toLocaleString()} points; use the point explorer for the complete presentation set.` : ""}</small></caption><thead><tr><th scope="col">Time</th><th scope="col">Value</th><th scope="col">Context</th><th scope="col">Source</th><th scope="col">Evidence</th></tr></thead><tbody>
            {visibleRows.map((point) => <tr key={point.id} data-selected={point.id === selected?.id || undefined}><th scope="row">{point.timeLabel}</th><td>{point.valueLabel}</td><td>{point.label}</td><td>{point.source}</td><td>{point.evidence ? <Button tone="link" onClick={() => point.evidence!.onActivate(point.id)}>{point.evidence.label}</Button> : "Not linked"}</td></tr>)}
          </tbody></table>
        </div>
        {visibleRows.length < Math.min(sortedPoints.length, safeTableCap) ? <Button tone="secondary" onClick={() => setTableLimit((current) => Math.min(safeTableCap, sortedPoints.length, current + safePageSize))}>Show {Math.min(safePageSize, safeTableCap - visibleRows.length, sortedPoints.length - visibleRows.length)} more points</Button> : null}
      </details>
    </section>
  );
}
