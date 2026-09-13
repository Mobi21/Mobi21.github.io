import type { CalendarEvent, CalendarEventDraft, CalendarMutationOutcome, CalendarSource, NativeToolConfirmation } from "../lib/runtime";
import type { CalendarWorkspaceServices } from "../features/calendar/CalendarWorkspace";
import type { ConnectionPhase } from "../app/connection-context";

export const calendarWorkspaceFixtures = [
  "connected-populated", "active-view-loading", "true-empty", "selected-source-empty", "selected-source-partial",
  "event-current", "event-edit", "edit-failure", "version-conflict", "delete-failure", "create-local",
  "local-people-reference", "dirty-dismiss", "missing-event", "unavailable", "semantic-month-context",
  "zero-selected", "offline", "range-unavailable", "event-error", "restricted-read-only", "retained-refresh-error", "stale-connected-event",
  "waiting-confirmation", "uncertain-outcome", "restore-failure", "long-copy", "large-agenda-1000",
  "dst-spring", "dst-fall", "long-spanning-event", "overlap-all-day-large", "schedule-proposal",
] as const;
export type CalendarWorkspaceFixture = typeof calendarWorkspaceFixtures[number];

const capabilities = { readable: true, writable: true, deletable: true, manageAttendees: true, editSeries: true, editOccurrence: true };
export const localCalendarSource: CalendarSource = { calendarId: "kora:personal", name: "My Kora calendar", providerId: "kora", authority: "kora", primary: true, selected: true, color: "#fc815c", accessRole: "owner", writable: true, status: "available", syncState: "local" };
export const googleCalendarSource: CalendarSource = { calendarId: "google:personal", name: "Personal Google", providerId: "google-workspace", authority: "google", primary: false, selected: true, color: "#7f8cff", accessRole: "owner", writable: true, status: "available", syncState: "synced", lastSyncedAt: "2026-08-19T11:42:00Z" };

function timed(eventId: string, title: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { calendarId: localCalendarSource.calendarId, eventId, providerId: "kora", authority: "kora", title, start: { kind: "dateTime", instant: start, timeZone: "America/New_York" }, end: { kind: "dateTime", instant: end, timeZone: "America/New_York" }, allDay: false, viewerTimeZone: "America/New_York", status: "confirmed", availability: "busy", attendees: [], recurrence: [], revision: "r1", syncState: "local", capabilities, ...overrides };
}

function allDay(eventId: string, title: string, start: string, end: string): CalendarEvent {
  return { ...timed(eventId, title, `${start}T12:00:00Z`, `${end}T12:00:00Z`), start: { kind: "date", date: start }, end: { kind: "date", date: end }, allDay: true };
}

export const primaryCalendarEvent = timed("portfolio-review", "Portfolio review", "2026-08-19T14:00:00Z", "2026-08-19T15:00:00Z", { description: "Review the final case-study sequence before publishing.", location: "Studio desk" });
const ordinaryEvents = [
  allDay("submission-window", "Portfolio submission window", "2026-08-18", "2026-08-21"),
  primaryCalendarEvent,
  timed("lunch", "Lunch with Jordan", "2026-08-19T16:30:00Z", "2026-08-19T17:30:00Z"),
  timed("writing", "Case-study writing block", "2026-08-20T13:00:00Z", "2026-08-20T15:30:00Z"),
];

function largeEvents() {
  const overlaps = Array.from({ length: 18 }, (_, index) => timed(`overlap-${index}`, `Studio review ${index + 1}`, `2026-08-19T${String(13 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}:00Z`, `2026-08-19T${String(15 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}:00Z`));
  const agenda = Array.from({ length: 232 }, (_, index) => timed(`large-${index}`, `Scheduled commitment ${index + 1}`, `2026-08-${String(1 + (index % 28)).padStart(2, "0")}T${String(12 + (index % 8)).padStart(2, "0")}:00:00Z`, `2026-08-${String(1 + (index % 28)).padStart(2, "0")}T${String(13 + (index % 8)).padStart(2, "0")}:00:00Z`));
  return [allDay("retreat", "Writing retreat", "2026-08-17", "2026-08-22"), ...overlaps, ...agenda];
}

function qualificationAgendaEvents() {
  return Array.from({ length: 1_000 }, (_, index) => {
    const day = 19 + (index % 13);
    const date = day <= 31 ? `2026-08-${String(day).padStart(2, "0")}` : `2026-09-${String(day - 31).padStart(2, "0")}`;
    const hour = 5 + (index % 18);
    const minute = (Math.floor(index / 18) % 4) * 15;
    return timed(`qualification-${index}`, `Commitment ${String(index + 1).padStart(4, "0")}`, `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`, `${date}T${String(Math.min(23, hour + 1)).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`, { calendarId: `synthetic:${index % 20}`, providerId: "kora", authority: "kora", syncState: "local" });
  });
}

function qualificationSources(): CalendarSource[] {
  return Array.from({ length: 20 }, (_, index) => ({ ...localCalendarSource, calendarId: `synthetic:${index}`, name: `Calendar ${String(index + 1).padStart(2, "0")}`, primary: index === 0, color: `hsl(${index * 18} 62% 58%)` }));
}

const readOnlySource: CalendarSource = { ...googleCalendarSource, calendarId: "google:reader", name: "Shared family schedule", accessRole: "reader", writable: false };
const readOnlyEvent = timed("shared-appointment", "Shared appointment", "2026-08-19T17:00:00Z", "2026-08-19T18:00:00Z", { calendarId: readOnlySource.calendarId, providerId: "google-workspace", authority: "google", syncState: "synced", capabilities: { ...capabilities, writable: false, deletable: false, manageAttendees: false, editSeries: false, editOccurrence: false } });
const staleSource: CalendarSource = { ...googleCalendarSource, calendarId: "google:stale", name: "Last-confirmed work calendar", status: "degraded", syncState: "stale", writable: false };
const staleEvent = timed("stale-review", "Review awaiting connection", "2026-08-19T19:00:00Z", "2026-08-19T20:00:00Z", { calendarId: staleSource.calendarId, providerId: "google-workspace", authority: "google", syncState: "stale", lastSyncedAt: "2026-08-18T16:00:00Z", capabilities: { ...capabilities, writable: false, deletable: false } });
const offlineGoogleSource: CalendarSource = { ...googleCalendarSource, status: "degraded", syncState: "stale", writable: false, lastSyncedAt: "2026-08-18T16:00:00Z" };
const offlineProviderEvent = timed("provider-last-confirmed", "Neighborhood planning call", "2026-08-19T18:00:00Z", "2026-08-19T18:45:00Z", { calendarId: offlineGoogleSource.calendarId, providerId: "google-workspace", authority: "google", syncState: "stale", lastSyncedAt: "2026-08-18T16:00:00Z", capabilities: { ...capabilities, writable: false, deletable: false } });
const providerEvent = timed("provider-review", "Provider-backed review", "2026-08-19T14:00:00Z", "2026-08-19T15:00:00Z", { calendarId: googleCalendarSource.calendarId, providerId: "google-workspace", authority: "google", syncState: "synced" });
const scheduleProposalEvent = timed("weekly-planning", "Weekly planning block", "2026-08-19T14:00:00Z", "2026-08-19T15:00:00Z", { description: "Synthetic planning time.", location: "Desk" });
const scheduleProposalConfirmation: NativeToolConfirmation = {
  id: "synthetic-schedule-proposal",
  toolName: "update_kora_calendar_event",
  argumentsHash: "synthetic-exact-arguments-hash",
  state: "pending",
  owner: { kind: "schedule", sessionId: "synthetic-session", scheduleRunId: "synthetic-run", toolCallId: "synthetic-calendar-tool-call" },
  presentation: {
    action: "Update Calendar event",
    target: "Weekly planning block",
    consequence: "Kora will update this private Kora event once. No guests will be notified.",
    risk: "private",
    calendar: {
      kind: "schedule_proposal",
      operation: "update",
      source: { authority: "kora", calendarId: localCalendarSource.calendarId, label: localCalendarSource.name },
      scope: "Only this event occurrence",
      notifications: "none",
      affectedEvents: [{
        calendarId: localCalendarSource.calendarId,
        eventId: scheduleProposalEvent.eventId,
        title: scheduleProposalEvent.title,
        fields: [
          { name: "start", before: "10:00 AM", after: "11:00 AM" },
          { name: "end", before: "11:00 AM", after: "12:00 PM" },
          { name: "location", before: "Desk", after: "Library focus room" },
        ],
      }],
    },
  },
  expiresAt: "2099-08-31T22:00:00Z",
  createdAt: "2026-08-19T13:55:00Z",
  updatedAt: "2026-08-19T13:55:00Z",
};
const waitingConfirmation: NativeToolConfirmation = {
  id: "synthetic-confirmation",
  toolName: "update_google_calendar_event",
  argumentsHash: "synthetic-provider-arguments-hash",
  state: "pending",
  owner: { kind: "foreground", sessionId: "synthetic-session", nativeRunId: "synthetic-calendar-run", toolCallId: "synthetic-calendar-tool-call" },
  presentation: {
    action: "Update Calendar event",
    target: providerEvent.title,
    consequence: "Update this Google Calendar event and send updates to its existing guests.",
    risk: "external",
    calendar: {
      kind: "schedule_proposal",
      operation: "update",
      source: { authority: "google", calendarId: googleCalendarSource.calendarId, label: googleCalendarSource.name },
      scope: "Only this event",
      notifications: "all",
      affectedEvents: [{
        calendarId: providerEvent.calendarId,
        eventId: providerEvent.eventId,
        title: providerEvent.title,
        fields: [{ name: "title", before: providerEvent.title, after: "Reviewed provider change" }],
      }],
    },
  },
  expiresAt: "2099-08-30T22:00:00Z",
  createdAt: "2026-08-19T13:55:00Z",
  updatedAt: "2026-08-19T13:55:00Z",
};

export type CalendarWorkspaceFixtureDefinition = {
  initialEntry: string;
  connectionPhase: ConnectionPhase;
  initialPanel?: "create" | "edit";
  refetchAfterLoad?: boolean;
  services: CalendarWorkspaceServices;
  calls: { context: unknown[]; create: unknown[]; update: unknown[]; remove: unknown[]; restore: unknown[]; approve: unknown[] };
};

function never<T>() { return new Promise<T>(() => undefined); }

export function createCalendarWorkspaceFixture(fixture: CalendarWorkspaceFixture): CalendarWorkspaceFixtureDefinition {
  let events = fixture === "overlap-all-day-large" ? largeEvents() : fixture === "large-agenda-1000" ? qualificationAgendaEvents() : [...ordinaryEvents];
  let updateAttempts = 0;
  let eventReads = 0;
  let deletedEvent: CalendarEvent | undefined;
  let confirmed = false;
  const calls = { context: [] as unknown[], create: [] as unknown[], update: [] as unknown[], remove: [] as unknown[], restore: [] as unknown[], approve: [] as unknown[] };
  const partial = fixture === "selected-source-partial";
  const unavailable = fixture === "unavailable";
  const empty = fixture === "true-empty" || fixture === "selected-source-empty" || fixture === "zero-selected";
  if (empty) events = [];
  if (fixture === "dst-spring") events = [
    timed("spring-morning", "Morning after the clock change", "2026-03-08T13:00:00Z", "2026-03-08T14:00:00Z"),
    timed("spring-transition", "Overnight support handoff", "2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"),
  ];
  if (fixture === "dst-fall") events = [
    timed("fall-first", "First 1:30 appointment", "2026-11-01T05:30:00Z", "2026-11-01T05:50:00Z"),
    timed("fall-second", "Second 1:30 appointment", "2026-11-01T06:30:00Z", "2026-11-01T07:00:00Z"),
    timed("fall-crossing", "Clock-change handoff", "2026-11-01T05:45:00Z", "2026-11-01T06:15:00Z"),
    timed("fall-late", "Late evening review", "2026-11-02T04:30:00Z", "2026-11-02T05:00:00Z"),
  ];
  if (fixture === "long-spanning-event") events = [{ ...ordinaryEvents[0], eventId: "long-span", title: "Spring residency", allDay: true, start: { kind: "date", date: "2026-01-01" }, end: { kind: "date", date: "2026-05-01" } }];
  if (fixture === "restricted-read-only") events = [readOnlyEvent];
  if (fixture === "stale-connected-event") events = [staleEvent];
  if (fixture === "offline") events = [...ordinaryEvents, offlineProviderEvent];
  if (fixture === "waiting-confirmation" || fixture === "uncertain-outcome") events = [providerEvent];
  if (fixture === "schedule-proposal") events = [scheduleProposalEvent];
  if (fixture === "long-copy") events = [timed("long-copy", "Coordinate the deliberately long cross-functional preparation session with every participant and all follow-up owners", "2026-08-19T14:00:00Z", "2026-08-19T16:00:00Z", { description: "A deliberately long but sanitized description that verifies wrapping, reading order, and resilient layout without exposing provider or owner data.", location: "The community learning studio, second floor, accessible entrance beside the east garden" })];
  const sources = fixture === "large-agenda-1000" ? qualificationSources()
    : fixture === "restricted-read-only" ? [localCalendarSource, readOnlySource]
    : fixture === "stale-connected-event" ? [localCalendarSource, staleSource]
    : fixture === "offline" ? [localCalendarSource, offlineGoogleSource]
    : fixture === "zero-selected" ? [{ ...localCalendarSource, selected: false }, { ...googleCalendarSource, selected: false }]
    : fixture === "selected-source-empty"
    ? [{ ...localCalendarSource, selected: false }, { ...googleCalendarSource, selected: true }]
    : partial
    ? [localCalendarSource, { ...googleCalendarSource, status: "degraded" as const, syncState: "stale" as const }]
    : [localCalendarSource, googleCalendarSource];

  const services: CalendarWorkspaceServices = {
    ...(fixture === "schedule-proposal" ? { toolConfirmations: async () => ({ confirmations: [scheduleProposalConfirmation] }) } : {}),
    calendarSources: async () => {
      return unavailable
      ? { sources: [], complete: true, status: { state: "unavailable", reason: "The local Calendar service is unavailable in this synthetic fixture." } }
      : { sources, complete: true, status: { state: partial ? "partial" : "available", ...(partial ? { reason: "Personal Google could not be refreshed." } : {}) } };
    },
    calendarEvents: async (input) => {
      if (fixture === "active-view-loading") return never();
      if (fixture === "range-unavailable") throw new Error("raw provider range exception token=never-render-this");
      eventReads += 1;
      if (fixture === "retained-refresh-error" && eventReads > 1) throw new Error("raw provider credential and internal host must never render");
      const offset = Number(input.cursor ?? 0), pageSize = input.pageSize ?? 200;
      const visible = events.filter((event) => input.calendarIds.includes(event.calendarId));
      const page = visible.slice(offset, offset + pageSize), next = offset + page.length;
      const providerPaused = fixture === "offline";
      return { events: page, range: { start: input.start, end: input.end }, ...(next < visible.length ? { cursor: String(next) } : {}), complete: next >= visible.length, status: { state: partial || providerPaused ? "partial" as const : "available" as const, ...(partial || providerPaused ? { reason: providerPaused ? "Connected refresh paused while offline." : "Personal Google could not be refreshed." } : {}) }, sourceErrors: partial || providerPaused ? [{ calendarId: googleCalendarSource.calendarId, reason: providerPaused ? "Connected refresh paused while offline." : "Synthetic provider timeout." }] : [] };
    },
    calendarEvent: async (calendarId, eventId) => {
      if (fixture === "missing-event") throw Object.assign(new Error("Event not found"), { code: "not_found" });
      if (fixture === "event-error") throw new Error("raw provider event exception token=never-render-this");
      const event = events.find((candidate) => candidate.calendarId === calendarId && candidate.eventId === eventId);
      if (!event) throw Object.assign(new Error("Event not found"), { code: "not_found" });
      return { event, status: { state: "available" as const } };
    },
    createCalendarEvent: async (input) => {
      calls.create.push(input);
      const created = draftToEvent(input.event, `created-${calls.create.length}`);
      events = [...events, created];
      return { status: "acknowledged", operationId: `create-${calls.create.length}`, event: created };
    },
    updateCalendarEvent: async (calendarId, eventId, input): Promise<CalendarMutationOutcome> => {
      calls.update.push(input); updateAttempts += 1;
      if (fixture === "waiting-confirmation" && !confirmed) return { status: "waiting_confirmation", confirmationId: waitingConfirmation.id, expiresAt: waitingConfirmation.expiresAt, consequence: waitingConfirmation.presentation.consequence };
      if (fixture === "uncertain-outcome") return { status: "uncertain", operationId: "uncertain-1", message: "raw provider timeout trace must not render" };
      if (fixture === "edit-failure") return { status: "unavailable", message: "The connected calendar could not confirm this change. Your draft is still here.", retryable: true };
      if (fixture === "version-conflict") {
        if (updateAttempts === 1) events = events.map((event) => event.eventId === eventId ? { ...event, title: "Portfolio review · updated elsewhere", revision: "r2" } : event);
        return { status: "conflict", message: "This event changed elsewhere. Review the latest event before retrying." };
      }
      const existing = events.find((event) => event.calendarId === calendarId && event.eventId === eventId)!;
      const updated = { ...existing, ...input.patch, revision: `r${updateAttempts + 1}` } as CalendarEvent;
      events = events.map((event) => event === existing ? updated : event);
      return { status: "acknowledged", operationId: `update-${updateAttempts}`, event: updated };
    },
    deleteCalendarEvent: async (calendarId, eventId, input): Promise<CalendarMutationOutcome> => {
      calls.remove.push(input);
      if (fixture === "delete-failure") return { status: "permission_failure", message: "This calendar no longer allows Kora to delete the event." };
      deletedEvent = events.find((event) => event.calendarId === calendarId && event.eventId === eventId);
      events = events.filter((event) => event.calendarId !== calendarId || event.eventId !== eventId);
      return { status: "acknowledged", operationId: "delete-1", recovery: { kind: "restore_local_calendar_event", calendarId: "kora:personal", eventId, deletedRevision: "r1" } };
    },
    restoreCalendarEvent: async (...input) => {
      calls.restore.push(input);
      if (fixture === "restore-failure") return { status: "conflict", message: "raw deleted revision and provider details must not render" };
      if (deletedEvent) events = [...events, deletedEvent];
      return { status: "acknowledged", operationId: "restore-1", event: deletedEvent ?? primaryCalendarEvent };
    },
    approveToolConfirmation: async (confirmation) => {
      calls.approve.push(confirmation);
      confirmed = true;
      if (fixture === "schedule-proposal") return { confirmation: { ...scheduleProposalConfirmation, state: "approved" as const } };
      if (fixture === "waiting-confirmation") return { confirmation: { ...waitingConfirmation, state: "approved" as const } };
      return {};
    },
    rejectToolConfirmation: async () => fixture === "schedule-proposal"
      ? { confirmation: { ...scheduleProposalConfirmation, state: "rejected" as const } }
      : fixture === "waiting-confirmation"
        ? { confirmation: { ...waitingConfirmation, state: "rejected" as const } }
        : ({}),
    issueCalendarContextReference: async (input) => { calls.context.push(input); return { selection: { kind: "calendar", title: "Synthetic Calendar context", source: input } as never }; },
  };

  const eventRoute = `/calendar/event/${encodeURIComponent(localCalendarSource.calendarId)}/${encodeURIComponent(primaryCalendarEvent.eventId)}?view=week&date=2026-08-19`;
  const specialEventRoute = fixture === "restricted-read-only" ? `/calendar/event/${encodeURIComponent(readOnlySource.calendarId)}/${readOnlyEvent.eventId}?view=week&date=2026-08-19`
    : fixture === "stale-connected-event" ? `/calendar/event/${encodeURIComponent(staleSource.calendarId)}/${staleEvent.eventId}?view=week&date=2026-08-19`
      : fixture === "long-copy" ? `/calendar/event/${encodeURIComponent(localCalendarSource.calendarId)}/long-copy?view=week&date=2026-08-19`
        : fixture === "event-error" ? `/calendar/event/${encodeURIComponent(localCalendarSource.calendarId)}/provider-failure?view=week&date=2026-08-19`
          : fixture === "waiting-confirmation" || fixture === "uncertain-outcome" ? `/calendar/event/${encodeURIComponent(googleCalendarSource.calendarId)}/${providerEvent.eventId}?view=week&date=2026-08-19` : undefined;
  const initialEntry = fixture === "missing-event" ? `/calendar/event/${encodeURIComponent(localCalendarSource.calendarId)}/missing?view=week&date=2026-08-19`
    : specialEventRoute ?? (["event-current", "event-edit", "edit-failure", "version-conflict", "delete-failure", "dirty-dismiss", "waiting-confirmation", "uncertain-outcome", "restore-failure"].includes(fixture) ? eventRoute
      : fixture === "dst-spring" ? "/calendar?view=day&date=2026-03-08"
        : fixture === "dst-fall" ? "/calendar?view=day&date=2026-11-01"
          : fixture === "long-spanning-event" ? "/calendar?view=month&date=2026-03-15"
          : fixture === "semantic-month-context" ? "/calendar?view=month&date=2026-08-19"
            : fixture === "large-agenda-1000" ? "/calendar?view=agenda&date=2026-08-19"
              : "/calendar?view=week&date=2026-08-19");
  const initialPanel = ["event-edit", "edit-failure", "version-conflict", "dirty-dismiss", "waiting-confirmation", "uncertain-outcome"].includes(fixture) ? "edit" as const
    : ["create-local", "local-people-reference"].includes(fixture) ? "create" as const : undefined;
  return { initialEntry, connectionPhase: fixture === "offline" ? "disconnected" : "ready", initialPanel, refetchAfterLoad: fixture === "retained-refresh-error", services, calls };
}

function draftToEvent(draft: CalendarEventDraft, eventId: string): CalendarEvent {
  const source = draft.calendarId === localCalendarSource.calendarId ? localCalendarSource : googleCalendarSource;
  return { ...draft, eventId, providerId: source.providerId, authority: source.authority, allDay: draft.start.kind === "date", viewerTimeZone: "America/New_York", status: "confirmed", availability: draft.availability ?? "busy", attendees: (draft.attendees ?? []).map((attendee) => ({ ...attendee, organizer: false, self: false, optional: attendee.optional ?? false, responseStatus: "unknown" })), recurrence: draft.recurrence ?? [], revision: "r1", syncState: source.authority === "kora" ? "local" : "synced", capabilities };
}
