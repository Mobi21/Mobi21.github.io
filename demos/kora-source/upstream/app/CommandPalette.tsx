import { Command as CommandIcon, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandDialog, Kbd } from "../components/primitives";
import { recentCommandDestinations } from "./command-history";
import { GLOBAL_COMMANDS } from "./command-registry";
import { NAVIGATION_DESTINATIONS, destinationForId, destinationForPath } from "./navigation";
import { shortcutKeys } from "./shortcut-registry";

export type Command = {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  keys?: string;
  keywords?: readonly string[];
} & ({
  run: () => void;
  consequential?: false;
  reviewPath?: never;
} | {
  run?: never;
  consequential: true;
  /** Consequential work is reviewed on its owner; the palette never executes it. */
  reviewPath: string;
});

export type PaletteRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: ReactNode;
  keywords?: readonly string[];
};

export type PaletteRecordSearchResult = {
  records: PaletteRecord[];
  /** Source-specific coverage notices from the typed record owner. */
  issues?: string[];
};

export type PaletteRecordSearch = (
  query: string,
  signal?: AbortSignal,
) => Promise<PaletteRecordSearchResult>;

type Section = "Recent" | "Current" | "Pages" | "Records" | "Commands" | "Settings";

type PaletteEntry = {
  id: string;
  label: string;
  description?: string;
  section: Section;
  icon: ReactNode;
  keys?: string;
  keywords: readonly string[];
  /** The typed record owner already matched this entry, including semantic hits. */
  runtimeMatched?: boolean;
  commit: () => void;
};

const SEARCH_SECTION_ORDER: readonly Section[] = ["Pages", "Records", "Commands", "Settings"];
const EMPTY_SECTION_ORDER: readonly Section[] = ["Recent", "Current", "Commands"];
const MAX_SEARCH_RESULTS = 20;
const SEARCH_SECTION_LIMITS: Partial<Record<Section, number>> = { Pages: 8, Records: 5, Commands: 4, Settings: 3 };

/** Subsequence match, so "brnmem" finds "Brain Memory" without a fuzzy-search dependency. */
function matches(haystack: string, needle: string) {
  if (!needle) return true;
  const target = haystack.toLocaleLowerCase();
  const query = needle.toLocaleLowerCase().replace(/\s+/g, "");
  let index = 0;
  for (const character of query) {
    index = target.indexOf(character, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

function matchScore(entry: Pick<PaletteEntry, "label" | "description" | "keywords">, needle: string) {
  const query = needle.trim().toLocaleLowerCase();
  const label = entry.label.toLocaleLowerCase();
  const supporting = [entry.description, ...entry.keywords].filter(Boolean).join(" ").toLocaleLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (supporting.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (label.includes(query)) return 4;
  if (supporting.includes(query)) return 5;
  return query.length >= 5 && !query.includes(" ") && matches(`${label} ${supporting}`, query) ? 6 : null;
}

function safeOptionId(base: string, id: string) {
  return `${base}-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Fast global navigation over one shared page registry plus typed, local record
 * and command contributions. The palette may navigate to a review surface for
 * consequential work, but cannot execute that work itself.
 */
export function CommandPalette({
  open,
  onOpenChange,
  contextCommands = [],
  records = [],
  searchRecords,
  defaultQuery = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextCommands?: Command[];
  records?: PaletteRecord[];
  /** Bounded, typed production search. Restricted records must be omitted by its runtime owner. */
  searchRecords?: PaletteRecordSearch;
  defaultQuery?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId().replaceAll(":", "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [searchedRecords, setSearchedRecords] = useState<PaletteRecord[]>([]);
  const [recordSearchIssues, setRecordSearchIssues] = useState<string[]>([]);
  const [recordsPending, setRecordsPending] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || !searchRecords || normalized.length < 2) {
      setSearchedRecords([]);
      setRecordSearchIssues([]);
      setRecordsPending(false);
      return;
    }
    let current = true;
    const controller = new AbortController();
    // A new query invalidates the previous result set immediately. Keeping it
    // visible while the bounded Brain request is pending makes stale records
    // look like matches for the new query.
    setSearchedRecords([]);
    setRecordSearchIssues([]);
    setRecordsPending(true);
    const timer = window.setTimeout(() => {
      void searchRecords(normalized, controller.signal)
        .then((result) => {
          if (!current) return;
          setSearchedRecords(result.records);
          setRecordSearchIssues(result.issues ?? []);
        })
        .catch(() => {
          if (current) {
            setSearchedRecords([]);
            setRecordSearchIssues(["Brain records could not be searched"]);
          }
        })
        .finally(() => { if (current) setRecordsPending(false); });
    }, 120);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, searchRecords]);

  const closeAndNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const currentRoute = `${location.pathname}${location.search}`;
  const currentWorkspace = destinationForPath(currentRoute)?.context ?? "this workspace";
  const globalCommands = useMemo<Command[]>(() => GLOBAL_COMMANDS.map((definition) => {
    const destination = destinationForId(definition.destinationId);
    if (!destination) throw new Error(`Global command ${definition.id} has no registered destination.`);
    const Icon = definition.icon;
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      icon: <Icon size={16} />,
      keys: definition.keys ?? (definition.shortcutId ? shortcutKeys(definition.shortcutId) : undefined),
      keywords: definition.keywords,
      run: () => closeAndNavigate(destination.to),
    };
  }), [navigate, onOpenChange]);

  const mapCommand = (command: Command, section: "Current" | "Commands"): PaletteEntry => ({
    id: `command:${command.id}`,
    label: command.label,
    description: command.description,
    section,
    icon: command.icon,
    keys: command.keys,
    keywords: command.keywords ?? [],
    commit: command.consequential
      ? () => closeAndNavigate(command.reviewPath)
      : () => { onOpenChange(false); command.run(); },
  });

  const searchEntries = useMemo<PaletteEntry[]>(() => {
    const destinations = NAVIGATION_DESTINATIONS.map<PaletteEntry>((destination) => ({
      id: destination.id,
      label: destination.label,
      description: destination.description ?? (destination.context === destination.label ? "Workspace" : destination.context),
      section: destination.kind === "setting" ? "Settings" : "Pages",
      icon: <destination.icon size={16} />,
      keys: destination.shortcutId ? shortcutKeys(destination.shortcutId) : undefined,
      keywords: destination.keywords,
      commit: () => closeAndNavigate(destination.to),
    }));
    const mergedRecords = [...records, ...searchedRecords].filter((record, index, source) =>
      source.findIndex((candidate) => candidate.id === record.id) === index,
    );
    const searchedRecordIds = new Set(searchedRecords.map((record) => record.id));
    const recordEntries = mergedRecords.map<PaletteEntry>((record) => ({
      id: `record:${record.id}`,
      label: record.label,
      description: record.description,
      section: "Records",
      icon: record.icon,
      keywords: record.keywords ?? [],
      runtimeMatched: searchedRecordIds.has(record.id),
      commit: () => closeAndNavigate(record.path),
    }));
    return [
      ...destinations,
      ...recordEntries,
      ...contextCommands.map((command) => mapCommand(command, "Commands")),
      ...globalCommands.map((command) => mapCommand(command, "Commands")),
    ];
  }, [contextCommands, globalCommands, records, searchedRecords]);

  const emptyEntries = useMemo<PaletteEntry[]>(() => {
    const recents = recentCommandDestinations(currentRoute).map<PaletteEntry>((destination) => ({
      id: `recent:${destination.id}`,
      label: destination.label,
      description: destination.context,
      section: "Recent",
      icon: <destination.icon size={16} />,
      keys: destination.shortcutId ? shortcutKeys(destination.shortcutId) : undefined,
      keywords: destination.keywords,
      commit: () => closeAndNavigate(destination.to),
    }));
    return [
      ...recents,
      ...contextCommands.map((command) => mapCommand(command, "Current")),
      ...globalCommands.map((command) => mapCommand(command, "Commands")),
    ];
  }, [contextCommands, currentRoute, globalCommands]);

  const resultModel = useMemo(() => {
    const normalizedQuery = query.trim();
    const source = normalizedQuery ? searchEntries : emptyEntries;
    const matched = normalizedQuery
      ? source
        .map((entry) => ({ entry, score: entry.runtimeMatched ? 0 : matchScore(entry, normalizedQuery) }))
        .filter((result): result is { entry: PaletteEntry; score: number } => result.score !== null)
      : source.map((entry) => ({ entry, score: 0 }));
    const sectionOrder = normalizedQuery ? SEARCH_SECTION_ORDER : EMPTY_SECTION_ORDER;
    const ordered = sectionOrder.flatMap((section) => matched
      .filter((result) => result.entry.section === section)
      .sort((left, right) => left.score - right.score || left.entry.label.localeCompare(right.entry.label))
      .map((result) => result.entry)
      .slice(0, normalizedQuery ? SEARCH_SECTION_LIMITS[section] ?? MAX_SEARCH_RESULTS : MAX_SEARCH_RESULTS));
    const visible = ordered.slice(0, MAX_SEARCH_RESULTS);
    const groups = sectionOrder
      .map((section) => ({ section, entries: visible.filter((entry) => entry.section === section) }))
      .filter((group) => group.entries.length > 0);
    return { matchedCount: matched.length, visible, groups };
  }, [emptyEntries, query, searchEntries]);

  useEffect(() => {
    if (!open) return;
    setQuery(defaultQuery);
    setSelected(0);
  }, [defaultQuery, open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (resultModel.visible.length === 0) {
      setSelected(0);
      return;
    }
    setSelected((value) => Math.min(value, resultModel.visible.length - 1));
  }, [resultModel.visible.length]);

  const activeEntry = resultModel.visible[selected];
  const activeOptionId = activeEntry ? safeOptionId(listId, activeEntry.id) : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    const option = listRef.current?.querySelector(`#${activeOptionId}`);
    if (option && "scrollIntoView" in option && typeof option.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [activeOptionId]);

  const commit = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    entry.commit();
  };

  const announcement = query.trim()
    ? recordsPending ? `Searching records. ${resultModel.matchedCount} current results` : resultModel.matchedCount === 1 ? "1 result" : `${resultModel.matchedCount} results`
    : `${resultModel.visible.length} suggestions`;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to a page or command"
      description="Search Kora pages, records, safe commands, and settings."
      closeLabel="Close command palette"
      popupClassName="palette"
      backdropClassName="palette-backdrop"
      initialFocus={inputRef}
    >
          <div className="palette__field">
            <Search size={18} aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              type="text"
              placeholder="Go to a page or command…"
              aria-label="Filter pages, records, commands, and settings"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // During IME composition, Enter confirms the candidate and
                // arrows move through that candidate list. Palette shortcuts
                // must wait until the browser reports composition complete.
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                const last = resultModel.visible.length - 1;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelected((value) => last < 0 ? 0 : value >= last ? 0 : value + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((value) => last < 0 ? 0 : value <= 0 ? last : value - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setSelected(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setSelected(Math.max(0, last));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  commit(activeEntry);
                }
              }}
            />
            <Kbd>Esc</Kbd>
          </div>

          {recordSearchIssues.length > 0 && (
            <div className="palette__search-notice" role="status" aria-live="polite">
              {recordSearchIssues.join(" · ")}
            </div>
          )}

          <div className="palette__list" id={listId} ref={listRef} role="listbox" aria-label="Command palette results" aria-busy={recordsPending || undefined}>
            {resultModel.groups.map((group) => (
              <section className="palette__group" key={group.section} role="group" aria-label={group.section}>
                <div className="palette__group-heading" aria-hidden="true"><span>{group.section}</span><span>{group.entries.length}</span></div>
                {group.entries.map((entry) => {
                  const index = resultModel.visible.indexOf(entry);
                  const selectedEntry = index === selected;
                  return (
                    <div
                      key={entry.id}
                      id={safeOptionId(listId, entry.id)}
                      role="option"
                      aria-selected={selectedEntry}
                      data-selected={selectedEntry || undefined}
                      className="palette__item"
                      onPointerMove={() => setSelected(index)}
                      onClick={() => commit(entry)}
                    >
                      <span className="palette__item-icon" aria-hidden="true">{entry.icon}</span>
                      <span className="palette__item-copy"><strong>{entry.label}</strong>{entry.description && <small>{entry.description}</small>}</span>
                      {entry.keys && <Kbd>{entry.keys.replace("Ctrl+", "Ctrl ")}</Kbd>}
                    </div>
                  );
                })}
              </section>
            ))}
            {resultModel.visible.length === 0 && (
              <div className="palette__empty" role="option" aria-disabled="true">
                <CommandIcon size={22} aria-hidden="true" />
                <strong>No results for “{query}”</strong>
                <span>Try a page, record, command, or setting name.</span>
              </div>
            )}
          </div>

          <div className="palette__footer" aria-hidden="true">
            <span><Kbd>↑↓</Kbd> Move</span>
            <span><Kbd><CornerDownLeft size={11} /></Kbd> Open</span>
            <span className="palette__footer-context">Searching from {currentWorkspace}</span>
          </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </CommandDialog>
  );
}
