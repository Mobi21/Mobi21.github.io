import "@fontsource-variable/mona-sans";
import axe from "axe-core";
import "../styles/tokens.css";
import "./route-qualification-harness.css";
import {
  routeQualificationTargets,
  routeQualificationViewports,
  type RouteQualificationTarget,
  type RouteQualificationViewport,
} from "./route-qualification-manifest";

type QualificationResult = {
  routeId: string;
  routeLabel: string;
  family: RouteQualificationTarget["family"];
  viewportId: string;
  width: number;
  height: number;
  status: "pass" | "fail";
  issues: string[];
  heading: string;
  clientWidth: number;
  scrollWidth: number;
  accessibility?: {
    violations: string[];
    incomplete: number;
    passes: number;
  };
};

type QualificationReport = {
  status: "idle" | "running" | "pass" | "fail";
  startedAt?: string;
  finishedAt?: string;
  total: number;
  completed: number;
  failed: number;
  results: QualificationResult[];
};

type AxeWindow = Window & { axe?: typeof axe };

declare global {
  interface Window {
    __KORA_ROUTE_QUALIFICATION__: QualificationReport;
  }
}

const params = new URLSearchParams(window.location.search);
const familyFilter = params.get("family");
const routeFilter = params.get("route");
const widthFilter = Number(params.get("width"));
const targets = routeQualificationTargets.filter((target) =>
  (!familyFilter || target.family === familyFilter) && (!routeFilter || target.id === routeFilter));
const viewports = routeQualificationViewports.filter((viewport) =>
  !Number.isFinite(widthFilter) || widthFilter <= 0 || viewport.width === widthFilter);

const report: QualificationReport = {
  status: "idle",
  total: targets.length * viewports.length,
  completed: 0,
  failed: 0,
  results: [],
};
window.__KORA_ROUTE_QUALIFICATION__ = report;

const root = document.getElementById("root");
if (!root) throw new Error("Route qualification root is unavailable.");

root.innerHTML = `
  <main class="qualification">
    <header class="qualification__header">
      <div>
        <h1>Route-family qualification</h1>
        <p>Real synthetic specimen owners are rendered at every reconstruction viewport. The gate fails on a blank root, a missing main landmark, a missing heading, or page-level horizontal overflow.</p>
      </div>
      <div class="qualification__actions">
        <select id="qualification-family" aria-label="Route family">
          <option value="">All families</option>
          ${[...new Set(routeQualificationTargets.map((target) => target.family))].map((family) => `<option value="${family}"${family === familyFilter ? " selected" : ""}>${family}</option>`).join("")}
        </select>
        <button id="qualification-run" type="button">Run qualification</button>
      </div>
    </header>
    <section class="qualification__summary" aria-label="Qualification summary">
      <div class="qualification__metric"><span>Routes</span><strong id="qualification-routes">${targets.length}</strong></div>
      <div class="qualification__metric"><span>Checks</span><strong id="qualification-completed">0 / ${report.total}</strong></div>
      <div class="qualification__metric" data-tone="pass"><span>Passed</span><strong id="qualification-passed">0</strong></div>
      <div class="qualification__metric" data-tone="fail"><span>Failed</span><strong id="qualification-failed">0</strong></div>
    </section>
    <p class="qualification__current" id="qualification-current" role="status" aria-live="polite">Ready to inspect rendered specimens.</p>
    <script id="qualification-report" type="application/json"></script>
    <table class="qualification__results">
      <thead><tr><th>Route</th><th>Viewport</th><th>Result</th><th>Evidence</th></tr></thead>
      <tbody id="qualification-results"></tbody>
    </table>
    <iframe class="qualification__frame" id="qualification-frame" title="Route under qualification"></iframe>
  </main>`;

const frame = document.getElementById("qualification-frame") as HTMLIFrameElement;
const runButton = document.getElementById("qualification-run") as HTMLButtonElement;
const familySelect = document.getElementById("qualification-family") as HTMLSelectElement;
const completedNode = document.getElementById("qualification-completed")!;
const passedNode = document.getElementById("qualification-passed")!;
const failedNode = document.getElementById("qualification-failed")!;
const currentNode = document.getElementById("qualification-current")!;
const resultsNode = document.getElementById("qualification-results")!;
const reportNode = document.getElementById("qualification-report")!;

familySelect.addEventListener("change", () => {
  const next = new URL(window.location.href);
  if (familySelect.value) next.searchParams.set("family", familySelect.value);
  else next.searchParams.delete("family");
  next.searchParams.delete("route");
  window.location.href = next.href;
});

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

async function nextPaint(win: Window) {
  await new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
}

function specimenUrl(target: RouteQualificationTarget) {
  const url = new URL(target.href, window.location.origin);
  const access = params.get("access");
  if (access) url.searchParams.set("access", access);
  return url.href;
}

async function loadTarget(target: RouteQualificationTarget) {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Specimen load timed out after 10 seconds.")), 10_000);
    frame.onload = () => { window.clearTimeout(timeout); resolve(); };
    frame.onerror = () => { window.clearTimeout(timeout); reject(new Error("Specimen document failed to load.")); };
    frame.src = specimenUrl(target);
  });
}

async function inspect(target: RouteQualificationTarget, viewport: RouteQualificationViewport): Promise<QualificationResult> {
  const doc = frame.contentDocument;
  const issues: string[] = [];
  if (!doc) {
    issues.push("The specimen document is inaccessible.");
    return { routeId: target.id, routeLabel: target.label, family: target.family, viewportId: viewport.id, width: viewport.width, height: viewport.height, status: "fail", issues, heading: "", clientWidth: 0, scrollWidth: 0 };
  }

  const specimenRoot = doc.getElementById("root");
  const main = doc.querySelector("main, [role='main']");
  const heading = doc.querySelector<HTMLElement>("h1, [role='heading'][aria-level='1']")
    ?? main?.querySelector<HTMLElement>("h2, h3, h4, h5, h6, [role='heading']")
    ?? doc.querySelector<HTMLElement>("h2, h3, h4, h5, h6, [role='heading']");
  const meaningfulRoot = Boolean(specimenRoot?.childElementCount) && Boolean(specimenRoot?.textContent?.trim() || specimenRoot?.querySelector("svg, canvas, img, [aria-label]"));
  if (!meaningfulRoot) issues.push("Blank or unmounted #root.");
  if (!main) issues.push("Missing main landmark.");
  if (!heading) issues.push("Missing heading.");
  if (doc.querySelector("vite-error-overlay")) issues.push("Vite reported a render or compile error.");

  const clientWidth = doc.documentElement.clientWidth;
  const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0);
  if (scrollWidth > clientWidth + 1) issues.push(`Page overflow: ${scrollWidth}px content exceeds ${clientWidth}px viewport.`);

  let accessibility: QualificationResult["accessibility"];
  if (viewport.id === "desktop-1440") {
    try {
      const specimenWindow = frame.contentWindow as AxeWindow | null;
      if (!specimenWindow) throw new Error("The specimen window is inaccessible.");
      if (!specimenWindow.axe) {
        const script = doc.createElement("script");
        script.dataset.koraQualificationAxe = "true";
        script.textContent = axe.source;
        doc.head.append(script);
      }
      if (!specimenWindow.axe) throw new Error("The accessibility engine did not initialize in the specimen window.");
      const results = await specimenWindow.axe.run(doc, {
        resultTypes: ["violations", "incomplete", "passes"],
        rules: target.id === "tooltip" ? { region: { enabled: false } } : undefined,
      });
      const violations = results.violations.map((violation) => {
        const targets = violation.nodes.slice(0, 3).flatMap((node) => node.target).join(", ");
        return `${violation.id} (${violation.nodes.length}${targets ? `: ${targets}` : ""})`;
      });
      accessibility = {
        violations,
        incomplete: results.incomplete.length,
        passes: results.passes.length,
      };
      if (violations.length) issues.push(`Accessibility: ${violations.join(", ")}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Accessibility scan failed: ${message}`);
      accessibility = { violations: ["scan-error"], incomplete: 0, passes: 0 };
    }
  }

  return {
    routeId: target.id,
    routeLabel: target.label,
    family: target.family,
    viewportId: viewport.id,
    width: viewport.width,
    height: viewport.height,
    status: issues.length ? "fail" : "pass",
    issues,
    heading: heading?.textContent?.trim().replace(/\s+/g, " ") ?? "",
    clientWidth,
    scrollWidth,
    accessibility,
  };
}

async function waitForStructure() {
  const deadline = performance.now() + 8_000;
  while (performance.now() < deadline) {
    const doc = frame.contentDocument;
    if (doc?.getElementById("root")?.childElementCount && doc.querySelector("main, [role='main']") && doc.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']")) return;
    await wait(50);
  }
}

function appendResult(result: QualificationResult) {
  const row = document.createElement("tr");
  row.className = "qualification__result";
  row.dataset.status = result.status;
  const evidence = result.issues.length
    ? result.issues.join(" ")
    : `${result.heading || "Heading present"}; ${result.scrollWidth}px content / ${result.clientWidth}px viewport.${result.accessibility ? ` Accessibility: ${result.accessibility.passes} checks passed, ${result.accessibility.incomplete} need manual review.` : ""}`;
  row.innerHTML = `<td><strong>${result.routeLabel}</strong><br><span>${result.family}</span></td><td>${result.width} × ${result.height}</td><td class="qualification__status">${result.status.toUpperCase()}</td><td class="qualification__issues"></td>`;
  row.lastElementChild!.textContent = evidence;
  resultsNode.append(row);
}

function updateSummary() {
  completedNode.textContent = `${report.completed} / ${report.total}`;
  passedNode.textContent = String(report.completed - report.failed);
  failedNode.textContent = String(report.failed);
  reportNode.textContent = JSON.stringify(report);
}

async function run() {
  if (report.status === "running") return;
  report.status = "running";
  report.startedAt = new Date().toISOString();
  report.finishedAt = undefined;
  report.completed = 0;
  report.failed = 0;
  report.results = [];
  resultsNode.replaceChildren();
  runButton.disabled = true;
  runButton.textContent = "Running…";
  document.documentElement.dataset.qualificationStatus = "running";
  updateSummary();

  for (const target of targets) {
    let loadError: Error | undefined;
    frame.width = String(viewports[0]?.width ?? 680);
    frame.height = String(viewports[0]?.height ?? 620);
    currentNode.textContent = `Loading ${target.label}…`;
    try {
      await loadTarget(target);
      await waitForStructure();
      const fonts = frame.contentDocument?.fonts.ready;
      if (fonts) await Promise.race([fonts, wait(1_000)]);
    } catch (error) {
      loadError = error instanceof Error ? error : new Error(String(error));
    }

    for (const viewport of viewports) {
      currentNode.textContent = `Inspecting ${target.label} at ${viewport.width} × ${viewport.height}…`;
      frame.width = String(viewport.width);
      frame.height = String(viewport.height);
      if (frame.contentWindow) await nextPaint(frame.contentWindow);
      await wait(80);
      const result = loadError
        ? { routeId: target.id, routeLabel: target.label, family: target.family, viewportId: viewport.id, width: viewport.width, height: viewport.height, status: "fail" as const, issues: [loadError.message], heading: "", clientWidth: 0, scrollWidth: 0 }
        : await inspect(target, viewport);
      report.results.push(result);
      report.completed += 1;
      if (result.status === "fail") report.failed += 1;
      appendResult(result);
      updateSummary();
    }
  }

  report.finishedAt = new Date().toISOString();
  report.status = report.failed ? "fail" : "pass";
  updateSummary();
  document.documentElement.dataset.qualificationStatus = report.status;
  currentNode.textContent = report.failed
    ? `Qualification failed: ${report.failed} of ${report.total} rendered checks need attention.`
    : `Qualification passed: ${report.total} rendered checks across ${targets.length} routes.`;
  runButton.disabled = false;
  runButton.textContent = "Run again";
}

runButton.addEventListener("click", () => void run());
void run();
