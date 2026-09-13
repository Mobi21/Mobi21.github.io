import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./command-palette-specimen.css";
import { Bell, FileText, MessageCircleMore, PanelLeftOpen, Search, Trash2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Button, IconButton, PageFrame, PageHeader, PageSection } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { __resetCommandHistoryForTests, rememberCommandDestination } from "../app/command-history";
import { CommandPalette, type Command, type PaletteRecord } from "../app/CommandPalette";

type Fixture = "empty" | "no-results" | "mixed" | "long" | "keyboard" | "compact";

const params = new URLSearchParams(window.location.search);
const requested = params.get("fixture") as Fixture | null;
const fixture: Fixture = requested && ["empty", "no-results", "mixed", "long", "keyboard", "compact"].includes(requested) ? requested : "empty";

__resetCommandHistoryForTests();
rememberCommandDestination("/calendar");
rememberCommandDestination("/brain/pages");
rememberCommandDestination("/settings/integrations");

const ordinaryRecords: PaletteRecord[] = [
  { id: "portfolio-refresh", label: "Publish the 2026 portfolio refresh", description: "Project · Career", path: "/work/projects/portfolio-refresh", icon: <FileText size={16} />, keywords: ["launch", "case studies"] },
  { id: "coastal-trip", label: "Plan the September coastal trip", description: "Project · Personal", path: "/work/projects/coastal-trip", icon: <FileText size={16} />, keywords: ["travel", "lodging"] },
  { id: "calendar-plan", label: "Weekly planning notes", description: "Page · Brain", path: "/brain/pages/weekly-planning", icon: <FileText size={16} />, keywords: ["plan", "review"] },
];

const longRecords: PaletteRecord[] = Array.from({ length: 120 }, (_, index) => ({
  id: `sample-record-${index + 1}`,
  label: `Sample record ${String(index + 1).padStart(3, "0")} with a deliberately bounded descriptive title`,
  description: index % 2 === 0 ? "Project · Personal" : "Page · Brain",
  path: index % 2 === 0 ? `/work/projects/sample-${index + 1}` : `/brain/pages/sample-${index + 1}`,
  icon: <FileText size={16} />,
  keywords: ["sample", "record", `fixture-${index + 1}`],
}));

const queryForFixture: Record<Fixture, string> = {
  empty: "",
  "no-results": "astronaut meal schedule",
  mixed: "plan",
  long: "sample record",
  keyboard: "calendar",
  compact: "",
};

function CommandPaletteSpecimen() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("The palette is open over a representative Work page.");
  const contextCommands: Command[] = [
    { id: "browse-work", label: "Browse Work", description: "Open Work navigation and available sections.", icon: <PanelLeftOpen size={16} />, keys: "Ctrl+B", run: () => setStatus("Work navigation opened") },
    { id: "review-removal", label: "Review project removal", description: "Open the owning review flow before changing anything.", icon: <Trash2 size={16} />, consequential: true, reviewPath: "/work/projects" },
  ];
  return <MemoryRouter initialEntries={["/work"]}>
    <div className="command-palette-specimen app-shell" data-workspace="work">
      <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="command-palette-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands" onClick={() => setOpen(true)}><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
      <main className="command-palette-specimen__main" id="main-content">
        <PageFrame width="standard"><PageHeader title="Shared command foundation" description="A deterministic background proves the palette is modal, compact-safe, and independent of route data." actions={<Button onClick={() => setOpen(true)}>Open palette</Button>} />
          <PageSection title="Qualification fixture" description={`Fixture: ${fixture}. Search, move with the arrow keys, press Enter, and close with Escape.`}><div className="command-palette-specimen__ledger"><span>Current focus</span><strong>Complete the shared interaction foundation</strong><span>Due today</span></div><p role="status">{status}</p></PageSection>
        </PageFrame>
      </main>
    </div>
    <CommandPalette
      key={`${fixture}-${open}`}
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setStatus("Palette closed and focus returned to its origin."); }}
      contextCommands={contextCommands}
      records={fixture === "long" ? longRecords : ordinaryRecords}
      defaultQuery={queryForFixture[fixture]}
    />
  </MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<CommandPaletteSpecimen />);
