import "@fontsource-variable/mona-sans";
import {
  Archive,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FolderKanban,
  HeartPulse,
  ListTodo,
  MessageCircleMore,
  Search,
  Settings2,
  WalletCards,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { useRef, useState, type RefObject } from "react";
import { Field, Input } from "../components/form";
import { KoraMark } from "../components/KoraMark";
import {
  Badge,
  Button,
  IconButton,
  Pressable,
  Sheet,
  StateView,
  type SheetPurpose,
} from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./sheet-specimen.css";

type Fixture = "populated" | "loading" | "error" | "gone" | "navigation" | "properties" | "dirty" | "long";

const labels: Record<Fixture, string> = {
  populated: "Populated inspector",
  loading: "Loading inspector",
  error: "Inspector error",
  gone: "Gone record",
  navigation: "Compact navigation",
  properties: "Properties",
  dirty: "Dirty properties",
  long: "Long content",
};

function InspectorRecord() {
  return <article className="sheet-specimen__record">
    <div className="sheet-specimen__record-state"><Badge tone="work" dot>In progress</Badge><span>Local record · updated 12 minutes ago</span></div>
    <p className="sheet-specimen__summary">Shape the final portfolio story around measured outcomes, then send the review copy before Friday.</p>
    <dl className="sheet-specimen__facts">
      <div><dt>Goal</dt><dd>Publish the 2026 portfolio refresh</dd></div>
      <div><dt>Due</dt><dd>Friday, August 28</dd></div>
      <div><dt>Priority</dt><dd>High</dd></div>
      <div><dt>Source</dt><dd>Stored in Kora</dd></div>
    </dl>
    <section aria-labelledby="sheet-next-step"><h3 id="sheet-next-step">Next meaningful step</h3><p>Rewrite the opening paragraph with the conversion result and send it to Maya for approval.</p></section>
    <section aria-labelledby="sheet-linked-context"><h3 id="sheet-linked-context">Linked context</h3><Pressable className="sheet-specimen__linked"><FolderKanban size={16} /><span><strong>Portfolio refresh</strong><small>Career goal · 6 open items</small></span><ChevronRight size={15} /></Pressable></section>
  </article>;
}

function SheetNavigation({ firstRef }: { firstRef: RefObject<HTMLButtonElement | null> }) {
  const destinations = [
    [ListTodo, "Work", "Goals and tasks"],
    [CalendarDays, "Calendar", "Time and commitments"],
    [WalletCards, "Money", "Balances and obligations"],
    [HeartPulse, "Wellbeing", "Health and daily care"],
    [Settings2, "Settings", "Kora and connected services"],
  ] as const;
  return <nav className="sheet-specimen__navigation" aria-label="Kora destinations">
    {destinations.map(([Icon, title, detail], index) => <Pressable ref={index === 0 ? firstRef : undefined} key={title}><Icon size={18} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={15} /></Pressable>)}
  </nav>;
}

function PropertiesForm({ inputRef, guarded }: { inputRef: RefObject<HTMLInputElement | null>; guarded: boolean }) {
  return <form className="sheet-specimen__properties" onSubmit={(event) => event.preventDefault()}>
    {guarded ? <div className="sheet-specimen__guard" role="alert"><CircleAlert size={18} /><div><strong>Keep these unsaved changes?</strong><p>Choose how to handle this property draft before the panel closes.</p></div></div> : null}
    <Field label="Task name"><Input ref={inputRef} defaultValue="Prepare portfolio review" /></Field>
    <Field label="Due date" hint="Shown in your local time zone."><Input type="date" defaultValue="2026-08-28" /></Field>
    <Field label="Priority"><Input defaultValue="High" /></Field>
    <div className="sheet-specimen__provenance"><Archive size={16} /><div><strong>Stored locally in Kora</strong><p>Changes remain local until an owning integration explicitly syncs them.</p></div></div>
  </form>;
}

function LongInspector() {
  return <article className="sheet-specimen__long">
    <div className="sheet-specimen__record-state"><Badge tone="info">History</Badge><span>14 recorded changes</span></div>
    {Array.from({ length: 14 }, (_, index) => <section key={index}>
      <span>{index === 0 ? "Today, 9:42 AM" : `August ${26 - index}, ${8 + (index % 4)}:15 AM`}</span>
      <h3>{index === 0 ? "Due date confirmed" : index === 1 ? "Review copy attached" : `Recorded change ${index + 1}`}</h3>
      <p>Kora preserved the typed change, its local source, and the prior value so the record remains understandable.</p>
    </section>)}
  </article>;
}

function SheetSpecimen() {
  const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "populated");
  const [open, setOpen] = useState(false);
  const [guarded, setGuarded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstNavigationRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const purpose: SheetPurpose = fixture === "navigation" ? "navigation" : fixture === "properties" || fixture === "dirty" ? "properties" : "inspector";
  const close = () => { setOpen(false); setGuarded(false); };
  const selectFixture = (next: Fixture) => { setFixture(next); setGuarded(false); };
  const dismissProps = fixture === "dirty"
    ? { dismissPolicy: "explicit" as const, onDismissAttempt: () => setGuarded(true) }
    : { dismissPolicy: "standard" as const };

  const body = fixture === "populated" ? <InspectorRecord />
    : fixture === "loading" ? <StateView state="loading" title="Loading task details" geometry={<div className="sheet-specimen__loading" aria-hidden="true"><span /><span /><span /><span /></div>} />
    : fixture === "error" ? <StateView state="error" title="Task details could not be loaded" body="The selected task remains in the list. Retry without losing your place." action={<Button ref={primaryActionRef}>Retry</Button>} />
    : fixture === "gone" ? <StateView state="unavailable" title="This task is no longer available" body="It may have been archived or deleted elsewhere. Return to the task list to choose another record." action={<Button ref={primaryActionRef}>Return to tasks</Button>} />
    : fixture === "navigation" ? <SheetNavigation firstRef={firstNavigationRef} />
    : fixture === "properties" || fixture === "dirty" ? <PropertiesForm inputRef={firstInputRef} guarded={guarded} />
    : <LongInspector />;

  const actions = guarded
    ? <><Button onClick={() => setGuarded(false)}>Keep editing</Button><Button tone="danger" onClick={close}>Discard draft</Button><Button tone="primary" onClick={close}>Save changes</Button></>
    : fixture === "populated" ? <Button ref={primaryActionRef} tone="primary" onClick={close}>Open full record</Button>
    : fixture === "properties" || fixture === "dirty" ? <><Button onClick={fixture === "dirty" ? () => setGuarded(true) : close}>Cancel</Button><Button ref={primaryActionRef} tone="primary" onClick={close}>Save properties</Button></>
    : fixture === "long" ? <Button ref={primaryActionRef} tone="primary" onClick={close}>Done</Button>
    : undefined;

  const initialFocus = fixture === "navigation" ? firstNavigationRef
    : fixture === "properties" || fixture === "dirty" ? firstInputRef
    : fixture === "populated" || fixture === "error" || fixture === "gone" || fixture === "long" ? primaryActionRef
    : true;

  return <div className="sheet-specimen app-shell" data-workspace={purpose === "navigation" ? "global" : "work"}>
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Work</strong></div><div className="sheet-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="sheet-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Sheet roles" description="One focus-managed side surface for inspection, compact navigation, and bounded properties." /><PageSection title="Required deterministic states" description="Choose a fixture, then verify its role without changing product or provider data.">
      <div className="sheet-specimen__fixtures" role="group" aria-label="Sheet fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => selectFixture(key)} key={key}><span>{labels[key]}</span><small>{key === "navigation" ? "navigation" : key === "properties" || key === "dirty" ? "properties" : "inspector"}</small></Pressable>)}</div>
      <Button ref={triggerRef} tone="primary" className="sheet-specimen__open" onClick={() => setOpen(true)}>Open {labels[fixture].toLowerCase()} fixture</Button>
    </PageSection></PageFrame></main>
    <Sheet
      open={open}
      onOpenChange={(next) => { if (!next) close(); }}
      purpose={purpose}
      {...dismissProps}
      side={purpose === "navigation" ? "left" : "right"}
      title={fixture === "populated" ? "Prepare portfolio review" : fixture === "loading" ? "Task details" : fixture === "error" ? "Task details unavailable" : fixture === "gone" ? "Record ended" : fixture === "navigation" ? "Navigate Kora" : fixture === "long" ? "Activity and provenance" : guarded ? "Unsaved properties" : "Task properties"}
      description={fixture === "navigation" ? "Move between daily, organizing, and system spaces." : fixture === "long" ? "A stable history with one body scroll owner." : fixture === "gone" ? "The selected record reached a terminal state." : "Inspect context without losing your place in the collection."}
      actions={actions}
      initialFocus={initialFocus}
      finalFocus={triggerRef}
      busy={fixture === "loading"}
      closeLabel={fixture === "navigation" ? "Close navigation" : "Close details"}
    >{body}</Sheet>
  </div>;
}

createRoot(document.getElementById("root")!).render(<SheetSpecimen />);
