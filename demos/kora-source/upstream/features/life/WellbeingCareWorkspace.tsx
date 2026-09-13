import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarDays, ChevronRight, CircleAlert, ClipboardPlus, FileText, HeartPulse, Pill, Plus, Ruler, ShieldCheck, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Disclosure, KoraSelect, PageHeader, Pressable, Sheet, StateView } from "../../components/primitives";
import { runtime, type ConversationContextReference, type WellbeingRecord, type WellbeingRecordKind, type WellbeingSourceCoverage } from "../../lib/runtime";
import { RecordDetailSheet, sourceLabel, WellbeingRecordEditor, type WellbeingTodayLoaders } from "./WellbeingTodayWorkspace";
import { WellbeingFrame } from "./WellbeingNavigation";
import { useWellbeingReturnContext, wellbeingRecordReturnId } from "./wellbeing-return-context";
import { useWellbeingMutationKeys } from "./wellbeing-mutation-keys";
import "./wellbeing-today.css";
import "./wellbeing-care.css";

export const CARE_KINDS: WellbeingRecordKind[] = ["observation", "symptom", "measurement", "medication_plan", "dose", "appointment", "care_document"];
const CARE_PAGE_SIZE = 50;
const CARE_RENDER_LIMIT = 100;
const CARE_EXACT_MEASUREMENT_LIMIT = 12;
const CARE_NON_MEASUREMENT_LIMIT = 36;

type CareChronologyItem =
  | { kind: "record"; record: WellbeingRecord; moment: string }
  | { kind: "measurement_summary"; id: string; metric: string; unit: string; records: WellbeingRecord[]; moment: string };

const defaultLoaders: WellbeingTodayLoaders = {
  sources: runtime.wellbeingSources, list: runtime.wellbeingRecords, read: runtime.wellbeingRecord,
  create: runtime.createWellbeingRecord, update: runtime.updateWellbeingRecord,
  archive: runtime.archiveWellbeingRecord, restore: runtime.restoreWellbeingRecord,
  delete: runtime.deleteWellbeingRecord, approve: runtime.approveToolConfirmation, reject: runtime.rejectToolConfirmation,
};

const meta: Record<string, { label: string; plural: string; icon: ReactNode; chooser: string }> = {
  observation: { label: "Observation", plural: "Observations", icon: <Activity size={16} />, chooser: "A personal observation in your own words" },
  symptom: { label: "Symptom", plural: "Symptoms", icon: <Stethoscope size={16} />, chooser: "What you noticed and optional recorded intensity" },
  measurement: { label: "Measurement", plural: "Measurements", icon: <Ruler size={16} />, chooser: "A value, unit, time, and source" },
  medication_plan: { label: "Medication plan", plural: "Medication plans", icon: <Pill size={16} />, chooser: "Instructions and schedule exactly as recorded" },
  dose: { label: "Dose event", plural: "Dose events", icon: <HeartPulse size={16} />, chooser: "A user-recorded taken, skipped, or missed status" },
  appointment: { label: "Appointment", plural: "Appointments", icon: <CalendarDays size={16} />, chooser: "A scheduled visit and preparation note" },
  care_document: { label: "Care document", plural: "Care documents", icon: <FileText size={16} />, chooser: "A saved document name and optional reference" },
};
const filterOptions = [{ value: "all", label: "All care" }, ...CARE_KINDS.map((kind) => ({ value: kind, label: meta[kind].plural }))];

function supportedCareKind(value: string | null): WellbeingRecordKind | null {
  return value && CARE_KINDS.includes(value as WellbeingRecordKind) ? value as WellbeingRecordKind : null;
}
function actualMoment(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>;
  return record.kind === "appointment" && typeof payload.startsAt === "string" ? payload.startsAt : record.recordedAt;
}
function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayHeading(value: string, now: Date) {
  const today = dayKey(now.toISOString()), tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString());
  if (dayKey(value) === today) return "Today";
  if (dayKey(value) === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(value));
}
function formatMoment(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function recordQualifier(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>;
  if (record.kind === "observation") { const value = typeof payload.value === "string" && payload.value.trim() ? payload.value : String(payload.category ?? "Recorded observation"); return payload.rating ? `${value} · Rating ${payload.rating} of 5` : value; }
  if (record.kind === "symptom") return `${String(payload.name ?? record.title)}${payload.severity ? ` · Recorded intensity ${payload.severity} of 5` : ""}`;
  if (record.kind === "measurement") return `${payload.value ?? "Value unavailable"}${payload.unit ? ` ${payload.unit}` : ""}`;
  if (record.kind === "dose") return `Recorded status: ${String(payload.status ?? "not set")} · ${String(payload.medication ?? record.title)}`;
  if (record.kind === "medication_plan") return `${String(payload.medication ?? record.title)} · ${payload.active === false ? "Inactive" : "Active"} recorded plan`;
  if (record.kind === "appointment") return String(payload.clinician ?? payload.specialty ?? "Recorded appointment");
  if (record.kind === "care_document") return String(payload.name ?? record.title);
  return "Saved care record";
}
function dedupeRecords(pages: Array<{ items: WellbeingRecord[] }>) {
  const byId = new Map<string, WellbeingRecord>();
  for (const page of pages) for (const record of page.items) { const current = byId.get(record.id); if (!current || record.version >= current.version) byId.set(record.id, record); }
  return [...byId.values()].sort((a, b) => actualMoment(b).localeCompare(actualMoment(a)) || a.id.localeCompare(b.id));
}

function measurementMetric(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>;
  return String(payload.metric ?? record.title ?? "Measurement").trim() || "Measurement";
}
function measurementUnit(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>;
  return typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim() : "Unit not recorded";
}

export function careChronology(records: WellbeingRecord[]): CareChronologyItem[] {
  const measurements = records.filter((record) => record.kind === "measurement");
  if (measurements.length <= CARE_EXACT_MEASUREMENT_LIMIT)
    return records.slice(0, CARE_RENDER_LIMIT).map((record) => ({ kind: "record", record, moment: actualMoment(record) }));

  const grouped = new Map<string, { metric: string; unit: string; records: WellbeingRecord[] }>();
  for (const record of measurements) {
    const metric = measurementMetric(record), unit = measurementUnit(record), key = `${metric}\u0000${unit}`;
    const current = grouped.get(key) ?? { metric, unit, records: [] };
    current.records.push(record);
    grouped.set(key, current);
  }
  const summaries: CareChronologyItem[] = [...grouped.values()].map(({ metric, unit, records: items }) => ({
    kind: "measurement_summary",
    id: `measurement-summary:${metric}:${unit}`,
    metric,
    unit,
    records: items,
    moment: actualMoment(items[0]!),
  }));
  const exact: CareChronologyItem[] = records
    .filter((record) => record.kind !== "measurement")
    .slice(0, CARE_NON_MEASUREMENT_LIMIT)
    .map((record) => ({ kind: "record", record, moment: actualMoment(record) }));
  return [...summaries, ...exact]
    .sort((left, right) => right.moment.localeCompare(left.moment) || left.kind.localeCompare(right.kind) || (left.kind === "record" ? left.record.id : left.id).localeCompare(right.kind === "record" ? right.record.id : right.id))
    .slice(0, CARE_RENDER_LIMIT);
}

export function WellbeingCareWorkspace({ loaders = defaultLoaders, initialNow, onAskKora }: { loaders?: WellbeingTodayLoaders; initialNow?: Date; onAskKora?: (reference?: ConversationContextReference, draft?: string) => void }) {
  const now = initialNow ?? new Date(), [params, setParams] = useSearchParams(), navigate = useNavigate(), queryClient = useQueryClient(),
    [filterOpen, setFilterOpen] = useState(false), [logChooserOpen, setLogChooserOpen] = useState(false),
    [settlement, setSettlement] = useState<{ message: string; archived?: WellbeingRecord }>(),
    [pageLoadError, setPageLoadError] = useState(false), [pageLoadPending, setPageLoadPending] = useState(false),
    selectedId = params.get("record") ?? undefined, requestedLog = params.get("log"), logKind = supportedCareKind(requestedLog),
    requestedFilter = params.get("type"), filterKind = supportedCareKind(requestedFilter), filter = filterKind ?? "all", requestedEdit = params.get("edit") === "1";
  const editorTrigger = useRef<HTMLElement | null>(null), routeOpenedHere = useRef(false), editorOpenedHere = useRef(false),
    firstRecord = useRef<HTMLButtonElement | null>(null), firstCareAction = useRef<HTMLButtonElement | null>(null), recentHeading = useRef<HTMLHeadingElement | null>(null), upcomingHeading = useRef<HTMLHeadingElement | null>(null), restoreAfterFilterClear = useRef(false),
    mutationKeys = useWellbeingMutationKeys();

  useEffect(() => {
    const invalidLog = Boolean(requestedLog && !logKind), invalidFilter = Boolean(requestedFilter && !filterKind);
    if (!invalidLog && !invalidFilter && !(requestedEdit && !selectedId)) return;
    const next = new URLSearchParams(params);
    if (invalidLog) next.delete("log");
    if (invalidFilter) next.delete("type");
    if (requestedEdit && !selectedId) next.delete("edit");
    setParams(next, { replace: true });
  }, [filterKind, logKind, params, requestedEdit, requestedFilter, requestedLog, selectedId, setParams]);

  const careKinds = filter === "all" ? CARE_KINDS : [filter as WellbeingRecordKind];
  const care = useInfiniteQuery({ queryKey: ["wellbeing", "care", filter], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => loaders.list({ kinds: careKinds, state: "active", pageSize: CARE_PAGE_SIZE, cursor: pageParam }),
    getNextPageParam: (page) => page.complete ? undefined : page.cursor, retry: false });
  const sources = useQuery({ queryKey: ["wellbeing", "sources", ...CARE_KINDS], queryFn: () => loaders.sources({ kinds: CARE_KINDS }), retry: false });
  const selected = useQuery({ queryKey: ["wellbeing", "record", selectedId], queryFn: () => loaders.read(selectedId!), enabled: Boolean(selectedId), retry: false });
  const records = useMemo(() => dedupeRecords(care.data?.pages ?? []), [care.data?.pages]), complete = Boolean(care.data?.pages.at(-1)?.complete),
    retainedReadError = Boolean(care.isError && care.data?.pages.length), nextPageError = Boolean(retainedReadError && care.isFetchNextPageError),
    restrictedOmitted = Boolean(care.data?.pages.some((page) => page.restrictedOmitted)), selectedRecord = selected.data?.record,
    selectedIsCare = Boolean(selectedRecord && supportedCareKind(selectedRecord.kind)), editing = Boolean(requestedEdit && selectedId && selectedIsCare),
    future = records.filter((record) => record.kind === "appointment" && new Date(actualMoment(record)).getTime() >= now.getTime()).sort((a, b) => actualMoment(a).localeCompare(actualMoment(b)) || a.id.localeCompare(b.id)),
    recent = records.filter((record) => !future.some((futureRecord) => futureRecord.id === record.id)),
    showUpcoming = filter === "all" || filter === "appointment",
    historyQualified = retainedReadError || !complete || pageLoadError;
  const wellbeingReturn = useWellbeingReturnContext({ ready: Boolean(care.data), rootSelector: ".wellbeing-care-workspace", fallbackRef: firstCareAction, restoreKey: records.map((record) => `${record.id}:${record.version}`).join("|") });

  const setRouteState = (changes: Record<string, string | undefined>, replace = false) => { const next = new URLSearchParams(params); Object.entries(changes).forEach(([key, value]) => value === undefined ? next.delete(key) : next.set(key, value)); setParams(next, { replace }); };
  const openRecord = (id: string, _trigger: HTMLElement) => { routeOpenedHere.current = true; wellbeingReturn.rememberAndOpenQuery({ record: id, log: undefined, edit: undefined }, wellbeingRecordReturnId(id)); };
  const openLog = (kind: WellbeingRecordKind, trigger?: HTMLElement | null) => { if (!supportedCareKind(kind)) return; editorTrigger.current = trigger ?? firstCareAction.current; editorOpenedHere.current = true; setRouteState({ log: kind, record: undefined, edit: undefined }); };
  const closeRecord = () => { if (routeOpenedHere.current || wellbeingReturn.returnRoute) { routeOpenedHere.current = false; navigate(-1); } else setRouteState({ record: undefined, edit: undefined }, true); wellbeingReturn.focusReturnTarget(selectedId ? wellbeingRecordReturnId(selectedId) : undefined); };
  const closeEditor = () => { if (editing) { setRouteState({ edit: undefined }, true); return; } if (editorOpenedHere.current) { editorOpenedHere.current = false; navigate(-1); } else setRouteState({ log: undefined, edit: undefined }, true); };
  const clearFilter = () => { restoreAfterFilterClear.current = true; setRouteState({ type: undefined }); };
  const chooseLogKind = (kind: WellbeingRecordKind) => { setLogChooserOpen(false); requestAnimationFrame(() => requestAnimationFrame(() => openLog(kind))); };
  const refresh = async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["wellbeing", "care"] }), queryClient.invalidateQueries({ queryKey: ["wellbeing", "today"] }), queryClient.invalidateQueries({ queryKey: ["wellbeing", "record"] }), queryClient.invalidateQueries({ queryKey: ["wellbeing", "sources"] })]);
  const restoreArchive = useMutation({ mutationFn: (record: WellbeingRecord) => loaders.restore(record.id, record.version, mutationKeys.acquire("restore", record.id, record.version)),
    onSuccess: async ({ record }, archivedRecord) => { mutationKeys.settle("restore", archivedRecord.id); await refresh(); setSettlement({ message: `${record.title} restored to Care.` }); requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-care-record-id="${CSS.escape(record.id)}"]`) ?? firstCareAction.current)?.focus({ preventScroll: true }))); },
    onError: (error, record) => setSettlement({ message: `${record.title} remains archived. ${error instanceof Error ? error.message : "Restore could not be completed."}`, archived: record }) });
  useEffect(() => { if (!restoreAfterFilterClear.current || filter !== "all" || care.isFetching || !firstRecord.current) return; restoreAfterFilterClear.current = false; requestAnimationFrame(() => firstRecord.current?.focus()); }, [care.isFetching, filter, records.length]);
  const headerActions = <Button ref={firstCareAction} tone="primary" onClick={() => setLogChooserOpen(true)}><Plus size={15} />Log care</Button>;

  if (care.isLoading) return <CareState title="Opening Care" description="Reading local care records." headerActions={headerActions} busy />;
  if (care.isError && !care.data) return <CareState title="Care could not be opened" description="Kora could not read the local care chronology. Saved records remain unchanged." headerActions={headerActions} action={<Button tone="primary" onClick={() => care.refetch()}>Try again</Button>} />;

  return <section className="wellbeing-care-workspace"><WellbeingFrame>
    <PageHeader title="Care" description="Record appointments and care facts you choose to keep." status={<><span>Private by default · Care chronology</span><span aria-hidden="true">·</span><span>{complete
      ? retainedReadError ? "Known records retained · freshness unknown" : "Local chronology current"
      : "Known records shown · earlier history may be available"}</span></>} actions={headerActions} />
    <CareSectionJumps showUpcoming={showUpcoming} recentHeading={recentHeading} upcomingHeading={upcomingHeading} />
    {retainedReadError && !nextPageError && !pageLoadError ? <CareReadNotice onRetry={() => void care.refetch()} /> : null}
    {settlement ? <div className="wellbeing-settlement" role="status"><ShieldCheck size={15} /><span>{settlement.message}</span>{settlement.archived ? <Button tone="link" loading={restoreArchive.isPending} onClick={() => restoreArchive.mutate(settlement.archived!)}>Undo archive</Button> : null}</div> : null}
    <div className={`care-layout${showUpcoming ? "" : " care-layout--single"}`}><div className="care-recent-stack"><CareRecent headingRef={recentHeading} records={recent} countLabel={`${Math.min(records.length, CARE_RENDER_LIMIT)}${complete && !retainedReadError ? "" : "+"} saved`} filterControl={<><div className="care-filter-bar__desktop"><KoraSelect label="Care type" value={filter} options={filterOptions} onValueChange={(value) => setRouteState({ type: value === "all" ? undefined : value })} /></div><Button className="care-filter-bar__mobile" tone="secondary" onClick={() => setFilterOpen(true)}>Filter · {filterOptions.find((option) => option.value === filter)?.label}</Button></>} hasAnyRecords={records.length > 0} filtered={filter !== "all"} stale={retainedReadError} complete={complete && !retainedReadError} truncated={records.length > CARE_RENDER_LIMIT} restrictedOmitted={restrictedOmitted} hasMore={Boolean((records.length < CARE_RENDER_LIMIT && care.hasNextPage) || pageLoadError)} loadingMore={pageLoadPending} loadMoreError={pageLoadError} onLoadMore={() => { setPageLoadPending(true); setPageLoadError(false); void care.fetchNextPage({ throwOnError: true }).then((result) => setPageLoadError(Boolean(result.error))).catch(() => setPageLoadError(true)).finally(() => setPageLoadPending(false)); }} onOpen={openRecord} firstRecord={firstRecord} onClearFilter={clearFilter} /><CareCoverage coverage={sources.data} unavailable={sources.isError} retrying={sources.isFetching} onRetry={() => void sources.refetch()} /></div>{showUpcoming ? <CareUpcoming headingRef={upcomingHeading} records={future} now={now} historyQualified={historyQualified} onOpen={openRecord} firstRecord={recent.length ? undefined : firstRecord} /> : null}</div>
    <CareSafety />
  </WellbeingFrame>
  <Sheet open={filterOpen} onOpenChange={setFilterOpen} title="Filter Care" description="Choose which recorded care kind appears in the chronology." purpose="navigation" side="left"><div className="care-filter-sheet">{filterOptions.map((option) => <Button key={option.value} tone={filter === option.value ? "secondary" : "ghost"} aria-pressed={filter === option.value} onClick={() => { setRouteState({ type: option.value === "all" ? undefined : option.value }); setFilterOpen(false); }}>{option.label}</Button>)}</div></Sheet>
  <Sheet open={logChooserOpen} onOpenChange={setLogChooserOpen} title="Log care" description="Choose the kind of fact you want Kora to remember. No choice implies diagnosis or advice." purpose="properties"><div className="care-log-chooser">{CARE_KINDS.map((kind) => <Pressable key={kind} onClick={() => chooseLogKind(kind)}><span aria-hidden="true">{meta[kind].icon}</span><span><strong>{meta[kind].label}</strong><small>{meta[kind].chooser}</small></span><ChevronRight size={15} aria-hidden="true" /></Pressable>)}</div></Sheet>
  <RecordDetailSheet record={selectedIsCare ? selectedRecord : undefined} loading={selected.isLoading} error={selected.isError || Boolean(selectedRecord && !selectedIsCare)} unavailableBody={selectedRecord && !selectedIsCare ? "This record is not a Care record. Open its owning Wellbeing page instead." : "This Care record is missing, restricted, gone, or unavailable. No private content has been disclosed."} open={Boolean(selectedId && (!requestedEdit || !selectedIsCare))} onClose={closeRecord} onEdit={(trigger) => { editorTrigger.current = trigger ?? null; setRouteState({ edit: "1" }, true); }} returnLabel="Care" chromeTitle="Care record"
     onAskKora={onAskKora && selectedIsCare ? (record) => onAskKora({ kind: "wellbeing_record", id: record.id, title: record.title }, `Help me organize this exact permitted Care record (version ${record.version}) for retrieval or questions. Do not diagnose, recommend treatment, infer adherence, or change a medication plan.`) : undefined} koraTitle="Organize this exact care record with Kora" koraDescription="Share only this selected care record with Kora for a focused, non-diagnostic review." koraActionLabel="Organize with Kora"
    onArchive={async (record) => { const result = await loaders.archive(record.id, record.version, mutationKeys.acquire("archive", record.id, record.version)); mutationKeys.settle("archive", record.id); await refresh(); closeRecord(); setSettlement({ message: `${record.title} archived.`, archived: result.record }); return result.record; }}
    onRestore={async (record) => { const result = await loaders.restore(record.id, record.version, mutationKeys.acquire("restore", record.id, record.version)); mutationKeys.settle("restore", record.id); await refresh(); closeRecord(); setSettlement({ message: `${record.title} restored to Care.` }); requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-care-record-id="${CSS.escape(result.record.id)}"]`) ?? firstCareAction.current)?.focus({ preventScroll: true }))); return result.record; }}
    onDelete={loaders.delete && loaders.approve && loaders.reject ? { request: (record, requestKey) => loaders.delete!(record.id, record.version, requestKey), approve: loaders.approve, reject: loaders.reject, onDeleted: async (record, outcome) => { await refresh(); closeRecord(); setSettlement({ message: outcome.status === "gone" ? `${record.title} was already gone.` : `${record.title} deleted permanently.` }); }, onStale: async (record) => { await refresh(); setSettlement({ message: `${record.title} refreshed. Review the latest version before deleting.` }); } } : undefined} />
  <WellbeingRecordEditor finalFocus={editorTrigger} open={Boolean(logKind || editing)} kind={logKind ?? (selectedIsCare ? selectedRecord!.kind : "observation")} record={editing && selectedIsCare ? selectedRecord : undefined} now={now} onClose={closeEditor} loaders={loaders} onSaved={async (record) => { await refresh(); if (record.privacy === "restricted") { editorOpenedHere.current = false; routeOpenedHere.current = false; setRouteState({ record: undefined, log: undefined, edit: undefined }, true); setSettlement({ message: "Restricted record saved. It is omitted from Care until exact access is granted." }); return; } if (!editing) routeOpenedHere.current = editorOpenedHere.current; editorOpenedHere.current = false; setRouteState({ record: record.id, log: undefined, edit: undefined }, true); }} />
  </section>;
}

function CareReadNotice({ onRetry }: { onRetry: () => void }) { return <div className="care-read-notice" role="alert"><CircleAlert size={15} aria-hidden="true" /><div><strong>The latest Care refresh failed.</strong><p>The last successful records remain visible and may be stale. This chronology is not confirmed current or complete.</p><Button tone="ghost" onClick={onRetry}>Retry refresh</Button></div></div>; }
function CareSafety() { return <section className="care-safety" aria-labelledby="care-safety-title"><ShieldCheck size={17} /><strong id="care-safety-title">Your saved care stays factual and owner-controlled.</strong><Disclosure summary="Safety details" description="Read diagnosis, medication, and emergency boundaries."><p>Kora organizes what you record; it does not diagnose or provide emergency care. If you may be in immediate danger, contact local emergency services. Kora does not recommend treatment, infer whether a dose was missed, or change medication plans.</p></Disclosure></section>; }
function CareRow({ record, onOpen, actionRef, wrapTitle = false }: { record: WellbeingRecord; onOpen: (id: string, trigger: HTMLElement) => void; actionRef?: React.RefObject<HTMLButtonElement | null>; wrapTitle?: boolean }) { const details = meta[record.kind] ?? { label: record.kind, icon: <ClipboardPlus size={16} /> }; return <li className={`care-record-row care-record-row--${record.kind}${wrapTitle ? " care-record-row--wrap-title" : ""}`}><Pressable ref={actionRef} data-care-record-id={record.id} data-wellbeing-return-id={wellbeingRecordReturnId(record.id)} onClick={(event) => onOpen(record.id, event.currentTarget)}><span className="care-record-row__icon" aria-hidden="true">{details.icon}</span><span className="care-record-row__body"><span><strong>{record.title}</strong>{wrapTitle ? null : <Badge tone="quiet">{details.label}</Badge>}</span><span>{recordQualifier(record)}</span><small>{formatMoment(actualMoment(record))} · {sourceLabel(record)} · Saved record</small></span><ChevronRight size={15} aria-hidden="true" /></Pressable></li>; }
function CareMeasurementSummary({ item, onOpen }: { item: Extract<CareChronologyItem, { kind: "measurement_summary" }>; onOpen: (id: string, trigger: HTMLElement) => void }) { const latest = item.records[0]!, earliest = item.records.at(-1)!, sourceCount = new Set(item.records.map(sourceLabel)).size; return <li className="care-measurement-summary"><span className="care-record-row__icon" aria-hidden="true"><Ruler size={16} /></span><span className="care-record-row__body"><span><strong>{item.metric}</strong><Badge tone="quiet">{item.unit}</Badge><Badge tone="neutral">{item.records.length.toLocaleString()} loaded readings</Badge></span><Pressable className="care-measurement-summary__latest" data-care-record-id={latest.id} data-wellbeing-return-id={wellbeingRecordReturnId(latest.id)} aria-label={`View latest ${item.metric} reading`} onClick={(event) => onOpen(latest.id, event.currentTarget)}><span>Latest loaded value</span><strong>{recordQualifier(latest)}</strong></Pressable><small>{formatMoment(actualMoment(earliest))}–{formatMoment(actualMoment(latest))} · {sourceCount} {sourceCount === 1 ? "source" : "sources"}</small></span></li>; }
function CareUpcoming({ records, now, historyQualified, onOpen, firstRecord, headingRef }: { records: WellbeingRecord[]; now: Date; historyQualified: boolean; onOpen: (id: string, trigger: HTMLElement) => void; firstRecord?: React.RefObject<HTMLButtonElement | null>; headingRef: RefObject<HTMLHeadingElement | null> }) { const groups = new Map<string, WellbeingRecord[]>(); records.forEach((record) => { const key = dayKey(actualMoment(record)); groups.set(key, [...(groups.get(key) ?? []), record]); }); let rowIndex = 0; const emptyTitle = historyQualified ? "No future appointment appears in the loaded records." : "No future appointment is recorded.", emptyBody = historyQualified ? "The loaded or retained Care records may be partial or stale, so this does not confirm that no appointment exists." : "Care does not turn plan text into reminders or projected events."; return <section className="care-upcoming" aria-labelledby="care-upcoming-title"><div className="wellbeing-section-heading"><div><span>From recorded start times</span><h2 ref={headingRef} id="care-upcoming-title" tabIndex={-1}>Upcoming appointments</h2></div>{records.length ? <Badge tone="neutral">{records.length}</Badge> : null}</div>{historyQualified ? <p className="care-upcoming__qualification" role="status">Showing loaded Care records; coverage may be partial or stale.</p> : null}{records.length ? <div className="care-date-groups">{[...groups.entries()].map(([key, items]) => <section key={key}><h3>{dayHeading(actualMoment(items[0]), now)}</h3><ol>{items.map((record) => { const actionRef = rowIndex++ === 0 ? firstRecord : undefined; return <CareRow key={record.id} record={record} onOpen={onOpen} actionRef={actionRef} wrapTitle />; })}</ol></section>)}</div> : <div className="care-section-empty care-section-empty--compact"><CalendarDays size={18} /><div><strong>{emptyTitle}</strong><p>{emptyBody}</p></div></div>}</section>; }
function CareRecent({ records, countLabel, filterControl, hasAnyRecords, filtered, stale, complete, truncated, restrictedOmitted, hasMore, loadingMore, loadMoreError, onLoadMore, onOpen, firstRecord, onClearFilter, headingRef }: { records: WellbeingRecord[]; countLabel: string; filterControl: ReactNode; hasAnyRecords: boolean; filtered: boolean; stale: boolean; complete: boolean; truncated: boolean; restrictedOmitted: boolean; hasMore: boolean; loadingMore: boolean; loadMoreError: boolean; onLoadMore: () => void; onOpen: (id: string, trigger: HTMLElement) => void; firstRecord: React.RefObject<HTMLButtonElement | null>; onClearFilter: () => void; headingRef: RefObject<HTMLHeadingElement | null> }) { const chronology = careChronology(records), aggregated = chronology.some((item) => item.kind === "measurement_summary"), emptyTitle = stale ? "The last successful care read was empty." : hasAnyRecords ? "No recent care is recorded." : filtered ? "No records match this care type." : "No care records have been saved.", emptyBody = stale ? "Refresh failed, so this empty state is not confirmed current. Try again to check the saved chronology." : hasAnyRecords ? "Future appointments appear separately. No current health state is inferred." : filtered ? "Choose another type or show all care." : "Use Log care when there is a fact you want to remember."; let exactIndex = 0; return <section className="care-recent" aria-labelledby="care-recent-title"><div className="wellbeing-section-heading"><div><span>{filtered ? `Filtered history · ${countLabel}` : countLabel}</span><h2 ref={headingRef} id="care-recent-title" tabIndex={-1}>Recent care</h2></div><div className="care-recent__controls">{filterControl}{stale || !complete || truncated || aggregated ? <Badge tone="warning">Loaded history</Badge> : null}</div></div>{chronology.length ? <ol>{chronology.map((item) => item.kind === "measurement_summary" ? <CareMeasurementSummary key={item.id} item={item} onOpen={onOpen} /> : <CareRow key={item.record.id} record={item.record} onOpen={onOpen} actionRef={exactIndex++ === 0 ? firstRecord : undefined} />)}</ol> : <div className="care-section-empty"><Stethoscope size={18} /><div><strong>{emptyTitle}</strong><p>{emptyBody}</p>{filtered && !hasAnyRecords ? <Button tone="secondary" onClick={onClearFilter}>Show all care</Button> : null}</div></div>}{aggregated ? <><nav className="care-measurement-navigation" aria-label="Measurement navigation"><div><strong>Measurement history</strong><span>Open all recorded readings or trends.</span></div><div><Link to="/life/wellbeing/records?kind=measurement">All measurement records</Link><Link to="/life/wellbeing/trends">Trends</Link></div></nav><p className="care-large-collection" role="status">Care groups {records.filter((record) => record.kind === "measurement").length.toLocaleString()} loaded measurements by metric and unit. Exact readings remain available in Records and Trends.</p></> : hasMore ? <div className="care-large-collection" role="status"><div><Ruler size={15} /><span><strong>{loadMoreError ? "Earlier records could not be loaded." : `Showing ${records.length} loaded records.`}</strong> {loadMoreError ? "The records above remain available." : "Earlier saved history may still be available."}</span></div><Button tone="secondary" loading={loadingMore} onClick={onLoadMore}>{loadMoreError ? "Retry earlier records" : "Load earlier"}</Button></div> : truncated || !complete ? <p className="care-large-collection" role="status">Showing the latest {Math.min(records.length, CARE_RENDER_LIMIT)} loaded records. This bounded view does not claim remaining history is absent.</p> : null}{aggregated && hasMore ? <div className="care-large-collection care-large-collection--paging" role="status"><span>{loadMoreError ? "Earlier records could not be loaded; the aggregate above remains available." : "Earlier saved measurements may extend this aggregate."}</span><Button tone="secondary" loading={loadingMore} onClick={onLoadMore}>{loadMoreError ? "Retry earlier records" : "Load earlier"}</Button></div> : null}{restrictedOmitted ? <p className="care-restricted"><ShieldCheck size={14} />Restricted records are omitted from this chronology and count.</p> : null}</section>; }
function careSourceStateDescription(source: WellbeingSourceCoverage["external"][number]) {
  if (source.state === "saved_only") return source.kind === "imported" ? "Saved import is available; it does not identify a connection to manage." : "Saved records are available; current automatic updates are not verified.";
  if (source.state === "partial") return "Some current records may be missing.";
  if (source.state === "unavailable") return "Current records could not be read.";
  if (source.state === "not_configured") return "Connection setup is needed for current updates.";
  if (source.state === "permission_restricted") return "Connection permission is needed for current updates.";
  if (source.state === "no_data") return "No records from this source are available.";
  return source.kind === "imported" ? "Saved imported records are available." : "Current records are available.";
}
function CareCoverage({ coverage, unavailable, retrying, onRetry }: { coverage?: WellbeingSourceCoverage; unavailable: boolean; retrying: boolean; onRetry: () => void }) { if (!unavailable && (!coverage || coverage.state === "local_only")) return null; const affected = coverage?.external.filter((source) => source.state !== "current") ?? [], retryable = unavailable || affected.some((source) => source.state === "partial" || source.state === "unavailable"), needsConnectionReview = affected.some((source) => source.kind === "provider" && ["not_configured", "permission_restricted"].includes(source.state)), reason = unavailable ? "Coverage check unavailable" : coverage?.state === "saved_external_records" ? "Saved records only" : affected.some((source) => source.state === "permission_restricted") ? "Permission limits coverage" : affected.some((source) => source.state === "not_configured") ? "Source not configured" : affected.some((source) => source.state === "unavailable") ? "Source unavailable" : "Coverage is partial"; return <section className="care-coverage" aria-labelledby="care-coverage-title"><CircleAlert size={15} /><div className="care-coverage__summary"><strong id="care-coverage-title" role="status">{reason}</strong><span>{affected.length || 1} affected {affected.length === 1 ? "collection" : "collections"} · local records remain usable</span></div><Disclosure summary="Why care is qualified" description={`${reason}. Missing automatic records are not treated as an empty history.`}><p>Local records remain available. Missing automatic records are not treated as an empty history.</p>{affected.length ? <ul>{affected.map((source) => <li key={source.id}><span>{source.label} · {careSourceStateDescription(source)}{source.lastRecordedAt ? ` · latest recorded event ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(source.lastRecordedAt))}` : ""}</span></li>)}</ul> : null}<div className="care-coverage__actions">{retryable ? <Button tone="link" loading={retrying} onClick={onRetry}>Recheck source coverage</Button> : null}{needsConnectionReview ? <Link to="/settings/integrations">Review connections</Link> : null}</div></Disclosure></section>; }
function revealCareSectionTarget(target: HTMLElement | null) {
  if (!target) return;
  const lifeStage = target.closest<HTMLElement>(".life-stage");
  if (lifeStage && (lifeStage.clientHeight > 0 || lifeStage.scrollHeight > 0)) {
    const targetRect = target.getBoundingClientRect();
    const ownerRect = lifeStage.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const scrollMargin = Number.parseFloat(style.scrollMarginBlockStart || style.scrollMarginTop || "0") || 0;
    const delta = targetRect.top - ownerRect.top - scrollMargin;
    if (Number.isFinite(delta)) lifeStage.scrollTop += delta;
  } else {
    target.scrollIntoView?.({ block: "start" });
  }
  target.focus({ preventScroll: true });
}

function CareSectionJumps({ showUpcoming, recentHeading, upcomingHeading }: { showUpcoming: boolean; recentHeading: RefObject<HTMLHeadingElement | null>; upcomingHeading: RefObject<HTMLHeadingElement | null> }) {
  const reveal = (heading: RefObject<HTMLHeadingElement | null>) => {
    revealCareSectionTarget(heading.current);
  };
  return <nav className="care-section-jumps" aria-label="Care sections">
    <Button tone="secondary" onClick={() => reveal(recentHeading)}>Recent care</Button>
    {showUpcoming ? <Button tone="secondary" onClick={() => reveal(upcomingHeading)}>Upcoming appointments</Button> : null}
  </nav>;
}

function CareState({ title, description, action, headerActions, busy }: { title: string; description: string; action?: ReactNode; headerActions?: ReactNode; busy?: boolean }) { return <section className="wellbeing-care-workspace"><WellbeingFrame><PageHeader title="Care" description="Recorded care information without diagnosis." status="Private by default · Care chronology" actions={headerActions} /><StateView state={busy ? "loading" : "error"} title={title} body={description} action={action} /></WellbeingFrame></section>; }
