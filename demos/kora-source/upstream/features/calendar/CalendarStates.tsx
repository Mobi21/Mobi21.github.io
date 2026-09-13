import { CalendarOff, CircleAlert, PlugZap, RefreshCw } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Button, KoraPresenceMark } from "../../components/primitives";
import type { CalendarView } from "./calendar-routing";

export function CalendarLoading({ view = "week" }: { view?: CalendarView }) {
  if (view === "agenda") return <div className="calendar-state calendar-state--loading calendar-loading-agenda" aria-busy="true"><KoraPresenceMark state="gathering" label="Loading Calendar agenda" /><div aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div></div>;
  const columns = view === "day" ? 1 : 7;
  const rows = view === "month" ? 6 : 8;
  return <div className={`calendar-state calendar-state--loading calendar-state--loading-${view}`} aria-busy="true"><KoraPresenceMark state="gathering" label={`Loading Calendar ${view}`} /><div className="calendar-loading-grid" style={{ "--calendar-loading-columns": String(columns), "--calendar-loading-rows": String(rows) } as CSSProperties} aria-hidden="true"><div className="calendar-loading-grid__head">{view !== "month" ? <span /> : null}{Array.from({ length: columns }, (_, index) => <span key={index} />)}</div><div className="calendar-loading-grid__body">{view !== "month" ? <div className="calendar-loading-grid__axis">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div> : null}{Array.from({ length: columns }, (_, day) => <div className="calendar-loading-grid__day" key={day}>{Array.from({ length: rows }, (_, row) => <span key={row} />)}</div>)}</div></div></div>;
}
export function CalendarState({ kind, title, body, onRetry, onConnect, recovery }: { kind: "empty" | "unavailable"; title: string; body: string; onRetry?: () => void; onConnect?: () => void; recovery?: { href: string; label: string } }) {
  const Icon = kind === "empty" ? CalendarOff : CircleAlert;
  return <div className={`calendar-state calendar-state--${kind}`}><Icon size={24} /><h2>{title}</h2><p>{body}</p><div className="calendar-state__actions">{onConnect && <Button onClick={onConnect}><PlugZap size={15} />Connect Google</Button>}{recovery ? <Link className="button button--secondary" to={recovery.href}>{recovery.label}</Link> : null}{onRetry && <Button tone={onConnect || recovery ? "secondary" : undefined} onClick={onRetry}><RefreshCw size={15} />Try again</Button>}</div></div>;
}
