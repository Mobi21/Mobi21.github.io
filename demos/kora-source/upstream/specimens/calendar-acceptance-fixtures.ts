import type { CalendarEvent } from "../lib/runtime";

const capabilities: CalendarEvent["capabilities"] = {
  readable: true,
  writable: true,
  deletable: true,
  manageAttendees: true,
  editSeries: true,
  editOccurrence: true,
};

function timedEvent(
  eventId: string,
  title: string,
  start: string,
  end: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    calendarId: "kora:personal",
    eventId,
    providerId: "kora",
    authority: "kora",
    title,
    start: { kind: "dateTime", instant: start, timeZone: "America/New_York" },
    end: { kind: "dateTime", instant: end, timeZone: "America/New_York" },
    allDay: false,
    viewerTimeZone: "America/New_York",
    status: "confirmed",
    availability: "busy",
    attendees: [],
    recurrence: [],
    syncState: "local",
    capabilities,
    ...overrides,
  };
}

export const calendarMonthDensityDay = "2026-08-19";

export const calendarMonthDensityEvents: CalendarEvent[] = [
  timedEvent("month-all-day", "Portfolio launch window", "2026-08-19T04:00:00Z", "2026-08-20T04:00:00Z", {
    allDay: true,
    start: { kind: "date", date: calendarMonthDensityDay },
    end: { kind: "date", date: "2026-08-20" },
  }),
  ...Array.from({ length: 19 }, (_, index) => {
    const start = new Date(Date.UTC(2026, 7, 19, 12, index * 5));
    const end = new Date(start.getTime() + 25 * 60_000);
    return timedEvent(
      `month-density-${index + 1}`,
      index === 18
        ? "A deliberately long final event title that remains bounded"
        : `Planning block ${index + 1}`,
      start.toISOString(),
      end.toISOString(),
      index === 3 ? { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"] } : {},
    );
  }),
];

export type CalendarBoundaryFixture = {
  anchor: string;
  zone: string;
  label: string;
  event: CalendarEvent;
};

export const calendarBoundaryFixtures = {
  crossMidnight: {
    anchor: "2026-08-19",
    zone: "America/New_York",
    label: "Cross-midnight boundary · both occupied dates remain explicit",
    event: timedEvent("cross-midnight", "Overnight train", "2026-08-20T03:30:00Z", "2026-08-20T06:00:00Z", { location: "Union Station" }),
  },
  allDayExclusiveEnd: {
    anchor: "2026-08-19",
    zone: "America/New_York",
    label: "Exclusive end · shown on Aug 19–20, not Aug 21",
    event: timedEvent("all-day-exclusive", "Two-day writing retreat", "2026-08-19T04:00:00Z", "2026-08-21T04:00:00Z", {
      allDay: true,
      start: { kind: "date", date: "2026-08-19" },
      end: { kind: "date", date: "2026-08-21" },
    }),
  },
  leapDay: {
    anchor: "2028-02-29",
    zone: "America/New_York",
    label: "Leap-day boundary · deterministic 2028 fixture",
    event: timedEvent("leap-day", "Leap-day check-in", "2028-02-29T15:00:00Z", "2028-02-29T16:00:00Z"),
  },
  timeZoneChange: {
    anchor: "2026-08-19",
    zone: "America/Los_Angeles",
    label: "Same instant viewed in Los Angeles",
    event: timedEvent("timezone-change", "New York team sync", "2026-08-19T14:00:00Z", "2026-08-19T15:00:00Z", {
      viewerTimeZone: "America/Los_Angeles",
      eventTimeZone: "America/New_York",
    }),
  },
} satisfies Record<string, CalendarBoundaryFixture>;
