import type { CalendarDateValue, CalendarEvent, CalendarEventDraft, CalendarSource } from "../../lib/runtime";
import type { CalendarMutationOutcome } from "../../lib/runtime";
import { Temporal } from "temporal-polyfill";

export function isMissingCalendarEventError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "not_found" || /\bnot found\b|\bno longer exists\b/i.test(message);
}

export function calendarReadFailureMessage(surface: "sources" | "range" | "event") {
  if (surface === "sources") return "Kora couldn’t read your calendars. Stored calendar records were not changed.";
  if (surface === "event") return "Kora couldn’t open this event. The rest of your Calendar remains available.";
  return "Kora couldn’t read the selected calendars. Try again to check these events.";
}

export function calendarMutationFailureMessage(status: CalendarMutationOutcome["status"], operation: "change" | "restore" = "change") {
  if (operation === "restore") return "Kora couldn’t restore this event. Refresh Calendar before trying again.";
  if (status === "conflict") return "This event changed elsewhere. Reviewing latest will discard this stale draft and replace it with the latest saved version.";
  if (status === "permission_failure") return "This calendar no longer allows Kora to make that change.";
  if (status === "validation_failure") return "The calendar couldn’t accept this event as entered. Review its schedule and details.";
  if (status === "rejected") return "The calendar rejected this change. Your draft is still available.";
  if (status === "uncertain") return "Kora couldn’t confirm whether the calendar applied this change. Refresh the event before trying again.";
  return "The calendar service couldn’t confirm this change. Your draft is still available.";
}

export function calendarCoverageSummary(sources: readonly CalendarSource[], sourceErrors: readonly { calendarId: string; reason: string }[], refreshState: "current" | "offline" = "current") {
  const failedIds = new Set(sourceErrors.map((error) => error.calendarId));
  const affected = sources.filter((source) => failedIds.has(source.calendarId) || source.status === "unavailable" || source.syncState === "stale" || source.syncState === "unavailable");
  const affectedGoogle = affected.filter((source) => source.authority === "google");
  if (refreshState === "offline") return "Provider refresh is paused while Kora is offline · local events remain available and last-confirmed provider events are labeled.";
  if (affectedGoogle.length === 1) return `${affectedGoogle[0].name} could not be refreshed · Kora events and any last-confirmed provider events remain shown.`;
  if (affectedGoogle.length > 1) return `${affectedGoogle.length} Google calendars could not be refreshed · Kora events and any last-confirmed provider events remain shown.`;
  return "Some calendars are unavailable · readable events remain shown.";
}

export function formatRecurrence(recurrence: string[]) {
  const rule = recurrence.find((entry) => entry.toUpperCase().startsWith("RRULE:"));
  if (!rule) return recurrence.length ? "Provider-defined repeating schedule" : "Does not repeat";
  const parts = new Map(rule.slice(6).split(";").map((part) => {
    const [key, value = ""] = part.split("="); return [key.toUpperCase(), value];
  }));
  const frequency = parts.get("FREQ")?.toLowerCase();
  const unit = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : frequency === "monthly" ? "month" : frequency === "yearly" ? "year" : undefined;
  if (!unit) return "Provider-defined repeating schedule";
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const cadence = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  const count = Number(parts.get("COUNT"));
  if (Number.isFinite(count) && count > 0) return `${cadence} · ends after ${count} occurrences`;
  const until = parts.get("UNTIL")?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (until) return `${cadence} · ends ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${until[1]}-${until[2]}-${until[3]}T12:00:00.000Z`))}`;
  return `${cadence} · no end date`;
}

export function dateInputValue(value: CalendarDateValue) {
  if (value.kind === "date") return value.date;
  return Temporal.Instant.from(value.instant).toZonedDateTimeISO(value.timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
}

export type CalendarOccurrence = "first" | "second";

export type LocalDateTimeResolution = {
  valid: boolean;
  ambiguous: boolean;
  occurrence: CalendarOccurrence;
  instant?: string;
};

/**
 * Resolve a local editor value without allowing Temporal's gap adjustment to
 * silently turn a nonexistent wall time into a different event time.
 */
export function resolveLocalDateTime(value: string, timeZone: string, occurrence: CalendarOccurrence = "first"): LocalDateTimeResolution {
  try {
    const plain = Temporal.PlainDateTime.from(value);
    const earlier = plain.toZonedDateTime(timeZone, { disambiguation: "earlier" });
    const later = plain.toZonedDateTime(timeZone, { disambiguation: "later" });
    const representsInput = earlier.toPlainDateTime().equals(plain) || later.toPlainDateTime().equals(plain);
    if (!representsInput) return { valid: false, ambiguous: false, occurrence };
    const ambiguous = Temporal.Instant.compare(earlier.toInstant(), later.toInstant()) !== 0;
    const chosen = occurrence === "second" && ambiguous ? later : earlier;
    return { valid: true, ambiguous, occurrence: occurrence === "second" && ambiguous ? "second" : "first", instant: chosen.toInstant().toString() };
  } catch {
    return { valid: false, ambiguous: false, occurrence };
  }
}

export function occurrenceForInstant(value: CalendarDateValue, timeZone: string): CalendarOccurrence {
  if (value.kind !== "dateTime") return "first";
  try {
    const instant = Temporal.Instant.from(value.instant);
    const plain = instant.toZonedDateTimeISO(timeZone).toPlainDateTime();
    const later = resolveLocalDateTime(plain.toString(), timeZone, "second");
    return later.ambiguous && later.instant === instant.toString() ? "second" : "first";
  } catch {
    return "first";
  }
}

export function inputToCalendarValue(value: string, allDay: boolean, timeZone: string, occurrence: CalendarOccurrence = "first"): CalendarDateValue {
  if (allDay) return { kind: "date", date: value.slice(0, 10) };
  const resolved = resolveLocalDateTime(value, timeZone, occurrence);
  if (!resolved.valid || !resolved.instant) throw new RangeError(`The local time ${value} does not exist in ${timeZone}.`);
  return { kind: "dateTime", instant: resolved.instant, timeZone };
}

export function eventDraft(event: CalendarEvent): CalendarEventDraft {
  return {
    calendarId: event.calendarId, title: event.title, ...(event.description ? { description: event.description } : {}),
    start: event.start, end: event.end, ...(event.location ? { location: event.location } : {}), availability: event.availability,
    attendees: event.attendees.map((attendee) => ({ email: attendee.email, optional: attendee.optional })), recurrence: event.recurrence,
    conference: event.conference ? { kind: "google_meet" } : { kind: "none" },
  };
}

export function formatEventRange(event: CalendarEvent) {
  if (event.start.kind === "date" && event.end.kind === "date") {
    const start = Temporal.PlainDate.from(event.start.date), end = Temporal.PlainDate.from(event.end.date).subtract({ days: 1 });
    const startDate = dateAtNoon(start.toString()), endDate = dateAtNoon(end.toString());
    return Temporal.PlainDate.compare(start, end) === 0
      ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(startDate)
      : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(startDate)} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(endDate)}`;
  }
  const start = new Date(event.start.kind === "dateTime" ? event.start.instant : event.start.date), end = new Date(event.end.kind === "dateTime" ? event.end.instant : event.end.date);
  const zone = event.viewerTimeZone;
  const date = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: zone });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
  return `${date} · ${startTime}–${endTime}`;
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}
