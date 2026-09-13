import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../features/life/today.css";
import "./today-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { Button, KoraSelect } from "../components/primitives";
import { TodayWorkspace, type TodayActionServices, type TodayContinuityReference, type TodayLoaders, type TodayPresentationScope } from "../features/life/TodayWorkspace";
import type { BrainPage, CalendarEvent, LifeOverview, LifeTodayFeed, WorkItem } from "../lib/runtime";
import { createSyntheticTodayDecisions } from "./today-large-fixture";

const fixtures = ["populated", "kora-proposal", "reviewed-proposal", "partial", "stale", "offline", "empty", "filtered-empty", "references", "conflict", "completion-success", "completion-error", "rollover", "dst-timezone", "kora-absent", "error", "unavailable", "restricted", "large", "long-copy", "loading", "loading-populated"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const NOW = "2026-08-27T12:00:00.000Z";

function calendarEvent(id: string, title: string, start: string, end: string): CalendarEvent {
  return { calendarId: "kora:personal", eventId: id, providerId: "kora", authority: "kora", title, start: { kind: "dateTime", instant: start, timeZone: "UTC" }, end: { kind: "dateTime", instant: end, timeZone: "UTC" }, allDay: false, viewerTimeZone: "UTC", status: "confirmed", availability: "busy", attendees: [], recurrence: [], syncState: "local", capabilities: { readable: true, writable: true, deletable: true, manageAttendees: false, editSeries: false, editOccurrence: false } };
}

function workItem(id: string, title: string, dueAt: string): WorkItem {
  return { id, kind: "commitment", commitmentDirection: "owed_by_user", title, state: "active", priority: 2, dueAt, provenance: "foreground:user_explicit", version: 1, createdAt: NOW, updatedAt: NOW };
}

function taskItem(id: string, title: string, dueAt: string): WorkItem {
  return { ...workItem(id, title, dueAt), kind: "task", commitmentDirection: undefined };
}

function withWork(feed: LifeTodayFeed, items: WorkItem[], settled: LifeTodayFeed["work"]["settled"]["items"] = []): LifeTodayFeed {
  return {
    ...feed,
    work: {
      current: {
        items: items.map((item) => ({ item, timing: "today" as const, due: { kind: "instant" as const, instant: item.dueAt!, viewerDate: feed.date }, canonicalRoute: `/work/tasks/${encodeURIComponent(item.id)}` })),
        totalCount: items.length,
        overdueCount: items.filter((item) => Date.parse(item.dueAt!) < Date.parse(feed.generatedAt)).length,
        todayCount: items.length,
        clipped: false,
      },
      future: { items: [], totalCount: 0, clipped: false },
      settled: { items: settled, totalCount: settled.length, clipped: false, order: "settled_at_descending" },
      order: "overdue_then_due_ascending_priority_descending",
      viewAllRoute: "/work/tasks",
    },
    dueCommitments: items,
  };
}

function baseFeed(): LifeTodayFeed {
  const reviewItem: WorkItem = { ...workItem("review", "Review the launch checklist", "2026-08-28T12:00:00.000Z"), attentionAt: "2026-08-27T13:15:00.000Z" };
  return {
    generatedAt: NOW, date: "2026-08-27", viewerTimeZone: "UTC", viewerTimeZoneAuthority: { source: "profile" },
    freshness: { state: "current", generatedAt: NOW, viewerDate: "2026-08-27", viewerTimeZone: "UTC", nextDayChangeAt: "2026-08-28T00:00:00.000Z" },
    assistantActivity: [{ scheduleName: "Morning brief", project: { id: "launch", title: "Studio launch" }, run: { id: "run-1", scheduleId: "schedule-1", occurrence: NOW, trigger: "automatic", state: "finished", attentionTier: "interrupt", reasonCode: null, detail: null, sessionId: "session-1", artifactId: null, resultText: "The portfolio review moved to 2 PM after your approval. Calendar now shows the approved time.", claimedAt: "2026-08-27T11:55:00.000Z", turnStartedAt: "2026-08-27T11:56:00.000Z", finishedAt: NOW } }],
    outcomes: { items: [{ id: "run-1", title: "Morning brief", summary: "The portfolio review moved to 2 PM after your approval. Calendar now shows the approved time.", occurredAt: NOW, relevance: { kind: "current_viewer_day", viewerDate: "2026-08-27" }, evidence: { kind: "schedule_run", scheduleId: "schedule-1", runId: "run-1", canonicalRoute: "/settings/schedules/schedule-1/runs/run-1" }, freshness: { state: "current", observedAt: NOW }, affectedObjects: [{ objectKind: "project", id: "launch", state: "current", title: "Studio launch", canonicalRoute: "/work/goals/launch" }] }], totalCount: 1, clipped: false, viewAllRoute: "/settings/schedules" },
    calendar: [
      calendarEvent("active", "Design review", "2026-08-27T11:30:00.000Z", "2026-08-27T12:30:00.000Z"),
      calendarEvent("next", "Call with Maya", "2026-08-27T13:00:00.000Z", "2026-08-27T13:30:00.000Z"),
      calendarEvent("later", "Portfolio review", "2026-08-27T14:00:00.000Z", "2026-08-27T15:00:00.000Z"),
      calendarEvent("later-evening", "Dinner with Jordan", "2026-08-27T18:00:00.000Z", "2026-08-27T19:00:00.000Z"),
    ],
    work: {
      current: {
        items: [
          { item: workItem("report", "Send Sarah the report", "2026-08-27T10:00:00.000Z"), timing: "today", due: { kind: "instant", instant: "2026-08-27T10:00:00.000Z", viewerDate: "2026-08-27" }, canonicalRoute: "/work/tasks/report" },
          { item: taskItem("proof", "Approve the print proof", "2026-08-27T16:30:00.000Z"), timing: "today", due: { kind: "instant", instant: "2026-08-27T16:30:00.000Z", viewerDate: "2026-08-27" }, canonicalRoute: "/work/tasks/proof" },
        ],
        totalCount: 2,
        overdueCount: 1,
        todayCount: 2,
        clipped: false,
      },
      attention: { items: [{ item: reviewItem, timing: "today", attention: { kind: "instant", instant: "2026-08-27T13:15:00.000Z", viewerDate: "2026-08-27" }, canonicalRoute: "/work/tasks/review" }], totalCount: 1, clipped: false },
      future: { items: [], totalCount: 0, clipped: false },
      settled: {
        items: [{ item: { ...taskItem("brief", "Send the morning brief", "2026-08-27T09:00:00.000Z"), state: "completed" }, disposition: "completed", settledAt: "2026-08-27T11:00:00.000Z", viewerDate: "2026-08-27", canonicalRoute: "/work/tasks/brief" }],
        totalCount: 1,
        clipped: false,
        order: "settled_at_descending",
      },
      order: "overdue_then_due_ascending_priority_descending",
      viewAllRoute: "/work/tasks",
    },
    dueCommitments: [
      workItem("report", "Send Sarah the report", "2026-08-27T10:00:00.000Z"),
      taskItem("proof", "Approve the print proof", "2026-08-27T16:30:00.000Z"),
    ],
    continuityReferences: [],
    pendingConfirmations: [{ id: "approval-1", toolName: "update_calendar_event", argumentsHash: "synthetic", state: "pending", owner: { kind: "foreground", sessionId: "session-1", nativeRunId: "run-1", toolCallId: "call-1" }, presentation: { action: "Notify Maya about Friday’s studio review", target: "Friday studio review", consequence: "This moves one event and sends an attendee update. Nothing changes until you approve the exact proposal.", risk: "external", calendar: { kind: "schedule_proposal", operation: "update", source: { authority: "kora", calendarId: "kora:personal", label: "My Kora calendar" }, scope: "Only Friday’s studio review", notifications: "all", affectedEvents: [{ calendarId: "kora:personal", eventId: "studio-review", title: "Friday studio review", fields: [{ name: "Start", before: "1:00 PM", after: "2:00 PM" }] }] } }, expiresAt: "2026-08-27T13:00:00.000Z", createdAt: NOW, updatedAt: NOW }],
    sources: { schedules: { state: "ok" }, calendar: { state: "ok" }, native_work: { state: "ok" }, confirmations: { state: "ok" } },
  };
}

function baseLife(): LifeOverview {
  return {
    generatedAt: NOW, status: "current", orientation: { currentSources: 3, needsReview: 0 }, rightNow: null, attentionCandidatesTotal: 2,
    next: [
      { id: "rent", kind: "obligation_due", domain: "money", title: "Studio rent is due", explanation: "A recorded local obligation is due this afternoon; payment status is not inferred.", horizon: "2026-08-27T14:00:00.000Z", sourceId: "money", sourceFreshness: "Confirmed at noon", destination: "/life/finances", priority: { consequence: 3, timeProximity: 3, userReviewRequired: true, sourceConfidence: 3 } },
      { id: "therapy", kind: "wellbeing_care", domain: "wellbeing", title: "Therapy appointment", explanation: "An explicitly recorded appointment begins this afternoon; no clinical interpretation is added.", horizon: "2026-08-27T15:00:00.000Z", sourceId: "wellbeing", sourceFreshness: "Local record updated today", destination: "/life/wellbeing/care", priority: { consequence: 2, timeProximity: 2, userReviewRequired: false, sourceConfidence: 3 } },
    ],
    signals: [],
    sources: [
      { id: "money", label: "Money", state: "current", authority: "Local finance ledger", lastSuccessfulRead: NOW, privacyEffect: "Only permitted summaries appear.", recoveryOwner: "kora" },
      { id: "wellbeing", label: "Wellbeing", state: "current", authority: "Local Wellbeing records", lastSuccessfulRead: NOW, privacyEffect: "Restricted records stay omitted.", recoveryOwner: "kora" },
      { id: "about_you", label: "About You", state: "current", authority: "Stable Profile and Memory", lastSuccessfulRead: NOW, privacyEffect: "Restricted records stay omitted.", recoveryOwner: "user" },
    ],
    thread: { items: [], complete: true }, restrictedOmitted: false,
  };
}

function recentPages(): BrainPage[] {
  return [
    { id: "page-studio", title: "Studio launch", kind: "goal", bodyMarkdown: "", provenance: "foreground:user_explicit", state: "active", version: 2, createdAt: "2026-08-24T13:00:00.000Z", updatedAt: "2026-08-27T11:40:00.000Z" },
    { id: "page-rhythm", title: "Weekly planning rhythm", kind: "note", bodyMarkdown: "", provenance: "foreground:user_explicit", state: "active", version: 1, createdAt: "2026-08-22T13:00:00.000Z", updatedAt: "2026-08-27T10:15:00.000Z" },
    { id: "page-vendors", title: "Production vendors", kind: "reference", bodyMarkdown: "", provenance: "foreground:user_explicit", state: "active", version: 3, createdAt: "2026-08-19T13:00:00.000Z", updatedAt: "2026-08-26T16:25:00.000Z" },
  ];
}

function values(selected: Fixture) {
  const feed = baseFeed();
  const life = baseLife();
  if (selected === "reviewed-proposal") return { feed: { ...feed, pendingConfirmations: [], outcomes: feed.outcomes ? { ...feed.outcomes, items: feed.outcomes.items.map((outcome) => ({ ...outcome, summary: "Moved the portfolio review to 2 PM after your approval. The exact Calendar record and run evidence remain available from their canonical owners." })) } : undefined }, life };
  if (selected === "empty") return { feed: withWork({ ...feed, assistantActivity: [], outcomes: undefined, calendar: [], pendingConfirmations: [] }, []), life: { ...life, next: [], attentionCandidatesTotal: 0 } };
  if (selected === "partial") return {
    feed: {
      ...feed,
      calendar: [],
      sources: { ...feed.sources, calendar: { state: "unavailable" as const, unavailableSources: ["Google Calendar"] } },
    },
    life: { ...life, next: [], attentionCandidatesTotal: 0 },
  };
  if (selected === "stale") return { feed: { ...feed, assistantActivity: [], outcomes: undefined, calendar: [calendarEvent("stale", "Last-confirmed planning block", "2026-08-27T13:00:00.000Z", "2026-08-27T14:00:00.000Z")].map((event) => ({ ...event, providerId: "google-workspace" as const, authority: "google" as const, syncState: "stale" as const, lastSyncedAt: "2026-08-26T18:00:00.000Z" })), sources: { ...feed.sources, calendar: { state: "partial" as const, unavailableSources: ["Google Calendar"] } } }, life: { ...life, next: [] } };
  if (selected === "offline") return { feed: { ...feed, assistantActivity: [], outcomes: undefined, calendar: [calendarEvent("local", "Write launch notes", "2026-08-27T13:00:00.000Z", "2026-08-27T13:30:00.000Z"), { ...calendarEvent("provider", "Last-confirmed provider call", "2026-08-27T14:00:00.000Z", "2026-08-27T14:30:00.000Z"), providerId: "google-workspace" as const, authority: "google" as const, syncState: "stale" as const, lastSyncedAt: "2026-08-26T18:00:00.000Z" }], sources: { ...feed.sources, calendar: { state: "partial" as const, unavailableSources: ["Google Calendar"] } } }, life: { ...life, next: [] } };
  if (selected === "filtered-empty" || selected === "references") return { feed: withWork({ ...feed, assistantActivity: [], outcomes: undefined, calendar: [], pendingConfirmations: [] }, []), life: { ...life, next: [], attentionCandidatesTotal: 0 } };
  if (selected === "conflict") return { feed: withWork({ ...feed, assistantActivity: [], outcomes: undefined, calendar: [calendarEvent("left", "Studio review", "2026-08-27T13:00:00.000Z", "2026-08-27T14:00:00.000Z"), calendarEvent("right", "Call with Maya", "2026-08-27T13:30:00.000Z", "2026-08-27T14:30:00.000Z")], pendingConfirmations: [] }, [workItem("draft", "Send the launch draft", "2026-08-27T13:45:00.000Z")]), life: { ...life, next: [] } };
  if (selected === "completion-success" || selected === "completion-error") return { feed: withWork(feed, [taskItem("report", "Send Sarah the report", "2026-08-27T10:00:00.000Z")]), life };
  if (selected === "dst-timezone") return { feed: { ...feed, generatedAt: "2026-11-01T06:00:00.000Z", date: "2026-11-01", viewerTimeZone: "America/New_York", assistantActivity: [], calendar: [{ ...calendarEvent("dst", "Fallback review", "2026-11-01T05:30:00.000Z", "2026-11-01T07:30:00.000Z"), start: { kind: "dateTime" as const, instant: "2026-11-01T05:30:00.000Z", timeZone: "America/New_York" }, end: { kind: "dateTime" as const, instant: "2026-11-01T07:30:00.000Z", timeZone: "America/New_York" } }], dueCommitments: [], pendingConfirmations: [] }, life: { ...life, next: [] } };
  if (selected === "kora-absent") return { feed: { ...feed, assistantActivity: [], outcomes: undefined }, life };
  if (selected === "unavailable") return { feed: { ...feed, sources: { ...feed.sources, calendar: { state: "unavailable" as const, unavailableSources: ["Google Calendar"] } } }, life: { ...life, status: "unavailable" as const, next: [], sources: life.sources.map((source) => ({ ...source, state: "unavailable" as const, limitation: `${source.label} could not be read.` })) } };
  if (selected === "restricted") return { feed, life: { ...life, restrictedOmitted: true } };
  if (selected === "large") { const items = Array.from({ length: 100 }, (_, index) => workItem(`work-${index}`, `Commitment ${index + 1}`, new Date(Date.parse(NOW) - index * 60_000).toISOString())); return { feed: withWork({ ...feed, calendar: Array.from({ length: 40 }, (_, index) => calendarEvent(`event-${index}`, `Calendar moment ${index + 1}`, new Date(Date.parse(NOW) + (index + 1) * 60_000).toISOString(), new Date(Date.parse(NOW) + (index + 2) * 60_000).toISOString())), pendingConfirmations: createSyntheticTodayDecisions(feed.pendingConfirmations[0]!) }, items), life: { ...life, next: [], attentionCandidatesTotal: 0 } }; }
  if (selected === "long-copy") return {
    feed: withWork({
      ...feed,
      assistantActivity: feed.assistantActivity.map((outcome) => ({ ...outcome, run: { ...outcome.run, resultText: "Kora recorded the approved change to the multi-part portfolio review and preserved the earlier owner-confirmed evidence so the decision can still be inspected without implying that any other calendar record was changed." } })),
      outcomes: feed.outcomes ? {
        ...feed.outcomes,
        items: feed.outcomes.items.map((outcome) => ({
          ...outcome,
          summary: "Kora recorded the approved change to the multi-part portfolio review and preserved the earlier owner-confirmed evidence so the decision can still be inspected without implying that any other calendar record was changed.",
        })),
      } : undefined,
      calendar: [calendarEvent("long", "Review the complete multilingual studio launch preparation packet with Maya and the independent production partners", "2026-08-27T11:30:00.000Z", "2026-08-27T12:30:00.000Z"), ...feed.calendar.slice(1)],
      pendingConfirmations: feed.pendingConfirmations.map((decision) => ({ ...decision, presentation: { ...decision.presentation, action: "Notify every confirmed attendee about the revised Friday studio review time", target: "Friday studio review with all confirmed production partners", consequence: "This sends an external attendee update and may notify people in different time zones; Today has not approved, edited, rejected, or sent anything." } })),
    }, [workItem("long-work", "Send the revised accessibility, licensing, insurance, and production-readiness report to every confirmed collaborator", "2026-08-27T10:00:00.000Z")]),
    life: { ...life, next: life.next.map((moment) => ({ ...moment, title: `${moment.title} — review the complete source-qualified details before leaving the owning area`, explanation: `${moment.explanation} This deliberately expanded copy verifies reflow without removing source, freshness, state, or the canonical action.` })) },
  };
  return { feed, life };
}

const selected = values(fixture);
let currentFeed = selected.feed;
let feedReads = 0;
const connectionPhase = fixture === "offline" ? "disconnected" as const : "ready" as const;
const currentInstant = fixture === "rollover" ? "2026-08-28T14:00:00.000Z" : fixture === "dst-timezone" ? "2026-11-01T06:00:00.000Z" : NOW;
const continuityReferences: TodayContinuityReference[] = fixture === "references" ? [
  { id: "archived", title: "Prepare studio permit", state: "archived", destination: "/work/archive?record=archived" },
  { id: "deleted", title: "This private deleted title is intentionally not rendered", state: "deleted" },
] : [];
const presentationScope: TodayPresentationScope | undefined = fixture === "filtered-empty" ? { label: "Completed only", onClear: () => undefined } : undefined;
let populateTransition: (() => void) | undefined;
const transitionLoaders: TodayLoaders = (() => {
  let resolveFeed!: (feed: LifeTodayFeed) => void;
  let resolveLife!: (life: LifeOverview) => void;
  const feedPromise = new Promise<LifeTodayFeed>((resolve) => { resolveFeed = resolve; });
  const lifePromise = new Promise<LifeOverview>((resolve) => { resolveLife = resolve; });
  populateTransition = () => {
    resolveFeed(selected.feed);
    resolveLife(selected.life);
  };
  return { feed: () => feedPromise, life: () => lifePromise, pages: async () => ({ items: [], complete: true }) };
})();
const loaders: TodayLoaders = fixture === "loading"
  ? { feed: () => new Promise<LifeTodayFeed>(() => undefined), life: () => new Promise<LifeOverview>(() => undefined), pages: async () => ({ items: [], complete: true }) }
  : fixture === "loading-populated"
    ? transitionLoaders
  : fixture === "error"
     ? { feed: async () => { throw new Error("Synthetic Today feed failure"); }, life: async () => selected.life, pages: async () => ({ items: [], complete: true }) }
     : { feed: async () => {
      feedReads += 1;
      if (fixture === "rollover" && feedReads > 1) currentFeed = {
        ...currentFeed,
        generatedAt: "2026-08-28T14:00:00.000Z",
        date: "2026-08-28",
        calendar: [],
        assistantActivity: [],
        outcomes: undefined,
        freshness: { ...currentFeed.freshness, generatedAt: "2026-08-28T14:00:00.000Z", viewerDate: "2026-08-28", nextDayChangeAt: "2026-08-29T00:00:00.000Z" },
      };
      return currentFeed;
     }, life: async () => selected.life, pages: async () => ({ items: fixture === "empty" || fixture === "filtered-empty" ? [] : recentPages(), complete: true }) };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let failCompletion = fixture === "completion-error";
const actionServices: TodayActionServices = {
  completeWorkItem: async (id, expectedVersion) => {
    if (failCompletion) {
      failCompletion = false;
      throw new Error("Synthetic Work completion could not settle.");
    }
    const record = currentFeed.work.current.items.find((entry) => entry.item.id === id)?.item ?? taskItem(id, "Completed synthetic task", NOW);
    const remaining = currentFeed.work.current.items.filter((entry) => entry.item.id !== id).map((entry) => entry.item);
    currentFeed = withWork(currentFeed, remaining, [{ item: { ...record, state: "completed", version: expectedVersion + 1 }, disposition: "completed", settledAt: NOW, viewerDate: currentFeed.date, canonicalRoute: `/work/tasks/${encodeURIComponent(id)}` }]);
    return { status: "settled", record: { ...record, state: "completed", version: expectedVersion + 1 }, replayed: false };
  },
};

function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }

function SyntheticDestination() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <section className="today-specimen__destination">
      <h1 tabIndex={-1}>Synthetic linked record</h1>
      <p>{location.pathname}</p>
      <Button onClick={() => navigate(-1)}>Back to Today</Button>
    </section>
  );
}

function Specimen() {
  return <main className="today-specimen" id="main-content">
    <header className="today-specimen__controls"><div><strong>Today capability matrix</strong><span>Synthetic state only · no product or provider mutation</span></div><div className="today-specimen__control-actions">{fixture === "loading-populated" ? <Button onClick={() => populateTransition?.()}>Populate Today</Button> : null}<KoraSelect label="Today fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value }))} onValueChange={choose} /></div></header>
    <MemoryRouter initialEntries={["/life/today"]}><QueryClientProvider client={queryClient}><ViewBarProvider><ViewBar /><Routes><Route path="/life/today" element={<TodayWorkspace onAskKora={() => undefined} loaders={loaders} actionServices={actionServices} requestKey={fixture} connectionPhase={connectionPhase} currentInstant={currentInstant} continuityReferences={continuityReferences} presentationScope={presentationScope} />} /><Route path="*" element={<SyntheticDestination />} /></Routes></ViewBarProvider></QueryClientProvider></MemoryRouter>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
