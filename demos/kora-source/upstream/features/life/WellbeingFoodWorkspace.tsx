import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CupSoda,
  MessageCircleMore,
  Paperclip,
  Plus,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Disclosure,
  Input,
  Menu,
  PageHeader,
  Pressable,
  Sheet,
  StateView,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type WellbeingRecord,
  type WellbeingRecordKind,
  type WellbeingSourceCoverage,
} from "../../lib/runtime";
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
import "./wellbeing-today.css";
import "./wellbeing-food.css";

const FOOD_KINDS: WellbeingRecordKind[] = ["meal", "drink"];

function supportedFoodKind(value: string | null): "meal" | "drink" | null {
  return value === "meal" || value === "drink" ? value : null;
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

function localDateKey(date: Date) {
  const year = date.getFullYear(),
    month = String(date.getMonth() + 1).padStart(2, "0"),
    day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate(),
    );
  const [year, month, day] = value.split("-").map(Number),
    parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
    ? parsed
    : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function dayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function editorMoment(date: Date, now: Date) {
  if (localDateKey(date) === localDateKey(now)) return now;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    now.getHours(),
    now.getMinutes(),
  );
}

function dateHeading(date: Date, today: Date) {
  if (localDateKey(date) === localDateKey(today)) return "Today";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function periodFor(
  record: WellbeingRecord,
): "Morning" | "Afternoon" | "Evening" {
  const hour = new Date(record.recordedAt).getHours();
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

function mealType(record: WellbeingRecord) {
  const value = (record.payload as Record<string, unknown>).mealType;
  return typeof value === "string"
    ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
    : "Meal";
}

function foodPrimary(record: WellbeingRecord) {
  return record.title.trim() || (record.kind === "meal" ? "Meal recorded" : "Drink recorded");
}

function foodSecondary(record: WellbeingRecord) {
  const summary = momentSummary(record).trim(),
    primary = foodPrimary(record);
  return summary && summary !== primary ? summary : undefined;
}

function foodMetadata(record: WellbeingRecord) {
  const payload = record.payload as Record<string, unknown>,
    interpretation = payload.interpretation as { state?: string } | undefined,
    foods = Array.isArray(payload.foods) ? payload.foods.map(String) : [],
    tags = Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    notes = typeof payload.notes === "string" ? payload.notes.trim() : "",
    summary = momentSummary(record).trim(),
    evidence = payload.evidence as
      | { state?: "available" | "unavailable"; label?: string }
      | undefined;
  return {
    structuredCount:
      record.kind === "meal" && foods.length && interpretation?.state !== "proposed"
        ? foods.length
        : 0,
    notes: notes && notes !== summary && notes !== record.title.trim() ? notes : "",
    tags,
    evidence,
  };
}

function foodSummary(records: WellbeingRecord[], complete: boolean) {
  const meals = records.filter((record) => record.kind === "meal").length,
    drinks = records.filter((record) => record.kind === "drink").length,
    ordered = [...records].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt),
    );
  let largestGap = 0;
  for (let index = 1; index < ordered.length; index += 1)
    largestGap = Math.max(
      largestGap,
      new Date(ordered[index].recordedAt).getTime() -
        new Date(ordered[index - 1].recordedAt).getTime(),
    );
  const gap =
    largestGap > 0
      ? `${Math.floor(largestGap / 3_600_000)}h ${Math.round((largestGap % 3_600_000) / 60_000)}m`
      : "—";
  return {
    meals: complete ? String(meals) : `${meals}+`,
    drinks: complete ? String(drinks) : `${drinks}+`,
    gap,
    gapLabel: complete
      ? "Longest gap between entries"
      : "Largest gap in loaded entries",
  };
}

export function WellbeingFoodWorkspace({
  loaders = defaultLoaders,
  initialNow,
  onAskKora,
}: {
  loaders?: WellbeingTodayLoaders;
  initialNow?: Date;
  onAskKora?: (
    reference?: ConversationContextReference,
    draft?: string,
  ) => void;
}) {
  const now = initialNow ?? new Date(),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    [settlement, setSettlement] = useState<{
      message: string;
      archived?: WellbeingRecord;
    }>(),
    [restoredFocusId, setRestoredFocusId] = useState<string>(),
    [pageLoadError, setPageLoadError] = useState(false),
    [pageLoadPending, setPageLoadPending] = useState(false),
    queryClient = useQueryClient(),
    requestedDate = params.get("date"),
    selectedDate = dateFromKey(requestedDate, now),
    bounds = useMemo(
      () => dayBounds(selectedDate),
      [localDateKey(selectedDate)],
    ),
    selectedId = params.get("record") ?? undefined,
    requestedLogKind = params.get("log"),
    logKind = supportedFoodKind(requestedLogKind),
    editing = params.get("edit") === "1",
    mutationKeys = useWellbeingMutationKeys();
  const editorTrigger = useRef<HTMLElement | null>(null),
    routeOpenedHere = useRef(false),
    editorOpenedHere = useRef(false),
    firstActionRef = useRef<HTMLButtonElement | null>(null),
    viewLogRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    setPageLoadError(false);
  }, [bounds.start, bounds.end]);
  useEffect(() => {
    const invalidDate =
      requestedDate &&
      (localDateKey(selectedDate) !== requestedDate ||
        requestedDate > localDateKey(now));
    const invalidLog = requestedLogKind && !logKind;
    if (!invalidDate && !invalidLog) return;
    const next = new URLSearchParams(params);
    if (invalidDate) next.delete("date");
    if (invalidLog) {
      next.delete("log");
      if (!selectedId) next.delete("edit");
    }
    setParams(next, { replace: true });
  }, [logKind, now, params, requestedDate, requestedLogKind, selectedDate, selectedId, setParams]);
  const food = useInfiniteQuery({
    queryKey: ["wellbeing", "food", bounds.start, bounds.end],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      loaders.list({
        kinds: FOOD_KINDS,
        start: bounds.start,
        end: bounds.end,
        pageSize: 100,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => (page.complete ? undefined : page.cursor),
    retry: false,
  });
  const sources = useQuery({
    queryKey: ["wellbeing", "sources", ...FOOD_KINDS],
    queryFn: () => loaders.sources({ kinds: FOOD_KINDS }),
  });
  const selected = useQuery({
    queryKey: ["wellbeing", "record", selectedId],
    queryFn: () => loaders.read(selectedId!),
    enabled: Boolean(selectedId),
  });
  const pages = food.data?.pages ?? [],
    records = useMemo(() => {
      const byId = new Map<string, WellbeingRecord>();
      for (const page of pages)
        for (const record of page.items) {
          // Restricted records are omitted by the authority. Keep the Food
          // chronology non-disclosing even if an invalid page includes one.
          if (record.privacy === "restricted") continue;
          const current = byId.get(record.id);
          if (!current || record.version >= current.version)
            byId.set(record.id, record);
        }
      return [...byId.values()];
    }, [pages]),
    complete = Boolean(pages.at(-1)?.complete),
    retainedReadError = Boolean(food.isError && food.data?.pages.length),
    nextPageError = Boolean(retainedReadError && food.isFetchNextPageError),
    restrictedOmitted = pages.some(
      (page) =>
        page.restrictedOmitted ||
        page.items.some((record) => record.privacy === "restricted"),
    ),
    summary = foodSummary(records, complete && !retainedReadError);
  useEffect(() => {
    if (!restoredFocusId || !records.some((record) => record.id === restoredFocusId))
      return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-food-record-id="${CSS.escape(restoredFocusId)}"]`,
      );
      if (!target) return;
      target.focus({ preventScroll: true });
      setRestoredFocusId(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [records, restoredFocusId]);
  const selectedRecord = selected.data?.record,
    selectedIsRestricted = selectedRecord?.privacy === "restricted",
    visibleSelectedRecord = selectedIsRestricted ? undefined : selectedRecord,
    selectedIsFood = Boolean(
      visibleSelectedRecord && supportedFoodKind(visibleSelectedRecord.kind),
    );
  const wellbeingReturn = useWellbeingReturnContext({
    ready: Boolean(food.data),
    rootSelector: ".wellbeing-food-workspace",
    fallbackRef: firstActionRef,
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
  const chooseDate = (date: Date) =>
    setRouteState({
      date:
        localDateKey(date) === localDateKey(now)
          ? undefined
          : localDateKey(date),
      record: undefined,
      edit: undefined,
    });
  const moveDate = (days: number) =>
    chooseDate(
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate() + days,
      ),
    );
  const openRecord = (id: string, trigger?: HTMLElement | null) => {
    routeOpenedHere.current = true;
    wellbeingReturn.rememberAndOpenQuery(
      { record: id, log: undefined, edit: undefined },
      wellbeingRecordReturnId(id),
    );
  };
  const openLog = (kind: "meal" | "drink", trigger?: HTMLElement | null) => {
    editorTrigger.current = trigger ?? firstActionRef.current;
    editorOpenedHere.current = true;
    setRouteState({ log: kind, record: undefined, edit: undefined });
  };
  const closeRecord = () => {
    if (routeOpenedHere.current) {
      routeOpenedHere.current = false;
      navigate(-1);
    } else setRouteState({ record: undefined, edit: undefined }, true);
    wellbeingReturn.focusReturnTarget(selectedId ? wellbeingRecordReturnId(selectedId) : undefined);
  };
  const closeEditor = () => {
    if (editing) {
      setRouteState({ edit: undefined }, true);
      return;
    }
    if (editorOpenedHere.current) {
      editorOpenedHere.current = false;
      navigate(-1);
    } else setRouteState({ log: undefined, edit: undefined }, true);
  };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "food"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "today"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "record"] }),
      queryClient.invalidateQueries({ queryKey: ["wellbeing", "sources"] }),
    ]);
  };
  const restoreArchive = useMutation({
    mutationFn: (record: WellbeingRecord) =>
      loaders.restore(
        record.id,
        record.version,
        mutationKeys.acquire("restore", record.id, record.version),
      ),
    onSuccess: async ({ record }, archivedRecord) => {
      mutationKeys.settle("restore", archivedRecord.id);
      setRestoredFocusId(record.id);
      await refresh();
      setSettlement({ message: `${record.title} restored to Food.` });
    },
    onError: (error, record) =>
      setSettlement({
        message: `${record.title} remains archived. ${error instanceof Error ? error.message : "Restore could not be completed."}`,
        archived: record,
      }),
  });

  const headerActions = (
        <Menu
          align="end"
          trigger={<Button ref={viewLogRef} tone="primary"><Plus size={15} />Log</Button>}
          actions={[
            { id: "meal", label: "Meal", description: "Remember a meal in your own words", icon: <Utensils size={15} />, onSelect: () => openLog("meal", viewLogRef.current) },
            { id: "drink", label: "Drink", description: "Remember a drink or amount", icon: <CupSoda size={15} />, onSelect: () => openLog("drink", viewLogRef.current) },
          ]}
        />
  );

  if (food.isLoading)
    return (
      <FoodState
        title="Opening Food"
        description="Reading local meal and drink records."
        headerActions={headerActions}
        busy
      />
    );
  if (food.isError && !food.data)
    return (
      <FoodState
        title="Food could not be opened"
        description={
          food.error instanceof RuntimeRequestError
            ? food.error.message
            : "Kora could not read local meal and drink records."
        }
        headerActions={headerActions}
        action={
          <Button tone="primary" onClick={() => food.refetch()}>
            Try again
          </Button>
        }
      />
    );

  return (
    <section className="wellbeing-food-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Food"
          description="A lightweight memory of meals and drinks—not a score or diet target."
          status={
            <><span>Private by default · Food memory</span><span aria-hidden="true">·</span><span>{complete
              ? retainedReadError
                ? "Known entries retained · freshness unknown"
                : "Local chronology current"
              : "Known entries shown · more history may be available"}</span></>
          }
          actions={headerActions}
        />
        <FoodDateBar
          date={selectedDate}
          today={now}
          onPrevious={() => moveDate(-1)}
          onNext={() => moveDate(1)}
          onToday={() => chooseDate(now)}
          onJump={chooseDate}
        />
        <div
          className="wellbeing-food-actions"
          role="group"
          aria-label="Food logging actions"
        >
          <div>
            <span>Quick log</span>
            <strong>Add what you want to remember</strong>
          </div>
          <div>
            <Button
              ref={firstActionRef}
              data-wellbeing-return-fallback
              tone="primary"
              onClick={(event) => openLog("meal", event.currentTarget)}
            >
              <Utensils size={16} />
              Log meal
            </Button>
            <Button
              tone="secondary"
              onClick={(event) => openLog("drink", event.currentTarget)}
            >
              <CupSoda size={16} />
              Log drink
            </Button>
          </div>
        </div>
        <FoodSourceNotice
          coverage={sources.data}
          unavailable={sources.isError}
          retrying={sources.isFetching}
          onRetry={() => void sources.refetch()}
        />
        {retainedReadError && !nextPageError && !pageLoadError ? (
          <FoodReadNotice onRetry={() => void food.refetch()} />
        ) : null}
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
        <div className="wellbeing-food-layout" data-empty={!records.length || undefined}>
          <FoodDay
            records={records}
            date={selectedDate}
            today={now}
            stale={retainedReadError}
            restrictedOmitted={restrictedOmitted}
            hasMore={Boolean(food.hasNextPage || nextPageError || pageLoadError)}
            loadingMore={pageLoadPending}
            loadMoreError={Boolean(nextPageError || pageLoadError)}
            onLoadMore={() => {
              // Keep the known collection mounted while the next cursor settles.
              // The pending state suppresses the error copy; a qualified success
              // clears this guard, while a swallowed query error leaves retry.
              setPageLoadError(true);
              setPageLoadPending(true);
              void food
                .fetchNextPage({ throwOnError: true })
                .then((result) => {
                  if (!result.error) setPageLoadError(false);
                })
                .catch(() => setPageLoadError(true))
                .finally(() => setPageLoadPending(false));
            }}
            onOpen={openRecord}
          />
          {records.length ? <FoodDaySummary
            meals={summary.meals}
            drinks={summary.drinks}
            gap={summary.gap}
            gapLabel={summary.gapLabel}
            hasRecords
          /> : null}
        </div>
      </WellbeingFrame>
      <RecordDetailSheet
        record={selectedIsFood ? visibleSelectedRecord : undefined}
        loading={selected.isLoading}
        error={
          selected.isError ||
          selectedIsRestricted ||
          Boolean(visibleSelectedRecord && !selectedIsFood)
        }
        unavailableBody={
          selectedIsRestricted
            ? "This record is Restricted. Food cannot reveal its title or contents without an exact approved access flow."
            : visibleSelectedRecord && !selectedIsFood
            ? "This record is not a meal or drink. Open its owning Wellbeing page instead."
            : "This Food record is missing, restricted, or unavailable. No private content has been disclosed."
        }
        open={Boolean(selectedId && (!editing || !selectedIsFood))}
        onClose={closeRecord}
        onEdit={(trigger) => {
          editorTrigger.current = trigger ?? null;
          setRouteState({ edit: "1" }, true);
        }}
        onAskKora={
          onAskKora && visibleSelectedRecord
            ? (record) =>
                onAskKora(
                  {
                    kind: "wellbeing_record",
                    id: record.id,
                    title: record.title,
                  },
                  "Help me review this exact Food record. Use only the attached record, preserve its privacy boundary, and distinguish what was recorded from any interpretation.",
                )
            : undefined
        }
        detailSupplement={(record) => (
          <FoodInterpretationReview
            record={record}
            loaders={loaders}
            onConfirmed={refresh}
          />
        )}
        returnLabel="Food"
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
        onRestore={async (record) => {
          const result = await loaders.restore(
            record.id,
            record.version,
            mutationKeys.acquire("restore", record.id, record.version),
          );
          mutationKeys.settle("restore", record.id);
          setRestoredFocusId(result.record.id);
          await refresh();
          closeRecord();
          setSettlement({ message: `${record.title} restored to Food.` });
          return result.record;
        }}
        onDelete={
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
                    message: `${record.title} refreshed. Review the latest version before deleting.`,
                  });
                },
              }
            : undefined
        }
      />
      <WellbeingRecordEditor
        open={Boolean(logKind || (editing && selectedIsFood))}
        kind={logKind ?? (selectedIsFood ? visibleSelectedRecord!.kind : "meal")}
        record={editing && selectedIsFood ? visibleSelectedRecord : undefined}
        now={editorMoment(selectedDate, now)}
        onClose={closeEditor}
        finalFocus={editorTrigger}
        loaders={loaders}
        onSaved={async (record) => {
          await refresh();
          if (record.privacy === "restricted") {
            editorOpenedHere.current = false;
            routeOpenedHere.current = false;
            setRouteState({
              record: undefined,
              log: undefined,
              edit: undefined,
            }, true);
            setSettlement({
              message:
                "Restricted record saved. It is omitted from Food until exact access is granted.",
            });
            return;
          }
          if (!editing) routeOpenedHere.current = editorOpenedHere.current;
          editorOpenedHere.current = false;
          setRouteState(
            { record: record.id, log: undefined, edit: undefined },
            true,
          );
        }}
      />
    </section>
  );
}

function FoodInterpretationReview({
  record,
  loaders,
  onConfirmed,
}: {
  record: WellbeingRecord;
  loaders: WellbeingTodayLoaders;
  onConfirmed: () => Promise<void>;
}) {
  type Interpretation = {
    state: "proposed" | "confirmed";
    items: Array<{ name: string; portion?: string }>;
    tags?: string[];
    generatedAt?: string;
  };
  const interpretationFor = (candidate: WellbeingRecord) =>
    (candidate.payload as Record<string, unknown>).interpretation as
      | Interpretation
      | undefined;
  const interpretation = interpretationFor(record);
  const [baseRecord, setBaseRecord] = useState(record),
    [items, setItems] = useState(() => interpretation?.items ?? []),
    [included, setIncluded] = useState(
      () => new Set((interpretation?.items ?? []).map((_, index) => index)),
    ),
    [tags, setTags] = useState(() => interpretation?.tags ?? []),
    [includedTags, setIncludedTags] = useState(
      () => new Set((interpretation?.tags ?? []).map((_, index) => index)),
    ),
    [conflictLatest, setConflictLatest] = useState<WellbeingRecord>(),
    [error, setError] = useState<string>();
  const invalidItemRef = useRef<HTMLInputElement | null>(null),
    mutationKeys = useWellbeingMutationKeys();
  const resetFrom = (candidate: WellbeingRecord) => {
    const next = interpretationFor(candidate);
    setBaseRecord(candidate);
    setItems(next?.items ?? []);
    setIncluded(new Set((next?.items ?? []).map((_, index) => index)));
    setTags(next?.tags ?? []);
    setIncludedTags(new Set((next?.tags ?? []).map((_, index) => index)));
    setConflictLatest(undefined);
    setError(undefined);
  };
  useEffect(() => {
    resetFrom(record);
  }, [record.id, record.version]);
  const confirm = useMutation({
    mutationFn: async () => {
      const confirmedItems = items.filter((_, index) => included.has(index));
      if (!confirmedItems.length)
        throw new Error("Keep at least one item or edit the record instead.");
      const firstInvalid = confirmedItems.findIndex((item) => !item.name.trim());
      if (firstInvalid >= 0)
        throw new Error("Each included item needs a name before confirmation.");
      const payload = baseRecord.payload as Record<string, unknown>,
        latestInterpretation = interpretationFor(baseRecord),
        existingFoods = Array.isArray(payload.foods)
        ? payload.foods.map(String)
        : [],
        existingTags = Array.isArray(payload.tags)
        ? payload.tags.map(String)
        : [];
      const confirmedTags = tags
        .filter((_, index) => includedTags.has(index))
        .map((tag) => tag.trim())
        .filter(Boolean);
      const changes = {
        payload: {
          ...payload,
          foods: [
            ...new Set([
              ...existingFoods,
              ...confirmedItems.map((item) => item.name.trim()),
            ]),
          ],
          tags: [...new Set([...existingTags, ...confirmedTags])],
          interpretation: {
            ...latestInterpretation,
            state: "confirmed",
            items: confirmedItems.map((item) => ({
              name: item.name.trim(),
              ...(item.portion?.trim() ? { portion: item.portion.trim() } : {}),
            })),
            tags: confirmedTags,
          } as Interpretation,
        } as WellbeingRecord["payload"],
      };
      return loaders.update(
        baseRecord.id,
        baseRecord.version,
        changes,
        mutationKeys.acquire(
          "update",
          baseRecord.id,
          baseRecord.version,
          changes,
        ),
      );
    },
    onSuccess: async () => {
      mutationKeys.settle("update", baseRecord.id);
      setError(undefined);
      await onConfirmed();
    },
    onError: async (reason) => {
      const message =
        reason instanceof Error
          ? reason.message
          : "The interpretation could not be confirmed.";
      setError(message);
      if (/needs a name/i.test(message)) {
        requestAnimationFrame(() => invalidItemRef.current?.focus());
        return;
      }
      if (
        ((reason instanceof RuntimeRequestError && reason.status === 409) ||
          /conflict|changed/i.test(message))
      ) {
        try {
          const latest = (await loaders.read(baseRecord.id)).record;
          if (supportedFoodKind(latest.kind)) setConflictLatest(latest);
        } catch {
          /* Keep the correction draft and original failure visible. */
        }
      }
    },
  });
  if (!interpretation) return null;
  if (interpretation.state === "confirmed")
    return (
      <section
        className="food-interpretation food-interpretation--confirmed"
        aria-labelledby="food-interpretation-title"
      >
        <div>
          <Badge tone="success">Confirmed</Badge>
          <h3 id="food-interpretation-title">Confirmed structure</h3>
        </div>
        <ul>
          {interpretation.items.map((item) => (
            <li key={`${item.name}:${item.portion ?? ""}`}>
              <strong>{item.name}</strong>
              {item.portion ? <span>{item.portion}</span> : null}
            </li>
          ))}
        </ul>
        {interpretation.tags?.length ? (
          <p>Confirmed tags: {interpretation.tags.join(", ")}</p>
        ) : null}
      </section>
    );
  return (
    <section
      className="food-interpretation"
      aria-labelledby="food-interpretation-title"
    >
      <div>
        <Badge tone="warning">Proposed</Badge>
        <h3 id="food-interpretation-title">Proposed interpretation</h3>
        <p>
          Kora’s extraction is not authoritative. Keep, correct, or omit each
          item before confirming; the original description remains unchanged.
        </p>
        <small>
          {sourceLabel(record)}
          {interpretation.generatedAt
            ? ` · proposed ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(interpretation.generatedAt))}`
            : " · proposal time not recorded"}
          {((record.payload as Record<string, unknown>).evidence as { state?: string; label?: string } | undefined)
            ? ` · ${String((((record.payload as Record<string, unknown>).evidence as { label?: string }).label ?? "Evidence"))} ${String((((record.payload as Record<string, unknown>).evidence as { state?: string }).state ?? "unavailable")).replaceAll("_", " ")}`
            : " · no linked evidence reference"}
        </small>
      </div>
      <div className="food-interpretation__items">
        {items.map((item, index) => (
          <div key={index} className="food-interpretation__item">
            <Button
              tone="ghost"
              aria-label={`${included.has(index) ? "Omit" : "Restore"} ${item.name || `proposed item ${index + 1}`}`}
              onClick={() =>
                setIncluded((current) => {
                  const next = new Set(current);
                  next.has(index) ? next.delete(index) : next.add(index);
                  return next;
                })
              }
            >
              {included.has(index) ? "Omit" : "Restore"}
            </Button>
            <Input
              ref={included.has(index) && !item.name.trim() ? invalidItemRef : undefined}
              aria-label={`Correct proposed item ${index + 1}`}
              aria-invalid={included.has(index) && !item.name.trim()}
              value={item.name}
              disabled={!included.has(index)}
              onChange={(event) =>
                setItems((current) =>
                  current.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, name: event.target.value }
                      : candidate,
                  ),
                )
              }
            />
            <Input
              aria-label={`Portion for proposed item ${index + 1}`}
              placeholder="Optional portion"
              value={item.portion ?? ""}
              disabled={!included.has(index)}
              onChange={(event) =>
                setItems((current) =>
                  current.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, portion: event.target.value }
                      : candidate,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
      {tags.length ? (
        <div className="food-interpretation__tags">
          <strong>Proposed tags</strong>
          <p>Tags are not added unless you keep them here.</p>
          {tags.map((tag, index) => (
            <div key={index}>
              <Button
                tone="ghost"
                aria-label={`${includedTags.has(index) ? "Omit" : "Restore"} tag ${tag || index + 1}`}
                onClick={() =>
                  setIncludedTags((current) => {
                    const next = new Set(current);
                    next.has(index) ? next.delete(index) : next.add(index);
                    return next;
                  })
                }
              >
                {includedTags.has(index) ? "Omit" : "Restore"}
              </Button>
              <Input
                aria-label={`Correct proposed tag ${index + 1}`}
                value={tag}
                disabled={!includedTags.has(index)}
                onChange={(event) =>
                  setTags((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index ? event.target.value : candidate,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      ) : null}
      {conflictLatest ? (
        <section className="wellbeing-conflict" role="alert" tabIndex={-1}>
          <strong>This interpretation changed elsewhere</strong>
          <p>Your selected items, portions, and tags are preserved until you choose how to continue.</p>
          <dl className="wellbeing-conflict__comparison">
            <div><dt>Latest original description</dt><dd>{String((conflictLatest.payload as Record<string, unknown>).description ?? "Not set")}</dd></div>
            <div><dt>Your base original description</dt><dd>{String((baseRecord.payload as Record<string, unknown>).description ?? "Not set")}</dd></div>
            <div><dt>Latest proposed fields</dt><dd>{interpretationSummary(interpretationFor(conflictLatest))}</dd></div>
            <div><dt>Your reviewed fields</dt><dd>{interpretationSummary({ items: items.filter((_, index) => included.has(index)), tags: tags.filter((_, index) => includedTags.has(index)) })}</dd></div>
          </dl>
          <div>
            <Button tone="ghost" onClick={() => resetFrom(conflictLatest)}>Use latest proposal</Button>
            <Button tone="secondary" onClick={() => { setBaseRecord(conflictLatest); setConflictLatest(undefined); confirm.reset(); setError(undefined); }}>Review my corrections against latest</Button>
          </div>
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <Button
        tone="primary"
        loading={confirm.isPending}
        onClick={() => confirm.mutate()}
      >
        Confirm selected structure
      </Button>
    </section>
  );
}

function interpretationSummary(
  interpretation?: {
    items: Array<{ name: string; portion?: string }>;
    tags?: string[];
  },
) {
  if (!interpretation) return "No proposed structure";
  const items = interpretation.items
      .map((item) => `${item.name || "Unnamed item"}${item.portion ? ` (${item.portion})` : ""}`)
      .join(", ") || "No items",
    tags = interpretation.tags?.length
      ? interpretation.tags.join(", ")
      : "No tags";
  return `${items} · Tags: ${tags}`;
}

function FoodDateBar({
  date,
  today,
  onPrevious,
  onNext,
  onToday,
  onJump,
}: {
  date: Date;
  today: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (date: Date) => void;
}) {
  const isToday = localDateKey(date) === localDateKey(today),
    canMoveNext = localDateKey(date) < localDateKey(today);
  return (
    <section className="food-date-bar" aria-label="Food day">
      <div className="food-date-bar__context">
        <h2>{dateHeading(date, today)}</h2>
        <time dateTime={localDateKey(date)}>
          {new Intl.DateTimeFormat(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          }).format(date)}
        </time>
      </div>
      <div>
        <Input
          type="date"
          aria-label="Jump to day"
          max={localDateKey(today)}
          value={localDateKey(date)}
          onChange={(event) => {
            const next = dateFromKey(event.target.value, today);
            onJump(next);
          }}
        />
        <Button tone="ghost" aria-label="Previous day" onClick={onPrevious}>
          <ChevronLeft size={16} />
        </Button>
        <Button tone="secondary" disabled={isToday} onClick={onToday}>
          Today
        </Button>
        <Button
          tone="ghost"
          aria-label="Next day"
          disabled={!canMoveNext}
          onClick={onNext}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </section>
  );
}

function FoodReadNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="food-read-notice" role="alert">
      <CircleAlert size={15} aria-hidden="true" />
      <div>
        <strong>The latest Food refresh failed.</strong>
        <p>The last successful entries remain visible and may be stale. This day is not confirmed current or complete.</p>
        <Button tone="ghost" onClick={onRetry}>Retry refresh</Button>
      </div>
    </div>
  );
}

function FoodSourceNotice({
  coverage,
  unavailable,
  retrying,
  onRetry,
}: {
  coverage?: WellbeingSourceCoverage;
  unavailable: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const notConfigured =
      coverage?.state === "local_only" &&
      coverage.external.some((source) => source.state === "not_configured"),
    permissionRestricted = coverage?.external.some(
      (source) => source.state === "permission_restricted",
    );
  if (
    !unavailable &&
    (!coverage || (coverage.state === "local_only" && !notConfigured))
  )
    return null;
  const message = unavailable
    ? "Connected or imported food coverage could not be checked. Local logging and saved local entries still work."
    : permissionRestricted
      ? "A connected food source does not grant the required permission. Known entries remain visible and local logging still works."
      : notConfigured
        ? "Food is local-only. No connected food source is configured; local logging remains fully available."
        : coverage!.state === "saved_external_records"
          ? "Saved external entries remain visible. Live connected coverage is not established."
          : "Some connected food coverage is incomplete. Known entries remain visible and local logging still works.";
  const affected =
      coverage?.external.filter((source) => source.state !== "current") ?? [],
    needsConnectionReview = affected.some(
      (source) =>
        source.kind === "provider" &&
        (source.state === "not_configured" ||
          source.state === "permission_restricted"),
    ),
    needsSourceRetry =
      unavailable ||
      affected.some(
        (source) =>
          source.state !== "not_configured" &&
          source.state !== "permission_restricted" &&
          source.state !== "saved_only",
      );
  return (
    <div className="wellbeing-source-notice food-source-notice">
      <CircleAlert size={15} />
      <div className="wellbeing-source-notice__body">
        <span role="status">{message}</span>
        {affected.length ? (
          <Disclosure
            className="food-source-disclosure"
            summary={`${affected.length} ${affected.length === 1 ? "source" : "sources"} to review`}
            description="Open source limits and recovery."
          >
            <ul>
              {affected.map((source) => (
                <li key={source.id}>
                  <strong>{source.label}</strong>
                  <span>
                    {source.limitation ??
                      `${source.state.replaceAll("_", " ")} coverage.`}
                    {source.lastRecordedAt
                      ? ` Latest recorded event ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(source.lastRecordedAt))}.`
                      : " No successful food entry is recorded for this source."}
                  </span>
                  <small>Recovery: {source.recoveryOwner}</small>
                </li>
              ))}
            </ul>
            {needsSourceRetry ? (
              <Button
                tone="link"
                className="wellbeing-source-notice__action"
                loading={retrying}
                onClick={onRetry}
              >
                Retry source status
              </Button>
            ) : null}
            {needsConnectionReview ? (
              <Link
                className="button button--link wellbeing-source-notice__action"
                to="/settings/integrations"
              >
                Review connections
              </Link>
            ) : null}
          </Disclosure>
        ) : needsSourceRetry ? (
          <Button
            tone="link"
            className="wellbeing-source-notice__action"
            loading={retrying}
            onClick={onRetry}
          >
            Retry source status
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FoodDay({
  records,
  date,
  today,
  stale,
  restrictedOmitted,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onOpen,
}: {
  records: WellbeingRecord[];
  date: Date;
  today: Date;
  stale: boolean;
  restrictedOmitted: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  onLoadMore: () => void;
  onOpen: (id: string, trigger?: HTMLElement | null) => void;
}) {
  const [periodPages, setPeriodPages] = useState<Record<string, number>>({});
  useEffect(() => setPeriodPages({}), [localDateKey(date)]);
  const groups = (["Morning", "Afternoon", "Evening"] as const).map(
    (label) => ({
      label,
      records: records
        .filter((record) => periodFor(record) === label)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    }),
  );
  return (
    <section className="food-day" aria-labelledby="food-day-title">
      <div className="wellbeing-section-heading">
        <div>
          <h2 id="food-day-title">{dateHeading(date, today)}’s food memory</h2>
        </div>
      </div>
      {records.length === 0 ? (
        <div className="food-day-empty">
          <div aria-hidden="true">
            <Utensils size={20} />
            <CupSoda size={17} />
          </div>
          <h3>{stale ? "The last successful Food read was empty." : "Nothing has been logged for this day."}</h3>
          <p>{stale ? "Refresh failed, so this empty state is not confirmed current. Try again to check the saved day." : "Remember a meal or drink in your own words. Nutrition analysis stays out of the way unless qualified structured data exists."}</p>
        </div>
      ) : (
        <div className="food-periods">
          {groups.map((group) => {
            const page = Math.min(
                periodPages[group.label] ?? 0,
                Math.max(0, Math.ceil(group.records.length / 20) - 1),
              ),
              start = page * 20,
              visible = group.records.slice(start, start + 20),
              pageCount = Math.ceil(group.records.length / 20);
            return (
              <section
                key={group.label}
                className="food-period"
                aria-labelledby={`food-${group.label.toLowerCase()}`}
              >
                <div className="food-period__heading">
                  <h3 id={`food-${group.label.toLowerCase()}`}>
                    {group.label}
                  </h3>
                  <span>
                    {group.records.length
                      ? `${group.records.length} ${group.records.length === 1 ? "entry" : "entries"}`
                      : "No entries"}
                  </span>
                </div>
                {group.records.length ? (
                  <>
                    <ol>
                      {visible.map((record) => {
                        const metadata = foodMetadata(record);
                        return <li key={record.id}>
                          <Pressable
                            type="button"
                            data-food-record-id={record.id}
                            data-wellbeing-return-id={wellbeingRecordReturnId(record.id)}
                            onClick={(event) =>
                              onOpen(record.id, event.currentTarget)
                            }
                          >
                            <time dateTime={record.recordedAt}>
                              {timeLabel(record.recordedAt)}
                            </time>
                            <span
                              className="food-entry__glyph"
                              aria-hidden="true"
                            >
                              {record.kind === "meal" ? (
                                <Utensils size={16} />
                              ) : (
                                <CupSoda size={16} />
                              )}
                            </span>
                            <span className="food-entry__content">
                              <span>
                                <strong>{foodPrimary(record)}</strong>
                                <Badge tone="quiet">
                                  {record.kind === "meal"
                                    ? mealType(record)
                                    : "Drink"}
                                </Badge>
                              </span>
                              {foodSecondary(record) ? (
                                <span className="food-entry__secondary">
                                  {foodSecondary(record)}
                                </span>
                              ) : null}
                              {metadata.structuredCount || metadata.notes || metadata.tags.length || metadata.evidence ? (
                                <span className="food-entry__desktop-meta">
                                  {metadata.structuredCount ? <span>{metadata.structuredCount} confirmed {metadata.structuredCount === 1 ? "item" : "items"}</span> : null}
                                  {metadata.notes ? <span>{metadata.notes}</span> : null}
                                  {metadata.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                                  {metadata.evidence ? <span><Paperclip size={12} aria-hidden="true" />{metadata.evidence.label ?? "Evidence"} · {metadata.evidence.state === "available" ? "available" : "unavailable"}</span> : null}
                                </span>
                              ) : null}
                              <small>
                                {sourceLabel(record)} ·{" "}
                                {record.privacy === "restricted"
                                  ? "Restricted"
                                  : "Private"}
                              </small>
                            </span>
                            <ChevronRight size={15} aria-hidden="true" />
                          </Pressable>
                        </li>;
                      })}
                    </ol>
                    {pageCount > 1 ? (
                      <div
                        className="food-period__pagination"
                        aria-label={`${group.label} entries ${start + 1}–${start + visible.length} of ${group.records.length}`}
                      >
                        <span>
                          {start + 1}–{start + visible.length} of{" "}
                          {group.records.length}
                        </span>
                        <Button
                          tone="ghost"
                          disabled={page === 0}
                          onClick={() =>
                            setPeriodPages((current) => ({
                              ...current,
                              [group.label]: Math.max(0, page - 1),
                            }))
                          }
                        >
                          Previous {group.label.toLowerCase()}
                        </Button>
                        <Button
                          tone="ghost"
                          disabled={page >= pageCount - 1}
                          onClick={() =>
                            setPeriodPages((current) => ({
                              ...current,
                              [group.label]: Math.min(pageCount - 1, page + 1),
                            }))
                          }
                        >
                          Next {group.label.toLowerCase()}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>
                    There are no recorded {group.label.toLowerCase()} entries.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {hasMore ? (
        <div className="food-day__pagination-state">
          {loadMoreError && !loadingMore ? (
            <p role="alert">
              Earlier entries could not be loaded. Known entries remain above.
            </p>
          ) : null}
          <Button
            className="food-day__load-more"
            tone="secondary"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            {loadMoreError && !loadingMore
              ? "Retry earlier entries"
              : "Load earlier entries"}
          </Button>
        </div>
      ) : null}
      {restrictedOmitted ? (
        <div className="food-restricted">
          <ShieldCheck size={14} />
          <span>Restricted records are omitted from this chronology.</span>
        </div>
      ) : null}
    </section>
  );
}

function FoodDaySummary({
  meals,
  drinks,
  gap,
  gapLabel,
  hasRecords,
}: {
  meals: string;
  drinks: string;
  gap: string;
  gapLabel: string;
  hasRecords: boolean;
}) {
  return (
    <aside className="food-day-summary" aria-labelledby="food-summary-title">
      <div>
        <span>Recorded context</span>
        <h2 id="food-summary-title">Day summary</h2>
      </div>
      {hasRecords ? (
        <dl>
          <div>
            <dt>Meals recorded</dt>
            <dd>{meals}</dd>
          </div>
          <div>
            <dt>Drink entries</dt>
            <dd>{drinks}</dd>
          </div>
          <div>
            <dt>{gapLabel}</dt>
            <dd>{gap}</dd>
          </div>
        </dl>
      ) : (
        <div className="food-day-summary__empty">
          <Clock3 size={17} />
          <p>
            Summary appears from what you record. No calorie, macro, or
            hydration target is inferred.
          </p>
        </div>
      )}
      <p className="food-day-summary__boundary">
        <ShieldCheck size={14} />
        Counts describe saved entries, not nutritional completeness.
      </p>
    </aside>
  );
}

function FoodState({
  title,
  description,
  action,
  headerActions,
  busy,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  headerActions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="wellbeing-food-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Food"
          description="A lightweight meal and drink memory."
          status="Private by default · Food memory"
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
