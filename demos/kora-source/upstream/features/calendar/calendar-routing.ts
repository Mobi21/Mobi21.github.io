import { Temporal } from "temporal-polyfill";

export type CalendarView = "agenda" | "day" | "week" | "month";
export function validCalendarView(value: string | null): CalendarView { return value && ["agenda", "day", "week", "month"].includes(value) ? value as CalendarView : "week"; }
export function validCalendarDate(value: string | null, viewerTimeZone = "UTC") {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return Temporal.PlainDate.from(value).toString();
    } catch {
      // Invalid calendar dates fall through to the authoritative viewer date.
    }
  }
  try {
    return Temporal.Now.zonedDateTimeISO(viewerTimeZone).toPlainDate().toString();
  } catch {
    return Temporal.Now.plainDateISO("UTC").toString();
  }
}
