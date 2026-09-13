import "@fontsource-variable/mona-sans";
import { AlertTriangle, Bell, CheckCircle2, MessageCircleMore, Search, Trash2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Field, Input } from "../components/form";
import { KoraMark } from "../components/KoraMark";
import { Button, IconButton, Modal, Pressable, type ModalPurpose } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./dialog-specimen.css";

type Fixture = "confirm" | "destructive" | "form" | "validation" | "submitting" | "failure" | "success" | "dirty" | "document";

const labels: Record<Fixture, string> = {
  confirm: "Ordinary confirm",
  destructive: "Destructive confirm",
  form: "Focused form",
  validation: "Validation error",
  submitting: "Submitting",
  failure: "Failure",
  success: "Success",
  dirty: "Dirty dismissal",
  document: "Document detail",
};

function DialogContent({ fixture, guarded, initialInputRef }: { fixture: Fixture; guarded: boolean; initialInputRef: RefObject<HTMLInputElement | null> }) {
  if (fixture === "confirm") return <p className="dialog-specimen__copy">The goal will leave active views and remain recoverable from Archive.</p>;
  if (fixture === "destructive") return <div className="dialog-specimen__consequence"><Trash2 size={20} /><p><strong>This cannot be undone.</strong> The local draft and its revision history will be permanently removed. Linked source records remain.</p></div>;
  if (fixture === "success") return <div className="dialog-specimen__result" role="status"><CheckCircle2 size={22} /><div><strong>Ready for planning</strong><p>Kora can now read calendar availability. Event changes still require their existing review boundary.</p></div></div>;
  if (fixture === "document") return <article className="dialog-specimen__document"><h3>Connection access summary</h3>{Array.from({ length: 14 }, (_, index) => <section key={index}><h4>{index + 1}. {index === 0 ? "Calendar availability" : index === 1 ? "Event metadata" : `Recorded boundary ${index + 1}`}</h4><p>Kora may read the minimum typed information needed for this capability. Consequential changes remain reviewable and provider failures remain explicit.</p></section>)}</article>;
  return <form className="dialog-specimen__form" onSubmit={(event) => event.preventDefault()}>
    {guarded ? <div className="dialog-specimen__guard" role="alert"><AlertTriangle size={18} /><div><strong>Keep these unsaved changes?</strong><p>Choose how to handle this draft before the dialog closes.</p></div></div> : null}
    <Field label="Connection name" error={fixture === "validation" ? "Use a name that is not already connected." : undefined}><Input ref={initialInputRef} defaultValue={fixture === "validation" ? "Personal calendar" : "Family calendar"} disabled={fixture === "submitting"} /></Field>
    <Field label="Use for" hint="Availability is readable; edits still require review."><Input defaultValue="Planning and conflict checks" disabled={fixture === "submitting"} /></Field>
    {fixture === "failure" ? <div className="dialog-specimen__error" role="alert"><AlertTriangle size={17} /><span>The connection could not be saved. Google Workspace is currently unavailable; your draft remains here.</span></div> : null}
  </form>;
}

function DialogSpecimen() {
  const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "confirm");
  const [open, setOpen] = useState(false);
  const [guarded, setGuarded] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const purpose: ModalPurpose = fixture === "document" ? "document-detail" : fixture === "confirm" || fixture === "destructive" ? "confirm" : "focused-form";
  const isDirty = fixture === "dirty";
  const formCanReceiveFocus = fixture === "form" || fixture === "validation" || fixture === "failure" || fixture === "dirty";
  const dismissProps = isDirty || fixture === "destructive"
    ? { dismissPolicy: "explicit" as const, onDismissAttempt: (reason: "outside-press" | "escape-key" | "close-press") => { if (isDirty) setGuarded(true); else if (reason === "close-press") close(); } }
    : { dismissPolicy: "standard" as const };
  const close = () => { setOpen(false); setGuarded(false); };
  const selectFixture = (next: Fixture) => { setFixture(next); setGuarded(false); };

  useEffect(() => {
    if (guarded) keepEditingRef.current?.focus();
  }, [guarded]);

  const actions = guarded
    ? <><Button ref={keepEditingRef} onClick={() => setGuarded(false)}>Keep editing</Button><Button tone="danger" onClick={close}>Discard draft</Button><Button tone="primary" onClick={close}>Save changes</Button></>
    : fixture === "confirm"
      ? <><Button ref={cancelRef} onClick={close}>Cancel</Button><Button tone="primary" onClick={close}>Archive goal</Button></>
      : fixture === "destructive"
        ? <><Button ref={cancelRef} onClick={close}>Cancel</Button><Button tone="danger" onClick={close}>Delete draft</Button></>
        : fixture === "success" || fixture === "document"
          ? <Button tone="primary" onClick={close}>{fixture === "document" ? "Done" : "Close"}</Button>
          : <><Button ref={cancelRef} onClick={close}>Cancel</Button><Button tone="primary" loading={fixture === "submitting"} onClick={close}>{fixture === "submitting" ? "Saving" : "Save connection"}</Button></>;

  return <div className="dialog-specimen app-shell" data-workspace="settings">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Settings</strong></div><div className="dialog-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="dialog-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Dialog roles" description="One focus-managed owner for bounded decisions, forms, and exceptional document detail." /><PageSection title="Required deterministic states" description="Choose a fixture, open it, and verify the exact role without changing application or provider data.">
      <div className="dialog-specimen__fixtures" role="group" aria-label="Dialog fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => selectFixture(key)} key={key}><span>{labels[key]}</span><small>{key === "document" ? "document-detail" : key === "confirm" || key === "destructive" ? "confirm" : "focused-form"}</small></Pressable>)}</div>
      <Button ref={openButtonRef} tone="primary" className="dialog-specimen__open" onClick={() => setOpen(true)}>Open {labels[fixture].toLowerCase()} fixture</Button>
    </PageSection></PageFrame></main>
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) close(); }}
      purpose={purpose}
      {...dismissProps}
      title={fixture === "confirm" ? "Archive completed goal?" : fixture === "destructive" ? "Delete this draft permanently?" : fixture === "success" ? "Connection saved" : fixture === "document" ? "What Kora can use" : guarded ? "Unsaved connection" : "Connect a calendar"}
      description={fixture === "confirm" ? "This removes the goal from active views without deleting its history." : fixture === "destructive" ? "Review the exact consequence before deleting." : fixture === "document" ? "A stable, scrollable detail view with one scroll owner." : fixture === "success" ? "The provider confirmed the new connection." : "Kora keeps provider access and consequential changes explicit."}
      actions={actions}
      initialFocus={purpose === "confirm" || fixture === "submitting" ? cancelRef : formCanReceiveFocus ? inputRef : true}
      finalFocus={openButtonRef}
      busy={fixture === "submitting"}
    >
      <DialogContent fixture={fixture} guarded={guarded} initialInputRef={inputRef} />
    </Modal>
  </div>;
}

createRoot(document.getElementById("root")!).render(<DialogSpecimen />);
