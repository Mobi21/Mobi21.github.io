import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./disclosure-specimen.css";
import { Bell, CircleAlert, Clock3, FileText, MessageCircleMore, Search, ShieldCheck } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { KoraMark } from "../components/KoraMark";
import { Button, Disclosure, IconButton, Pressable, StatusText } from "../components/primitives";
import { PageFrame, PageHeader, PageSection } from "../components/workspace";

type Fixture = "closed" | "open" | "long" | "actions" | "status" | "disabled" | "no-icon";

const labels: Record<Fixture, string> = {
  closed: "Closed",
  open: "Open",
  long: "Long content",
  actions: "Interactive content",
  status: "Trust context",
  disabled: "Disabled",
  "no-icon": "No icon",
};

function DisclosureSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("fixture") as Fixture | null;
  const interactive = params.get("interactive") === "1";
  const [fixture, setFixture] = useState<Fixture>(requested && requested in labels ? requested : "open");
  const [open, setOpen] = useState(!interactive && fixture !== "closed" && fixture !== "disabled");

  const choose = (next: Fixture) => {
    setFixture(next);
    setOpen(!interactive && next !== "closed" && next !== "disabled");
  };

  const summary = fixture === "long"
    ? "Why this connection is unavailable while Kora still preserves the last confirmed information"
    : fixture === "actions" ? "Review available recovery choices"
      : fixture === "status" ? "Why these values are marked last confirmed"
        : fixture === "disabled" ? "Details are not available"
          : fixture === "no-icon" ? "Technical details" : "How Kora calculated this state";
  const description = fixture === "long"
    ? "A deliberately long supporting sentence proves that progressive disclosure remains readable without turning into a card or clipping compact layouts."
    : fixture === "status" ? "Provider state and local safety remain distinct."
      : fixture === "disabled" ? "There is no additional source detail for this state."
        : "Optional context stays secondary until it is useful.";
  const icon = fixture === "no-icon" ? undefined : fixture === "status" ? <ShieldCheck size={17} /> : fixture === "actions" ? <CircleAlert size={17} /> : <FileText size={17} />;

  return <div className="disclosure-specimen app-shell" data-workspace="global">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="disclosure-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="disclosure-specimen__main" id="main-content"><PageFrame width="standard"><PageHeader title="Disclosure role" description="Secondary explanation expands in place without becoming navigation, a card stack, or a hidden home for essential actions." /><PageSection title="Required deterministic states" description="Inspect progressive hierarchy, content flow, keyboard state, compact wrapping, disabled truth, and interactive content order.">
      <div className="disclosure-specimen__fixtures" role="group" aria-label="Disclosure fixtures">{(Object.keys(labels) as Fixture[]).map((key) => <Pressable data-selected={fixture === key || undefined} onClick={() => choose(key)} key={key}>{labels[key]}</Pressable>)}</div>
      <div className="disclosure-specimen__stage">
        <Disclosure
          open={open}
          onOpenChange={setOpen}
          summary={summary}
          description={description}
          meta={fixture === "status" ? "Last confirmed Aug 19" : fixture === "open" ? "2 details" : undefined}
          icon={icon}
          disabled={fixture === "disabled"}
        >
          {fixture === "long" ? <div className="disclosure-specimen__prose"><p>Kora could not refresh this provider, so the surrounding page must not present the absence as an empty account. Previously confirmed values remain visible with their date and source state.</p><p>Nothing in this disclosure authorizes a reconnect, changes a provider, or modifies local workspace data. Recovery stays on the owning integration surface.</p></div>
            : fixture === "actions" ? <div className="disclosure-specimen__actions"><p>Choose a safe next step. Consequential work remains on its owning review surface.</p><div><Button tone="primary">Review connection</Button><Button>Keep last-confirmed data</Button></div></div>
              : fixture === "status" ? <dl className="disclosure-specimen__facts"><div><dt>Provider</dt><dd>Unavailable</dd></div><div><dt>Local data</dt><dd>Intact</dd></div><div><dt>Automatic changes</dt><dd>None</dd></div></dl>
                : <p>{fixture === "no-icon" ? "Error code local_workspace_timeout · Request synthetic-review" : "Two current inputs and one last-confirmed source contribute to this state."}</p>}
        </Disclosure>
        <StatusText icon={<Clock3 size={14} />}>{open ? "Expanded details remain in normal reading flow." : fixture === "disabled" ? "Unavailable details cannot be opened." : "Details are collapsed."}</StatusText>
      </div>
    </PageSection></PageFrame></main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<DisclosureSpecimen />);
