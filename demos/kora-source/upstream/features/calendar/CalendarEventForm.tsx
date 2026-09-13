import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarRange, Clock3, MapPin, Repeat2, Users, Video } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import type { CalendarEventDraft, CalendarSource } from "../../lib/runtime";
import { Button, KoraSelect } from "../../components/primitives";
import { Input, SegmentedControl, Switch, Textarea } from "../../components/form";
import { dateInputValue, inputToCalendarValue, occurrenceForInstant, resolveLocalDateTime, type CalendarOccurrence } from "./calendar-contract";
import { DUR, EASE } from "../../lib/motion";

export type CalendarFormValue = {
  event: CalendarEventDraft;
  sendUpdates: "all" | "externalOnly" | "none";
  recurrenceScope: "occurrence" | "series";
};

const durations = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
] as const;

function parts(value: string) {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function at(date: string, time: string) {
  return date && time ? `${date}T${time}` : "";
}

function addElapsedMinutes(value: string, minutes: number, timeZone: string, occurrence: CalendarOccurrence) {
  const resolved = resolveLocalDateTime(value, timeZone, occurrence);
  if (!resolved.valid || !resolved.instant) return { value, occurrence };
  const instant = Temporal.Instant.from(resolved.instant).add({ minutes });
  const nextValue = instant.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
  const nextOccurrence = occurrenceForInstant({ kind: "dateTime", instant: instant.toString(), timeZone }, timeZone);
  return { value: nextValue, occurrence: nextOccurrence };
}

type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
function repeatPreset(recurrence: string[] | undefined): RepeatPreset {
  if (!recurrence?.length) return "none";
  if (recurrence.length !== 1 || !/^RRULE:/i.test(recurrence[0])) return "custom";
  const fields = recurrence[0].replace(/^RRULE:/i, "").split(";").filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? undefined : [part.slice(0, separator).toUpperCase(), part.slice(separator + 1)] as const;
  });
  if (fields.some((field) => !field)) return "custom";
  const definedFields = fields as Array<readonly [string, string]>;
  const keys = definedFields.map(([key]) => key);
  if (new Set(keys).size !== keys.length || keys.some((key) => key !== "FREQ" && key !== "COUNT" && key !== "UNTIL")) return "custom";
  const frequency = definedFields.find(([key]) => key === "FREQ")?.[1].toLowerCase();
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly" && frequency !== "yearly") return "custom";
  const count = definedFields.find(([key]) => key === "COUNT")?.[1];
  const until = definedFields.find(([key]) => key === "UNTIL")?.[1];
  if (count !== undefined && (until !== undefined || !/^[1-9]\d*$/.test(count))) return "custom";
  if (until !== undefined && !isValidRepeatUntil(until)) return "custom";
  return frequency;
}
function isValidRepeatUntil(value: string) {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (!date && !dateTime) return false;
  try {
    const [, year, month, day] = dateTime ?? date!;
    if (dateTime) Temporal.PlainDateTime.from(`${year}-${month}-${day}T${dateTime[4]}:${dateTime[5]}:${dateTime[6]}`);
    else Temporal.PlainDate.from(`${year}-${month}-${day}`);
    return true;
  } catch {
    return false;
  }
}
function withRepeatCount(rule: string, count?: number) {
  const parts = rule.replace(/^RRULE:/i, "").split(";").filter((part) => part && !/^COUNT=|^UNTIL=/i.test(part));
  if (count) parts.push(`COUNT=${count}`);
  return `RRULE:${parts.join(";")}`;
}
function formatRepeatUntil(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return "provider-defined date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`));
}

export function CalendarEventForm({
  initial,
  sources,
  submitLabel,
  busy,
  viewerTimeZone,
  recurring = false,
  existingConference = false,
  sourceLocked = false,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  initial: CalendarEventDraft;
  sources: CalendarSource[];
  submitLabel: string;
  busy: boolean;
  viewerTimeZone: string;
  recurring?: boolean;
  existingConference?: boolean;
  sourceLocked?: boolean;
  onSubmit: (value: CalendarFormValue) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initialStart = dateInputValue(initial.start);
  const initialEnd = dateInputValue(initial.end);
  const [value, setValue] = useState(initial);
  const [allDay, setAllDay] = useState(initial.start.kind === "date");
  const [startInput, setStartInput] = useState(initialStart);
  const [endInput, setEndInput] = useState(initialEnd);
  const initialZone = initial.start.kind === "dateTime" ? initial.start.timeZone : viewerTimeZone;
  const initialStartOccurrence = occurrenceForInstant(initial.start, initialZone);
  const initialEndOccurrence = occurrenceForInstant(initial.end, initialZone);
  const [startOccurrence, setStartOccurrence] = useState<CalendarOccurrence>(initialStartOccurrence);
  const [endOccurrence, setEndOccurrence] = useState<CalendarOccurrence>(initialEndOccurrence);
  const [attendees, setAttendees] = useState(initial.attendees?.map((entry) => entry.email).join(", ") ?? "");
  const [sendUpdates, setSendUpdates] = useState<CalendarFormValue["sendUpdates"]>(initial.attendees?.length ? "all" : "none");
  const [updatesTouched, setUpdatesTouched] = useState(false);
  const [recurrenceScope, setRecurrenceScope] = useState<CalendarFormValue["recurrenceScope"]>("occurrence");

  const zone = value.start.kind === "dateTime" ? value.start.timeZone : viewerTimeZone;
  const writableSources = useMemo(() => sources.filter((source) => source.writable), [sources]);
  const selectedSource = sources.find((source) => source.calendarId === value.calendarId);
  const isKoraEvent = selectedSource?.authority === "kora";
  const repeat = repeatPreset(value.recurrence);
  const repeatRule = value.recurrence?.find((entry) => entry.toUpperCase().startsWith("RRULE:")) ?? "";
  const repeatCount = Number(repeatRule.match(/(?:^|;)COUNT=(\d+)(?:;|$)/i)?.[1] ?? 10);
  const repeatUntil = repeatRule.match(/(?:^|;)UNTIL=(\d{8})(?:T\d{6}Z)?(?:;|$)/i)?.[1];
  const repeatEnd = /(?:^|;)COUNT=/i.test(repeatRule) ? "count" : repeatUntil ? "until" : "never";
  const startParts = parts(startInput);
  const endParts = parts(endInput);
  const startResolution = allDay ? undefined : resolveLocalDateTime(startInput, zone, startOccurrence);
  const endResolution = allDay ? undefined : resolveLocalDateTime(endInput, zone, endOccurrence);
  const localTimesExist = allDay || Boolean(startResolution?.valid && endResolution?.valid);
  const instantsInOrder = allDay
    ? endInput > startInput
    : Boolean(startResolution?.valid && endResolution?.valid && startResolution.instant && endResolution.instant && Temporal.Instant.compare(Temporal.Instant.from(endResolution.instant), Temporal.Instant.from(startResolution.instant)) > 0);
  const valid = Boolean(value.title.trim() && startInput && endInput && instantsInOrder && localTimesExist);
  const currentDuration = allDay || !startResolution?.valid || !endResolution?.valid || !startResolution.instant || !endResolution.instant
    ? 0
    : Math.max(0, Temporal.Instant.from(endResolution.instant).since(Temporal.Instant.from(startResolution.instant)).total({ unit: "minute" }));
  const validationMessage = !value.title.trim()
    ? "Add a title."
    : !startInput || !endInput
      ? "Choose a start and end."
      : !allDay && startResolution && !startResolution.valid
        ? `Start time ${startParts.time || "entered"} does not exist on this daylight-saving transition. Choose another time.`
        : !allDay && endResolution && !endResolution.valid
          ? `End time ${endParts.time || "entered"} does not exist on this daylight-saving transition. Choose another time.`
          : !instantsInOrder
            ? "Choose an end after the start in elapsed time."
            : undefined;
  const hasGuests = attendees.trim().length > 0;
  const initialSignature = useMemo(() => JSON.stringify({ value: initial, allDay: initial.start.kind === "date", startInput: initialStart, endInput: initialEnd, startOccurrence: initialStartOccurrence, endOccurrence: initialEndOccurrence, attendees: initial.attendees?.map((entry) => entry.email).join(", ") ?? "", sendUpdates: initial.attendees?.length ? "all" : "none", recurrenceScope: "occurrence" }), [initial, initialEnd, initialEndOccurrence, initialStart, initialStartOccurrence]);
  const signature = JSON.stringify({ value, allDay, startInput, endInput, startOccurrence, endOccurrence, attendees, sendUpdates, recurrenceScope });
  useEffect(() => { onDirtyChange?.(signature !== initialSignature); }, [initialSignature, onDirtyChange, signature]);

  function updateStart(next: string) {
    if (!next) {
      setStartInput(next);
      return;
    }
    if (allDay) {
      try {
        const nextStart = Temporal.PlainDate.from(next);
        let spanDays = 1;
        try {
          const currentStart = Temporal.PlainDate.from(startInput);
          const currentEnd = Temporal.PlainDate.from(endInput);
          spanDays = Math.max(1, currentStart.until(currentEnd, { largestUnit: "days" }).days);
        } catch {
          // An incomplete date field should remain recoverable; use the
          // smallest valid all-day interval until both dates are available.
        }
        setStartOccurrence("first");
        setStartInput(nextStart.toString());
        setEndInput(nextStart.add({ days: spanDays }).toString());
        setEndOccurrence("first");
      } catch {
        setStartInput(next);
      }
      return;
    }
    const duration = currentDuration || 60;
    setStartOccurrence("first");
    setStartInput(next);
    const nextEnd = addElapsedMinutes(next, duration, zone, "first");
    setEndInput(nextEnd.value);
    setEndOccurrence(nextEnd.occurrence);
  }

  function updateEnd(next: string) {
    setEndOccurrence("first");
    setEndInput(next);
  }

  function toggleAllDay(checked: boolean) {
    setAllDay(checked);
    if (checked) {
      const startDate = startParts.date;
      const endDate = endParts.date > startDate
        ? endParts.date
        : Temporal.PlainDate.from(startDate).add({ days: 1 }).toString();
      setStartInput(startDate);
      setEndInput(endDate);
      setStartOccurrence("first");
      setEndOccurrence("first");
      return;
    }
    const startDate = startParts.date || startInput.slice(0, 10);
    const timedStart = `${startDate}T09:00`;
    setStartInput(timedStart);
    setEndInput(`${startDate}T10:00`);
    setStartOccurrence("first");
    setEndOccurrence("first");
  }

  return (
    <form
      className="calendar-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({
          event: {
            ...value,
            title: value.title.trim(),
            start: startInput === initialStart && startOccurrence === initialStartOccurrence && allDay === (initial.start.kind === "date") ? initial.start : inputToCalendarValue(startInput, allDay, zone, startOccurrence),
            end: endInput === initialEnd && endOccurrence === initialEndOccurrence && allDay === (initial.end.kind === "date") ? initial.end : inputToCalendarValue(endInput, allDay, zone, endOccurrence),
            attendees: attendees
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean)
              .map((email) => {
                const existing = initial.attendees?.find((attendee) => attendee.email.toLowerCase() === email.toLowerCase());
                return existing?.optional === undefined ? { email } : { email, optional: existing.optional };
              }),
          },
          sendUpdates,
          recurrenceScope,
        });
      }}
    >
      <div className="calendar-form__primary">
        <label className="calendar-form__title-field">
          <span>Title</span>
          <Input
            className="calendar-form__title"
            aria-label="Event title"
            autoFocus
            value={value.title}
            onChange={(event) => setValue({ ...value, title: event.target.value })}
            placeholder="e.g. Design review"
            maxLength={500}
          />
        </label>
        <div className="calendar-form__calendar">
          <CalendarRange size={15} aria-hidden="true" />
          <span>Calendar</span>
          {sourceLocked ? <div className="calendar-form__fixed-source" aria-label={`Calendar, ${selectedSource?.name ?? value.calendarId}`}>
            <strong>{selectedSource?.name ?? value.calendarId}</strong>
            <small>Events stay in their original calendar while editing.</small>
          </div> : <KoraSelect label="Calendar" value={value.calendarId} options={writableSources.map((source) => ({ value: source.calendarId, label: source.name, description: source.authority === "kora" ? "Private Kora calendar" : "Connected Google calendar" }))} onValueChange={(calendarId) => {
            const nextSource = sources.find((source) => source.calendarId === calendarId);
            setValue({ ...value, calendarId, ...(nextSource?.authority === "kora" ? { conference: { kind: "none" } as const, recurrence: [] } : {}) });
            if (nextSource?.authority === "kora") setSendUpdates("none");
          }} />}
        </div>
      </div>

      <section className="calendar-form__section calendar-form__when" aria-labelledby="event-when-heading">
        <div className="calendar-form__section-head">
          <span><Clock3 size={16} aria-hidden="true" /><strong id="event-when-heading">When</strong></span>
          <div className="calendar-switch">
            <span>All day</span>
            <Switch checked={allDay} onCheckedChange={toggleAllDay} label="All day" />
          </div>
        </div>

        <div className={`calendar-schedule ${allDay ? "calendar-schedule--all-day" : ""}`}>
          <div className="calendar-schedule__row">
            <span>Starts</span>
            <Input
              aria-label="Start date"
              type="date"
              value={startParts.date}
              onChange={(event) => updateStart(allDay ? event.target.value : at(event.target.value, startParts.time))}
            />
            {!allDay && (
              <Input
                aria-label="Start time"
                type="time"
                step={300}
                value={startParts.time}
                onChange={(event) => updateStart(at(startParts.date, event.target.value))}
              />
            )}
          </div>
          <div className="calendar-schedule__row">
            <span>Ends</span>
            <Input
              aria-label="End date"
              type="date"
              value={endParts.date}
              onChange={(event) => updateEnd(allDay ? event.target.value : at(event.target.value, endParts.time))}
            />
            {!allDay && (
              <Input
                aria-label="End time"
                type="time"
                step={300}
                value={endParts.time}
                onChange={(event) => updateEnd(at(endParts.date, event.target.value))}
              />
            )}
          </div>
        </div>

        {!allDay && startResolution?.ambiguous ? <div className="calendar-occurrence-choice"><span>Start occurrence</span><KoraSelect label="Start occurrence" value={startOccurrence} options={[{ value: "first", label: "First occurrence", description: "The earlier offset for this clock time." }, { value: "second", label: "Second occurrence", description: "The later offset for this clock time." }]} onValueChange={(next) => setStartOccurrence(next as CalendarOccurrence)} /></div> : null}
        {!allDay && endResolution?.ambiguous ? <div className="calendar-occurrence-choice"><span>End occurrence</span><KoraSelect label="End occurrence" value={endOccurrence} options={[{ value: "first", label: "First occurrence", description: "The earlier offset for this clock time." }, { value: "second", label: "Second occurrence", description: "The later offset for this clock time." }]} onValueChange={(next) => setEndOccurrence(next as CalendarOccurrence)} /></div> : null}

        {!allDay && (
          <div className="calendar-duration">
            <span>Duration</span>
            <SegmentedControl layoutId="calendar-event-duration" label="Set event duration" value={currentDuration ? String(currentDuration) : ""} options={durations.map((duration) => ({ value: String(duration.minutes), label: duration.label }))} onValueChange={(minutes) => { const nextEnd = addElapsedMinutes(startInput, Number(minutes), zone, startOccurrence); setEndInput(nextEnd.value); setEndOccurrence(nextEnd.occurrence); }} />
          </div>
        )}
        <small className="calendar-form__zone">{allDay ? "Ends at midnight after the final day (the end date is the following morning)" : zone.replaceAll("_", " ")}</small>
      </section>

      <section className="calendar-form__section calendar-form__details" aria-label="Event details">
        <label className="calendar-inline-field">
          <MapPin size={16} aria-hidden="true" />
          <span>Location</span>
          <Input aria-label="Location" value={value.location ?? ""} onChange={(event) => setValue({ ...value, location: event.target.value })} placeholder="e.g. Studio desk" />
        </label>
        <label className="calendar-inline-field">
          <Users size={16} aria-hidden="true" />
          <span>{isKoraEvent ? "People" : "Guests"}</span>
          <Input
            aria-label={isKoraEvent ? "People references" : "Guests"}
            value={attendees}
            onChange={(event) => {
              const next = event.target.value;
              if (!isKoraEvent && !updatesTouched && !attendees.trim() && next.trim()) setSendUpdates("all");
              setAttendees(next);
            }}
            placeholder={isKoraEvent ? "Add people for your reference" : "Add guests by email"}
          />
          {isKoraEvent ? <small className="calendar-local-people-note">Saved only with this private Kora event. No invitation or notification is sent.</small> : null}
        </label>
        <div className="calendar-inline-toggle">
          <Video size={16} aria-hidden="true" />
          <div>
            <strong>{isKoraEvent ? "Video link" : existingConference ? "Video conference attached" : "Add Google Meet"}</strong>
            <small>{isKoraEvent ? "Choose a Google calendar to create a Meet link." : existingConference ? "Existing conference details will be preserved." : "Created by Google after confirmation."}</small>
          </div>
          <Switch
            checked={!isKoraEvent && value.conference.kind === "google_meet"}
            disabled={isKoraEvent || existingConference}
            onCheckedChange={(checked) => setValue({ ...value, conference: { kind: checked ? "google_meet" : "none" } })}
            label={isKoraEvent ? "Google Meet unavailable for Kora events" : existingConference ? "Keep existing video conference" : "Create Google Meet"}
          />
        </div>

        <div className="calendar-inline-field calendar-inline-field--repeat">
          <Repeat2 size={16} aria-hidden="true" />
          <span>Repeat</span>
          <div><KoraSelect label="Repeat" value={repeat} disabled={isKoraEvent} options={[{ value: "none", label: "Does not repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "Every month" }, { value: "yearly", label: "Every year" }, ...(repeat === "custom" ? [{ value: "custom", label: "Custom provider schedule" }] : [])]} onValueChange={(nextValue) => {
            const next = nextValue as RepeatPreset;
            if (next === "none") setValue({ ...value, recurrence: [] });
            else if (next !== "custom") setValue({ ...value, recurrence: [`RRULE:FREQ=${next.toUpperCase()}`] });
          }} /><small>{isKoraEvent ? "Recurring Kora events are not supported yet. Choose a writable Google calendar to repeat." : repeat === "custom" ? "This provider-defined schedule will be preserved until you choose a standard cadence." : "Cadence is sent to the selected Google calendar for review."}</small></div>
        </div>
        {!isKoraEvent && repeat !== "none" && repeat !== "custom" ? <div className="calendar-recurrence-end"><label><span>Ends</span><KoraSelect label="Repeat ends" value={repeatEnd} options={[{ value: "never", label: "Never" }, { value: "count", label: "After a number of occurrences" }, ...(repeatUntil ? [{ value: "until", label: `On ${formatRepeatUntil(repeatUntil)}` }] : [])]} onValueChange={(next) => setValue({ ...value, recurrence: [next === "until" ? repeatRule : withRepeatCount(repeatRule, next === "count" ? repeatCount : undefined)] })} /></label>{repeatEnd === "count" ? <label><span>Occurrences</span><Input aria-label="Number of occurrences" type="number" min={2} max={999} value={repeatCount} onChange={(event) => setValue({ ...value, recurrence: [withRepeatCount(repeatRule, Math.max(2, Math.min(999, Number(event.target.value) || 2)))] })} /></label> : null}</div> : null}

        <AnimatePresence initial={false}>
          {hasGuests && !isKoraEvent && (
            <motion.label
              className="calendar-inline-field calendar-inline-field--updates"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: DUR.base, ease: EASE.out }}
            >
              <Bell size={16} aria-hidden="true" />
              <span>Guest updates</span>
              <KoraSelect label="Guest updates" value={sendUpdates} options={[{ value: "all", label: "Notify all guests" }, { value: "externalOnly", label: "External guests only" }, { value: "none", label: "Don’t send updates" }]} onValueChange={(next) => { setUpdatesTouched(true); setSendUpdates(next as CalendarFormValue["sendUpdates"]); }} />
            </motion.label>
          )}
        </AnimatePresence>
      </section>

      {recurring && (
        <section className="calendar-form__section">
          <label className="calendar-inline-field calendar-inline-field--updates">
            <CalendarRange size={16} aria-hidden="true" />
            <span>Change</span>
            <KoraSelect label="Change recurrence scope" value={recurrenceScope} options={[{ value: "occurrence", label: "Only this occurrence" }, { value: "series", label: "The entire series" }]} onValueChange={(next) => setRecurrenceScope(next as CalendarFormValue["recurrenceScope"])} />
          </label>
        </section>
      )}

      <label className="calendar-form__notes">
        <span>Notes</span>
        <Textarea
          value={value.description ?? ""}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
          placeholder="Add notes, links, or useful context"
          rows={4}
        />
      </label>

      {!valid && validationMessage ? <p role="alert" className="calendar-form__validation">{validationMessage}</p> : null}

      <div className="calendar-form__actions">
        <Button type="button" tone="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!valid || busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
