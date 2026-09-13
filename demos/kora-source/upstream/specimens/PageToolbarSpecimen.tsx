import "@fontsource-variable/mona-sans";
import { Bell, BriefcaseBusiness, Columns3, Filter, ListFilter, MessageCircleMore, Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchField } from "../components/form";
import { Button, IconButton, Pressable } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { PageFrame, PageHeader, PageToolbar } from "../components/workspace";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./page-toolbar-specimen.css";

const taskNames = [
  "Confirm photo permissions with Mrs. Alvarez",
  "Revise the interview transcript captions",
  "Book the library scanner",
  "Choose paper stock for the first proof",
  "Prepare the neighborhood launch note",
  "Review the translated introduction",
  "Send the print-ready proof",
  "Archive source recordings",
  "Check the final image credits",
  "Confirm the community-room reservation",
  "Print the first proof copy",
  "Review the proof with interview participants",
  "Correct the neighborhood map legend",
  "Send the print quantity to the library",
  "Prepare the launch reading order",
  "Confirm accessibility copies",
];

function TaskRows({ query }: { query: string }) {
  const visible = taskNames.filter((task) => task.toLowerCase().includes(query.toLowerCase()));
  return <section className="toolbar-specimen__list" aria-label="Tasks">
    <div className="toolbar-specimen__head"><span>Task</span><span>State</span><span>Due</span><span>Priority</span></div>
    {visible.map((title, index) => <Pressable className="toolbar-specimen__row" key={title}><span><i /><strong>{title}</strong><small>Oral-history zine · Creative</small></span><span>{index === 0 ? "Blocked" : index % 3 === 0 ? "In progress" : "Planned"}</span><span>{index < 2 ? "Today" : `Sep ${index + 1}`}</span><span>{index < 2 ? "Highest" : index % 4 === 0 ? "High" : "Normal"}</span></Pressable>)}
    {visible.length === 0 ? <div className="toolbar-specimen__empty">No tasks match “{query}”. Clear the search to see every task.</div> : null}
  </section>;
}

function PageToolbarSpecimen() {
  const params = new URLSearchParams(window.location.search);
  const density = params.get("density") === "compact" ? "compact" : "normal";
  const minimal = params.get("minimal") === "1";
  const [query, setQuery] = useState(params.get("query") ?? "");

  return <div className="toolbar-specimen app-shell" data-workspace="work">
    <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><div className="toolbar-specimen__location"><BriefcaseBusiness size={16} /><strong>Work</strong></div></div><div className="toolbar-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
    <main className="toolbar-specimen__main" id="main-content">
      <PageFrame width="wide">
        <PageHeader title="Tasks" description="Everything that needs doing across your goals and everyday life." status={<span>16 open · 2 blocked</span>} />
        <PageToolbar
          aria-label="Task controls"
          density={density}
          sticky
          search={<SearchField label="Search tasks" placeholder="Search tasks" value={query} onValueChange={setQuery} />}
          controls={minimal ? undefined : <><Button><ListFilter size={16} />Open</Button><Button>Any area</Button><Button>List</Button><Button>Due date</Button></>}
          compactControls={minimal ? undefined : <Button aria-label="Filters and display, 3 active"><Filter size={16} />Filters &amp; display <span className="toolbar-specimen__filter-count" aria-hidden="true">3</span></Button>}
          secondaryActions={minimal ? undefined : <Button><Columns3 size={16} />Columns</Button>}
          primaryAction={<Button tone="primary"><Plus size={16} />Add task</Button>}
        />
        <TaskRows query={query} />
      </PageFrame>
    </main>
    <footer className="toolbar-specimen__badge"><Sparkles size={13} />PageToolbar · {density}{minimal ? " · minimal" : ""}</footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<PageToolbarSpecimen />);
