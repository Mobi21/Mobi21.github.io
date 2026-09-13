import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../features/life/life-overview.css";
import "./life-overview-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { LifeOverviewWorkspace, type LifeOverviewPageLoader } from "../features/life/LifeOverviewWorkspace";
import type { LifeOverview, LifeOverviewMoment, LifeOverviewSource, LifeOverviewThreadEvent } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = [
  "steady-populated", "one-focal", "many-attention", "amounts-hidden",
  "partial-money", "partial-wellbeing", "all-unavailable", "not-configured",
  "restricted-omitted", "projection-error",
  "loading", "empty-thread", "thread-12", "thread-504", "long-copy",
] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "one-focal";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const currentSources: LifeOverviewSource[] = [
  { id: "money", label: "Money", state: "current", authority: "Kora finance ledger and connected account reads", lastSuccessfulRead: "2026-08-27T10:42:00.000Z", privacyEffect: "Amounts stay local and can be hidden without changing the underlying records.", recoveryOwner: "kora" },
  { id: "wellbeing", label: "Wellbeing", state: "current", authority: "Kora Wellbeing record authority", lastSuccessfulRead: "2026-08-27T08:15:00.000Z", privacyEffect: "Restricted Wellbeing records are omitted unless separately authorized.", recoveryOwner: "kora" },
  { id: "about_you", label: "About You", state: "current", authority: "Kora local profile", lastSuccessfulRead: "2026-08-26T19:30:00.000Z", privacyEffect: "Restricted personal details are omitted unless separately authorized.", recoveryOwner: "kora" },
];

function moment(id: string, title: string, horizon: string, consequence: 1 | 2 | 3 = 2): LifeOverviewMoment {
  return { id, kind: "obligation_due", domain: "money", title, explanation: "A recorded obligation is approaching and may affect your near-term plan.", horizon, sourceId: "money", sourceFreshness: "2026-08-27T10:42:00.000Z", destination: "/life/finances", priority: { consequence, timeProximity: consequence, userReviewRequired: true, sourceConfidence: 3 } };
}

const upcoming = [
  moment("bill:utilities", "Utilities are due Saturday", "2026-08-29T16:00:00.000Z"),
  moment("bill:insurance", "Insurance is due Monday", "2026-08-31T16:00:00.000Z"),
  moment("bill:subscription", "Music subscription renews next week", "2026-09-03T16:00:00.000Z", 1),
];

const thread: LifeOverviewThreadEvent[] = [
  { id: "thread:care", kind: "wellbeing_logged", domain: "wellbeing", occurredAt: "2026-08-27T08:15:00.000Z", title: "Morning care context updated", detail: "A permitted wellbeing moment was recorded locally.", destination: "/life/wellbeing", sourceId: "wellbeing" },
  { id: "thread:preference", kind: "preference_confirmed", domain: "about_you", occurredAt: "2026-08-26T19:30:00.000Z", title: "Planning preference confirmed", detail: "A detail used to personalize Kora was confirmed.", destination: "/life/about-you", sourceId: "about_you" },
  { id: "thread:rent", kind: "obligation_due", domain: "money", occurredAt: "2026-08-26T12:00:00.000Z", title: "Rent entered the review horizon", detail: "A recorded obligation is now close enough to review.", destination: "/life/finances", sourceId: "money" },
];

function threadEvents(count: number): LifeOverviewThreadEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const wellbeing = index % 3 === 0;
    const occurredAt = new Date(Date.parse("2026-08-27T11:45:00.000Z") - index * 3_600_000).toISOString();
    return {
      id: `thread:large:${index}`,
      kind: wellbeing ? "wellbeing_logged" : "preference_confirmed",
      domain: wellbeing ? "wellbeing" : "about_you",
      occurredAt,
      title: wellbeing ? "Wellbeing context updated" : "Personal detail confirmed",
      detail: wellbeing ? "A permitted wellbeing moment was recorded locally." : "A detail used to personalize Kora was confirmed.",
      destination: wellbeing ? "/life/wellbeing" : "/life/about-you",
      sourceId: wellbeing ? "wellbeing" : "about_you",
    } satisfies LifeOverviewThreadEvent;
  });
}

const twelveThread = threadEvents(12);
const largeThread = threadEvents(504);

function overviewFor(selected: Fixture): LifeOverview {
  const sourceStateFixture = ["partial-money", "partial-wellbeing", "all-unavailable", "not-configured", "restricted-omitted"].includes(selected);
  const threadFixture = ["empty-thread", "thread-12", "thread-504"].includes(selected);
  const steady = selected === "steady-populated" || sourceStateFixture || threadFixture;
  const many = selected === "many-attention";
  const projectedSources = sourcesFor(selected);
  const longCopy = selected === "long-copy";
  const rightNow = steady ? null : moment("bill:rent", longCopy ? "Confirm the unusually detailed recurring housing obligation before the next planning window closes" : many ? "Rent is overdue" : "Rent is due tomorrow", many ? "2026-08-26T16:00:00.000Z" : "2026-08-28T16:00:00.000Z", 3);
  const next = steady || sourceStateFixture ? [] : many ? upcoming : upcoming.slice(0, 2);
  const moneySource = projectedSources[0], wellbeingSource = projectedSources[1], aboutSource = projectedSources[2];
  const status: LifeOverview["status"] = selected === "all-unavailable" ? "unavailable" : selected === "not-configured" ? "setup" : selected === "partial-money" || selected === "partial-wellbeing" ? "partial" : rightNow ? "review" : "current";
  const overview: LifeOverview = {
    generatedAt: "2026-08-27T12:00:00.000Z",
    status,
    orientation: { currentSources: projectedSources.filter((source) => source.state === "current").length, needsReview: rightNow ? 1 : 0 },
    rightNow,
    attentionCandidatesTotal: sourceStateFixture ? 0 : many ? 12 : rightNow ? 3 : 1,
    next,
    signals: [
      {
        domain: "money", label: longCopy ? "Money and recurring obligations" : "Money",
        state: moneySource.state === "unavailable" ? "Current position unavailable" : moneySource.state === "not_configured" ? "Ready to set up" : "3 obligations this week",
        support: moneySource.state === "partial" ? "Using last-confirmed local records; connected coverage is incomplete." : moneySource.state === "unavailable" ? "No current money summary is being inferred from missing coverage." : moneySource.state === "not_configured" ? "Add only the money context that is useful to you." : "Review what is due before treating the rest as available.",
        destination: "/life/finances", sourceId: "money", updatedAt: moneySource.lastSuccessfulRead,
        ...(moneySource.state === "current" || moneySource.state === "partial" ? { amountMinor: 157299, currency: "USD" } : {}),
      },
      {
        domain: "wellbeing", label: longCopy ? "Wellbeing and personal care context" : "Wellbeing",
        state: wellbeingSource.state === "unavailable" ? "Wellbeing unavailable" : wellbeingSource.state === "not_configured" ? "Ready to set up" : wellbeingSource.state === "partial" ? "Care context last confirmed" : "Care context is current",
        support: wellbeingSource.state === "partial" ? "Some permitted wellbeing context could not be refreshed." : wellbeingSource.state === "unavailable" ? "No wellbeing state is being inferred from unavailable records." : wellbeingSource.state === "not_configured" ? "Add only the wellbeing context that is useful to you." : "Recent permitted wellbeing context is available.",
        destination: "/life/wellbeing", sourceId: "wellbeing", updatedAt: wellbeingSource.lastSuccessfulRead,
      },
      {
        domain: "about_you", label: longCopy ? "About You and confirmed preferences" : "About You",
        state: aboutSource.state === "unavailable" ? "Personal context unavailable" : aboutSource.state === "not_configured" ? "Ready to set up" : "1 detail changed recently",
        support: aboutSource.state === "unavailable" ? "No personal state is being inferred from unavailable records." : aboutSource.state === "not_configured" ? "Confirm only the personal details Kora should use." : "Review or correct what Kora uses to personalize your experience.",
        destination: "/life/about-you", sourceId: "about_you", updatedAt: aboutSource.lastSuccessfulRead,
      },
    ],
    sources: projectedSources,
    thread: { items: selected === "all-unavailable" || selected === "not-configured" ? [] : thread, complete: true },
    restrictedOmitted: selected === "restricted-omitted",
  };
  if (selected === "empty-thread") overview.thread = { items: [], complete: true };
  if (selected === "thread-12") overview.thread = { items: twelveThread, complete: true };
  if (longCopy) {
    overview.rightNow = rightNow ? { ...rightNow, explanation: "A last-confirmed personal obligation with an intentionally long translated description is approaching; review its source and timing before treating the remaining balance as available." } : null;
    overview.next = [moment("bill:long-next", "Confirm the annual household insurance renewal and its updated coverage details", "2026-08-31T16:00:00.000Z")];
    overview.signals = overview.signals.map((signal) => ({ ...signal, support: `${signal.support} This intentionally extended localized explanation verifies wrapping without hiding source confidence or the owning destination.` }));
    overview.sources = overview.sources.map((source) => ({ ...source, label: `${source.label} source with a deliberately extended localized name` }));
  }
  return overview;
}

function sourcesFor(selected: Fixture): LifeOverviewSource[] {
  const result = currentSources.map((source) => ({ ...source }));
  if (selected === "partial-money") result[0] = { ...result[0], state: "partial", limitation: "Plaid connected-account reads are unavailable.", recoveryOwner: "provider" };
  if (selected === "partial-wellbeing") result[1] = { ...result[1], state: "partial", limitation: "Some permitted wellbeing records could not be refreshed.", recoveryOwner: "kora" };
  if (selected === "all-unavailable") return result.map((source) => ({ ...source, state: "unavailable", limitation: `${source.label} could not be read from its current authority.`, recoveryOwner: source.id === "money" ? "provider" : "kora" }));
  if (selected === "not-configured") return result.map((source) => ({ ...source, state: "not_configured", lastSuccessfulRead: undefined, limitation: `No ${source.label.toLocaleLowerCase()} source is established.`, recoveryOwner: "user" }));
  return result;
}

const loadFixture: LifeOverviewPageLoader = async (cursor, pageSize = 12) => {
  if (fixture === "projection-error") throw new Error("Synthetic Life projection failure");
  if (fixture === "loading") return new Promise<LifeOverview>(() => undefined);
  if (fixture === "thread-504") {
    const overview = overviewFor(fixture);
    const offset = cursor ? Number(cursor) : 0;
    const items = largeThread.slice(offset, offset + pageSize);
    const complete = offset + items.length >= largeThread.length;
    overview.thread = { items, ...(complete ? {} : { cursor: String(offset + items.length) }), complete };
    return overview;
  }
  return overviewFor(fixture);
};

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function Specimen() {
  return <main className="life-overview-specimen" id="main-content">
    <header className="life-overview-specimen__controls">
      <div><strong>Life overview qualification</strong><span>Synthetic, sanitized projection · no product or provider mutation</span></div>
      <KoraSelect label="Life fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} />
    </header>
    <MemoryRouter initialEntries={["/life"]}>
      <QueryClientProvider client={queryClient}>
        <ViewBarProvider>
          <SyntheticAmountPrivacy hidden={fixture === "amounts-hidden"} />
          <ViewBar />
          <LifeOverviewWorkspace onAskKora={() => undefined} loadPage={loadFixture} requestKey={fixture} />
        </ViewBarProvider>
      </QueryClientProvider>
    </MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
