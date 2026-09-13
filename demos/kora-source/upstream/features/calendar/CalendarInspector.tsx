import { ArrowLeft, Bell, CalendarOff, CalendarRange, CircleAlert, CloudOff, ExternalLink, MapPin, MessageCircleMore, Pencil, RefreshCw, Repeat2, Trash2, Users, Video } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CalendarEvent, CalendarEventDraft, CalendarSource } from "../../lib/runtime";
import { Button, IconButton, KoraPresenceMark, Sheet } from "../../components/primitives";
import { eventDraft, formatEventRange, formatRecurrence } from "./calendar-contract";
import { CalendarEventForm, type CalendarFormValue } from "./CalendarEventForm";

export function CalendarInspector({ event, editBaseline, sources, editing, busy, outcome, failure, finalFocus, portalContainer, detailsFocusVersion = 0, onClose, onEdit, onCancelEdit, onDirtyChange, onSave, onDelete, onRetryMutation, onReviewLatest, onAskKora, onReturnToToday }: {
  event?: CalendarEvent; editBaseline?: CalendarEvent; sources: CalendarSource[]; editing: boolean; busy: boolean; outcome?: string; failure?: { kind: string; message: string }; onClose: () => void; onEdit: () => void; onCancelEdit: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
  portalContainer?: RefObject<HTMLElement | ShadowRoot | null>;
  detailsFocusVersion?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (value: CalendarFormValue) => void; onDelete: () => void; onRetryMutation?: () => void; onReviewLatest?: () => void; onAskKora: () => void; onReturnToToday?: () => void;
}) {
  const compact = useCalendarCompactPanel();
  const recoveryRegionRef = useRef<HTMLDivElement>(null);
  const recoveryActionRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const source = event ? sources.find((candidate) => candidate.calendarId === event.calendarId) : undefined;
  const editEvent = editBaseline ?? event;
  const editInitial = useMemo(() => editEvent ? eventDraft(editEvent) : undefined, [editEvent]);
  useEffect(() => {
    if (!failure) return;
    const frame = requestAnimationFrame(() => {
      const target = recoveryActionRef.current ?? recoveryRegionRef.current;
      target?.focus();
      target?.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [failure]);
  useEffect(() => {
    if (!detailsFocusVersion || editing) return;
    const frame = requestAnimationFrame(() => detailsRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [detailsFocusVersion, editing]);
  if (!event) return null;
  const sourceDescription = `${source?.name ?? "Calendar"} · ${event.authority === "kora" ? "Stored in Kora" : event.syncState === "stale" ? "Last-confirmed Google copy" : "Google"}`;
  const failureTitle = failure?.kind === "conflict" ? "This event changed elsewhere"
    : failure && /repeat|recurrence|series/i.test(failure.message) ? "The repeating change was not applied"
      : failure?.kind === "permission_failure" ? "This source no longer allows that change"
        : "The event was not changed";
  const recovery = failure ? <div ref={recoveryRegionRef} className="calendar-mutation-recovery" role="alert" tabIndex={-1}>
    <CircleAlert size={17} aria-hidden="true" />
    <div><strong>{failureTitle}</strong><p>{failure.message}</p>{editing ? <small>Your draft remains in the editor until you cancel or close it.</small> : null}</div>
    <div>{failure.kind === "conflict" && onReviewLatest ? <Button ref={recoveryActionRef} tone="ghost" onClick={onReviewLatest}><RefreshCw size={14} />Discard draft and review latest</Button> : null}{failure.kind !== "conflict" && failure.kind !== "validation_failure" && failure.kind !== "permission_failure" && onRetryMutation ? <Button ref={recoveryActionRef} tone="ghost" onClick={onRetryMutation}>Try again</Button> : null}</div>
  </div> : null;
  const body = editing && editEvent && editInitial ? <><CalendarEventForm initial={editInitial} sources={sources} submitLabel="Save changes" busy={busy} viewerTimeZone={editEvent.viewerTimeZone} recurring={Boolean(editEvent.recurringEventId || editEvent.recurrence.length)} existingConference={Boolean(editEvent.conference)} sourceLocked onSubmit={onSave} onCancel={onCancelEdit} onDirtyChange={onDirtyChange} />{outcome && <p className="calendar-mutation-outcome"><KoraPresenceMark state="waiting" />{outcome}</p>}{recovery}</> : <div ref={detailsRef} className="calendar-inspector__details" role="region" aria-label="Latest event details" tabIndex={-1}>
        {event.syncState === "stale" && <p className="calendar-stale-notice" role="status"><CloudOff size={16} />Showing the version last confirmed {event.lastSyncedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.lastSyncedAt)) : "by Google"}. Reconnect and refresh before changing it.</p>}
        {!event.capabilities.writable && event.syncState !== "stale" ? <p className="calendar-readonly-notice" role="status"><CircleAlert size={16} />This event is read-only in Kora. {source?.authority === "google" ? `Google access is ${source.accessRole || "read-only"}; change it in the source calendar or review the connection.` : "Its source does not allow changes."}</p> : null}
        <div className="calendar-event-time"><CalendarRange size={18} /><div><strong>{formatEventRange(event)}</strong><span>{event.eventTimeZone ?? event.viewerTimeZone}</span></div></div>
        <dl className="calendar-detail-list">
          {event.location && <div><dt><MapPin size={16} />Location</dt><dd>{event.location}</dd></div>}
          {event.conference && <div><dt><Video size={16} />Conference</dt><dd>{event.conference.uri ? <a href={event.conference.uri} target="_blank" rel="noreferrer">{event.conference.label ?? "Join video call"}<ExternalLink size={13} /></a> : event.conference.kind}</dd></div>}
          {event.recurrence.length > 0 && <div><dt><Repeat2 size={16} />Repeats</dt><dd>{formatRecurrence(event.recurrence)}</dd></div>}
          <div><dt><Bell size={16} />Availability</dt><dd>{event.availability === "free" ? "Free" : "Busy"}</dd></div>
          {event.attendees.length > 0 && <div><dt><Users size={16} />Guests</dt><dd><ul className="calendar-attendees">{event.attendees.map((attendee) => <li key={attendee.email}><span>{attendee.displayName ?? attendee.email}</span><small>{attendee.responseStatus}</small></li>)}</ul></dd></div>}
        </dl>
        {event.description && <div className="calendar-description"><span>Notes</span><p>{event.description}</p></div>}
        {outcome && <p className="calendar-mutation-outcome"><KoraPresenceMark state={outcome.includes("may") ? "waiting" : "active"} />{outcome}</p>}
        {recovery}
      </div>;
  const actions = !editing ? <>{onReturnToToday ? <Button onClick={onReturnToToday}><ArrowLeft size={15} aria-hidden="true" />Back to Today</Button> : null}<Button onClick={onAskKora}><MessageCircleMore size={16} />Ask Kora</Button>{event.capabilities.writable && <Button onClick={onEdit}><Pencil size={15} />Edit</Button>}{event.capabilities.deletable && <IconButton label="Delete event" tooltip="Delete" onClick={onDelete}><Trash2 size={17} /></IconButton>}</> : undefined;
  const sheetClass = `calendar-inspector-sheet${compact ? "" : " calendar-inspector-sheet--desktop"}`;
  if (editing) return <Sheet open onOpenChange={() => undefined} title="Edit event" description={sourceDescription} purpose="inspector" className={sheetClass} closeLabel="Close event details" busy={busy} finalFocus={finalFocus} dismissPolicy="explicit" onDismissAttempt={onClose} modality={compact ? "modal" : "focus-contained"} portalContainer={portalContainer}>{body}</Sheet>;
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={event.title} description={sourceDescription} purpose="inspector" className={sheetClass} closeLabel="Close event details" busy={busy} actions={actions} finalFocus={finalFocus} modality={compact ? "modal" : "focus-contained"} portalContainer={portalContainer}>{body}</Sheet>;
}

export function newEventDraft(sources: CalendarSource[], viewerTimeZone: string, startDate?: string, allDay = false, startMinute?: number, startInstant?: string): CalendarEventDraft {
  const zone = viewerTimeZone;
  const beginning = startInstant
    ? Temporal.Instant.from(startInstant).toZonedDateTimeISO(zone)
    : startDate
    ? Temporal.PlainDate.from(startDate).toPlainDateTime({ hour: Math.floor((startMinute ?? 540) / 60), minute: (startMinute ?? 540) % 60 }).toZonedDateTime(zone)
    : Temporal.Now.zonedDateTimeISO(zone).round({ smallestUnit: "hour", roundingMode: "ceil" });
  const end = beginning.add(allDay ? { days: 1 } : { hours: 1 });
  return { calendarId: sources.find((source) => source.writable && source.primary)?.calendarId ?? sources.find((source) => source.writable)?.calendarId ?? "primary", title: "", start: allDay ? { kind: "date", date: beginning.toPlainDate().toString() } : { kind: "dateTime", instant: beginning.toInstant().toString(), timeZone: zone }, end: allDay ? { kind: "date", date: end.toPlainDate().toString() } : { kind: "dateTime", instant: end.toInstant().toString(), timeZone: zone }, availability: "busy", conference: { kind: "none" } };
}

export function CalendarInspectorState({ state, message, finalFocus, portalContainer, onClose, onRetry, onReturnToToday }: { state: "loading" | "not-found" | "error"; message?: string; finalFocus?: RefObject<HTMLElement | null>; portalContainer?: RefObject<HTMLElement | ShadowRoot | null>; onClose: () => void; onRetry?: () => void; onReturnToToday?: () => void }) {
  const compact = useCalendarCompactPanel();
  const missing = state === "not-found";
  const body = <div className="calendar-inspector__terminal-body">{state === "loading" ? <KoraPresenceMark state="gathering" label="Loading event" /> : missing ? <CalendarOff size={24} aria-hidden="true" /> : <CircleAlert size={24} aria-hidden="true" />}<p>{state === "loading" ? "Reading the selected event without changing your Calendar position." : message ?? (missing ? "It may have been deleted or removed from the source calendar. Your selected date and view are still preserved." : "Kora could not read this event. The rest of your Calendar remains available.")}</p></div>;
  const actions = <>{onReturnToToday ? <Button onClick={onReturnToToday}><ArrowLeft size={15} aria-hidden="true" />Back to Today</Button> : null}{state !== "loading" ? <><Button onClick={onClose}>{missing ? "Return to Calendar" : "Close"}</Button>{!missing && onRetry ? <Button tone="primary" onClick={onRetry}><RefreshCw size={15} />Try again</Button> : null}</> : null}</>;
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title={state === "loading" ? "Opening event" : missing ? "This event is no longer available" : "This event could not open"} description="Calendar event" purpose="inspector" className={`calendar-inspector-sheet calendar-inspector-sheet--terminal${compact ? "" : " calendar-inspector-sheet--desktop"}`} closeLabel="Close event details" actions={actions} finalFocus={finalFocus} modality={compact ? "modal" : "focus-contained"} portalContainer={portalContainer}>{body}</Sheet>;
}

export function useCalendarCompactPanel() {
  const query = "(max-width: 820px)";
  const [compact, setCompact] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return;
    const update = () => setCompact(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
