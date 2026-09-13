import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./popover-specimen.css";
import { Bell, Check, ChevronDown, ListFilter, MessageCircleMore, Search } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { CheckboxChoice, RadioGroup } from "../components/form";
import { KoraMark } from "../components/KoraMark";
import { Button, IconButton, Popover, Pressable, type PopoverPurpose } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";

type Fixture = "filters" | "long" | "selection" | "edge-top" | "edge-right" | "edge-bottom" | "edge-left";

const labels: Record<Fixture, string> = {
  filters: "Filters",
  long: "Long labels",
  selection: "Compact selection",
  "edge-top": "Top edge",
  "edge-right": "Right edge",
  "edge-bottom": "Bottom edge",
  "edge-left": "Left edge",
};

function PopoverSpecimen() {
  const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "filters");
  const [open, setOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [overdue, setOverdue] = useState(false);
  const [view, setView] = useState("list");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const edge = fixture.startsWith("edge-") ? fixture.slice(5) : "center";
  const side = edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : "bottom";
  const purpose: PopoverPurpose = fixture === "selection" ? "selection" : "filters";
  const title = fixture === "selection" ? "Choose a work view" : "Filter work";
  const description = fixture === "long"
    ? "Narrow this collection using deliberately long, realistic labels without clipping or widening the window."
    : fixture.startsWith("edge-")
      ? `Collision fixture anchored near the ${edge} viewport edge.`
      : fixture === "selection" ? "Change how this collection is presented." : "Changes apply only after you choose Apply.";

  const body = fixture === "selection" ? <RadioGroup
    value={view}
    onValueChange={setView}
    label="Work view"
    options={[
      { value: "list", title: "List", hint: "Scan tasks in a compact table" },
      { value: "board", title: "Board", hint: "Move tasks between states" },
      { value: "timeline", title: "Timeline", hint: "Available after tasks have dates", disabled: true },
    ]}
  /> : <div className="popover-specimen__choices">
    <CheckboxChoice checked={activeOnly} onCheckedChange={setActiveOnly} title={fixture === "long" ? "Only work that is currently active across every personal area" : "Active work only"} hint="Hides completed and archived items" />
    <CheckboxChoice checked={overdue} onCheckedChange={setOverdue} title={fixture === "long" ? "Include commitments whose due dates have already passed in your local time zone" : "Include overdue"} hint="Keeps missed commitments visible" />
    <CheckboxChoice checked={false} onCheckedChange={() => undefined} title="Connected-provider status" hint="Unavailable until a provider is connected" disabled />
  </div>;

  return <div className="popover-specimen app-shell" data-workspace="work">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Work</strong></div><div className="popover-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="popover-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Popover roles" description="Compact choices stay close to their trigger, retain a single scroll owner, and avoid every viewport edge." /><PageSection title="Required deterministic states" description="Choose a fixture, then open it to inspect collision, focus, labels, selection, disabled state, and compact fit.">
      <div className="popover-specimen__fixtures" role="group" aria-label="Popover fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => { setFixture(key); setOpen(false); }} key={key}>{labels[key]}</Pressable>)}</div>
      <div className="popover-specimen__stage" data-edge={edge}>
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger={<Button ref={triggerRef} className="popover-specimen__trigger"><ListFilter size={16} />{fixture === "selection" ? "View" : "Filters"}<ChevronDown size={14} /></Button>}
          title={title}
          description={description}
          purpose={purpose}
          side={side}
          align="center"
          initialFocus={() => document.querySelector<HTMLElement>(".k-popover__body [role='checkbox']:not([aria-disabled='true']), .k-popover__body [role='radio']:not([aria-disabled='true'])")}
          finalFocus={triggerRef}
          collisionPadding={12}
          actions={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button tone="primary" onClick={() => setOpen(false)}>{fixture === "selection" ? <><Check size={15} />Use {view}</> : "Apply filters"}</Button></>}
        >{body}</Popover>
      </div>
    </PageSection></PageFrame></main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<PopoverSpecimen />);
