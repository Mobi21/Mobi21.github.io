import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./tooltip-specimen.css";
import { Bell, Command, MessageCircleMore, Search } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { KoraMark } from "../components/KoraMark";
import { IconButton, Pressable, Tooltip, TooltipProvider } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";

type Fixture = "label" | "shortcut" | "long" | "disabled" | "edge-top" | "edge-right" | "edge-bottom" | "edge-left";

const labels: Record<Fixture, string> = {
  label: "Short label",
  shortcut: "Keyboard shortcut",
  long: "Long label",
  disabled: "Suppressed",
  "edge-top": "Top edge",
  "edge-right": "Right edge",
  "edge-bottom": "Bottom edge",
  "edge-left": "Left edge",
};

function TooltipSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("fixture") as Fixture | null;
  const interactive = params.get("interactive") === "1";
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "label");
  const [open, setOpen] = useState(!interactive);
  const edge = fixture.startsWith("edge-") ? fixture.slice(5) : "center";
  const side = edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : "top";
  const content = fixture === "long"
    ? "Search pages, commands, settings, and current Work without leaving this screen"
    : fixture === "disabled" ? "This tooltip is intentionally suppressed" : fixture === "shortcut" ? "Search Kora" : "Search";
  const trigger = <IconButton className="tooltip-specimen__trigger" label="Search Kora"><Search size={17} /></IconButton>;
  const tooltip = fixture === "disabled"
    ? <IconButton className="tooltip-specimen__trigger" label="Search Kora" tooltip={content} disabled><Search size={17} /></IconButton>
    : fixture === "shortcut"
    ? <Tooltip open={open} onOpenChange={setOpen} content={content} shortcut="Ctrl+K" shortcutKeys="Control+K" disabled={false} side={side} align="center" collisionPadding={12}>{trigger}</Tooltip>
    : <Tooltip open={open} onOpenChange={setOpen} content={content} side={side} align="center" collisionPadding={12}>{trigger}</Tooltip>;

  return <TooltipProvider delay={0}><div className="tooltip-specimen app-shell" data-workspace="global">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="tooltip-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="tooltip-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Tooltip role" description="Brief labels and shortcuts clarify compact controls without carrying instructions, interaction, or sensitive content." /><PageSection title="Required deterministic states" description="Choose a fixture, then inspect keyboard parity, terse copy, collision, suppression, and compact fit.">
      <div className="tooltip-specimen__fixtures" role="group" aria-label="Tooltip fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => { setFixture(key); setOpen(!interactive); }} key={key}>{labels[key]}</Pressable>)}</div>
      <div className="tooltip-specimen__stage" data-edge={edge}>
        {tooltip}
        <p className="tooltip-specimen__notice"><Command size={14} />{fixture === "disabled" ? "No tooltip is mounted for this suppressed state." : interactive ? "Focus or hover the search control." : "Tooltip held open for deterministic review."}</p>
      </div>
    </PageSection></PageFrame></main>
  </div></TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(<TooltipSpecimen />);
