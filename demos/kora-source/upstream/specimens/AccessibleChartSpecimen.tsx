import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../components/chart.css";
import "./accessible-chart-specimen.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  AccessibleTimeSeriesChart,
  Button,
  KoraSelect,
  type ChartPresentationPoint,
} from "../components/primitives";

const fixtures = [
  "populated", "one-point", "empty", "missing-gap", "outage", "baseline-qualified",
  "baseline-unqualified", "overlays", "ten-points", "ten-thousand", "long-labels",
  "loading", "unavailable",
] as const;
type Fixture = (typeof fixtures)[number];
const query = new URLSearchParams(window.location.search);
const requested = query.get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";

function point(index: number, total = 10): ChartPresentationPoint {
  const time = new Date(Date.UTC(2026, 7, 1 + index, 12)).toISOString();
  const value = 62 + Math.sin(index / 2.2) * 8 + (index % 3);
  return {
    id: `reading-${index}`,
    time,
    timeLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" }).format(new Date(time)),
    value,
    valueLabel: `${value.toFixed(1)} units`,
    label: fixture === "long-labels" ? `A deliberately long but exact presentation label for saved point ${index + 1} of ${total}, retaining its complete context without clipping it into ambiguity` : `Saved reading ${index + 1}`,
    source: index % 3 === 0 ? "Saved manually" : "Connected source · last confirmed Aug 29",
    evidence: { label: "Open evidence", onActivate: () => undefined },
  };
}

const ordinary = Array.from({ length: fixture === "ten-points" ? 10 : 18 }, (_, index) => point(index));
const large = fixture === "ten-thousand" ? Array.from({ length: 10_000 }, (_, index) => {
  const time = new Date(Date.UTC(2000, 0, 1, 0, index)).toISOString();
  return { ...point(index, 10_000), time, timeLabel: `Aggregated point ${index + 1}`, id: `aggregate-${index}` };
}) : ordinary;
const presented = fixture === "empty" ? [] : fixture === "one-point" ? ordinary.slice(0, 1) : large;

function choose(next: string) {
  const params = new URLSearchParams(window.location.search);
  params.set("fixture", next);
  window.location.search = params.toString();
}

function timeValue(value: string | undefined) {
  return value ? Date.parse(value) : Date.parse("2026-08-06T00:00:00.000Z");
}

function Specimen() {
  const hasExplorer = fixture !== "empty" && fixture !== "loading" && fixture !== "unavailable";
  const [status, setStatus] = useState(hasExplorer ? "Use Arrow keys, Home, End, or the pointer to explore exact points." : "");
  const points = presented.map((item) => ({ ...item, evidence: { label: "Open evidence", onActivate: () => setStatus(`Opened evidence for ${item.id}.`) } }));
  const missing = fixture === "missing-gap" || fixture === "outage" ? [{
    id: "gap",
    startTime: new Date(timeValue(points[5]?.time) + 1).toISOString(),
    endTime: new Date(timeValue(points[6]?.time) - 1).toISOString(),
    label: "No qualified readings were returned for this interval",
  }] : [];
  return <div className="chart-specimen">
    <header className="chart-specimen__bar"><strong>Accessible chart owner</strong><KoraSelect label="Chart fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <main className="chart-specimen__main"><div className="chart-specimen__content">
      <h1 className="sr-only">Accessible chart qualification</h1>
      <AccessibleTimeSeriesChart
        title="Recorded wellbeing measure"
        description="Exact saved presentation points with explicit qualification and evidence ownership."
        caption="Synthetic saved measure points used to qualify the shared chart owner"
        xAxisLabel="Recorded time"
        yAxisLabel="Recorded synthetic units"
        formatValueTick={(value) => `${value.toFixed(0)} units`}
        points={points}
        missingSpans={missing}
        outages={fixture === "outage" ? [{ ...missing[0]!, id: "outage", source: "Connected source" }] : []}
        baseline={fixture === "baseline-qualified" ? { qualification: "qualified", lower: 58, upper: 72, label: "Qualified saved range" } : fixture === "baseline-unqualified" ? { qualification: "unqualified", label: "Personal baseline", reason: "The available presentation data does not qualify a baseline." } : undefined}
        eventMarkers={fixture === "overlays" && points[7] ? [{ id: "event", time: points[7].time, label: "Selected saved event" }] : []}
        state={fixture === "loading" ? "loading" : fixture === "unavailable" ? "unavailable" : "ready"}
        stateTitle={fixture === "empty" ? "No qualified points in this range" : fixture === "loading" ? "Loading saved points" : fixture === "unavailable" ? "Saved points unavailable" : fixture === "one-point" ? "One exact point" : undefined}
        stateBody={fixture === "empty" ? "No line or empty-history inference has been drawn." : fixture === "one-point" ? "Another qualified point is required before a line can be drawn." : fixture === "unavailable" ? "The owning source could not be read. Existing records were not changed." : undefined}
        ownerAction={fixture === "unavailable" ? <Button onClick={() => setStatus("Owner action requested.")}>Open source owner</Button> : undefined}
      />
      {status ? <p className="chart-specimen__status" role="status">{status}</p> : null}
    </div></main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
