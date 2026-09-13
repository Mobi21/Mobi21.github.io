import type { CalendarEvent, CalendarEventDraft } from "../../lib/runtime";
import { eventDraft } from "./calendar-contract";

/** Expanded occurrences contain dates belonging to that occurrence, not the
 * series master. Send only deliberately changed fields to either target. */
export function calendarEditPatch(current: CalendarEvent, edited: CalendarEventDraft): Partial<Omit<CalendarEventDraft, "calendarId">> {
  const original = eventDraft(current);
  const patch: Partial<Omit<CalendarEventDraft, "calendarId">> = {};
  const fields = ["title", "description", "start", "end", "location", "availability", "attendees", "recurrence", "conference"] as const;
  for (const field of fields) {
    // The editor deliberately does not offer replacing an existing meeting.
    if (field === "conference" && current.conference) continue;
    if (JSON.stringify(original[field]) !== JSON.stringify(edited[field])) {
      Object.assign(patch, { [field]: edited[field] });
    }
  }
  return patch;
}
