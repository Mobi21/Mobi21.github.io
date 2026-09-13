import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "./button";
import { CheckboxControl } from "./form";
import { ContentState } from "./display";
import "./collections.css";

export type DataColumn<Row> = {
  key: string;
  header: string;
  width?: "min" | "auto" | `${number}ch` | `${number}rem` | `${number}%`;
  align?: "start" | "end";
  cell: (row: Row) => ReactNode;
  cellText?: (row: Row) => string;
  wideOnly?: boolean;
  sortable?: boolean;
};

export type DataSort = { key: string; direction: "asc" | "desc" };

export type DataTableState = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  announcement?: "off" | "polite" | "assertive";
} & (
  | { mode: "replacement"; kind: "empty" | "filtered-empty" | "partial" | "stale" | "unavailable" | "restricted" | "error" | "offline" }
  | { mode: "advisory"; kind: "partial" | "stale" | "error" | "offline" }
);

export type DataTableProps<Row> = {
  rows: readonly Row[];
  columns: readonly DataColumn<Row>[];
  rowKey: (row: Row) => string;
  returnId?: (row: Row) => string;
  activeRowKey?: string;
  sort?: DataSort;
  onSortChange?: (sort: DataSort) => void;
  caption: string;
  mobileSummary: (row: Row) => ReactNode;
  intermediateSummary?: (row: Row) => ReactNode;
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (next: ReadonlySet<string>) => void;
    label: (row: Row) => string;
    actions?: ReactNode;
    /** The caller supplies the full authoritative scope, not just mounted rows. */
    scope: "loaded" | "page";
    /** Filter identity; include the server cursor for page-scoped selection. */
    scopeKey: string;
    isEligible?: (row: Row) => boolean;
  };
  loading?: boolean;
  loadingRows?: number;
  state?: DataTableState;
  summary?: ReactNode;
  onPreviousPage?: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  loadMoreLabel?: string;
  /**
   * Bounds mounted records while preserving the complete loaded collection for
   * selection and pagination. Callers with large, cursor-backed collections
   * should choose a window that fits their working viewport.
   */
  windowSize?: number;
} & (
  | { href: (row: Row) => string; onOpen?: never; openLabel?: never }
  | { href?: never; onOpen: (row: Row) => void; openLabel: (row: Row) => string }
);

const widthStyle = (width: DataColumn<unknown>["width"]): CSSProperties | undefined => {
  if (!width || width === "auto") return undefined;
  if (width === "min") return { width: "1%", whiteSpace: "nowrap" };
  return { width };
};

/**
 * Kora's semantic dense-record table.
 *
 * The first column is the row subject and owns the record activation. At compact
 * width the comparison cells are replaced by one caller-authored summary cell,
 * preserving meaning without squeezing a desktop table or cardifying records.
 */
export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  href,
  onOpen,
  openLabel,
  returnId,
  activeRowKey,
  sort,
  onSortChange,
  caption,
  mobileSummary,
  intermediateSummary,
  selection,
  loading = false,
  loadingRows = 8,
  state,
  summary,
  onPreviousPage,
  onLoadMore,
  loadingMore = false,
  loadMoreLabel = "Load more",
  windowSize,
}: DataTableProps<Row>) {
  const [windowStart, setWindowStart] = useState(0);
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
  const [retainLoadTrigger, setRetainLoadTrigger] = useState(false);
  const previousCount = useRef(rows.length);
  const previousFirstKey = useRef<string | undefined>(undefined);
  const pendingLoadCount = useRef<number | null>(null);
  const loadMoreOwnsFocus = useRef(false);
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
  const previousScope = useRef(selection?.scopeKey);
  const previousSelectionCount = useRef(selection?.selected.size ?? 0);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const [subject, ...comparisons] = columns;
  const sortedColumn = columns.find((column) => column.key === sort?.key);
  const loadedKeys = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const replacement = state?.mode === "replacement";
  const eligibleKeys = new Set(replacement ? [] : rows.filter((row) => !selection?.isEligible || selection.isEligible(row)).map(rowKey));
  const scopeChanged = previousScope.current !== selection?.scopeKey;
  const selectedKeys = new Set(scopeChanged ? [] : [...(selection?.selected ?? [])].filter((key) => eligibleKeys.has(key)));
  const allSelected = Boolean(selection && eligibleKeys.size > 0 && selectedKeys.size === eligibleKeys.size);
  const someSelected = Boolean(selection && !allSelected && selectedKeys.size > 0);
  const boundedWindowSize = windowSize && windowSize > 0 ? Math.floor(windowSize) : undefined;
  const maxWindowStart = boundedWindowSize ? Math.max(0, Math.floor((rows.length - 1) / boundedWindowSize) * boundedWindowSize) : 0;
  const normalizedWindowStart = boundedWindowSize ? Math.min(windowStart, maxWindowStart) : 0;
  const visibleRows = boundedWindowSize ? rows.slice(normalizedWindowStart, normalizedWindowStart + boundedWindowSize) : rows;
  const visibleStart = visibleRows.length ? normalizedWindowStart + 1 : 0;
  const visibleEnd = normalizedWindowStart + visibleRows.length;
  const isWindowed = Boolean(boundedWindowSize && rows.length > boundedWindowSize);
  const canShowPreviousRows = isWindowed && normalizedWindowStart > 0;
  const canShowNextRows = isWindowed && visibleEnd < rows.length;
  const visibleKeys = new Set(visibleRows.map(rowKey));
  const offscreenSelected = [...selectedKeys].filter((key) => !visibleKeys.has(key)).length;

  useEffect(() => {
    const beforeCount = previousSelectionCount.current;
    const hadSelection = beforeCount > 0;
    previousSelectionCount.current = selection?.selected.size ?? 0;
    previousScope.current = selection?.scopeKey;
    if (!selection) return;
    if (!scopeChanged && selection.selected.size > beforeCount) setSelectionAnnouncement("");
    if (scopeChanged && hadSelection) setSelectionAnnouncement("Selection cleared for the new results.");
    const next = scopeChanged ? new Set<string>() : new Set([...selection.selected].filter((key) => eligibleKeys.has(key)));
    if (next.size === selection.selected.size) return;
    selection.onChange(next);
    setSelectionAnnouncement(scopeChanged ? "Selection cleared for the new results." : "Selection updated to include only available, eligible rows.");
  }, [selection, scopeChanged, eligibleKeys]);

  const changeSort = (column: DataColumn<Row>) => {
    if (!column.sortable || !onSortChange) return;
    const direction = sort?.key === column.key && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ key: column.key, direction });
  };

  useEffect(() => {
    const firstKey = loadedKeys[0];
    // A locally sorted append may change the first key. It is still the same
    // load operation, so preserve its announcement and focused trigger.
    const appendedToPendingLoad = pendingLoadCount.current !== null && rows.length > pendingLoadCount.current;
    if (previousFirstKey.current !== undefined && previousFirstKey.current !== firstKey) {
      setWindowStart(0);
      if (!appendedToPendingLoad) {
        setRetainLoadTrigger(false);
        pendingLoadCount.current = null;
        loadMoreOwnsFocus.current = false;
      }
    } else if (windowStart > maxWindowStart) {
      setWindowStart(maxWindowStart);
    }
    previousFirstKey.current = firstKey;

    const before = pendingLoadCount.current ?? previousCount.current;
    previousCount.current = rows.length;
    if (pendingLoadCount.current === null || rows.length <= before) return;
    const appended = rows.length - before;
    pendingLoadCount.current = null;
    setLoadAnnouncement(`${appended} ${appended === 1 ? "row" : "rows"} added. ${rows.length} loaded.`);
    if (loadMoreOwnsFocus.current) requestAnimationFrame(() => loadMoreButtonRef.current?.focus());
  }, [loadedKeys, maxWindowStart, rows.length, windowStart]);

  if (!subject) return null;
  const initialLoading = loading && !rows.length;

  return (
    <section className="k-dense-data" aria-label={caption} aria-busy={loading || undefined} data-has-selection={selection ? "true" : undefined}>
      {loading ? <span className="sr-only" role="status" aria-live="polite">Loading {caption}</span> : null}
      <span className="sr-only" aria-live="polite">{selectionAnnouncement}</span>
      <span className="sr-only" aria-live="polite">{sort && sortedColumn ? `Sort: ${sortedColumn.header}, ${sort.direction === "asc" ? "ascending" : "descending"}.` : ""}</span>
      {state?.mode === "advisory" ? <ContentState state={state.kind} title={state.title} body={state.description} action={state.action} size="inline" announcement={state.announcement ?? "off"} /> : null}
      {selection && selectedKeys.size > 0 ? (
        <div className="k-dense-data__selection" role="status" aria-live="polite">
          <strong>{selectedKeys.size} selected{offscreenSelected ? ` · ${offscreenSelected} outside visible rows` : ""}</strong>
          {selection.actions ? <div>{selection.actions}</div> : null}
        </div>
      ) : null}
      {onSortChange && columns.some((column) => column.sortable) ? <div className="k-dense-data__compact-sort" role="group" aria-label="Sort results">
        {columns.filter((column) => column.sortable).map((column) => <Button key={column.key} tone="ghost" aria-label={`Sort by ${column.header}`} aria-pressed={sort?.key === column.key} onClick={() => changeSort(column)}>{column.header}{sort?.key === column.key ? <span aria-hidden="true">{sort.direction === "asc" ? " ↑" : " ↓"}</span> : null}</Button>)}
      </div> : null}
      <div className="k-dense-data__viewport">
        <table className="k-dense-data__table" data-has-intermediate-summary={intermediateSummary ? "true" : undefined} aria-rowcount={replacement ? undefined : rows.length + 1}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {selection ? <col className="k-dense-data__select-column" /> : null}
            {columns.map((column) => <col key={column.key} data-wide-only={column.wideOnly || undefined} style={widthStyle(column.width)} />)}
            <col className="k-dense-data__compact-column" />
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              {selection ? (
                <th scope="col" className="k-dense-data__select-cell">
                  <CheckboxControl
                    checked={allSelected}
                    indeterminate={someSelected}
                    disabled={!eligibleKeys.size}
                    label={allSelected ? "Clear selection" : selection.scope === "page" ? "Select all rows on this page" : "Select all loaded rows"}
                    onCheckedChange={(checked) => selection.onChange(checked ? new Set(eligibleKeys) : new Set())}
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-wide-only={column.wideOnly || undefined}
                  data-align={column.align ?? "start"}
                  aria-sort={column.sortable && onSortChange ? sort?.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none" : undefined}
                >
                  {column.sortable && onSortChange ? <button type="button" className="k-dense-data__sort" onClick={() => changeSort(column)}>{column.header}{sort?.key === column.key ? <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span> : null}</button> : column.header}
                </th>
              ))}
              <th scope="col" className="k-dense-data__compact-head">Details</th>
            </tr>
          </thead>
          <tbody>
            {initialLoading ? Array.from({ length: loadingRows }, (_, index) => (
              <tr key={`loading-${index}`} className="k-dense-data__skeleton-row" aria-hidden="true">
                {selection ? <td className="k-dense-data__select-cell"><span /></td> : null}
                {columns.map((column) => <td key={column.key} data-wide-only={column.wideOnly || undefined}><span /></td>)}
                <td className="k-dense-data__compact-summary"><span /></td>
              </tr>
            )) : null}
            {!initialLoading && !replacement ? visibleRows.map((row, visibleIndex) => {
              const key = rowKey(row);
              const selected = selectedKeys.has(key);
              return (
                <tr key={key} data-selected={selected || undefined} data-active={activeRowKey === key || undefined} aria-rowindex={normalizedWindowStart + visibleIndex + 2}>
                  {selection ? (
                    <td className="k-dense-data__select-cell">
                      <CheckboxControl
                        checked={selected}
                        disabled={!eligibleKeys.has(key)}
                        label={selection.label(row)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedKeys);
                          if (checked) next.add(key); else next.delete(key);
                          selection.onChange(next);
                        }}
                      />
                    </td>
                  ) : null}
                  <th scope="row">
                    {href ? <Link to={href(row)} data-row-link="" data-row-return-id={returnId?.(row)} aria-label={subject.cellText?.(row)}>
                      {subject.cell(row)}
                    </Link> : <button type="button" className="k-dense-data__open" data-row-return-id={returnId?.(row)} aria-label={openLabel(row)} aria-pressed={activeRowKey === key} onClick={() => onOpen(row)}>{subject.cell(row)}</button>}
                  </th>
                  {comparisons.map((column) => (
                    <td
                      key={column.key}
                      data-wide-only={column.wideOnly || undefined}
                      data-align={column.align ?? "start"}
                      aria-label={column.cellText?.(row)}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  <td className="k-dense-data__compact-summary" data-intermediate={intermediateSummary ? "true" : undefined}>
                    <span className="k-dense-data__mobile-meta">{mobileSummary(row)}</span>
                    {intermediateSummary ? <span className="k-dense-data__intermediate-meta">{intermediateSummary(row)}</span> : null}
                  </td>
                </tr>
              );
            }) : null}
          </tbody>
        </table>
        {!initialLoading && replacement && state ? (
          <ContentState state={state.kind} title={state.title} body={state.description} action={state.action} size="section" announcement={state.announcement ?? "off"} />
        ) : null}
      </div>
      {state?.kind !== "restricted" && (summary || (!replacement && (isWindowed || onPreviousPage || onLoadMore || retainLoadTrigger))) ? (
        <footer className="k-dense-data__footer">
          <span className="k-dense-data__summary">
            {summary ? <span>{summary}</span> : null}
            {isWindowed && !replacement ? <span>Showing {visibleRows.length} {visibleRows.length === 1 ? "row" : "rows"} · {visibleStart}–{visibleEnd} of {rows.length} loaded</span> : null}
          </span>
          {!replacement && (canShowPreviousRows || canShowNextRows || onPreviousPage || onLoadMore || retainLoadTrigger) ? <div className="k-dense-data__pagination">
            {canShowPreviousRows ? <Button onClick={() => setWindowStart((current) => Math.max(0, current - boundedWindowSize!))}>Previous loaded rows</Button> : null}
            {canShowNextRows ? <Button onClick={() => setWindowStart((current) => Math.min(maxWindowStart, current + boundedWindowSize!))}>Next loaded rows</Button> : null}
            {onPreviousPage ? <Button disabled={loadingMore} onClick={onPreviousPage}>Previous page</Button> : null}
            {(onLoadMore || retainLoadTrigger) ? <Button
              ref={loadMoreButtonRef}
              aria-busy={loadingMore || undefined}
              aria-disabled={loadingMore || !onLoadMore || undefined}
              onBlur={() => { loadMoreOwnsFocus.current = false; }}
              onClick={() => {
                if (!onLoadMore || loadingMore) return;
                pendingLoadCount.current = rows.length;
                loadMoreOwnsFocus.current = true;
                setRetainLoadTrigger(true);
                setLoadAnnouncement("");
                onLoadMore();
              }}
            >{loadingMore ? "Loading…" : onLoadMore ? loadMoreLabel : "All loaded"}</Button> : null}
          </div> : null}
          <span className="sr-only" aria-live="polite">{loadAnnouncement}</span>
        </footer>
      ) : null}
    </section>
  );
}
