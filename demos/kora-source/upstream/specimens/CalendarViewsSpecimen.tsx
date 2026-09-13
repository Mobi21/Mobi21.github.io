import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../features/calendar/calendar.css";
import "./calendar-views-specimen.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import type { CalendarEvent, CalendarSource } from "../lib/runtime";
import { Button, Pressable } from "../components/primitives";
import { CalendarViews } from "../features/calendar/CalendarViews";
import type { CalendarView } from "../features/calendar/calendar-routing";
import { stepCalendarAnchor } from "../features/calendar/calendar-view-model";
import { calendarMonthDensityEvents } from "./calendar-acceptance-fixtures";

const sources: CalendarSource[] = [
  { calendarId: "kora:personal", name: "My Kora calendar", providerId: "kora", authority: "kora", primary: true, selected: true, color: "#fc815c", accessRole: "owner", writable: true, status: "available", syncState: "local" },
  { calendarId: "google:personal", name: "Personal Google", providerId: "google-workspace", authority: "google", primary: true, selected: true, color: "#7f8cff", accessRole: "owner", writable: false, status: "degraded", syncState: "stale", lastSyncedAt: "2026-08-19T11:42:00Z" },
];

const capability = { readable: true, writable: true, deletable: true, manageAttendees: true, editSeries: true, editOccurrence: true };
const timed = (eventId: string, title: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  calendarId: "kora:personal", eventId, providerId: "kora", authority: "kora", title,
  start: { kind: "dateTime", instant: start, timeZone: "America/New_York" },
  end: { kind: "dateTime", instant: end, timeZone: "America/New_York" },
  allDay: false, viewerTimeZone: "America/New_York", status: "confirmed", availability: "busy", attendees: [], recurrence: [], syncState: "local", capabilities: capability,
  ...overrides,
});

const baseEvents: CalendarEvent[] = [
  { ...timed("all-day", "Portfolio launch window", "2026-08-19T04:00:00Z", "2026-08-20T04:00:00Z"), allDay: true, start: { kind: "date", date: "2026-08-19" }, end: { kind: "date", date: "2026-08-20" } },
  timed("deep-work", "Finish portfolio case study", "2026-08-19T13:00:00Z", "2026-08-19T15:30:00Z", { location: "Studio desk" }),
  timed("mentor", "Mentor check-in", "2026-08-19T14:00:00Z", "2026-08-19T15:00:00Z", { conference: { kind: "google_meet", uri: "https://meet.google.com/example" } }),
  timed("lunch", "Lunch with Jordan", "2026-08-19T16:30:00Z", "2026-08-19T17:30:00Z", { location: "Corner café" }),
  timed("run", "Evening run", "2026-08-19T22:00:00Z", "2026-08-19T23:00:00Z", { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"] }),
  timed("dentist", "Dentist appointment", "2026-08-20T18:00:00Z", "2026-08-20T19:00:00Z", { calendarId: "google:personal", providerId: "google-workspace", authority: "google", syncState: "stale", capabilities: { ...capability, writable: false, deletable: false }, location: "Riverside Dental", lastSyncedAt: "2026-08-19T11:42:00Z" }),
  timed("overnight", "Overnight train", "2026-08-21T03:30:00Z", "2026-08-21T07:00:00Z", { location: "Union Station" }),
];

const agendaDensityEvents = Array.from({ length: 1_000 }, (_, index) => {
  const start = new Date(Date.UTC(2026, 7, 1, 4, index * 30));
  const end = new Date(start.getTime() + 25 * 60_000);
  return timed(`agenda-${index}`, index % 17 === 0 ? `Long personal commitment ${index + 1} with enough context to test truncation safely` : `Scheduled item ${index + 1}`, start.toISOString(), end.toISOString(), index % 11 === 0 ? { location: "A location with a deliberately descriptive name" } : {});
});

function Specimen() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view") as CalendarView | null;
  const fixture = params.get("fixture") ?? "populated";
  const [view, setView] = useState<CalendarView>(requested && ["day", "week", "month", "agenda"].includes(requested)
    ? requested
    : fixture === "large-month"
      ? "month"
      : fixture === "large-agenda"
        ? "agenda"
        : "week");
  const [anchor, setAnchor] = useState(fixture === "large-agenda" ? "2026-08-01" : "2026-08-19");
  const [selected, setSelected] = useState("No event selected");
  const [visibleLimit, setVisibleLimit] = useState(200);
  const allEvents = fixture === "large-month" ? calendarMonthDensityEvents : fixture === "large-agenda" ? agendaDensityEvents : baseEvents;
  const visibleEvents = fixture === "large-agenda" ? allEvents.slice(0, visibleLimit) : allEvents;
  return <main className="calendar-specimen" id="main-content">
    <header className="calendar-specimen__bar">
      <div><h1>Calendar view qualification</h1><span>{fixture === "large-month" ? "20 events on August 19 · deterministic synthetic schedule" : "Deterministic synthetic schedule · America/New_York"}</span></div>
      <div role="group" aria-label="Calendar specimen view">{(["day", "week", "month", "agenda"] as CalendarView[]).map((candidate) => <Pressable key={candidate} aria-pressed={candidate === view} onClick={() => setView(candidate)}>{candidate}</Pressable>)}</div>
      <output aria-live="polite">{selected}</output>
    </header>
    <section className="calendar-workspace">
      <div className="calendar-stage">
        <CalendarViews
          view={view}
          anchor={anchor}
          today="2026-08-19"
          viewerTimeZone="America/New_York"
          nowInstant="2026-08-19T14:30:00Z"
          events={visibleEvents}
          sources={sources}
          onStepPeriod={(direction) => setAnchor((current) => stepCalendarAnchor(view, current, direction))}
          onSelectEvent={(event) => setSelected(`${event.title} selected`)}
          onSelectDay={() => setView("day")}
          onCreate={(seed) => setSelected(`Create at ${seed?.day ?? "anchor"}${seed?.minute === undefined ? "" : ` minute ${seed.minute}`}`)}
        />
        {fixture === "large-agenda" && visibleLimit < allEvents.length ? (
          <div className="calendar-agenda-pagination">
            <span>{visibleEvents.length} of 1,000 events loaded in this range</span>
            <Button tone="secondary" onClick={() => setVisibleLimit((current) => Math.min(1_000, current + 200))}>Load more events</Button>
          </div>
        ) : null}
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
