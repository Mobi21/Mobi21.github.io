import { Temporal } from "temporal-polyfill";
import type { CalendarEvent } from "../../lib/runtime";
import type { CalendarView } from "./calendar-routing";

export type CalendarRange = {
  startDate: string;
  endDateExclusive: string;
  start: string;
  end: string;
};

export type CalendarVisibleDateRange = Pick<CalendarRange, "startDate" | "endDateExclusive">;

export const KORA_WEEK_START = "sunday" as const;

export type CalendarHourSlot = {
  key: string;
  instant: string;
  label: string;
  elapsedMinute: number;
  offset: string;
  occurrence: number;
};

export type CalendarDayScale = {
  day: string;
  startInstant: string;
  endInstant: string;
  totalMinutes: number;
  slots: CalendarHourSlot[];
  transition?: { kind: "forward" | "back"; label: string; elapsedMinute: number };
};

export function startOfCalendarWeek(value: string) {
  const date = Temporal.PlainDate.from(value);
  return date.subtract({ days: date.dayOfWeek % 7 }).toString();
}

export function calendarDayScale(day: string, viewerTimeZone: string): CalendarDayScale {
  const date = Temporal.PlainDate.from(day);
  const start = date.toZonedDateTime(viewerTimeZone);
  const end = date.add({ days: 1 }).toZonedDateTime(viewerTimeZone);
  const totalMinutes = end.toInstant().since(start.toInstant()).total({ unit: "minute" });
  const seenLabels = new Map<string, number>();
  const slots: CalendarHourSlot[] = [];
  let previousOffsetNanoseconds = start.offsetNanoseconds;
  let transition: CalendarDayScale["transition"];
  for (let instant = start.toInstant(), index = 0; Temporal.Instant.compare(instant, end.toInstant()) < 0; instant = instant.add({ hours: 1 }), index += 1) {
    const zoned = instant.toZonedDateTimeISO(viewerTimeZone);
    const baseLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: viewerTimeZone }).format(new Date(instant.toString()));
    const occurrence = (seenLabels.get(baseLabel) ?? 0) + 1;
    seenLabels.set(baseLabel, occurrence);
    const elapsedMinute = instant.since(start.toInstant()).total({ unit: "minute" });
    if (zoned.offsetNanoseconds !== previousOffsetNanoseconds) {
      const forward = zoned.offsetNanoseconds > previousOffsetNanoseconds;
      transition = {
        kind: forward ? "forward" : "back",
        label: forward ? `Clock moves forward to ${baseLabel}` : `${baseLabel} occurs twice`,
        elapsedMinute,
      };
    }
    slots.push({
      key: `${instant.toString()}:${zoned.offset}`,
      instant: instant.toString(),
      label: occurrence > 1 ? `${baseLabel}, second occurrence` : baseLabel,
      elapsedMinute,
      offset: zoned.offset,
      occurrence,
    });
    previousOffsetNanoseconds = zoned.offsetNanoseconds;
  }
  return {
    day,
    startInstant: start.toInstant().toString(),
    endInstant: end.toInstant().toString(),
    totalMinutes,
    slots,
    ...(transition ? { transition } : {}),
  };
}

export function calendarContextRange(view: CalendarView, anchor: string, viewerTimeZone: string) {
  if (view !== "month") return rangeForCalendarView(view, anchor, viewerTimeZone);
  const date = Temporal.PlainDate.from(anchor);
  const startDate = Temporal.PlainDate.from({ year: date.year, month: date.month, day: 1 });
  const endDateExclusive = startDate.add({ months: 1 });
  return {
    startDate: startDate.toString(),
    endDateExclusive: endDateExclusive.toString(),
    start: startDate.toZonedDateTime(viewerTimeZone).toInstant().toString(),
    end: endDateExclusive.toZonedDateTime(viewerTimeZone).toInstant().toString(),
  };
}

export function rangeForCalendarView(view: CalendarView, anchor: string, viewerTimeZone: string): CalendarRange {
  const date = Temporal.PlainDate.from(anchor);
  const startDate = view === "month"
    ? Temporal.PlainDate.from({ year: date.year, month: date.month, day: 1 })
      .subtract({ days: Temporal.PlainDate.from({ year: date.year, month: date.month, day: 1 }).dayOfWeek % 7 })
    : view === "week"
      ? Temporal.PlainDate.from(startOfCalendarWeek(anchor))
      : date;
  const endDateExclusive = view === "month"
    ? startDate.add({ days: 42 })
    : view === "week"
      ? startDate.add({ days: 7 })
      : view === "agenda"
        ? startDate.add({ days: 30 })
        : startDate.add({ days: 1 });
  return {
    startDate: startDate.toString(),
    endDateExclusive: endDateExclusive.toString(),
    start: startDate.toZonedDateTime(viewerTimeZone).toInstant().toString(),
    end: endDateExclusive.toZonedDateTime(viewerTimeZone).toInstant().toString(),
  };
}

export function calendarTitle(view: CalendarView, anchor: string) {
  const date = dateAtNoon(anchor);
  if (view === "day") return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  if (view === "month") return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  const start = Temporal.PlainDate.from(view === "week" ? startOfCalendarWeek(anchor) : anchor);
  const end = start.add({ days: view === "week" ? 6 : 29 });
  const startText = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(dateAtNoon(start.toString()));
  const endText = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(dateAtNoon(end.toString()));
  return `${startText} – ${endText}`;
}

export function stepCalendarAnchor(view: CalendarView, anchor: string, direction: -1 | 1) {
  const date = Temporal.PlainDate.from(anchor);
  if (view === "month") return date.add({ months: direction }).toString();
  if (view === "week") return date.add({ days: direction * 7 }).toString();
  if (view === "agenda") return date.add({ days: direction * 30 }).toString();
  return date.add({ days: direction }).toString();
}

export function eventStartDay(event: CalendarEvent) {
  return event.start.kind === "date"
    ? event.start.date
    : Temporal.Instant.from(event.start.instant).toZonedDateTimeISO(event.viewerTimeZone).toPlainDate().toString();
}

function eventEndDay(event: CalendarEvent) {
  if (event.end.kind === "date") return Temporal.PlainDate.from(event.end.date).subtract({ days: 1 }).toString();
  return Temporal.Instant.from(event.end.instant)
    .subtract({ nanoseconds: 1 })
    .toZonedDateTimeISO(event.viewerTimeZone)
    .toPlainDate()
    .toString();
}

export function eventDayKeys(event: CalendarEvent, visibleRange?: CalendarVisibleDateRange) {
  let start = Temporal.PlainDate.from(eventStartDay(event));
  let end = Temporal.PlainDate.from(eventEndDay(event));
  if (visibleRange) {
    const rangeStart = Temporal.PlainDate.from(visibleRange.startDate);
    const rangeEnd = Temporal.PlainDate.from(visibleRange.endDateExclusive).subtract({ days: 1 });
    if (Temporal.PlainDate.compare(start, rangeStart) < 0) start = rangeStart;
    if (Temporal.PlainDate.compare(end, rangeEnd) > 0) end = rangeEnd;
  }
  const result: string[] = [];
  for (let day = start; Temporal.PlainDate.compare(day, end) <= 0; day = day.add({ days: 1 }))
    result.push(day.toString());
  return result;
}

export function groupCalendarEvents(events: readonly CalendarEvent[], visibleRange?: CalendarVisibleDateRange) {
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const day of eventDayKeys(event, visibleRange)) {
      const existing = grouped.get(day);
      if (existing) existing.push(event);
      else grouped.set(day, [event]);
    }
  }
  for (const values of grouped.values()) values.sort(compareCalendarEvents);
  return grouped;
}

export function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent) {
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  const leftStart = left.start.kind === "date" ? left.start.date : left.start.instant;
  const rightStart = right.start.kind === "date" ? right.start.date : right.start.instant;
  return leftStart.localeCompare(rightStart) || left.title.localeCompare(right.title);
}

export function calendarEventTime(event: CalendarEvent) {
  if (event.allDay || event.start.kind === "date") return "All day";
  const showZone = Boolean(event.eventTimeZone && event.eventTimeZone !== event.viewerTimeZone);
  if (event.end.kind !== "dateTime") return formatTimedValue(event.start.instant, event.viewerTimeZone, showZone);
  return `${formatTimedValue(event.start.instant, event.viewerTimeZone)}–${formatTimedValue(event.end.instant, event.viewerTimeZone, showZone)}`;
}

export function calendarEventEndTime(event: CalendarEvent) {
  if (event.end.kind !== "dateTime") return "end of day";
  return formatTimedValue(event.end.instant, event.viewerTimeZone, Boolean(event.eventTimeZone && event.eventTimeZone !== event.viewerTimeZone));
}

function formatTimedValue(instant: string, timeZone: string, showZone = false) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone, ...(showZone ? { timeZoneName: "short" as const } : {}) }).format(new Date(instant));
}

export function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}
