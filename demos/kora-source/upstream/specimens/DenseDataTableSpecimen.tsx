import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./dense-data-table-specimen.css";
import { CalendarDays, Columns3, ListFilter, MessageCircleMore, Search, Target } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useMemo, useState, type MouseEvent } from "react";
import { MemoryRouter } from "react-router-dom";
import { Badge, Button, DataTable, IconButton, PageFrame, PageHeader, PageToolbar, SearchField, type DataColumn, type DataTableState } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";

type Task = {
  id: string;
  title: string;
  description?: string;
  goal?: string;
  area: string;
  kind: "Task" | "Milestone" | "Commitment" | "Outcome";
  state: "Planned" | "In progress" | "Blocked";
  due?: string;
  priority: "Low" | "Normal" | "High" | "Highest";
  focused?: boolean;
  blocker?: string;
};

const tasks: Task[] = [
  { id: "1", title: "Request final launch quote from Maya Chen", description: "Waiting for confirmation that the client name may be published.", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Task", state: "Blocked", due: "Aug 29", priority: "High", focused: true, blocker: "Waiting on Maya" },
  { id: "2", title: "Rewrite the Kora case study around measured outcomes", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Task", state: "In progress", due: "Aug 30", priority: "Highest", focused: true },
  { id: "3", title: "Send revised case-study deck to Maya", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Commitment", state: "In progress", due: "Aug 31", priority: "Highest" },
  { id: "4", title: "Jordan confirms the Friday departure window", goal: "Plan the September coastal trip", area: "Personal", kind: "Commitment", state: "In progress", due: "Aug 31", priority: "High", focused: true },
  { id: "5", title: "Compare the two refundable inns", goal: "Plan the September coastal trip", area: "Personal", kind: "Task", state: "Planned", due: "Sep 1", priority: "High" },
  { id: "6", title: "Practice carbonara without cream", description: "Repeat once with guanciale and write down the timing.", area: "Learning", kind: "Task", state: "In progress", due: "Sep 2", priority: "Normal" },
  { id: "7", title: "Refundable lodging reserved", goal: "Plan the September coastal trip", area: "Personal", kind: "Milestone", state: "Planned", due: "Sep 2", priority: "High" },
  { id: "8", title: "Maya returns publication approval", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Commitment", state: "Planned", due: "Sep 3", priority: "Normal" },
  { id: "9", title: "File appliance warranties and receipts", area: "Home", kind: "Task", state: "Planned", due: "Sep 4", priority: "Low" },
  { id: "10", title: "Editorial review complete", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Milestone", state: "Planned", due: "Sep 5", priority: "High" },
  { id: "11", title: "Share the final itinerary with Jordan Lee", goal: "Plan the September coastal trip", area: "Personal", kind: "Commitment", state: "Planned", due: "Sep 7", priority: "Normal" },
  { id: "12", title: "Launch the portfolio refresh with six credible case studies", goal: "Publish the 2026 portfolio refresh", area: "Career", kind: "Outcome", state: "In progress", due: "Sep 12", priority: "Highest" },
  { id: "13", title: "Arrive at the September coast trip rested and prepared", goal: "Plan the September coastal trip", area: "Personal", kind: "Outcome", state: "In progress", due: "Sep 18", priority: "High" },
];

const stateTone = (state: Task["state"]) => state === "Blocked" ? "danger" : state === "In progress" ? "work" : "quiet";
const fixture = new URLSearchParams(window.location.search).get("fixture") ?? "populated";

function DataTableSpecimen() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [selectionNotice, setSelectionNotice] = useState("");
  const visible = useMemo(() => tasks.filter((task) => `${task.title} ${task.goal ?? ""} ${task.area}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const state: DataTableState | undefined = fixture === "empty" ? { mode: "replacement", kind: "empty", title: "Nothing here yet", description: "Create a task or ask Kora to turn an outcome into a workable first step.", action: <Button tone="primary">Create task</Button> }
    : fixture === "filtered-empty" ? { mode: "replacement", kind: "filtered-empty", title: "Nothing matches these filters", description: "Your other Work is still here. Clear the current search and filters to see it.", action: <Button onClick={() => setQuery("")}>Clear filters</Button> }
      : fixture === "unavailable" ? { mode: "replacement", kind: "unavailable", title: "Tasks are unavailable", description: "Kora could not read the local Work collection. Existing records remain intact.", action: <Button>Try again</Button> }
        : fixture === "restricted" ? { mode: "replacement", kind: "restricted", title: "Some Work is omitted", description: "Restricted titles and details stay hidden from this ordinary collection." }
          : undefined;
  const columns: DataColumn<Task>[] = [
    { key: "task", header: "Work item", width: "auto", cellText: (task) => `Open ${task.title}`, cell: (task) => <span className="task-subject"><strong>{task.title}</strong><small>{task.kind} · {task.area}{task.blocker ? ` · ${task.blocker}` : ""}</small></span> },
    { key: "goal", header: "Goal", width: "24ch", cell: (task) => task.goal ?? "—" },
    { key: "state", header: "State", width: "18ch", cellText: (task) => task.state, cell: (task) => <Badge tone={stateTone(task.state)} dot>{task.state}</Badge> },
    { key: "due", header: "Due", width: "11ch", cell: (task) => task.due ?? "—" },
    { key: "priority", header: "Priority", width: "11ch", cell: (task) => task.priority },
    { key: "focus", header: "Focus", width: "7ch", wideOnly: true, cellText: (task) => task.focused ? "In focus" : "Not in focus", cell: (task) => task.focused ? <Target size={15} aria-hidden="true" /> : "" },
  ];
  const largeRows = useMemo(() => Array.from({ length: 500 }, (_, index) => {
    const task = tasks[index % tasks.length]!;
    const cycle = Math.floor(index / tasks.length) + 1;
    return { ...task, id: `large-${index + 1}`, title: cycle === 1 ? task.title : `${task.title} · ${cycle}` };
  }), []);
  const rows = state ? [] : fixture === "large" ? largeRows.slice(0, visibleLimit) : visible;
  const countKnown = !["loading", "unavailable", "restricted"].includes(fixture);
  const clearSelection = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setSelected(new Set());
    setSelectionNotice("Selection cleared. No Work changed.");
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[role="checkbox"][aria-label="Select all loaded rows"]')?.focus();
    });
  };
  return <MemoryRouter>
    <div className="dense-specimen app-shell">
      <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="dense-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
      <main className="dense-specimen__main">
        <PageFrame width="wide">
          <PageHeader title="Tasks" description="The concrete Work that moves your goals, commitments, hobbies, and everyday responsibilities forward." status={<span>{countKnown ? `${rows.length} loaded` : "Availability unknown"} · synthetic review state</span>} actions={<Button tone="primary">Plan with Kora</Button>} />
          <PageToolbar
            sticky
            search={<SearchField value={query} onValueChange={setQuery} label="Search tasks" placeholder="Search tasks" />}
            controls={<><Button><ListFilter size={15} />Open</Button><Button>All areas</Button><Button><Columns3 size={15} />Columns</Button></>}
            compactControls={<Button><ListFilter size={15} />Filters</Button>}
            secondaryActions={<Button><CalendarDays size={15} />Due date</Button>}
          />
          {fixture === "partial" ? <p className="dense-specimen__notice" role="status">Available tasks are shown. One restricted collection remains omitted.</p> : null}
          {selectionNotice ? <p className="dense-specimen__notice" role="status">{selectionNotice}</p> : null}
          <DataTable
            rows={fixture === "loading" ? [] : rows}
            columns={columns}
            rowKey={(task) => task.id}
            href={(task) => `/work/tasks/${task.id}`}
            caption="Current personal tasks"
            loading={fixture === "loading"}
            state={query && visible.length === 0 && !state ? { mode: "replacement", kind: "filtered-empty", title: "Nothing matches this search", description: "Your other Work remains available.", action: <Button onClick={() => setQuery("")}>Clear search</Button> } : state}
            mobileSummary={(task) => <span className="task-mobile-meta"><span>{task.goal ?? "No goal"}</span><Badge tone={stateTone(task.state)} dot>{task.state}</Badge><span>{task.due ?? "No due date"}</span><span>{task.priority}</span></span>}
            selection={{ scope: "loaded", scopeKey: `${fixture}|${query}`, selected, onChange: (next) => { setSelected(next); setSelectionNotice(""); }, label: (task) => `Select ${task.title}`, actions: <><Button onClick={() => setSelectionNotice(`${selected.size} selected ${selected.size === 1 ? "task is" : "tasks are"} ready for review. No Work changed.`)}>Review selection</Button><Button tone="ghost" onClick={clearSelection}>Clear</Button></> }}
            summary={countKnown ? fixture === "large" ? `${rows.length} of 500 loaded` : `${rows.length} loaded` : "Count unavailable"}
            onLoadMore={fixture === "large" && rows.length < largeRows.length ? () => setVisibleLimit((current) => Math.min(current + 50, largeRows.length)) : undefined}
          />
        </PageFrame>
      </main>
    </div>
  </MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<DataTableSpecimen />);
