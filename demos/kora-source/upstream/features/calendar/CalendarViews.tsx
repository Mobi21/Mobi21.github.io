import { CalendarClock, CloudOff, MapPin, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Temporal } from "temporal-polyfill";
import type { CalendarEvent, CalendarSource } from "../../lib/runtime";
import { Button, Pressable } from "../../components/primitives";
import { SegmentedControl } from "../../components/form";
import { Popover } from "../../components/overlays";
import { formatEventRange } from "./calendar-contract";
import type { CalendarView } from "./calendar-routing";
import {
  calendarEventTime,
  calendarEventEndTime,
  calendarDayScale,
  dateAtNoon,
  eventStartDay,
  groupCalendarEvents,
  rangeForCalendarView,
} from "./calendar-view-model";

type CalendarViewsProps = {
  view: CalendarView;
  anchor: string;
  today: string;
  viewerTimeZone: string;
  events: readonly CalendarEvent[];
  sources: readonly CalendarSource[];
  coverageComplete?: boolean;
  nowInstant?: string;
  onStepPeriod?: (direction: -1 | 1) => void;
  onSelectEvent: (event: CalendarEvent, trigger: HTMLElement) => void;
  onSelectDay: (day: string) => void;
  onCreate: (seed?: { day: string; minute?: number; instant?: string; allDay?: boolean }, trigger?: HTMLElement) => void;
};

export function CalendarViews(props: CalendarViewsProps) {
  const content = props.view === "month" ? <MonthCalendar {...props} />
    : props.view === "week" ? <WeekCalendar {...props} />
      : props.view === "day" ? <DayCalendar {...props} />
        : <AgendaCalendar {...props} singleDay={false} />;
  return <div className="calendar-view-surface" onKeyDown={(event) => {
    if (!props.onStepPeriod || (event.key !== "PageUp" && event.key !== "PageDown")) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    event.preventDefault();
    event.stopPropagation();
    props.onStepPeriod(event.key === "PageUp" ? -1 : 1);
  }}>{content}</div>;
}

function MonthCalendar(props: CalendarViewsProps) {
  const compact = useCompactMonth();
  const shortWindow = useShortMonth();
  const visibleCount = compact ? 1 : shortWindow ? 2 : 3;
  const range = rangeForCalendarView("month", props.anchor, props.viewerTimeZone);
  const days = datesBetween(range.startDate, range.endDateExclusive);
  const [focusedDay, setFocusedDay] = useState(props.anchor);
  const grouped = groupCalendarEvents(props.events, range);
  const anchorMonth = props.anchor.slice(0, 7);
  const rows = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  useEffect(() => setFocusedDay(props.anchor), [props.anchor]);
  return <div className="calendar-month" role="grid" aria-label={monthLabel(props.anchor)}>
    <div className="calendar-month__weekdays" role="row">
      {dayNames.map((day) => <span key={day} role="columnheader">{day}</span>)}
    </div>
    <div className="calendar-month__weeks" role="rowgroup">
      {rows.map((week) => <div className="calendar-month__week" role="row" key={week[0]}>
        {week.map((day) => {
          const events = grouped.get(day) ?? [];
          const shown = events.slice(0, visibleCount);
          const hidden = events.length - shown.length;
          const current = day === props.today;
          return <section className={`calendar-month__day${day.slice(0, 7) !== anchorMonth ? " is-outside" : ""}${current ? " is-today" : ""}${day === props.anchor ? " is-selected" : ""}`} role="gridcell" aria-selected={day === props.anchor} aria-label={`${fullDayLabel(day)}${events.length ? `, ${events.length} events` : ", no events"}`} key={day}>
            <Pressable className="calendar-date-button" data-calendar-day={day} tabIndex={day === focusedDay ? 0 : -1} onClick={() => { setFocusedDay(day); props.onSelectDay(day); }} onKeyDown={(event) => {
              const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : event.key === "ArrowDown" ? 7 : 0;
              if (!delta) return;
              event.preventDefault();
              const next = Temporal.PlainDate.from(day).add({ days: delta }).toString();
              if (!days.includes(next)) return;
              setFocusedDay(next);
              event.currentTarget.closest(".calendar-month")?.querySelector<HTMLButtonElement>(`[data-calendar-day="${next}"]`)?.focus();
            }} aria-label={`Open ${current ? "today, " : ""}${fullDayLabel(day)}`}>
              <span>{Number(day.slice(-2))}</span>{current && <small>Today</small>}
            </Pressable>
            <div className="calendar-month__events">
              {shown.map((event) => <EventEntry key={eventKey(event, day)} event={event} day={day} sources={props.sources} compact month onSelect={props.onSelectEvent} />)}
              {hidden > 0 && <Pressable className="calendar-more" onClick={() => props.onSelectDay(day)} aria-label={`Open ${fullDayLabel(day)} to see ${hidden} more events`}>{hidden} more</Pressable>}
            </div>
          </section>;
        })}
      </div>)}
    </div>
  </div>;
}

function useCompactMonth() {
  const query = "(max-width: 820px)";
  const [compact, setCompact] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function WeekCalendar(props: CalendarViewsProps) {
  const compact = useCompactMonth();
  const [compactLens, setCompactLens] = useState<"agenda" | "grid">("agenda");
  const range = rangeForCalendarView("week", props.anchor, props.viewerTimeZone);
  const days = datesBetween(range.startDate, range.endDateExclusive);
  return compact
    ? <section className="calendar-compact-week-view" aria-label="Compact week">
      <div className="calendar-compact-week-view__toolbar">
        <span>Week layout</span>
        <SegmentedControl
          label="Compact week layout"
          layoutId="calendar-compact-week-layout"
          value={compactLens}
          onValueChange={(value) => setCompactLens(value as "agenda" | "grid")}
          options={[{ value: "agenda", label: "Agenda" }, { value: "grid", label: "Grid" }]}
        />
      </div>
      {compactLens === "agenda"
        ? <div className="calendar-week-agenda-view"><CompactWeekAgenda {...props} days={days} /></div>
        : <div className="calendar-week-grid-view"><CalendarTimeGrid {...props} days={days} label={weekLabel(range.startDate, range.endDateExclusive)} /></div>}
    </section>
    : <div className="calendar-week-grid-view"><CalendarTimeGrid {...props} days={days} label={weekLabel(range.startDate, range.endDateExclusive)} /></div>;
}

function DayCalendar(props: CalendarViewsProps) {
  const compact = useCompactMonth();
  const [compactLens, setCompactLens] = useState<"grid" | "agenda">("grid");
  if (compact) return <section className="calendar-compact-week-view calendar-compact-day-view" aria-label="Compact day">
    <div className="calendar-compact-week-view__toolbar">
      <span>Day layout</span>
      <SegmentedControl
        label="Compact day layout"
        layoutId="calendar-compact-day-layout"
        value={compactLens}
        onValueChange={(value) => setCompactLens(value as "grid" | "agenda")}
        options={[{ value: "grid", label: "Grid" }, { value: "agenda", label: "Agenda" }]}
      />
    </div>
    {compactLens === "grid"
      ? <div className="calendar-week-grid-view"><CalendarTimeGrid {...props} days={[props.anchor]} label={fullDayLabel(props.anchor)} /></div>
      : <div className="calendar-week-agenda-view"><AgendaCalendar {...props} singleDay /></div>}
  </section>;
  return <CalendarTimeGrid
    {...props}
    days={[props.anchor]}
    label={fullDayLabel(props.anchor)}
    accessibleAgendaDescription={dayAgendaDescription(props)}
  />;
}

type TimedLayout = {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  startInstant: string;
  endInstant: string;
  lane: number;
  laneCount: number;
  scaleMinutes: number;
  overflowCount?: number;
  hiddenEvents?: CalendarEvent[];
};

function CalendarTimeGrid(props: CalendarViewsProps & { days: string[]; label: string; accessibleAgendaDescription?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const accessibleAgendaId = useId();
  const visibleRange = dateRangeForDays(props.days);
  const grouped = groupCalendarEvents(props.events, visibleRange);
  const scales = new Map(props.days.map((day) => [day, calendarDayScale(day, props.viewerTimeZone)]));
  const maxScaleMinutes = Math.max(...[...scales.values()].map((scale) => scale.totalMinutes));
  const axisScale = [...scales.values()].sort((left, right) => right.totalMinutes - left.totalMinutes)[0];
  const allDayByDay = new Map(props.days.map((day) => [day, (grouped.get(day) ?? []).filter((event) => event.allDay || event.start.kind === "date")]));
  // One lane per overlap cluster keeps a Week card wide enough to carry a
  // useful title. Day has more room, while every clipped lane remains
  // individually reachable from its in-context disclosure.
  const maximumLanes = props.days.length === 1 ? 8 : 1;
  const timedByDay = new Map(props.days.map((day) => [day, layoutTimedEvents((grouped.get(day) ?? []).filter((event) => !event.allDay && event.start.kind === "dateTime"), scales.get(day)!, maxScaleMinutes, maximumLanes)]));
  const now = props.nowInstant
    ? Temporal.Instant.from(props.nowInstant).toZonedDateTimeISO(props.viewerTimeZone)
    : Temporal.Now.zonedDateTimeISO(props.viewerTimeZone);
  const todayScale = scales.get(props.today);
  const nowMinute = todayScale
    ? now.toInstant().since(Temporal.Instant.from(todayScale.startInstant)).total({ unit: "minute" })
    : now.hour * 60 + now.minute;
  const gridColumns = `56px repeat(${props.days.length}, minmax(112px, 1fr))`;
  const timedLayouts = [...timedByDay.entries()].flatMap(([day, layouts]) => layouts.map((layout) => ({ day, layout })));
  const firstTimedMinute = timedLayouts
    .filter(({ day, layout }) => eventStartDay(layout.event) === day)
    .reduce((earliest, { layout }) => Math.min(earliest, layout.startMinute), Number.POSITIVE_INFINITY);
  const initialHour = Number.isFinite(firstTimedMinute) ? Math.max(0, Math.floor(firstTimedMinute / 60) - 1) : 7;
  const initialDayIndex = Math.max(0, props.days.indexOf(props.anchor));
  const [focusedSlot, setFocusedSlot] = useState({ dayIndex: initialDayIndex, slotIndex: initialHour });
  const earlierTimedCount = timedLayouts
    .filter(({ layout }) => layout.endMinute <= initialHour * 60)
    .reduce((count, { layout }) => count + (layout.overflowCount ?? 1), 0);
  const hasVisibleEvents = props.days.some((day) => (grouped.get(day)?.length ?? 0) > 0);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialHour * 52;
    setFocusedSlot({ dayIndex: initialDayIndex, slotIndex: initialHour });
  }, [initialDayIndex, initialHour, props.anchor, props.days.length]);

  const focusSlot = (current: HTMLButtonElement, dayDelta: number, slotDelta: number) => {
    const dayIndex = Number(current.dataset.dayIndex ?? 0);
    const slotIndex = Number(current.dataset.slotIndex ?? 0);
    const nextDay = Math.max(0, Math.min(props.days.length - 1, dayIndex + dayDelta));
    const nextScale = scales.get(props.days[nextDay])!;
    const nextSlot = Math.max(0, Math.min(nextScale.slots.length - 1, slotIndex + slotDelta));
    setFocusedSlot({ dayIndex: nextDay, slotIndex: nextSlot });
    current.closest(".calendar-time-grid")?.querySelector<HTMLButtonElement>(`[data-day-index="${nextDay}"][data-slot-index="${nextSlot}"]`)?.focus();
  };

  return <div className={`calendar-time-grid${hasVisibleEvents ? "" : " calendar-time-grid--empty"}`} data-calendar-scroll-owner="time-grid-horizontal" role="group" aria-label={props.label} aria-describedby={`${instructionsId}${props.accessibleAgendaDescription ? ` ${accessibleAgendaId}` : ""}`} style={{ "--calendar-grid-columns": gridColumns, "--calendar-day-count": String(props.days.length) } as CSSProperties}>
    <p id={instructionsId} className="sr-only">Use the arrow keys to move between real hourly creation slots. Daylight-saving transitions are named in the affected day.</p>
    {props.accessibleAgendaDescription ? <p id={accessibleAgendaId} hidden>{props.accessibleAgendaDescription}</p> : null}
    <div className="calendar-time-grid__header" style={{ gridTemplateColumns: gridColumns }}>
      <div className="calendar-time-grid__corner" aria-hidden="true" />
      {props.days.map((day) => {
        const transition = scales.get(day)?.transition;
        return <Pressable key={day} className={`calendar-time-grid__day${day === props.today ? " is-today" : ""}`} onClick={() => props.onSelectDay(day)} aria-label={`Open ${day === props.today ? "today, " : ""}${fullDayLabel(day)}`}><span>{shortWeekday(day)}</span><strong>{Number(day.slice(-2))}</strong>{day === props.today ? <em>Today</em> : null}{transition ? <small className="calendar-time-grid__day-transition">{transition.label}</small> : null}</Pressable>;
      })}
    </div>
    <div className="calendar-all-day" style={{ gridTemplateColumns: gridColumns }}>
      <div className="calendar-all-day__label">All day</div>
      {props.days.map((day) => <div className="calendar-all-day__lane" key={day}>
        {(allDayByDay.get(day) ?? []).slice(0, 3).map((event) => <EventEntry key={eventKey(event, day)} event={event} day={day} sources={props.sources} compact onSelect={props.onSelectEvent} />)}
        {(allDayByDay.get(day)?.length ?? 0) > 3 ? <EventOverflowPopover events={(allDayByDay.get(day) ?? []).slice(3)} day={day} viewerTimeZone={props.viewerTimeZone} sources={props.sources} onSelectEvent={props.onSelectEvent} onSelectDay={props.onSelectDay} label={`Open ${fullDayLabel(day)} to see ${(allDayByDay.get(day)?.length ?? 0) - 3} more all-day events`} summary={`+${(allDayByDay.get(day)?.length ?? 0) - 3} more`} /> : null}
        {!(allDayByDay.get(day)?.length) ? <Pressable className="calendar-all-day__empty" aria-label={`Create all-day event on ${fullDayLabel(day)}`} onClick={(event) => props.onCreate({ day, allDay: true }, event.currentTarget)}><Plus size={12} aria-hidden="true" /></Pressable> : null}
      </div>)}
    </div>
    {!hasVisibleEvents ? <div className="calendar-time-grid__empty">
      <div><h2>{props.coverageComplete === false ? "No events available from responding calendars" : props.days.length === 1 ? "Nothing scheduled this day" : "Nothing scheduled this week"}</h2><p>{props.coverageComplete === false ? "Calendar coverage is incomplete. Review the unavailable source or retry before treating this time as clear." : "The selected calendars are clear in this range."}</p></div>
      <Button tone="primary" onClick={(event) => props.onCreate({ day: props.anchor }, event.currentTarget)}>Create an event</Button>
    </div> : null}
    {earlierTimedCount > 0 && initialHour > 0 ? <Pressable className="calendar-time-grid__earlier" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }}>{earlierTimedCount} earlier {earlierTimedCount === 1 ? "event" : "events"} before {hourLabel(initialHour)} · Show</Pressable> : null}
    <div className="calendar-time-grid__scroll" data-calendar-scroll-owner="time-grid-vertical" ref={scrollRef}>
      <div className="calendar-time-grid__body" style={{ gridTemplateColumns: gridColumns, "--calendar-scale-minutes": String(maxScaleMinutes) } as CSSProperties}>
        <div className="calendar-time-axis" aria-hidden="true">{axisScale.slots.map((slot) => <span key={slot.key} style={{ top: `${(slot.elapsedMinute / maxScaleMinutes) * 100}%` }}>{axisSlotLabel(slot)}</span>)}</div>
        {props.days.map((day, dayIndex) => {
          const scale = scales.get(day)!;
          return <div key={day} className={`calendar-time-day${day === props.today ? " is-today" : ""}`}>
          <div className="calendar-time-day__hours" aria-hidden="true">{scale.slots.map((slot) => <span key={slot.key} style={{ top: `${(slot.elapsedMinute / maxScaleMinutes) * 100}%`, height: `${(60 / maxScaleMinutes) * 100}%` }} />)}</div>
          <div className="calendar-time-day__slots">{scale.slots.map((slot, slotIndex) => <Pressable key={slot.key} className={(timedByDay.get(day) ?? []).some((layout) => layout.startMinute < slot.elapsedMinute + 60 && layout.endMinute > slot.elapsedMinute) ? "calendar-time-slot--adjacent" : undefined} data-day-index={dayIndex} data-slot-index={slotIndex} tabIndex={focusedSlot.dayIndex === dayIndex && focusedSlot.slotIndex === slotIndex ? 0 : -1} aria-label={`Create event on ${fullDayLabel(day)} at ${slot.label}${slot.occurrence > 1 ? `, ${slot.offset}` : ""}`} style={{ top: `${(slot.elapsedMinute / maxScaleMinutes) * 100}%`, height: `${(60 / maxScaleMinutes) * 100}%` }} onClick={(event) => { setFocusedSlot({ dayIndex, slotIndex }); props.onCreate({ day, minute: Temporal.Instant.from(slot.instant).toZonedDateTimeISO(props.viewerTimeZone).hour * 60, instant: slot.instant }, event.currentTarget); }} onKeyDown={(event) => {
            if (event.key === "ArrowUp") { event.preventDefault(); focusSlot(event.currentTarget, 0, -1); }
            else if (event.key === "ArrowDown") { event.preventDefault(); focusSlot(event.currentTarget, 0, 1); }
            else if (event.key === "ArrowLeft") { event.preventDefault(); focusSlot(event.currentTarget, -1, 0); }
            else if (event.key === "ArrowRight") { event.preventDefault(); focusSlot(event.currentTarget, 1, 0); }
          }} />)}</div>
          {day === props.today ? <span role="img" className="calendar-current-time" style={{ top: `${(nowMinute / maxScaleMinutes) * 100}%` }} aria-label={`Current time ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: props.viewerTimeZone }).format(new Date(now.toInstant().toString()))}`}><span /></span> : null}
          {(timedByDay.get(day) ?? []).map((layout) => layout.overflowCount
            ? <TimedOverflowBlock key={`overflow:${day}:${layout.startMinute}:${layout.endMinute}`} layout={layout} day={day} viewerTimeZone={props.viewerTimeZone} sources={props.sources} onSelectEvent={props.onSelectEvent} onSelectDay={props.onSelectDay} />
            : <TimedEventBlock key={eventKey(layout.event, day)} layout={layout} day={day} viewerTimeZone={props.viewerTimeZone} sources={props.sources} onSelect={props.onSelectEvent} />)}
        </div>;})}
      </div>
    </div>
  </div>;
}

function TimedOverflowBlock({ layout, day, viewerTimeZone, sources, onSelectEvent, onSelectDay }: { layout: TimedLayout; day: string; viewerTimeZone: string; sources: readonly CalendarSource[]; onSelectEvent: CalendarViewsProps["onSelectEvent"]; onSelectDay: CalendarViewsProps["onSelectDay"] }) {
  const events = layout.hiddenEvents ?? [];
  const count = events.length;
  const range = clippedTimedRange(layout.startInstant, layout.endInstant, day, viewerTimeZone);
  return <EventOverflowPopover
    events={events}
    day={day}
    viewerTimeZone={viewerTimeZone}
    sources={sources}
    onSelectEvent={onSelectEvent}
    onSelectDay={onSelectDay}
    label={`${layout.event.title}, ${range.accessibleStart} to ${range.accessibleEnd}; ${count} overlapping events. Open ${fullDayLabel(day)}.`}
    summary={<><strong>{layout.event.title}</strong><span className="calendar-timed-event__time">{range.visual}</span><span>Review {count} events</span></>}
    className="calendar-timed-event calendar-timed-overflow"
    style={{
    "--event-top": `${(layout.startMinute / layout.scaleMinutes) * 100}%`,
    "--event-height": `${Math.max(1.7, ((layout.endMinute - layout.startMinute) / layout.scaleMinutes) * 100)}%`,
    "--event-lane": String(layout.lane),
    "--event-lanes": String(layout.laneCount),
  } as CSSProperties}
  />;
}

function useShortMonth() {
  const query = "(max-height: 850px)";
  const [short, setShort] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return;
    const update = () => setShort(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return short;
}

function EventOverflowPopover({ events, day, viewerTimeZone, sources, onSelectEvent, onSelectDay, label, summary, className = "calendar-all-day__more", style }: {
  events: readonly CalendarEvent[];
  day: string;
  viewerTimeZone: string;
  sources: readonly CalendarSource[];
  onSelectEvent: CalendarViewsProps["onSelectEvent"];
  onSelectDay: CalendarViewsProps["onSelectDay"];
  label: string;
  summary: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = events.length;
  const isTimed = events.some((event) => !event.allDay && event.start.kind === "dateTime");
  return <Popover
    open={open}
    onOpenChange={setOpen}
    purpose="selection"
    title={`${count} ${isTimed ? "overlapping " : "additional "}events`}
    description={`${fullDayLabel(day, false)} · Select an event to open its details.`}
    align="start"
    sideOffset={8}
    collisionPadding={8}
    className="calendar-event-overflow-popover"
    finalFocus={triggerRef}
    trigger={<Pressable ref={triggerRef} className={className} style={style} aria-label={label} aria-expanded={open}>{summary}</Pressable>}
  >
    <ol className="calendar-event-overflow-list" aria-label={`${count} events in ${fullDayLabel(day, false)}`}>
      {events.map((event) => <li key={eventKey(event, day)}><OverflowEventButton event={event} day={day} viewerTimeZone={viewerTimeZone} sources={sources} triggerRef={triggerRef} onSelect={(selected, trigger) => { setOpen(false); onSelectEvent(selected, trigger); }} /></li>)}
    </ol>
    <div className="calendar-event-overflow__hint">{isTimed ? "The time canvas stays in place while you review this cluster." : "These entries continue the same day context."}</div>
    <Pressable className="calendar-event-overflow__day-link" onClick={() => { setOpen(false); onSelectDay(day); }}>Open day view</Pressable>
  </Popover>;
}

function OverflowEventButton({ event, day, viewerTimeZone, sources, triggerRef, onSelect }: { event: CalendarEvent; day: string; viewerTimeZone: string; sources: readonly CalendarSource[]; triggerRef: RefObject<HTMLButtonElement | null>; onSelect: CalendarViewsProps["onSelectEvent"] }) {
  const source = sources.find((candidate) => candidate.calendarId === event.calendarId);
  const authority = event.authority === "kora" ? "Stored in Kora" : event.syncState === "stale" ? "Last-confirmed copy" : "Google event";
  const segment = event.start.kind === "dateTime" && event.end.kind === "dateTime" ? timedSegment(event, calendarDayScale(day, viewerTimeZone)) : undefined;
  const label = segment
    ? timedEventAccessibleLabel(event, day, segment.startInstant, segment.endInstant, viewerTimeZone, source?.name ?? "Calendar", authority)
    : eventAccessibleLabel(event, day, source?.name ?? "Calendar", authority);
  const time = overflowEventTime(event, day, viewerTimeZone);
  return <Pressable className="calendar-event-overflow__event" data-calendar-id={event.calendarId} data-event-id={event.eventId} aria-label={label} onClick={(click) => onSelect(event, triggerRef.current ?? click.currentTarget)}>
    <span className="calendar-event-overflow__marker" style={{ background: source?.color ?? "var(--signal)" }} aria-hidden="true" />
    <span className="calendar-event-overflow__event-body"><strong>{event.title}</strong><time>{time}</time><small>{[source?.name, authority].filter(Boolean).join(" · ")}</small></span>
  </Pressable>;
}

function overflowEventTime(event: CalendarEvent, day: string, viewerTimeZone: string) {
  if (event.allDay || event.start.kind === "date") return eventSpanLabel(event, day) ?? "All day";
  const scale = calendarDayScale(day, viewerTimeZone);
  const segment = timedSegment(event, scale);
  return segment ? clippedTimedRange(segment.startInstant, segment.endInstant, day, viewerTimeZone).visual : calendarEventTime(event);
}

function axisSlotLabel(slot: { label: string; occurrence: number }) {
  if (slot.occurrence <= 1) return slot.label;
  return `${slot.label.replace(/, second occurrence$/, "")} (${slot.occurrence})`;
}

function TimedEventBlock({ layout, day, viewerTimeZone, sources, onSelect }: { layout: TimedLayout; day: string; viewerTimeZone: string; sources: readonly CalendarSource[]; onSelect: CalendarViewsProps["onSelectEvent"] }) {
  const { event, startMinute, endMinute, lane, laneCount, scaleMinutes } = layout;
  const source = sources.find((candidate) => candidate.calendarId === event.calendarId);
  const authority = event.authority === "kora" ? "Stored in Kora" : event.syncState === "stale" ? "Last-confirmed copy" : "Google event";
  const label = timedEventAccessibleLabel(event, day, layout.startInstant, layout.endInstant, viewerTimeZone, source?.name ?? "Calendar", authority);
  const duration = Math.max(0, endMinute - startMinute);
  const short = duration < 60;
  const compact = duration <= 30;
  const showLocation = duration >= 60 && Boolean(event.location);
  return <Pressable style={{
    "--event-top": `${(startMinute / scaleMinutes) * 100}%`,
    "--event-height": `${Math.max(1.7, ((endMinute - startMinute) / scaleMinutes) * 100)}%`,
    "--event-lane": String(lane),
    "--event-lanes": String(laneCount),
    "--calendar-entry-color": source?.color ?? "var(--signal)",
  } as CSSProperties} data-calendar-id={event.calendarId} data-event-id={event.eventId} data-duration-minutes={Math.round(duration)} className={`calendar-timed-event${short ? " calendar-timed-event--short" : ""}${compact ? " calendar-timed-event--compact" : ""}${event.syncState === "stale" ? " is-stale" : ""}`} aria-label={label} onClick={(click) => onSelect(event, click.currentTarget)}>
    <strong>{event.title}</strong>
    <span className="calendar-timed-event__time">{clippedTimedRange(layout.startInstant, layout.endInstant, day, viewerTimeZone).visual}</span>
    {showLocation ? <span className="calendar-timed-event__location">{event.location}</span> : null}
    {event.syncState === "stale" ? <CloudOff size={12} aria-hidden="true" /> : null}
  </Pressable>;
}

function CompactWeekAgenda(props: CalendarViewsProps & { days: string[] }) {
  const grouped = groupCalendarEvents(props.events, dateRangeForDays(props.days));
  const hasEvents = props.days.some((day) => grouped.get(day)?.length);
  if (!hasEvents) return <div className="calendar-agenda calendar-agenda--empty"><CalendarClock size={22} /><h2>{props.coverageComplete === false ? "No events available from responding calendars" : "Nothing scheduled this week"}</h2><p>{props.coverageComplete === false ? "Calendar coverage is incomplete. Review the unavailable source or retry before treating this week as clear." : "All selected calendars were read successfully and are clear in this range."}</p><Button tone="primary" onClick={(event) => props.onCreate({ day: props.anchor }, event.currentTarget)}>Create a Kora event</Button></div>;
  return <ol className="calendar-compact-week" aria-label={weekLabel(props.days[0], Temporal.PlainDate.from(props.days.at(-1)!).add({ days: 1 }).toString())}>
    {props.days.map((day) => {
      const events = grouped.get(day) ?? [];
      if (!events.length) return null;
      return <li key={day} className={day === props.today ? "is-today" : ""}><Pressable className="calendar-compact-week__date" onClick={() => props.onSelectDay(day)}><span>{shortWeekday(day)}</span><strong>{Number(day.slice(-2))}</strong>{day === props.today ? <em>Today</em> : null}</Pressable><div>{events.map((event) => <EventEntry key={eventKey(event, day)} event={event} day={day} sources={props.sources} agenda onSelect={props.onSelectEvent} />)}</div></li>;
    })}
  </ol>;
}

function AgendaCalendar(props: CalendarViewsProps & { singleDay: boolean }) {
  const range = rangeForCalendarView(props.singleDay ? "day" : "agenda", props.anchor, props.viewerTimeZone);
  const grouped = groupCalendarEvents(props.events, range);
  const days = props.singleDay
    ? [range.startDate]
    : [...grouped.keys()].filter((day) => day >= range.startDate && day < range.endDateExclusive).sort();
  if (!days.length || (props.singleDay && !(grouped.get(days[0])?.length))) {
    return <div className="calendar-agenda calendar-agenda--empty">
      <CalendarClock size={22} />
      <h2>{props.coverageComplete === false ? "No events available from responding calendars" : props.singleDay ? "Nothing scheduled this day" : "Nothing scheduled in this range"}</h2>
      <p>{props.coverageComplete === false ? "Calendar coverage is incomplete. Review the unavailable source or retry before treating this range as clear." : "All selected calendars were read successfully; new events will appear here in time order."}</p>
      <Button tone="primary" onClick={(event) => props.onCreate({ day: props.anchor }, event.currentTarget)}>Create an event</Button>
    </div>;
  }
  return <ol className="calendar-agenda" aria-label={props.singleDay ? fullDayLabel(props.anchor) : `Upcoming calendar events, ${weekLabel(range.startDate, range.endDateExclusive)}`}>
    {days.map((day) => {
      const events = grouped.get(day) ?? [];
      if (!events.length) return null;
      const current = day === props.today;
      return <li className={`calendar-agenda__day${current ? " is-today" : ""}`} key={day}>
        <header>
          <div><h2>{current ? "Today" : fullDayLabel(day, false)}</h2>{current && <span>{fullDayLabel(day, false)}</span>}</div>
          <span>{events.length} {events.length === 1 ? "event" : "events"}</span>
        </header>
        <div className="calendar-agenda__events">
          {events.map((event) => <EventEntry key={eventKey(event, day)} event={event} day={day} sources={props.sources} agenda onSelect={props.onSelectEvent} />)}
        </div>
      </li>;
    })}
  </ol>;
}

function EventEntry({ event, day, sources, compact = false, month = false, agenda = false, onSelect }: {
  event: CalendarEvent;
  day: string;
  sources: readonly CalendarSource[];
  compact?: boolean;
  month?: boolean;
  agenda?: boolean;
  onSelect: (event: CalendarEvent, trigger: HTMLElement) => void;
}) {
  const source = sources.find((candidate) => candidate.calendarId === event.calendarId);
  const authority = event.authority === "kora" ? "Stored in Kora" : event.syncState === "stale" ? "Last-confirmed copy" : "Google event";
  const span = eventSpanLabel(event, day);
  const fullTime = !event.allDay && day !== eventStartDay(event) ? `Continues · ends ${calendarEventEndTime(event)}` : calendarEventTime(event);
  const time = month && !event.allDay && event.start.kind === "dateTime" ? monthStartTime(fullTime) : fullTime;
  const label = eventAccessibleLabel(event, day, source?.name ?? "Calendar", authority);
  const style = { "--calendar-entry-color": source?.color ?? "var(--signal)" } as CSSProperties;
  return <Pressable
    className={`calendar-entry${compact ? " calendar-entry--compact" : ""}${agenda ? " calendar-entry--agenda" : ""}${span ? ` calendar-entry--span-${span.toLowerCase()}` : ""}${event.syncState === "stale" ? " is-stale" : ""}`}
    style={style}
    data-calendar-id={event.calendarId}
    data-event-id={event.eventId}
    aria-label={label}
    onClick={(click) => onSelect(event, click.currentTarget)}
  >
    {agenda && <span className="calendar-entry__time">{time}</span>}
    <span className="calendar-entry__marker" aria-hidden="true" />
    <span className="calendar-entry__body">
      <strong>{event.title}</strong>
      {!agenda && !event.allDay && event.start.kind !== "date" && <small className="calendar-entry__time-text">{time}</small>}
      {span && <small className="calendar-entry__span">{span}</small>}
      {!compact && (event.location || agenda) && <span>{[event.location, source?.name, authority].filter(Boolean).join(" · ")}</span>}
    </span>
    {event.location && !compact && !agenda && <MapPin className="calendar-entry__icon" size={13} aria-hidden="true" />}
    {event.syncState === "stale" && <CloudOff className="calendar-entry__icon" size={13} aria-hidden="true" />}
    <span className="sr-only">{day}</span>
  </Pressable>;
}

function monthStartTime(time: string) {
  const start = time.split("–", 1)[0] ?? time;
  return start.replace(/:00(?=\s|$)/, "");
}

function eventSpanLabel(event: CalendarEvent, day: string) {
  if (!event.allDay && event.start.kind !== "date") return undefined;
  const startDay = event.start.kind === "date" ? event.start.date : eventStartDay(event);
  const endExclusive = event.end.kind === "date"
    ? event.end.date
    : event.end.kind === "dateTime"
      ? Temporal.Instant.from(event.end.instant).toZonedDateTimeISO(event.viewerTimeZone).toPlainDate().toString()
      : startDay;
  const endDay = Temporal.PlainDate.from(endExclusive).subtract({ days: 1 }).toString();
  if (startDay === endDay) return undefined;
  if (day === startDay) return "Starts";
  if (day === endDay) return "Ends";
  return "Continues";
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayAgendaDescription(props: CalendarViewsProps) {
  const events = groupCalendarEvents(props.events, { startDate: props.anchor, endDateExclusive: Temporal.PlainDate.from(props.anchor).add({ days: 1 }).toString() }).get(props.anchor) ?? [];
  if (!events.length) return props.coverageComplete === false
    ? `Day agenda for ${fullDayLabel(props.anchor)}. Calendar coverage is incomplete; no clear-time claim is available.`
    : `Day agenda for ${fullDayLabel(props.anchor)}. No events.`;
  const summaries = events.map((event) => {
    const source = props.sources.find((candidate) => candidate.calendarId === event.calendarId);
    const authority = event.authority === "kora" ? "Stored in Kora" : event.syncState === "stale" ? "Last-confirmed copy" : "Google event";
    return eventAccessibleLabel(event, props.anchor, source?.name ?? "Calendar", authority);
  });
  return `Day agenda for ${fullDayLabel(props.anchor)}. ${events.length} ${events.length === 1 ? "event" : "events"}. ${summaries.join(". ")}.`;
}

function eventAccessibleLabel(event: CalendarEvent, day: string, source: string, authority: string) {
  const interval = isCrossMidnightTimedEvent(event) ? `full interval ${fullTimedEventInterval(event)}` : formatEventRange(event);
  return [event.title, interval, eventSpanLabel(event, day), timedEventContinuation(event, day), event.location, source, authority].filter(Boolean).join(", ");
}

function timedEventAccessibleLabel(event: CalendarEvent, day: string, startInstant: string, endInstant: string, viewerTimeZone: string, source: string, authority: string) {
  const interval = isCrossMidnightTimedEvent(event)
    ? `full interval ${fullTimedEventInterval(event)}`
    : `${clippedTimedRange(startInstant, endInstant, day, viewerTimeZone).accessibleStart} to ${clippedTimedRange(startInstant, endInstant, day, viewerTimeZone).accessibleEnd}`;
  return [event.title, interval, timedEventContinuation(event, day), source, authority, event.location].filter(Boolean).join(", ");
}

function isCrossMidnightTimedEvent(event: CalendarEvent) {
  if (event.start.kind !== "dateTime" || event.end.kind !== "dateTime") return false;
  return eventStartDay(event) !== Temporal.Instant.from(event.end.instant).subtract({ nanoseconds: 1 }).toZonedDateTimeISO(event.viewerTimeZone).toPlainDate().toString();
}

function fullTimedEventInterval(event: CalendarEvent) {
  if (event.start.kind !== "dateTime" || event.end.kind !== "dateTime") return formatEventRange(event);
  return `${fullTimedValue(event.start.instant, event.viewerTimeZone)} to ${fullTimedValue(event.end.instant, event.viewerTimeZone)}`;
}

function timedEventContinuation(event: CalendarEvent, day: string) {
  if (event.start.kind !== "dateTime" || event.end.kind !== "dateTime") return undefined;
  const startDay = eventStartDay(event);
  const endDay = Temporal.Instant.from(event.end.instant).subtract({ nanoseconds: 1 }).toZonedDateTimeISO(event.viewerTimeZone).toPlainDate().toString();
  const parts = [
    startDay < day ? `continues from ${fullTimedValue(event.start.instant, event.viewerTimeZone)}` : undefined,
    endDay > day ? `continues into ${fullTimedValue(event.end.instant, event.viewerTimeZone)}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" and ") : undefined;
}

function fullTimedValue(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short",
  }).format(new Date(instant));
}

function datesBetween(start: string, endExclusive: string) {
  const result: string[] = [];
  for (let day = Temporal.PlainDate.from(start), end = Temporal.PlainDate.from(endExclusive); Temporal.PlainDate.compare(day, end) < 0; day = day.add({ days: 1 })) result.push(day.toString());
  return result;
}

function eventKey(event: CalendarEvent, day: string) { return `${event.calendarId}:${event.eventId}:${event.revision ?? "current"}:${day}`; }
function fullDayLabel(day: string, includeYear = true) { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC", ...(includeYear ? { year: "numeric" as const } : {}) }).format(dateAtNoon(day)); }
function shortWeekday(day: string) { return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(dateAtNoon(day)); }
function monthLabel(day: string) { return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(dateAtNoon(day)); }
function weekLabel(start: string, endExclusive: string) { return `${fullDayLabel(start)} through ${fullDayLabel(Temporal.PlainDate.from(endExclusive).subtract({ days: 1 }).toString())}`; }

function hourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  return `${normalized % 12 || 12} ${normalized < 12 ? "AM" : "PM"}`;
}

function dateRangeForDays(days: readonly string[]) {
  const startDate = days[0] ?? "1970-01-01";
  const endDateExclusive = days.length
    ? Temporal.PlainDate.from(days[days.length - 1]).add({ days: 1 }).toString()
    : startDate;
  return { startDate, endDateExclusive };
}

type ClippedClock = {
  hourMinute: string;
  period: string;
  zoneName?: string;
  midnight: boolean;
  accessible: string;
  compact: string;
};

function clippedTimedRange(startInstant: string, endInstant: string, day: string, viewerTimeZone: string) {
  const start = clippedClock(startInstant, day, viewerTimeZone);
  const end = clippedClock(endInstant, day, viewerTimeZone);
  const visual = start.midnight
    ? `${start.accessible}–${end.accessible}`
    : end.midnight
      ? `${start.compact} ${start.period}${start.zoneName ? ` ${start.zoneName}` : ""}–${end.accessible}`
      : start.period === end.period && start.zoneName === end.zoneName
        ? `${start.compact}–${end.compact} ${start.period}${start.zoneName ? ` ${start.zoneName}` : ""}`
        : `${start.compact} ${start.period}${start.zoneName ? ` ${start.zoneName}` : ""}–${end.compact} ${end.period}${end.zoneName ? ` ${end.zoneName}` : ""}`;
  return { visual, accessibleStart: start.accessible, accessibleEnd: end.accessible };
}

function clippedClock(instant: string, day: string, viewerTimeZone: string): ClippedClock {
  const zoned = Temporal.Instant.from(instant).toZonedDateTimeISO(viewerTimeZone);
  const displayDate = new Date(Math.round(new Date(instant).getTime() / 60_000) * 60_000);
  const midnight = Temporal.PlainDate.compare(zoned.toPlainDate(), Temporal.PlainDate.from(day)) > 0 && zoned.hour === 0 && zoned.minute === 0;
  if (midnight) return { hourMinute: "midnight", period: "", midnight: true, accessible: "midnight", compact: "midnight" };
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: viewerTimeZone });
  const parts = formatter.formatToParts(displayDate);
  const hour = parts.find((part) => part.type === "hour")?.value ?? String(zoned.hour % 12 || 12);
  const minute = parts.find((part) => part.type === "minute")?.value ?? String(zoned.minute).padStart(2, "0");
  const period = parts.find((part) => part.type === "dayPeriod")?.value ?? (zoned.hour < 12 ? "AM" : "PM");
  const hourMinute = `${hour}:${minute}`;
  const ambiguous = calendarDayScale(day, viewerTimeZone).slots.filter((slot) => Temporal.Instant.from(slot.instant).toZonedDateTimeISO(viewerTimeZone).hour === zoned.hour).length > 1;
  const zoneName = ambiguous ? new Intl.DateTimeFormat(undefined, { timeZone: viewerTimeZone, timeZoneName: "short" }).formatToParts(displayDate).find((part) => part.type === "timeZoneName")?.value : undefined;
  const zoneSuffix = zoneName ? ` ${zoneName}` : "";
  return { hourMinute, period, ...(zoneName ? { zoneName } : {}), midnight: false, accessible: `${hourMinute} ${period}${zoneSuffix}`, compact: minute === "00" ? hour : hourMinute };
}

function timedSegment(event: CalendarEvent, scale: ReturnType<typeof calendarDayScale>) {
  if (event.start.kind !== "dateTime" || event.end.kind !== "dateTime") return undefined;
  const dayStart = Temporal.Instant.from(scale.startInstant);
  const dayEnd = Temporal.Instant.from(scale.endInstant);
  const eventStart = Temporal.Instant.from(event.start.instant);
  const eventEnd = Temporal.Instant.from(event.end.instant);
  if (Temporal.Instant.compare(eventEnd, dayStart) <= 0 || Temporal.Instant.compare(eventStart, dayEnd) >= 0) return undefined;
  const clippedStart = Temporal.Instant.compare(eventStart, dayStart) < 0 ? dayStart : eventStart;
  const clippedEnd = Temporal.Instant.compare(eventEnd, dayEnd) > 0 ? dayEnd : eventEnd;
  const startMinute = clippedStart.since(dayStart).total({ unit: "minute" });
  const endMinute = clippedEnd.since(dayStart).total({ unit: "minute" });
  return { startMinute, endMinute: Math.max(startMinute + 15, endMinute), startInstant: clippedStart.toString(), endInstant: clippedEnd.toString() };
}

function layoutTimedEvents(events: CalendarEvent[], scale: ReturnType<typeof calendarDayScale>, renderScaleMinutes = scale.totalMinutes, maximumLanes = Number.POSITIVE_INFINITY): TimedLayout[] {
  const segments = events.flatMap((event) => {
    const segment = timedSegment(event, scale);
    return segment ? [{ event, ...segment }] : [];
  }).sort((left, right) => left.startMinute - right.startMinute || right.endMinute - left.endMinute);
  const result: TimedLayout[] = [];
  for (let index = 0; index < segments.length;) {
    const cluster = [segments[index]];
    let clusterEnd = segments[index].endMinute;
    index += 1;
    while (index < segments.length && segments[index].startMinute < clusterEnd) {
      cluster.push(segments[index]);
      clusterEnd = Math.max(clusterEnd, segments[index].endMinute);
      index += 1;
    }
    const laneEnds: number[] = [];
    const assigned = cluster.map((segment) => {
      let lane = laneEnds.findIndex((end) => end <= segment.startMinute);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.endMinute;
      return { ...segment, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    if (laneCount <= maximumLanes) {
      result.push(...assigned.map((entry) => ({ ...entry, laneCount, scaleMinutes: renderScaleMinutes })));
      continue;
    }
    if (maximumLanes === 1) {
      const visible = assigned[0];
      const hidden = assigned.slice(1);
      result.push({
        event: visible.event,
        startMinute: Math.min(...assigned.map((entry) => entry.startMinute)),
        endMinute: Math.max(...assigned.map((entry) => entry.endMinute)),
        startInstant: assigned.reduce((earliest, entry) => Temporal.Instant.compare(Temporal.Instant.from(entry.startInstant), Temporal.Instant.from(earliest.startInstant)) < 0 ? entry : earliest).startInstant,
        endInstant: assigned.reduce((latest, entry) => Temporal.Instant.compare(Temporal.Instant.from(entry.endInstant), Temporal.Instant.from(latest.endInstant)) > 0 ? entry : latest).endInstant,
        lane: 0,
        laneCount: 1,
        scaleMinutes: renderScaleMinutes,
        overflowCount: hidden.length,
        hiddenEvents: assigned.map((entry) => entry.event),
      });
      continue;
    }
    const visibleLaneCount = Math.max(2, maximumLanes);
    const visible = assigned.filter((entry) => entry.lane < visibleLaneCount - 1);
    const hidden = assigned.filter((entry) => entry.lane >= visibleLaneCount - 1);
    result.push(...visible.map((entry) => ({ ...entry, laneCount: visibleLaneCount, scaleMinutes: renderScaleMinutes })));
    result.push({
      event: hidden[0].event,
      startMinute: Math.min(...hidden.map((entry) => entry.startMinute)),
      endMinute: Math.max(...hidden.map((entry) => entry.endMinute)),
      startInstant: hidden.reduce((earliest, entry) => Temporal.Instant.compare(Temporal.Instant.from(entry.startInstant), Temporal.Instant.from(earliest.startInstant)) < 0 ? entry : earliest).startInstant,
      endInstant: hidden.reduce((latest, entry) => Temporal.Instant.compare(Temporal.Instant.from(entry.endInstant), Temporal.Instant.from(latest.endInstant)) > 0 ? entry : latest).endInstant,
      lane: visibleLaneCount - 1,
      laneCount: visibleLaneCount,
      scaleMinutes: renderScaleMinutes,
      overflowCount: hidden.length,
      hiddenEvents: hidden.map((entry) => entry.event),
    });
  }
  return result;
}
