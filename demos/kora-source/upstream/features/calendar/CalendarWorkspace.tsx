import "temporal-polyfill/global";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Modal, PageHeader, Sheet, useToast } from "../../components/primitives";
import { RadioGroup } from "../../components/form";
import { useConnection } from "../../app/connection-context";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import { runtime, type CalendarEvent, type CalendarEventDraft, type CalendarMutationOutcome, type CalendarSource, type ConversationContextRequest } from "../../lib/runtime";
import { CalendarEventForm, type CalendarFormValue } from "./CalendarEventForm";
import { CalendarInspector, CalendarInspectorState, newEventDraft, useCalendarCompactPanel } from "./CalendarInspector";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarScheduleProposal, useCalendarScheduleProposalRead } from "./CalendarScheduleProposal";
import { CalendarViews } from "./CalendarViews";
import { calendarCoverageSummary, calendarMutationFailureMessage, calendarReadFailureMessage, isMissingCalendarEventError } from "./calendar-contract";
import { calendarEditPatch } from "./calendar-edit-patch";
import { useCalendarEvents, useCalendarSources } from "./calendar-query";
import { validCalendarDate, validCalendarView } from "./calendar-routing";
import { calendarContextRange, calendarTitle, rangeForCalendarView, stepCalendarAnchor } from "./calendar-view-model";
import { readTodayOrigin, type TodayOrigin } from "../life/today-navigation";
import { CalendarLoading, CalendarState } from "./CalendarStates";
import { useCalendarClock } from "./useCalendarClock";
import { Temporal } from "temporal-polyfill";
import "./calendar.css";

type CalendarChangeProposal = {
  action: string;
  record: string;
  source: string;
  changes: string[];
  scope: string;
};
type CalendarMutationRequest = { execute: () => Promise<CalendarMutationOutcome>; proposal: CalendarChangeProposal };
type Confirmation = { outcome: Extract<CalendarMutationOutcome, { status: "waiting_confirmation" }>; retry: () => Promise<CalendarMutationOutcome>; proposal: CalendarChangeProposal };
type ConfirmationDecision = "approving" | "rejecting";
type ConfirmationTerminal = "expired" | "rejected" | "unavailable";
type CalendarCreateSeed = { day: string; minute?: number; instant?: string; allDay?: boolean };
type DirtyDismiss = "create" | "replace-create" | "cancel-edit" | "close-edit";
type MutationFailure = { kind: Exclude<CalendarMutationOutcome["status"], "acknowledged" | "waiting_confirmation" | "uncertain" | "cancelled">; message: string; retry?: CalendarMutationRequest };
type CalendarScrollPosition = { owner: string; top: number; left: number };
type CalendarInspectorEntry = { returnTo: string; scrollTop: number; scrollPositions: CalendarScrollPosition[]; eventId: string; calendarId: string };

function withTodayReturnState(existing: unknown, origin: TodayOrigin) {
  const state = typeof existing === "object" && existing !== null && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...state, todayReturn: origin };
}

function captureCalendarScroll(stage: HTMLElement | null): CalendarScrollPosition[] {
  if (!stage) return [];
  return [...stage.querySelectorAll<HTMLElement>("[data-calendar-scroll-owner]")].map((owner) => ({
    owner: owner.dataset.calendarScrollOwner ?? "",
    top: owner.scrollTop,
    left: owner.scrollLeft,
  }));
}

function restoreCalendarScroll(stage: HTMLElement | null, entry?: CalendarInspectorEntry) {
  if (!stage || !entry) return;
  stage.scrollTop = entry.scrollTop;
  for (const position of entry.scrollPositions ?? []) {
    const owner = [...stage.querySelectorAll<HTMLElement>("[data-calendar-scroll-owner]")]
      .find((candidate) => candidate.dataset.calendarScrollOwner === position.owner);
    if (!owner) continue;
    if (typeof owner.scrollTo === "function") owner.scrollTo({ top: position.top, left: position.left });
    else {
      owner.scrollTop = position.top;
      owner.scrollLeft = position.left;
    }
  }
}

export type CalendarWorkspaceServices = Pick<typeof runtime, "calendarSources" | "calendarEvents" | "calendarEvent" | "createCalendarEvent" | "updateCalendarEvent" | "deleteCalendarEvent" | "restoreCalendarEvent" | "approveToolConfirmation" | "rejectToolConfirmation" | "issueCalendarContextReference"> & Partial<Pick<typeof runtime, "toolConfirmations">>;
type CalendarContextReferenceRequest = Parameters<CalendarWorkspaceServices["issueCalendarContextReference"]>[0];

export function CalendarWorkspace({ onAskKora, services = runtime, serviceScope = "live", qualificationInitialPanel, qualificationRefetchAfterLoad = false }: { onAskKora: (reference: ConversationContextRequest) => void; services?: CalendarWorkspaceServices; serviceScope?: string; qualificationInitialPanel?: "create" | "edit"; qualificationRefetchAfterLoad?: boolean }) {
  const compactPanel = useCalendarCompactPanel();
  const toast = useToast();
  const queryClient = useQueryClient(), navigate = useNavigate(), location = useLocation(), params = useParams(), [search, setSearch] = useSearchParams();
  const todayOrigin = readTodayOrigin(location.state, `${location.pathname}${location.search}`);
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);
  const inspectorEntryRef = useRef<CalendarInspectorEntry | undefined>(undefined);
  const createTriggerRef = useRef<HTMLElement | null>(null);
  const calendarStageRef = useRef<HTMLDivElement | null>(null);
  const dirtyDismissFocusPending = useRef(false);
  const pendingRestoredFocus = useRef<{ calendarId: string; eventId: string } | undefined>(undefined);
  const pendingCreateReplacement = useRef<{ seed?: CalendarCreateSeed; trigger?: HTMLElement } | undefined>(undefined);
  const confirmationDecisionRef = useRef<ConfirmationDecision | null>(null);
  const editBaselineRef = useRef<CalendarEvent | undefined>(undefined);
  const contextReferenceRequests = useRef(new Map<string, Promise<void>>());
  const contextReferenceRunner = useRef<((request: CalendarContextReferenceRequest) => Promise<void>) | undefined>(undefined);
  const initializedSourceIds = useRef(new Set<string>());
  const explicitlySelectedSourceIds = useRef(new Set<string>());
  const selectedSourcesRef = useRef<string[] | null>(null);
  const { bootstrap, phase: connectionPhase } = useConnection(), zone = bootstrap?.viewerTimeZone ?? "UTC";
  const requestedView = search.has("view") ? validCalendarView(search.get("view")) : globalThis.matchMedia?.("(max-width: 820px)").matches ? "agenda" : "week";
  const nowInstant = useCalendarClock();
  const today = useMemo(() => {
    try {
      return Temporal.Instant.from(nowInstant).toZonedDateTimeISO(zone).toPlainDate().toString();
    } catch {
      return validCalendarDate(null, zone);
    }
  }, [nowInstant, zone]);
  const requestedDate = useMemo(() => search.has("date") ? validCalendarDate(search.get("date"), zone) : today, [search, today, zone]);
  const range = useMemo(() => rangeForCalendarView(requestedView, requestedDate, zone), [requestedDate, requestedView, zone]);
  const title = useMemo(() => calendarTitle(requestedView, requestedDate), [requestedDate, requestedView]);
  const [selectedSources, setSelectedSources] = useState<string[] | null>(null), [creating, setCreating] = useState<CalendarEventDraft>(), [editing, setEditing] = useState(false), [editBaseline, setEditBaseline] = useState<CalendarEvent>(), [editorDirty, setEditorDirty] = useState(false), [dirtyDismiss, setDirtyDismiss] = useState<DirtyDismiss>(), [confirmation, setConfirmation] = useState<Confirmation>(), [confirmationDecision, setConfirmationDecision] = useState<ConfirmationDecision>(), [confirmationFailure, setConfirmationFailure] = useState<string>(), [confirmationTerminal, setConfirmationTerminal] = useState<ConfirmationTerminal>(), [deleteReviewOpen, setDeleteReviewOpen] = useState(false), [deleteScope, setDeleteScope] = useState<"occurrence" | "series">("occurrence"), [outcome, setOutcome] = useState<string>(), [mutationFailure, setMutationFailure] = useState<MutationFailure>(), [detailsFocusVersion, setDetailsFocusVersion] = useState(0);
  const clearEditBaseline = useCallback(() => {
    editBaselineRef.current = undefined;
    setEditBaseline(undefined);
  }, []);
  const beginEditing = useCallback((event: CalendarEvent) => {
    editBaselineRef.current = event;
    setEditBaseline(event);
    setEditorDirty(false);
    setOutcome(undefined);
    setMutationFailure(undefined);
    setEditing(true);
  }, []);
  const discardDirtyDraft = useCallback(() => {
    setEditorDirty(false);
    setCreating(undefined);
    setEditing(false);
    clearEditBaseline();
    setDirtyDismiss(undefined);
    setMutationFailure(undefined);
    pendingCreateReplacement.current = undefined;
  }, [clearEditBaseline]);
  const draftGuard = useDirtyDraftGuard({
    id: "calendar-editor",
    label: "Calendar event draft",
    dirty: editorDirty && Boolean(creating || editing),
    onDiscard: discardDirtyDraft,
  });
  const sourcesQuery = useCalendarSources(services, serviceScope);
  const sources = sourcesQuery.data?.sources ?? [];
  useEffect(() => {
    selectedSourcesRef.current = selectedSources;
  }, [selectedSources]);
  useEffect(() => {
    if (!sources.length) return;
    const newlyDiscovered = sources.filter((source) => !initializedSourceIds.current.has(source.calendarId));
    if (!newlyDiscovered.length) return;
    newlyDiscovered.forEach((source) => initializedSourceIds.current.add(source.calendarId));
    const defaults = newlyDiscovered
      .filter((source) => source.selected && !explicitlySelectedSourceIds.current.has(source.calendarId))
      .map((source) => source.calendarId);
    setSelectedSources((current) => {
      const existing = current ?? [];
      const next = [...existing, ...defaults.filter((calendarId) => !existing.includes(calendarId))];
      return next;
    });
  }, [sources]);
  const visibleSourceIds = selectedSources ?? [];
  const eventsQuery = useCalendarEvents({ start: range.start, end: range.end, calendarIds: visibleSourceIds, viewerTimeZone: zone, autoPage: requestedView !== "agenda" }, services, serviceScope);
  // Proposals are part of the Calendar composition, not a late rail layered
  // onto an already-painted grid. This shared query lets the existing Calendar
  // loading surface hold geometry until that composition is known.
  const scheduleProposalQuery = useCalendarScheduleProposalRead(services, serviceScope);
  const qualificationRefetched = useRef(false);
  useEffect(() => {
    if (!qualificationRefetchAfterLoad || qualificationRefetched.current || !eventsQuery.data || eventsQuery.isFetching) return;
    qualificationRefetched.current = true;
    void eventsQuery.refetch();
  }, [eventsQuery.data, eventsQuery.isFetching, eventsQuery.refetch, qualificationRefetchAfterLoad]);
  const routeCalendarId = params.calendarId ? decodeURIComponent(params.calendarId) : undefined, routeEventId = params.eventId ? decodeURIComponent(params.eventId) : undefined;
  const selectedFromList = eventsQuery.data?.events.find((event) => event.calendarId === routeCalendarId && event.eventId === routeEventId);
  const eventQuery = useQuery({ queryKey: ["calendar", serviceScope, "event", routeCalendarId, routeEventId, zone], queryFn: () => services.calendarEvent(routeCalendarId!, routeEventId!, zone), enabled: Boolean(routeCalendarId && routeEventId && !selectedFromList), staleTime: 20_000 });
  const selectedEvent = selectedFromList ?? (routeCalendarId && routeEventId ? eventQuery.data?.event : undefined);
  useEffect(() => {
    const target = pendingRestoredFocus.current;
    if (!target || !eventsQuery.data?.events.some((event) => event.calendarId === target.calendarId && event.eventId === target.eventId)) return;
    pendingRestoredFocus.current = undefined;
    requestAnimationFrame(() => {
      const restoredTrigger = [...(calendarStageRef.current?.querySelectorAll<HTMLElement>("[data-calendar-id][data-event-id]") ?? [])].find((candidate) => candidate.dataset.calendarId === target.calendarId && candidate.dataset.eventId === target.eventId);
      restoredTrigger?.focus();
    });
  }, [eventsQuery.data]);
  const routedEventState = routeCalendarId && routeEventId && !selectedEvent
    ? eventQuery.isPending ? "loading" as const
      : eventQuery.isError && isMissingCalendarEventError(eventQuery.error) ? "not-found" as const
        : eventQuery.isError ? "error" as const
          : "not-found" as const
    : undefined;
  const previouslyRouted = useRef(Boolean(routeCalendarId && routeEventId));
  useEffect(() => {
    const routed = Boolean(routeCalendarId && routeEventId);
    if (previouslyRouted.current && !routed) {
      const entry = inspectorEntryRef.current;
      requestAnimationFrame(() => {
        restoreCalendarScroll(calendarStageRef.current, entry);
        const exact = entry ? [...(calendarStageRef.current?.querySelectorAll<HTMLElement>("[data-calendar-id][data-event-id]") ?? [])].find((candidate) => candidate.dataset.calendarId === entry.calendarId && candidate.dataset.eventId === entry.eventId) : undefined;
        (inspectorTriggerRef.current?.isConnected ? inspectorTriggerRef.current : exact)?.focus();
      });
    }
    previouslyRouted.current = routed;
  }, [routeCalendarId, routeEventId]);

  const updateUrl = useCallback((nextView: typeof requestedView, date: string) => {
    const next = new URLSearchParams(search); next.set("view", nextView); next.set("date", date); setSearch(next);
  }, [search, setSearch]);
  const releaseEditorAndClear = useCallback(() => {
    draftGuard.release();
    pendingCreateReplacement.current = undefined;
    clearEditBaseline();
    setCreating(undefined);
    setEditing(false);
    setEditorDirty(false);
    setOutcome(undefined);
    setMutationFailure(undefined);
  }, [clearEditBaseline, draftGuard.release]);
  const selectEventIdentity = useCallback((identity: { calendarId: string; eventId: string }, trigger?: HTMLElement) => {
    if (trigger) inspectorTriggerRef.current = trigger;
    const entry = {
      returnTo: `/calendar${location.search}`,
      scrollTop: calendarStageRef.current?.scrollTop ?? 0,
      scrollPositions: captureCalendarScroll(calendarStageRef.current),
      calendarId: identity.calendarId,
      eventId: identity.eventId,
    };
    inspectorEntryRef.current = entry;
    if (!editorDirty) releaseEditorAndClear();
    navigate(`/calendar/event/${encodeURIComponent(identity.calendarId)}/${encodeURIComponent(identity.eventId)}${location.search}`, { state: { calendarInspectorEntry: entry } });
  }, [editorDirty, location.search, navigate, releaseEditorAndClear]);
  const selectEvent = useCallback((event: CalendarEvent, trigger?: HTMLElement) => {
    selectEventIdentity(event, trigger);
  }, [selectEventIdentity]);
  const updateSelectedSources = useCallback((ids: string[]) => {
    const previous = selectedSourcesRef.current ?? [];
    const changed = new Set([...previous, ...ids].filter((calendarId) => previous.includes(calendarId) !== ids.includes(calendarId)));
    changed.forEach((calendarId) => explicitlySelectedSourceIds.current.add(calendarId));
    setSelectedSources(ids);
  }, []);
  const closeInspector = (restoreFocus = true) => {
    clearEditBaseline();
    setEditing(false);
    setMutationFailure(undefined);
    const stateEntry = (location.state as { calendarInspectorEntry?: CalendarInspectorEntry } | null)?.calendarInspectorEntry;
    const entry = stateEntry ?? inspectorEntryRef.current;
    if (stateEntry) navigate(-1);
    else navigate(`/calendar${location.search}`, { replace: true });
    if (restoreFocus) requestAnimationFrame(() => {
      restoreCalendarScroll(calendarStageRef.current, entry);
      const exact = entry ? [...(calendarStageRef.current?.querySelectorAll<HTMLElement>("[data-calendar-id][data-event-id]") ?? [])].find((candidate) => candidate.dataset.calendarId === entry.calendarId && candidate.dataset.eventId === entry.eventId) : undefined;
      (inspectorTriggerRef.current?.isConnected ? inspectorTriggerRef.current : exact)?.focus();
    });
  };
  const requestDismiss = (action: DirtyDismiss) => {
    if (editorDirty) { setDirtyDismiss(action); return; }
    if (action === "create") { setCreating(undefined); requestAnimationFrame(() => createTriggerRef.current?.focus()); }
    else if (action === "cancel-edit") { clearEditBaseline(); setEditing(false); }
    else if (action === "close-edit") { clearEditBaseline(); closeInspector(); }
    else closeInspector();
  };
  const returnToToday = useCallback(() => {
    if (!todayOrigin) return;
    navigate(todayOrigin.route, { state: withTodayReturnState(location.state, todayOrigin) });
  }, [location.state, navigate, todayOrigin]);
  const beginCreateForAnchor = (seed?: CalendarCreateSeed, trigger?: HTMLElement) => {
    if (trigger) createTriggerRef.current = trigger;
    setEditorDirty(false);
    setOutcome(undefined);
    setMutationFailure(undefined);
    clearEditBaseline();
    setCreating(newEventDraft(sourcesQuery.data?.sources ?? [], zone, seed?.day ?? (requestedDate === today ? undefined : requestedDate), seed?.allDay ?? false, seed?.minute, seed?.instant));
  };
  const discardEditor = () => {
    const action = dirtyDismiss;
    const replacement = pendingCreateReplacement.current;
    pendingCreateReplacement.current = undefined;
    setDirtyDismiss(undefined); setEditorDirty(false);
    if (action === "replace-create" && replacement) {
      draftGuard.release();
      clearEditBaseline();
      setCreating(undefined);
      setEditing(false);
      requestAnimationFrame(() => beginCreateForAnchor(replacement.seed, replacement.trigger));
    }
    else if (action === "create") { draftGuard.release(); clearEditBaseline(); setCreating(undefined); requestAnimationFrame(() => createTriggerRef.current?.focus()); }
    else if (action === "cancel-edit") { draftGuard.release(); clearEditBaseline(); setEditing(false); }
    else if (action === "close-edit") { draftGuard.release(); clearEditBaseline(); closeInspector(); }
  };
  const keepEditing = () => {
    dirtyDismissFocusPending.current = true;
    setDirtyDismiss(undefined);
  };
  const createForAnchor = (seed?: CalendarCreateSeed, trigger?: HTMLElement) => {
    if ((creating || editing) && editorDirty) {
      if (!pendingCreateReplacement.current) pendingCreateReplacement.current = { seed, trigger };
      setDirtyDismiss("replace-create");
      return;
    }
    beginCreateForAnchor(seed, trigger);
  };
  const qualificationPanelOpened = useRef(false);
  useEffect(() => {
    if (!qualificationInitialPanel || qualificationPanelOpened.current || sources.length === 0) return;
    if (qualificationInitialPanel === "edit" && !selectedEvent) return;
    qualificationPanelOpened.current = true;
    if (qualificationInitialPanel === "create") createForAnchor();
    else if (selectedEvent) beginEditing(selectedEvent);
  }, [beginEditing, createForAnchor, qualificationInitialPanel, selectedEvent, sources]);

  const settle = useCallback(async ({ execute, proposal }: CalendarMutationRequest) => {
    setOutcome(undefined);
    setMutationFailure(undefined);
    let result: CalendarMutationOutcome;
    try {
      result = await execute();
    } catch {
      result = { status: "unavailable", message: "Calendar mutation transport failed." };
    }
    if (result.status === "waiting_confirmation") {
      setConfirmation({ outcome: result, retry: execute, proposal });
      setConfirmationDecision(undefined);
      setConfirmationFailure(undefined);
      setConfirmationTerminal(undefined);
      return result;
    }
    if (result.status === "acknowledged") {
      draftGuard.release();
      setEditorDirty(false);
      setCreating(undefined); setEditing(false); setConfirmation(undefined); setConfirmationTerminal(undefined); clearEditBaseline();
      let readbackFailed = false;
      try {
        await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      } catch {
        // The provider/local write is already acknowledged. Keep that truth
        // separate from a failed refresh so the mutation cannot be reported as
        // failed or trigger a second consequential request.
        readbackFailed = true;
      }
      if (result.recovery) {
        const recovery = result.recovery;
        const deletionNoticeId = `calendar-delete:${result.operationId}`;
        const deletionTitle = selectedEvent?.title ?? "The event";
        const restoreState = { inFlight: false };
        setOutcome(undefined);
        navigate(`/calendar${location.search}`);
        toast.notify({
          id: deletionNoticeId,
          title: "Event deleted",
          description: `${deletionTitle} was removed from your Kora calendar.${readbackFailed ? " Calendar refresh is unavailable; the deletion was acknowledged." : ""}`,
          tone: "warning",
          action: {
            label: "Undo",
            closeOnSelect: false,
            onSelect: () => {
              if (restoreState.inFlight) return;
              restoreState.inFlight = true;
              toast.update(deletionNoticeId, { title: "Restoring event…", description: "Kora is restoring this event. Please wait.", tone: "warning", action: null });
              void services.restoreCalendarEvent(recovery.calendarId, recovery.eventId, { requestKey: crypto.randomUUID(), deletedRevision: recovery.deletedRevision })
                .then(async (restored) => {
                  if (restored.status !== "acknowledged") {
                    toast.update(deletionNoticeId, { title: "Event could not be restored", description: calendarMutationFailureMessage(restored.status, "restore"), tone: "danger", priority: "high", action: null });
                    return;
                  }
                  pendingRestoredFocus.current = { calendarId: recovery.calendarId, eventId: recovery.eventId };
                  let restoreReadbackFailed = false;
                  try {
                    await queryClient.invalidateQueries({ queryKey: ["calendar"] });
                  } catch {
                    restoreReadbackFailed = true;
                  }
                  toast.update(deletionNoticeId, {
                    title: "Event restored",
                    description: restoreReadbackFailed
                      ? `${deletionTitle} is restored. Calendar refresh is unavailable; reopen Calendar to verify the current view.`
                      : `${deletionTitle} is back in your Kora calendar.`,
                    tone: "success",
                    action: null,
                  });
                })
                .catch(() => {
                  toast.update(deletionNoticeId, { title: "Event could not be restored", description: calendarMutationFailureMessage("unavailable", "restore"), tone: "danger", priority: "high", action: null });
                });
            },
          },
        });
      } else {
        if (result.event) selectEvent(result.event);
        const successMessage = result.event?.authority === "kora" || selectedEvent?.authority === "kora" ? "Saved in your Kora calendar." : "Google Calendar confirmed this change.";
        setOutcome(readbackFailed ? `${successMessage} Calendar refresh is unavailable; reopen Calendar to verify the current view.` : successMessage);
      }
    }
    else if (result.status === "uncertain") { setOutcome(calendarMutationFailureMessage(result.status)); setConfirmation(undefined); setConfirmationTerminal(undefined); }
    else if (result.status === "cancelled") { setOutcome("The Calendar change was cancelled."); setConfirmation(undefined); setConfirmationTerminal(undefined); }
    else { setMutationFailure({ kind: result.status, message: calendarMutationFailureMessage(result.status), ...(result.status === "conflict" ? {} : { retry: { execute, proposal } }) }); setConfirmation(undefined); setConfirmationTerminal(undefined); }
    return result;
  }, [clearEditBaseline, draftGuard.release, location.search, navigate, queryClient, selectEvent, selectedEvent?.authority, selectedEvent?.title, toast]);
  const mutation = useMutation({ mutationFn: (request: CalendarMutationRequest) => settle(request) });
  const create = (value: CalendarFormValue) => {
    const requestKey = crypto.randomUUID(), clientRequestId = crypto.randomUUID(), input = { clientRequestId, requestKey, sendUpdates: value.sendUpdates, event: value.event };
    mutation.mutate({ execute: () => services.createCalendarEvent(input), proposal: calendarCreateProposal(value, sources, zone) });
  };
  const save = (value: CalendarFormValue) => {
    const baseline = editBaselineRef.current ?? editBaseline ?? selectedEvent;
    if (!baseline) return;
    const patch = calendarEditPatch(baseline, value.event);
    if (Object.keys(patch).length === 0) {
      setMutationFailure(undefined);
      setOutcome("There are no Calendar changes to save.");
      return;
    }
    const requestKey = crypto.randomUUID(), clientRequestId = crypto.randomUUID();
    const input = { clientRequestId, requestKey, sendUpdates: value.sendUpdates, expectedRevision: baseline.revision, recurrenceScope: value.recurrenceScope, patch };
    mutation.mutate({ execute: () => services.updateCalendarEvent(baseline.calendarId, baseline.eventId, input), proposal: calendarUpdateProposal(baseline, value, sources, zone) });
  };
  const remove = (recurrenceScope: "occurrence" | "series") => {
    if (!selectedEvent) return; setDeleteReviewOpen(false); const requestKey = crypto.randomUUID(), clientRequestId = crypto.randomUUID(), input = { clientRequestId, requestKey, sendUpdates: selectedEvent.attendees.length ? "all" as const : "none" as const, expectedRevision: selectedEvent.revision, recurrenceScope };
    mutation.mutate({ execute: () => services.deleteCalendarEvent(selectedEvent.calendarId, selectedEvent.eventId, input), proposal: calendarDeleteProposal(selectedEvent, recurrenceScope, sources) });
  };
  const requestDelete = () => {
    if (!selectedEvent) return;
    setDeleteScope("occurrence");
    setDeleteReviewOpen(true);
  };
  const approve = async () => {
    const pending = confirmation;
    if (!pending || confirmationDecisionRef.current) return;
    confirmationDecisionRef.current = "approving";
    setConfirmationDecision("approving");
    setConfirmationFailure(undefined);
    try {
      const result = await services.approveToolConfirmation(pending.outcome.confirmationId);
      const approved = result?.confirmation;
      if (!approved || approved.id !== pending.outcome.confirmationId || approved.state !== "approved") {
        const state = approved?.state;
        if (approved?.id === pending.outcome.confirmationId && (state === "expired" || state === "rejected" || state === "unavailable")) {
          setConfirmationTerminal(state);
          setConfirmationFailure(state === "expired"
            ? "This Calendar approval expired before it could be applied. No Calendar mutation was retried."
            : state === "rejected"
              ? "This Calendar approval was rejected before it could be applied. No Calendar mutation was retried."
              : "This Calendar approval is unavailable. No Calendar mutation was retried.");
        } else {
          setConfirmationFailure("Kora could not verify this Calendar approval. No Calendar mutation was retried.");
        }
        return;
      }
      await settle({ execute: pending.retry, proposal: pending.proposal });
    } catch {
      setConfirmationFailure("Kora could not verify this Calendar approval. No Calendar mutation was retried; review the current approval before deciding.");
    } finally {
      confirmationDecisionRef.current = null;
      setConfirmationDecision(undefined);
    }
  };
  const closeConfirmationReview = useCallback(() => {
    if (!confirmationTerminal || confirmationDecisionRef.current) return;
    setConfirmation(undefined);
    setConfirmationTerminal(undefined);
    setConfirmationFailure(undefined);
  }, [confirmationTerminal]);
  const reject = async () => {
    const pending = confirmation;
    if (!pending || confirmationDecisionRef.current) return;
    confirmationDecisionRef.current = "rejecting";
    setConfirmationDecision("rejecting");
    setConfirmationFailure(undefined);
    try {
      const result = await services.rejectToolConfirmation(pending.outcome.confirmationId);
      const rejected = result?.confirmation;
      if (rejected?.id === pending.outcome.confirmationId && (rejected.state === "expired" || rejected.state === "unavailable")) {
        setConfirmationTerminal(rejected.state);
        setConfirmationFailure(rejected.state === "expired"
          ? "This Calendar approval expired before it could be cancelled. No Calendar mutation was retried."
          : "This Calendar approval is unavailable. No Calendar mutation was retried.");
        return;
      }
      if (!rejected || rejected.id !== pending.outcome.confirmationId || rejected.state !== "rejected") {
        setConfirmationFailure("Kora could not verify that this Calendar change was rejected. The review remains open.");
        return;
      }
      setConfirmation(undefined);
      setOutcome("The Calendar change was not made.");
    } catch {
      setConfirmationFailure("Kora could not record that Calendar decision. The change is still pending; try again.");
    } finally {
      confirmationDecisionRef.current = null;
      setConfirmationDecision(undefined);
    }
  };
  const requestContextReference = useCallback((request: CalendarContextReferenceRequest) => {
    const key = JSON.stringify(request);
    const inFlight = contextReferenceRequests.current.get(key);
    if (inFlight) return inFlight;
    const pending = (async () => {
      try {
        const result = await services.issueCalendarContextReference(request);
        if (!result?.selection) throw new Error("context_selection_unavailable");
        onAskKora(result.selection);
      } catch {
        toast.notify({
          title: "Calendar context unavailable",
          description: "Kora could not open that Calendar context. Try again.",
          tone: "danger",
          priority: "high",
          action: { label: "Try again", closeOnSelect: false, onSelect: () => { void contextReferenceRunner.current?.(request); } },
        });
      }
    })();
    contextReferenceRequests.current.set(key, pending);
    void pending.finally(() => {
      if (contextReferenceRequests.current.get(key) === pending) contextReferenceRequests.current.delete(key);
    });
    return pending;
  }, [onAskKora, services.issueCalendarContextReference, toast]);
  contextReferenceRunner.current = requestContextReference;
  const askEvent = () => {
    if (!selectedEvent || !bootstrap?.session.id) return;
    void requestContextReference({ kind: "event", calendarId: selectedEvent.calendarId, eventId: selectedEvent.eventId, sessionId: bootstrap.session.id });
  };
  const askRange = () => {
    if (!bootstrap?.session.id) return;
    const contextRange = calendarContextRange(requestedView, requestedDate, zone);
    void requestContextReference({ kind: "query", calendarIds: visibleSourceIds, start: contextRange.start, end: contextRange.end, viewerTimeZone: zone, title, sessionId: bootstrap.session.id });
  };
  const discussProposal = (event?: CalendarEvent) => {
    if (!bootstrap?.session.id) return;
    if (event) {
      void requestContextReference({ kind: "event", calendarId: event.calendarId, eventId: event.eventId, sessionId: bootstrap.session.id });
      return;
    }
    const contextRange = calendarContextRange(requestedView, requestedDate, zone);
    void requestContextReference({ kind: "query", calendarIds: visibleSourceIds, start: contextRange.start, end: contextRange.end, viewerTimeZone: zone, title, sessionId: bootstrap.session.id });
  };
  const reviewLatestEvent = async () => {
    if (!selectedEvent) return;
    draftGuard.release();
    clearEditBaseline();
    setEditorDirty(false);
    setEditing(false);
    setMutationFailure(undefined);
    setOutcome(undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar", serviceScope, "events"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar", serviceScope, "event", selectedEvent.calendarId, selectedEvent.eventId, zone] }),
    ]);
    setDetailsFocusVersion((current) => current + 1);
  };

  if (sourcesQuery.isPending || (services.toolConfirmations && scheduleProposalQuery.isPending)) return <section className="calendar-workspace"><PageHeader className="calendar-page-header" breadcrumb={<span>Calendar</span>} title={title} /><CalendarLoading view={requestedView} /></section>;
  if (sourcesQuery.isError || (sourcesQuery.data?.status.state === "unavailable" && !sourcesQuery.data.sources.some((source) => source.authority === "kora"))) return <section className="calendar-workspace"><PageHeader className="calendar-page-header" title="Calendar" /><CalendarState kind="unavailable" title="Calendar is unavailable" body={calendarReadFailureMessage("sources")} recovery={{ href: "/settings/diagnostics", label: "Open Calendar diagnostics" }} onRetry={() => void sourcesQuery.refetch()} /></section>;
  const partialReason = "A selected connected calendar could not be refreshed. Last-confirmed events may remain visible.";
  const visibleSourceSet = new Set(visibleSourceIds);
  const visibleSources = sources.filter((source) => visibleSourceSet.has(source.calendarId));
  const visibleSourceErrors = (eventsQuery.data?.sourceErrors ?? []).filter((error) => visibleSourceSet.has(error.calendarId));
  const visibleSourceDegraded = visibleSources.some((source) => source.status !== "available" || source.syncState === "stale" || source.syncState === "unavailable");
  const offline = connectionPhase === "disconnected";
  const coverageSummary = calendarCoverageSummary(visibleSources, visibleSourceErrors, offline ? "offline" : "current");
  const retainedEvents = (eventsQuery.data?.events.length ?? 0) > 0;
  const coverageComplete = eventsQuery.data?.status.state === "available" && !visibleSourceDegraded && !eventsQuery.isError;
  const rangeUnavailable = eventsQuery.data?.status.state === "unavailable" || (eventsQuery.isError && !retainedEvents);
  return <section className="calendar-workspace" onKeyDown={(event) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    event.preventDefault();
    updateUrl(requestedView, stepCalendarAnchor(requestedView, requestedDate, event.key === "PageUp" ? -1 : 1));
  }}>
    <CalendarToolbar title={title} view={requestedView} viewerTimeZone={zone} date={requestedDate} sources={sources} selected={visibleSourceIds} onSelectedChange={updateSelectedSources} onDateChange={(next) => updateUrl(requestedView, next)} onViewChange={(next) => updateUrl(next, requestedDate)} onPrevious={() => updateUrl(requestedView, stepCalendarAnchor(requestedView, requestedDate, -1))} onNext={() => updateUrl(requestedView, stepCalendarAnchor(requestedView, requestedDate, 1))} onToday={() => updateUrl(requestedView, today)} showToday={requestedDate !== today} onCreate={(trigger) => createForAnchor(undefined, trigger)} onAskRange={() => void askRange()} />
    <CalendarScheduleProposal services={services} serviceScope={serviceScope} proposalRead={scheduleProposalQuery} events={eventsQuery.data?.events ?? []} portalContainer={calendarStageRef} onEdit={(event, trigger) => { selectEvent(event, trigger); beginEditing(event); }} onOpenEvent={(identity, trigger) => selectEventIdentity(identity, trigger)} onDiscuss={(event) => void discussProposal(event)} />
    {(offline || eventsQuery.data?.status.state === "partial" || visibleSourceErrors.length > 0 || visibleSourceDegraded) && <div className="calendar-coverage" role="status"><CircleAlert size={15} aria-hidden="true" /><span>{coverageSummary}</span><details><summary>Details</summary><div><p>{offline ? "Private Kora events can still be created and edited. Connected calendars will refresh after Kora reconnects." : partialReason}</p><Button tone="secondary" onClick={() => navigate(offline ? "/settings/diagnostics" : "/settings/integrations/google-workspace")}>{offline ? "Open diagnostics" : "Review connection"}</Button></div></details></div>}
    {eventsQuery.isError && retainedEvents && <div className="calendar-partial calendar-partial--error" role="alert"><CircleAlert size={15} />This date range could not be refreshed. {eventsQuery.isPlaceholderData ? "The previous range remains visible while Kora retries." : "Retained events remain visible."}<Button onClick={() => void eventsQuery.refetch()}>Try again</Button></div>}
    {eventsQuery.isPlaceholderData && eventsQuery.isFetching && retainedEvents && <div className="calendar-partial" role="status"><CircleAlert size={15} /><span>Calendar is refreshing. The visible events are from the previous range or calendar selection until this read completes.</span></div>}
    {!eventsQuery.data?.complete && eventsQuery.isFetchingNextPage && <div className="calendar-partial" role="status">Loading the remaining events in this range…</div>}
    <div ref={calendarStageRef} className={`calendar-stage calendar-stage--${requestedView}${eventsQuery.isFetching ? " calendar-stage--refreshing" : ""}${eventsQuery.isPlaceholderData || eventsQuery.isError ? " calendar-stage--stale" : ""}`}>
      {visibleSourceIds.length === 0 ? <CalendarState kind="empty" title="Choose a calendar" body="Select at least one visible calendar to see its commitments." /> : rangeUnavailable ? <CalendarState kind="unavailable" title="This Calendar range is unavailable" body={calendarReadFailureMessage("range")} recovery={{ href: "/settings/diagnostics", label: "Open Calendar diagnostics" }} onRetry={() => void eventsQuery.refetch()} /> : eventsQuery.isPending ? <CalendarLoading view={requestedView} /> : <><CalendarViews view={requestedView} anchor={requestedDate} today={today} nowInstant={nowInstant} viewerTimeZone={zone} events={eventsQuery.data?.events ?? []} sources={sources} coverageComplete={coverageComplete} onStepPeriod={(direction) => updateUrl(requestedView, stepCalendarAnchor(requestedView, requestedDate, direction))} onSelectEvent={selectEvent} onSelectDay={(day) => updateUrl("day", day)} onCreate={createForAnchor} />{requestedView === "agenda" && eventsQuery.hasNextPage ? <div className="calendar-agenda-pagination"><span>{eventsQuery.data?.events.length ?? 0} events loaded in this range</span><Button loading={eventsQuery.isFetchingNextPage} onClick={() => void eventsQuery.fetchNextPage()}>Load more events</Button></div> : null}</>}
    </div>
    <CalendarInspector event={selectedEvent ?? editBaseline} editBaseline={editBaseline} sources={sources} editing={editing} busy={mutation.isPending} outcome={outcome} failure={mutationFailure} finalFocus={inspectorTriggerRef} portalContainer={calendarStageRef} detailsFocusVersion={detailsFocusVersion} onClose={() => editing ? requestDismiss("close-edit") : closeInspector()} onEdit={() => { if (selectedEvent) beginEditing(selectedEvent); }} onCancelEdit={() => requestDismiss("cancel-edit")} onDirtyChange={setEditorDirty} onSave={save} onDelete={requestDelete} onRetryMutation={mutationFailure?.retry ? () => mutation.mutate(mutationFailure.retry!) : undefined} onReviewLatest={() => void reviewLatestEvent()} onAskKora={() => void askEvent()} onReturnToToday={todayOrigin ? returnToToday : undefined} />
    {routedEventState ? <CalendarInspectorState state={routedEventState} message={routedEventState === "error" ? calendarReadFailureMessage("event") : undefined} finalFocus={inspectorTriggerRef} portalContainer={calendarStageRef} onClose={closeInspector} onRetry={() => void eventQuery.refetch()} onReturnToToday={todayOrigin ? returnToToday : undefined} /> : null}
    {creating ? <Sheet open onOpenChange={() => undefined} title="New event" description="Create in a writable Calendar source." purpose="inspector" className={`calendar-inspector-sheet calendar-inspector-sheet--create${compactPanel ? "" : " calendar-inspector-sheet--desktop"}`} closeLabel="Close event editor" dismissPolicy="explicit" onDismissAttempt={() => requestDismiss("create")} busy={mutation.isPending} finalFocus={createTriggerRef} modality={compactPanel ? "modal" : "focus-contained"} portalContainer={calendarStageRef}><CalendarEventForm initial={creating} sources={sources} submitLabel="Create event" busy={mutation.isPending} viewerTimeZone={zone} onSubmit={create} onCancel={() => requestDismiss("create")} onDirtyChange={setEditorDirty} />{mutationFailure && <div className="calendar-form-error" role="alert"><CircleAlert size={15} /><span>{mutationFailure.message}</span>{mutationFailure.retry ? <Button tone="ghost" onClick={() => mutation.mutate(mutationFailure.retry!)}>Try again</Button> : null}</div>}</Sheet> : null}
    <Modal
      open={Boolean(dirtyDismiss)}
      onOpenChange={(open) => { if (!open) keepEditing(); }}
      onOpenChangeComplete={(open) => {
        if (open || !dirtyDismissFocusPending.current) return;
        dirtyDismissFocusPending.current = false;
        (calendarStageRef.current?.querySelector<HTMLInputElement>('.calendar-inspector-sheet input[aria-label="Event title"]')
          ?? document.querySelector<HTMLInputElement>('.calendar-inspector-sheet input[aria-label="Event title"]'))?.focus();
      }}
      title="Discard event changes?"
      description="Your unsaved Calendar changes will be lost."
      purpose="confirm"
      actions={<><Button onClick={keepEditing}>Keep editing</Button><Button tone="danger" onClick={discardEditor}>Discard changes</Button></>}
    ><p>Kora has not changed the stored event or contacted its calendar provider.</p></Modal>
    <Modal
      open={Boolean(confirmation)}
      busy={Boolean(confirmationDecision)}
      onOpenChange={(open) => {
        if (open || confirmationDecisionRef.current) return;
        if (confirmationTerminal) closeConfirmationReview();
        else void reject();
      }}
      title="Confirm Calendar change"
      description={confirmation?.outcome.consequence}
      purpose="confirm"
      dismissPolicy="explicit"
      onDismissAttempt={(reason) => {
        if (confirmationDecisionRef.current) return;
        if (confirmationTerminal) closeConfirmationReview();
        else if (reason === "close-press") void reject();
      }}
      actions={confirmationTerminal
        ? <Button onClick={closeConfirmationReview}>{editing && selectedEvent ? "Back to event" : "Close review"}</Button>
        : <><Button loading={confirmationDecision === "rejecting"} disabled={Boolean(confirmationDecision)} onClick={() => void reject()}>Cancel</Button><Button tone="primary" loading={confirmationDecision === "approving"} disabled={Boolean(confirmationDecision)} onClick={() => void approve()}>Confirm change</Button></>}
    >
      <div className="calendar-confirmation">{confirmation ? <section className="calendar-proposal-review" aria-label="Proposed Calendar changes"><strong>Proposal awaiting approval</strong><dl><div><dt>Affected record</dt><dd>{confirmation.proposal.record}</dd></div><div><dt>Source</dt><dd>{confirmation.proposal.source}</dd></div><div><dt>Affected scope</dt><dd>{confirmation.proposal.scope}</dd></div></dl><h3>{confirmation.proposal.action}</h3><ul>{confirmation.proposal.changes.map((change) => <li key={change}>{change}</li>)}</ul></section> : null}<p>Confirming records this exact Calendar change for the run that proposed it. The consequence above describes what approval allows. No Calendar write happens until you confirm.</p>{confirmationFailure ? <p className="calendar-confirmation-error" role="alert">{confirmationFailure}</p> : null}</div>
    </Modal>
    <Modal open={deleteReviewOpen} onOpenChange={setDeleteReviewOpen} title={selectedEvent?.recurringEventId || selectedEvent?.recurrence.length ? "Delete repeating event?" : "Delete this event?"} description={selectedEvent ? `Review the permanent Calendar change for “${selectedEvent.title}”.` : "Review this permanent Calendar change."} purpose="confirm" dismissPolicy="explicit" onDismissAttempt={(reason) => { if (reason === "close-press") setDeleteReviewOpen(false); }} actions={<><Button onClick={() => setDeleteReviewOpen(false)}>Keep event</Button><Button tone="danger" onClick={() => remove(deleteScope)}>Delete {deleteScope === "series" ? "series" : "event"}</Button></>}><div className="calendar-delete-scope">{selectedEvent?.recurringEventId || selectedEvent?.recurrence.length ? <RadioGroup label="Delete scope" value={deleteScope} onValueChange={(value) => setDeleteScope(value as "occurrence" | "series")} options={[{ value: "occurrence", title: "Only this occurrence", hint: "The rest of the series stays on your calendar." }, { value: "series", title: "The entire series", hint: "Every event in this repeating series will be removed." }]} /> : null}<p className="calendar-delete-scope__consequence">{selectedEvent?.attendees.length ? "Guests will be notified because this event has attendees. " : "No guest updates will be sent. "}{selectedEvent?.authority === "kora" ? "This removes the event from your private Kora calendar." : "Google Calendar must confirm the deletion before Kora reports success."}</p></div></Modal>
  </section>;
}

function calendarSourceLabel(calendarId: string, sources: Array<{ calendarId: string; name: string }>) {
  return sources.find((source) => source.calendarId === calendarId)?.name ?? calendarId;
}

function calendarDateValueLabel(value: CalendarEvent["start"], viewerTimeZone: string) {
  if (value.kind === "date") return value.date;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: viewerTimeZone,
    timeZoneName: "short",
  }).format(new Date(value.instant));
}

function calendarRangeLabel(event: Pick<CalendarEventDraft, "start" | "end">, viewerTimeZone: string) {
  return `${calendarDateValueLabel(event.start, viewerTimeZone)} to ${calendarDateValueLabel(event.end, viewerTimeZone)}`;
}

function guestListLabel(attendees: CalendarEventDraft["attendees"]) {
  return (attendees ?? []).map((attendee) => attendee.email).sort().join(", ");
}

function recurrenceLabel(recurrence: string[] | undefined) {
  return recurrence?.length ? recurrence.join(", ") : "none";
}

function calendarCreateProposal(value: CalendarFormValue, sources: CalendarSource[], viewerTimeZone: string): CalendarChangeProposal {
  const source = calendarSourceLabel(value.event.calendarId, sources);
  return {
    action: "Create this event",
    record: value.event.title,
    source,
    changes: [
      `Create “${value.event.title}”.`,
      `Schedule ${calendarRangeLabel(value.event, viewerTimeZone)}.`,
      value.event.location ? `Set location to ${value.event.location}.` : "Leave location unset.",
      value.event.description ? `Set notes to “${value.event.description}”.` : "Leave notes empty.",
      `Mark the event ${value.event.availability ?? "busy"}.`,
      value.event.attendees?.length ? `Invite ${guestListLabel(value.event.attendees)}.` : "Invite no guests.",
      value.event.recurrence?.length ? `Set recurrence to ${recurrenceLabel(value.event.recurrence)}.` : "Do not repeat the event.",
      value.event.conference.kind === "google_meet" ? "Add a Google Meet conference." : "Do not add a conference.",
    ],
    scope: `One new event in ${source}.`,
  };
}

function calendarUpdateProposal(current: CalendarEvent, value: CalendarFormValue, sources: CalendarSource[], viewerTimeZone: string): CalendarChangeProposal {
  const changes: string[] = [];
  if (current.title !== value.event.title) changes.push(`Rename “${current.title}” to “${value.event.title}”.`);
  if (JSON.stringify(current.start) !== JSON.stringify(value.event.start) || JSON.stringify(current.end) !== JSON.stringify(value.event.end))
    changes.push(`Change time from ${calendarRangeLabel(current, viewerTimeZone)} to ${calendarRangeLabel(value.event, viewerTimeZone)}.`);
  if ((current.location ?? "") !== (value.event.location ?? "")) changes.push(`Change location from ${current.location || "unset"} to ${value.event.location || "unset"}.`);
  if ((current.description ?? "") !== (value.event.description ?? "")) changes.push(`Change notes from “${current.description || "empty"}” to “${value.event.description || "empty"}”.`);
  if (current.availability !== (value.event.availability ?? "busy")) changes.push(`Change availability from ${current.availability} to ${value.event.availability ?? "busy"}.`);
  const currentGuests = current.attendees.map((attendee) => attendee.email).sort();
  const proposedGuests = (value.event.attendees ?? []).map((attendee) => attendee.email).sort();
  const addedGuests = proposedGuests.filter((email) => !currentGuests.includes(email));
  const removedGuests = currentGuests.filter((email) => !proposedGuests.includes(email));
  if (addedGuests.length) changes.push(`Add ${addedGuests.length === 1 ? "guest" : "guests"}: ${addedGuests.join(", ")}.`);
  if (removedGuests.length) changes.push(`Remove ${removedGuests.length === 1 ? "guest" : "guests"}: ${removedGuests.join(", ")}.`);
  if (JSON.stringify(current.recurrence) !== JSON.stringify(value.event.recurrence ?? [])) changes.push(`Change recurrence from ${recurrenceLabel(current.recurrence)} to ${recurrenceLabel(value.event.recurrence)} for ${value.recurrenceScope === "series" ? "the series" : "this occurrence"}.`);
  const currentConference: CalendarEventDraft["conference"]["kind"] = current.conference ? "google_meet" : "none";
  if (currentConference !== value.event.conference.kind) changes.push(`Change conference from ${currentConference === "google_meet" ? "Google Meet" : "none"} to ${value.event.conference.kind === "google_meet" ? "Google Meet" : "none"}.`);
  if (!changes.length) changes.push("Keep the reviewed event fields unchanged; the provider will only confirm the bound request.");
  const source = calendarSourceLabel(current.calendarId, sources);
  return {
    action: value.recurrenceScope === "series" ? "Update the event series" : "Update this event",
    record: `${current.title} (${current.calendarId}/${current.eventId})`,
    source,
    changes,
    scope: `Only ${value.recurrenceScope === "series" ? "the selected series" : "this event occurrence"} in ${source}.`,
  };
}

function calendarDeleteProposal(current: CalendarEvent, recurrenceScope: "occurrence" | "series", sources: CalendarSource[]): CalendarChangeProposal {
  const source = calendarSourceLabel(current.calendarId, sources);
  const scope = recurrenceScope === "series" ? "the entire repeating series" : "this event occurrence";
  return {
    action: recurrenceScope === "series" ? "Delete the event series" : "Delete this event",
    record: `${current.title} (${current.calendarId}/${current.eventId})`,
    source,
    changes: [`Remove ${scope} from ${source}.`, `Keep independent Work records and other Calendar events unchanged.`],
    scope: `${scope} in ${source}; independent Work records and other Calendar events stay unchanged.`,
  };
}
