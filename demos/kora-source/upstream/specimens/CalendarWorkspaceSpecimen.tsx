import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../features/calendar/calendar.css";
import "./calendar-workspace-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConnectionContext } from "../app/connection-context";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect, ToastProvider } from "../components/primitives";
import { CalendarWorkspace } from "../features/calendar/CalendarWorkspace";
import { calendarWorkspaceFixtures, createCalendarWorkspaceFixture, type CalendarWorkspaceFixture } from "./calendar-workspace-fixtures";

const requested = new URLSearchParams(window.location.search).get("fixture") as CalendarWorkspaceFixture | null;
const fixture = requested && calendarWorkspaceFixtures.includes(requested) ? requested : "connected-populated";
const definition = createCalendarWorkspaceFixture(fixture);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function Specimen() {
  return <main className="calendar-workspace-specimen" id="main-content">
    <header className="calendar-workspace-specimen__controls">
      <div><strong>Calendar connected qualification</strong><span>Real workspace · deterministic synthetic services · no provider or product mutation</span></div>
      <KoraSelect label="Calendar fixture" value={fixture} options={calendarWorkspaceFixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} />
    </header>
    <ConnectionContext.Provider value={{ phase: definition.connectionPhase, bootstrap: { viewerTimeZone: "America/New_York", session: { id: "synthetic-calendar-session" } } as never, retry: async () => undefined, restart: async () => ({ status: "settled", runtimeId: "specimen-runtime", startedAt: "2026-08-19T12:00:00Z" }), refresh: async () => undefined }}>
      <QueryClientProvider client={queryClient}><ToastProvider timeout={0}><MemoryRouter initialEntries={[definition.initialEntry]}><ViewBarProvider><ViewBar /><Routes>
        <Route path="/calendar" element={<CalendarWorkspace services={definition.services} serviceScope={`specimen:${fixture}`} qualificationInitialPanel={definition.initialPanel} qualificationRefetchAfterLoad={definition.refetchAfterLoad} onAskKora={() => undefined} />} />
        <Route path="/calendar/event/:calendarId/:eventId" element={<CalendarWorkspace services={definition.services} serviceScope={`specimen:${fixture}`} qualificationInitialPanel={definition.initialPanel} qualificationRefetchAfterLoad={definition.refetchAfterLoad} onAskKora={() => undefined} />} />
        <Route path="*" element={<p className="calendar-workspace-specimen__route">Synthetic destination reached. Use Back to return to Calendar.</p>} />
      </Routes></ViewBarProvider></MemoryRouter></ToastProvider></QueryClientProvider>
    </ConnectionContext.Provider>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
