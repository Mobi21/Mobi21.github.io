import "@fontsource-variable/mona-sans";
import { Bell, BriefcaseBusiness, MessageCircleMore, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { IconButton } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { PageFrame, PageHeader, PageTabs, type PageTabItem } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./page-tabs-specimen.css";

const baseViews = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["milestones", "Milestones"],
  ["activity", "Activity"],
] as const;

const extraViews = [
  ["notes", "Notes & decisions"],
  ["sources", "Linked sources"],
  ["archive", "Archived changes"],
  ["people", "Related people"],
  ["files", "Files & references"],
  ["decisions", "Decision history"],
  ["completed", "Completed milestones"],
] as const;

function PeerPanel({ label }: { label: string }) {
  return <section className="tabs-specimen__panel-content" aria-label={`${label} example`}><div><h2>{label}</h2><p>This panel is the peer view controlled by the selected tab.</p></div><div className="tabs-specimen__rows" aria-hidden="true"><span /><span /><span /></div></section>;
}

function PageTabsSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const many = params.get("many") === "1";
  const disabled = params.get("disabled") === "1";
  const source = many ? [...baseViews, ...extraViews] : baseViews;
  const [value, setValue] = useState(params.get("active") ?? "overview");
  const items: PageTabItem[] = source.map(([itemValue, label]) => ({
    value: itemValue,
    label,
    panel: <PeerPanel label={label} />,
    disabled: disabled && itemValue === "archive",
  }));

  return <div className="tabs-specimen app-shell" data-workspace="work">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><div className="tabs-specimen__location"><BriefcaseBusiness size={16} /><strong>Work</strong></div></div><div className="tabs-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="tabs-specimen__main" id="main-content">
      <PageFrame width="standard">
        <PageHeader title="Publish the neighborhood oral-history zine" description="Keep the outcome, work, progress, and history together without turning peer views into navigation hierarchy." status={<span>In progress · updated 2 minutes ago</span>} />
        <PageTabs label="Goal views" value={value} onValueChange={setValue} items={items} />
      </PageFrame>
    </main>
    <footer className="tabs-specimen__badge"><Sparkles size={13} />PageTabs · {many ? "overflow" : "standard"} · {value}</footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<PageTabsSpecimen />);
