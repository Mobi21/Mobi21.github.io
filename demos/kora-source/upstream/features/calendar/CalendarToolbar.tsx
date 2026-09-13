import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Globe2, MessageCircleMore, MoreHorizontal, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import type { CalendarSource } from "../../lib/runtime";
import { Button, IconButton, PageHeader, PageToolbar } from "../../components/primitives";
import { Menu, Popover } from "../../components/overlays";
import { CheckboxChoice, Input, SegmentedControl } from "../../components/form";
import type { CalendarView } from "./calendar-routing";

export function CalendarToolbar({ title, view, viewerTimeZone, sources, selected, onSelectedChange, onViewChange, onPrevious, onNext, onToday, onCreate, onAskRange, date, onDateChange, showToday = true }: {
  title: string; view: CalendarView; viewerTimeZone: string; sources: CalendarSource[]; selected: string[]; onSelectedChange: (ids: string[]) => void;
  onViewChange: (view: CalendarView) => void; onPrevious: () => void; onNext: () => void; onToday: () => void; onCreate: (trigger: HTMLElement) => void; onAskRange: () => void; showToday?: boolean;
  date?: string; onDateChange?: (date: string) => void;
}) {
  const rangeUnit = view === "month" ? "month" : view === "week" ? "week" : view === "day" ? "day" : "agenda range";
  const showTimeZone = Boolean(viewerTimeZone);
  const [dateInput, setDateInput] = useState(date ?? "");
  useEffect(() => setDateInput(date ?? ""), [date]);

  const dateNavigation = <div className="calendar-nav" role="group" aria-label="Date navigation"><IconButton label={`Previous ${rangeUnit}`} onClick={onPrevious}><ChevronLeft size={18} /></IconButton><IconButton label={`Next ${rangeUnit}`} onClick={onNext}><ChevronRight size={18} /></IconButton>{showToday ? <Button onClick={onToday}>Today</Button> : null}</div>;
  const compactDateNavigation = <div className="calendar-nav" role="group" aria-label="Date navigation"><IconButton label={`Previous ${rangeUnit}`} onClick={onPrevious}><ChevronLeft size={18} /></IconButton><IconButton label={`Next ${rangeUnit}`} onClick={onNext}><ChevronRight size={18} /></IconButton>{showToday ? <Button onClick={onToday}>Today</Button> : null}</div>;
  const compactView = <Menu
    className="calendar-view-menu__popup"
    align="center"
    trigger={<Button className="calendar-view-menu" aria-label={`Calendar view, ${view}`}><span>{view[0].toUpperCase() + view.slice(1)}</span><ChevronDown size={14} /></Button>}
    actions={(["day", "week", "month", "agenda"] as CalendarView[]).map((item) => ({ id: item, label: item[0].toUpperCase() + item.slice(1), selected: item === view, onSelect: () => onViewChange(item) }))}
  />;
  const compactSources = <Popover purpose="selection" title="Visible calendars" description="Combine your private Kora calendar with connected calendars." align="end" sideOffset={8} className="calendar-source-popover" trigger={<Button className="calendar-source-trigger calendar-source-trigger--compact" aria-label={`Visible calendars, ${selected.length} selected`}><CalendarRange size={16} /><span className="calendar-source-trigger__label">Calendars</span><span className="calendar-source-trigger__count">{selected.length}</span><ChevronDown size={14} /></Button>}>
    <SourceOptions sources={sources} selected={selected} onSelectedChange={onSelectedChange} />
  </Popover>;
  const compactOverflow = <Popover purpose="selection" title="Calendar options" description="Sources, time zone, and contextual help." align="end" sideOffset={8} collisionPadding={8} className="calendar-source-popover calendar-overflow-popover" trigger={<IconButton className="calendar-overflow-trigger" label="More Calendar options"><MoreHorizontal size={18} /></IconButton>}>
    <SourceOptions sources={sources} selected={selected} onSelectedChange={onSelectedChange} />
    <div className="calendar-overflow-actions">{showTimeZone ? <Link to="/brain/profile/timezone"><Globe2 size={15} /><span>Time zone</span><small>{viewerTimeZone.replaceAll("_", " ")}</small></Link> : null}<Button tone="ghost" onClick={onAskRange}><MessageCircleMore size={15} /><span>Ask Kora about this range</span></Button></div>
  </Popover>;
  const contextualActions = <Popover purpose="selection" title="Calendar options" description="Time zone and contextual help for this range." align="end" sideOffset={8} collisionPadding={8} className="calendar-source-popover calendar-overflow-popover" trigger={<IconButton className="calendar-overflow-trigger calendar-context-trigger" label="Calendar range options"><MoreHorizontal size={18} /></IconButton>}>
    <div className="calendar-overflow-actions">{showTimeZone ? <Link to="/brain/profile/timezone"><Globe2 size={15} /><span>Time zone</span><small>{viewerTimeZone.replaceAll("_", " ")}</small></Link> : null}<Button tone="ghost" onClick={onAskRange}><MessageCircleMore size={15} /><span>Ask Kora about this range</span></Button></div>
  </Popover>;

  return <><PageHeader className="calendar-page-header" breadcrumb={<span>Calendar</span>} title={title}
    status={<span className="calendar-viewer-zone"><Globe2 size={14} aria-hidden="true" />{viewerTimeZone.replaceAll("_", " ")}</span>}
    actions={onDateChange ? <form className="calendar-date-jump" onSubmit={(event) => {
      event.preventDefault();
      if (dateInput && event.currentTarget.checkValidity()) onDateChange(dateInput);
    }}><label><span>Go to date</span><Input aria-label="Go to date" type="date" required value={dateInput} onChange={(event) => setDateInput(event.target.value)} /></label><Button type="submit" tone="secondary">Go</Button></form> : undefined}
  /><PageToolbar
    aria-label="Calendar controls"
    className="calendar-toolbar"
    density="compact"
    controls={<>
      {dateNavigation}
      <div className="calendar-view-switcher">
        <SegmentedControl layoutId="calendar-workspace-view" label="Calendar view" value={view} onValueChange={(next) => onViewChange(next as CalendarView)} options={(["day", "week", "month", "agenda"] as CalendarView[]).map((item) => ({ value: item, label: item[0].toUpperCase() + item.slice(1) }))} />
      </div>
      <Popover purpose="selection" title="Visible calendars" description="Combine your private Kora calendar with connected calendars." align="end" sideOffset={8} className="calendar-source-popover" trigger={<Button className="calendar-source-trigger" aria-label={`Calendars, ${selected.length} visible`}><CalendarRange size={16} /><span className="calendar-source-trigger__label">Calendars</span><span className="calendar-source-trigger__count">{selected.length}</span><ChevronDown size={14} /></Button>}>
        <SourceOptions sources={sources} selected={selected} onSelectedChange={onSelectedChange} />
      </Popover>
      {contextualActions}
    </>}
    compactControls={<>{compactDateNavigation}{compactView}{compactSources}{compactOverflow}</>}
    primaryAction={<Button tone="primary" onClick={(event) => onCreate(event.currentTarget)}><Plus size={17} />New event</Button>}
  /></>;
}

export function calendarSourceHealth(source: CalendarSource) {
  if (source.authority === "kora") return source.status === "unavailable" ? "Kora · unavailable" : "Stored privately in Kora · current";
  if (source.status === "unavailable" || source.syncState === "unavailable") return "Google · unavailable";
  if (source.syncState === "stale") return "Google · last-confirmed copy";
  if (!source.writable) return `Google · read-only (${source.accessRole})`;
  if (source.status === "degraded") return "Google · connection degraded";
  return `Google · current${source.primary ? " primary" : ""}`;
}

function SourceOptions({ sources, selected, onSelectedChange }: { sources: CalendarSource[]; selected: string[]; onSelectedChange: (ids: string[]) => void }) {
  return <div className="calendar-source-list">{sources.map((source) => {
    const active = selected.includes(source.calendarId);
    const health = calendarSourceHealth(source);
    return <CheckboxChoice key={source.calendarId} checked={active} onCheckedChange={() => onSelectedChange(active ? selected.filter((id) => id !== source.calendarId) : [...selected, source.calendarId])} title={<span className="calendar-source-option__title"><span className="calendar-source-color" style={{ background: source.color ?? "var(--signal)" }} /><strong>{source.name}</strong></span>} hint={health} />;
  })}</div>;
}
