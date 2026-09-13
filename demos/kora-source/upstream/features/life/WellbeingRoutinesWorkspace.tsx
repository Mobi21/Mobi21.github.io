import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  CircleAlert,
  Clock3,
  Pause,
  Plus,
  RotateCcw,
  ShieldCheck,
  SkipForward,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckboxChoice, Field } from "../../components/form";
import {
  Badge,
  Button,
  Input,
  KoraSelect,
  Modal,
  PageHeader,
  Sheet,
  StateView,
  Textarea,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type WellbeingPayloadByKind,
  type WellbeingRecord,
  type WellbeingRecordKind,
  type WellbeingRecordPage,
} from "../../lib/runtime";
import type { WellbeingTodayLoaders } from "./WellbeingTodayWorkspace";
import { RecordDetailSheet, sourceLabel, wellbeingRecordDisplayTitle } from "./WellbeingTodayWorkspace";
import { WellbeingFrame } from "./WellbeingNavigation";
import { useWellbeingReturnContext, wellbeingRecordReturnId } from "./wellbeing-return-context";
import { useWellbeingMutationKeys } from "./wellbeing-mutation-keys";
import "./wellbeing-today.css";
import "./wellbeing-routines.css";

const ROUTINE_KINDS: WellbeingRecordKind[] = ["routine", "routine_checkin"];
const WINDOW_ORDER = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  anytime: 3,
} as const;
const WINDOW_LABEL = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
} as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type RoutinePayload = WellbeingPayloadByKind["routine"];
type CheckinPayload = WellbeingPayloadByKind["routine_checkin"];

function routineHistoryRange(now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const format = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${format.format(start)}–${format.format(now)}`;
}

function scheduledDaysLabel(daysOfWeek?: number[]) {
  const days = [...new Set(daysOfWeek ?? [])].filter(
    (day): day is number => Number.isInteger(day) && day >= 0 && day < DAY_LABELS.length,
  );
  return days.length ? days.map((day) => DAY_LABELS[day]).join(", ") : "No days selected";
}

function RoutineHistoryContext({ now }: { now: Date }) {
  return (
    <p className="routine-section__context" role="status">
      <span>Response history · {routineHistoryRange(now)}</span>
    </p>
  );
}

function routineResponseStatus(record: WellbeingRecord) {
  const status = checkinPayload(record).status;
  return status === "done"
    ? "Complete"
    : status === "skipped"
      ? "Skipped"
      : "Unknown status";
}

function formatRoutineResponseTime(recordedAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(recordedAt));
}

function RoutineResponseHistory({
  records,
  absenceConfirmed,
  onOpen,
}: {
  records: WellbeingRecord[];
  absenceConfirmed: boolean;
  onOpen: (id: string, trigger: HTMLElement) => void;
}) {
  if (!records.length)
    return (
      <div className="routine-history-collection routine-history-collection--empty" role="status">
        <strong>
          {absenceConfirmed
            ? "No responses in this period."
            : "Response history could not be fully loaded."}
        </strong>
        <p>
          {absenceConfirmed
            ? "Nothing was saved in this period."
            : "Retry to check this period."}
        </p>
      </div>
    );

  return (
    <ul
      className="routine-history-collection"
      aria-label="Saved routine responses"
    >
      {records.map((record) => {
        const response = checkinPayload(record);
        const notes = typeof response.notes === "string" ? response.notes.trim() : "";
        return (
          <li key={record.id}>
            <article className="routine-history-entry">
              <time dateTime={record.recordedAt}>
                {formatRoutineResponseTime(record.recordedAt)}
              </time>
              <div className="routine-history-entry__content">
                <strong>{wellbeingRecordDisplayTitle(record)}</strong>
                {notes ? <p>Note · {notes}</p> : null}
              </div>
              <Badge tone={response.status === "done" ? "success" : "quiet"}>
                {routineResponseStatus(record)}
              </Badge>
              <Button
                tone="ghost"
                data-wellbeing-return-id={wellbeingRecordReturnId(record.id)}
                aria-label={`View saved response ${wellbeingRecordDisplayTitle(record)}`}
                onClick={(event) => onOpen(record.id, event.currentTarget)}
              >
                View details
              </Button>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

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

type WellbeingRecordsInput = Parameters<typeof runtime.wellbeingRecords>[0];

function listRoutineRecords(
  loaders: WellbeingTodayLoaders,
  input: WellbeingRecordsInput,
) {
  return loaders.list(input as Parameters<WellbeingTodayLoaders["list"]>[0]);
}

async function loadBounded(
  loaders: WellbeingTodayLoaders,
  input: Parameters<WellbeingTodayLoaders["list"]>[0],
  limit: number,
): Promise<WellbeingRecordPage & { pageError?: boolean }> {
  const byId = new Map<string, WellbeingRecord>(),
    seen = new Set<string>();
  let cursor: string | undefined,
    restrictedOmitted = false;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    let page: WellbeingRecordPage;
    try {
      page = await loaders.list({
        ...input,
        cursor,
        pageSize: Math.min(100, limit),
      });
    } catch (error) {
      if (!byId.size) throw error;
      return {
        items: [...byId.values()].sort(newestRecordFirst).slice(0, limit),
        complete: false,
        restrictedOmitted,
        cursor,
        pageError: true,
      };
    }
    restrictedOmitted ||= page.restrictedOmitted;
    page.items.forEach((record) => {
      const current = byId.get(record.id);
      if (!current || record.version >= current.version)
        byId.set(record.id, record);
    });
    if (page.complete || byId.size >= limit)
      return {
        items: [...byId.values()].sort(newestRecordFirst).slice(0, limit),
        complete: page.complete && byId.size <= limit,
        restrictedOmitted,
        cursor: page.cursor,
      };
    if (!page.cursor || seen.has(page.cursor))
      return {
        items: [...byId.values()].sort(newestRecordFirst).slice(0, limit),
        complete: false,
        restrictedOmitted,
        cursor: page.cursor,
      };
    seen.add(page.cursor);
    cursor = page.cursor;
  }
  return {
    items: [...byId.values()].sort(newestRecordFirst).slice(0, limit),
    complete: false,
    restrictedOmitted,
    cursor,
  };
}

const TODAY_ROUTINE_PAGE_SIZE = 40;
const SECONDARY_ROUTINE_PAGE_SIZE = 12;
const CHECKIN_PAGE_SIZE = 100;

function useCursorHistory(scopeKey?: string) {
  const [history, setHistory] = useState<{
    scopeKey?: string;
    cursors: Array<string | undefined>;
    index: number;
  }>(() => ({ scopeKey, cursors: [undefined], index: 0 }));
  const current = history.scopeKey === scopeKey;

  useEffect(() => {
    if (history.scopeKey === scopeKey) return;
    setHistory({ scopeKey, cursors: [undefined], index: 0 });
  }, [history.scopeKey, scopeKey]);

  return {
    cursor: current ? history.cursors[history.index] : undefined,
    page: current ? history.index + 1 : 1,
    hasPrevious: current && history.index > 0,
    previous: () =>
      setHistory((state) => {
        if (state.scopeKey !== scopeKey)
          return { scopeKey, cursors: [undefined], index: 0 };
        return { ...state, index: Math.max(0, state.index - 1) };
      }),
    next: (cursor: string) =>
      setHistory((state) => {
        const base =
          state.scopeKey === scopeKey
            ? state
            : { scopeKey, cursors: [undefined], index: 0 };
        const cursors = base.cursors.slice(0, base.index + 1);
        cursors.push(cursor);
        return { scopeKey, cursors, index: base.index + 1 };
      }),
  };
}

type RoutinePagerTarget = "today" | "later" | "archive" | "checkins";
type RoutinePagerFocusRequest = {
  target: RoutinePagerTarget;
  page: number;
  focusOrigin?: HTMLElement | null;
};

function revealRoutinePagerTarget(target: HTMLElement | null) {
  const scrollTarget = target?.closest<HTMLElement>("[role=\"alert\"]") ?? target;
  revealRoutineSectionTarget(target, scrollTarget);
}

function revealRoutineSectionTarget(target: HTMLElement | null, scrollTarget = target) {
  if (!target) return;
  const lifeStage = scrollTarget?.closest<HTMLElement>(".life-stage");
  if (lifeStage && (lifeStage.clientHeight > 0 || lifeStage.scrollHeight > 0)) {
    const targetRect = scrollTarget!.getBoundingClientRect();
    const ownerRect = lifeStage.getBoundingClientRect();
    const style = window.getComputedStyle(scrollTarget!);
    const scrollMargin = Number.parseFloat(style.scrollMarginBlockStart || style.scrollMarginTop || "0") || 0;
    const delta = targetRect.top - ownerRect.top - scrollMargin;
    if (Number.isFinite(delta)) lifeStage.scrollTop += delta;
  } else {
    scrollTarget?.scrollIntoView?.({ block: "start" });
  }
  target.focus({ preventScroll: true });
}

function useRoutinePagerFocus(
  pending: MutableRefObject<RoutinePagerFocusRequest | undefined>,
  target: RoutinePagerTarget,
  page: number,
  isFetching: boolean,
  isError: boolean,
  dataUpdatedAt: number,
  headingRef: RefObject<HTMLElement | null>,
  ready = true,
) {
  useEffect(() => {
    const onFocusIn = () => {
      const request = pending.current;
      if (!request || request.target !== target || !request.focusOrigin) return;
      // Browsers move focus to the document body when a pager button becomes
      // disabled after its page loads. Keep the request alive for that
      // automatic blur, while still cancelling when the user chose another
      // focusable control during recovery.
      if (
        document.activeElement !== request.focusOrigin &&
        document.activeElement !== document.body
      )
        pending.current = undefined;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (pending.current?.target === target) pending.current = undefined;
    };
  }, [pending, target]);
  useEffect(() => {
    const request = pending.current;
    if (!request || request.target !== target) return;
    if (request.page !== page) {
      if (!isFetching) pending.current = undefined;
      return;
    }
    if (isFetching) return;
    if (isError && !ready) {
      pending.current = undefined;
      revealRoutinePagerTarget(
        document.querySelector<HTMLElement>(`[data-routine-pager-retry="${target}"]`),
      );
      return;
    }
    if (!ready) return;
    if (
      request.focusOrigin?.isConnected &&
      document.activeElement !== request.focusOrigin &&
      document.activeElement !== document.body
    ) {
      pending.current = undefined;
      return;
    }
    pending.current = undefined;
    const retry = isError
      ? document.querySelector<HTMLElement>(`[data-routine-pager-retry="${target}"]`)
      : undefined;
    revealRoutinePagerTarget(retry ?? headingRef.current);
  }, [dataUpdatedAt, headingRef, isError, isFetching, page, pending, ready, target]);
}

function dayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function recordDay(record: WellbeingRecord) {
  return dayKey(new Date(record.recordedAt));
}
function payload(record: WellbeingRecord) {
  return record.payload as RoutinePayload;
}
function checkinPayload(record: WellbeingRecord) {
  return record.payload as CheckinPayload;
}
function relatedCarePlanLabel(carePlans: WellbeingRecord[], id?: string) {
  if (!id) return undefined;
  const title = carePlans.find((plan) => plan.id === id)?.title.trim();
  return title || "Unavailable care plan";
}

function RoutineCarePlanDetail({
  record,
  carePlans,
  onOpenCare,
}: {
  record: WellbeingRecord;
  carePlans: WellbeingRecord[];
  onOpenCare?: (id: string | undefined, trigger: HTMLElement) => void;
}) {
  if (record.kind !== "routine") return null;
  const id = payload(record).carePlanId;
  if (!id) return null;
  const title = carePlans.find((plan) => plan.id === id)?.title.trim();
  const careHref = title
    ? `/life/wellbeing/care?record=${encodeURIComponent(id)}`
    : "/life/wellbeing/care";
  return (
    <section
      className="wellbeing-record-detail__payload"
      aria-labelledby="wellbeing-routine-care-plan"
    >
      <h3 id="wellbeing-routine-care-plan">Related care plan</h3>
      <dl>
        <div>
          <dt>Plan</dt>
          <dd>
            <span>{title || "Unavailable care plan"}</span>{" "}
            <Link
              to={careHref}
              onClick={(event) => {
                if (!onOpenCare) return;
                event.preventDefault();
                onOpenCare(title ? id : undefined, event.currentTarget);
              }}
            >
              Open Care
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  );
}
function newestRecordFirst(a: WellbeingRecord, b: WellbeingRecord) {
  return (
    b.recordedAt.localeCompare(a.recordedAt) ||
    b.version - a.version ||
    a.id.localeCompare(b.id)
  );
}

function mergeRoutineSections(
  dueRecords: WellbeingRecord[],
  laterRecords: WellbeingRecord[],
) {
  const byId = new Map<string, { record: WellbeingRecord; section: "due" | "later" }>();
  const add = (record: WellbeingRecord, section: "due" | "later") => {
    const current = byId.get(record.id);
    if (
      !current ||
      record.version > current.record.version ||
      (record.version === current.record.version && section === "due" && current.section === "later")
    ) {
      byId.set(record.id, { record, section });
    }
  };
  dueRecords.forEach((record) => add(record, "due"));
  laterRecords.forEach((record) => add(record, "later"));
  return {
    due: [...byId.values()].filter((item) => item.section === "due").map((item) => item.record),
    later: [...byId.values()].filter((item) => item.section === "later").map((item) => item.record),
  };
}

export function WellbeingRoutinesWorkspace({
  loaders = defaultLoaders,
  initialNow,
}: {
  loaders?: WellbeingTodayLoaders;
  initialNow?: Date;
}) {
  const [clock, setClock] = useState(() => initialNow ?? new Date());
  const now = clock,
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    [pending, setPending] = useState<{
      routine: WellbeingRecord;
      status: "done" | "skipped";
      requestKey: string;
    }>(),
    [settlement, setSettlement] = useState<{
      message: string;
      checkin?: WellbeingRecord;
      retry?: {
        routine: WellbeingRecord;
        status: "done" | "skipped";
        notes?: string;
        requestKey: string;
      };
    }>(),
    queryClient = useQueryClient(),
    firstAction = useRef<HTMLButtonElement | null>(null),
    newRoutineAction = useRef<HTMLButtonElement | null>(null),
    dueHeading = useRef<HTMLHeadingElement | null>(null),
    laterHeading = useRef<HTMLHeadingElement | null>(null),
    archiveHeading = useRef<HTMLHeadingElement | null>(null),
    checkinsHeading = useRef<HTMLHeadingElement | null>(null),
    pagerFocus = useRef<RoutinePagerFocusRequest | undefined>(undefined),
    undoFocus = useRef<HTMLElement | null>(null),
    editorTrigger = useRef<HTMLElement | null>(null),
    routeOpenedHere = useRef(false),
    editorOpenedHere = useRef(false),
    restoreFocusRoutineId = useRef<string | undefined>(undefined),
    retainedDefinitions = useRef<{ scopeKey: string; data: WellbeingRecordPage } | undefined>(undefined),
    retainedLaterDefinitions = useRef<{ scopeKey: string; data: WellbeingRecordPage } | undefined>(undefined),
    retainedArchived = useRef<{ scopeKey: string; data: WellbeingRecordPage } | undefined>(undefined),
    retainedCheckins = useRef<{ scopeKey: string; data: WellbeingRecordPage } | undefined>(undefined),
    mutationKeys = useWellbeingMutationKeys();
  const requestedQuery = params.get("query")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(requestedQuery);
  useEffect(() => setDraftQuery(requestedQuery), [requestedQuery]);
  useEffect(() => {
    if (initialNow) return undefined;
    const refreshClock = () => setClock(new Date());
    const refreshRoutineScope = () => {
      refreshClock();
      void queryClient.invalidateQueries({
        queryKey: ["wellbeing", "routines", "definitions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["wellbeing", "routines", "later-definitions"],
      });
    };
    const interval = window.setInterval(refreshClock, 60_000);
    document.addEventListener("visibilitychange", refreshRoutineScope);
    window.addEventListener("focus", refreshRoutineScope);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshRoutineScope);
      window.removeEventListener("focus", refreshRoutineScope);
    };
  }, [initialNow, queryClient]);
  const today = dayKey(now),
    todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const routineScope = `${today}:${now.getDay()}:${todayStart.toISOString()}:${todayEnd.toISOString()}`;
  const definitionScope = `${routineScope}:${requestedQuery}`;
  const definitionPages = useCursorHistory(definitionScope),
    laterPages = useCursorHistory(definitionScope),
    archivePages = useCursorHistory(requestedQuery),
    checkinPages = useCursorHistory(routineScope);
  const
    historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - 6);
  historyStart.setHours(0, 0, 0, 0);
  const historyEnd = new Date(now);
  historyEnd.setDate(historyEnd.getDate() + 1);
  historyEnd.setHours(0, 0, 0, 0);
  const checkinScope = `${routineScope}:${historyStart.toISOString()}:${historyEnd.toISOString()}`;
  const definitions = useQuery({
    queryKey: [
      "wellbeing",
      "routines",
      "definitions",
      TODAY_ROUTINE_PAGE_SIZE,
      routineScope,
      requestedQuery,
      definitionPages.cursor,
    ],
    queryFn: () =>
      listRoutineRecords(loaders, {
        kinds: ["routine"],
        state: "active",
        query: requestedQuery || undefined,
        pageSize: TODAY_ROUTINE_PAGE_SIZE,
        cursor: definitionPages.cursor,
        routineSchedule: "due",
        routineDay: now.getDay(),
        routineDayStart: todayStart.toISOString(),
        routineDayEnd: todayEnd.toISOString(),
      }),
  });
  const laterDefinitions = useQuery({
    queryKey: [
      "wellbeing",
      "routines",
      "later-definitions",
      SECONDARY_ROUTINE_PAGE_SIZE,
      routineScope,
      requestedQuery,
      laterPages.cursor,
    ],
    queryFn: () =>
      listRoutineRecords(loaders, {
        kinds: ["routine"],
        state: "active",
        query: requestedQuery || undefined,
        pageSize: SECONDARY_ROUTINE_PAGE_SIZE,
        cursor: laterPages.cursor,
        routineSchedule: "later",
        routineDay: now.getDay(),
        routineDayStart: todayStart.toISOString(),
        routineDayEnd: todayEnd.toISOString(),
      }),
  });
  const archived = useQuery({
    queryKey: [
      "wellbeing",
      "routines",
      "archived",
      SECONDARY_ROUTINE_PAGE_SIZE,
      requestedQuery,
      archivePages.cursor,
    ],
    queryFn: () =>
      listRoutineRecords(loaders, {
        kinds: ["routine"],
        state: "archived",
        query: requestedQuery || undefined,
        pageSize: SECONDARY_ROUTINE_PAGE_SIZE,
        cursor: archivePages.cursor,
      }),
  });
  const checkins = useQuery({
    queryKey: [
      "wellbeing",
      "routines",
      "checkins",
      routineScope,
      historyStart.toISOString(),
      historyEnd.toISOString(),
      CHECKIN_PAGE_SIZE,
      checkinPages.cursor,
    ],
    queryFn: () =>
      loaders.list({
        kinds: ["routine_checkin"],
        start: historyStart.toISOString(),
        end: historyEnd.toISOString(),
        pageSize: CHECKIN_PAGE_SIZE,
        cursor: checkinPages.cursor,
      }),
    placeholderData: (previous) => previous,
  });
  const sources = useQuery({
    queryKey: ["wellbeing", "sources", ...ROUTINE_KINDS],
    queryFn: () => loaders.sources({ kinds: ROUTINE_KINDS }),
  });
  const carePlans = useQuery({
    queryKey: ["wellbeing", "routines", "care-plans"],
    queryFn: () => loadBounded(loaders, { kinds: ["medication_plan"] }, 100),
  });
  useEffect(() => {
    if (definitions.data)
      retainedDefinitions.current = { scopeKey: definitionScope, data: definitions.data };
  }, [definitions.data, definitionScope]);
  useEffect(() => {
    if (laterDefinitions.data)
      retainedLaterDefinitions.current = { scopeKey: definitionScope, data: laterDefinitions.data };
  }, [laterDefinitions.data, definitionScope]);
  useEffect(() => {
    if (archived.data)
      retainedArchived.current = { scopeKey: requestedQuery, data: archived.data };
  }, [archived.data, requestedQuery]);
  useEffect(() => {
    if (checkins.data && !checkins.isPlaceholderData && !checkins.isError)
      retainedCheckins.current = { scopeKey: checkinScope, data: checkins.data };
  }, [checkinScope, checkins.data, checkins.isError, checkins.isPlaceholderData]);
  const definitionData = definitions.data ?? (
    retainedDefinitions.current?.scopeKey === definitionScope
      ? retainedDefinitions.current.data
      : undefined
  );
  const laterDefinitionData = laterDefinitions.data ?? (
    retainedLaterDefinitions.current?.scopeKey === definitionScope
      ? retainedLaterDefinitions.current.data
      : undefined
  );
  const archivedData = archived.data ?? (
    retainedArchived.current?.scopeKey === requestedQuery
      ? retainedArchived.current.data
      : undefined
  );
  const currentCheckinData = checkins.isPlaceholderData ? undefined : checkins.data;
  const visibleCheckinData = currentCheckinData ?? (
    retainedCheckins.current?.scopeKey === checkinScope
      ? retainedCheckins.current.data
      : undefined
  );
  const rawEdit = params.get("edit") ?? undefined,
    legacyEditId = rawEdit && rawEdit !== "1" ? rawEdit : undefined,
    recordId = params.get("record") ?? legacyEditId,
    selectedId = recordId,
    requestedNew = params.get("new"),
    creating = requestedNew === "1";
  const selected = useQuery({
    queryKey: ["wellbeing", "record", selectedId],
    queryFn: () => loaders.read(selectedId!),
    enabled: Boolean(selectedId),
  });
  const editing =
    rawEdit && selected.data?.record?.kind === "routine"
      ? selected.data.record
      : undefined;
  const setRoute = (
    changes: Record<string, string | undefined>,
    replace = false,
  ) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) =>
      value === undefined ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace });
  };
  useEffect(() => {
    const invalidNew = Boolean(requestedNew && requestedNew !== "1");
    if (!legacyEditId && !(creating && recordId) && !invalidNew) return;
    const next = new URLSearchParams(params);
    if (legacyEditId) {
      next.set("record", legacyEditId);
      next.set("edit", "1");
      next.delete("new");
    } else {
      if (creating && recordId) {
        next.delete("new");
        next.delete("edit");
      }
      if (invalidNew) next.delete("new");
    }
    setParams(next, { replace: true });
  }, [creating, legacyEditId, params, recordId, requestedNew, setParams]);
  const openDetail = (id: string, trigger: HTMLElement) => {
    routeOpenedHere.current = true;
    wellbeingReturn.rememberAndOpenQuery(
      { record: id, edit: undefined, new: undefined },
      wellbeingRecordReturnId(id),
    );
  };
  const openEditor = (id: string | undefined, trigger: HTMLElement) => {
    editorTrigger.current = trigger;
    if (!id) editorOpenedHere.current = true;
    setRoute({ edit: id ? "1" : undefined, new: id ? undefined : "1", record: id });
  };
  const closeDetail = () => {
    if (routeOpenedHere.current) {
      routeOpenedHere.current = false;
      navigate(-1);
    } else setRoute({ record: undefined, edit: undefined }, true);
    wellbeingReturn.focusReturnTarget(recordId ? wellbeingRecordReturnId(recordId) : undefined);
  };
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "routines"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "today"] }),
    ]);
  const saveCheckin = useMutation({
    mutationFn: ({
      routine,
      status,
      notes,
      requestKey,
    }: {
      routine: WellbeingRecord;
      status: "done" | "skipped";
      notes?: string;
      requestKey: string;
    }) =>
      loaders.create({
        kind: "routine_checkin",
        title: routine.title,
        payload: {
          name: payload(routine).name,
          routineId: routine.id,
          status,
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
        },
        recordedAt: now.toISOString(),
        privacy: routine.privacy,
        source: { kind: "manual", label: "You" },
      }, requestKey),
    onSuccess: async ({ record }) => {
      await refresh();
      setPending(undefined);
      setSettlement({
        message: `${record.title} marked ${checkinPayload(record).status === "done" ? "complete" : "skipped"}.`,
        checkin: record,
      });
    },
    onError: (_reason, attempt) => {
      setPending(undefined);
      setSettlement({
        message:
          "The routine response may not have been saved. Retry checks the same request safely; existing visible history remains unchanged until confirmed.",
        retry: attempt,
      });
    },
  });
  const undoCheckin = useMutation({
    mutationFn: (record: WellbeingRecord) =>
      loaders.archive(
        record.id,
        record.version,
        mutationKeys.acquire("archive", record.id, record.version),
      ),
    onSuccess: async (_result, record) => {
      mutationKeys.settle("archive", record.id);
      await refresh();
      setSettlement({
        message:
          "The latest routine response was removed. The routine remains available.",
      });
      requestAnimationFrame(() =>
        (undoFocus.current?.isConnected
          ? undoFocus.current
          : firstAction.current
        )?.focus(),
      );
    },
    onError: () =>
      setSettlement({
        message:
          "The response changed before Undo completed. Reopen Routines to review the current history.",
      }),
  });
  const restoreRoutine = useMutation({
    mutationFn: (record: WellbeingRecord) =>
      loaders.restore(
        record.id,
        record.version,
        mutationKeys.acquire("restore", record.id, record.version),
      ),
    onSuccess: async ({ record }, archivedRecord) => {
      mutationKeys.settle("restore", archivedRecord.id);
      await refresh();
      setSettlement({
        message: `${record.title} restored ${payload(record).enabled ? "and is active" : "as a paused routine"}.`,
      });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const restoredRow = Array.from(
            document.querySelectorAll<HTMLElement>("[data-routine-id]"),
          ).find(
            (candidate) =>
              candidate.dataset.routineId === restoreFocusRoutineId.current,
          );
          (
            restoredRow?.querySelector<HTMLElement>("[data-routine-focus]") ??
            firstAction.current
          )?.focus({ preventScroll: true });
        }),
      );
    },
    onError: () =>
      setSettlement({
        message: "The archived routine changed before it could be restored.",
      }),
  });

  const mergedDefinitions = mergeRoutineSections(
    definitionData?.items ?? [],
    laterDefinitionData?.items ?? [],
  );
  const due = mergedDefinitions.due.sort(
      (a, b) =>
        WINDOW_ORDER[payload(a).preferredWindow ?? "anytime"] -
          WINDOW_ORDER[payload(b).preferredWindow ?? "anytime"] ||
        a.title.localeCompare(b.title),
    ),
    later = mergedDefinitions.later.sort((a, b) => a.title.localeCompare(b.title)),
    allDefinitions = [...due, ...later],
    archivedCount = archivedData?.visibleTotal ?? archivedData?.items.length ?? 0,
    allCheckins = [...(visibleCheckinData?.items ?? [])].sort(newestRecordFirst),
    affectedSources = sources.data?.external.filter(
      (source) => source.state !== "current",
    ) ?? [],
    affectedSource = affectedSources[0],
    sourceRetryable = sources.isError ||
      sources.data?.state === "partial" ||
      sources.data?.state === "unavailable" ||
      affectedSources.some(
        (source) => source.state === "partial" || source.state === "unavailable",
      ),
    providerSettingsRecovery = affectedSources.some(
      (source) =>
        source.kind === "provider" &&
        (source.state === "not_configured" ||
          source.state === "permission_restricted"),
    );
  const checkinHistoryComplete = Boolean(
    currentCheckinData?.complete &&
      !checkins.isError &&
      !checkinPages.hasPrevious &&
      !currentCheckinData.restrictedOmitted,
  );
  const wellbeingReturn = useWellbeingReturnContext({
    ready: Boolean(definitionData && laterDefinitionData),
    rootSelector: ".wellbeing-routines-workspace",
    fallbackRef: newRoutineAction,
    restoreKey: allDefinitions.map((record) => `${record.id}:${record.version}`).join("|"),
  });
  const todayHeadingReady = Boolean(
    definitionData &&
      !definitions.isFetching &&
      !laterDefinitions.isFetching &&
      (laterDefinitionData || laterDefinitions.isError),
  );
  useRoutinePagerFocus(
    pagerFocus,
    "today",
    definitionPages.page,
    definitions.isFetching,
    definitions.isError,
    definitions.dataUpdatedAt,
    dueHeading,
    todayHeadingReady,
  );
  useRoutinePagerFocus(pagerFocus, "later", laterPages.page, laterDefinitions.isFetching, laterDefinitions.isError, laterDefinitions.dataUpdatedAt, laterHeading);
  useRoutinePagerFocus(pagerFocus, "archive", archivePages.page, archived.isFetching, archived.isError, archived.dataUpdatedAt, archiveHeading);
  useRoutinePagerFocus(pagerFocus, "checkins", checkinPages.page, checkins.isFetching, checkins.isError, checkins.dataUpdatedAt, checkinsHeading);
  const requestPagerNavigation = (target: RoutinePagerTarget, page: number, navigatePage: () => void) => {
    const activeElement = document.activeElement;
    pagerFocus.current = {
      target,
      page,
      focusOrigin: activeElement instanceof HTMLElement ? activeElement : null,
    };
    navigatePage();
  };
  const latestByRoutineDay = useMemo(() => {
    const map = new Map<string, WellbeingRecord>();
    [...allCheckins]
      .sort(newestRecordFirst)
      .forEach((record) => {
        const id = checkinPayload(record).routineId;
        if (id) {
          const key = `${id}:${recordDay(record)}`;
          if (!map.has(key)) map.set(key, record);
        }
      });
    return map;
  }, [allCheckins]);
  const lastByRoutine = useMemo(() => {
    const map = new Map<string, WellbeingRecord>();
    [...allCheckins]
      .sort(newestRecordFirst)
      .forEach((record) => {
        const id = checkinPayload(record).routineId;
        if (id && !map.has(id)) map.set(id, record);
      });
    return map;
  }, [allCheckins]);
  const laterCount = laterDefinitionData?.visibleTotal ?? later.length;
  const todayCount = definitionData?.visibleTotal ?? due.length;
  const hasSearch = Boolean(requestedQuery);
  const hasLaterSection = Boolean(
    laterCount || laterDefinitionData?.cursor || laterPages.hasPrevious || laterDefinitions.isError,
  );
  const hasArchivedSection = Boolean(
    archivedCount || archivedData?.cursor || archivePages.hasPrevious || archived.isError,
  );
  const hasSecondarySection = hasLaterSection || hasArchivedSection;
  const readError = definitions.isError && !definitionData;
  const loading =
    (definitions.isLoading && !definitionData) ||
    (laterDefinitions.isLoading && !laterDefinitionData);

  const headerActions = (
        <Button
          ref={newRoutineAction}
          data-wellbeing-return-fallback
          tone="primary"
          onClick={(event) => openEditor(undefined, event.currentTarget)}
        >
          <Plus size={15} />
          New routine
        </Button>
  );

  if (loading)
    return (
      <RoutineState
        title="Opening Routines"
        description="Reading local routine definitions and check-ins."
        headerActions={headerActions}
        busy
      />
    );
  if (readError)
    return (
      <RoutineState
        title="Routines could not be opened"
        description="Kora could not read local routine history. Saved routines remain unchanged."
        headerActions={headerActions}
        action={
          <Button
            data-routine-pager-retry="today"
            tone="primary"
            onClick={() => {
              requestPagerNavigation("today", definitionPages.page, () => {
                void definitions.refetch();
                void laterDefinitions.refetch();
                void checkins.refetch();
                void archived.refetch();
              });
            }}
          >
            Try again
          </Button>
        }
      />
    );

  return (
    <section className="wellbeing-routines-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Routines"
          description="Small recurring wellbeing check-ins, kept separate from goals and tasks."
          status={<><span>Private by default · Routine history</span><span aria-hidden="true">·</span><span>{hasSearch ? `${todayCount + laterCount + archivedCount} matching routines` : `${todayCount} for today · ${laterCount} later or paused${archivedCount ? ` · ${archivedCount} archived` : ""}`}</span></>}
          actions={headerActions}
        />
        <form
          className="routine-search"
          aria-label="Search routines"
          onSubmit={(event) => {
            event.preventDefault();
            setRoute({ query: draftQuery.trim() || undefined }, true);
          }}
        >
          <label className="sr-only" htmlFor="routine-search-input">Search routines</label>
          <div className="routine-search__controls">
            <Input
              id="routine-search-input"
              type="search"
              value={draftQuery}
              placeholder="Search routines"
              onChange={(event) => setDraftQuery(event.target.value)}
            />
            <Button type="submit" tone="secondary">Search</Button>
            {hasSearch ? <Button type="button" tone="ghost" onClick={() => { setDraftQuery(""); setRoute({ query: undefined }, true); }}>Clear search</Button> : null}
          </div>
          {hasSearch ? <p className="routine-search__applied" role="status" aria-live="polite">Showing routines matching “{requestedQuery}”.</p> : null}
        </form>
        <RoutineSectionJumps showLater={hasLaterSection} showArchived={hasArchivedSection} todayHeading={dueHeading} laterHeading={laterHeading} archiveHeading={archiveHeading} checkinsHeading={checkinsHeading} />
        {checkins.isError ? (
          <section
            className="routine-source-state"
            role="alert"
            aria-labelledby="routine-history-error-title"
          >
            <CircleAlert size={16} />
            <div>
              <strong id="routine-history-error-title" role="status">
                {visibleCheckinData?.items.length || checkinPages.hasPrevious
                  ? "This response-history page could not be read."
                  : "Response history could not be read."}
              </strong>
              <p>
                Current routine definitions remain usable. Last-response labels
                and the seven-day rhythm remain qualified to the response page that loaded.
              </p>
              <p>
                {visibleCheckinData?.items.length
                  ? "The last successfully loaded response page remains visible; this history may be incomplete."
                  : "No response rows are shown until this read succeeds."} Use the response history collection below to retry this read.
              </p>
            </div>
          </section>
        ) : null}
        {settlement ? (
          <div className="wellbeing-settlement" role="status">
            <ShieldCheck size={15} />
            <span>{settlement.message}</span>
            {settlement.checkin ? (
              <Button
                tone="link"
                aria-label={`Undo ${settlement.checkin.title} response just recorded`}
                loading={undoCheckin.isPending}
                onClick={(event) => {
                  const routineId = checkinPayload(
                    settlement.checkin!,
                  ).routineId;
                  undoFocus.current = routineId
                    ? ([
                        ...document.querySelectorAll<HTMLElement>(
                          "[data-routine-id]",
                        ),
                      ]
                        .find((row) => row.dataset.routineId === routineId)
                        ?.querySelector<HTMLElement>("[data-routine-focus]") ??
                      event.currentTarget)
                    : event.currentTarget;
                  undoCheckin.mutate(settlement.checkin!);
                }}
              >
                Undo
              </Button>
            ) : null}
            {settlement.retry ? (
              <Button
                tone="secondary"
                loading={saveCheckin.isPending}
                onClick={() => saveCheckin.mutate(settlement.retry!)}
              >
                Retry same response
              </Button>
            ) : null}
          </div>
        ) : null}
        <div
            className={`routine-board${hasSecondarySection ? "" : " routine-board--single"}`}
        >
          <div className="routine-board__today">
          <RoutineSection
          title="Today’s routines"
          headingRef={dueHeading}
          eyebrow="Ordered by preferred window"
           count={hasSearch ? `${todayCount} matching` : todayCount}
           hasItems={todayCount > 0}
           context={<RoutineHistoryContext now={now} />}
          topPager={<RoutinePager
            placement="top"
            label="Today’s routines"
            page={definitionPages.page}
            hasPrevious={definitionPages.hasPrevious}
            nextCursor={definitionData?.cursor}
            onPrevious={() => requestPagerNavigation("today", definitionPages.page - 1, () => definitionPages.previous())}
            onNext={(cursor) => requestPagerNavigation("today", definitionPages.page + 1, () => definitionPages.next(cursor))}
          />}
           emptyTitle={
            hasSearch
              ? "No matching routines in Today."
              : allDefinitions.length
              ? "No routines are due today."
              : archivedCount
                ? "No active routines right now."
                : "No routines have been created."
          }
          emptyBody={
            hasSearch
              ? `No saved routine matching “${requestedQuery}” is due today.`
              : allDefinitions.length
              ? "Nothing is inferred as missed. Paused, later, and unstructured schedules appear below."
              : archivedCount
                ? `${archivedCount === 1 ? "An archived routine is" : `${archivedCount} archived routines are`} available below. Restore ${archivedCount === 1 ? "it" : "one"} when you want it back in Today.`
                : "Start with one gentle repeat you actually want to notice—medication, hydration, stretching, or an evening reflection."
          }
          emptyAction={
            hasSearch ? (
              <Button tone="secondary" onClick={() => { setDraftQuery(""); setRoute({ query: undefined }, true); }}>
                Clear search
              </Button>
            ) : !allDefinitions.length && !archivedCount ? (
              <Button
                tone="primary"
                onClick={(event) => openEditor(undefined, event.currentTarget)}
              >
                Create a routine
              </Button>
            ) : undefined
          }
        >
          {due.map((routine, index) => (
            <RoutineRow
              key={routine.id}
              routine={routine}
              now={now}
              latest={latestByRoutineDay.get(`${routine.id}:${today}`)}
              last={lastByRoutine.get(routine.id)}
              checkins={allCheckins}
              pending={pending?.routine.id === routine.id ? pending : undefined}
              onBegin={(status) =>
                payload(routine).noteRequired
                  ? setPending({
                      routine,
                      status,
                      requestKey: crypto.randomUUID(),
                    })
                  : saveCheckin.mutate({
                      routine,
                      status,
                      requestKey: crypto.randomUUID(),
                    })
              }
              onCancel={() => setPending(undefined)}
              onSaveNote={(notes) =>
                saveCheckin.mutate({
                  routine,
                  status: pending!.status,
                  notes,
                  requestKey: pending!.requestKey,
                })
              }
              onUndo={(record) => undoCheckin.mutate(record)}
              onUndoFocus={(trigger) => {
                undoFocus.current = trigger;
              }}
              onOpen={(trigger) => openDetail(routine.id, trigger)}
              carePlanTitle={relatedCarePlanLabel(
                carePlans.data?.items ?? [],
                payload(routine).carePlanId,
              )}
              actionRef={index === 0 ? firstAction : undefined}
              busy={saveCheckin.isPending || undoCheckin.isPending}
              historyComplete={checkinHistoryComplete}
            />
          ))}
            {definitions.isError ? (
              <div className="routine-later-row routine-later-row--error" role="alert">
                <CircleAlert size={16} />
                <div>
                  <strong>This Today-routines page could not be read.</strong>
                  <p>The previous page remains visible and unchanged.</p>
                </div>
                <Button data-routine-pager-retry="today" tone="secondary" onClick={() => requestPagerNavigation("today", definitionPages.page, () => { void definitions.refetch(); })}>
                  Retry page
                </Button>
              </div>
            ) : null}
            </RoutineSection>
            {sources.isError || affectedSource || sources.data?.state === "partial" ||
            sources.data?.state === "unavailable" ? (
              <section
                className="routine-source-state routine-source-state--coverage"
                aria-labelledby="routine-source-title"
              >
                <CircleAlert size={16} />
                <div>
                  <strong id="routine-source-title" role="status">
                    {affectedSource?.state === "saved_only"
                      ? "Saved routine-source records are available."
                      : affectedSource?.state === "not_configured"
                        ? "A routine source is not configured."
                        : sources.data?.state === "partial"
                          ? "Routine source coverage is partial."
                          : "Routine source coverage is unavailable."}
                  </strong>
                  <p>
                    Local routines and check-ins remain usable. {affectedSource?.label ? `${affectedSource.label}: ` : ""}
                    {affectedSource?.limitation ?? "Current provider coverage could not be established."} Missing provider events are not treated as missed routines.
                  </p>
                  <div className="routine-source-state__actions">
                    {sourceRetryable ? (
                      <Button
                        tone="secondary"
                        loading={sources.isFetching}
                        onClick={() => void sources.refetch()}
                      >
                        Retry source coverage
                      </Button>
                    ) : null}
                    {providerSettingsRecovery ? (
                      <Link className="button button--link" to="/settings/integrations">
                        Review connections
                      </Link>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
            <RoutinePager
              label="Today’s routines"
              page={definitionPages.page}
              hasPrevious={definitionPages.hasPrevious}
              nextCursor={definitionData?.cursor}
              onPrevious={() => requestPagerNavigation("today", definitionPages.page - 1, () => definitionPages.previous())}
              onNext={(cursor) => requestPagerNavigation("today", definitionPages.page + 1, () => definitionPages.next(cursor))}
            />
          </div>
          {hasSecondarySection ? (
            <aside className="routine-board__later" aria-label="Later, paused, and archived routine management">
              {hasLaterSection ? (
                <RoutineSection
                  title="Later and paused"
                  headingRef={laterHeading}
                  eyebrow=""
                  count={hasSearch ? `${laterCount} matching` : later.length}
                  hasItems={laterCount > 0}
                  emptyTitle={hasSearch ? "No matching routines in Later and paused." : "Nothing is waiting here."}
                  emptyBody={hasSearch ? `No saved routine matching “${requestedQuery}” is waiting here.` : "All structured active routines for today are shown above."}
                  emptyAction={hasSearch ? <Button tone="secondary" onClick={() => { setDraftQuery(""); setRoute({ query: undefined }, true); }}>Clear search</Button> : undefined}
                  topPager={<RoutinePager
                    placement="top"
                    label="Later and paused routines"
                    page={laterPages.page}
                    hasPrevious={laterPages.hasPrevious}
                    nextCursor={laterDefinitionData?.cursor}
                    onPrevious={() => requestPagerNavigation("later", laterPages.page - 1, () => laterPages.previous())}
                    onNext={(cursor) => requestPagerNavigation("later", laterPages.page + 1, () => laterPages.next(cursor))}
                  />}
                  showChildrenWhenEmpty={Boolean(
                    laterDefinitions.isError ||
                      laterDefinitionData?.cursor ||
                      laterPages.hasPrevious,
                  )}
                >
                  {later.map((routine) => (
                    <LaterRoutineRow
                      key={routine.id}
                      routine={routine}
                      last={lastByRoutine.get(routine.id)}
                      onOpen={(trigger) => openDetail(routine.id, trigger)}
                      historyComplete={checkinHistoryComplete}
                    />
                  ))}
                  {laterDefinitions.isError ? (
                    <div className="routine-later-row routine-later-row--error" role="alert">
                      <CircleAlert size={16} />
                      <div>
                        <strong>This later-routines page could not be read.</strong>
                        <p>Today’s routines remain available and unchanged.</p>
                      </div>
                      <Button data-routine-pager-retry="later" tone="secondary" onClick={() => requestPagerNavigation("later", laterPages.page, () => { void laterDefinitions.refetch(); })}>
                        Retry page
                      </Button>
                    </div>
                  ) : null}
                  <RoutinePager
                    label="Later and paused routines"
                    page={laterPages.page}
                    hasPrevious={laterPages.hasPrevious}
                    nextCursor={laterDefinitionData?.cursor}
                    onPrevious={() => requestPagerNavigation("later", laterPages.page - 1, () => laterPages.previous())}
                    onNext={(cursor) => requestPagerNavigation("later", laterPages.page + 1, () => laterPages.next(cursor))}
                  />
                </RoutineSection>
              ) : null}
              {hasArchivedSection ? (
                <section className="routine-archive" aria-labelledby="routine-archived-routines">
                  <div className="wellbeing-section-heading">
                    <div>
                      <h2 ref={archiveHeading} id="routine-archived-routines" tabIndex={-1}>Archived routines</h2>
                    </div>
                    <Badge tone="neutral">{hasSearch ? `${archivedCount} matching` : archivedCount}</Badge>
                  </div>
                  <RoutinePager
                    placement="top"
                    label="Archived routines"
                    page={archivePages.page}
                    hasPrevious={archivePages.hasPrevious}
                    nextCursor={archivedData?.cursor}
                    onPrevious={() => requestPagerNavigation("archive", archivePages.page - 1, () => archivePages.previous())}
                    onNext={(cursor) => requestPagerNavigation("archive", archivePages.page + 1, () => archivePages.next(cursor))}
                  />
                  {archivedCount ? (
                    <div className="routine-list routine-list--archive">
                      {archivedData?.items.map((routine) => (
                        <LaterRoutineRow
                          key={routine.id}
                          routine={routine}
                          archived
                          historyComplete={checkinHistoryComplete}
                          onRestore={() => {
                            restoreFocusRoutineId.current = routine.id;
                            restoreRoutine.mutate(routine);
                          }}
                        />
                      ))}
                    </div>
                  ) : archived.isError ? null : (
                    <div className="routine-empty routine-empty--compact">
                      <RotateCcw size={18} />
                      <div>
                        <strong>{hasSearch ? "No matching archived routines." : "No archived routines on this page."}</strong>
                        <p>{hasSearch ? `No saved routine matching “${requestedQuery}” is archived.` : "Archived definitions remain separate from today’s active rhythm."}</p>
                        {hasSearch ? <Button tone="secondary" onClick={() => { setDraftQuery(""); setRoute({ query: undefined }, true); }}>Clear search</Button> : null}
                      </div>
                    </div>
                  )}
                  {archived.isError ? (
                    <div className="routine-later-row routine-later-row--error" role="alert">
                      <CircleAlert size={16} />
                      <div>
                        <strong>Archived routines could not be read.</strong>
                        <p>Today’s active routines remain available.</p>
                      </div>
                      <Button data-routine-pager-retry="archive" tone="secondary" onClick={() => requestPagerNavigation("archive", archivePages.page, () => { void archived.refetch(); })}>
                        Retry archive
                      </Button>
                    </div>
                  ) : null}
                  <RoutinePager
                    label="Archived routines"
                    page={archivePages.page}
                    hasPrevious={archivePages.hasPrevious}
                    nextCursor={archivedData?.cursor}
                    onPrevious={() => requestPagerNavigation("archive", archivePages.page - 1, () => archivePages.previous())}
                    onNext={(cursor) => requestPagerNavigation("archive", archivePages.page + 1, () => archivePages.next(cursor))}
                  />
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
        <div className="routine-history-navigation">
          <div className="routine-history-navigation__copy">
            <h2 ref={checkinsHeading} id="routine-response-history-title" tabIndex={-1}>Response history</h2>
            <p className="routine-history-limit" role="status">
              Response history for {routineHistoryRange(now)}; labels and rhythm
              use the response history currently loaded
              {currentCheckinData?.complete && !checkins.isError && !checkinPages.hasPrevious ? "." : ` (${allCheckins.length} responses loaded).`}
            </p>
            {hasSearch ? (
              <p className="routine-history-search-note">
                Routine search applies to the lists above; this history is not filtered by that search.
              </p>
            ) : null}
          </div>
          <RoutinePager
            placement="top"
            label="Response history"
            page={checkinPages.page}
            hasPrevious={checkinPages.hasPrevious}
            nextCursor={currentCheckinData?.cursor}
            onPrevious={() => requestPagerNavigation("checkins", checkinPages.page - 1, () => checkinPages.previous())}
            onNext={(cursor) => requestPagerNavigation("checkins", checkinPages.page + 1, () => checkinPages.next(cursor))}
          />
          <RoutineResponseHistory
            records={allCheckins}
            absenceConfirmed={Boolean(
              currentCheckinData?.complete &&
                !checkinPages.hasPrevious &&
                !checkins.isError &&
                !currentCheckinData.restrictedOmitted,
            )}
            onOpen={openDetail}
          />
          {checkins.isError ? (
            <div className="routine-history-collection__notice" role="status">
              <span>
                {visibleCheckinData?.items.length
                  ? "The last successfully loaded response page remains visible; this history may be incomplete."
                  : "Some response history could not be read. Retry to check this period."}
              </span>
              <Button
                data-routine-pager-retry="checkins"
                tone="secondary"
                loading={checkins.isFetching}
                onClick={() => requestPagerNavigation("checkins", checkinPages.page, () => { void checkins.refetch(); })}
              >
                Retry response history
              </Button>
            </div>
          ) : null}
          <RoutinePager
            label="Response history"
            page={checkinPages.page}
            hasPrevious={checkinPages.hasPrevious}
            nextCursor={currentCheckinData?.cursor}
            onPrevious={() => requestPagerNavigation("checkins", checkinPages.page - 1, () => checkinPages.previous())}
            onNext={(cursor) => requestPagerNavigation("checkins", checkinPages.page + 1, () => checkinPages.next(cursor))}
          />
        </div>
        {definitionData?.restrictedOmitted ||
        laterDefinitionData?.restrictedOmitted ||
        visibleCheckinData?.restrictedOmitted ? (
          <p className="routine-restricted">
            <ShieldCheck size={14} />
            Restricted routines or responses are omitted from this page and its
            counts.
          </p>
        ) : null}
      </WellbeingFrame>
      <RecordDetailSheet
        editableKinds={["routine"]}
        record={
          recordId &&
          (selected.data?.record?.kind === "routine" ||
            selected.data?.record?.kind === "routine_checkin")
            ? selected.data.record
            : undefined
        }
        loading={Boolean(recordId && !rawEdit && selected.isLoading)}
        error={Boolean(recordId && selected.isError)}
        open={Boolean(
          recordId &&
            (!rawEdit || (!selected.isLoading && !editing)),
        )}
        onClose={closeDetail}
         onEdit={(trigger) => {
          editorTrigger.current = trigger ?? null;
          setRoute({ record: recordId, edit: "1", new: undefined }, true);
        }}
         suppressGenericCarePlanRelation
         detailSupplement={(record) => (
          <RoutineCarePlanDetail
            record={record}
            carePlans={carePlans.data?.items ?? []}
            onOpenCare={(id) =>
              wellbeingReturn.rememberAndOpen(
                id
                  ? `/life/wellbeing/care?record=${encodeURIComponent(id)}`
                  : "/life/wellbeing/care",
                wellbeingRecordReturnId(record.id),
              )
            }
          />
         )}
         returnLabel="Routines"
         chromeTitle={selected.data?.record?.kind === "routine_checkin" ? "Saved routine response" : "Routine detail"}
         unavailableBody="This record is missing, restricted, or is not a routine definition or saved response. No editor was opened."
        onArchive={selected.data?.record?.kind === "routine" ? async (record) => {
          const result = await loaders.archive(
            record.id,
            record.version,
            mutationKeys.acquire("archive", record.id, record.version),
          );
          mutationKeys.settle("archive", record.id);
          await refresh();
          closeDetail();
          setSettlement({
            message: `${record.title} archived. Its recorded check-in history remains available.`,
          });
          return result.record;
        } : undefined}
        onDelete={
          selected.data?.record?.kind === "routine" && loaders.delete && loaders.approve && loaders.reject
            ? {
                request: (record, requestKey) =>
                  loaders.delete!(record.id, record.version, requestKey),
                approve: loaders.approve,
                reject: loaders.reject,
                onDeleted: async (record, outcome) => {
                  await refresh();
                  closeDetail();
                  setSettlement({
                    message:
                      outcome.status === "gone"
                        ? `${record.title} was already gone.`
                        : `${record.title} deleted permanently.`,
                  });
                },
                onStale: async () => {
                  await refresh();
                  closeDetail();
                  setSettlement({
                    message:
                      "This routine changed. Reopen it to review the latest version before deleting.",
                  });
                },
              }
            : undefined
        }
      />
      <RoutineEditor
        key={recordId ?? (creating ? "new" : "closed")}
        open={creating || Boolean(rawEdit && (selected.isLoading || editing))}
        record={editing}
        missing={Boolean(rawEdit && !selected.isLoading && !editing)}
        carePlans={carePlans.data?.items ?? []}
        carePlansComplete={Boolean(carePlans.data?.complete)}
        loaders={loaders}
        now={now}
        finalFocus={editorTrigger}
        onReload={async () => {
          const result = await selected.refetch();
          return result.data?.record?.kind === "routine"
            ? result.data.record
            : undefined;
        }}
        onClose={() => {
          if (rawEdit) {
            setRoute({ edit: undefined, new: undefined }, true);
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(".wellbeing-record-detail__title")
                  ?.focus({ preventScroll: true }),
              ),
            );
          } else if (creating && editorOpenedHere.current) {
            editorOpenedHere.current = false;
            navigate(-1);
          } else if (creating)
            setRoute({ edit: undefined, new: undefined }, true);
        }}
        onSaved={async (saved) => {
          await refresh();
          if (rawEdit)
            setRoute({ record: saved.id, edit: undefined, new: undefined }, true);
          else {
            routeOpenedHere.current = editorOpenedHere.current;
            editorOpenedHere.current = false;
            setRoute({ record: saved.id, edit: undefined, new: undefined }, true);
          }
          setSettlement({ message: "Routine saved." });
        }}
        onArchived={async () => {
          await refresh();
          setRoute(
            { record: undefined, edit: undefined, new: undefined },
            true,
          );
          setSettlement({
            message:
              "Routine archived. Its recorded check-in history remains available.",
          });
        }}
      />
    </section>
  );
}

function RoutineSectionJumps({ showLater, showArchived, todayHeading, laterHeading, archiveHeading, checkinsHeading }: { showLater: boolean; showArchived: boolean; todayHeading: RefObject<HTMLHeadingElement | null>; laterHeading: RefObject<HTMLHeadingElement | null>; archiveHeading: RefObject<HTMLHeadingElement | null>; checkinsHeading: RefObject<HTMLHeadingElement | null> }) {
  const jump = (heading: RefObject<HTMLHeadingElement | null>) => revealRoutineSectionTarget(heading.current);
  return <nav className="routine-section-jumps" aria-label="Routine sections">
    <Button tone="secondary" onClick={() => jump(todayHeading)}>Today’s routines</Button>
    {showLater ? <Button tone="secondary" onClick={() => jump(laterHeading)}>Later and paused</Button> : null}
    {showArchived ? <Button tone="secondary" onClick={() => jump(archiveHeading)}>Archived routines</Button> : null}
    <Button tone="secondary" onClick={() => jump(checkinsHeading)}>Response history</Button>
  </nav>;
}

function RoutinePager({
  label,
  placement = "bottom",
  page,
  hasPrevious,
  nextCursor,
  onPrevious,
  onNext,
}: {
  label: string;
  placement?: "top" | "bottom";
  page: number;
  hasPrevious: boolean;
  nextCursor?: string;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  if (!hasPrevious && !nextCursor) return null;
  return (
    <nav className={`routine-pager routine-pager--${placement}`} aria-label={placement === "top" ? `Top ${label} pages` : `${label} pages`}>
      <Button tone="secondary" disabled={!hasPrevious} onClick={onPrevious}>
        Previous
      </Button>
      <span aria-live={placement === "bottom" ? "polite" : undefined}>Page {page}</span>
      <Button
        tone="secondary"
        disabled={!nextCursor}
        onClick={() => nextCursor && onNext(nextCursor)}
      >
        Next
      </Button>
    </nav>
  );
}

function RoutineSection({
  title,
  eyebrow,
  count,
  hasItems,
  children,
  context,
  topPager,
  headingRef,
  emptyTitle,
  emptyBody,
  emptyAction,
  showChildrenWhenEmpty = false,
}: {
  title: string;
  eyebrow: string;
  count: React.ReactNode;
  hasItems?: boolean;
  children: React.ReactNode;
  context?: React.ReactNode;
  topPager?: React.ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
  showChildrenWhenEmpty?: boolean;
}) {
  return (
    <section
      className="routine-section"
      aria-labelledby={`routine-${title.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="wellbeing-section-heading">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h2 ref={headingRef} id={`routine-${title.toLowerCase().replaceAll(" ", "-")}`} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <Badge tone="neutral">{count}</Badge>
      </div>
      {context}
      {topPager}
      {(hasItems ?? Boolean(count)) || showChildrenWhenEmpty ? (
        <div className="routine-list">{children}</div>
      ) : (
        <div className="routine-empty">
          <Activity size={20} />
          <div>
            <strong>{emptyTitle}</strong>
            <p>{emptyBody}</p>
            {emptyAction}
          </div>
        </div>
      )}
    </section>
  );
}

function RoutineRow({
  routine,
  now,
  latest,
  last,
  checkins,
  pending,
  onBegin,
  onCancel,
  onSaveNote,
  onUndo,
  onUndoFocus,
  onOpen,
  carePlanTitle,
  actionRef,
  busy,
  historyComplete,
}: {
  routine: WellbeingRecord;
  now: Date;
  latest?: WellbeingRecord;
  last?: WellbeingRecord;
  checkins: WellbeingRecord[];
  pending?: { routine: WellbeingRecord; status: "done" | "skipped" };
  onBegin: (status: "done" | "skipped") => void;
  onCancel: () => void;
  onSaveNote: (notes: string) => void;
  onUndo: (record: WellbeingRecord) => void;
  onUndoFocus: (trigger: HTMLElement) => void;
  onOpen: (trigger: HTMLElement) => void;
  carePlanTitle?: string;
  actionRef?: React.RefObject<HTMLButtonElement | null>;
  busy: boolean;
  historyComplete: boolean;
}) {
  const value = payload(routine),
    choices = value.completionChoices?.length
      ? value.completionChoices
      : ["done", "skipped"],
    [note, setNote] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const rhythm = days.map((date) => {
    const item = checkins.find(
      (candidate) =>
        checkinPayload(candidate).routineId === routine.id &&
        recordDay(candidate) === dayKey(date),
    );
    return { date, item };
  });
  const summary = rhythm
    .map(
      ({ date, item }) =>
        `${DAY_LABELS[date.getDay()]} ${item ? (checkinPayload(item).status === "done" ? "complete" : "skipped") : historyComplete ? "no response recorded" : "response not loaded or not recorded"}`,
    )
    .join(", ");
  const rhythmSummary = `Seven-day response rhythm for ${routine.title}: ${summary}.`;
  return (
    <article className="routine-row" data-routine-id={routine.id}>
      <div className="routine-row__identity">
        <span className="routine-row__icon">
          <Activity size={16} />
        </span>
        <div>
          <strong>{routine.title}</strong>
          <p>
            {value.cadence} ·{" "}
            {WINDOW_LABEL[value.preferredWindow ?? "anytime"]}
            {value.cue ? ` · ${value.cue}` : ""}
          </p>
        </div>
      </div>
      <div className="routine-row__footer">
        <details
          className="routine-history"
          open={historyOpen}
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>Schedule &amp; history</summary>
          <div className="routine-history__body">
            {carePlanTitle ? (
              <p className="routine-row__care-plan">
                Related care plan · {carePlanTitle}
              </p>
            ) : null}
            <small className="routine-row__schedule">
              Scheduled days · {scheduledDaysLabel(value.daysOfWeek)}
            </small>
            <small>
              {last
                ? `Last response ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(last.recordedAt))}`
                : historyComplete
                  ? "No response recorded yet"
                  : "Recent response not fully checked"}{" "}
              · {sourceLabel(routine)}
            </small>
            <small>
              Legend · ✓ Complete · – Skipped · · No response shown
              {historyComplete ? "" : " · History may be incomplete"}
            </small>
            <p className="sr-only">{rhythmSummary}</p>
            <div className="routine-rhythm" aria-hidden="true">
              {rhythm.map(({ date, item }) => (
                <span
                  key={dayKey(date)}
                  data-state={item ? checkinPayload(item).status : "none"}
                >
                  <small>{DAY_LABELS[date.getDay()]}</small>
                  <i aria-hidden="true">
                    {item
                      ? checkinPayload(item).status === "done"
                        ? "✓"
                        : "–"
                      : "·"}
                  </i>
                </span>
              ))}
            </div>
          </div>
        </details>
        <div className="routine-row__actions">
          {latest ? (
            <>
              <Badge
                tone={
                  checkinPayload(latest).status === "done" ? "success" : "quiet"
                }
              >
                {checkinPayload(latest).status === "done"
                  ? "Complete"
                  : "Skipped"}
              </Badge>
              <Button
                tone="ghost"
                aria-label={`Undo ${routine.title} response`}
                onClick={(event) => {
                  onUndoFocus(
                    event.currentTarget
                      .closest("article")
                      ?.querySelector<HTMLElement>("[data-routine-focus]") ??
                      event.currentTarget,
                  );
                  onUndo(latest);
                }}
                disabled={busy}
              >
                <RotateCcw size={15} />
                Undo
              </Button>
            </>
          ) : (
            <>
              {choices.includes("done") ? (
                <Button
                  ref={actionRef}
                  tone="primary"
                  aria-label={`Complete ${routine.title}`}
                  onClick={() => onBegin("done")}
                  disabled={busy}
                >
                  <Check size={15} />
                  Complete
                </Button>
              ) : null}
              {choices.includes("skipped") ? (
                <Button
                  ref={!choices.includes("done") ? actionRef : undefined}
                  tone="secondary"
                  aria-label={`Skip ${routine.title}`}
                  onClick={() => onBegin("skipped")}
                  disabled={busy}
                >
                  <SkipForward size={15} />
                  Skip
                </Button>
              ) : null}
            </>
          )}
          <Button
            data-routine-focus
            data-wellbeing-return-id={wellbeingRecordReturnId(routine.id)}
            tone="ghost"
            aria-label={`View ${routine.title} details`}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            Details
          </Button>
        </div>
      </div>
      {pending ? (
        <form
          className="routine-response"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveNote(note);
          }}
        >
          <Field
            label={`${pending.status === "done" ? "Completion" : "Skip"} note`}
            hint="Required for this routine. Stored with this response."
          >
            <Textarea
              autoFocus
              required
              aria-label="Routine response note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div>
            <Button type="button" tone="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              disabled={!note.trim() || busy}
            >
              Save response
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function LaterRoutineRow({
  routine,
  last,
  archived,
  onRestore,
  onOpen,
  historyComplete,
}: {
  routine: WellbeingRecord;
  last?: WellbeingRecord;
  archived?: boolean;
  onRestore?: () => void;
  onOpen?: (trigger: HTMLElement) => void;
  historyComplete: boolean;
}) {
  const value = payload(routine),
    needsSchedule = Boolean(value.enabled && !value.daysOfWeek?.length),
    state = archived
      ? "Archived"
      : value.enabled
        ? value.daysOfWeek?.length
          ? "Later"
          : "Later"
        : "Paused",
    [historyOpen, setHistoryOpen] = useState(false);
  return (
    <article className="routine-later-row" data-routine-id={routine.id}>
      <span aria-hidden="true">
        {archived ? (
          <RotateCcw size={16} />
        ) : value.enabled ? (
          <Clock3 size={16} />
        ) : (
          <Pause size={16} />
        )}
      </span>
      <div className="routine-later-row__identity">
        <strong>{routine.title}</strong>
        <p>{value.cadence}</p>
        {needsSchedule ? <p>Choose scheduled days in Details.</p> : null}
      </div>
      <div className="routine-later-row__footer">
        <details className="routine-history" open={historyOpen} onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
          <summary>Schedule &amp; history</summary>
          <div className="routine-history__body">
            <small className="routine-later-row__schedule">
              Scheduled days · {scheduledDaysLabel(value.daysOfWeek)}
            </small>
            <small>
              {last
                ? `Last response ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(last.recordedAt))}`
                : historyComplete
                  ? "No response recorded"
                  : "Recent response not fully checked"}
            </small>
          </div>
        </details>
        <Badge tone="quiet">{state}</Badge>
        <div className="routine-later-row__actions">
          {archived ? (
            <Button
              tone="secondary"
              aria-label={`Restore ${routine.title}`}
              onClick={onRestore}
            >
              Restore
            </Button>
          ) : null}
          {onOpen ? (
            <Button
              tone="ghost"
              data-routine-focus
              data-wellbeing-return-id={wellbeingRecordReturnId(routine.id)}
              aria-label={`View ${routine.title} details`}
              onClick={(event) => onOpen(event.currentTarget)}
            >
              Details
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type RoutineDraft = {
  name: string;
  cadence: string;
  cue: string;
  reason: string;
  preferredWindow: "morning" | "afternoon" | "evening" | "anytime";
  days: number[];
  choices: Array<"done" | "skipped">;
  noteRequired: boolean;
  carePlanId: string;
  privacy: "private" | "restricted";
  enabled: boolean;
};
function editorDraft(record?: WellbeingRecord): RoutineDraft {
  const value = record ? payload(record) : undefined;
  return {
    name: record?.title ?? "",
    cadence: value?.cadence ?? "Daily",
    cue: value?.cue ?? "",
    reason: value?.reason ?? "",
    preferredWindow: value?.preferredWindow ?? "anytime",
    days: value?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    choices: value?.completionChoices ?? ["done", "skipped"],
    noteRequired: value?.noteRequired ?? false,
    carePlanId: value?.carePlanId ?? "",
    privacy: record?.privacy ?? "private",
    enabled: value?.enabled ?? true,
  };
}

function RoutineEditor({
  open,
  record,
  missing,
  carePlans,
  carePlansComplete,
  loaders,
  now,
  finalFocus,
  onReload,
  onClose,
  onSaved,
  onArchived,
}: {
  open: boolean;
  record?: WellbeingRecord;
  missing: boolean;
  carePlans: WellbeingRecord[];
  carePlansComplete: boolean;
  loaders: WellbeingTodayLoaders;
  now: Date;
  finalFocus: React.RefObject<HTMLElement | null>;
  onReload: () => Promise<WellbeingRecord | undefined>;
  onClose: () => void;
  onSaved: (record: WellbeingRecord) => Promise<void>;
  onArchived: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => editorDraft(record)),
    [boundRecord, setBoundRecord] = useState(record),
    [conflictLatest, setConflictLatest] = useState<WellbeingRecord>(),
    [attempted, setAttempted] = useState(false),
    [message, setMessage] = useState<string>(),
    [confirmClose, setConfirmClose] = useState(false),
    conflictRef = useRef<HTMLDivElement | null>(null),
    nameRef = useRef<HTMLInputElement | null>(null),
    cadenceRef = useRef<HTMLInputElement | null>(null),
    daysRef = useRef<HTMLFieldSetElement | null>(null),
    choicesRef = useRef<HTMLFieldSetElement | null>(null),
    createRequestKey = useRef(crypto.randomUUID()),
    mutationKeys = useWellbeingMutationKeys();
  useEffect(() => {
    setBoundRecord(record);
    setDraft(editorDraft(record));
    setConflictLatest(undefined);
  }, [record?.id]);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(editorDraft(boundRecord));
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  const valid =
    draft.name.trim() &&
    draft.cadence.trim() &&
    draft.days.length > 0 &&
    draft.choices.length > 0;
  const save = useMutation({
    mutationFn: async () => {
      const value: RoutinePayload = {
        name: draft.name.trim(),
        cadence: draft.cadence.trim(),
        ...(draft.cue.trim() ? { cue: draft.cue.trim() } : {}),
        ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
        enabled: draft.enabled,
        preferredWindow: draft.preferredWindow,
        daysOfWeek: [...draft.days].sort(),
        completionChoices: draft.choices,
        noteRequired: draft.noteRequired,
        ...(draft.carePlanId ? { carePlanId: draft.carePlanId } : {}),
      };
      if (boundRecord) {
        const changes = {
            title: draft.name.trim(),
            payload: value,
            privacy: draft.privacy,
          };
        return loaders.update(
          boundRecord.id,
          boundRecord.version,
          changes,
          mutationKeys.acquire(
            "update",
            boundRecord.id,
            boundRecord.version,
            changes,
          ),
        );
      }
      return loaders.create({
            kind: "routine",
            title: draft.name.trim(),
            payload: value,
            recordedAt: now.toISOString(),
            privacy: draft.privacy,
            source: { kind: "manual", label: "You" },
          }, createRequestKey.current);
    },
    onSuccess: ({ record: saved }) => {
      if (boundRecord) mutationKeys.settle("update", boundRecord.id);
      return onSaved(saved);
    },
    onError: async (reason) => {
      const conflict =
        reason instanceof RuntimeRequestError
          ? reason.status === 409 || reason.code === "conflict"
          : reason instanceof Error && reason.message === "CONFLICT";
      if (conflict && boundRecord) {
        const latest = await onReload();
        if (latest) setConflictLatest(latest);
      }
      setMessage(
        conflict
          ? "A newer saved routine is available. Compare it with your draft before choosing which version to continue from."
          : "The routine could not be saved. Your draft and existing routine history remain unchanged.",
      );
      requestAnimationFrame(() => {
        if (typeof conflictRef.current?.scrollIntoView === "function")
          conflictRef.current.scrollIntoView({ block: "nearest" });
        conflictRef.current?.focus({ preventScroll: true });
      });
    },
  });
  const archive = useMutation({
    mutationFn: () => loaders.archive(
      record!.id,
      record!.version,
      mutationKeys.acquire("archive", record!.id, record!.version),
    ),
    onSuccess: async () => {
      mutationKeys.settle("archive", record!.id);
      await onArchived();
    },
    onError: () =>
      setMessage("The routine changed before it could be archived."),
  });
  const toggleChoice = (choice: "done" | "skipped") =>
    setDraft((current) => ({
      ...current,
      choices: current.choices.includes(choice)
        ? current.choices.filter((item) => item !== choice)
        : [...current.choices, choice],
    }));
  const toggleDay = (day: number) =>
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day],
    }));
  const carePlanLabel = (id: string) =>
    relatedCarePlanLabel(carePlans, id) ?? "Not linked";
  const carePlanOptions = [
    { value: "none", label: "No related care plan" },
    ...(draft.carePlanId && !carePlans.some((plan) => plan.id === draft.carePlanId)
      ? [{
          value: draft.carePlanId,
          label: relatedCarePlanLabel(carePlans, draft.carePlanId)!,
        }]
      : []),
    ...carePlans.map((plan) => ({
      value: plan.id,
      label: plan.title,
    })),
  ];
  const conflictFields = conflictLatest
    ? (() => {
        const latest = editorDraft(conflictLatest);
        const responseLabel = (choices: RoutineDraft["choices"]) =>
          choices.map((choice) => (choice === "done" ? "Complete" : "Skip")).join(", ") || "None";
        const dayLabel = (days: number[]) =>
          days.map((day) => DAY_LABELS[day]).join(", ") || "No days selected";
        return [
          ["Name", latest.name || "Not set", draft.name || "Not set"],
          ["Cadence", latest.cadence || "Not set", draft.cadence || "Not set"],
          ["Preferred window", WINDOW_LABEL[latest.preferredWindow], WINDOW_LABEL[draft.preferredWindow]],
          ["Days", dayLabel(latest.days), dayLabel(draft.days)],
          ["Cue or time", latest.cue || "Not set", draft.cue || "Not set"],
          ["Why it matters", latest.reason || "Not set", draft.reason || "Not set"],
          ["Supported responses", responseLabel(latest.choices), responseLabel(draft.choices)],
          ["Response note", latest.noteRequired ? "Required" : "Optional", draft.noteRequired ? "Required" : "Optional"],
          ["Related care plan", carePlanLabel(latest.carePlanId), carePlanLabel(draft.carePlanId)],
          ["Privacy", latest.privacy === "restricted" ? "Restricted" : "Private", draft.privacy === "restricted" ? "Restricted" : "Private"],
          ["State", latest.enabled ? "Active" : "Paused", draft.enabled ? "Active" : "Paused"],
        ] as const;
      })()
    : [];
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={() => undefined}
        title={record ? `Edit ${record.title}` : "New routine"}
        description="Recurring wellbeing check-in. This does not create a Work goal or task."
        purpose="properties"
        className="routine-editor-sheet"
        dismissPolicy="explicit"
        onDismissAttempt={requestClose}
        finalFocus={finalFocus}
        actions={
          <>
            <div className="routine-editor-sheet__lifecycle">
              {record && record.state === "active" ? (
                <Button
                  type="button"
                  className="routine-editor-sheet__archive-action"
                  tone="ghost"
                  onClick={() => archive.mutate()}
                  loading={archive.isPending}
                >
                  Archive routine
                </Button>
              ) : null}
            </div>
            <div className="routine-editor-sheet__commit-actions">
              <Button type="button" tone="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="routine-editor-form"
                tone="primary"
                loading={save.isPending}
                disabled={missing}
              >
                Save routine
              </Button>
            </div>
          </>
        }
      >
        <form
          id="routine-editor-form"
          className="routine-editor"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (!draft.name.trim()) nameRef.current?.focus();
            else if (!draft.cadence.trim()) cadenceRef.current?.focus();
            else if (!draft.days.length)
              requestAnimationFrame(() =>
                daysRef.current
                  ?.querySelector<HTMLElement>("[role='checkbox']")
                  ?.focus(),
              );
            else if (!draft.choices.length)
              requestAnimationFrame(() =>
                choicesRef.current
                  ?.querySelector<HTMLElement>("[role='checkbox']")
                  ?.focus(),
              );
            else if (valid) save.mutate();
          }}
        >
          {attempted && !valid ? (
            <p className="routine-editor__validation" role="alert">
              Review the marked fields before saving this routine.
            </p>
          ) : null}
          <Field label="Name">
            <Input
              ref={nameRef}
              autoFocus
              required
              aria-required="true"
              aria-invalid={attempted && !draft.name.trim()}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <Field
            label="Cadence"
            hint="Plain-language description shown with the structured weekdays."
          >
            <Input
              ref={cadenceRef}
              required
              aria-required="true"
              aria-invalid={attempted && !draft.cadence.trim()}
              value={draft.cadence}
              onChange={(event) =>
                setDraft({ ...draft, cadence: event.target.value })
              }
            />
          </Field>
          <Field label="Preferred window">
            <KoraSelect
              label="Preferred window"
              value={draft.preferredWindow}
              options={Object.entries(WINDOW_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
              onValueChange={(preferredWindow) =>
                setDraft({
                  ...draft,
                  preferredWindow:
                    preferredWindow as RoutineDraft["preferredWindow"],
                })
              }
            />
          </Field>
          <fieldset ref={daysRef} className="routine-editor__days">
            <legend>Days</legend>
            <p>
              Select the days this routine is actually due. No response is never
              inferred from a missing provider event.
            </p>
            <div>
              {DAY_LABELS.map((label, day) => (
                <CheckboxChoice
                  key={label}
                  checked={draft.days.includes(day)}
                  onCheckedChange={() => toggleDay(day)}
                  title={label}
                />
              ))}
            </div>
            {attempted && !draft.days.length ? (
              <small role="alert">Choose at least one day.</small>
            ) : null}
          </fieldset>
          <div className="routine-editor__row">
            <Field label="Cue or time" hint="Optional, in your own words.">
              <Input
                value={draft.cue}
                onChange={(event) =>
                  setDraft({ ...draft, cue: event.target.value })
                }
              />
            </Field>
            <Field
              label="Why it matters"
              hint="Optional owner-authored context."
            >
              <Input
                value={draft.reason}
                onChange={(event) =>
                  setDraft({ ...draft, reason: event.target.value })
                }
              />
            </Field>
          </div>
          <fieldset ref={choicesRef} className="routine-editor__choices">
            <legend>Supported responses</legend>
            <CheckboxChoice
              checked={draft.choices.includes("done")}
              onCheckedChange={() => toggleChoice("done")}
              title="Complete"
            />
            <CheckboxChoice
              checked={draft.choices.includes("skipped")}
              onCheckedChange={() => toggleChoice("skipped")}
              title="Skip"
            />
            {attempted && !draft.choices.length ? (
              <small role="alert">Choose at least one response.</small>
            ) : null}
          </fieldset>
          <CheckboxChoice
            checked={draft.noteRequired}
            onCheckedChange={(noteRequired) =>
              setDraft({ ...draft, noteRequired })
            }
            title="Require a note with each response"
            hint="Opens a short inline field before saving."
          />
          <Field
            label="Related care plan"
            hint={
              carePlansComplete
                ? "Optional. This relation does not change treatment or medication instructions."
                : "Optional. Only the loaded care plans are available; this list may be incomplete."
            }
          >
            <KoraSelect
              label="Related care plan"
              value={draft.carePlanId || "none"}
              options={carePlanOptions}
              onValueChange={(carePlanId) =>
                setDraft({
                  ...draft,
                  carePlanId: carePlanId === "none" ? "" : carePlanId,
                })
              }
            />
          </Field>
          <section
            className="routine-editor__reminder"
            aria-labelledby="routine-reminder-title"
          >
            <ShieldCheck size={16} />
            <div>
              <strong id="routine-reminder-title">
                No reminder schedule is connected
              </strong>
              <p>
                This Wellbeing record owns the cadence and your responses.
                Saving this definition does not create a Calendar event or provider reminder.
              </p>
            </div>
          </section>
          <div className="routine-editor__row">
            <Field label="Default privacy">
              <KoraSelect
                label="Default privacy"
                value={draft.privacy}
                options={[
                  { value: "private", label: "Private" },
                  { value: "restricted", label: "Restricted" },
                ]}
                onValueChange={(privacy) =>
                  setDraft({
                    ...draft,
                    privacy: privacy as RoutineDraft["privacy"],
                  })
                }
              />
            </Field>
            <CheckboxChoice
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
              title="Routine is active"
              hint="Turn off to pause without losing history."
            />
          </div>
          {missing ? (
            <p className="routine-editor__message" role="alert">
              This routine is unavailable or restricted. Close the panel and
              reopen Routines.
            </p>
          ) : null}
          {message ? (
            <div
              ref={conflictRef}
              tabIndex={-1}
              className="routine-editor__message"
              role="alert"
            >
              <strong>Routine was not saved</strong>
              <p>{message}</p>
              {conflictLatest ? (
                <div className="routine-editor__comparison">
                  <div>
                    <strong>Latest saved</strong>
                    <dl>
                      {conflictFields.map(([label, latest]) => (
                        <div key={label}><dt>{label}</dt><dd>{latest}</dd></div>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <strong>Your draft</strong>
                    <dl>
                      {conflictFields.map(([label, _latest, ownerDraft]) => (
                        <div key={label}><dt>{label}</dt><dd>{ownerDraft}</dd></div>
                      ))}
                    </dl>
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                tone="secondary"
                onClick={() => {
                  if (conflictLatest) setBoundRecord(conflictLatest);
                  setConflictLatest(undefined);
                  setMessage(undefined);
                }}
              >
                {conflictLatest ? "Keep editing my draft" : "Review draft"}
              </Button>
              {conflictLatest ? (
                <Button
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    setBoundRecord(conflictLatest);
                    setDraft(editorDraft(conflictLatest));
                    setConflictLatest(undefined);
                    setMessage(undefined);
                    setAttempted(false);
                  }}
                >
                  Use latest saved
                </Button>
              ) : null}
            </div>
          ) : null}
        </form>
      </Sheet>
      <Modal
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard routine changes?"
        description="The unsaved routine draft will be lost."
        purpose="confirm"
      >
        <div className="routine-editor__discard-actions">
          <Button tone="secondary" onClick={() => setConfirmClose(false)}>
            Keep editing
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              setConfirmClose(false);
              onClose();
            }}
          >
            Discard changes
          </Button>
        </div>
      </Modal>
    </>
  );
}

function RoutineState({
  title,
  description,
  action,
  headerActions,
  busy,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  headerActions?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="wellbeing-routines-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Routines"
          description="Small recurring wellbeing check-ins."
          status="Private by default · Routine history"
          actions={headerActions}
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
