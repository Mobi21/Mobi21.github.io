import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../features/calendar/calendar.css";
import "./calendar-sources-specimen.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import type { CalendarSource } from "../lib/runtime";
import { CalendarToolbar } from "../features/calendar/CalendarToolbar";

const states: Array<Pick<CalendarSource, "authority" | "status" | "syncState" | "writable" | "accessRole">> = [
  { authority: "kora", status: "available", syncState: "local", writable: true, accessRole: "owner" },
  { authority: "google", status: "available", syncState: "synced", writable: true, accessRole: "owner" },
  { authority: "google", status: "degraded", syncState: "stale", writable: false, accessRole: "reader" },
  { authority: "google", status: "available", syncState: "synced", writable: false, accessRole: "reader" },
  { authority: "google", status: "unavailable", syncState: "unavailable", writable: false, accessRole: "none" },
];

const sources: CalendarSource[] = Array.from({ length: 20 }, (_, index) => {
  const state = states[index % states.length];
  return {
    calendarId: index === 0 ? "kora:personal" : `google:calendar-${index}`,
    name: index === 0 ? "My private Kora calendar" : index === 19 ? "A deliberately long shared calendar name that must remain bounded" : `Calendar source ${index + 1}`,
    providerId: state.authority === "kora" ? "kora" : "google-workspace",
    primary: index < 2,
    selected: index < 12,
    color: ["#fc815c", "#7f8cff", "#66c2a5", "#d7a8ff", "#63b3ed"][index % 5],
    ...state,
  };
});

function Specimen() {
  const [selected, setSelected] = useState(sources.filter((source) => source.selected).map((source) => source.calendarId));
  return <MemoryRouter initialEntries={["/calendar?view=week&date=2026-08-19"]}>
    <main className="calendar-sources-specimen" id="main-content">
      <div className="calendar-sources-specimen__context">
        <h1>Calendar source qualification</h1>
        <span>20 deterministic sources · mixed authority and health</span>
      </div>
      <CalendarToolbar
        title="Aug 16 – Aug 22, 2026"
        view="week"
        viewerTimeZone="America/New_York"
        sources={sources}
        selected={selected}
        onSelectedChange={setSelected}
        onViewChange={() => undefined}
        onPrevious={() => undefined}
        onNext={() => undefined}
        onToday={() => undefined}
        onCreate={() => undefined}
        onAskRange={() => undefined}
      />
      <section className="calendar-sources-specimen__canvas" aria-label="Calendar canvas placeholder">
        <span>{selected.length} calendars visible</span>
      </section>
    </main>
  </MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
