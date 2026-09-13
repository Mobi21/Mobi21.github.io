import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./toast-specimen.css";
import { Bell, MessageCircleMore, Search } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { KoraMark } from "../components/KoraMark";
import { IconButton, PageFrame, PageHeader, PageSection, Pressable, ToastProvider, useToast } from "../components/primitives";

type Fixture = "empty" | "neutral" | "success" | "warning" | "danger" | "action" | "long" | "stacked" | "limited" | "updated";

const labels: Record<Fixture, string> = {
  empty: "Empty",
  neutral: "Neutral",
  success: "Success",
  warning: "Warning",
  danger: "Urgent",
  action: "Action",
  long: "Long copy",
  stacked: "Stacked",
  limited: "Over limit",
  updated: "Updated in place",
};

function FixtureEmitter({ fixture, onStatus }: { fixture: Fixture; onStatus: (status: string) => void }) {
  const toast = useToast();
  useEffect(() => {
    if (fixture === "empty") return;
    if (fixture === "neutral") toast.notify({ title: "Draft saved", description: "Changes remain on this device.", timeout: 0 });
    if (fixture === "success") toast.notify({ title: "Calendar refreshed", description: "Three sources are current.", tone: "success", timeout: 0 });
    if (fixture === "warning") toast.notify({ title: "Some values may be out of date", description: "Last confirmed Aug 19.", tone: "warning", timeout: 0 });
    if (fixture === "danger") toast.notify({ title: "Connection failed", description: "Last-confirmed data is still intact.", tone: "danger", timeout: 0 });
    if (fixture === "action") toast.notify({ title: "Page archived", description: "Restore it now or find it in Archive later.", action: { label: "Undo", onSelect: () => onStatus("Page restored") } });
    if (fixture === "long") toast.notify({ title: "Kora could not finish refreshing all connected calendar sources", description: "Your local events and previously confirmed provider data remain available. Review the connection when you are ready.", tone: "warning", timeout: 0 });
    if (fixture === "stacked") {
      toast.notify({ title: "Page archived", description: "Restore it now or find it in Archive later.", action: { label: "Undo", onSelect: () => onStatus("Page restored") }, timeout: 0 });
      toast.notify({ title: "Calendar refreshed", description: "Three sources are current.", tone: "success", timeout: 0 });
      toast.notify({ title: "One source needs attention", description: "Last confirmed Aug 19.", tone: "warning", timeout: 0 });
    }
    if (fixture === "limited") {
      for (let index = 1; index <= 5; index += 1) toast.notify({ title: `Notification ${index}`, description: `Synthetic bounded-stack item ${index}.`, timeout: 0 });
    }
    if (fixture === "updated") {
      toast.notify({ id: "calendar-refresh", title: "Refreshing calendar", description: "Checking connected sources.", timeout: 0 });
      const timer = window.setTimeout(() => toast.update("calendar-refresh", { title: "Calendar refreshed", description: "Three sources are current.", tone: "success", timeout: 0 }), 80);
      return () => window.clearTimeout(timer);
    }
  }, [fixture]);
  return null;
}

function ToastSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "neutral");
  const [status, setStatus] = useState("Notifications appear without moving page content or stealing focus.");
  return <ToastProvider key={fixture} timeout={0} limit={3}>
    <FixtureEmitter fixture={fixture} onStatus={setStatus} />
    <div className="toast-specimen app-shell" data-workspace="global">
      <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="toast-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
      <main className="toast-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Toast feedback role" description="Brief, truthful feedback is announced without interrupting work; decisions and durable history stay on their owning surfaces." /><PageSection title="Required deterministic states" description="Inspect tone, urgency, actions, long wrapping, stacking limits, in-place updates, dismissal, focus entry, and compact fit.">
        <div className="toast-specimen__fixtures" role="group" aria-label="Toast fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => { setStatus("Notifications appear without moving page content or stealing focus."); setFixture(key); }} key={key}>{labels[key]}</Pressable>)}</div>
        <div className="toast-specimen__stage"><p>Continue reading and working here while feedback stays anchored to the window edge.</p><p role="status">{status}</p><p className="toast-specimen__hint">Press F6 to enter visible notifications. Escape dismisses the focused item; Shift+Tab returns to the exact origin.</p></div>
      </PageSection></PageFrame></main>
    </div>
  </ToastProvider>;
}

createRoot(document.getElementById("root")!).render(<ToastSpecimen />);
