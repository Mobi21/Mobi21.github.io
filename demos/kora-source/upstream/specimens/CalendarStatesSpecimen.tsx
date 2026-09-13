import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../features/calendar/calendar.css";
import "./calendar-states-specimen.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { Button, KoraSelect, Modal, RadioGroup } from "../components/primitives";
import { CalendarInspector, CalendarInspectorState } from "../features/calendar/CalendarInspector";
import { CalendarLoading, CalendarState } from "../features/calendar/CalendarStates";
import { CalendarToolbar } from "../features/calendar/CalendarToolbar";
import { CalendarViews } from "../features/calendar/CalendarViews";
import type { CalendarEvent, CalendarSource } from "../lib/runtime";
import { calendarBoundaryFixtures } from "./calendar-acceptance-fixtures";

const fixtures = [
  "loading", "true-empty", "source-empty", "partial-zero", "offline", "unavailable",
  "inspector-loading", "inspector-gone", "inspector-error", "writable-inspector", "read-only-inspector",
  "failed-mutation", "version-conflict", "recurrence-rejection", "dirty-dismiss", "approval", "delete-review",
  "delete-undo-restored", "dst-spring", "dst-fall", "cross-midnight", "leap-day", "timezone-change",
  "all-day-exclusive-end", "source-picker-20",
] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "partial-zero";
const localSource: CalendarSource = { calendarId: "kora:personal", name: "My Kora calendar", providerId: "kora", authority: "kora", primary: true, selected: true, color: "#fc815c", accessRole: "owner", writable: true, status: "available", syncState: "local" };
const googleSource: CalendarSource = { calendarId: "google:shared", name: "Shared family calendar", providerId: "google-workspace", authority: "google", primary: false, selected: true, color: "#7f8cff", accessRole: "reader", writable: false, status: "available", syncState: "synced", lastSyncedAt: "2026-08-19T11:42:00Z" };
const capabilities = { readable: true, writable: true, deletable: true, manageAttendees: true, editSeries: true, editOccurrence: true };

function calendarEvent(eventId: string, title: string, start: CalendarEvent["start"], end: CalendarEvent["end"], overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { calendarId: localSource.calendarId, eventId, providerId: "kora", authority: "kora", title, start, end, allDay: start.kind === "date", viewerTimeZone: "America/New_York", status: "confirmed", availability: "busy", attendees: [], recurrence: [], syncState: "local", capabilities, ...overrides };
}

const writableEvent = calendarEvent("portfolio-review", "Portfolio review", { kind: "dateTime", instant: "2026-08-19T14:00:00Z", timeZone: "America/New_York" }, { kind: "dateTime", instant: "2026-08-19T15:00:00Z", timeZone: "America/New_York" }, { location: "Studio desk", description: "Review the final case-study sequence before publishing." });
const readOnlyEvent = calendarEvent("family-dinner", "Family dinner", { kind: "dateTime", instant: "2026-08-19T22:00:00Z", timeZone: "America/New_York" }, { kind: "dateTime", instant: "2026-08-19T23:30:00Z", timeZone: "America/New_York" }, { calendarId: googleSource.calendarId, providerId: "google-workspace", authority: "google", syncState: "synced", capabilities: { ...capabilities, writable: false, deletable: false, manageAttendees: false, editSeries: false, editOccurrence: false } });

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function EmptyRange({ complete }: { complete: boolean }) {
  return <CalendarViews view="agenda" anchor="2026-08-19" today="2026-08-19" viewerTimeZone="America/New_York" nowInstant="2026-08-19T14:30:00Z" events={[]} sources={[localSource]} coverageComplete={complete} onSelectEvent={() => undefined} onSelectDay={() => undefined} onCreate={() => undefined} />;
}

function InspectorFixture({ readOnly = false }: { readOnly?: boolean }) {
  return <CalendarInspector event={readOnly ? readOnlyEvent : writableEvent} sources={[localSource, googleSource]} editing={false} busy={false} onClose={() => undefined} onEdit={() => undefined} onCancelEdit={() => undefined} onSave={() => undefined} onDelete={() => undefined} onAskKora={() => undefined} />;
}

function RecoveryPanel({ title, body, action = "Review latest event" }: { title: string; body: string; action?: string }) {
  return <div className="calendar-state-specimen__panel" role="alert"><CircleAlert size={22} /><div><strong>{title}</strong><p>{body}</p></div><Button>{action}</Button></div>;
}

function DeleteUndoFixture() {
  const [state, setState] = useState<"ready" | "deleted" | "restored">("ready");
  return <div className="calendar-state-specimen__recovery" aria-live="polite">
    <span>Stored in Kora · synthetic event</span>
    <h2>{state === "ready" ? "Weekly planning" : state === "deleted" ? "Weekly planning was deleted" : "Weekly planning was restored"}</h2>
    <p>{state === "ready" ? "The event is still present. Delete is demonstrated locally without contacting a provider." : state === "deleted" ? "The local record is recoverable during this session. No guest update was sent." : "The local event and its original time are available again."}</p>
    {state === "ready" ? <Button tone="danger" onClick={() => setState("deleted")}>Delete synthetic event</Button> : state === "deleted" ? <Button tone="primary" onClick={() => setState("restored")}>Undo delete</Button> : <Button onClick={() => setState("ready")}>Review restored event</Button>}
  </div>;
}

function BoundaryAgenda({ event, anchor, zone = "America/New_York", label }: { event: CalendarEvent; anchor: string; zone?: string; label: string }) {
  return <div className="calendar-state-specimen__boundary"><p>{label}</p><CalendarViews view="agenda" anchor={anchor} today={anchor} viewerTimeZone={zone} nowInstant="2026-08-19T14:30:00Z" events={[event]} sources={[localSource]} coverageComplete onSelectEvent={() => undefined} onSelectDay={() => undefined} onCreate={() => undefined} /></div>;
}

function SourcePickerFixture() {
  const sources = Array.from({ length: 20 }, (_, index): CalendarSource => ({ ...googleSource, calendarId: `google:qualified-${index}`, name: index === 19 ? "A deliberately long shared calendar name that remains bounded" : `Calendar ${index + 1}`, color: index % 2 ? "#7f8cff" : "#fc815c", accessRole: index % 5 === 0 ? "reader" : "owner", writable: index % 5 !== 0, status: index === 4 ? "unavailable" : index === 2 ? "degraded" : "available", syncState: index === 4 ? "unavailable" : index === 2 ? "stale" : "synced", selected: index < 12 }));
  const [selected, setSelected] = useState(sources.filter((source) => source.selected).map((source) => source.calendarId));
  return <MemoryRouter><div className="calendar-state-specimen__toolbar"><CalendarToolbar title="Aug 16 – Aug 22, 2026" view="week" viewerTimeZone="America/New_York" sources={sources} selected={selected} onSelectedChange={setSelected} onViewChange={() => undefined} onPrevious={() => undefined} onNext={() => undefined} onToday={() => undefined} onCreate={() => undefined} onAskRange={() => undefined} /><p>{selected.length} of 20 calendars visible · open Calendars to inspect all source states</p></div></MemoryRouter>;
}

function StateBody() {
  if (fixture === "loading") return <CalendarLoading />;
  if (fixture === "true-empty") return <EmptyRange complete />;
  if (fixture === "source-empty") return <CalendarState kind="empty" title="Choose a calendar" body="Select at least one visible calendar to see its commitments." />;
  if (fixture === "partial-zero") return <EmptyRange complete={false} />;
  if (fixture === "offline") return <CalendarState kind="unavailable" title="Calendar is offline" body="Kora could not reach the local runtime. No empty-calendar claim has been made, and stored events remain intact." onRetry={() => undefined} />;
  if (fixture === "unavailable") return <CalendarState kind="unavailable" title="This Calendar range is unavailable" body="The selected calendars could not be read. Existing records were not changed." onRetry={() => undefined} />;
  if (fixture === "inspector-loading") return <CalendarInspectorState state="loading" onClose={() => undefined} />;
  if (fixture === "inspector-gone") return <CalendarInspectorState state="not-found" onClose={() => undefined} />;
  if (fixture === "inspector-error") return <CalendarInspectorState state="error" message="The event could not be refreshed; the Calendar range remains available." onClose={() => undefined} onRetry={() => undefined} />;
  if (fixture === "writable-inspector") return <InspectorFixture />;
  if (fixture === "read-only-inspector") return <InspectorFixture readOnly />;
  if (fixture === "failed-mutation") return <RecoveryPanel title="The event was not saved" body="Google Calendar rejected the change. Your editor values remain available; review the latest event before trying again." action="Review event" />;
  if (fixture === "version-conflict") return <RecoveryPanel title="This event changed elsewhere" body="Kora did not overwrite the newer event. Review the latest version, then reapply only the changes you still want." />;
  if (fixture === "recurrence-rejection") return <RecoveryPanel title="This repeating change was not applied" body="The source calendar rejected the recurrence rule. The existing series is unchanged and your proposed schedule remains available for review." action="Revise recurrence" />;
  if (fixture === "dirty-dismiss") return <Modal open onOpenChange={() => undefined} title="Discard event changes?" description="Your unsaved Calendar changes will be lost." dismissPolicy="explicit" onDismissAttempt={() => undefined} purpose="confirm" actions={<><Button>Keep editing</Button><Button tone="danger">Discard changes</Button></>}><p>Kora has not changed the stored event or contacted its calendar provider.</p></Modal>;
  if (fixture === "approval") return <Modal open onOpenChange={() => undefined} title="Confirm Calendar change" description="Update “Portfolio review” in Personal Google and notify two guests." purpose="confirm"><div className="calendar-confirmation"><p>Kora will apply exactly this reviewed change through Google Calendar. The action remains bound to this event, notification policy, and request.</p><div><Button>Cancel</Button><Button tone="primary">Confirm change</Button></div></div></Modal>;
  if (fixture === "delete-review") return <Modal open onOpenChange={() => undefined} title="Delete repeating event?" description="Review the permanent Calendar change for “Weekly planning”." purpose="confirm"><div className="calendar-delete-scope"><RadioGroup label="Delete scope" value="occurrence" onValueChange={() => undefined} options={[{ value: "occurrence", title: "Only this occurrence", hint: "The rest of the series stays on your calendar." }, { value: "series", title: "The entire series", hint: "Every event in this repeating series will be removed." }]} /><p className="calendar-delete-scope__consequence">No guest updates will be sent. This removes the event from your private Kora calendar.</p><div className="calendar-delete-scope__actions"><Button>Keep event</Button><Button tone="danger">Delete event</Button></div></div></Modal>;
  if (fixture === "delete-undo-restored") return <DeleteUndoFixture />;
  if (fixture === "dst-spring") return <BoundaryAgenda label="Spring-forward boundary · wall time remains explicit" anchor="2026-03-08" event={calendarEvent("dst-spring", "Morning run after the clock change", { kind: "dateTime", instant: "2026-03-08T12:30:00Z", timeZone: "America/New_York" }, { kind: "dateTime", instant: "2026-03-08T13:30:00Z", timeZone: "America/New_York" })} />;
  if (fixture === "dst-fall") return <BoundaryAgenda label="Fall-back boundary · repeated hour remains unambiguous" anchor="2026-11-01" event={calendarEvent("dst-fall", "Early airport pickup", { kind: "dateTime", instant: "2026-11-01T05:30:00Z", timeZone: "America/New_York" }, { kind: "dateTime", instant: "2026-11-01T07:30:00Z", timeZone: "America/New_York" })} />;
  if (fixture === "cross-midnight") return <BoundaryAgenda {...calendarBoundaryFixtures.crossMidnight} />;
  if (fixture === "leap-day") return <BoundaryAgenda {...calendarBoundaryFixtures.leapDay} />;
  if (fixture === "timezone-change") return <BoundaryAgenda {...calendarBoundaryFixtures.timeZoneChange} />;
  if (fixture === "all-day-exclusive-end") return <BoundaryAgenda {...calendarBoundaryFixtures.allDayExclusiveEnd} />;
  return <SourcePickerFixture />;
}

function Specimen() {
  return <main className="calendar-state-specimen" id="main-content">
    <header><div><strong>Calendar state qualification</strong><span>Synthetic state · no product or provider mutation</span></div><KoraSelect label="Calendar fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header>
    <section className="calendar-workspace"><div className="calendar-stage"><StateBody /></div></section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
