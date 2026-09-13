import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-today.css";
import "../features/life/wellbeing-trends.css";
import "./wellbeing-trends-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { WellbeingTrendsWorkspace, type WellbeingTrendsLoaders } from "../features/life/WellbeingTrendsWorkspace";
import type { WellbeingTrendMetric, WellbeingTrendMetricCatalog, WellbeingTrendResult } from "../lib/runtime";

const fixtures = ["populated", "empty", "insufficient", "partial", "missing-span", "outage", "unavailable", "metric-unavailable", "baseline-unqualified", "overlays", "aggregated-10k", "long-copy", "loading", "catalog-error", "catalog-empty", "trend-error", "custom-incomplete", "evidence"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";

const metric = {
  key: "metric-resting-pulse-bpm",
  metric: fixture === "long-copy" ? "Resting pulse recorded after a deliberately long owner-authored morning context" : "Resting pulse",
  unit: "bpm",
  visibleRecordCount: fixture === "aggregated-10k" ? 10_001 : 10,
  firstRecordedAt: "2026-08-01T12:00:00.000Z",
  lastRecordedAt: "2026-08-29T12:00:00.000Z",
  sources: [{ kind: "manual" as const, label: "Added in Kora" }],
};
const temperatureMetric = { ...metric, key: "metric-temperature-f", metric: "Temperature", unit: "°F", visibleRecordCount: 4 };
const catalog: WellbeingTrendMetricCatalog = {
  metrics: [metric, temperatureMetric],
  restrictedOmitted: fixture === "partial",
  excludedRecordCount: fixture === "partial" ? 2 : 0,
  complete: fixture !== "partial",
};

function rawPoints(count: number, selectedMetric: WellbeingTrendMetric = metric) {
  return Array.from({ length: count }, (_, index) => ({
    id: `point-${index + 1}`,
    mode: "raw" as const,
    time: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 3 * 86_400_000).toISOString(),
    rangeStart: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 3 * 86_400_000).toISOString(),
    rangeEnd: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 3 * 86_400_000).toISOString(),
    value: selectedMetric.key === temperatureMetric.key ? 97.8 + ((index * 3) % 8) / 10 : 62 + ((index * 7) % 9) / 2,
    metric: selectedMetric.metric,
    unit: selectedMetric.unit,
    exactRecordCount: 1,
    recordIds: [`measurement-${index + 1}`],
    evidenceHandle: `point:measurement-${index + 1}`,
    evidenceComplete: true,
    aggregationMethod: "exact_value" as const,
    sourceLabels: ["Added in Kora"],
  }));
}

function baseResult(input: Parameters<WellbeingTrendsLoaders["trend"]>[0]): WellbeingTrendResult {
  const selectedMetric = catalog.metrics.find((candidate) => candidate.key === input.metricKey) ?? metric;
  const points = rawPoints(selectedMetric.key === temperatureMetric.key ? 4 : 10, selectedMetric);
  const startDate = input.range === "custom" ? input.customStart! : input.range === "7d" ? "2026-08-24" : "2026-08-01";
  const endDate = input.range === "custom" ? input.customEnd! : "2026-08-30";
  return {
    status: "sufficient_no_supported_pattern",
    generatedAt: "2026-08-30T12:00:00.000Z",
    viewerTimeZone: "America/New_York",
    metric: selectedMetric,
    range: { key: input.range, start: `${startDate}T04:00:00.000Z`, end: `${endDate}T23:59:59.999Z`, startDate, endDate },
    points,
    totalExactRecords: points.length,
    excludedRecordCount: 0,
    restrictedOmitted: false,
    seriesMode: "raw",
    seriesQualification: { state: "sufficient", exactRecordCount: points.length, recordedDayCount: points.length, requiredRecords: 7, requiredDays: 4, reason: "The selected range has enough exact saved evidence to display without claiming a supported pattern.", policy: "Seven records across four days; no clinical meaning." },
    sourceQualification: { state: "complete", sources: { state: "local_only", local: { state: "current", visibleRecordCount: points.length }, external: [], complete: true }, limitation: "Coverage is limited to saved measurement records." },
    baseline: { qualification: "qualified", label: "Personal recorded baseline", lower: 60, upper: 69, median: 64.5, exactRecordCount: 9, recordedDayCount: 7, restrictedOmitted: false, excludedRecordCount: 0, complete: true, window: { start: "2026-07-01T04:00:00.000Z", end: "2026-08-01T04:00:00.000Z" }, policy: "Recorded baseline is not a normal or healthy range." },
    missingSpans: [], outageAnnotations: [],
    intervalCoverage: { state: "unsupported", reason: "Interval-complete coverage is not exposed.", restrictedOmitted: false },
    observations: { state: "unsupported", items: [] },
    overlaps: { state: "unsupported", items: [] },
    overlayCatalog: { items: [{ key: "overlay-symptom-headache", kind: "symptom", label: "Headache", exactRecordCount: 2, recordIds: ["symptom-1", "symptom-2"], evidenceHandle: "overlay:headache", complete: true }], totalItems: 1, complete: true, restrictedOmitted: false },
    selectedOverlays: { items: [], totalExactRecords: 0, complete: true },
    koraContext: { metricKey: selectedMetric.key, range: { start: `${startDate}T04:00:00.000Z`, end: `${endDate}T23:59:59.999Z` }, exactRecordIds: ["measurement-1", "measurement-2"], totalExactRecords: points.length, complete: false, caution: "No causality is established." },
  };
}

function fixtureResult(input: Parameters<WellbeingTrendsLoaders["trend"]>[0]): WellbeingTrendResult {
  const base = baseResult(input);
  const overlaySelected = input.overlayKeys?.includes("overlay-symptom-headache") ?? false;
  const selectedOverlays = overlaySelected ? { items: [{ id: "symptom-1", key: "overlay-symptom-headache", time: "2026-08-13T14:00:00.000Z", label: "Headache", recordId: "symptom-1" }, { id: "symptom-2", key: "overlay-symptom-headache", time: "2026-08-22T18:30:00.000Z", label: "Headache", recordId: "symptom-2" }], totalExactRecords: 2, complete: true } : base.selectedOverlays;
  if (fixture === "empty") return { ...base, status: "no_records", points: [], totalExactRecords: 0, seriesQualification: { ...base.seriesQualification, state: "no_records", exactRecordCount: 0, recordedDayCount: 0, reason: "No exact saved measurements are in this range." }, baseline: { qualification: "unqualified", label: "Personal recorded baseline", reason: "No preceding measurements are available.", exactRecordCount: 0, recordedDayCount: 0, restrictedOmitted: false, excludedRecordCount: 0, complete: true, window: base.baseline.window, policy: base.baseline.policy } };
  if (fixture === "insufficient") return { ...base, status: "insufficient", points: base.points.slice(0, 1), totalExactRecords: 1, seriesQualification: { ...base.seriesQualification, state: "insufficient", exactRecordCount: 1, recordedDayCount: 1, reason: "One exact record cannot support the configured display threshold." } };
  if (fixture === "partial") return { ...base, status: "partial", excludedRecordCount: 2, restrictedOmitted: true, seriesQualification: { ...base.seriesQualification, state: "partial", reason: "Some saved measurements are omitted or invalid, so this presentation is incomplete." }, sourceQualification: { ...base.sourceQualification, state: "partial", limitation: "Saved measurement coverage is partial." }, baseline: { ...base.baseline, qualification: "unqualified", reason: "The preceding window is incomplete.", complete: false, restrictedOmitted: true, excludedRecordCount: 1 } };
  if (fixture === "missing-span") return { ...base, missingSpans: [{ id: "provider-gap-aug-10", start: "2026-08-10T12:00:00.000Z", end: "2026-08-14T12:00:00.000Z", label: "Provider reported no measurement coverage", source: { kind: "provider", label: "Synthetic wearable", providerId: "synthetic-wearable" }, provenance: { kind: "provider_report", reference: "synthetic-report-1", observedAt: "2026-08-30T11:00:00.000Z", completeness: "complete" }, evidence: { intervalId: "provider-gap-aug-10", version: 1 } }], intervalCoverage: { state: "explicit", reason: "The connected source explicitly reported interval coverage for this range.", restrictedOmitted: false, sources: [{ key: "provider:synthetic-wearable", kind: "provider", label: "Synthetic wearable", providerId: "synthetic-wearable", completeness: "complete" }] } };
  if (fixture === "outage") return { ...base, outageAnnotations: [{ id: "provider-outage-aug-18", start: "2026-08-18T12:00:00.000Z", end: "2026-08-21T12:00:00.000Z", label: "Sync coverage could not be checked", source: { kind: "provider", label: "Synthetic wearable", providerId: "synthetic-wearable" }, provenance: { kind: "provider_report", reference: "synthetic-report-2", observedAt: "2026-08-30T11:30:00.000Z", completeness: "partial", limitation: "The source did not establish complete interval coverage." }, evidence: { intervalId: "provider-outage-aug-18", version: 1 } }], intervalCoverage: { state: "partial", reason: "Only part of the selected range has explicit provider interval evidence.", restrictedOmitted: false, sources: [{ key: "provider:synthetic-wearable", kind: "provider", label: "Synthetic wearable", providerId: "synthetic-wearable", completeness: "partial" }] } };
  if (fixture === "unavailable") return { ...base, status: "unavailable", points: [], totalExactRecords: 0, seriesQualification: { ...base.seriesQualification, state: "unavailable", exactRecordCount: 0, recordedDayCount: 0, reason: "The qualified series could not be read." }, sourceQualification: { ...base.sourceQualification, state: "unavailable", limitation: "Saved measurement coverage could not be checked." } };
  if (fixture === "metric-unavailable") return { ...base, status: "metric_unavailable", points: [], totalExactRecords: 0, seriesQualification: { ...base.seriesQualification, state: "unavailable", exactRecordCount: 0, recordedDayCount: 0, reason: "The selected metric is not available in this range." } };
  if (fixture === "baseline-unqualified") return { ...base, baseline: { qualification: "unqualified", label: "Personal recorded baseline", reason: "Only three preceding records across two days are available.", exactRecordCount: 3, recordedDayCount: 2, restrictedOmitted: false, excludedRecordCount: 0, complete: true, window: base.baseline.window, policy: base.baseline.policy } };
  if (fixture === "overlays") return { ...base, selectedOverlays };
  if (fixture === "aggregated-10k") return { ...base, points: Array.from({ length: 239 }, (_, index) => ({ ...base.points[index % base.points.length]!, id: `bucket-${index + 1}`, mode: "aggregated" as const, time: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 3 * 60 * 60_000).toISOString(), rangeStart: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 3 * 60 * 60_000).toISOString(), rangeEnd: new Date(Date.parse("2026-08-01T12:00:00.000Z") + (index * 3 + 3) * 60 * 60_000).toISOString(), exactRecordCount: index === 238 ? 5 : 42, recordIds: [`bounded-${index + 1}`], evidenceHandle: `bucket:${index + 1}`, evidenceComplete: false, aggregationMethod: "arithmetic_mean" as const })), totalExactRecords: 10_001, seriesMode: "aggregated", seriesQualification: { ...base.seriesQualification, exactRecordCount: 10_001, recordedDayCount: 30 } };
  return { ...base, selectedOverlays };
}

function loaders(): WellbeingTrendsLoaders {
  return {
    metrics: async () => {
      if (fixture === "catalog-error") throw new Error("Synthetic metric catalog failure");
      return fixture === "catalog-empty" ? { ...catalog, metrics: [] } : catalog;
    },
    trend: async (input) => {
      if (fixture === "loading") return await new Promise<WellbeingTrendResult>(() => undefined);
      if (fixture === "trend-error") throw new Error("Synthetic selected trend failure");
      return fixtureResult(input);
    },
    evidence: async (input) => input.cursor
      ? { evidenceHandle: input.evidenceHandle, recordIds: ["measurement-3"], totalExactRecords: 3, complete: true }
      : { evidenceHandle: input.evidenceHandle, recordIds: ["measurement-1", "measurement-2"], totalExactRecords: 3, cursor: "next", complete: false },
  };
}

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const overlay = fixture === "overlays" ? "&overlay=overlay-symptom-headache" : "";
  const evidence = fixture === "evidence" ? "&evidence=point%3Ameasurement-1" : "";
  const range = fixture === "custom-incomplete" ? "custom" : "30d";
  const route = `/life/wellbeing/trends?metric=${encodeURIComponent(metric.key)}&range=${range}${overlay}${evidence}`;
  return <main className="wellbeing-trends-specimen" id="main-content">
    <header className="wellbeing-trends-specimen__controls"><div><strong>Wellbeing Trends qualification</strong><span>Synthetic saved measurements · no provider or owner data</span></div><KoraSelect label="Trends fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><ViewBarProvider><ViewBar /><WellbeingTrendsWorkspace loaders={loaders()} onAskKora={() => undefined} /></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
