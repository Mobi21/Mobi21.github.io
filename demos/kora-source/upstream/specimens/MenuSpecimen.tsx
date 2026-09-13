import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./menu-specimen.css";
import { Archive, Bell, CheckCircle2, ChevronDown, Copy, Eye, EyeOff, List, MessageCircleMore, MoreHorizontal, Pencil, Search } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { KoraMark } from "../components/KoraMark";
import { Button, IconButton, Menu, Pressable, type MenuAction } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";

type Fixture = "actions" | "long" | "selection" | "disabled" | "edge-top" | "edge-right" | "edge-bottom" | "edge-left";

const labels: Record<Fixture, string> = {
  actions: "Contextual actions",
  long: "Long labels",
  selection: "Selected options",
  disabled: "Disabled actions",
  "edge-top": "Top edge",
  "edge-right": "Right edge",
  "edge-bottom": "Bottom edge",
  "edge-left": "Left edge",
};

function MenuSpecimen() {
  const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "actions");
  const [open, setOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState("No action selected yet.");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const edge = fixture.startsWith("edge-") ? fixture.slice(5) : "center";
  const side = edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : "bottom";

  const actions: MenuAction[] = fixture === "selection" ? [
    { id: "completed", label: "Show completed work", description: "Keep finished items in the current list", selected: showCompleted, onSelect: () => setShowCompleted((value) => !value) },
    { id: "archived", label: "Show archived work", description: "Include records moved out of active planning", selected: showArchived, onSelect: () => setShowArchived((value) => !value) },
  ] : fixture === "long" ? [
    { id: "rename", label: "Rename this goal while preserving its existing linked work and recorded progress", description: "Opens the bounded goal properties form", icon: <Pencil size={15} />, onSelect: () => setNotice("Rename selected") },
    { id: "copy", label: "Duplicate this goal and all incomplete milestones into a new personal planning draft", description: "Nothing is published or synchronized", icon: <Copy size={15} />, onSelect: () => setNotice("Duplicate selected") },
    { id: "archive", label: "Move this completed goal to the recoverable archive", icon: <Archive size={15} />, separatorBefore: true, onSelect: () => setNotice("Archive selected") },
  ] : fixture === "disabled" ? [
    { id: "open", label: "Open details", icon: <Eye size={15} />, onSelect: () => setNotice("Open details selected") },
    { id: "complete", label: "Mark complete", description: "Unavailable while two milestones remain blocked", icon: <CheckCircle2 size={15} />, disabled: true, onSelect: () => undefined },
    { id: "hide", label: "Hide from current view", icon: <EyeOff size={15} />, onSelect: () => setNotice("Hide selected") },
  ] : [
    { id: "open", label: "Open details", icon: <Eye size={15} />, shortcut: "Enter", onSelect: () => setNotice("Open details selected") },
    { id: "rename", label: "Rename", icon: <Pencil size={15} />, onSelect: () => setNotice("Rename selected") },
    { id: "duplicate", label: "Duplicate", icon: <Copy size={15} />, onSelect: () => setNotice("Duplicate selected") },
    { id: "archive", label: "Archive", icon: <Archive size={15} />, separatorBefore: true, onSelect: () => setNotice("Archive selected") },
  ];

  return <div className="menu-specimen app-shell" data-workspace="work">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Work</strong></div><div className="menu-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="menu-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Menu roles" description="Compact contextual actions and options stay close to their trigger, preserve keyboard order, and avoid every viewport edge." /><PageSection title="Required deterministic states" description="Choose a fixture, then inspect labels, selection, disabled behavior, shortcuts, collision, and focus restoration.">
      <div className="menu-specimen__fixtures" role="group" aria-label="Menu fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => { setFixture(key); setOpen(false); }} key={key}>{labels[key]}</Pressable>)}</div>
      <div className="menu-specimen__stage" data-edge={edge}>
        <Menu
          open={open}
          onOpenChange={setOpen}
          trigger={<Button ref={triggerRef} className="menu-specimen__trigger"><MoreHorizontal size={16} />Options<ChevronDown size={14} /></Button>}
          actions={actions}
          side={side}
          align="center"
          finalFocus={triggerRef}
          collisionPadding={12}
        />
        <p className="menu-specimen__notice" role="status"><List size={14} />{notice}</p>
      </div>
    </PageSection></PageFrame></main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<MenuSpecimen />);
