import "@fontsource-variable/mona-sans";
import { Bell, BriefcaseBusiness, CalendarDays, ChevronRight, MessageCircleMore, Plus, Search } from "lucide-react";
import { KoraMark } from "../components/KoraMark";
import { Button, IconButton, Pressable } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./page-section-specimen.css";

const milestones = [
  { title: "Choose the two coastal stops", detail: "Compare travel time with the quiet mornings you want.", date: "Sep 2", state: "Next" },
  { title: "Reserve refundable lodging", detail: "Keep both options flexible until the rail schedule is confirmed.", date: "Sep 6", state: "Planned" },
  { title: "Share the final itinerary", detail: "Send one clear plan after the bookings are settled.", date: "Sep 12", state: "Later" },
];

function PageSectionSpecimen() {
  return <div className="section-specimen app-shell" data-workspace="work">
    <header className="window-bar">
      <div className="window-bar__brand"><KoraMark width={16} height={16} /><div className="section-specimen__location"><BriefcaseBusiness size={16} /><strong>Work</strong></div></div>
      <div className="section-specimen__drag" />
      <div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div>
    </header>
    <main className="section-specimen__main" id="main-content">
      <PageFrame width="standard">
        <PageHeader
          breadcrumb={<nav aria-label="Breadcrumb"><a href="#work">Goals</a><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">Coastal trip</span></nav>}
          title="Plan the September coastal trip"
          description="A restorative four-day break with enough structure to feel prepared and enough space to actually rest."
          status={<span>In progress · updated today</span>}
        />
        <div className="section-specimen__stack">
          <PageSection
            title="What moves this forward"
            description="Milestones hold the meaningful decisions. Small tasks stay inside each milestone instead of competing for attention here."
            actions={<Button tone="primary"><Plus size={16} />Add milestone</Button>}
          >
            <div className="section-specimen__milestones">
              {milestones.map((milestone) => <Pressable key={milestone.title}>
                <span className="section-specimen__state">{milestone.state}</span>
                <span><strong>{milestone.title}</strong><small>{milestone.detail}</small></span>
                <time><CalendarDays size={14} />{milestone.date}</time>
                <ChevronRight size={16} aria-hidden="true" />
              </Pressable>)}
            </div>
          </PageSection>
          <PageSection title="Context worth keeping" description="Background that helps future decisions without turning the page into a stream of notes.">
            <div className="section-specimen__context"><p><strong>Rest is the constraint.</strong> Prefer two long stays over changing towns every night. The trip succeeds if the schedule remains calm.</p><Button>Open trip note</Button></div>
          </PageSection>
          <PageSection title="A smaller nested group" headingLevel={3}>
            <p className="section-specimen__plain-copy">This minimal form proves that a section does not invent a card, divider, empty action rail, or explanatory column when none is needed.</p>
          </PageSection>
        </div>
      </PageFrame>
    </main>
    <footer className="section-specimen__badge">PageSection · whitespace-first</footer>
  </div>;
}

import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")!).render(<PageSectionSpecimen />);
