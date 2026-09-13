import "@fontsource-variable/mona-sans";
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  Command,
  ListFilter,
  ListTodo,
  MessageCircleMore,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MemoryRouter } from "react-router-dom";
import { NavigationToggle } from "../app/NavigationToggle";
import { Navigator } from "../app/Navigator";
import {
  Badge,
  Button,
  CommandDialog,
  IconButton,
  KoraPresenceMark,
  Item,
  PageFrame,
  PageHeader,
  PageToolbar,
  Popover as KoraPopover,
  Pressable,
  SearchField,
  SegmentedControl,
  Sheet,
  Skeleton,
  StateNotice,
  WorkspaceLocalNav,
} from "../components/primitives";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./foundation-specimen.css";

export type FoundationFixture = "ordinary" | "loading" | "success" | "error" | "disabled";
export type FoundationOverlay = "auto" | "none" | "command" | "inspector";
export type FoundationTheme = "dark" | "light";

type Task = {
  id: string;
  title: string;
  detail: string;
  due: string;
  state: "ready" | "today" | "waiting" | "later";
};

const tasks: Task[] = [
  {
    id: "portfolio-send",
    title: "Send final portfolio draft to Maya",
    detail: "Personal launch · final review complete",
    due: "Today · 3:30 PM",
    state: "ready",
  },
  {
    id: "case-study",
    title: "Tighten the Aurora case study opening",
    detail: "Portfolio refresh · writing",
    due: "Today",
    state: "today",
  },
  {
    id: "references",
    title: "Ask Devon for a final reference quote",
    detail: "Personal launch · waiting on reply",
    due: "Waiting",
    state: "waiting",
  },
  {
    id: "resume",
    title: "Export the focused product resume",
    detail: "Career materials · 2 files ready",
    due: "Tomorrow",
    state: "today",
  },
  {
    id: "domain",
    title: "Move the portfolio domain to the new site",
    detail: "Launch checklist · after approval",
    due: "Sep 4",
    state: "later",
  },
  {
    id: "archive",
    title: "Archive the unused concept sketches",
    detail: "Portfolio refresh · clean-up",
    due: "Sep 6",
    state: "later",
  },
  {
    id: "analytics",
    title: "Add the final case-study analytics notes",
    detail: "Portfolio refresh · evidence",
    due: "Sep 7",
    state: "later",
  },
  {
    id: "contact",
    title: "Check the contact form on a clean browser",
    detail: "Launch checklist · quality pass",
    due: "Sep 7",
    state: "later",
  },
  {
    id: "bio",
    title: "Shorten the speaker bio to 90 words",
    detail: "Career materials · writing",
    due: "Sep 8",
    state: "later",
  },
  {
    id: "announcement",
    title: "Draft the quiet launch announcement",
    detail: "Personal launch · not scheduled",
    due: "Unscheduled",
    state: "later",
  },
];

const commandOptions = [
  { id: "calendar", label: "Go to Calendar", detail: "Check the afternoon around this task", icon: CalendarDays },
  { id: "work", label: "Open Work navigation", detail: "Move to goals, timeline, or archive", icon: ListTodo },
  { id: "new-task", label: "Create a task", detail: "Add another item to Personal launch", icon: Plus },
  { id: "focus", label: "Show only today", detail: "Apply the Today filter to this collection", icon: ListFilter },
] as const;

function fixtureFromQuery(): FoundationFixture {
  const requested = new URLSearchParams(window.location.search).get("state") as FoundationFixture | "overlay" | null;
  return requested && ["loading", "success", "error", "disabled"].includes(requested) ? requested as FoundationFixture : "ordinary";
}

function themeFromQuery(): FoundationTheme {
  if (typeof window === "undefined") return "dark";
  return new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
}

function overlayFromQuery(): FoundationOverlay {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("overlay") as FoundationOverlay | null;
  if (requested && ["none", "command", "inspector"].includes(requested)) return requested;
  if (params.get("state") === "overlay") return "command";
  return "auto";
}

function automaticOverlay() {
  if (window.innerWidth <= 899) return "inspector" as const;
  if (window.innerWidth <= 1180) return "command" as const;
  return "none" as const;
}

function taskMark(state: Task["state"]) {
  if (state === "ready") return <CheckCircle2 size={16} aria-hidden="true" />;
  if (state === "waiting") return <Clock3 size={16} aria-hidden="true" />;
  return <Circle size={15} aria-hidden="true" />;
}

function TaskInspector({ fixture }: { fixture: FoundationFixture }) {
  const completionDisabled = fixture === "disabled";
  return (
    <div className="foundation-inspector">
      <div className="foundation-inspector__heading">
        <span className="foundation-inspector__task-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
        <div>
          <span>Selected task</span>
          <h2>Send final portfolio draft to Maya</h2>
        </div>
        <IconButton label="More task actions" tooltip="More task actions"><MoreHorizontal size={17} /></IconButton>
      </div>

      <div className="foundation-inspector__status">
        <Badge tone="success" dot>Ready to send</Badge>
        <span>Local task · edited 12 minutes ago</span>
      </div>

      <dl className="foundation-inspector__facts">
        <div><dt>Project</dt><dd>Personal launch</dd></div>
        <div><dt>Due</dt><dd>Today at 3:30 PM</dd></div>
        <div><dt>Priority</dt><dd>High</dd></div>
        <div><dt>Source</dt><dd>Created in Kora</dd></div>
      </dl>

      <section className="foundation-inspector__note" aria-labelledby="task-note-title">
        <h3 id="task-note-title">Send after one last read</h3>
        <p>Maya asked for the case-study links and a short note about product systems work. Both are in the draft.</p>
      </section>

      <section className="foundation-calendar-cue" aria-labelledby="calendar-cue-title">
        <span className="foundation-calendar-cue__icon"><CalendarDays size={17} aria-hidden="true" /></span>
        <div>
          <h3 id="calendar-cue-title">Coffee with Maya</h3>
          <p>Today, 4:00–4:45 PM · Eastwood</p>
        </div>
        <Badge tone="calendar">Calendar</Badge>
      </section>

      <div className="foundation-inspector__actions">
        <Button tone="primary" disabled={completionDisabled}>Complete task</Button>
        <Button>Edit</Button>
      </div>
      {completionDisabled ? (
        <p className="foundation-inspector__reason">Complete is unavailable until the draft has a due date.</p>
      ) : null}
    </div>
  );
}

export function FoundationSpecimen({
  fixture = fixtureFromQuery(),
  initialOverlay = overlayFromQuery(),
  theme = themeFromQuery(),
}: {
  fixture?: FoundationFixture;
  initialOverlay?: FoundationOverlay;
  theme?: FoundationTheme;
}) {
  const initialAutomaticOverlay = initialOverlay === "auto" ? automaticOverlay() : initialOverlay;
  const compactNavigation = useMediaQuery("(max-width: 899px)");
  const [commandOpen, setCommandOpen] = useState(initialAutomaticOverlay === "command");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(initialAutomaticOverlay === "inspector");
  const [selectedTask, setSelectedTask] = useState(tasks[0].id);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("list");
  const [activeCommand, setActiveCommand] = useState(0);
  const [announcement, setAnnouncement] = useState(
    fixture === "success" ? "Task changes saved locally." : "Synthetic review workspace ready.",
  );
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const locationTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedTaskRef = useRef<HTMLElement | null>(null);
  const commandSearchRef = useRef<HTMLInputElement>(null);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      if (previous) document.documentElement.dataset.theme = previous;
      else delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    if (initialOverlay !== "auto") return undefined;
    const respondToViewport = () => {
      const overlay = automaticOverlay();
      setCommandOpen(overlay === "command");
      setInspectorOpen(overlay === "inspector");
    };
    window.addEventListener("resize", respondToViewport);
    return () => window.removeEventListener("resize", respondToViewport);
  }, [initialOverlay]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape") {
        if (commandOpen) {
          event.preventDefault();
          setCommandOpen(false);
          window.requestAnimationFrame(() => commandTriggerRef.current?.focus());
        } else if (inspectorOpen) {
          event.preventDefault();
          setInspectorOpen(false);
          window.requestAnimationFrame(() => selectedTaskRef.current?.focus());
        } else if (navigationOpen) {
          event.preventDefault();
          setNavigationOpen(false);
          window.requestAnimationFrame(() => locationTriggerRef.current?.focus());
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setNavigationOpen(false);
        setCommandOpen(true);
      }
      if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCommandOpen(false);
        setNavigationOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [commandOpen, inspectorOpen, navigationOpen]);

  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? commandOptions.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalized))
      : commandOptions;
  }, [query]);

  useEffect(() => {
    setActiveCommand(0);
  }, [query]);

  const closeCommandWith = useCallback((message: string) => {
    setAnnouncement(message);
    setCommandOpen(false);
  }, []);

  const moveCommandFocus = (direction: 1 | -1) => {
    if (!visibleCommands.length) return;
    const next = (activeCommand + direction + visibleCommands.length) % visibleCommands.length;
    setActiveCommand(next);
    commandRefs.current[next]?.focus();
  };

  const onCommandKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCommandFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCommandFocus(-1);
    }
  };

  const capabilityNavigation = (
    <WorkspaceLocalNav
      label="Work"
      title="Work"
      items={[
        { to: "/work", tooltip: "Goals", label: <span className="foundation-rail-label"><Circle size={16} /> Goals</span>, meta: "4" },
        { to: "/work/tasks", tooltip: "Tasks", label: <span className="foundation-rail-label"><ListTodo size={16} /> Tasks</span>, meta: "21", active: true },
        { to: "/work/timeline", tooltip: "Timeline", label: <span className="foundation-rail-label"><CalendarDays size={16} /> Timeline</span> },
        { to: "/work/archive", tooltip: "Archive", label: <span className="foundation-rail-label"><Archive size={16} /> Archive</span> },
      ]}
    />
  );

  const navigationControl = compactNavigation ? (
    <NavigationToggle ref={locationTriggerRef} open={navigationOpen} controls="foundation-navigation-sheet" onToggle={() => setNavigationOpen((open) => !open)} />
  ) : (
    <KoraPopover
      id="foundation-navigation-menu"
      open={navigationOpen}
      onOpenChange={setNavigationOpen}
      trigger={<NavigationToggle ref={locationTriggerRef} open={navigationOpen} />}
      side="bottom"
      align="start"
      sideOffset={6}
      className="navigation-popover"
      aria-label="Navigate"
      finalFocus={locationTriggerRef}
    >
      <Navigator presentation="popover" onNavigate={() => { setAnnouncement("Destination selected in the navigation fixture."); setNavigationOpen(false); }} />
    </KoraPopover>
  );

  const inspector = <TaskInspector fixture={fixture} />;

  return (
    <MemoryRouter initialEntries={["/work/tasks"]}>
      <div className="foundation-workspace app-shell" data-workspace="work" data-fixture={fixture}>
        <a className="skip-link" href="#main-content">Skip to tasks</a>
        <header className="window-bar foundation-topbar" aria-label="Kora workspace top bar">
          <div className="foundation-topbar__location">
            {navigationControl}
          </div>
          <div className="foundation-topbar__drag" aria-hidden="true" />
          <div className="window-bar__actions">
            <IconButton
              ref={commandTriggerRef}
              label="Open commands"
              tooltip="Search and commands · Ctrl+K"
              onClick={() => setCommandOpen(true)}
            ><Search size={16} /></IconButton>
            <IconButton label="Notifications" tooltip="Notifications"><Bell size={16} /></IconButton>
            <IconButton label="Open Kora" tooltip="Open Kora"><MessageCircleMore size={17} /></IconButton>
            <span className="foundation-topbar__presence"><KoraPresenceMark state="idle" label="Kora is ready" /></span>
          </div>
        </header>


        <main id="main-content" className="foundation-workspace__main" aria-label="Work tasks">
          <PageFrame
            width="fill"
            scroll="internal"
            sidebar={capabilityNavigation}
            sidebarLabel="Work"
            inspector={inspector}
            inspectorLabel="Selected task"
          >
            <PageHeader
              title="Tasks"
              description="Keep the personal launch moving without losing the day around it."
              status={<span className="foundation-page-status"><span aria-hidden="true" /> Local workspace · 21 open</span>}
              actions={<Button tone="primary"><Plus size={16} aria-hidden="true" /><span className="foundation-new-task-label">New task</span></Button>}
            />

            <PageToolbar
              density="compact"
              search={<SearchField value="" onValueChange={() => {}} label="Search tasks" placeholder="Search tasks" />}
              controls={<>
                <Button><ListFilter size={15} aria-hidden="true" /> Today <Badge tone="work">3</Badge></Button>
                <SegmentedControl
                  value={view}
                  onValueChange={setView}
                  label="Task view"
                  layoutId="foundation-task-view"
                  options={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]}
                />
              </>}
              compactControls={<Button><ListFilter size={15} aria-hidden="true" /> Filters <Badge tone="work">1</Badge></Button>}
            />

            {fixture === "error" ? (
              <StateNotice
                role="alert"
                tone="danger"
                presentation="bounded"
                title="Draft sync paused"
                body="Your local edits are still available. Try syncing this task again when the connection returns."
                icon={<CircleAlert size={17} />}
                action={<Button>Try again</Button>}
              />
            ) : null}

            {fixture === "success" ? (
              <StateNotice
                role="status"
                tone="success"
                presentation="inline"
                title="Task changes saved locally"
                body="The selected task kept its place in Personal launch."
                icon={<Check size={17} />}
              />
            ) : null}

            <section className="foundation-task-collection" aria-label="Personal launch tasks">
              <div className="foundation-collection-heading">
                <div>
                  <h2>Personal launch</h2>
                  <span>10 open · 2 due today</span>
                </div>
                <span className="foundation-collection-heading__calendar"><CalendarDays size={15} aria-hidden="true" /> Clear after 4:45 PM</span>
              </div>

              <div className="foundation-task-columns" aria-hidden="true">
                <span>Task</span><span>Due</span>
              </div>

              <div className="foundation-task-list">
                {fixture === "loading" ? (
                  <div className="foundation-task-loading" role="status" aria-label="Loading personal launch tasks">
                    <Skeleton rows={6} />
                  </div>
                ) : tasks.map((task) => (
<Item kind="action"
                    key={task.id}
                    className={`foundation-task-row foundation-task-row--${task.state}`}
                    title={task.title}
                    description={task.detail}
                    trailing={task.due}
                    leading={taskMark(task.state)}
                    lines={2}
                    selected={selectedTask === task.id}
                    rowProps={task.id === tasks[0].id ? { ref: (node) => { selectedTaskRef.current = node; } } : undefined}
                    onAction={() => {
                      setSelectedTask(task.id);
                      if (window.innerWidth <= 899) setInspectorOpen(true);
                    }}
                  />
                ))}
              </div>

              <div className="foundation-next-group">
                <div><h2>Later this week</h2><span>11 open</span></div>
                <Button tone="ghost">Show tasks</Button>
              </div>
            </section>

            <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
          </PageFrame>
        </main>

        <CommandDialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          title="Navigate and run a command"
          description="Search Kora destinations and safe local actions."
          initialFocus={commandSearchRef}
          finalFocus={commandTriggerRef}
          closeLabel="Close commands"
          popupClassName="foundation-command-dialog"
          backdropClassName="foundation-command-backdrop"
        >
          <div className="foundation-command-dialog__header">
            <Command size={18} aria-hidden="true" />
            <div><strong>Navigate and run a command</strong><span>Personal launch</span></div>
          </div>
          <SearchField
            value={query}
            onValueChange={setQuery}
            label="Search pages and commands"
            placeholder="Search pages and commands"
            inputRef={commandSearchRef}
            onKeyDown={onCommandKeyDown}
          />
          <div className="foundation-command-results" role="listbox" aria-label="Command results">
            {visibleCommands.length ? visibleCommands.map((item, index) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.id}
                  ref={(node) => { commandRefs.current[index] = node; }}
                  role="option"
                  aria-selected={activeCommand === index}
                  className="foundation-command-option"
                  onFocus={() => setActiveCommand(index)}
                  onKeyDown={onCommandKeyDown}
                  onClick={() => closeCommandWith(`${item.label} selected in the synthetic review workspace.`)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <span className="foundation-command-option__key">↵</span>
                </Pressable>
              );
            }) : (
              <div className="foundation-command-empty"><strong>No matching command</strong><span>Try “calendar” or “today”.</span></div>
            )}
          </div>
          <div className="foundation-command-dialog__footer"><span><kbd>↑↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
        </CommandDialog>

        {compactNavigation ? <Sheet
          id="foundation-navigation-sheet"
          open={navigationOpen}
          onOpenChange={setNavigationOpen}
          title="Navigate"
          description="Move between Kora capabilities."
          purpose="navigation"
          side="left"
          finalFocus={locationTriggerRef}
          className="foundation-navigation-sheet"
        >
          <Navigator onNavigate={() => {
            setAnnouncement("Destination selected in the navigation fixture.");
            setNavigationOpen(false);
          }} />
        </Sheet> : null}

        <Sheet
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          title="Task details"
          description="Personal launch · selected from Tasks"
          purpose="inspector"
          side="right"
          finalFocus={selectedTaskRef}
          className="foundation-task-sheet"
          actions={<Button onClick={() => setInspectorOpen(false)}>Back to tasks</Button>}
        >
          <TaskInspector fixture={fixture} />
        </Sheet>
      </div>
    </MemoryRouter>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<FoundationSpecimen />);

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
