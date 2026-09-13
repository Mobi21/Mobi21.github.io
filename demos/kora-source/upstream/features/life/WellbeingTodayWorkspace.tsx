import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ClipboardPlus,
  CupSoda,
  FileText,
  MessageCircleMore,
  NotebookPen,
  Pill,
  Plus,
  Ruler,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Utensils,
  Waves,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  CheckboxChoice,
  Disclosure,
  Field,
  Input,
  KoraSelect,
  PageHeader,
  Pressable,
  Sheet,
  StateView,
  Textarea,
} from "../../components/primitives";
import { Menu } from "../../components/overlays";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type WellbeingPayloadByKind,
  type WellbeingRecord,
  type WellbeingRecordChanges,
  type WellbeingRecordDraft,
  type WellbeingRecordKind,
  type WellbeingRecordPage,
  type WellbeingSourceCoverage,
  type WellbeingDeletionOutcome,
} from "../../lib/runtime";
import { WellbeingFrame } from "./WellbeingNavigation";
import { useWellbeingMutationKeys } from "./wellbeing-mutation-keys";
import { useWellbeingReturnContext, wellbeingRecordReturnId } from "./wellbeing-return-context";
import "./wellbeing-today.css";

export type WellbeingTodayLoaders = {
  sources: (input?: {
    kinds?: WellbeingRecordKind[];
  }) => Promise<WellbeingSourceCoverage>;
  list: (input: {
    kinds?: WellbeingRecordKind[];
    state?: "active" | "archived";
    start?: string;
    end?: string;
    pageSize?: number;
    cursor?: string;
    routineSchedule?: "due" | "later";
    routineDay?: number;
    routineDayStart?: string;
    routineDayEnd?: string;
  }) => Promise<WellbeingRecordPage>;
  read: (id: string) => Promise<{ record: WellbeingRecord }>;
  create: (
    record: WellbeingRecordDraft,
    requestKey?: string,
  ) => Promise<{ record: WellbeingRecord; replayed: boolean }>;
  update: (
    id: string,
    expectedVersion: number,
    changes: WellbeingRecordChanges,
    requestKey: string,
  ) => Promise<{ record: WellbeingRecord; replayed: boolean }>;
  archive: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) => Promise<{ record: WellbeingRecord; replayed: boolean }>;
  restore: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) => Promise<{ record: WellbeingRecord; replayed: boolean }>;
  delete?: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) => Promise<WellbeingDeletionOutcome>;
  approve?: (confirmationId: string) => Promise<unknown>;
  reject?: (confirmationId: string) => Promise<unknown>;
};

const defaultLoaders: WellbeingTodayLoaders = {
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

export async function listAllRecords(
  loaders: WellbeingTodayLoaders,
  input: Parameters<WellbeingTodayLoaders["list"]>[0],
) {
  const items = new Map<string, WellbeingRecord>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined,
    restrictedOmitted = false;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await loaders.list({ ...input, cursor });
    page.items.forEach((record) => {
      if (record.privacy === "restricted") {
        restrictedOmitted = true;
        return;
      }
      const current = items.get(record.id);
      if (!current || record.version >= current.version)
        items.set(record.id, record);
    });
    restrictedOmitted ||= page.restrictedOmitted;
    if (page.complete)
      return { items: [...items.values()], complete: true, restrictedOmitted };
    if (!page.cursor || seenCursors.has(page.cursor))
      return {
        items: [...items.values()],
        complete: false,
        restrictedOmitted,
        cursor: page.cursor,
      };
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }
  return {
    items: [...items.values()],
    complete: false,
    restrictedOmitted,
    cursor,
  };
}

const LOG_KINDS: Array<{
  kind: WellbeingRecordKind;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    kind: "meal",
    label: "Meal",
    description: "Remember what you ate without requiring nutrition analysis.",
    icon: <Utensils size={16} />,
  },
  {
    kind: "drink",
    label: "Drink",
    description:
      "Remember a drink and an optional volume without setting a hydration target.",
    icon: <CupSoda size={16} />,
  },
  {
    kind: "observation",
    label: "Observation",
    description: "Mood, energy, sleep, digestion, or another personal note.",
    icon: <Waves size={16} />,
  },
  {
    kind: "symptom",
    label: "Symptom",
    description: "Record what you noticed and optional intensity.",
    icon: <Stethoscope size={16} />,
  },
  {
    kind: "measurement",
    label: "Measurement",
    description: "Store a value with its unit and source.",
    icon: <Ruler size={16} />,
  },
  {
    kind: "medication_plan",
    label: "Medication plan",
    description: "Store instructions and a schedule exactly as recorded.",
    icon: <Pill size={16} />,
  },
  {
    kind: "dose",
    label: "Medication dose",
    description: "Record taken, skipped, or missed medication.",
    icon: <Pill size={16} />,
  },
  {
    kind: "appointment",
    label: "Appointment",
    description: "Record a scheduled visit and preparation note.",
    icon: <CalendarDays size={16} />,
  },
  {
    kind: "care_document",
    label: "Care document",
    description: "Reference a local care document and its summary.",
    icon: <FileText size={16} />,
  },
  {
    kind: "routine_checkin",
    label: "Routine",
    description: "Mark a personal routine done or skipped.",
    icon: <Activity size={16} />,
  },
  {
    kind: "note",
    label: "Note",
    description: "Capture context that does not fit another kind.",
    icon: <NotebookPen size={16} />,
  },
];

const kindMeta = Object.fromEntries(
  LOG_KINDS.map((item) => [item.kind, item]),
) as Record<string, (typeof LOG_KINDS)[number]>;

const TODAY_QUICK_KINDS: WellbeingRecordKind[] = [
  "meal",
  "observation",
  "symptom",
  "measurement",
];

const DENSE_GROUP_INITIAL_WINDOW = 25;
const DENSE_GROUP_WINDOW_STEP = 25;

function supportedLogKind(value: string | null): WellbeingRecordKind | null {
  return value && kindMeta[value] ? (value as WellbeingRecordKind) : null;
}

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function nextSevenDayBounds(date: Date) {
  const today = dayBounds(date);
  const end = new Date(today.end);
  end.setDate(end.getDate() + 7);
  return { start: today.end, end: end.toISOString() };
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function sourceLabel(record: WellbeingRecord) {
  return record.source.kind === "manual"
    ? record.source.label
    : `${record.source.label} · ${record.source.kind}`;
}

export function wellbeingRecordDisplayTitle(record: WellbeingRecord) {
  if (record.kind !== "routine_checkin") return record.title;
  const name = (record.payload as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : record.title;
}

export function momentSummary(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>;
  if (record.kind === "meal")
    return (
      String(payload.description ?? "").trim() ||
      (payload.foods as string[] | undefined)?.join(", ") ||
      "Meal recorded"
    );
  if (record.kind === "drink")
    return (
      [payload.name, payload.volumeMl ? `${payload.volumeMl} ml` : undefined]
        .filter(Boolean)
        .join(" · ") || "Drink recorded"
    );
  if (record.kind === "observation")
    return (
      [payload.value, payload.rating ? `${payload.rating}/5` : undefined]
        .filter(Boolean)
        .join(" · ") || String(payload.category ?? "Observation")
    );
  if (record.kind === "symptom")
    return `${payload.name ?? record.title}${payload.severity ? ` · ${payload.severity}/5` : ""}`;
  if (record.kind === "measurement")
    return `${payload.value ?? ""} ${payload.unit ?? ""}`.trim();
  if (record.kind === "medication_plan")
    return [
      payload.medication,
      payload.schedule,
      payload.active === false ? "inactive" : "active",
    ]
      .filter(Boolean)
      .join(" · ");
  if (record.kind === "dose")
    return [payload.medication, payload.amount, payload.status]
      .filter(Boolean)
      .join(" · ");
  if (record.kind === "appointment")
    return (
      [payload.clinician, payload.specialty, payload.location]
        .filter(Boolean)
        .join(" · ") || "Appointment recorded"
    );
  if (record.kind === "care_document")
    return (
      [
        payload.name,
        payload.artifactId ? "artifact reference recorded" : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || "Care document recorded"
    );
  if (record.kind === "routine_checkin")
    return `${payload.name ?? record.title} · ${payload.status ?? "recorded"}`;
  if (record.kind === "note") return String(payload.body ?? "Note recorded");
  return record.title;
}

export function WellbeingTodayWorkspace({
  loaders = defaultLoaders,
  initialNow,
  onAskKora,
}: {
  loaders?: WellbeingTodayLoaders;
  initialNow?: Date;
  onAskKora?: (reference?: ConversationContextReference, draft?: string) => void;
}) {
  const [clock, setClock] = useState(initialNow ?? new Date()),
    [params, setParams] = useSearchParams(),
    [settlement, setSettlement] = useState<{
      message: string;
      archived?: WellbeingRecord;
    }>(),
    queryClient = useQueryClient(),
    navigate = useNavigate(),
    bounds = useMemo(() => dayBounds(clock), [clock.toDateString()]),
    upcomingBounds = useMemo(
      () => nextSevenDayBounds(clock),
      [clock.toDateString()],
    ),
    selectedId = params.get("record") ?? undefined,
    requestedLogKind = params.get("log"),
    logKind = supportedLogKind(requestedLogKind),
    editing = params.get("edit") === "1",
    mutationKeys = useWellbeingMutationKeys();
  const editorTrigger = useRef<HTMLElement | null>(null),
    routeOpenedHere = useRef(false),
    focusFallback = useRef<HTMLButtonElement | null>(null),
    sourceRetryFocus = useRef<{
      trigger: HTMLElement;
      moved: boolean;
      cleanup: () => void;
    } | null>(null),
    signalsTarget = useRef<HTMLElement | null>(null),
    upcomingTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (initialNow) return undefined;
    const handle = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(handle);
  }, [initialNow]);

  useEffect(() => {
    if (!requestedLogKind || logKind) return;
    const next = new URLSearchParams(params);
    next.delete("log");
    if (!selectedId) next.delete("edit");
    setParams(next, { replace: true });
  }, [logKind, params, requestedLogKind, selectedId, setParams]);

  const today = useInfiniteQuery({
    queryKey: ["wellbeing", "today", bounds.start, bounds.end],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      loaders.list({
        start: bounds.start,
        end: bounds.end,
        pageSize: 50,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.complete ? undefined : lastPage.cursor,
  });
  const sources = useQuery({
    queryKey: ["wellbeing", "sources"],
    queryFn: () => loaders.sources(),
  });
  useEffect(() => {
    return () => {
      sourceRetryFocus.current?.cleanup();
      sourceRetryFocus.current = null;
    };
  }, []);
  useEffect(() => {
    const pending = sourceRetryFocus.current;
    if (
      !pending ||
      sources.isFetching ||
      sources.isError ||
      document.querySelector("[data-wellbeing-source-retry]")
    )
      return;

    pending.cleanup();
    sourceRetryFocus.current = null;
    if (
      !pending.moved &&
      (document.activeElement === pending.trigger || document.activeElement === document.body)
    )
      focusFallback.current?.focus({ preventScroll: true });
  }, [sources.data, sources.isError, sources.isFetching]);
  const upcoming = useQuery({
    queryKey: ["wellbeing", "today", "upcoming", upcomingBounds.start, upcomingBounds.end],
    queryFn: () =>
      loaders.list({
        kinds: ["appointment"],
        state: "active",
        start: upcomingBounds.start,
        end: upcomingBounds.end,
        pageSize: 20,
      }),
  });
  const selected = useQuery({
    queryKey: ["wellbeing", "record", selectedId],
    queryFn: () => loaders.read(selectedId!),
    enabled: Boolean(selectedId),
  });
  const records = useMemo(() => {
    const byId = new Map<string, WellbeingRecord>();
    for (const page of today.data?.pages ?? [])
      for (const record of page.items) {
        // The authority omits Restricted records, but the chronology also
        // fails closed if a malformed page ever includes one.
        if (record.privacy === "restricted") continue;
        const current = byId.get(record.id);
        if (!current || record.version >= current.version)
          byId.set(record.id, record);
      }
    return [...byId.values()];
  }, [today.data]);
  const chronologyComplete = Boolean(today.data?.pages.at(-1)?.complete);
  const todayRetainedError = Boolean(today.isError && today.data?.pages.length);
  const todayNextPageError = Boolean(todayRetainedError && today.isFetchNextPageError);
  const restrictedOmitted = Boolean(
    today.data?.pages.some(
      (page) =>
        page.restrictedOmitted ||
        page.items.some((record) => record.privacy === "restricted"),
    ),
  );
  const selectedRecord = selected.data?.record,
    selectedIsRestricted = selectedRecord?.privacy === "restricted",
    visibleSelectedRecord = selectedIsRestricted ? undefined : selectedRecord;
  const selectedSupportsEditing = Boolean(
    visibleSelectedRecord && kindMeta[visibleSelectedRecord.kind],
  );
  const wellbeingReturn = useWellbeingReturnContext({
    ready: Boolean(today.data),
    rootSelector: ".wellbeing-today-workspace",
    fallbackRef: focusFallback,
    restoreKey: records.map((record) => `${record.id}:${record.version}`).join("|"),
  });

  const setRouteState = (
    changes: Record<string, string | undefined>,
    replace = false,
  ) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) =>
      value === undefined ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace });
  };
  const openLog = (
    kind: WellbeingRecordKind,
    trigger?: HTMLElement | null,
  ) => {
    editorTrigger.current = trigger ?? focusFallback.current;
    routeOpenedHere.current = true;
    setRouteState({ log: kind, record: undefined, edit: undefined });
  };
  const openRecord = (id: string, trigger?: HTMLElement | null) => {
    routeOpenedHere.current = true;
    wellbeingReturn.rememberAndOpenQuery(
      { record: id, log: undefined, edit: undefined },
      wellbeingRecordReturnId(id),
    );
  };
  const closeRecord = () => {
    if (routeOpenedHere.current) {
      routeOpenedHere.current = false;
      navigate(-1);
    } else setRouteState({ record: undefined, edit: undefined }, true);
    wellbeingReturn.focusReturnTarget(selectedId ? wellbeingRecordReturnId(selectedId) : undefined);
  };

  const headerActions = (
    <LogKindMenu onSelect={openLog} tone="primary" firstActionRef={focusFallback} />
  );
  const jumpToTarget = (target: HTMLElement | null) => {
    if (!target) return;
    target.scrollIntoView?.({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "today"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "record"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "sources"] }),
    ]);
  };
  const deletion: WellbeingDeleteController | undefined =
    loaders.delete && loaders.approve && loaders.reject
      ? {
          request: (record, requestKey) =>
            loaders.delete!(record.id, record.version, requestKey),
          approve: loaders.approve,
          reject: loaders.reject,
          onDeleted: async (record, outcome) => {
            await refresh();
            closeRecord();
            setSettlement({
              message:
                outcome.status === "gone"
                  ? `${record.title} was already gone.`
                  : `${record.title} deleted permanently.`,
            });
          },
          onStale: async (record) => {
            await refresh();
            setSettlement({
              message: `${record.title} changed. Review the latest version before deleting.`,
            });
          },
        }
      : undefined;
  const restoreArchive = useMutation({
    mutationFn: (record: WellbeingRecord) =>
      loaders.restore(
        record.id,
        record.version,
        mutationKeys.acquire("restore", record.id, record.version),
      ),
    onSuccess: async ({ record }, archivedRecord) => {
      mutationKeys.settle("restore", archivedRecord.id);
      await refresh();
      setSettlement({ message: `${record.title} restored to Wellbeing.` });
    },
    onError: (error, record) =>
      setSettlement({
        message: `${record.title} remains archived. ${error instanceof Error ? error.message : "Restore could not be completed."}`,
        archived: record,
      }),
  });

  if (today.isLoading)
    return (
      <WellbeingState
        title="Opening today"
        description="Reading local Wellbeing records."
        busy
      />
    );
  if (today.isError && !today.data?.pages.length)
    return (
      <WellbeingState
        title="Today could not be opened"
        description={
          today.error instanceof RuntimeRequestError
            ? today.error.message
            : "Kora could not read your saved Wellbeing records."
        }
        action={
          <Button tone="primary" onClick={() => today.refetch()}>
            Try again
          </Button>
        }
      />
    );

  return (
    <section className="wellbeing-today-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Today"
          description={`${dayLabel(clock)} · Device-local day`}
          status={<><span>Private by default</span><span aria-hidden="true">·</span><span>{sourceSummary(sources.data, sources.isError, todayRetainedError)}</span></>}
          actions={headerActions}
        />
        <WellbeingSourceNotice
          coverage={sources.data}
          unavailable={sources.isError}
          retrying={sources.isFetching}
          onRetry={(trigger) => {
            sourceRetryFocus.current?.cleanup();
            sourceRetryFocus.current = null;
            if (trigger !== document.activeElement) {
              void sources.refetch();
              return;
            }
            const pending: {
              trigger: HTMLElement;
              moved: boolean;
              cleanup: () => void;
            } = { trigger, moved: false, cleanup: () => undefined };
            const handleFocusIn = (event: FocusEvent) => {
              if (event.target !== trigger) pending.moved = true;
            };
            document.addEventListener("focusin", handleFocusIn);
            pending.cleanup = () => document.removeEventListener("focusin", handleFocusIn);
            sourceRetryFocus.current = pending;
            void sources.refetch();
          }}
        />
        {todayRetainedError ? (
          <WellbeingTodayReadNotice
            nextPage={todayNextPageError}
            loading={today.isFetchingNextPage || today.isFetching}
            onRetry={() =>
              void (todayNextPageError ? today.fetchNextPage() : today.refetch())
            }
          />
        ) : null}
        <TodayQuickLog onSelect={openLog} />
        {settlement ? (
          <div className="wellbeing-settlement" role="status">
            <ShieldCheck size={15} />
            <span>{settlement.message}</span>
            {settlement.archived ? (
              <Button
                tone="link"
                loading={restoreArchive.isPending}
                onClick={() => restoreArchive.mutate(settlement.archived!)}
              >
                Undo archive
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="wellbeing-today-content">
          <DayRhythm
            records={records}
            now={clock}
            complete={chronologyComplete && !todayRetainedError}
            stale={todayRetainedError}
            restrictedOmitted={restrictedOmitted}
            onOpen={openRecord}
            hasMore={Boolean(today.hasNextPage)}
            loadingMore={today.isFetchingNextPage}
            onLoadMore={() => void today.fetchNextPage()}
            pageError={todayNextPageError}
            onRetryPage={() => void today.fetchNextPage()}
            onJumpToLatest={() => jumpToTarget(signalsTarget.current)}
            onJumpToUpcoming={() => jumpToTarget(upcomingTarget.current)}
          />
          <aside className="wellbeing-today-side" aria-label="Today context">
            <TodaySignals
              records={records}
              stale={todayRetainedError}
              sectionRef={signalsTarget}
            />
            <UpcomingCare
              records={upcoming.data?.items ?? []}
              loading={upcoming.isLoading}
              unavailable={upcoming.isError}
              restrictedOmitted={Boolean(
                upcoming.data?.restrictedOmitted ||
                  upcoming.data?.items.some(
                    (record) => record.privacy === "restricted",
                  ),
              )}
              onOpen={openRecord}
              sectionRef={upcomingTarget}
            />
          </aside>
        </div>
      </WellbeingFrame>
      <RecordDetailSheet
        record={visibleSelectedRecord}
        loading={selected.isLoading}
        error={selected.isError || selectedIsRestricted}
        unavailableBody={
          selectedIsRestricted
            ? "This record is Restricted. Today cannot reveal its title or contents without an exact approved access flow."
            : undefined
        }
        open={Boolean(selectedId && (!editing || !selectedSupportsEditing))}
        onClose={closeRecord}
        onEdit={() => setRouteState({ edit: "1" }, true)}
        onArchive={async (record) => {
          const result = await loaders.archive(
            record.id,
            record.version,
            mutationKeys.acquire("archive", record.id, record.version),
          );
          mutationKeys.settle("archive", record.id);
          await refresh();
          closeRecord();
          setSettlement({
            message: `${record.title} archived.`,
            archived: result.record,
          });
          return result.record;
        }}
        onDelete={deletion}
        onAskKora={
          onAskKora && visibleSelectedRecord
            ? (record) =>
                onAskKora(
                  {
                    kind: "wellbeing_record",
                    id: record.id,
                    title: record.title,
                  },
                  "Help me review this exact saved Wellbeing record from Today. Distinguish what is recorded from interpretation, preserve its privacy boundary, and do not diagnose or infer causality.",
                )
            : undefined
        }
      />
      <WellbeingRecordEditor
        open={Boolean(logKind || (editing && selectedSupportsEditing))}
        kind={logKind ?? visibleSelectedRecord?.kind ?? "note"}
        record={editing && selectedSupportsEditing ? visibleSelectedRecord : undefined}
        now={clock}
        finalFocus={editorTrigger}
        onClose={() => {
          if (editing) setRouteState({ edit: undefined }, true);
          else if (routeOpenedHere.current) {
            routeOpenedHere.current = false;
            navigate(-1);
          } else setRouteState({ log: undefined, edit: undefined }, true);
        }}
        loaders={loaders}
        onSaved={async (record) => {
          await refresh();
          if (record.privacy === "restricted") {
            routeOpenedHere.current = false;
            setRouteState({
              record: undefined,
              log: undefined,
              edit: undefined,
            }, true);
            setSettlement({
              message:
                "Restricted record saved. It is omitted from Today until exact access is granted.",
            });
            return;
          }
          setRouteState(
            { record: record.id, log: undefined, edit: undefined },
            true,
          );
        }}
      />
    </section>
  );
}

function WellbeingTodayReadNotice({
  nextPage,
  onRetry,
  loading = false,
}: {
  nextPage: boolean;
  onRetry?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="wellbeing-today-read-notice" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <div>
        <strong>
          {nextPage
            ? "The next Today page could not be loaded."
            : "The latest Today refresh failed."}
        </strong>
        <p>
          {nextPage
            ? "Records already shown remain visible. Retry next page here or by the journal."
            : "The last successful journal remains visible and may be stale. Today is not confirmed current or complete."}
        </p>
        {onRetry ? (
          <Button tone="ghost" loading={loading} onClick={onRetry}>
            {nextPage ? "Retry next page" : "Retry refresh"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TodaySignals({
  records,
  stale,
  sectionRef,
}: {
  records: WellbeingRecord[];
  stale: boolean;
  sectionRef?: RefObject<HTMLElement | null>;
}) {
  const signalKinds = new Set<WellbeingRecordKind>([
    "measurement",
    "observation",
    "symptom",
    "dose",
    "routine_checkin",
  ]);
  const signals = [...records]
    .filter((record) => signalKinds.has(record.kind))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 4);
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="wellbeing-today-signals"
      aria-labelledby="wellbeing-signals-title"
    >
      <div className="wellbeing-section-heading">
        <div>
          <span>Visible records</span>
          <h2 id="wellbeing-signals-title">Latest recorded signals</h2>
        </div>
        <Activity size={17} aria-hidden="true" />
      </div>
      {stale ? (
        <p className="wellbeing-today-signals__qualification">
          Shown from the last successful read; freshness is unconfirmed.
        </p>
      ) : null}
      {signals.length ? (
        <ul>
          {signals.map((record) => (
            <li key={record.id}>
              <span aria-hidden="true">{kindMeta[record.kind]?.icon}</span>
              <span>
                <strong>{record.title}</strong>
                <small>{momentSummary(record)}</small>
              </span>
              <time dateTime={record.recordedAt}>{timeLabel(record.recordedAt)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wellbeing-section-empty">
          <Activity size={15} aria-hidden="true" />
          Measurements, observations, symptoms, doses, and routine check-ins will collect here.
        </p>
      )}
      <Link className="wellbeing-context-link" to="/life/wellbeing/trends">
        Review qualified trends <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}

function UpcomingCare({
  records,
  loading,
  unavailable,
  restrictedOmitted,
  onOpen,
  sectionRef,
}: {
  records: WellbeingRecord[];
  loading: boolean;
  unavailable: boolean;
  restrictedOmitted: boolean;
  onOpen: (id: string, trigger?: HTMLElement | null) => void;
  sectionRef?: RefObject<HTMLElement | null>;
}) {
  const appointments = records
    .filter(
      (record) =>
        record.kind === "appointment" && record.privacy !== "restricted",
    )
    .sort((left, right) => {
      const leftStart = String((left.payload as WellbeingPayloadByKind["appointment"]).startsAt ?? left.recordedAt);
      const rightStart = String((right.payload as WellbeingPayloadByKind["appointment"]).startsAt ?? right.recordedAt);
      return leftStart.localeCompare(rightStart);
    })
    .slice(0, 5);
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="wellbeing-upcoming"
      aria-labelledby="wellbeing-upcoming-title"
    >
      <div className="wellbeing-section-heading">
        <div>
          <span>Seven days</span>
          <h2 id="wellbeing-upcoming-title">Upcoming care</h2>
        </div>
        <CalendarDays size={17} aria-hidden="true" />
      </div>
      {loading ? (
        <p className="wellbeing-section-empty" role="status">Reading upcoming appointments…</p>
      ) : unavailable ? (
        <p className="wellbeing-section-empty"><CircleAlert size={15} aria-hidden="true" />Upcoming appointments could not be read. Today’s local records remain available.</p>
      ) : appointments.length ? (
        <ul>
          {appointments.map((record) => {
            const payload = record.payload as WellbeingPayloadByKind["appointment"];
            return (
              <li key={record.id}>
                <Pressable data-wellbeing-return-id={wellbeingRecordReturnId(record.id)} onClick={(event) => onOpen(record.id, event.currentTarget)}>
                  <CalendarDays size={15} aria-hidden="true" />
                  <span>
                    <strong>{record.title}</strong>
                    <small>{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(payload.startsAt))}</small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </Pressable>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="wellbeing-section-empty"><CalendarDays size={15} aria-hidden="true" />No visible appointments are recorded for the next seven days.</p>
      )}
      {restrictedOmitted ? <p className="wellbeing-restricted-boundary"><ShieldCheck size={14} aria-hidden="true" />Restricted records remain omitted.</p> : null}
    </section>
  );
}

function sourceSummary(
  coverage?: WellbeingSourceCoverage,
  unavailable = false,
  retainedError = false,
) {
  if (unavailable)
    return `${retainedError ? "Local records retained" : "Local records available"} · source coverage unavailable`;
  if (!coverage) return "Reading Wellbeing source coverage";
  if (coverage.state === "local_only")
    return "Local records available · no current external connection";
  const localStatus = retainedError ? "Local records retained" : "Local records current";
  if (coverage.state === "saved_external_records")
    return `${localStatus} · external records last-confirmed`;
  if (coverage.state === "partial")
    return `${localStatus} · connected coverage partial`;
  return `${localStatus} · connected coverage unavailable`;
}

function WellbeingSourceNotice({
  coverage,
  unavailable,
  retrying,
  onRetry,
}: {
  coverage?: WellbeingSourceCoverage;
  unavailable: boolean;
  retrying: boolean;
  onRetry: (trigger: HTMLElement) => void;
}) {
  if (!unavailable && (!coverage || coverage.state === "local_only"))
    return null;
  const affected =
    coverage?.external.filter(
      (source) =>
        source.state === "partial" ||
        source.state === "unavailable" ||
        source.state === "not_configured" ||
        source.state === "permission_restricted",
      ) ?? [];
  const retryable = unavailable || coverage?.state === "unavailable" || affected.some(
    (source) => source.state === "partial" || source.state === "unavailable",
  );
  const providerSettings = affected.some(
    (source) =>
      source.kind === "provider" &&
      (source.state === "not_configured" || source.state === "permission_restricted"),
  );
  const message = unavailable
    ? "Source coverage could not be read. Local logging and local records remain available."
    : coverage!.state === "saved_external_records"
      ? "Saved provider or imported records remain visible. A current external connection has not been confirmed."
      : `Connected Wellbeing coverage is ${coverage!.state}. Local logging and saved local records remain available.`;
  return (
    <div className="wellbeing-source-notice" role="status">
      <CircleAlert size={15} />
      <div className="wellbeing-source-notice__body">
        <span>{message}</span>
        {affected.length ? (
          <small>
            Affected: {affected.map((source) => source.label).join(", ")}.
          </small>
        ) : null}
        {retryable ? (
          <Button
            tone="link"
            className="wellbeing-source-notice__action"
            loading={retrying}
            data-wellbeing-source-retry="true"
            onClick={(event) => onRetry(event.currentTarget)}
          >
            Retry source coverage
          </Button>
        ) : null}
        {providerSettings ? (
          <Link
            className="button button--link wellbeing-source-notice__action"
            to="/settings/integrations"
          >
            Review connections
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TodayQuickLog({
  onSelect,
}: {
  onSelect: (kind: WellbeingRecordKind, trigger?: HTMLElement | null) => void;
}) {
  const moreTrigger = useRef<HTMLButtonElement | null>(null),
    primaryKinds = LOG_KINDS.filter((item) =>
      TODAY_QUICK_KINDS.includes(item.kind),
    ),
    moreKinds = LOG_KINDS.filter(
      (item) => !TODAY_QUICK_KINDS.includes(item.kind),
    );
  return (
    <section className="wellbeing-quick-log" aria-labelledby="wellbeing-quick-log-title">
      <div>
        <strong id="wellbeing-quick-log-title">Add to today’s rhythm</strong>
      </div>
      <div className="wellbeing-quick-log__actions">
        {primaryKinds.map((item) => (
          <Button
            key={item.kind}
            data-wellbeing-return-fallback={item.kind === primaryKinds[0]?.kind || undefined}
            tone={item.kind === "meal" ? "primary" : "secondary"}
            onClick={(event) => onSelect(item.kind, event.currentTarget)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
        <LogKindMenu
          label="More"
          items={moreKinds}
          onSelect={onSelect}
          firstActionRef={moreTrigger}
        />
      </div>
    </section>
  );
}

function LogKindMenu({
  onSelect,
  tone = "secondary",
  firstActionRef,
  items = LOG_KINDS,
  label = "Log",
}: {
  onSelect: (kind: WellbeingRecordKind, trigger?: HTMLElement | null) => void;
  tone?: "primary" | "secondary";
  firstActionRef?: RefObject<HTMLButtonElement | null>;
  items?: typeof LOG_KINDS;
  label?: string;
}) {
  return (
    <Menu
      align="end"
      trigger={
        <Button ref={firstActionRef} tone={tone}>
          <Plus size={15} />
          {label}
        </Button>
      }
      actions={items.map((item) => ({
        id: item.kind,
        label: item.label,
        description: item.description,
        icon: item.icon,
        onSelect: () => onSelect(item.kind, firstActionRef?.current),
      }))}
    />
  );
}

function DayRhythm({
  records,
  now,
  complete,
  stale,
  restrictedOmitted,
  onOpen,
  hasMore,
  loadingMore,
  onLoadMore,
  pageError,
  onRetryPage,
  onJumpToLatest,
  onJumpToUpcoming,
}: {
  records: WellbeingRecord[];
  now: Date;
  complete: boolean;
  stale: boolean;
  restrictedOmitted: boolean;
  onOpen: (id: string, trigger?: HTMLElement | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  pageError: boolean;
  onRetryPage: () => void;
  onJumpToLatest: () => void;
  onJumpToUpcoming: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [focusGroupKey, setFocusGroupKey] = useState<string>();
  const groupHeaderRefs = useRef(new Map<string, HTMLButtonElement>());
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => groupMoments(records, now), [now, records]);
  const firstFutureIndex = groups.findIndex(
    (group) => new Date(group.records[0].recordedAt).getTime() > now.getTime(),
  );
  useEffect(() => {
    if (!focusGroupKey) return;
    groupHeaderRefs.current.get(focusGroupKey)?.focus();
    setFocusGroupKey(undefined);
  }, [expanded, focusGroupKey]);
  const toggleGroup = (groupKey: string, groupSize: number) => {
    const isCurrentlyExpanded = expanded.has(groupKey);
    setExpanded((current) => {
      const next = new Set(current);
      isCurrentlyExpanded ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
    if (isCurrentlyExpanded) {
      setVisibleCounts((counts) => {
        const nextCounts = { ...counts };
        delete nextCounts[groupKey];
        return nextCounts;
      });
      setFocusGroupKey(groupKey);
    } else {
      setVisibleCounts((counts) => ({
        ...counts,
        [groupKey]: Math.min(DENSE_GROUP_INITIAL_WINDOW, groupSize),
      }));
    }
  };
  const showNextGroupWindow = (groupKey: string, groupSize: number) => {
    setVisibleCounts((counts) => ({
      ...counts,
      [groupKey]: Math.min(
        groupSize,
        (counts[groupKey] ?? DENSE_GROUP_INITIAL_WINDOW) + DENSE_GROUP_WINDOW_STEP,
      ),
    }));
  };
  return (
    <section className="wellbeing-rhythm" aria-labelledby="day-rhythm-title">
      <div className="wellbeing-section-heading">
        <div>
          <span>Chronology</span>
          <h2 id="day-rhythm-title">Today’s journal</h2>
          {records.length ? (
            <small className="wellbeing-rhythm__range">
              Showing {journalRange(records)}
            </small>
          ) : null}
        </div>
        <Badge tone={complete ? "neutral" : "warning"}>
          {records.length
            ? stale
              ? `${records.length} retained · freshness unknown`
              : complete
              ? `${records.length} visible ${records.length === 1 ? "entry" : "entries"}`
              : `${records.length} loaded · more available`
            : complete
              ? "No visible records"
              : "No records loaded · more available"}
          </Badge>
      </div>
      <div className="wellbeing-rhythm__navigation" role="group" aria-label="Journal shortcuts">
        <Button tone="link" onClick={onJumpToLatest}>
          Latest signals
        </Button>
        <Button tone="link" onClick={onJumpToUpcoming}>
          Upcoming care
        </Button>
        {hasMore ? (
          <Button tone="link" onClick={() => focusTodayTarget(pagerRef.current)}>
            Earlier records
          </Button>
        ) : null}
      </div>
      <div className="wellbeing-rhythm__rail">
        {groups.length === 0 ? (
          <div className="wellbeing-rhythm__empty">
            <span aria-hidden="true" />
            <i />
            <div>
              <strong>Your day starts here</strong>
              <p>
                Log a meal, observation, symptom, measurement, routine,
                medication, or note.
              </p>
            </div>
          </div>
        ) : (
          groups.map((group, index) => {
            const isDense = group.records.length > 3;
            const isExpanded = expanded.has(group.key);
            const visibleCount = isExpanded
              ? Math.min(
                  group.records.length,
                  visibleCounts[group.key] ?? DENSE_GROUP_INITIAL_WINDOW,
                )
              : Math.min(1, group.records.length);
            const visibleRecords = !isDense
              ? group.records
              : isExpanded
                ? group.records.slice(0, visibleCount)
                : group.records.slice(0, 1);
            const groupId = `wellbeing-group-${index}`;
            const noun = group.isMeasurementGroup ? "exact readings" : "entries";
            const groupLabel = group.isMeasurementGroup
              ? measurementGroupLabel(group.records)
              : `${group.records.length} entries at ${timeLabel(group.records[0].recordedAt)}`;
            const headerLabel = isExpanded
              ? "Collapse group"
              : `Show first ${Math.min(DENSE_GROUP_INITIAL_WINDOW, group.records.length)} ${noun}`;
            return <div key={group.key} className="wellbeing-rhythm__moment-group">
              {firstFutureIndex === index ? <NowMarker now={now} /> : null}
              {isDense ? (
                <div className="wellbeing-batch-header">
                  {group.isMeasurementGroup ? (
                    <div className="wellbeing-measurement-group__summary">
                      <strong>{measurementGroupLabel(group.records)}</strong>
                      <span>
                        {group.records.length} readings · {measurementGroupRange(group.records)}
                      </span>
                      <small>{sourceLabel(group.records[0])}</small>
                    </div>
                  ) : (
                    <span className="wellbeing-batch-header__summary">
                      {group.records.length} entries at {timeLabel(group.records[0].recordedAt)}
                    </span>
                  )}
                  <span className="wellbeing-batch-status" role="status">
                    Showing {isExpanded ? visibleCount : Math.min(1, group.records.length)} of {group.records.length} loaded {noun}
                  </span>
                  <Button
                    ref={(element) => {
                      if (element) groupHeaderRefs.current.set(group.key, element);
                      else groupHeaderRefs.current.delete(group.key);
                    }}
                    tone="link"
                    type="button"
                    className="wellbeing-batch-toggle wellbeing-batch-toggle--header"
                    aria-label={`${headerLabel}: ${groupLabel}`}
                    aria-controls={groupId}
                    aria-expanded={isExpanded}
                    onClick={() => toggleGroup(group.key, group.records.length)}
                  >
                    {headerLabel}
                  </Button>
                </div>
              ) : null}
              <div id={groupId}>
              {visibleRecords.map((record, recordIndex) => (
                <Pressable
                  key={record.id}
                  data-wellbeing-return-id={wellbeingRecordReturnId(record.id)}
                  type="button"
                  className={`wellbeing-moment${new Date(record.recordedAt).getTime() > now.getTime() ? " is-future" : ""}`}
                  onClick={(event) => onOpen(record.id, event.currentTarget)}
                >
                  <time dateTime={record.recordedAt}>
                    {recordIndex === 0 || group.isMeasurementGroup
                      ? timeLabel(record.recordedAt)
                      : ""}
                  </time>
                  <i aria-hidden="true" />
                  <span className="wellbeing-moment__card">
                    <span className="wellbeing-moment__identity">
                      <span aria-hidden="true">
                        {kindMeta[record.kind]?.icon ?? (
                          <ClipboardPlus size={16} />
                        )}
                      </span>
                      <strong>{record.title}</strong>
                      <ChevronRight size={15} aria-hidden="true" />
                    </span>
                    <span className="wellbeing-moment__summary">
                      {momentSummary(record)}
                    </span>
                    <small>{sourceLabel(record)}</small>
                  </span>
                </Pressable>
              ))}
              </div>
              {isDense && isExpanded && visibleCount < group.records.length ? (
                <Button
                  tone="link"
                  type="button"
                  className="wellbeing-batch-toggle wellbeing-batch-toggle--footer"
                  aria-controls={groupId}
                  aria-label={`Show next ${Math.min(DENSE_GROUP_WINDOW_STEP, group.records.length - visibleCount)} ${noun}: ${groupLabel}`}
                  onClick={() => showNextGroupWindow(group.key, group.records.length)}
                >
                  Show next {Math.min(DENSE_GROUP_WINDOW_STEP, group.records.length - visibleCount)} {noun}
                </Button>
              ) : null}
              {isDense && isExpanded ? (
                <Button
                  tone="link"
                  type="button"
                  className="wellbeing-batch-toggle wellbeing-batch-toggle--footer"
                  aria-controls={groupId}
                  aria-expanded={isExpanded}
                  aria-label={`Collapse group: ${groupLabel}`}
                  onClick={() => toggleGroup(group.key, group.records.length)}
                >
                  Collapse group
                </Button>
              ) : null}
            </div>
          })
        )}
        {firstFutureIndex < 0 ? <NowMarker now={now} /> : null}
        {restrictedOmitted ? (
          <div className="wellbeing-restricted-boundary">
            <span aria-hidden="true">
              <ShieldCheck size={14} />
            </span>
            <p>Restricted records are omitted from this chronology.</p>
          </div>
        ) : null}
        {hasMore ? (
          <div
            ref={pagerRef}
            tabIndex={-1}
            role="group"
            aria-label="Earlier journal records"
            className="wellbeing-rhythm__more"
          >
            <Button
              tone="secondary"
              loading={loadingMore}
              onClick={onLoadMore}
            >
              Load earlier records
            </Button>
            <small>The chronology is partial until all pages are loaded.</small>
            {pageError ? (
              <div className="wellbeing-rhythm__page-error" role="status">
                <span>Earlier records could not be loaded. Your journal is still here.</span>
                <Button tone="ghost" loading={loadingMore} onClick={onRetryPage}>
                  Retry earlier records
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function serializeTuple(values: readonly string[]) {
  return JSON.stringify(values);
}

export function groupMoments(records: WellbeingRecord[], now: Date) {
  const groups = new Map<
    string,
    { key: string; records: WellbeingRecord[]; isMeasurementGroup: boolean }
  >();
  [...records]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .forEach((record) => {
      const payload = record.payload as Record<string, unknown>;
      const isFuture = new Date(record.recordedAt).getTime() > now.getTime();
      const sourceKey = serializeTuple([
        record.source.kind,
        record.source.providerId ?? "",
        record.source.sourceId ?? "",
        record.source.label,
      ]);
      const key =
        record.kind === "measurement"
          ? serializeTuple([
              "measurement",
              String(payload.metric ?? record.title),
              String(payload.unit ?? ""),
              sourceKey,
              isFuture ? "future" : "past",
            ])
          : serializeTuple([
              "moment",
              record.kind,
              record.recordedAt.slice(0, 16),
              sourceKey,
              isFuture ? "future" : "past",
            ]);
      const group = groups.get(key);
      if (group) group.records.push(record);
      else
        groups.set(key, {
          key,
          records: [record],
          isMeasurementGroup: record.kind === "measurement",
        });
    });
  return [...groups.values()];
}

function measurementGroupLabel(records: WellbeingRecord[]) {
  const payload = records[0]?.payload as Record<string, unknown> | undefined;
  return `${String(payload?.metric ?? records[0]?.title ?? "Measurement")} · ${String(payload?.unit ?? "")}`.trim();
}

function measurementGroupRange(records: WellbeingRecord[]) {
  const first = records[0], last = records.at(-1);
  if (!first || !last) return "";
  const start = timeLabel(first.recordedAt), end = timeLabel(last.recordedAt);
  return start === end ? start : `${start}–${end}`;
}

function journalRange(records: WellbeingRecord[]) {
  const sorted = [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const first = sorted[0], last = sorted.at(-1);
  if (!first || !last) return "no records";
  const start = timeLabel(first.recordedAt), end = timeLabel(last.recordedAt);
  return start === end ? start : `${start}–${end}`;
}

function focusTodayTarget(target: HTMLElement | null) {
  if (!target) return;
  target.scrollIntoView?.({ behavior: "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

function NowMarker({ now }: { now: Date }) {
  return (
    <div
      role="group"
      className="wellbeing-now-marker"
      aria-label={`Current time ${timeLabel(now.toISOString())}`}
    >
      <time>{timeLabel(now.toISOString())}</time>
      <i />
      <span>Now</span>
    </div>
  );
}

type WellbeingDeleteController = {
  request: (
    record: WellbeingRecord,
    requestKey: string,
  ) => Promise<WellbeingDeletionOutcome>;
  approve: (confirmationId: string) => Promise<unknown>;
  reject: (confirmationId: string) => Promise<unknown>;
  onDeleted: (
    record: WellbeingRecord,
    outcome: Extract<WellbeingDeletionOutcome, { status: "settled" | "gone" }>,
  ) => Promise<void> | void;
  onStale?: (record: WellbeingRecord) => Promise<void> | void;
};

export function RecordDetailSheet({
  record,
  loading,
  error,
  open,
  onClose,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onAskKora,
  koraTitle = "Review this record with Kora",
  koraDescription =
    "Send only this selected record to Kora for a focused review; its privacy setting stays in effect.",
  koraActionLabel = "Review with Kora",
  detailSupplement,
  returnLabel = "Today",
  chromeTitle,
  closeLabel,
  unavailableBody = "This record could not be read. Close this panel and retry from the chronology.",
  editableKinds,
  suppressGenericCarePlanRelation = false,
}: {
  record?: WellbeingRecord;
  loading: boolean;
  error: boolean;
  open: boolean;
  onClose: () => void;
  onEdit: (trigger?: HTMLElement | null) => void;
  onArchive?: (record: WellbeingRecord) => Promise<WellbeingRecord>;
  onRestore?: (record: WellbeingRecord) => Promise<WellbeingRecord>;
  onDelete?: WellbeingDeleteController;
  onAskKora?: (record: WellbeingRecord) => void;
  koraTitle?: string;
  koraDescription?: string;
  koraActionLabel?: string;
  detailSupplement?: (record: WellbeingRecord) => ReactNode;
  returnLabel?: string;
  chromeTitle?: string;
  closeLabel?: string;
  unavailableBody?: string;
  editableKinds?: readonly WellbeingRecordKind[];
  suppressGenericCarePlanRelation?: boolean;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false),
    [deleteMode, setDeleteMode] = useState(false),
    [deleteOutcome, setDeleteOutcome] = useState<WellbeingDeletionOutcome>(),
    [deleteError, setDeleteError] = useState<string>();
  const deleteRequestKey = useRef(crypto.randomUUID()),
    detailTitleRef = useRef<HTMLElement | null>(null),
    deleteAlertRef = useRef<HTMLDivElement | null>(null),
    archiveAlertRef = useRef<HTMLDivElement | null>(null),
    terminalRef = useRef<HTMLDivElement | null>(null),
    closingRecordRef = useRef<WellbeingRecord | undefined>(undefined);
  useLayoutEffect(() => {
    if (record) closingRecordRef.current = record;
    else if (open) closingRecordRef.current = undefined;
  }, [open, record]);
  const displayRecord = record ?? (!open ? closingRecordRef.current : undefined);
  const displayTitle = displayRecord
    ? wellbeingRecordDisplayTitle(displayRecord)
    : "Wellbeing record";
  const lifecycle = useMutation({
    mutationFn: () =>
      record?.state === "archived"
        ? onRestore!(record)
        : onArchive!(record!),
  });
  const deletion = useMutation({
    mutationFn: () => onDelete!.request(record!, deleteRequestKey.current),
    onSuccess: async (outcome) => {
      setDeleteOutcome(outcome);
      setDeleteError(undefined);
      if ((outcome.status === "settled" || outcome.status === "gone") && record)
        await onDelete?.onDeleted(record, outcome);
    },
    onError: (reason) =>
      setDeleteError(
        reason instanceof Error
          ? reason.message
          : "Deletion could not be settled.",
      ),
  });
  useEffect(() => {
    if (!open) {
      setConfirmArchive(false);
      setDeleteMode(false);
      setDeleteOutcome(undefined);
      setDeleteError(undefined);
      deleteRequestKey.current = crypto.randomUUID();
    }
  }, [open, record?.id]);
  useEffect(() => {
    if (!deleteMode) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (typeof deleteAlertRef.current?.scrollIntoView === "function")
          deleteAlertRef.current.scrollIntoView({ block: "nearest" });
        deleteAlertRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [deleteMode, deleteOutcome?.status]);
  useEffect(() => {
    if (!confirmArchive) return;
    const frame = requestAnimationFrame(() =>
      archiveAlertRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [confirmArchive]);
  useEffect(() => {
    if (!open || loading || (!error && record)) return;
    const frame = requestAnimationFrame(() =>
      terminalRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [error, loading, open, record]);
  const waiting =
    deleteOutcome?.status === "waiting_confirmation"
      ? deleteOutcome
      : undefined;
  const stale = deleteOutcome?.status === "stale" ? deleteOutcome : undefined;
  const cancelDelete = async () => {
    if (waiting)
      await Promise.allSettled(
        waiting.confirmations.map((confirmation) =>
          onDelete?.reject(confirmation.confirmationId),
        ),
      );
    setDeleteMode(false);
    setDeleteOutcome(undefined);
    setDeleteError(undefined);
  };
  const confirmDelete = async () => {
    if (!waiting || !onDelete) return;
    try {
      await Promise.all(
        waiting.confirmations.map((confirmation) =>
          onDelete.approve(confirmation.confirmationId),
        ),
      );
      await deletion.mutateAsync();
    } catch (reason) {
      setDeleteError(
        reason instanceof Error
          ? reason.message
          : "Kora could not approve this deletion. The record was not removed.",
      );
    }
  };
  const reopenAfterStale = async () => {
    if (record) await onDelete?.onStale?.(record);
    setDeleteMode(false);
    setDeleteOutcome(undefined);
    setDeleteError(undefined);
  };
  const canEdit = Boolean(
    record &&
      (editableKinds
        ? editableKinds.includes(record.kind)
        : Boolean(kindMeta[record.kind])),
  );
  const actions = record ? (
    confirmArchive ? (
      <>
        <Button tone="ghost" onClick={() => setConfirmArchive(false)}>
          Keep record
        </Button>
        <Button
          tone="danger"
          loading={lifecycle.isPending}
          onClick={() => lifecycle.mutate()}
        >
          Archive record
        </Button>
      </>
    ) : deleteMode ? (
      <>
        <Button tone="ghost" onClick={() => void cancelDelete()}>
          Keep record
        </Button>
        {waiting ? (
          <Button
            tone="danger"
            loading={deletion.isPending}
            onClick={() => void confirmDelete()}
          >
            Delete permanently
          </Button>
        ) : stale ? (
          <Button tone="secondary" onClick={() => void reopenAfterStale()}>
            Refresh latest
          </Button>
        ) : (
          <Button
            tone="danger"
            loading={deletion.isPending}
            onClick={() => deletion.mutate()}
          >
            Review deletion
          </Button>
        )}
      </>
    ) : (
      <>
        {canEdit && record.state === "active" ? (
          <Button tone="ghost" onClick={(event) => onEdit(event.currentTarget)}>
            Edit
          </Button>
        ) : null}
        {record.state === "archived" ? (
          onRestore ? (
            <Button
              tone="secondary"
              loading={lifecycle.isPending}
              onClick={() => lifecycle.mutate()}
            >
              Restore
            </Button>
          ) : null
        ) : onArchive ? (
          <Button tone="secondary" onClick={() => setConfirmArchive(true)}>
            Archive
          </Button>
        ) : null}
        {onDelete ? (
          <Button tone="danger" onClick={() => setDeleteMode(true)}>
            <Trash2 size={14} />
            Delete
          </Button>
        ) : null}
      </>
    )
  ) : undefined;
  const close = () => {
    if (deleteMode) void cancelDelete();
    onClose();
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && open) close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) closingRecordRef.current = undefined;
      }}
      title={chromeTitle ?? displayTitle}
      description="Saved record, time, privacy, and source."
      purpose="inspector"
      closeLabel={closeLabel ?? `Close ${displayTitle}`}
      initialFocus={
        loading ? true : error || (open && !displayRecord) ? terminalRef : displayRecord ? detailTitleRef : true
      }
      actions={actions}
    >
      {loading ? (
        <StateView
          state="loading"
          title="Opening record"
          body="Reading saved details."
        />
      ) : error || (open && !displayRecord) ? (
        <div ref={terminalRef} tabIndex={-1}>
          <StateView
            state="error"
            title="Record unavailable"
            body={unavailableBody}
            action={<Button onClick={onClose}>Return to {returnLabel}</Button>}
          />
        </div>
      ) : displayRecord ? (
        <div className="wellbeing-record-detail">
          <div className="wellbeing-record-detail__hero">
            <span aria-hidden="true">
              {kindMeta[displayRecord.kind]?.icon ?? <ClipboardPlus size={18} />}
            </span>
            <div>
              <Badge tone="neutral">
                {kindMeta[displayRecord.kind]?.label ?? displayRecord.kind}
              </Badge>
              <strong
                ref={detailTitleRef}
                className="wellbeing-record-detail__title"
                tabIndex={-1}
              >
                {displayTitle}
              </strong>
              {(() => {
                const summary = momentSummary(displayRecord).trim();
                return displayRecord.kind !== "routine_checkin" && summary && summary !== displayRecord.title.trim() ? (
                  <p>{summary}</p>
                ) : null;
              })()}
            </div>
          </div>
          <RecordPayloadDetail
            record={displayRecord}
            suppressGenericCarePlanRelation={suppressGenericCarePlanRelation}
          />
          {record ? detailSupplement?.(record) : null}
          {record && onAskKora ? (
            <div className="wellbeing-record-detail__kora">
              <div>
                <MessageCircleMore size={16} aria-hidden="true" />
                <div>
                  <strong>{koraTitle}</strong>
                  <p>{koraDescription}</p>
                </div>
              </div>
              <Button tone="secondary" onClick={() => onAskKora(record)}>
                {koraActionLabel}
              </Button>
            </div>
          ) : null}
          <dl aria-label="Record history and handling">
            <div>
              <dt>Recorded</dt>
              <dd>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(displayRecord.recordedAt))}
              </dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>
                {displayRecord.privacy === "restricted" ? "Restricted" : "Private"}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{sourceLabel(displayRecord)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(displayRecord.updatedAt))}
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{displayRecord.version}</dd>
            </div>
          </dl>
          <Disclosure
            summary="Advanced provenance"
            description="Stable identifiers for this exact permitted record."
          >
            <dl aria-label="Advanced record provenance">
               <div><dt>Record ID</dt><dd>{displayRecord.id}</dd></div>
               {displayRecord.kind === "routine_checkin" && displayTitle !== displayRecord.title ? <div><dt>Saved title</dt><dd>{displayRecord.title}</dd></div> : null}
               <div><dt>Version</dt><dd>{displayRecord.version}</dd></div>
               {displayRecord.source.providerId ? <div><dt>Provider ID</dt><dd>{displayRecord.source.providerId}</dd></div> : null}
               {displayRecord.source.sourceId ? <div><dt>Source record ID</dt><dd>{displayRecord.source.sourceId}</dd></div> : null}
            </dl>
          </Disclosure>
          {confirmArchive ? (
            <div ref={archiveAlertRef} tabIndex={-1} className="wellbeing-archive-confirm" role="alert">
               <strong>Archive {displayRecord.title}?</strong>
              <p>
                It will leave Today and active Wellbeing views. You can undo
                immediately after archiving.
              </p>
            </div>
          ) : null}
          {deleteMode ? (
            <div
              ref={deleteAlertRef}
              tabIndex={-1}
              className="wellbeing-delete-confirm"
              role="alert"
            >
              <Trash2 size={17} />
              <div>
                <strong>
                  {waiting
                     ? `Delete ${displayRecord.title} permanently?`
                    : stale
                       ? `${displayRecord.title} changed before deletion`
                      : "Review permanent deletion"}
                </strong>
                <p>
                  {waiting
                    ? waiting.consequence
                    : stale
                      ? stale.message
                      : "Kora will bind this request to the exact record and current version. Nothing is removed until the exact approval settles."}
                </p>
                {deleteOutcome &&
                deleteOutcome.status !== "waiting_confirmation" &&
                deleteOutcome.status !== "settled" &&
                deleteOutcome.status !== "gone" &&
                deleteOutcome.status !== "stale" ? (
                  <small>{deleteOutcome.message}</small>
                ) : null}
              </div>
            </div>
          ) : null}
          {lifecycle.isError ? (
            <p role="alert" className="wellbeing-form-error">
              {lifecycle.error.message}
            </p>
          ) : null}
          {deleteError ? (
            <p role="alert" className="wellbeing-form-error">
              {deleteError}
            </p>
          ) : null}
        </div>
       ) : null}
    </Sheet>
  );
}

function RecordPayloadDetail({
  record,
  suppressGenericCarePlanRelation = false,
}: {
  record: WellbeingRecord;
  suppressGenericCarePlanRelation?: boolean;
}) {
  const payload = record.payload as Record<string, unknown>,
    rows: Array<{ label: string; value: string }> = [];
  if (record.kind === "meal") {
    const foods = Array.isArray(payload.foods)
      ? payload.foods.map(String).filter(Boolean)
      : [];
    const tags = Array.isArray(payload.tags)
      ? payload.tags.map(String).filter(Boolean)
      : [];
    if (payload.description)
      rows.push({
        label: "Original description",
        value: String(payload.description),
      });
    if (foods.length)
      rows.push({ label: "Confirmed foods", value: foods.join(", ") });
    if (tags.length) rows.push({ label: "Tags", value: tags.join(", ") });
    if (payload.mealType)
      rows.push({ label: "Meal type", value: String(payload.mealType) });
    const interpretation = payload.interpretation as
      | {
          state?: string;
          items?: Array<{ name?: string; portion?: string }>;
        }
      | undefined;
    if (interpretation?.state === "proposed")
      rows.push({
        label: "Structured interpretation",
        value: "Proposed—not confirmed",
      });
    else if (interpretation?.state === "confirmed")
      rows.push({
        label: "Structured interpretation",
        value: "Confirmed by you",
      });
    const evidence = payload.evidence as
      { state?: string; label?: string } | undefined;
    if (evidence)
      rows.push({
        label: "Linked evidence",
        value:
          evidence.state === "available"
            ? String(evidence.label ?? "Available")
            : `${String(evidence.label ?? "Evidence")} · unavailable`,
      });
  } else if (record.kind === "drink") {
    if (payload.name)
      rows.push({ label: "Drink", value: String(payload.name) });
    if (typeof payload.volumeMl === "number")
      rows.push({ label: "Recorded volume", value: `${payload.volumeMl} ml` });
  } else if (record.kind === "observation") {
    rows.push({
      label: "Observation type",
      value: String(payload.category ?? "Other"),
    });
    if (payload.value)
      rows.push({ label: "Observation", value: String(payload.value) });
    if (typeof payload.rating === "number")
      rows.push({ label: "Your rating", value: `${payload.rating} of 5` });
  } else if (record.kind === "symptom") {
    rows.push({
      label: "Symptom",
      value: String(payload.name ?? record.title),
    });
    if (typeof payload.severity === "number")
      rows.push({
        label: "Recorded intensity",
        value: `${payload.severity} of 5`,
      });
  } else if (record.kind === "measurement") {
    rows.push({
      label: "Measurement",
      value: String(payload.metric ?? record.title),
    });
    if (typeof payload.value === "number" && payload.unit)
      rows.push({
        label: "Recorded value",
        value: `${payload.value} ${String(payload.unit)}`,
      });
  } else if (record.kind === "medication_plan") {
    rows.push({
      label: "Medication",
      value: String(payload.medication ?? record.title),
    });
    rows.push({
      label: "Recorded instructions",
      value: String(payload.instructions ?? "Not recorded"),
    });
    if (payload.schedule)
      rows.push({
        label: "Recorded schedule",
        value: String(payload.schedule),
      });
    if (payload.prescriber)
      rows.push({ label: "Source note", value: String(payload.prescriber) });
    rows.push({
      label: "Plan state",
      value: payload.active === false ? "Inactive" : "Active",
    });
  } else if (record.kind === "dose") {
    rows.push({
      label: "Medication",
      value: String(payload.medication ?? record.title),
    });
    if (payload.amount)
      rows.push({ label: "Recorded amount", value: String(payload.amount) });
    rows.push({
      label: "Recorded status",
      value: String(payload.status ?? "Unknown"),
    });
    if (payload.takenAt)
      rows.push({
        label: "Actual time",
        value: new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(String(payload.takenAt))),
      });
  } else if (record.kind === "appointment") {
    rows.push({
      label: "Starts",
      value: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(String(payload.startsAt ?? record.recordedAt))),
    });
    if (payload.clinician)
      rows.push({ label: "Provider", value: String(payload.clinician) });
    if (payload.specialty)
      rows.push({ label: "Specialty", value: String(payload.specialty) });
    if (payload.location)
      rows.push({ label: "Location", value: String(payload.location) });
  } else if (record.kind === "care_document") {
    rows.push({
      label: "Document",
      value: String(payload.name ?? record.title),
    });
    if (payload.artifactId)
      rows.push({
        label: "Evidence reference",
        value:
          "A reference is recorded. Its availability is not verified in Care.",
      });
  } else if (record.kind === "routine") {
    rows.push({
      label: "Cadence",
      value: String(payload.cadence ?? "Not recorded"),
    });
    rows.push({
      label: "Preferred window",
      value: String(payload.preferredWindow ?? "Anytime"),
    });
    const days = Array.isArray(payload.daysOfWeek)
      ? payload.daysOfWeek
          .map(Number)
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [];
    if (days.length)
      rows.push({
        label: "Scheduled days",
        value: days
          .map(
            (day) =>
              [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ][day],
          )
          .join(", "),
      });
    if (payload.cue)
      rows.push({ label: "Cue or time", value: String(payload.cue) });
    if (payload.reason)
      rows.push({ label: "Why it matters", value: String(payload.reason) });
    const choices = Array.isArray(payload.completionChoices)
      ? payload.completionChoices.map(String)
      : [];
    if (choices.length)
      rows.push({
        label: "Supported responses",
        value: choices
          .map((choice) =>
            choice === "done"
              ? "Complete"
              : choice === "skipped"
                ? "Skip"
                : choice,
          )
          .join(", "),
      });
    rows.push({
      label: "Routine state",
      value: payload.enabled === false ? "Paused" : "Active",
    });
    if (payload.noteRequired)
      rows.push({ label: "Response note", value: "Required" });
    if (payload.carePlanId && !suppressGenericCarePlanRelation)
      rows.push({
        label: "Related care plan",
        value:
          "A care-plan relation is recorded. Open Care to review the exact plan.",
      });
  } else if (record.kind === "routine_checkin") {
    rows.push({
      label: "Response",
      value:
        payload.status === "done"
          ? "Complete"
          : payload.status === "skipped"
            ? "Skipped"
            : "Unknown",
    });
  }
  if (payload.notes)
    rows.push({ label: "Notes", value: String(payload.notes) });
  if (!rows.length) return null;
  return (
    <section
      className="wellbeing-record-detail__payload"
      aria-labelledby="wellbeing-record-content"
    >
      <h3 id="wellbeing-record-content">Recorded content</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type EditorDraft = {
  title: string;
  recordedAt: string;
  privacy: "private" | "restricted";
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  notes: string;
  select: string;
  rating: string;
  enabled: boolean;
};

function conflictPayloadSummary(payload: Record<string, unknown>) {
  const entries = Object.entries(payload).filter(
    ([, value]) => value !== undefined && value !== "" && value !== null,
  );
  if (!entries.length) return "No recorded fields";
  return entries
    .map(([key, value]) => {
      const readable = Array.isArray(value)
        ? value.join(", ") || "None"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      return `${key}: ${readable}`;
    })
    .join(" · ");
}

function localDateTime(value: string) {
  const date = new Date(value),
    offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function editorDraft(
  kind: WellbeingRecordKind,
  record?: WellbeingRecord,
  defaultNow = new Date(),
): EditorDraft {
  const payload = (record?.payload ?? {}) as Record<string, unknown>,
    now = record?.recordedAt ?? defaultNow.toISOString();
  const common = {
    title: record?.title ?? "",
    recordedAt: localDateTime(now),
    privacy: record?.privacy ?? ("private" as const),
    notes: String(payload.notes ?? ""),
    rating: String(payload.rating ?? payload.severity ?? ""),
    quaternary: "",
    enabled: true,
  };
  if (kind === "meal") {
    const foods = Array.isArray(payload.foods)
        ? payload.foods.map(String).filter(Boolean)
        : [],
      tags = Array.isArray(payload.tags)
        ? payload.tags.map(String).filter(Boolean)
        : [];
    return {
      ...common,
      primary: String(payload.description ?? "").trim() || foods.join(", "),
      secondary: foods.join(", "),
      tertiary: tags.join(", "),
      select: String(payload.mealType ?? "meal"),
    };
  }
  if (kind === "drink")
    return {
      ...common,
      primary: String(payload.name ?? ""),
      secondary: payload.volumeMl == null ? "" : String(payload.volumeMl),
      tertiary: "",
      select: "",
    };
  if (kind === "observation")
    return {
      ...common,
      primary: String(payload.value ?? ""),
      secondary: "",
      tertiary: "",
      select: String(payload.category ?? "mood"),
    };
  if (kind === "symptom")
    return {
      ...common,
      primary: String(payload.name ?? ""),
      secondary: "",
      tertiary: "",
      select: "",
    };
  if (kind === "measurement")
    return {
      ...common,
      primary: String(payload.metric ?? ""),
      secondary: String(payload.value ?? ""),
      tertiary: String(payload.unit ?? ""),
      select: "",
    };
  if (kind === "medication_plan")
    return {
      ...common,
      primary: String(payload.medication ?? ""),
      secondary: String(payload.instructions ?? ""),
      tertiary: String(payload.schedule ?? ""),
      quaternary: String(payload.prescriber ?? ""),
      select: "",
      enabled: payload.active !== false,
    };
  if (kind === "dose")
    return {
      ...common,
      primary: String(payload.medication ?? ""),
      secondary: String(payload.amount ?? ""),
      tertiary: "",
      select: String(payload.status ?? "taken"),
    };
  if (kind === "appointment")
    return {
      ...common,
      recordedAt: localDateTime(String(payload.startsAt ?? now)),
      primary: String(payload.clinician ?? ""),
      secondary: String(payload.specialty ?? ""),
      tertiary: String(payload.location ?? ""),
      select: "",
    };
  if (kind === "care_document")
    return {
      ...common,
      primary: String(payload.name ?? ""),
      secondary: String(payload.artifactId ?? ""),
      tertiary: "",
      select: "",
    };
  if (kind === "routine_checkin")
    return {
      ...common,
      primary: String(payload.name ?? ""),
      secondary: "",
      tertiary: "",
      select: String(payload.status ?? "done"),
    };
  return {
    ...common,
    primary: String(payload.body ?? ""),
    secondary: "",
    tertiary: "",
    select: "",
  };
}

function payloadFor(
  kind: WellbeingRecordKind,
  draft: EditorDraft,
): WellbeingPayloadByKind[WellbeingRecordKind] {
  if (kind === "meal") {
    const foods = draft.secondary
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      tags = draft.tertiary
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    return {
      description: draft.primary.trim(),
      ...(foods.length ? { foods } : {}),
      ...(tags.length ? { tags } : {}),
      ...(draft.select !== "meal" ? { mealType: draft.select as any } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  }
  if (kind === "drink")
    return {
      name: draft.primary.trim(),
      ...(draft.secondary ? { volumeMl: Number(draft.secondary) } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "observation")
    return {
      category: draft.select as any,
      ...(draft.primary.trim() ? { value: draft.primary.trim() } : {}),
      ...(draft.rating ? { rating: Number(draft.rating) } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "symptom")
    return {
      name: draft.primary.trim(),
      ...(draft.rating ? { severity: Number(draft.rating) } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "measurement")
    return {
      metric: draft.primary.trim(),
      value: Number(draft.secondary),
      unit: draft.tertiary.trim(),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "medication_plan")
    return {
      medication: draft.primary.trim(),
      instructions: draft.secondary.trim(),
      ...(draft.tertiary.trim() ? { schedule: draft.tertiary.trim() } : {}),
      ...(draft.quaternary.trim()
        ? { prescriber: draft.quaternary.trim() }
        : {}),
      active: draft.enabled,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "dose")
    return {
      medication: draft.primary.trim(),
      ...(draft.secondary.trim() ? { amount: draft.secondary.trim() } : {}),
      takenAt: new Date(draft.recordedAt).toISOString(),
      status: draft.select as any,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "appointment")
    return {
      startsAt: new Date(draft.recordedAt).toISOString(),
      ...(draft.primary.trim() ? { clinician: draft.primary.trim() } : {}),
      ...(draft.secondary.trim() ? { specialty: draft.secondary.trim() } : {}),
      ...(draft.tertiary.trim() ? { location: draft.tertiary.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "care_document")
    return {
      name: draft.primary.trim(),
      ...(draft.secondary.trim() ? { artifactId: draft.secondary.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  if (kind === "routine_checkin")
    return {
      name: draft.primary.trim(),
      status: draft.select as any,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
  return { body: draft.primary.trim() };
}

function validEditor(kind: WellbeingRecordKind, draft: EditorDraft) {
  if (
    (!["meal", "drink"].includes(kind) && !draft.title.trim()) ||
    !draft.recordedAt
  )
    return false;
  if (
    [
      "meal",
      "drink",
      "symptom",
      "measurement",
      "medication_plan",
      "dose",
      "care_document",
      "routine_checkin",
      "note",
    ].includes(kind) &&
    !draft.primary.trim()
  )
    return false;
  if (kind === "medication_plan" && !draft.secondary.trim()) return false;
  if (
    kind === "drink" &&
    draft.secondary &&
    (!Number.isFinite(Number(draft.secondary)) || Number(draft.secondary) <= 0)
  )
    return false;
  if (
    kind === "measurement" &&
    (!draft.tertiary.trim() ||
      !draft.secondary ||
      !Number.isFinite(Number(draft.secondary)))
  )
    return false;
  if (
    draft.rating &&
    (!Number.isInteger(Number(draft.rating)) ||
      Number(draft.rating) < 1 ||
      Number(draft.rating) > 5)
  )
    return false;
  return true;
}

function editorErrors(kind: WellbeingRecordKind, draft: EditorDraft) {
  const errors: string[] = [];
  if (!["meal", "drink"].includes(kind) && !draft.title.trim())
    errors.push("Add a title.");
  if (!draft.recordedAt) errors.push("Choose a valid date and time.");
  if (
    [
      "meal",
      "drink",
      "symptom",
      "measurement",
      "medication_plan",
      "dose",
      "care_document",
      "routine_checkin",
      "note",
    ].includes(kind) &&
    !draft.primary.trim()
  )
    errors.push(
      kind === "meal"
        ? "Describe the meal in your own words."
        : kind === "drink"
          ? "Name the drink."
          : kind === "measurement"
            ? "Name the measurement."
            : kind === "medication_plan" || kind === "dose"
              ? "Add the medication name."
              : kind === "care_document"
                ? "Add the document name."
                : kind === "routine_checkin"
                  ? "Add the routine name."
                  : kind === "symptom"
                    ? "Add the symptom."
                    : "Add the note text.",
    );
  if (kind === "medication_plan" && !draft.secondary.trim())
    errors.push("Add the recorded instructions.");
  if (
    kind === "drink" &&
    draft.secondary &&
    (!Number.isFinite(Number(draft.secondary)) || Number(draft.secondary) <= 0)
  )
    errors.push("Use a positive drink volume in milliliters.");
  if (kind === "measurement" && !draft.secondary)
    errors.push("Add the measurement value.");
  if (
    kind === "measurement" &&
    draft.secondary &&
    !Number.isFinite(Number(draft.secondary))
  )
    errors.push("Use a numeric measurement value.");
  if (kind === "measurement" && !draft.tertiary.trim())
    errors.push("Add the measurement unit.");
  if (
    draft.rating &&
    (!Number.isInteger(Number(draft.rating)) ||
      Number(draft.rating) < 1 ||
      Number(draft.rating) > 5)
  )
    errors.push("Choose a rating from 1 to 5.");
  return errors;
}

export function WellbeingRecordEditor({
  open,
  kind,
  record,
  now,
  onClose,
  loaders,
  onSaved,
  finalFocus,
}: {
  open: boolean;
  kind: WellbeingRecordKind;
  record?: WellbeingRecord;
  now: Date;
  onClose: () => void;
  loaders: WellbeingTodayLoaders;
  onSaved: (record: WellbeingRecord) => Promise<void>;
  finalFocus?: React.RefObject<HTMLElement | null>;
}) {
  const [draft, setDraft] = useState(() => editorDraft(kind, record, now)),
    [dirty, setDirty] = useState(false),
    [discardPrompt, setDiscardPrompt] = useState(false),
    [attempted, setAttempted] = useState(false),
    [baseRecord, setBaseRecord] = useState(record),
    [conflictLatest, setConflictLatest] = useState<WellbeingRecord>();
  const formRef = useRef<HTMLFormElement | null>(null),
    initializedKey = useRef<string | undefined>(undefined),
    createRequestKey = useRef(crypto.randomUUID()),
    conflictRef = useRef<HTMLElement | null>(null),
    discardRef = useRef<HTMLDivElement | null>(null),
    errors = editorErrors(kind, draft);
  const mutationKeys = useWellbeingMutationKeys();
  useEffect(() => {
    const key = record ? `record:${record.id}` : `new:${kind}`;
    if (open && initializedKey.current !== key) {
      initializedKey.current = key;
      createRequestKey.current = crypto.randomUUID();
      setDraft(editorDraft(kind, record, now));
      setDirty(false);
      setDiscardPrompt(false);
      setAttempted(false);
      setBaseRecord(record);
      setConflictLatest(undefined);
    }
    if (!open) initializedKey.current = undefined;
  }, [open, kind, record?.id, now]);
  useEffect(() => {
    if (!conflictLatest) return;
    const frame = requestAnimationFrame(() => {
      const conflict = conflictRef.current;
      if (typeof conflict?.scrollIntoView === "function")
        conflict.scrollIntoView({ block: "nearest" });
      conflict?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [conflictLatest]);
  useEffect(() => {
    if (!discardPrompt) return;
    const frame = requestAnimationFrame(() => {
      const prompt = discardRef.current;
      if (typeof prompt?.scrollIntoView === "function")
        prompt.scrollIntoView({ block: "nearest" });
      prompt?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [discardPrompt]);
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = payloadFor(kind, draft),
        recordedAt = new Date(draft.recordedAt).toISOString(),
        title =
          draft.title.trim() ||
          (["meal", "drink"].includes(kind)
            ? draft.primary.trim().slice(0, 80)
            : "");
      if (baseRecord) {
        const changes = {
          title,
          payload,
          recordedAt,
          privacy: draft.privacy,
        } satisfies WellbeingRecordChanges;
        return (
          await loaders.update(
            baseRecord.id,
            baseRecord.version,
            changes,
            mutationKeys.acquire(
              "update",
              baseRecord.id,
              baseRecord.version,
              changes,
            ),
          )
        ).record;
      }
      return (
        await loaders.create({
          kind,
          title,
          payload,
          recordedAt,
          privacy: draft.privacy,
          source: { kind: "manual", label: "Added in Kora" },
        } as WellbeingRecordDraft, createRequestKey.current)
      ).record;
    },
    onSuccess: async (saved) => {
      if (baseRecord) mutationKeys.settle("update", baseRecord.id);
      await onSaved(saved);
    },
    onError: async (error) => {
      if (
        !record ||
        ((!(error instanceof RuntimeRequestError) || error.status !== 409) &&
          !/conflict|changed/i.test(error.message))
      )
        return;
      try {
        setConflictLatest((await loaders.read(record.id)).record);
      } catch {
        /* Preserve the draft and original error if the latest record cannot be read. */
      }
    },
  });
  const update = (changes: Partial<EditorDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
    setDiscardPrompt(false);
  };
  const requestClose = () => (dirty ? setDiscardPrompt(true) : onClose());
  const submit = () => {
    setAttempted(true);
    if (!validEditor(kind, draft)) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>("[aria-invalid='true']")
          ?.focus(),
      );
      return;
    }
    mutation.mutate();
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      title={
        record
          ? `Edit ${kindMeta[kind]?.label ?? "record"}`
          : `Log ${kindMeta[kind]?.label ?? "record"}`
      }
      description={
        record
          ? "This record type is fixed after saving. Review time, privacy, and source before updating."
          : "Saved locally with visible time, privacy, and provenance."
      }
      purpose="properties"
      dismissPolicy="explicit"
      onDismissAttempt={requestClose}
      busy={mutation.isPending}
      finalFocus={finalFocus}
      actions={
        <>
          <Button tone="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button tone="primary" loading={mutation.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        className="wellbeing-record-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="wellbeing-record-editor__kind">
          <span aria-hidden="true">
            {kindMeta[kind]?.icon ?? <ClipboardPlus size={18} />}
          </span>
          <div>
            <strong>{kindMeta[kind]?.label ?? kind}</strong>
            <small>
              {record
                ? "Kind is fixed for this record"
                : kindMeta[kind]?.description}
            </small>
          </div>
        </div>
        {attempted && errors.length ? (
          <div
            className="wellbeing-validation"
            role="alert"
            aria-live="assertive"
          >
            <strong>Review the required fields</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {kind === "meal" ? (
          <Field
            label="What did you have?"
            hint="Required. Describe it naturally; Kora will not infer nutrition from this text."
          >
            <Textarea
              autoFocus
              required
              aria-required="true"
              aria-invalid={attempted && !draft.primary.trim()}
              aria-label="Meal description"
              rows={4}
              value={draft.primary}
              onChange={(event) => update({ primary: event.target.value })}
            />
          </Field>
        ) : null}
        <Field
          label={["meal", "drink"].includes(kind) ? "Short label" : "Title"}
          hint={
            ["meal", "drink"].includes(kind)
              ? "Optional. If omitted, Kora uses the beginning of your description."
              : undefined
          }
        >
          <Input
            autoFocus={kind !== "meal"}
            required={!["meal", "drink"].includes(kind)}
            aria-required={
              !["meal", "drink"].includes(kind) ? "true" : undefined
            }
            aria-invalid={
              !["meal", "drink"].includes(kind) &&
              attempted &&
              !draft.title.trim()
            }
            aria-label="Record title"
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </Field>
        <div className="wellbeing-record-editor__row">
          <Field label="Date and time">
            <Input
              required
              aria-required="true"
              aria-invalid={attempted && !draft.recordedAt}
              aria-label="Recorded date and time"
              type="datetime-local"
              value={draft.recordedAt}
              onChange={(event) => update({ recordedAt: event.target.value })}
            />
          </Field>
          <Field label="Privacy">
            <KoraSelect
              label="Privacy"
              value={draft.privacy}
              options={[
                { value: "private", label: "Private" },
                { value: "restricted", label: "Restricted" },
              ]}
              onValueChange={(privacy) =>
                update({ privacy: privacy as EditorDraft["privacy"] })
              }
            />
          </Field>
        </div>
        <KindFields
          kind={kind}
          draft={draft}
          attempted={attempted}
          update={update}
        />
        <div className="wellbeing-record-editor__source">
          <ShieldCheck size={15} />
          <span>
            <strong>Source</strong>
            <small>
              {record
                ? `${sourceLabel(record)} · original source preserved`
                : "Added in Kora · manual local record"}
            </small>
          </span>
        </div>
        {conflictLatest ? (
          <section
            ref={conflictRef}
            tabIndex={-1}
            className="wellbeing-conflict"
            role="alert"
            aria-labelledby="wellbeing-conflict-title"
          >
            <div>
              <strong id="wellbeing-conflict-title">
                This record changed elsewhere
              </strong>
              <p>
                Your draft is preserved. The latest saved record is version{" "}
                {conflictLatest.version}, updated{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(conflictLatest.updatedAt))}
                .
              </p>
            </div>
            <dl className="wellbeing-conflict__comparison">
              <div>
                <dt>Latest label</dt>
                <dd>{conflictLatest.title || "Not set"}</dd>
              </div>
              <div>
                <dt>Your draft label</dt>
                <dd>{draft.title || "Not set"}</dd>
              </div>
              <div>
                <dt>Latest recorded time</dt>
                <dd>{localDateTime(conflictLatest.recordedAt)}</dd>
              </div>
              <div>
                <dt>Your draft recorded time</dt>
                <dd>{draft.recordedAt || "Not set"}</dd>
              </div>
              <div>
                <dt>Latest privacy</dt>
                <dd>{conflictLatest.privacy}</dd>
              </div>
              <div>
                <dt>Your draft privacy</dt>
                <dd>{draft.privacy}</dd>
              </div>
              <div>
                <dt>Latest recorded fields</dt>
                <dd>
                  {conflictPayloadSummary(
                    conflictLatest.payload as Record<string, unknown>,
                  )}
                </dd>
              </div>
              <div>
                <dt>Your draft recorded fields</dt>
                <dd>{conflictPayloadSummary(payloadFor(kind, draft))}</dd>
              </div>
            </dl>
            <div>
              <Button
                tone="ghost"
                onClick={() => {
                  setDraft(editorDraft(kind, conflictLatest, now));
                  setBaseRecord(conflictLatest);
                  setConflictLatest(undefined);
                  setDirty(false);
                  mutation.reset();
                }}
              >
                Use latest record
              </Button>
              <Button
                tone="secondary"
                onClick={() => {
                  setBaseRecord(conflictLatest);
                  setConflictLatest(undefined);
                  mutation.reset();
                }}
              >
                Review my draft against latest
              </Button>
            </div>
          </section>
        ) : mutation.isError ? (
          <p className="wellbeing-form-error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        {discardPrompt ? (
          <div
            ref={discardRef}
            tabIndex={-1}
            className="wellbeing-discard"
            role="alert"
          >
            <div>
              <strong>Discard this draft?</strong>
              <p>Your unsaved changes will be lost.</p>
            </div>
            <Button tone="ghost" onClick={() => setDiscardPrompt(false)}>
              Keep editing
            </Button>
            <Button tone="danger" onClick={onClose}>
              Discard
            </Button>
          </div>
        ) : null}
        <Pressable type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

function KindFields({
  kind,
  draft,
  attempted,
  update,
}: {
  kind: WellbeingRecordKind;
  draft: EditorDraft;
  attempted: boolean;
  update: (changes: Partial<EditorDraft>) => void;
}) {
  const notes = (
    <Field label="Notes" hint="Optional context.">
      <Textarea
        aria-label="Notes"
        rows={3}
        value={draft.notes}
        onChange={(event) => update({ notes: event.target.value })}
      />
    </Field>
  );
  if (kind === "meal")
    return (
      <>
        <Field
          label="Structured foods"
          hint="Optional. Add only foods you want stored as confirmed structure, separated by commas."
        >
          <Input
            aria-label="Structured foods"
            value={draft.secondary}
            onChange={(event) => update({ secondary: event.target.value })}
          />
        </Field>
        <div className="wellbeing-record-editor__row">
          <Field label="Meal">
            <KoraSelect
              label="Meal type"
              value={draft.select}
              options={[
                { value: "meal", label: "Unspecified" },
                { value: "breakfast", label: "Breakfast" },
                { value: "lunch", label: "Lunch" },
                { value: "dinner", label: "Dinner" },
                { value: "snack", label: "Snack" },
              ]}
              onValueChange={(select) => update({ select })}
            />
          </Field>
          <Field label="Tags" hint="Optional, separated by commas.">
            <Input
              aria-label="Meal tags"
              value={draft.tertiary}
              onChange={(event) => update({ tertiary: event.target.value })}
            />
          </Field>
        </div>
        {notes}
      </>
    );
  if (kind === "drink")
    return (
      <>
        <Field
          label="What did you drink?"
          hint="Required. Describe it naturally; volume and notes are optional."
        >
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Drink"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <Field label="Volume" hint="Optional, in milliliters.">
          <Input
            aria-invalid={
              attempted &&
              Boolean(draft.secondary) &&
              (!Number.isFinite(Number(draft.secondary)) ||
                Number(draft.secondary) <= 0)
            }
            aria-label="Drink volume"
            inputMode="decimal"
            value={draft.secondary}
            onChange={(event) => update({ secondary: event.target.value })}
          />
        </Field>
        {notes}
      </>
    );
  if (kind === "observation")
    return (
      <>
        <Field label="Observation type">
          <KoraSelect
            label="Observation type"
            value={draft.select}
            options={[
              { value: "mood", label: "Mood" },
              { value: "energy", label: "Energy" },
              { value: "sleep", label: "Sleep" },
              { value: "digestion", label: "Digestion" },
              { value: "other", label: "Other" },
            ]}
            onValueChange={(select) => update({ select })}
          />
        </Field>
        <Field label="What did you notice?">
          <Input
            aria-label="Observation"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <RatingField
          value={draft.rating}
          onChange={(rating) => update({ rating })}
        />
        {notes}
      </>
    );
  if (kind === "symptom")
    return (
      <>
        <Field label="Symptom">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Symptom"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <RatingField
          label="Intensity"
          value={draft.rating}
          onChange={(rating) => update({ rating })}
        />
        {notes}
      </>
    );
  if (kind === "measurement")
    return (
      <>
        <div className="wellbeing-record-editor__row">
          <Field label="Measurement">
            <Input
              required
              aria-required="true"
              aria-invalid={attempted && !draft.primary.trim()}
              aria-label="Measurement name"
              value={draft.primary}
              onChange={(event) => update({ primary: event.target.value })}
            />
          </Field>
          <Field label="Value">
            <Input
              required
              aria-required="true"
              aria-invalid={
                attempted &&
                (!draft.secondary || !Number.isFinite(Number(draft.secondary)))
              }
              aria-label="Measurement value"
              inputMode="decimal"
              value={draft.secondary}
              onChange={(event) => update({ secondary: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Unit">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.tertiary.trim()}
            aria-label="Measurement unit"
            value={draft.tertiary}
            onChange={(event) => update({ tertiary: event.target.value })}
          />
        </Field>
        {notes}
      </>
    );
  if (kind === "medication_plan")
    return (
      <>
        <Field label="Medication">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Medication name"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <Field
          label="Instructions as recorded"
          hint="Required. Kora stores what you enter; it does not recommend a dose."
        >
          <Textarea
            required
            aria-required="true"
            aria-invalid={attempted && !draft.secondary.trim()}
            aria-label="Recorded medication instructions"
            rows={3}
            value={draft.secondary}
            onChange={(event) => update({ secondary: event.target.value })}
          />
        </Field>
        <div className="wellbeing-record-editor__row">
          <Field label="Schedule or window" hint="Optional, in your own words.">
            <Input
              aria-label="Recorded medication schedule"
              value={draft.tertiary}
              onChange={(event) => update({ tertiary: event.target.value })}
            />
          </Field>
          <Field label="Provider/source note" hint="Optional.">
            <Input
              aria-label="Medication source note"
              value={draft.quaternary}
              onChange={(event) => update({ quaternary: event.target.value })}
            />
          </Field>
        </div>
        <div className="wellbeing-record-editor__check">
          <CheckboxChoice
            checked={draft.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            title="Plan is active"
            hint="This is a record state, not a medication recommendation."
          />
        </div>
        {notes}
      </>
    );
  if (kind === "dose")
    return (
      <>
        <Field label="Medication">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Medication"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <div className="wellbeing-record-editor__row">
          <Field label="Amount" hint="Optional.">
            <Input
              aria-label="Dose amount"
              value={draft.secondary}
              onChange={(event) => update({ secondary: event.target.value })}
            />
          </Field>
          <Field label="Status">
            <KoraSelect
              label="Dose status"
              value={draft.select}
              options={[
                { value: "taken", label: "Taken" },
                { value: "skipped", label: "Skipped" },
                { value: "missed", label: "Missed" },
              ]}
              onValueChange={(select) => update({ select })}
            />
          </Field>
        </div>
        {notes}
      </>
    );
  if (kind === "appointment")
    return (
      <>
        <p className="wellbeing-record-editor__boundary" role="note">
          Saving this appointment does not create or mirror a Calendar event.
        </p>
        <div className="wellbeing-record-editor__row">
          <Field label="Provider" hint="Optional label.">
            <Input
              aria-label="Appointment provider"
              value={draft.primary}
              onChange={(event) => update({ primary: event.target.value })}
            />
          </Field>
          <Field label="Specialty" hint="Optional.">
            <Input
              aria-label="Appointment specialty"
              value={draft.secondary}
              onChange={(event) => update({ secondary: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Location" hint="Optional.">
          <Input
            aria-label="Appointment location"
            value={draft.tertiary}
            onChange={(event) => update({ tertiary: event.target.value })}
          />
        </Field>
        {notes}
      </>
    );
  if (kind === "care_document")
    return (
      <>
        <Field label="Document name">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Care document name"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        {notes}
      </>
    );
  if (kind === "routine_checkin")
    return (
      <>
        <Field label="Routine">
          <Input
            required
            aria-required="true"
            aria-invalid={attempted && !draft.primary.trim()}
            aria-label="Routine"
            value={draft.primary}
            onChange={(event) => update({ primary: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <KoraSelect
            label="Routine status"
            value={draft.select}
            options={[
              { value: "done", label: "Done" },
              { value: "skipped", label: "Skipped" },
            ]}
            onValueChange={(select) => update({ select })}
          />
        </Field>
        {notes}
      </>
    );
  return (
    <Field label="Note">
      <Textarea
        required
        aria-required="true"
        aria-invalid={attempted && !draft.primary.trim()}
        aria-label="Note"
        rows={7}
        value={draft.primary}
        onChange={(event) => update({ primary: event.target.value })}
      />
    </Field>
  );
}

function RatingField({
  label = "Rating",
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label={label}
      hint="Optional, 1–5. This is your observation, not a Kora score."
    >
      <KoraSelect
        label={label}
        value={value || "none"}
        options={[
          { value: "none", label: "Not set" },
          ...[1, 2, 3, 4, 5].map((rating) => ({
            value: String(rating),
            label: `${rating} of 5`,
          })),
        ]}
        onValueChange={(rating) => onChange(rating === "none" ? "" : rating)}
      />
    </Field>
  );
}

function WellbeingState({
  title,
  description,
  action,
  busy,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="wellbeing-today-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Today"
          description="Device-local day · Your private Wellbeing chronology."
          status="Private by default"
        />
        <StateView
          state={busy ? "loading" : "error"}
          title={title}
          body={description}
          action={action}
        />
      </WellbeingFrame>
    </section>
  );
}
