import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Search, ShieldCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  DataTable,
  Input,
  KoraSelect,
  PageHeader,
  PageToolbar,
  Sheet,
} from "../../components/primitives";
import {
  runtime,
  type ConversationContextReference,
  type WellbeingDeletionOutcome,
  type WellbeingRecord,
  type WellbeingRecordChanges,
  type WellbeingRecordDraft,
  type WellbeingRecordKind,
  type WellbeingRecordPage,
  type WellbeingRecordRevision,
  type WellbeingRecordSource,
  type WellbeingSourceCoverage,
  RuntimeRequestError,
} from "../../lib/runtime";
import { StateView } from "../../components/display";
import {
  momentSummary,
  RecordDetailSheet,
  sourceLabel,
  WellbeingRecordEditor,
  type WellbeingTodayLoaders,
} from "./WellbeingTodayWorkspace";
import { WellbeingFrame } from "./WellbeingNavigation";
import { useWellbeingMutationKeys } from "./wellbeing-mutation-keys";
import { useWellbeingReturnContext, wellbeingRecordReturnId } from "./wellbeing-return-context";
import "./wellbeing-records.css";

type RecordsInput = {
  kinds?: WellbeingRecordKind[];
  sourceKinds?: WellbeingRecordSource["kind"][];
  privacy?: "private";
  state?: "active" | "archived";
  sort?: "recorded" | "updated";
  start?: string;
  end?: string;
  query?: string;
  pageSize?: number;
  cursor?: string;
};

export type WellbeingRecordsLoaders = Omit<WellbeingTodayLoaders, "list" | "read"> & {
  list: (input: RecordsInput) => Promise<WellbeingRecordPage>;
  read: (id: string) => Promise<{ record: WellbeingRecord; history: WellbeingRecordRevision[] }>;
};

const defaultLoaders: WellbeingRecordsLoaders = {
  sources: runtime.wellbeingSources,
  list: runtime.wellbeingRecords,
  read: runtime.wellbeingRecord,
  create: runtime.createWellbeingRecord,
  update: runtime.updateWellbeingRecord,
  archive: runtime.archiveWellbeingRecord,
  restore: runtime.restoreWellbeingRecord,
  delete: runtime.deleteWellbeingRecord,
  approve: runtime.approveToolConfirmation,
  reject: runtime.rejectToolConfirmation,
};

const KIND_OPTIONS = [
  ["all", "Every kind"], ["meal", "Meals"], ["drink", "Drinks"],
  ["observation", "Observations"], ["symptom", "Symptoms"],
  ["measurement", "Measurements"], ["medication_plan", "Medication plans"],
  ["dose", "Medication doses"], ["appointment", "Appointments"],
  ["care_document", "Care documents"], ["routine", "Routines"],
  ["routine_checkin", "Routine check-ins"], ["note", "Notes"],
] as const;
const SOURCE_OPTIONS = [
  ["all", "Every permitted source"], ["manual", "Added by you"],
  ["agent", "Added with Kora"], ["provider", "Saved provider records"],
  ["imported", "Imported records"],
] as const;
const DATE_OPTIONS = [
  ["all", "Any recorded date"], ["7d", "Past 7 days"],
  ["30d", "Past 30 days"], ["1y", "Past year"],
] as const;

function dateStart(range: string, now: Date) {
  if (range === "all") return undefined;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function kindLabel(kind: WellbeingRecordKind) {
  return KIND_OPTIONS.find(([value]) => value === kind)?.[1].replace(/s$/, "") ?? kind.replaceAll("_", " ");
}

function FilterControls({ values, onChange }: {
  values: { kind: string; date: string; source: string; state: string; sort: string };
  onChange: (key: string, value: string) => void;
}) {
  return <div className="wellbeing-records__filters">
    <KoraSelect label="Record kind" value={values.kind} onValueChange={(value) => onChange("kind", value)} options={KIND_OPTIONS.map(([value, label]) => ({ value, label }))} />
    <KoraSelect label="Recorded date" value={values.date} onValueChange={(value) => onChange("date", value)} options={DATE_OPTIONS.map(([value, label]) => ({ value, label }))} />
    <KoraSelect label="Record source" value={values.source} onValueChange={(value) => onChange("source", value)} options={SOURCE_OPTIONS.map(([value, label]) => ({ value, label }))} />
    <KoraSelect label="Record state" value={values.state} onValueChange={(value) => onChange("state", value)} options={[
      { value: "active", label: "Active records" }, { value: "archived", label: "Archived records" },
    ]} />
    <KoraSelect label="Record sort" value={values.sort} onValueChange={(value) => onChange("sort", value)} options={[
      { value: "recorded", label: "Newest recorded" }, { value: "updated", label: "Recently updated" },
    ]} />
  </div>;
}

function RevisionHistory({ history }: { history: WellbeingRecordRevision[] }) {
  if (!history.length) return <p className="wellbeing-records__history-empty">Revision history is unavailable for this record.</p>;
  return <section className="wellbeing-records__history" aria-labelledby="record-history-title">
    <div><h3 id="record-history-title">Revision history</h3><span>{history.length} saved {history.length === 1 ? "version" : "versions"}</span></div>
    <ol>{history.map((revision) => <li key={revision.version}>
      <span>v{revision.version}</span>
      <strong>{revision.action[0]?.toUpperCase()}{revision.action.slice(1)}</strong>
      <time dateTime={revision.recordedAt}>{dateTime(revision.recordedAt)}</time>
    </li>)}</ol>
  </section>;
}

export function WellbeingRecordsWorkspace({
  loaders = defaultLoaders,
  initialNow,
  onAskKora,
}: {
  loaders?: WellbeingRecordsLoaders;
  initialNow?: Date;
  onAskKora?: (reference?: ConversationContextReference, draft?: string) => void;
}) {
  const now = initialNow ?? new Date();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutationKeys = useWellbeingMutationKeys();
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const restrictedBoundaryRef = useRef<HTMLDivElement>(null);
  const deniedFocusKey = useRef<string | undefined>(undefined);
  const deniedSelectionId = useRef<string | undefined>(undefined);
  const deniedFocusFrame = useRef<number | null>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const routeOpenedHere = useRef(false);
  const bulkActionRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkAnnouncement, setBulkAnnouncement] = useState("");
  const [settlement, setSettlement] = useState("");
  const selectedId = params.get("record") ?? undefined;
  const editing = params.get("edit") === "1";
  const values = {
    kind: KIND_OPTIONS.some(([value]) => value === params.get("kind")) ? params.get("kind")! : "all",
    date: DATE_OPTIONS.some(([value]) => value === params.get("date")) ? params.get("date")! : "all",
    source: SOURCE_OPTIONS.some(([value]) => value === params.get("source")) ? params.get("source")! : "all",
    state: params.get("state") === "archived" ? "archived" : "active",
    sort: params.get("sort") === "updated" ? "updated" : "recorded",
  };
  const queryText = params.get("q")?.trim() ?? "";
  const cursor = params.get("cursor") ?? undefined;
  const [searchDraft, setSearchDraft] = useState(queryText);
  const resultsRef = useRef<HTMLDivElement>(null);
  const previousCursor = useRef(cursor);
  const pageTransitionPending = useRef(false);
  const [pageAnnouncement, setPageAnnouncement] = useState("");
  useEffect(() => setSearchDraft(queryText), [queryText]);
  useEffect(() => {
    if (!params.has("privacy")) return;
    const canonical = new URLSearchParams(params);
    canonical.delete("privacy");
    setParams(canonical, { replace: true });
  }, [params, setParams]);

  const setRoute = (changes: Record<string, string | undefined>, replace = false) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next, { replace });
  };
  const changeFilter = (key: string, value: string) => {
    setSelectedKeys(new Set());
    setBulkAnnouncement("");
    setRoute({
      [key]: value === "all" || (key === "state" && value === "active") || (key === "sort" && value === "recorded") ? undefined : value,
      cursor: undefined,
      record: undefined,
      edit: undefined,
    });
  };

  const input = useMemo<RecordsInput>(() => ({
    ...(values.kind !== "all" ? { kinds: [values.kind as WellbeingRecordKind] } : {}),
    ...(values.source !== "all" ? { sourceKinds: [values.source as WellbeingRecordSource["kind"]] } : {}),
    state: values.state as "active" | "archived",
    sort: values.sort as "recorded" | "updated",
    ...(dateStart(values.date, now) ? { start: dateStart(values.date, now) } : {}),
    ...(queryText ? { query: queryText } : {}),
    pageSize: 50,
    ...(cursor ? { cursor } : {}),
  }), [cursor, now, queryText, values.date, values.kind, values.sort, values.source, values.state]);

  const records = useQuery({
    queryKey: ["wellbeing", "records", input],
    queryFn: async () => {
      const page = await loaders.list(input);
      const items = page.items.filter((record) => record.privacy !== "restricted");
      return {
        ...page,
        items,
        restrictedOmitted: page.restrictedOmitted || items.length !== page.items.length,
      };
    },
    retry: false,
  });
  const selected = useQuery({
    queryKey: ["wellbeing", "record", selectedId, "ordinary"],
    queryFn: async () => {
      const detail = await loaders.read(selectedId!);
      if (detail.record.privacy === "restricted") {
        throw new RuntimeRequestError("This Wellbeing record is not available in this view.", {
          code: "wellbeing_restricted_visual_read_unavailable",
          status: 403,
        });
      }
      return detail;
    },
    enabled: Boolean(selectedId),
    retry: false,
  });
  const rows = useMemo(() => {
    const byId = new Map<string, WellbeingRecord>();
    for (const record of records.data?.items ?? []) {
      const current = byId.get(record.id);
      if (!current || record.version >= current.version) byId.set(record.id, record);
    }
    return [...byId.values()];
  }, [records.data]);
  const activeFilterCount = [values.kind !== "all", values.date !== "all", values.source !== "all", values.state !== "active", values.sort !== "recorded"].filter(Boolean).length;
  const wellbeingReturn = useWellbeingReturnContext({
    ready: Boolean(records.data),
    rootSelector: ".wellbeing-records-workspace",
    fallbackRef: searchInput,
    restoreKey: rows.map((record) => `${record.id}:${record.version}`).join("|"),
  });

  useEffect(() => {
    if (previousCursor.current === cursor) return;
    previousCursor.current = cursor;
    pageTransitionPending.current = true;
    setPageAnnouncement("");
  }, [cursor]);

  useEffect(() => {
    if (!pageTransitionPending.current || records.isFetching || !records.data) return;
    pageTransitionPending.current = false;
    requestAnimationFrame(() => {
      const firstRecord = resultsRef.current?.querySelector<HTMLAnchorElement>("[data-row-link]");
      firstRecord?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      setPageAnnouncement(`Page changed. ${records.data.items.length} permitted ${records.data.items.length === 1 ? "record" : "records"} shown.`);
    });
  }, [records.data, records.isFetching]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "records"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "record"] }),
    ]);
  };
  const closeRecord = () => {
    const id = selectedId;
    if (routeOpenedHere.current || wellbeingReturn.returnRoute) {
      routeOpenedHere.current = false;
      navigate(-1);
    } else setRoute({ record: undefined, edit: undefined }, true);
    wellbeingReturn.focusReturnTarget(id ? wellbeingRecordReturnId(id) : undefined);
  };
  const openRecordFromTable = (event: ReactMouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-row-return-id]");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    const returnId = anchor.dataset.rowReturnId;
    const recordId = returnId?.startsWith("record:") ? returnId.slice("record:".length) : undefined;
    if (!returnId || !recordId) return;
    event.preventDefault();
    routeOpenedHere.current = true;
    wellbeingReturn.rememberAndOpenQuery({ record: recordId, edit: undefined }, returnId);
  };
  const editorLoaders: WellbeingTodayLoaders = {
    ...loaders,
    list: (listInput) => loaders.list(listInput),
    read: async (id) => loaders.read(id),
  };
  const deletion = loaders.delete && loaders.approve && loaders.reject ? {
    request: (record: WellbeingRecord, requestKey: string) => loaders.delete!(record.id, record.version, requestKey),
    approve: loaders.approve,
    reject: loaders.reject,
    onDeleted: async (record: WellbeingRecord, outcome: Extract<WellbeingDeletionOutcome, { status: "settled" | "gone" }>) => {
      await refresh();
      closeRecord();
      setSettlement(outcome.status === "gone" ? `${record.title} was already gone.` : `${record.title} deleted permanently.`);
    },
    onStale: async (record: WellbeingRecord) => {
      await refresh();
      setSettlement(`${record.title} changed. Review the latest version before deleting.`);
    },
  } : undefined;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSelectedKeys(new Set());
    setBulkAnnouncement("");
    setRoute({ q: searchDraft.trim() || undefined, cursor: undefined, record: undefined, edit: undefined });
  };
  const controls = <FilterControls values={values} onChange={changeFilter} />;
  const filtered = Boolean(queryText || activeFilterCount);
  const selectedRecords = rows.filter((record) => selectedKeys.has(record.id));
  const runBulkStateChange = async () => {
    if (!selectedRecords.length || bulkPending) return;
    setBulkPending(true);
    setBulkAnnouncement("");
    const operation = values.state === "archived" ? "restore" : "archive";
    const results = await Promise.allSettled(selectedRecords.map((record) => operation === "restore"
      ? loaders.restore(
          record.id,
          record.version,
          mutationKeys.acquire("restore", record.id, record.version),
        )
      : loaders.archive(
          record.id,
          record.version,
          mutationKeys.acquire("archive", record.id, record.version),
        )));
    results.forEach((result, index) => {
      if (result.status === "fulfilled")
        mutationKeys.settle(operation, selectedRecords[index]!.id);
    });
    const failed = new Set(selectedRecords.filter((_, index) => results[index]?.status === "rejected").map((record) => record.id));
    const completed = results.length - failed.size;
    await refresh();
    setSelectedKeys(failed);
    setBulkPending(false);
    setBulkAnnouncement(failed.size
      ? `${completed} ${completed === 1 ? "record" : "records"} ${operation === "restore" ? "restored" : "archived"}. ${failed.size} could not be changed and ${failed.size === 1 ? "remains" : "remain"} selected.`
      : `${completed} ${completed === 1 ? "record" : "records"} ${operation === "restore" ? "restored" : "archived"}.`);
    requestAnimationFrame(() => {
      if (failed.size) bulkActionRef.current?.focus();
      else resultsRef.current?.querySelector<HTMLAnchorElement>("[data-row-link]")?.focus({ preventScroll: true });
    });
  };
  const state = records.isError ? {
    mode: rows.length ? "advisory" as const : "replacement" as const,
    announcement: "assertive" as const,
    kind: "error" as const,
    title: "Records could not be read",
    description: records.error instanceof Error ? records.error.message : "Saved Wellbeing records are unavailable.",
    action: <Button onClick={() => records.refetch()}>Try again</Button>,
  } : !records.isLoading && rows.length === 0 ? {
    mode: "replacement" as const,
    kind: filtered ? "filtered-empty" as const : "empty" as const,
    title: filtered ? "No permitted records match" : values.state === "archived" ? "No archived records" : "No Wellbeing records yet",
    description: filtered ? "Adjust the filters or search. Restricted records remain omitted." : values.state === "archived" ? "Records you archive will remain recoverable here." : "Records logged in Today, Food, Care, and Routines will appear here for review and correction.",
    action: filtered
      ? <Button onClick={() => { setSearchDraft(""); setParams(new URLSearchParams(), { replace: false }); }}>Clear filters</Button>
      : values.state === "archived"
        ? undefined
        : <Button tone="ghost" onClick={() => navigate("/life/wellbeing")}>Open Today</Button>,
  } : undefined;
  const selectedErrorCode = selected.error && typeof selected.error === "object" && "code" in selected.error ? String(selected.error.code) : undefined;
  const restrictedRequired = selected.isError && (
    selectedErrorCode === "wellbeing_restricted_visual_read_unavailable"
    || (selectedErrorCode === "wellbeing_record_not_found" && records.data?.restrictedOmitted === true)
  );
  const restrictedPending = selected.isError && selectedErrorCode === "wellbeing_record_not_found" && !records.data && records.isLoading;
  const suppressRecordDetail = restrictedRequired || restrictedPending;
  const deniedFocusKeyValue = restrictedRequired && selectedId
    ? `${selectedId}:${selectedErrorCode ?? "restricted"}`
    : undefined;
  useLayoutEffect(() => {
    if (deniedSelectionId.current !== selectedId) {
      deniedSelectionId.current = selectedId;
      deniedFocusKey.current = undefined;
    }
    if (!deniedFocusKeyValue || deniedFocusKey.current === deniedFocusKeyValue) return;
    deniedFocusKey.current = deniedFocusKeyValue;
    const active = document.activeElement;
    if (active !== document.body && !active?.closest("[data-row-link]")) return;
    const frame = requestAnimationFrame(() => {
      deniedFocusFrame.current = null;
      const currentActive = document.activeElement;
      if (currentActive === document.body || currentActive?.closest("[data-row-link]"))
        restrictedBoundaryRef.current?.focus({ preventScroll: true });
    });
    deniedFocusFrame.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      if (deniedFocusFrame.current === frame) deniedFocusFrame.current = null;
    };
  }, [deniedFocusKeyValue]);
  const selectedPresentation = suppressRecordDetail ? undefined : selected.data;
  const returnFromDenied = () => {
    routeOpenedHere.current = false;
    setRoute({ record: undefined, edit: undefined }, true);
    requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }));
  };

  return <section className="wellbeing-records-workspace">
    <WellbeingFrame>
      <PageHeader
        title="Records"
        description="Your saved Wellbeing history—searchable, correctable, and recoverable."
        status={<><span>Detailed audit view</span><span aria-hidden="true">·</span><span>Restricted records never appear in ordinary results or counts.</span></>}
      />
      {settlement ? <div className="wellbeing-settlement" role="status"><ShieldCheck size={15} /><span>{settlement}</span></div> : null}
      {selectedId && restrictedRequired ? (
        <div
          ref={restrictedBoundaryRef}
          className="wellbeing-records__restricted-boundary"
          tabIndex={-1}
          role="region"
          aria-label="Record access boundary"
        >
          <StateView
            className="wellbeing-records__restricted-state"
            state="denied"
            title="This record cannot be shown"
            body="Restricted records have no visual reader here. Their title, value, history, and controls remain hidden."
            action={
              <>
                {onAskKora ? (
                  <Button onClick={() => onAskKora(
                    { kind: "wellbeing_record", id: selectedId, title: "Restricted wellbeing record" },
                    "Help me review this restricted Wellbeing record after the shared one-time context approval. Do not reveal or infer anything before that approval.",
                  )}>
                    Attach permitted record to Kora
                  </Button>
                ) : null}
                <Button tone="ghost" onClick={returnFromDenied}>Return to Records</Button>
              </>
            }
          />
        </div>
      ) : null}
      <section className="wellbeing-records__toolbar" aria-label="Record search and filters">
        <div className="wellbeing-records__trust" role="note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span><strong>Private by default.</strong> Search and filters include records beyond the rows on this page.</span>
          {records.data?.restrictedOmitted ? <em>Restricted records omitted</em> : null}
        </div>
        <PageToolbar
          density="compact"
          search={<form className="wellbeing-records__search" role="search" onSubmit={submitSearch}>
            <Search size={16} aria-hidden="true" />
            <Input ref={searchInput} data-wellbeing-return-fallback aria-label="Search Wellbeing records" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search saved titles and details" />
            <Button type="submit">Search</Button>
          </form>}
          compactControls={<Button ref={filterTrigger} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog"><Filter size={16} />Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</Button>}
        />
        <section className="wellbeing-records__filters-wide" aria-label="Record filters">
          <FilterControls values={values} onChange={changeFilter} />
        </section>
      </section>
      <div ref={resultsRef} onClickCapture={openRecordFromTable}>
      <DataTable
        rows={rows}
        loading={records.isLoading}
        state={state}
        rowKey={(record) => record.id}
        href={(record) => {
          const next = new URLSearchParams(params); next.set("record", record.id); next.delete("edit");
          return `/life/wellbeing/records?${next}`;
        }}
        returnId={(record) => wellbeingRecordReturnId(record.id)}
        caption="Wellbeing records"
        selection={{
          scope: "page",
          scopeKey: JSON.stringify([queryText, values.kind, values.date, values.source, values.state, values.sort, cursor]),
          selected: selectedKeys,
          onChange: (next) => { setSelectedKeys(next); setBulkAnnouncement(""); },
          label: (record) => `Select ${record.title}`,
          actions: <>
            <Button ref={bulkActionRef} tone="secondary" loading={bulkPending} onClick={runBulkStateChange}>
              {values.state === "archived" ? "Restore selected" : "Archive selected"}
            </Button>
            <Button tone="ghost" disabled={bulkPending} onClick={() => { setSelectedKeys(new Set()); setBulkAnnouncement("Selection cleared."); }}>Clear selection</Button>
          </>,
        }}
        columns={[
          { key: "summary", header: "Record", width: "auto", cellText: (record) => `Open ${record.title}`, cell: (record) => <span className="wellbeing-records__subject"><strong>{record.title}</strong><small>{momentSummary(record)}{record.state === "archived" ? <span className="wellbeing-records__state">Archived</span> : null}</small></span> },
          { key: "date", header: values.sort === "updated" ? "Updated" : "Recorded", width: "22ch", cell: (record) => <time className="wellbeing-records__date" dateTime={values.sort === "updated" ? record.updatedAt : record.recordedAt}>{dateTime(values.sort === "updated" ? record.updatedAt : record.recordedAt)}</time> },
          { key: "kind", header: "Kind", width: "16ch", cell: (record) => <span className="wellbeing-records__metadata">{kindLabel(record.kind)}</span> },
          { key: "source", header: "Source", width: "26ch", cell: (record) => <span className="wellbeing-records__metadata">{sourceLabel(record)}</span>, wideOnly: true },
        ]}
        mobileSummary={(record) => <span className="wellbeing-records__row-meta">{dateTime(record.recordedAt)} · {kindLabel(record.kind)}<br />{sourceLabel(record)}{record.state === "archived" ? " · Archived" : ""}</span>}
        intermediateSummary={(record) => <span className="wellbeing-records__row-meta">{sourceLabel(record)}{record.state === "archived" ? " · Archived" : ""}</span>}
        summary={records.data ? `${rows.length} permitted ${rows.length === 1 ? "record" : "records"} on this page${records.data.complete ? " · end of results" : " · more available"}` : undefined}
        onPreviousPage={cursor ? () => { setSelectedKeys(new Set()); setBulkAnnouncement(""); navigate(-1); } : undefined}
        onLoadMore={records.data?.cursor ? () => { setSelectedKeys(new Set()); setBulkAnnouncement(""); setRoute({ cursor: records.data!.cursor, record: undefined, edit: undefined }); } : undefined}
        loadingMore={records.isFetching}
        loadMoreLabel="Next page"
      />
      <span className="sr-only" role="status" aria-live="polite">{pageAnnouncement}</span>
      {bulkAnnouncement ? <span className="sr-only" role="status" aria-live="polite">{bulkAnnouncement}</span> : null}
      </div>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} purpose="properties" title="Filter records" description="Narrow the full Wellbeing collection." closeLabel="Close record filters" finalFocus={filterTrigger} actions={<Button onClick={() => setFiltersOpen(false)}>Show records</Button>}>
        <div className="wellbeing-records__filter-sheet">{controls}</div>
      </Sheet>
      {!suppressRecordDetail ? <RecordDetailSheet
        record={selectedPresentation?.record}
        loading={selected.isLoading}
        error={selected.isError}
        open={Boolean(selectedId && !editing && !suppressRecordDetail)}
        onClose={closeRecord}
        onEdit={(trigger) => { editorTrigger.current = trigger ?? null; setRoute({ edit: "1" }, true); }}
        onArchive={async (record) => {
          const result = await loaders.archive(
            record.id,
            record.version,
            mutationKeys.acquire("archive", record.id, record.version),
          );
          mutationKeys.settle("archive", record.id);
          await refresh();
          setSettlement(`${record.title} archived.`);
          return result.record;
        }}
        onRestore={async (record) => {
          const result = await loaders.restore(
            record.id,
            record.version,
            mutationKeys.acquire("restore", record.id, record.version),
          );
          mutationKeys.settle("restore", record.id);
          await refresh();
          setSettlement(`${record.title} restored.`);
          return result.record;
        }}
        onDelete={deletion}
        onAskKora={onAskKora ? (record) => onAskKora({ kind: "wellbeing_record", id: record.id, title: record.title }, "Help me review this saved Wellbeing record. Distinguish what is recorded from interpretation and preserve its privacy boundary.") : undefined}
        detailSupplement={() => <RevisionHistory history={selectedPresentation?.history ?? []} />}
        returnLabel="Records"
        chromeTitle="Record detail"
        closeLabel="Close record detail"
        unavailableBody="This record is missing, restricted, deleted, or unavailable. No title or value-derived detail has been disclosed."
      /> : null}
      <WellbeingRecordEditor
        finalFocus={editorTrigger}
        open={Boolean(selectedPresentation?.record && editing)}
        kind={selectedPresentation?.record.kind ?? "note"}
        record={selectedPresentation?.record}
        now={now}
        onClose={() => setRoute({ edit: undefined }, true)}
        loaders={editorLoaders}
        onSaved={async (record) => {
          await refresh();
          if (record.privacy === "restricted") setRoute({ record: undefined, edit: undefined }, true);
          else setRoute({ record: record.id, edit: undefined }, true);
        }}
      />
    </WellbeingFrame>
  </section>;
}
