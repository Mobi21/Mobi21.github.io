import "@fontsource-variable/mona-sans";
import { Bell, Link2, MessageCircleMore, Search, Settings, Sparkles } from "lucide-react";
import { createRoot } from "react-dom/client";
import { Button, IconButton, Input, Pressable } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { PageFrame, type PageFrameScroll, type PageFrameWidth } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./page-frame-specimen.css";

const widths: PageFrameWidth[] = ["focused", "standard", "wide", "fill"];

function flag(name: string) { return new URLSearchParams(window.location.search).get(name) === "1"; }

function CapabilitySidebar() {
  return <nav className="frame-specimen__sidebar" aria-label="Settings sections"><p>Settings</p>{["Overview", "Integrations", "Notifications", "Appearance", "Privacy"].map((item) => <a className={item === "Integrations" ? "is-current" : ""} href="#integrations" key={item}>{item}</a>)}</nav>;
}

function Inspector() {
  return <div className="frame-specimen__inspector"><span>Selected service</span><h2>Google Workspace</h2><dl><div><dt>Status</dt><dd>Connected</dd></div><div><dt>Coverage</dt><dd>Calendar and email</dd></div><div><dt>Last checked</dt><dd>2 minutes ago</dd></div></dl><Button>View connection</Button></div>;
}

function PageContent({ width, scroll }: { width: PageFrameWidth; scroll: PageFrameScroll }) {
  const services = ["Google Workspace", "Personal Chrome", "Local files", "Spotify", "Calendar archive", "Notifications", "GitHub", "Plaid"];
  const visibleServices = scroll === "internal"
    ? [...services, "Dropbox", "Apple Music", "Todoist", "Travel archive", "Health records", "Reading list", "Photo library", "Local backups"]
    : services;

  return <div className={`frame-specimen__content${scroll === "internal" ? " frame-specimen__content--internal" : ""}`}>
    <div className="frame-specimen__identity"><span>Settings · layout specimen</span><h1>{width === "focused" ? "Connection privacy" : width === "fill" ? "Integration activity" : "Accounts & integrations"}</h1><p>{width === "focused" ? "Review one consequential connection without stretching the form across the window." : width === "fill" ? "The declared child pane owns scrolling while the outer canvas remains fixed." : "The canvas uses one shared gutter and a deliberate maximum width instead of a feature-specific centered column."}</p></div>
    {width === "focused" ? <section className="frame-specimen__form" aria-label="Privacy example"><label><span>Connection name</span><Input defaultValue="Personal Google Workspace" /></label><label><span>Access summary</span><Input defaultValue="Calendar and email metadata" /></label><div><Button tone="primary">Save privacy settings</Button><Button>Cancel</Button></div></section> : <>
      <div className="frame-specimen__toolbar"><label><span className="sr-only">Search services</span><Input placeholder="Search services" /></label><Button>Filter</Button></div>
      <section className="frame-specimen__services" aria-label="Connected services">{visibleServices.map((service, index) => <Pressable key={service}><span><Link2 size={16} /></span><span><strong>{service}</strong><small>{index === 3 ? "Unavailable under current policy" : index === 6 ? "Connection needs review" : "Checked moments ago"}</small></span><span>{index === 3 ? "Unavailable" : index === 6 ? "Reconnect" : "Open"}</span></Pressable>)}</section>
    </>}
  </div>;
}

function PageFrameSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("width") as PageFrameWidth;
  const width = widths.includes(candidate) ? candidate : "standard";
  const scroll: PageFrameScroll = params.get("scroll") === "internal" || width === "fill" ? "internal" : "page";
  const sidebar = flag("sidebar");
  const inspector = flag("inspector");
  return <div className="frame-specimen app-shell" data-workspace="settings">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><div className="frame-specimen__location"><Settings size={16} /><strong>Settings</strong></div></div><div className="frame-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="frame-specimen__main" id="main-content">
      <PageFrame width={width} scroll={scroll} sidebar={sidebar ? <CapabilitySidebar /> : undefined} sidebarLabel="Settings sections" inspector={inspector ? <Inspector /> : undefined} inspectorLabel="Connection details">
        <PageContent width={width} scroll={scroll} />
      </PageFrame>
    </main>
    <footer className="frame-specimen__badge"><Sparkles size={13} />PageFrame · {width} · {scroll}</footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<PageFrameSpecimen />);
