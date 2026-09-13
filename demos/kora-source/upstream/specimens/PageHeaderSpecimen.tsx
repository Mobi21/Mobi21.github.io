import "@fontsource-variable/mona-sans";
import { Bell, BriefcaseBusiness, MessageCircleMore, MoreHorizontal, Plus, Search, Settings, Sparkles } from "lucide-react";
import { createRoot } from "react-dom/client";
import { Button, IconButton } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { PageFrame, PageHeader } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./page-header-specimen.css";

type HeaderCase = "root" | "record" | "minimal";

function HeaderBody({ record }: { record: boolean }) {
  return (
    <section className="header-specimen__body" aria-label="Header boundary example">
      <div className="header-specimen__body-copy">
        <h2>{record ? "The interviews are complete; permissions are the next constraint." : "Connection health"}</h2>
        <p>{record ? "Two release forms still need confirmation before layout can begin." : "The page body starts after one clear identity boundary."}</p>
      </div>
      <div className="header-specimen__placeholder" aria-hidden="true"><span /><span /><span /></div>
    </section>
  );
}

function PageHeaderSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("case") as HeaderCase;
  const fixture: HeaderCase = ["root", "record", "minimal"].includes(candidate) ? candidate : "root";
  const record = fixture === "record";
  const minimal = fixture === "minimal";
  const long = params.get("long") === "1";
  const location = record ? "Work" : "Settings";
  const LocationIcon = record ? BriefcaseBusiness : Settings;

  return (
    <div className="header-specimen app-shell" data-workspace={record ? "work" : "settings"}>
      <header className="window-bar">
        <div className="window-bar__brand"><KoraMark width={16} height={16} /><div className="header-specimen__location"><LocationIcon size={16} /><strong>{location}</strong></div></div>
        <div className="header-specimen__drag" />
        <div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div>
      </header>
      <main className="header-specimen__main" id="main-content">
        <PageFrame width={record ? "wide" : "standard"}>
          <PageHeader
            breadcrumb={record ? <nav aria-label="Breadcrumb"><a href="#work">Work</a><span>/</span><span aria-current="page">Goals</span></nav> : undefined}
            title={minimal ? "Appearance" : record ? (long ? "Publish the neighborhood oral-history zine without losing the voices that make it matter" : "Publish the neighborhood oral-history zine") : "Accounts & integrations"}
            description={minimal ? undefined : record ? "Bring interviews, permissions, editing, and print decisions into one clear outcome while Kora keeps the next meaningful step visible." : "Connect the services Kora can use and understand exactly what each connection makes available."}
            status={minimal ? undefined : record ? <><span className="header-specimen__status"><i />In progress</span><span>Updated 2 minutes ago</span><span>5 open tasks</span></> : <span>3 connected · 2 need attention</span>}
            actions={minimal ? undefined : <><Button><MoreHorizontal size={16} />{record ? "More" : "Review attention"}</Button><Button tone="primary"><Plus size={16} />{record ? "Add task" : "Add service"}</Button></>}
          />
          <HeaderBody record={record} />
        </PageFrame>
      </main>
      <footer className="header-specimen__badge"><Sparkles size={13} />PageHeader · {fixture}{long ? " · long" : ""}</footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<PageHeaderSpecimen />);
