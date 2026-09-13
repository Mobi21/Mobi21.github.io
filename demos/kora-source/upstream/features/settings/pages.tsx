import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Temporal } from "temporal-polyfill";
import {
  ArrowRight, Bot, CalendarClock, Check, ChevronRight,
  CircleAlert, Database, ExternalLink, FileText, Globe2, KeyRound, Link2, LoaderCircle, Monitor, Pause, Play, Plus,
  Pencil, ShieldCheck, Trash2, X,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  CheckboxChoice,
  ContentState,
  Input,
  Item,
  KoraSelect,
  Modal,
  PageFrame,
  PageHeader,
  PageSection,
  PageToolbar,
  Pressable,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Textarea,
  useToast,
} from "../../components/primitives";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import { useConnection } from "../../app/connection-context";
import { KORA_SHORTCUTS } from "../../app/shortcut-registry";
import {
  runtime, RuntimeRequestError, type NativeNotification, type NativeSchedule, type NativeScheduleTrigger,
  type ConversationContextReference, type NativeAttentionTier,
  type NativeAuthInteractionEvent, type NativeProvider, type NativeThinkingLevel, type NativeToolConfirmation,
} from "../../lib/runtime";
import { applyAppearance, clearAppearanceStartupError, DEFAULT_APPEARANCE, readAppearance, readAppearanceStartupError, saveAppearance, type AppearancePreferences } from "../../lib/appearance";
import { desktopHost, hasDesktopHost } from "../../lib/desktop-host";
import { copyText } from "../../lib/clipboard";
import { EmptyState, ErrorState, LoadingState, PageHeading, Section, StatusPill } from "./shared";
import { SettingsFrame, SettingsPreference, SettingsListRow, SettingsSection } from "./SettingsFrame";
import { ApprovalPanel } from "./ApprovalPanel";
import { IntegrationAccountPage } from "./IntegrationAccountPage";
import { DataSettingsPage } from "./DataSettingsPage";
import { DiagnosticsSettingsPage } from "./DiagnosticsSettingsPage";
import { DUR, EASE } from "../../lib/motion";
import {
  formatNotificationTime,
  NotificationAvailabilityView,
  NotificationFeed,
  NotificationInlineError,
  NotificationLoading,
  notificationAvailabilityForError,
  notificationSource,
  notificationStateLabel,
} from "../notifications/NotificationFeed";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not reported";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : "Not reported";
};
const providerLabel = (id: string) => id === "github" ? "GitHub" : humanize(id);
const isMissingRecord = (error: unknown) => error instanceof RuntimeRequestError && error.status === 404;
const approvalOwnerMatches = (left: NativeToolConfirmation["owner"], right: NativeToolConfirmation["owner"]) => {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "foreground" && right.kind === "foreground") {
    return left.sessionId === right.sessionId && left.nativeRunId === right.nativeRunId && left.toolCallId === right.toolCallId;
  }
  if (left.kind === "schedule" && right.kind === "schedule") {
    return left.sessionId === right.sessionId && left.scheduleRunId === right.scheduleRunId && left.toolCallId === right.toolCallId;
  }
  return false;
};
const approvalDecisionMatches = (returned: NativeToolConfirmation | undefined, requested: NativeToolConfirmation, disposition: "approve" | "reject") =>
  Boolean(returned
    && returned.id === requested.id
    && returned.argumentsHash === requested.argumentsHash
    && approvalOwnerMatches(returned.owner, requested.owner)
    && returned.state === (disposition === "approve" ? "approved" : "rejected"));

export function SettingsOverview() {
  const overview = useQuery({ queryKey: ["settings", "overview"], queryFn: runtime.settingsOverview });
  if (overview.isLoading) return <SettingsPage title="Settings"><LoadingState label="Reading settings" /></SettingsPage>;
  if (overview.isError || !overview.data) return <SettingsPage title="Settings"><ErrorState error={overview.error} onRetry={() => overview.refetch()} /></SettingsPage>;
  const item = (section: "model" | "integrations" | "schedules" | "background" | "notifications") =>
    overview.data.items.find(candidate => candidate.section === section);
  const destination = (section: Parameters<typeof item>[0], title: string, icon: ReactNode, fallbackRoute: string) => {
    const current = item(section);
    const needsReview = current && current.state !== "normal";
    return <Item kind="link" href={current?.route ?? fallbackRoute} title={title} leading={icon}
      description={current?.summary ?? "Status unavailable"}
      trailing={<>{needsReview ? <StatusPill state="attention">{current.state === "unavailable" ? "Unavailable" : "Review"}</StatusPill> : null}<ChevronRight size={16} aria-hidden="true" /></>} />;
  };
  return <SettingsPage title="Settings" description="Make Kora work the way you do.">
    <SettingsSection title="Kora settings" description="Your model, connected services and how Kora runs." layout="split">
      <div className="k-settings-list">
        {destination("model", "Model & reasoning", <Bot size={18} />, "/settings/model")}
        {destination("integrations", "Accounts & integrations", <Link2 size={18} />, "/settings/integrations")}
        {destination("background", "Background & startup", <Monitor size={18} />, "/settings/background")}
      </div>
    </SettingsSection>
    <SettingsSection title="Preferences" description="Make room for your way of working." layout="split">
      <div className="k-settings-list">
        <Item kind="link" href="/settings/appearance" title="Appearance" description="Theme, density and keyboard shortcuts" leading={<Monitor size={18} />} trailing={<ChevronRight size={16} aria-hidden="true" />} />
        {destination("notifications", "Notifications", <CircleAlert size={18} />, "/settings/notifications")}
        {destination("schedules", "Schedules", <CalendarClock size={18} />, "/settings/schedules")}
      </div>
    </SettingsSection>
    <SettingsSection title="Data & support" description="Your local information and help when you need it." layout="split">
      <div className="k-settings-list">
        <Item kind="link" href="/settings/data" title="Local data" description="Manage conversations, outputs, Work and unsent drafts on this device" leading={<Database size={18} />} trailing={<ChevronRight size={16} aria-hidden="true" />} />
        <Item kind="link" href="/settings/diagnostics" title="Diagnostics & about" description="App information and troubleshooting" leading={<FileText size={18} />} trailing={<ChevronRight size={16} aria-hidden="true" />} />
      </div>
    </SettingsSection>
  </SettingsPage>;
}

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const result = useInfiniteQuery({
    queryKey: ["settings", "schedules", state, query.trim()],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.schedules({ pageSize: 25, cursor: pageParam, ...(state === "all" ? {} : { state }), ...(query.trim() ? { query } : {}) }),
    getNextPageParam: page => page.complete ? undefined : page.cursor,
  });
  const schedules = useMemo(() => {
    const byId = new Map<string, NativeSchedule>();
    for (const page of result.data?.pages ?? []) for (const schedule of page.schedules) byId.set(schedule.id, schedule);
    return [...byId.values()];
  }, [result.data]);
  const partial = result.data?.pages.some(page => !page.complete) ?? false;
  const action = useMutation<void, Error, { id: string; kind: "run" | "pause" | "resume" }>({
    mutationFn: async ({ id, kind }) => { const schedule = schedules.find(item => item.id === id); if (!schedule) throw new Error("That schedule is no longer available."); if (kind === "run") await runtime.runSchedule(id); else if (kind === "pause") await runtime.pauseSchedule(id, schedule.version); else await runtime.resumeSchedule(id, schedule.version); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "schedules"] }),
  });
  return <SettingsPage title="Schedules" description="Recurring and one-time work Kora runs in the background." actions={<Button tone="primary" onClick={() => location.hash = "#/settings/schedules/new"}><Plus size={15} /> New schedule</Button>}>
    <PageToolbar
      className="settings-schedules-toolbar"
      search={<SearchField label="Search schedules" value={query} onValueChange={setQuery} placeholder="Search schedules" />}
      controls={<KoraSelect label="Schedule status" value={state} onValueChange={setState} options={[{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "paused", label: "Paused" }, { value: "cancelled", label: "Cancelled" }]} />}
      compactControls={<KoraSelect label="Schedule status" value={state} onValueChange={setState} options={[{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "paused", label: "Paused" }, { value: "cancelled", label: "Cancelled" }]} />}
    />
    {result.isLoading ? <LoadingState label="Loading schedules" /> : result.isError ? <ErrorState error={result.error} onRetry={() => result.refetch()} /> :
      !schedules.length ? <EmptyState
        title={query.trim() || state !== "all" ? "No matching schedules" : "No schedules yet"}
        body={query.trim() || state !== "all" ? "No schedule in the loaded result matches this search and status." : "Create one when you want Kora to handle something at a specific time."}
        action={query.trim() || state !== "all" ? <Button onClick={() => { setQuery(""); setState("all"); }}>Clear filters</Button> : undefined}
      /> :
      <><div className="settings-ledger">{schedules.map(schedule => <div className="settings-row settings-row--schedule" key={schedule.id}>
        <Link to={`/settings/schedules/${schedule.id}`}><span className="settings-row__mark"><CalendarClock size={16} /></span><span className="settings-schedule__identity"><strong>{schedule.displayLabel}</strong><span className="settings-schedule__facts"><small><b>Cadence</b>{" "}{triggerLabel(schedule.trigger)}</small><small><b>Next run</b>{" "}{schedule.nextDueAt ? formatDate(schedule.nextDueAt) : "Not reported"}</small><small><b>State</b>{" "}{humanize(schedule.state)}{tierSummary(schedule.attentionTier) ? ` · ${tierSummary(schedule.attentionTier)}` : ""}{schedule.isTouchpoint ? " · check-in" : ""}</small></span></span></Link>
        <div className="settings-row__actions">
          <StatusPill state={schedule.state === "paused" ? "quiet" : "ready"}>{schedule.state}</StatusPill>
          <Pressable aria-label={`Run ${schedule.displayLabel}`} aria-busy={action.isPending} disabled={action.isPending} onClick={() => action.mutate({ id: schedule.id, kind: "run" })}><Play size={14} /></Pressable>
          {(schedule.state === "enabled" || schedule.state === "paused") && <Pressable aria-label={`${schedule.state === "paused" ? "Resume" : "Pause"} ${schedule.displayLabel}`} aria-busy={action.isPending} disabled={action.isPending} onClick={() => action.mutate({ id: schedule.id, kind: schedule.state === "paused" ? "resume" : "pause" })}>{schedule.state === "paused" ? <Play size={14} /> : <Pause size={14} />}</Pressable>}
        </div>
      </div>)}</div>{partial && <div className="settings-partial-note" role="status"><CircleAlert size={16} /><span>{result.hasNextPage ? "More schedules remain in Kora." : "Kora returned a partial schedule list. The schedules shown here remain usable."}</span></div>}{result.hasNextPage && <div className="settings-load-more"><Button onClick={() => result.fetchNextPage()} disabled={result.isFetchingNextPage}>{result.isFetchingNextPage ? "Loading…" : "Load more schedules"}</Button><small>Showing {schedules.length}; more remain in Kora.</small></div>}</>}
      {action.isError && <ErrorState title="Schedule action failed." error={action.error} />}
  </SettingsPage>;
}

type EditorDraft = {
  name: string;
  prompt: string;
  kind: NativeScheduleTrigger["kind"];
  at: string;
  everyHours: string;
  localTime: string;
  startDate: string;
  frequency: "daily" | "weekly" | "monthly";
  timezone: string;
  recurrenceInterval: string;
  weekdays: number[];
  dayOfMonth: string;
  attentionTier: NativeAttentionTier;
  isTouchpoint: boolean;
};
const ATTENTION_TIER_OPTIONS = [
  { value: "digest", label: "Digest — save for my next check-in" },
  { value: "silent", label: "Silent — just record it" },
  { value: "interrupt", label: "Interrupt — tell me right away" },
];
const ATTENTION_TIER_SUMMARY: Record<NativeAttentionTier, string> = {
  digest: "Saved for your next check-in",
  silent: "Recorded quietly",
  interrupt: "Tells you right away",
};
/** A runtime predating attention tiers omits the field; show nothing rather than "undefined". */
const tierSummary = (tier: NativeAttentionTier | undefined) =>
  tier ? ATTENTION_TIER_SUMMARY[tier] : null;
const ATTENTION_TIER_HELP: Record<NativeAttentionTier, string> = {
  digest: "Results collect quietly and arrive inside the next routine you marked as a check-in.",
  silent: "Kora records the result and never interrupts. You can still read it any time.",
  interrupt: "Kora surfaces this as soon as your quiet hours allow. Best kept for things you must act on.",
};
const viewerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const localDateTime = (instant: string, timezone: string) =>
  Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: "minute" });
const validTimezone = (value: string) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; }
  catch { return false; }
};
const defaultDraft = (): EditorDraft => {
  const timezone = viewerTimezone();
  const now = Temporal.Now.zonedDateTimeISO(timezone);
  return {
    name: "",
    prompt: "",
    kind: "recurring",
    at: now.add({ hours: 1 }).toPlainDateTime().toString({ smallestUnit: "minute" }),
    everyHours: "24",
    localTime: "09:00",
    startDate: now.toPlainDate().toString(),
    frequency: "daily",
    timezone,
    recurrenceInterval: "1",
    weekdays: [now.dayOfWeek],
    dayOfMonth: String(now.day),
    attentionTier: "digest",
    isTouchpoint: false,
  };
};
const draftFromSchedule = (schedule: NativeSchedule): EditorDraft => {
  const draft = defaultDraft();
  return {
    ...draft,
    name: schedule.name ?? "",
    prompt: schedule.prompt,
    attentionTier: schedule.attentionTier,
    isTouchpoint: schedule.isTouchpoint,
    kind: schedule.trigger.kind,
    timezone: schedule.trigger.kind === "recurring" ? schedule.trigger.timezone ?? schedule.timezone ?? draft.timezone : schedule.timezone ?? draft.timezone,
    at: schedule.trigger.kind === "once"
      ? localDateTime(schedule.trigger.at, schedule.timezone ?? draft.timezone)
      : draft.at,
    everyHours: schedule.trigger.kind === "interval" ? String(schedule.trigger.everyMs / 3600_000) : draft.everyHours,
    localTime: schedule.trigger.kind === "recurring" ? schedule.trigger.localTime : draft.localTime,
    startDate: schedule.trigger.kind === "recurring" ? schedule.trigger.startDate : draft.startDate,
    frequency: schedule.trigger.kind === "recurring" ? schedule.trigger.frequency : draft.frequency,
    recurrenceInterval: schedule.trigger.kind === "recurring" ? String(schedule.trigger.interval ?? 1) : draft.recurrenceInterval,
    weekdays: schedule.trigger.kind === "recurring" && schedule.trigger.weekdays?.length ? schedule.trigger.weekdays : draft.weekdays,
    dayOfMonth: schedule.trigger.kind === "recurring" ? String(schedule.trigger.dayOfMonth ?? Number(schedule.trigger.startDate.slice(-2))) : draft.dayOfMonth,
  };
};
const triggerFromDraft = (draft: EditorDraft, _baseline?: NativeScheduleTrigger): NativeScheduleTrigger | undefined => {
  if (draft.kind === "once") {
    if (!validTimezone(draft.timezone)) return;
    try {
      return { kind: "once", at: Temporal.PlainDateTime.from(draft.at).toZonedDateTime(draft.timezone).toInstant().toString() };
    } catch { return; }
  }
  if (draft.kind === "interval") {
    const everyHours = Number(draft.everyHours);
    if (!Number.isFinite(everyHours) || everyHours <= 0) return;
    return {
      kind: "interval",
      everyMs: everyHours * 3600_000,
      anchorAt: _baseline?.kind === "interval" ? _baseline.anchorAt : new Date().toISOString(),
    };
  }
  const interval = Number(draft.recurrenceInterval);
  const dayOfMonth = Number(draft.dayOfMonth);
  if (!/^\d{2}:\d{2}$/.test(draft.localTime) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) ||
    !validTimezone(draft.timezone) || !Number.isInteger(interval) || interval < 1 ||
    (draft.frequency === "weekly" && !draft.weekdays.length) ||
    (draft.frequency === "monthly" && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)))
    return;
  return {
    kind: "recurring",
    frequency: draft.frequency,
    localTime: draft.localTime,
    startDate: draft.startDate,
    timezone: draft.timezone,
    ...(interval > 1 ? { interval } : {}),
    ...(draft.frequency === "weekly" ? { weekdays: [...draft.weekdays].sort((a, b) => a - b) } : {}),
    ...(draft.frequency === "monthly" ? { dayOfMonth } : {}),
  };
};

const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function ScheduleDeliveryFields({ draft, onChange, disabled = false }: { draft: EditorDraft; onChange: (next: EditorDraft) => void; disabled?: boolean }) {
  return <>
    <label>
      <span>How you hear about it</span>
      <KoraSelect
        label="Delivery"
        value={draft.attentionTier}
        disabled={disabled}
        onValueChange={value => onChange({ ...draft, attentionTier: value as NativeAttentionTier })}
        options={ATTENTION_TIER_OPTIONS}
      />
      <small>{ATTENTION_TIER_HELP[draft.attentionTier]}</small>
    </label>
    <CheckboxChoice
      checked={draft.isTouchpoint}
      disabled={disabled}
      onCheckedChange={isTouchpoint => onChange({ ...draft, isTouchpoint })}
      title="Use this as a check-in"
      hint="Digest results that piled up since your last check-in are delivered here."
    />
  </>;
}

function ScheduleTimingFields({ draft, onChange, disabled = false }: { draft: EditorDraft; onChange: (next: EditorDraft) => void; disabled?: boolean }) {
  const toggleWeekday = (day: number) => onChange({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter(value => value !== day) : [...draft.weekdays, day] });
  const timezoneErrorId = useId();
  const timezoneIsValid = validTimezone(draft.timezone);
  return <>
    <div className="settings-form__split">
      <label><span>Timing</span><KoraSelect label="Schedule timing" value={draft.kind} disabled={disabled} onValueChange={kind => onChange({ ...draft, kind: kind as EditorDraft["kind"] })} options={[{ value: "recurring", label: "Recurring" }, { value: "once", label: "Once" }, { value: "interval", label: "Interval" }]} /></label>
      {draft.kind === "once" && <label><span>Run at</span><Input disabled={disabled} type="datetime-local" value={draft.at} onInput={event => onChange({ ...draft, at: event.currentTarget.value })} required /></label>}
      {draft.kind === "interval" && <label><span>Every (hours)</span><Input disabled={disabled} type="number" min="1" value={draft.everyHours} onChange={event => onChange({ ...draft, everyHours: event.target.value })} required /></label>}
      {draft.kind === "recurring" && <><label><span>Frequency</span><KoraSelect label="Frequency" value={draft.frequency} disabled={disabled} onValueChange={frequency => onChange({ ...draft, frequency: frequency as EditorDraft["frequency"] })} options={["daily", "weekly", "monthly"].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></label><label><span>Time</span><Input disabled={disabled} type="time" value={draft.localTime} onChange={event => onChange({ ...draft, localTime: event.target.value })} /></label></>}
    </div>
    {draft.kind !== "interval" && <label><span>Time zone</span><Input disabled={disabled} aria-label="Time zone" value={draft.timezone} onChange={event => onChange({ ...draft, timezone: event.target.value })} aria-invalid={!timezoneIsValid} aria-describedby={timezoneErrorId} invalid={!timezoneIsValid} placeholder="America/New_York" /><small id={timezoneErrorId} className={!timezoneIsValid ? "settings-field-error" : undefined} role={!timezoneIsValid ? "alert" : undefined}>{timezoneIsValid ? "Times use this IANA zone. Kora’s server preview resolves daylight-saving gaps and overlaps before anything is saved." : "Use an IANA time zone such as America/New_York."}</small></label>}
    {draft.kind === "recurring" && <>
      <div className="settings-form__split">
        <label><span>Starts</span><Input disabled={disabled} type="date" value={draft.startDate} onChange={event => onChange({ ...draft, startDate: event.target.value })} required /></label>
        <label><span>Repeat every</span><Input disabled={disabled} type="number" min="1" max="365" value={draft.recurrenceInterval} onChange={event => onChange({ ...draft, recurrenceInterval: event.target.value })} aria-label={`Repeat every ${draft.frequency === "daily" ? "days" : draft.frequency === "weekly" ? "weeks" : "months"}`} /></label>
      </div>
      {draft.frequency === "weekly" && <fieldset className="settings-weekdays"><legend>Days of week</legend><div>{WEEKDAYS.map(day => <Pressable key={day.value} aria-pressed={draft.weekdays.includes(day.value)} disabled={disabled} onClick={() => toggleWeekday(day.value)}>{day.label}</Pressable>)}</div></fieldset>}
      {draft.frequency === "monthly" && <label><span>Day of month</span><Input disabled={disabled} type="number" min="1" max="31" value={draft.dayOfMonth} onChange={event => onChange({ ...draft, dayOfMonth: event.target.value })} /><small>Months without this date are skipped; Kora does not silently move the run.</small></label>}
    </>}
    {draft.kind === "interval" && Number(draft.everyHours) < 1 && <div className="settings-callout"><CircleAlert size={18} /><div><strong>Very frequent schedule</strong><p>Use a cadence of at least one hour in this interface.</p></div></div>}
  </>;
}

function SchedulePreviewState({ triggerReady, preview }: {
  triggerReady: boolean;
  preview: {
    data?: { occurrences: string[] };
    error: unknown;
    isError: boolean;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => unknown;
  };
}) {
  if (!triggerReady) return null;
  if (preview.isLoading || (preview.isFetching && !preview.data)) {
    return <div className="settings-callout" role="status"><LoaderCircle className="spin" size={18} /><div><strong>Checking the next runs</strong><p>Kora is validating this timing against the background service.</p></div></div>;
  }
  if (preview.isError) {
    return <div className="settings-callout settings-callout--recovery" role="alert"><CircleAlert size={18} /><div><strong>Timing preview unavailable</strong><p>{preview.error instanceof Error ? preview.error.message : "Kora could not validate the next runs. Your draft is still here."}</p></div><Button type="button" onClick={() => void preview.refetch()}>Try again</Button></div>;
  }
  if (!preview.data?.occurrences.length) {
    return <div className="settings-callout" role="status"><CalendarClock size={18} /><div><strong>No upcoming run was returned</strong><p>Review the timing before saving; Kora has not confirmed a future occurrence.</p></div></div>;
  }
  return <div className="settings-callout" role="status"><CalendarClock size={18} /><div><strong>Next runs</strong><p>{preview.data.occurrences.map(formatDate).join(" · ")}</p></div></div>;
}

export function ScheduleEditorPage() {
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [initialDraft] = useState(defaultDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [submitted, setSubmitted] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const draftGuard = useDirtyDraftGuard({
    id: "settings:schedule:create",
    label: "New schedule draft",
    dirty,
    onDiscard: () => setDraft(initialDraft),
  });
  const trigger = useMemo(() => triggerFromDraft(draft), [draft]);
  const missingName = !draft.name.trim();
  const missingPrompt = !draft.prompt.trim();
  const missingRequiredCount = Number(missingName) + Number(missingPrompt) + Number(!trigger);
  const preview = useQuery({
    queryKey: ["settings", "schedule-preview", trigger],
    queryFn: () => runtime.previewSchedule(trigger!),
    enabled: Boolean(trigger),
  });
  const create = useMutation({
    mutationFn: () => {
      if (!trigger) throw new Error("Choose a valid schedule time.");
      if (!draft.name.trim()) throw new Error("Name this schedule before creating it.");
      return runtime.createSchedule({
        name: draft.name.trim(),
        prompt: draft.prompt.trim(),
        trigger,
        attentionTier: draft.attentionTier,
        isTouchpoint: draft.isTouchpoint,
        ...(draft.kind === "once" ? { timezone: draft.timezone } : {}),
      });
    },
    onSuccess: ({ schedule }) => {
      if (!mounted.current) return;
      draftGuard.release();
      navigate(`/settings/schedules/${schedule.id}`);
    },
  });
  return <SettingsPage compact title="Create schedule" description="Define the work and timing. Kora will run this as a scheduled task." breadcrumb={<Link className="settings-back-link" to="/settings/schedules">Schedules</Link>}>
    <form className="settings-form" noValidate onSubmit={event => { event.preventDefault(); setSubmitted(true); if (missingRequiredCount === 0) create.mutate(); }}>
      <Section title="Work" description="Name the recurring work and give Kora the exact instructions to follow.">
        <div className="settings-form__group">
          <label><span>Name <em aria-hidden="true">Required</em></span><Input disabled={create.isPending} aria-label="Name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Morning calendar brief" required aria-invalid={submitted && missingName || undefined} aria-describedby={submitted && missingName ? "schedule-name-required" : undefined} />{submitted && missingName ? <small id="schedule-name-required" className="settings-field-error">Give this schedule a recognizable name.</small> : null}</label>
          <label><span>What Kora should do <em aria-hidden="true">Required</em></span><Textarea disabled={create.isPending} aria-label="What Kora should do" value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} placeholder="Review today’s calendar and prepare a concise brief…" required aria-invalid={submitted && missingPrompt || undefined} aria-describedby={submitted && missingPrompt ? "schedule-prompt-required" : undefined} />{submitted && missingPrompt ? <small id="schedule-prompt-required" className="settings-field-error">Describe the exact work Kora should perform.</small> : null}</label>
        </div>
      </Section>
      <Section title="Timing" description="Choose when Kora should start and repeat this work."><ScheduleTimingFields draft={draft} onChange={setDraft} disabled={create.isPending} /></Section>
      <Section title="Delivery" description="Choose how Kora should surface the result."><ScheduleDeliveryFields draft={draft} onChange={setDraft} disabled={create.isPending} /></Section>
      <SchedulePreviewState triggerReady={Boolean(trigger)} preview={preview} />
      {create.isError && <ErrorState title="Kora couldn’t create this schedule." error={create.error} />}
      {submitted && missingRequiredCount ? <div id="schedule-required-summary" className="settings-callout" role="alert"><CircleAlert size={18} /><div><strong>Complete {missingRequiredCount} required {missingRequiredCount === 1 ? "field" : "fields"}</strong><p>Add the missing details above before Kora can create this schedule.</p></div></div> : null}
      <div className="settings-form__actions"><Button type="button" onClick={() => navigate(-1)} disabled={create.isPending}>Cancel</Button><Button tone="primary" type="submit" aria-describedby={submitted && missingRequiredCount ? "schedule-required-summary" : undefined} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create schedule"}</Button></div>
    </form>
  </SettingsPage>;
}

export function ScheduleDetailPage() {
  const { scheduleId = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const mounted = useRef(true);
  const editGeneration = useRef(0);
  useEffect(() => {
    mounted.current = true;
    editGeneration.current += 1;
    setRemoveConflict(false);
    setRemoveRefreshPending(false);
    setRemoveRefreshError(undefined);
    return () => { mounted.current = false; };
  }, [scheduleId]);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [draft, setDraft] = useState(defaultDraft);
  const [editBaseline, setEditBaseline] = useState<{ schedule: NativeSchedule; draft: EditorDraft } | null>(null);
  const [reloadPending, setReloadPending] = useState(false);
  const [reloadError, setReloadError] = useState<unknown>();
  const [removeConflict, setRemoveConflict] = useState(false);
  const [removeRefreshPending, setRemoveRefreshPending] = useState(false);
  const [removeRefreshError, setRemoveRefreshError] = useState<unknown>();
  const schedule = useQuery({ queryKey: ["settings", "schedule", scheduleId], queryFn: () => runtime.schedule(scheduleId) });
  const runs = useInfiniteQuery({
    queryKey: ["settings", "schedule", scheduleId, "runs"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.scheduleRuns(scheduleId, 20, pageParam),
    getNextPageParam: page => page.complete ? undefined : page.cursor,
  });
  const editTrigger = useMemo(() => triggerFromDraft(draft, editBaseline?.schedule.trigger), [draft, editBaseline?.schedule.trigger]);
  const preview = useQuery({
    queryKey: ["settings", "schedule-preview", editTrigger],
    queryFn: () => runtime.previewSchedule(editTrigger!),
    enabled: editing && Boolean(editTrigger),
  });
  const editDirty = Boolean(editing && editBaseline && JSON.stringify(draft) !== JSON.stringify(editBaseline.draft));
  const editGuard = useDirtyDraftGuard({
    id: `settings:schedule:edit:${scheduleId}`,
    label: "Schedule changes",
    dirty: editDirty,
    onDiscard: () => {
      editGeneration.current += 1;
      if (editBaseline) setDraft(editBaseline.draft);
      setEditing(false);
    },
  });
  const cancelEdit = () => {
    editGeneration.current += 1;
    editGuard.release();
    if (editBaseline) setDraft(editBaseline.draft);
    setEditing(false);
  };
  type ScheduleRemovalSubmission = { scheduleId: string; generation: number; expectedVersion: number };
  const reloadRemoval = async (target: ScheduleRemovalSubmission) => {
    if (!mounted.current || scheduleId !== target.scheduleId || editGeneration.current !== target.generation) return;
    setRemoveRefreshPending(true);
    setRemoveRefreshError(undefined);
    try {
      const refreshed = await schedule.refetch();
      if (!mounted.current || scheduleId !== target.scheduleId || editGeneration.current !== target.generation) return;
      if (refreshed.isError || refreshed.error || !refreshed.data) throw refreshed.error ?? new Error("Kora did not return the current schedule.");
    } catch (error) {
      if (mounted.current && scheduleId === target.scheduleId && editGeneration.current === target.generation) setRemoveRefreshError(error);
    } finally {
      if (mounted.current && scheduleId === target.scheduleId && editGeneration.current === target.generation) setRemoveRefreshPending(false);
    }
  };
  const remove = useMutation({
    mutationFn: (submission: ScheduleRemovalSubmission) => runtime.cancelSchedule(submission.scheduleId, submission.expectedVersion),
    onSuccess: (_data, variables) => {
      if (mounted.current && scheduleId === variables.scheduleId && editGeneration.current === variables.generation) navigate("/settings/schedules");
    },
    onError: (error, variables) => {
      if (!(error instanceof RuntimeRequestError && error.status === 409)) return;
      if (!mounted.current || scheduleId !== variables.scheduleId || editGeneration.current !== variables.generation) return;
      setRemoveConflict(true);
      void reloadRemoval(variables);
    },
  });
  const action = useMutation<void, Error, "run" | "pause" | "resume">({ mutationFn: async kind => { const version = schedule.data!.schedule.version; if (kind === "run") await runtime.runSchedule(scheduleId); else if (kind === "pause") await runtime.pauseSchedule(scheduleId, version); else await runtime.resumeSchedule(scheduleId, version); }, onSuccess: () => client.invalidateQueries({ queryKey: ["settings", "schedule", scheduleId] }) });
  type ScheduleEditSubmission = {
    scheduleId: string;
    generation: number;
    expectedVersion: number;
    input: {
      name: string | null;
      prompt: string;
      trigger: NativeScheduleTrigger;
      attentionTier: NativeAttentionTier;
      isTouchpoint: boolean;
      timezone?: string;
    };
  };
  const update = useMutation({
    mutationFn: (submission: ScheduleEditSubmission) => runtime.updateSchedule(submission.scheduleId, submission.expectedVersion, submission.input),
    onSuccess: (data, variables) => {
      client.setQueryData(["settings", "schedule", variables.scheduleId], data);
      client.invalidateQueries({ queryKey: ["settings", "schedules"] });
      if (mounted.current && scheduleId === variables.scheduleId && editGeneration.current === variables.generation) {
        editGuard.release();
        setEditing(false);
      }
    },
    onError: async (error, variables) => {
      if (error instanceof RuntimeRequestError && error.status === 409 && mounted.current && scheduleId === variables.scheduleId && editGeneration.current === variables.generation) await schedule.refetch();
    },
  });
  const submitEdit = () => {
    if (!editTrigger || !editBaseline || update.isPending) return;
    update.mutate({
      scheduleId,
      generation: editGeneration.current,
      expectedVersion: editBaseline.schedule.version,
      input: {
        name: draft.name.trim() || null,
        prompt: draft.prompt.trim(),
        trigger: editTrigger,
        attentionTier: draft.attentionTier,
        isTouchpoint: draft.isTouchpoint,
        ...(draft.kind === "once" ? { timezone: draft.timezone } : {}),
      },
    });
  };
  const editConflict = Boolean(editing && editBaseline && schedule.data?.schedule.version !== editBaseline.schedule.version);
  const reloadEdit = async () => {
    if (reloadPending) return;
    setReloadPending(true);
    setReloadError(undefined);
    try {
      const refreshed = await schedule.refetch();
      if (refreshed.isError || refreshed.error || !refreshed.data) throw refreshed.error ?? new Error("Kora did not return the current schedule.");
      const nextSchedule = refreshed.data.schedule;
      const nextDraft = draftFromSchedule(nextSchedule);
      update.reset();
      setDraft(nextDraft);
      setEditBaseline({ schedule: nextSchedule, draft: nextDraft });
    } catch (error) {
      setReloadError(error);
    } finally {
      setReloadPending(false);
    }
  };
  if (schedule.isLoading) return <SettingsPage title="Schedule" description="Reading this schedule." breadcrumb={<Link className="settings-back-link" to="/settings/schedules">Schedules</Link>}><LoadingState label="Loading schedule" /></SettingsPage>;
  if (!schedule.data) return <SettingsPage title="Schedule" description="Open or recover this saved schedule." breadcrumb={<Link className="settings-back-link" to="/settings/schedules">Schedules</Link>}>{isMissingRecord(schedule.error)
    ? <EmptyState title="Schedule not found" body="This schedule may have been cancelled or removed. Its retained run history can still be opened from a saved link." action={<Button onClick={() => navigate("/settings/schedules")}>Back to schedules</Button>} />
    : <ErrorState title="Kora couldn’t open this schedule." error={schedule.error} onRetry={() => schedule.refetch()} />}</SettingsPage>;
  const item = schedule.data.schedule;
  const runItems = runs.data?.pages.flatMap(page => page.runs) ?? [];
  const active = item.state === "enabled" || item.state === "paused";
  if (editing) return <SettingsPage compact title={`Edit ${item.displayLabel}`} description="Update the instructions or timing for this saved schedule." breadcrumb={<Button tone="link" className="settings-back-link" type="button" onClick={cancelEdit} disabled={update.isPending || reloadPending}>Schedule detail</Button>}>
    <form className="settings-form" onSubmit={event => { event.preventDefault(); submitEdit(); }}>
      {schedule.isError && <ContentState state="error" announcement="assertive" title="The latest schedule read failed." body="Your edit remains here. Reload the schedule only when you are ready to replace this draft." action={<Button type="button" onClick={() => void reloadEdit()} disabled={reloadPending}>{reloadPending ? "Reloading…" : "Reload schedule"}</Button>} />}
      {editConflict && <ContentState state="error" announcement="assertive" title="This schedule changed while you were editing." body="Your draft is preserved. Reload the current schedule to replace this draft and its version baseline." action={<Button type="button" onClick={() => void reloadEdit()} disabled={reloadPending}>{reloadPending ? "Reloading…" : "Reload schedule"}</Button>} />}
      {reloadError ? <ErrorState title="The schedule could not be reloaded." error={reloadError} onRetry={() => void reloadEdit()} /> : null}
      <Section title="Work" description="Name the recurring work and give Kora the exact instructions to follow.">
        <div className="settings-form__group">
          <label><span>Name</span><Input disabled={update.isPending || schedule.isError || editConflict || reloadPending} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Morning calendar brief" /></label>
          <label><span>What Kora should do</span><Textarea disabled={update.isPending || schedule.isError || editConflict || reloadPending} value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.target.value })} required /></label>
        </div>
      </Section>
      <Section title="Timing" description="Choose when Kora should start and repeat this work."><ScheduleTimingFields draft={draft} onChange={setDraft} disabled={update.isPending || schedule.isError || editConflict || reloadPending} /></Section>
      <Section title="Delivery" description="Choose how Kora should surface the result."><ScheduleDeliveryFields draft={draft} onChange={setDraft} disabled={update.isPending || schedule.isError || editConflict || reloadPending} /></Section>
      <SchedulePreviewState triggerReady={Boolean(editTrigger)} preview={preview} />
      {update.isError && <ErrorState title="Kora couldn’t update this schedule." error={update.error} onRetry={!schedule.isError && !editConflict && update.variables ? () => update.mutate(update.variables!) : undefined} />}
      <div className="settings-form__actions"><Button type="button" onClick={cancelEdit} disabled={update.isPending || reloadPending}>Cancel</Button><Button tone="primary" type="submit" disabled={update.isPending || schedule.isError || editConflict || reloadPending || !draft.prompt.trim() || !editTrigger}>{update.isPending ? "Saving…" : "Save changes"}</Button></div>
    </form>
  </SettingsPage>;
  const removalFeedback = removeConflict
    ? <ContentState
      state={removeRefreshPending ? "loading" : "error"}
      announcement="assertive"
      title="Schedule changed before cancellation."
      body={removeRefreshPending
        ? "Reading the current schedule version before asking you to confirm again."
        : removeRefreshError
          ? `Kora could not reload the current schedule. ${removeRefreshError instanceof Error ? removeRefreshError.message : "Try again to read the current version."} Your cancellation was not repeated.`
          : "The current schedule is loaded. Review its details, then confirm cancellation again."}
      action={removeRefreshError && remove.variables
        ? <Button onClick={() => void reloadRemoval(remove.variables!)} disabled={removeRefreshPending}>{removeRefreshPending ? "Reloading…" : "Reload current schedule"}</Button>
        : undefined}
    />
    : remove.isError
      ? <ErrorState title="Schedule could not be cancelled." error={remove.error} onRetry={() => remove.variables && remove.mutate(remove.variables)} retryLabel="Try again" />
      : null;
  return <SettingsPage title={item.displayLabel} description={triggerLabel(item.trigger)} breadcrumb={<Link className="settings-back-link" to="/settings/schedules">Schedules</Link>} actions={active ? <><Button onClick={() => { editGeneration.current += 1; update.reset(); const next = draftFromSchedule(item); setDraft(next); setEditBaseline({ schedule: item, draft: next }); setReloadError(undefined); setEditing(true); }} disabled={action.isPending || remove.isPending}><Pencil size={14} /> Edit</Button><Button onClick={() => action.mutate(item.state === "paused" ? "resume" : "pause")} disabled={action.isPending || remove.isPending}>{item.state === "paused" ? <Play size={14} /> : <Pause size={14} />}{item.state === "paused" ? "Resume" : "Pause"}</Button><Button tone="primary" onClick={() => action.mutate("run")} disabled={action.isPending || remove.isPending}><Play size={14} /> Run now</Button></> : undefined}>
    <Section title="Instructions"><p className="settings-prose">{item.prompt}</p></Section>
    <Section title="Run state"><div className="settings-facts"><div><span>Status</span><strong>{humanize(item.state)}</strong></div><div><span>Next run</span><strong>{item.nextDueAt ? formatDate(item.nextDueAt) : item.state === "cancelled" ? "No future runs" : "Not reported"}</strong></div><div><span>Last run</span><strong>{item.lastRunState ? runStateLabel(item.lastRunState) : "Not run yet"}</strong></div></div></Section>
    <Section title="Recent runs" description="The latest executions from this schedule.">
      {runs.isLoading ? <LoadingState label="Loading run history" /> : runs.isError ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} /> :
        !runItems.length ? <EmptyState title="No runs yet" body="Run history will appear after Kora executes this schedule." /> :
        <><div className="settings-ledger">{runItems.map(run => <Link className="settings-row" key={run.id} to={`/settings/schedules/${scheduleId}/runs/${run.id}`}><div><Play size={15} /><span><strong>{runStateLabel(run.state)}</strong><small>{humanize(run.trigger)} · {formatDate(run.finishedAt ?? run.turnStartedAt ?? run.claimedAt)}</small></span></div><div className="settings-row__actions"><StatusPill state={run.state === "finished" ? "ready" : run.state === "running" || run.state === "claimed" || run.state === "retry_wait" ? "attention" : "quiet"}>{runStateLabel(run.state)}</StatusPill><ChevronRight size={15} /></div></Link>)}</div>{runs.hasNextPage && <div className="settings-load-more"><Button onClick={() => runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>{runs.isFetchingNextPage ? "Loading…" : "Load older runs"}</Button><small>Showing {runItems.length}; more remain in Kora.</small></div>}</>}
    </Section>
    {action.isPending && <p className="settings-prose" role="status">{action.variables === "run" ? "Starting a schedule run…" : action.variables === "pause" ? "Pausing schedule…" : "Resuming schedule…"}</p>}
    {action.isError && <ErrorState title="Schedule action failed." error={action.error} onRetry={() => action.variables && action.mutate(action.variables)} />}
    {active && <div className="settings-danger"><div><strong>{confirmCancel ? "Cancel this schedule?" : "Cancel schedule"}</strong><p>{confirmCancel ? "Future runs stop immediately. Existing conversation, notification, and output history stays intact." : "Stops future runs. Existing conversation and output history stays intact."}</p></div>{removalFeedback}<div className="settings-actions">{confirmCancel && <Button onClick={() => setConfirmCancel(false)} disabled={remove.isPending || removeRefreshPending || action.isPending}>Keep schedule</Button>}<Button tone={confirmCancel ? "danger" : "secondary"} onClick={() => { if (!confirmCancel) { setConfirmCancel(true); return; } if (removeRefreshPending || removeRefreshError) return; setRemoveConflict(false); remove.mutate({ scheduleId, expectedVersion: item.version, generation: editGeneration.current }); }} disabled={remove.isPending || removeRefreshPending || Boolean(removeRefreshError) || action.isPending}><X size={14} /> {remove.isPending ? "Cancelling…" : confirmCancel ? "Confirm cancel" : "Cancel schedule"}</Button></div></div>}
  </SettingsPage>;
}

export function ScheduleRunDetailPage({
  onAskKora,
}: {
  onAskKora?: (reference: ConversationContextReference) => void;
}) {
  const { scheduleId = "", runId = "" } = useParams();
  const navigate = useNavigate();
  const run = useQuery({
    queryKey: ["settings", "schedule", scheduleId, "run", runId],
    queryFn: () => runtime.scheduleRun(scheduleId, runId),
  });
  const retry = useMutation({
    mutationFn: () => runtime.runSchedule(scheduleId),
    onSuccess: ({ run: nextRun }) => navigate(`/settings/schedules/${scheduleId}/runs/${nextRun.id}`),
  });
  if (run.isLoading) return <SettingsPage title="Schedule run" description="Reading this saved run." breadcrumb={<Link className="settings-back-link" to={`/settings/schedules/${scheduleId}`}>Schedule detail</Link>}><LoadingState label="Opening schedule run" /></SettingsPage>;
  if (run.isError || !run.data) return <SettingsPage title="Schedule run" description="Open or recover this exact retained run." breadcrumb={<Link className="settings-back-link" to={`/settings/schedules/${scheduleId}`}>Schedule detail</Link>}>{isMissingRecord(run.error)
    ? <EmptyState title="Run not found" body="This run is no longer available. The schedule and its other retained runs are unchanged." action={<Button onClick={() => navigate(`/settings/schedules/${scheduleId}`)}>Back to schedule</Button>} />
    : <ErrorState title="Kora couldn’t open this run." error={run.error} onRetry={() => run.refetch()} />}</SettingsPage>;
  const item = run.data.run;
  const result = item.resultText?.trim();
  const activeRun = item.state === "claimed" || item.state === "running" || item.state === "retry_wait";
  const canRunAgain = item.state === "stopped" || item.state === "cancelled";
  return <SettingsPage title={`${runStateLabel(item.state)} run`} description={`${humanize(item.trigger)} · ${formatDate(item.finishedAt ?? item.turnStartedAt ?? item.claimedAt)}`} breadcrumb={<Link className="settings-back-link" to={`/settings/schedules/${scheduleId}`}>Schedule detail</Link>} actions={<Button onClick={() => navigate(`/settings/schedules/${scheduleId}`)}>Back to schedule</Button>}>
    <Section title="Result" description={activeRun ? "Current progress from this saved run." : "The settled outcome from this saved run."}>
      {result ? <p className="settings-prose">{result}</p> : <EmptyState title={activeRun ? "No result yet" : "No result was recorded"} body={item.state === "retry_wait" ? "Kora is waiting before the next retry." : item.state === "running" || item.state === "claimed" ? "Kora is still working." : "This run reached a terminal state without answer text."} />}
    </Section>
    <Section title="Run facts">
      <div className="settings-facts">
        <div><span>State</span><strong>{runStateLabel(item.state)}</strong></div>
        <div><span>Started</span><strong>{formatDate(item.turnStartedAt ?? item.claimedAt)}</strong></div>
        <div><span>Finished</span><strong>{item.finishedAt ? formatDate(item.finishedAt) : activeRun ? "Still active" : "Not recorded"}</strong></div>
      </div>
      {(item.reasonCode || (item.detail && item.resultText)) && <div className="settings-callout"><CircleAlert size={18} /><div><strong>{item.reasonCode ? humanize(item.reasonCode) : "Run detail"}</strong>{item.detail && <p>{item.detail}</p>}</div></div>}
    </Section>
    {canRunAgain && <Section title="Recovery" description="Start a new manual run of this schedule. The stopped run above remains unchanged in history."><Button onClick={() => retry.mutate()} disabled={retry.isPending}>{retry.isPending ? "Starting…" : "Run schedule again"}</Button>{retry.isError && <ErrorState title="Kora couldn’t start another run." error={retry.error} />}</Section>}
    <Section title="Related">
      <div className="settings-ledger">
        {onAskKora && <div className="settings-row"><div><Bot size={16} /><span><strong>Discuss this run</strong><small>Attach the exact result to your current Kora conversation</small></span></div><Button tone="secondary" onClick={() => onAskKora({ kind: "assistant_run", id: item.id, title: `${runStateLabel(item.state)} schedule run` })}>Discuss</Button></div>}
        {item.artifactId && <Link className="settings-row" to={`/brain/outputs/${encodeURIComponent(item.artifactId)}`}><div><ExternalLink size={16} /><span><strong>Open output</strong><small>View the durable artifact created by this run</small></span></div><ChevronRight size={15} /></Link>}
        {!onAskKora && !item.artifactId && <EmptyState title="No linked output" body="The run result above is the complete recorded outcome." />}
      </div>
    </Section>
  </SettingsPage>;
}

export function NotificationsSettingsPage() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["settings", "notification-preferences"], queryFn: runtime.notificationSettings });
  const host = useQuery({ queryKey: ["settings", "host-preferences"], queryFn: desktopHost.preferences, enabled: hasDesktopHost });
  const permission = useQuery({ queryKey: ["settings", "notification-permission"], queryFn: desktopHost.notificationPermission, enabled: hasDesktopHost });
  const [quietDraft, setQuietDraft] = useState({ start: "", end: "" });
  const [quietBaseline, setQuietBaseline] = useState<{ start: string; end: string; version: number }>();
  const start = quietDraft.start;
  const end = quietDraft.end;
  const quietDirty = Boolean(quietBaseline && (start !== quietBaseline.start || end !== quietBaseline.end));
  useEffect(() => {
    if (!settings.data || quietDirty) return;
    const next = { start: settings.data.quietStart ?? "", end: settings.data.quietEnd ?? "", version: settings.data.version };
    setQuietDraft({ start: next.start, end: next.end });
    setQuietBaseline(next);
  }, [settings.data, quietDirty]);
  const save = useMutation({
    mutationFn: () => {
      if (!quietBaseline) throw new Error("Quiet hours are not ready to save.");
      return runtime.updateNotificationSettings({ start: start || null, end: end || null, expectedVersion: quietBaseline.version });
    },
    onSuccess: data => {
      const next = { start: data.quietStart ?? "", end: data.quietEnd ?? "", version: data.version };
      setQuietDraft({ start: next.start, end: next.end });
      setQuietBaseline(next);
      client.setQueryData(["settings", "notification-preferences"], data);
    },
    onError: async error => {
      if (error instanceof RuntimeRequestError && error.status === 409) await settings.refetch();
    },
  });
  const quietHoursChanged = quietDirty;
  const quietHoursIncomplete = Boolean(start) !== Boolean(end);
  const quietHoursEqual = Boolean(start && end && start === end);
  const quietHoursValid = !quietHoursIncomplete && !quietHoursEqual;
  const quietConflict = Boolean(settings.data && quietBaseline && quietDirty && settings.data.version !== quietBaseline.version);
  const quietGuard = useDirtyDraftGuard({
    id: "settings:notification-quiet-hours",
    label: "Quiet-hours changes",
    dirty: quietDirty,
    onDiscard: () => {
      if (quietBaseline) setQuietDraft({ start: quietBaseline.start, end: quietBaseline.end });
    },
  });
  const [reloadPending, setReloadPending] = useState(false);
  const [reloadError, setReloadError] = useState<unknown>();
  const reloadQuietHours = async () => {
    if (reloadPending) return;
    setReloadPending(true);
    setReloadError(undefined);
    try {
      const refreshed = await settings.refetch();
      if (refreshed.isError || refreshed.error || !refreshed.data) throw refreshed.error ?? new Error("Kora did not return the current quiet-hours settings.");
      const next = { start: refreshed.data.quietStart ?? "", end: refreshed.data.quietEnd ?? "", version: refreshed.data.version };
      save.reset();
      setQuietDraft({ start: next.start, end: next.end });
      setQuietBaseline(next);
      quietGuard.release();
      client.setQueryData(["settings", "notification-preferences"], refreshed.data);
    } catch (error) {
      setReloadError(error);
    } finally {
      setReloadPending(false);
    }
  };
  const saveHost = useMutation({
    mutationFn: (value: { enabled: boolean; preview: "show_details" | "hide_details" }) =>
      desktopHost.setNotificationPreferences(value.enabled, value.preview),
    onSuccess: data => client.setQueryData(["settings", "host-preferences"], data),
  });
  const requestPermission = useMutation({
    mutationFn: desktopHost.requestNotificationPermission,
    onSuccess: value => client.setQueryData(["settings", "notification-permission"], value),
  });
  return <SettingsPage title="Notifications" description="Choose when Kora may interrupt you. The inbox remains complete even during quiet hours." actions={<Link className="settings-text-link" to="/notifications">Open inbox <ArrowRight size={14} /></Link>}>
    <Section title="Quiet hours" description="Notification presentation waits during this window; Kora’s work continues.">
      <div className="settings-notification-preferences-slot">
        {settings.isLoading && !settings.data && <div className="settings-prose" role="status" aria-label="Reading quiet hours">Reading quiet hours…</div>}
        {!settings.isLoading && !settings.data && <ErrorState error={settings.error} onRetry={() => settings.refetch()} />}
        {settings.data && <>
          {settings.isError && <ContentState state="error" announcement="assertive" title="The latest quiet-hours read failed." body="Your current draft remains here. Try the read again when you want to compare it with Kora’s settings." action={<Button onClick={() => void settings.refetch()}>Try again</Button>} />}
          {quietConflict && <ContentState state="error" announcement="assertive" title="Quiet hours changed elsewhere." body="Your draft is preserved. Reload the current settings to replace this draft and its version baseline." action={<Button onClick={() => void reloadQuietHours()} disabled={reloadPending}>{reloadPending ? "Reloading…" : "Reload quiet hours"}</Button>} />}
          {reloadError && <ErrorState title="Quiet hours could not be reloaded." error={reloadError} onRetry={() => void reloadQuietHours()} />}
        </>}
        <div className="settings-inline-fields" role="group" aria-label="Quiet hours window"><label><span>From</span><Input disabled={!settings.data || save.isPending || quietConflict || reloadPending} type="time" value={start} aria-invalid={quietHoursIncomplete || quietHoursEqual || undefined} onValueChange={value => { save.reset(); setQuietDraft(current => ({ ...current, start: value })); }} /></label><label><span>Until</span><Input disabled={!settings.data || save.isPending || quietConflict || reloadPending} type="time" value={end} aria-invalid={quietHoursIncomplete || quietHoursEqual || undefined} onValueChange={value => { save.reset(); setQuietDraft(current => ({ ...current, end: value })); }} /></label><Button tone="primary" onClick={() => save.mutate()} disabled={!settings.data || save.isPending || quietConflict || reloadPending || !quietHoursChanged || !quietHoursValid}>{save.isPending ? "Saving…" : "Save"}</Button></div>
        {settings.data && <>
          {!start && !end && <p className="settings-prose">Quiet hours are not set. Interrupt notifications may appear at any time.</p>}
          {quietHoursIncomplete && <ContentState state="error" size="inline" announcement="assertive" title="Enter both a start and end time, or clear both fields." />}
          {quietHoursEqual && <ContentState state="error" size="inline" announcement="assertive" title="Start and end cannot be the same time. Choose a real quiet window before saving." />}
          {start && end && !quietHoursEqual && <p className="settings-prose">{start > end ? "Quiet hours cross midnight in your current time zone." : "Quiet hours begin and end on the same day in your current time zone."}</p>}
          {save.isSuccess && <p className="settings-success"><Check size={14} /> Quiet hours saved</p>}
          {save.isError && (
            <ErrorState
              title="Quiet hours could not be saved."
              error={save.error}
              onRetry={() => save.mutate()}
              retryLabel={save.error instanceof RuntimeRequestError && save.error.status === 409
                ? "Try again with this draft"
                : "Try again"}
            />
          )}
        </>}
      </div>
    </Section>
    <Section title="Windows notifications" description="Choose whether Windows notifications can appear and what their previews reveal.">
      {!hasDesktopHost ? <div className="settings-callout"><Monitor size={18} /><div><strong>Desktop control</strong><p>Open this page in the Kora desktop app to change Windows presentation.</p></div></div> :
        host.isLoading || permission.isLoading ? <LoadingState label="Reading Windows notification settings" /> :
        <div className="settings-choice-list">
          {permission.data !== "granted" && <Button disabled={permission.data === "denied" || requestPermission.isPending} onClick={() => requestPermission.mutate()}>{permission.data === "denied" ? "Permission blocked in Windows" : "Allow Windows notifications"}</Button>}
          <CheckboxChoice checked={Boolean(host.data?.windowsNotificationsEnabled)} onCheckedChange={enabled => saveHost.mutate({ enabled, preview: host.data?.notificationPreview ?? "hide_details" })} title="Show Windows notifications" hint="Kora keeps the complete inbox even when this is off." />
          <CheckboxChoice checked={host.data?.notificationPreview === "show_details"} onCheckedChange={showDetails => saveHost.mutate({ enabled: Boolean(host.data?.windowsNotificationsEnabled), preview: showDetails ? "show_details" : "hide_details" })} title="Show details in previews" hint="When off, Windows only says Kora has an update." />
        </div>}
      {saveHost.isError && <ErrorState title="Windows notification settings could not be saved." error={saveHost.error} />}
    </Section>
  </SettingsPage>;
}

export function NotificationInboxPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [visibleNotifications, setVisibleNotifications] = useState<readonly NativeNotification[]>([]);
  const result = useInfiniteQuery({
    queryKey: ["settings", "notification-inbox", unseenOnly],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => runtime.notifications(unseenOnly, pageParam),
    getNextPageParam: page => page.complete ? undefined : page.cursor,
  });
  const notifications = useMemo(() => {
    const byId = new Map<string, NativeNotification>();
    for (const page of result.data?.pages ?? []) for (const item of page.notifications) byId.set(item.id, item);
    return [...byId.values()];
  }, [result.data]);
  const markThrough = useMutation({
    mutationFn: async () => {
      const boundary = visibleNotifications.at(-1);
      if (boundary) await runtime.markNotificationsSeenThrough({ createdAt: boundary.createdAt, id: boundary.id });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["settings", "notification-inbox"] }),
  });
  const unseenCount = notifications.filter((item) => !item.seenAt).length;
  const visibleUnseenCount = visibleNotifications.filter((item) => !item.seenAt).length;
  const filterControl = () => <div className="settings-segmented" aria-label="Notification filter"><Pressable aria-pressed={!unseenOnly} onClick={() => setUnseenOnly(false)}>All</Pressable><Pressable aria-pressed={unseenOnly} onClick={() => setUnseenOnly(true)}>Unseen</Pressable></div>;
  return <><PageHeading title="Notifications" />
    <PageFrame width="standard" className="notification-center">
      <PageHeader
        title="Your notification center"
        description="A durable, local record of finished work, stopped runs, and updates that need your attention."
        status={<span>{unseenCount} unseen · {notifications.length} loaded</span>}
      />
      <PageToolbar
        controls={filterControl()}
        compactControls={filterControl()}
        secondaryActions={<div className="notification-center__actions"><span role="status" aria-live="polite">{markThrough.isSuccess ? "Visible notifications marked as seen." : ""}</span>{markThrough.isError ? <NotificationInlineError>Couldn’t update visible notifications.</NotificationInlineError> : null}</div>}
        primaryAction={notifications.length > 0 ? <Button onClick={() => markThrough.mutate()} disabled={markThrough.isPending || visibleUnseenCount === 0}>{markThrough.isPending ? "Marking…" : visibleUnseenCount === 0 ? "All visible seen" : "Mark visible as seen"}</Button> : undefined}
      />
      <div className="notification-center__content">
        {result.isLoading ? <NotificationLoading rows={6} /> : null}
        {result.isError ? <NotificationAvailabilityView state={notificationAvailabilityForError(result.error)} message={notificationAvailabilityForError(result.error) === "unavailable" && result.error instanceof Error ? result.error.message : undefined} onRetry={() => result.refetch()} /> : null}
        {!result.isLoading && !result.isError && !notifications.length ? <NotificationAvailabilityView state="empty" message={unseenOnly ? "There are no unseen notifications." : undefined} /> : null}
        {notifications.length > 0 ? <NotificationFeed notifications={notifications} onVisibleWindowChange={setVisibleNotifications} onOpen={(notification) => navigate(`/notifications/${encodeURIComponent(notification.id)}`)} /> : null}
      </div>
      {result.hasNextPage ? <div className="notification-center__more"><Button onClick={() => result.fetchNextPage()} disabled={result.isFetchingNextPage}>{result.isFetchingNextPage ? "Loading…" : "Load older"}</Button><span>Showing {notifications.length}; older notifications remain in Kora.</span></div> : null}
    </PageFrame>
  </>;
}

export function NotificationDetailPage() {
  const { notificationId = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["settings", "notification", notificationId], queryFn: () => runtime.notification(notificationId) });
  const item = query.data?.notification;
  const seen = useMutation({ mutationFn: () => runtime.markNotificationSeen(notificationId), onSuccess: data => { client.setQueryData(["settings", "notification", notificationId], data); void client.invalidateQueries({ queryKey: ["settings", "notification-inbox"] }); } });
  if (query.isLoading) return <><PageHeading title="Notification" titleRole="label" /><PageFrame width="standard" className="notification-detail">
    <PageHeader title="Notification" description="Loading this notification and its source context." />
    <NotificationLoading rows={4} />
  </PageFrame></>;
  if (query.isError || !item) {
    const state = query.isError ? notificationAvailabilityForError(query.error) : "not-found";
    const retriable = state === "offline" || state === "unavailable";
    return <><PageHeading title="Notification" titleRole="label" /><PageFrame width="standard" className="notification-detail">
      <Link className="notification-detail__back" to="/notifications">Notifications</Link>
      <NotificationAvailabilityView
        state={state}
        headingLevel={1}
        message={state === "unavailable" && query.error instanceof Error ? query.error.message : undefined}
        onRetry={retriable ? () => query.refetch() : undefined}
        actions={<Link className="button button--secondary" to="/notifications">Back to notifications</Link>}
      />
    </PageFrame></>;
  }
  return <><PageHeading title="Notification" titleRole="label" actionsKey={`${item.seenAt ?? "unseen"}:${seen.isPending}`} />
    <PageFrame width="standard" className="notification-detail">
      <PageHeader
        breadcrumb={<Link to="/notifications">Notifications</Link>}
        title={item.title}
        description={item.message}
        status={<div className="notification-detail__meta"><span>{item.type === "run_finished" ? "Run finished" : item.type === "run_stopped" ? "Run stopped" : "Kora update"}</span><span>{notificationSource(item)}</span><span>{notificationStateLabel(item)}</span><time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time></div>}
        actions={<Button onClick={() => seen.mutate()} disabled={seen.isPending || Boolean(item.seenAt)}>{seen.isPending ? "Marking…" : item.seenAt ? <><Check size={14} /> Marked as seen</> : "Mark as seen"}</Button>}
      />
      {seen.isError ? <NotificationInlineError>Couldn’t mark this notification as seen.</NotificationInlineError> : null}
      {item.sourceResultText ? <PageSection title="Recorded result" description="The exact result text stored with this notification."><div className="notification-detail__result"><span className="notification-detail__result-label"><FileText size={15} aria-hidden="true" />Recorded with this notification</span><p>{item.sourceResultText}</p></div></PageSection> : null}
      <NotificationReferences notification={item} />
    </PageFrame>
  </>;
}

function NotificationReferences({ notification }: { notification: NativeNotification }) {
  return <PageSection title="Related records" description="Open the recorded source without changing this notification."><div className="settings-ledger">
    {notification.scheduleId && notification.runId && <Link className="settings-row" to={`/settings/schedules/${notification.scheduleId}/runs/${notification.runId}`}><div><Bot size={16} /><span><strong>Open run</strong><small>Inspect the saved result</small></span></div><ChevronRight size={15} /></Link>}
    {notification.scheduleId && <Link className="settings-row" to={`/settings/schedules/${notification.scheduleId}`}><div><CalendarClock size={16} /><span><strong>Open schedule</strong><small>Review the source automation</small></span></div><ChevronRight size={15} /></Link>}
    {!notification.scheduleId && <EmptyState title="No linked surface" body="This notification is informational." />}
  </div></PageSection>;
}

export function ApprovalDetailPage() {
  const { approvalId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const [decisionFeedback, setDecisionFeedback] = useState<{ title: string; body: string }>();
  const returnTo = approvalReturnPath(new URLSearchParams(location.search).get("returnTo"));
  const query = useQuery({ queryKey: ["approvals"], queryFn: runtime.toolConfirmations });
  const pendingConfirmations = query.data?.confirmations.filter(item => item.state === "pending" && item.owner) ?? [];
  const confirmation = query.data?.confirmations.find(item => item.id === approvalId && item.state === "pending" && item.owner);
  const decision = useMutation({
    mutationFn: async (disposition: "approve" | "reject") => {
      if (!confirmation) throw new Error("That approval is no longer available.");
      const requested = confirmation;
      const result = disposition === "approve" ? await runtime.approveToolConfirmation(requested) : await runtime.rejectToolConfirmation(requested);
      return { disposition, requested, result };
    },
    onSuccess: async ({ disposition, requested, result }) => {
      if (!approvalDecisionMatches(result.confirmation, requested, disposition)) {
        const returned = result.confirmation;
        const state = returned?.state;
        setDecisionFeedback({
          title: state === "expired" ? "This approval expired before the decision settled." : state === "unavailable" ? "This approval is no longer available." : state === "rejected" && disposition === "approve" ? "This approval was rejected before your approval settled." : state === "approved" && disposition === "reject" ? "This approval was already approved before your rejection settled." : "Kora could not verify that decision.",
          body: state === "pending" || !returned ? "The requested decision remains uncertain. Refresh the current review before trying again." : "No new action was authorized from this response. Refresh the current review before trying again.",
        });
        await Promise.allSettled([
          query.refetch(),
          client.invalidateQueries({ queryKey: ["approvals"] }),
        ]);
        return;
      }
      setDecisionFeedback(undefined);
      let approvalRefreshFailed = false;
      try {
        const refreshed = await query.refetch();
        approvalRefreshFailed = refreshed.isError || Boolean(refreshed.error);
      } catch {
        approvalRefreshFailed = true;
      }
      const refreshes = await Promise.allSettled([
        client.invalidateQueries({ queryKey: ["approvals"] }),
        client.invalidateQueries({ queryKey: ["shell-bootstrap"] }),
      ]);
      const refreshFailed = approvalRefreshFailed || refreshes.some(result => result.status === "rejected");
      toast.notify({
        title: disposition === "approve" ? "Approval recorded" : "Request rejected",
        description: refreshFailed
          ? `${disposition === "approve" ? "Kora accepted the exact reviewed action." : "Kora recorded the rejection."} The decision settled, but the approval list could not be refreshed.`
          : disposition === "approve" ? "Kora may continue only with the exact reviewed action." : "Kora will not perform the reviewed action.",
        tone: "success",
      });
      navigate(returnTo, { replace: true });
    },
    onError: async (error) => {
      if (error instanceof RuntimeRequestError && error.code === "confirmation_unavailable") {
        await query.refetch();
      }
    },
  });
  if (query.isLoading) return <div className="settings-standalone settings-standalone--narrow"><PageHeader title="Approval review" description="Reading the exact action awaiting your decision." /><LoadingState label="Reading approval" /></div>;
  if (query.isError) return <div className="settings-standalone settings-standalone--narrow"><PageHeader breadcrumb={<Link className="approval-detail__back" to={returnTo}>Back</Link>} title="Approval review" description="Review the exact action awaiting your decision." /><ErrorState title="This approval couldn’t be checked." error={query.error} onRetry={() => query.refetch()} /></div>;
  if (!confirmation) return <div className="settings-standalone settings-standalone--narrow"><PageHeader breadcrumb={<Link className="approval-detail__back" to={returnTo}>Back</Link>} title="Approval review" description="Review the exact action awaiting your decision." /><EmptyState title="This approval is no longer waiting" body="It may have expired or been handled from another Kora surface." action={<Link className="button button--secondary" to={returnTo}>Return to previous page</Link>} /></div>;
  return <div className="settings-standalone settings-standalone--narrow approval-detail">
    <PageHeader breadcrumb={<Link className="approval-detail__back" to={returnTo}>Back</Link>} title={confirmation.presentation.action} description="Review the exact target and consequence before Kora continues." />
    {pendingConfirmations.length > 1 ? <section className="settings-callout" aria-labelledby="approval-multiple-heading"><ShieldCheck size={18} /><div><strong id="approval-multiple-heading">{pendingConfirmations.length} approval requests are waiting</strong><p>This review is bound to confirmation <code>{confirmation.id}</code>. Other waiting IDs: {pendingConfirmations.filter(item => item.id !== confirmation.id).map(item => item.id).join(", ")}.</p></div></section> : null}
    <ApprovalPresentation confirmation={confirmation} />
     {decisionFeedback ? <ContentState state="error" announcement="assertive" title={decisionFeedback.title} body={decisionFeedback.body} action={<Button onClick={() => { setDecisionFeedback(undefined); void query.refetch(); }}>Refresh review</Button>} /> : null}
     {decision.isError ? <ContentState state="error" announcement="assertive" title="Kora couldn’t record that decision." body={decision.error instanceof RuntimeRequestError && decision.error.status === 409
      ? "This approval changed before your decision."
      : decision.error instanceof Error ? decision.error.message : "Kora did not accept the decision."} action={<Button onClick={() => decision.variables && decision.mutate(decision.variables)}>Try again</Button>} /> : null}
     {!decisionFeedback && <ApprovalPanel approvals={[{ id: confirmation.id, title: confirmation.presentation.action, target: confirmation.presentation.target, consequence: confirmation.presentation.consequence, expiresAt: confirmation.expiresAt }]} busyId={decision.isPending ? confirmation.id : undefined} busyAction={decision.isPending ? decision.variables : undefined} showSummary={false} onApprove={() => { setDecisionFeedback(undefined); decision.mutate("approve"); }} onReject={() => { setDecisionFeedback(undefined); decision.mutate("reject"); }} />}
  </div>;
}

export function approvalReturnPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/kora";
  const pathname = candidate.split(/[?#]/, 1)[0];
  if (pathname === "/approvals" || pathname.startsWith("/approvals/")) return "/kora";
  return candidate;
}

const approvalRiskLabel: Record<NativeToolConfirmation["presentation"]["risk"], string> = {
  external: "External action",
  destructive: "Destructive action",
  private: "Private data",
  financial: "Financial action",
  high_risk_local: "High-risk local action",
};

function ApprovalPresentation({ confirmation }: { confirmation: NativeToolConfirmation }) {
  const { presentation } = confirmation;
  return <div className="approval-detail__presentation">
    <dl className="approval-detail__facts">
      <div><dt>Risk</dt><dd>{approvalRiskLabel[presentation.risk]}</dd></div>
      <div><dt>Target</dt><dd>{presentation.target}</dd></div>
      <div><dt>Consequence</dt><dd>{presentation.consequence}</dd></div>
      <div><dt>Tool</dt><dd>{confirmation.toolName}</dd></div>
    </dl>
    {presentation.calendar ? <section className="approval-detail__section" aria-labelledby="approval-calendar-heading">
      <h2 id="approval-calendar-heading">Calendar change</h2>
      <dl className="approval-detail__facts approval-detail__facts--compact">
        <div><dt>Operation</dt><dd>{presentation.calendar.operation}</dd></div>
        <div><dt>Calendar</dt><dd>{presentation.calendar.source.label}</dd></div>
        <div><dt>Source</dt><dd>{presentation.calendar.source.authority}</dd></div>
        <div><dt>Scope</dt><dd>{presentation.calendar.scope}</dd></div>
        <div><dt>Notifications</dt><dd>{presentation.calendar.notifications}</dd></div>
      </dl>
      <div className="approval-detail__events">{presentation.calendar.affectedEvents.map((event, index) => <article key={`${event.calendarId}:${event.eventId ?? index}`}>
        <strong>{event.title}</strong>
        {event.fields.map((field, fieldIndex) => <dl key={`${field.name}:${fieldIndex}`}><div><dt>{field.name}</dt><dd>{field.before !== undefined ? <span>Before: {field.before}</span> : null}{field.after !== undefined ? <span>After: {field.after}</span> : null}</dd></div></dl>)}
      </article>)}</div>
    </section> : null}
    {presentation.technical?.length ? <section className="approval-detail__section" aria-labelledby="approval-technical-heading">
      <h2 id="approval-technical-heading">Technical details</h2>
      <dl className="approval-detail__facts approval-detail__facts--compact">{presentation.technical.map((item, index) => <div key={`${item.label}:${index}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </section> : null}
  </div>;
}

export function IntegrationsPage() {
  const providers = useQuery({ queryKey: ["settings", "providers"], queryFn: runtime.providers });
  const browser = useQuery({ queryKey: ["settings", "browser-status"], queryFn: runtime.browserStatus, refetchInterval: 3_000 });
  const browserState = browser.data?.state;
  const browserLive = browserState === "ready" || browserState === "acting";
  const browserWaitingOwner = browserState === "waiting_owner";
  const browserChecking = browser.isLoading || browserState === "connecting";
  const browserUnavailable = browser.isError;
  const browserNeedsRepair = browserState === "degraded" || browserWaitingOwner;
  const browserRow = {
    id: "chrome-browser",
    name: "Personal Chrome",
    description: browserLive
      ? `${browser.data?.profileLabel ?? "Personal profile"} is available when you explicitly ask Kora to use it.`
      : browserWaitingOwner
        ? browser.data?.reason ?? "Chrome is connected and waiting for you to finish the browser handoff."
      : browserNeedsRepair
        ? browser.data?.reason ?? "The browser connection needs repair; existing local data remains available."
        : browserUnavailable
          ? "Kora could not check the browser connection. No connection change is being claimed."
          : browserChecking
            ? "Kora is checking the personal Chrome connection."
            : "Connect the personal Chrome profile you already use.",
    qualification: browserLive && browser.data?.lastConnectedAt
      ? `Last connected ${formatDate(browser.data.lastConnectedAt)}`
      : undefined,
    state: browserLive
      ? "Live"
      : browserWaitingOwner
        ? "Waiting for your browser"
      : browserNeedsRepair
        ? "Repair needed"
        : browserUnavailable
          ? "Unavailable"
          : browserChecking
            ? "Checking"
            : "Not connected",
    group: browserLive ? "Connected" : browserNeedsRepair || browserUnavailable ? "Needs attention" : "Available",
    tone: browserLive ? "success" : browserNeedsRepair || browserUnavailable ? "warning" : "quiet",
    action: browserLive || browserWaitingOwner || browserChecking ? "Open" : browserNeedsRepair || browserUnavailable ? "Review" : "Set up",
    icon: <Globe2 size={15} />,
  } as const;
  const providerRows = providers.data?.providers.map(provider => {
    const observation = providerObservation(provider);
    const availableOperations = provider.availableOperations ?? (observation.kind === "current" ? provider.operations : []);
    return {
      id: provider.id,
      name: providerLabel(provider.id),
      description: observation.kind === "current" ? `${availableOperations.length} operation${availableOperations.length === 1 ? "" : "s"} available through this connection.` : provider.unavailableReason ?? observation.description,
      qualification: observation.kind === "current" || !provider.lastCheckedAt
        ? undefined
        : `Last checked ${formatDate(provider.lastCheckedAt)}`,
      state: observation.label,
      group: observation.kind === "current" ? "Connected" : observation.attention ? "Needs attention" : "Available",
      tone: observation.kind === "current" ? "success" : observation.attention ? "warning" : "quiet",
      action: observation.kind === "current" || observation.kind === "not-checked" ? "Open" : observation.attention ? "Review" : "Set up",
      icon: <Link2 size={15} />,
    } as const;
  }) ?? [];
  const rows = [browserRow, ...providerRows];
  return <SettingsFrame
    title="Accounts & integrations"
    description="Connect the services Kora can use, see what is available now, and repair accounts that need attention."
    width="standard"
  >
    {(["Needs attention", "Connected", "Available"] as const).map(group => {
      const items = rows.filter(row => row.group === group);
      if (!items.length) return null;
      return <SettingsSection
        key={group}
        title={group}
        description={group === "Needs attention"
          ? "Connections whose current observation needs review or repair."
          : group === "Connected"
            ? "Services currently available through Kora’s local runtime."
            : "Services you can inspect or set up when you need them."}
      >
        <div className="k-settings-list">{items.map(row => <SettingsListRow
          key={row.id}
          href={`/settings/integrations/${row.id}`}
          icon={row.icon}
          title={row.name}
          description={row.description}
          qualification={row.qualification}
          state={row.state}
          stateTone={row.tone}
          actionLabel={row.action}
        />)}</div>
      </SettingsSection>;
    })}
    {providers.isLoading ? <SettingsSection title="Service accounts" description="Checking the provider connections available to Kora."><LoadingState label="Checking provider connections" /></SettingsSection> : null}
    {providers.isError ? <SettingsSection title="Service accounts" description="Personal Chrome remains available above when its own connection can be read.">
      <ContentState state="unavailable" announcement="assertive" title="Provider status is unavailable." body="Kora could not read current provider status. This is not a disconnected-account result. No account or local data changed." action={<Button onClick={() => void providers.refetch()}>Try again</Button>} />
    </SettingsSection> : null}
  </SettingsFrame>;
}

export function IntegrationDetailPage() {
  const { integrationId = "" } = useParams();
  if (integrationId === "chrome-browser") return <ChromeBrowserIntegrationPage />;
  return <IntegrationAccountPage
    key={integrationId}
    integrationId={integrationId}
    renderAuth={supportsIntegrationOAuth(integrationId) ? ({ provider, disabled, onBusyChange }) => <IntegrationOAuthControl
      key={provider.id}
      providerId={provider.id}
      connected={provider.connectionState === "connected" || provider.connected === true}
      configured={provider.configured}
      disabled={disabled}
      onBusyChange={onBusyChange}
    /> : undefined}
  />;
}

function ChromeBrowserIntegrationPage() {
  const queryClient = useQueryClient();
  const browser = useQuery({
    queryKey: ["settings", "browser-status"],
    queryFn: runtime.browserStatus,
    refetchInterval: 2_000,
  });
  const credentials = useQuery({
    queryKey: ["settings", "browser-credentials"],
    queryFn: runtime.browserCredentials,
  });
  const host = useQuery({
    queryKey: ["settings", "browser-host"],
    queryFn: desktopHost.browserExtensionStatus,
    enabled: hasDesktopHost,
  });
  const registration = useMutation({
    mutationFn: desktopHost.setBrowserExtensionEnabled,
    onSuccess: () => host.refetch(),
  });
  const copyPath = useMutation({ mutationFn: (path: string) => copyText(path) });
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | undefined>();
  const removeCredential = useMutation({
    mutationFn: runtime.deleteBrowserCredential,
    onSuccess: () => {
      setConfirmingRemoval(undefined);
      return queryClient.invalidateQueries({ queryKey: ["settings", "browser-credentials"] });
    },
  });
  const [adding, setAdding] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [credentialDirty, setCredentialDirty] = useState(false);
  const [credentialPending, setCredentialPending] = useState(false);
  const [confirmCredentialDiscard, setConfirmCredentialDiscard] = useState(false);
  const credentialTriggerRef = useRef<HTMLButtonElement>(null);
  const keepCredentialRef = useRef<HTMLButtonElement>(null);
  const connected = browser.data?.state === "ready" || browser.data?.state === "acting";
  const browserState = browser.isLoading ? "loading" : browser.isError ? "error" : browser.data?.state ?? "disconnected";
  const browserStatusLabel = browserState === "loading" ? "Loading" : browserState === "error" ? "Error" : browserState === "connecting" ? "Connecting" : browserState === "waiting_owner" ? "Waiting for owner" : browserState === "degraded" ? "Degraded" : browserState === "disconnected" ? "Disconnected" : "Live";
  const browserStatusTone = connected ? "ready" : browserState === "disconnected" || browserState === "loading" || browserState === "connecting" ? "quiet" : "attention";
  const connectionLabel = connected
    ? browser.data?.profileLabel ?? "Personal Chrome profile"
    : browserState === "waiting_owner"
      ? browser.data?.reason ?? "Chrome is connected and waiting for you to finish the browser handoff."
      : browserState === "connecting"
        ? browser.data?.reason ?? "Kora is connecting to the personal Chrome profile."
        : browserState === "degraded"
          ? browser.data?.reason ?? "The browser connection needs repair; existing local data remains available."
          : browser.data?.reason ?? "Open Chrome with the Kora extension enabled to connect.";
  return <SettingsPage compact title="Personal Chrome" description="Give Kora direct control of the Chrome profile you already use—its tabs, signed-in sites, downloads, and ordinary browsing state." breadcrumb={<Link className="settings-back-link" to="/settings/integrations">Accounts & integrations</Link>} status={<StatusPill state={browserStatusTone}>{browserStatusLabel}</StatusPill>}>
    <Section title="Live connection" description="The extension connects to Kora on this computer. Nothing is relayed through a browser cloud service.">
      {browser.isLoading ? <div className="browser-connection browser-connection--loading" role="status" aria-label="Checking Chrome">
        <div className="browser-connection__pulse" data-state="loading"><LoaderCircle className="spin" size={20} /></div>
        <div><strong>Checking Chrome</strong><p>Reading the current local extension connection.</p></div>
        <Button disabled>Check again</Button>
      </div> : browser.isError ? <ErrorState title="Chrome connection could not be checked." error={browser.error} onRetry={() => browser.refetch()} /> :
        browser.data?.state === "connecting" ? <div className="browser-connection" role="status" aria-label="Connecting to Chrome">
          <div className="browser-connection__pulse" data-state="connecting"><LoaderCircle className="spin" size={20} /></div>
          <div><strong>Connecting to Chrome</strong><p>{connectionLabel}</p></div>
          <Button onClick={() => browser.refetch()}>Check again</Button>
        </div> : browser.data?.state === "waiting_owner" ? <div className="browser-connection" role="status" aria-label="Waiting for browser owner">
          <div className="browser-connection__pulse" data-state="waiting_owner"><Globe2 size={20} /></div>
          <div><strong>Waiting for your browser</strong><p>{connectionLabel}</p></div>
          <Button onClick={() => browser.refetch()}>Check again</Button>
        </div> : browser.data?.state === "degraded" ? <div className="browser-connection" role="status" aria-label="Chrome connection degraded">
          <div className="browser-connection__pulse" data-state="degraded"><CircleAlert size={20} /></div>
          <div><strong>Chrome connection needs repair</strong><p>{connectionLabel}</p></div>
          <Button onClick={() => browser.refetch()}>Check again</Button>
        </div> :
        <div className="browser-connection">
          <div className="browser-connection__pulse" data-state={connected ? "live" : "disconnected"}><Globe2 size={20} /></div>
          <div><strong>{connected ? connectionLabel : "Chrome is disconnected"}</strong><p>{connected ? `Extension ${browser.data?.extensionVersion ?? "connected"} · ready for this profile` : "Kora remains available; only browser control is paused."}</p></div>
          <Button onClick={() => browser.refetch()}>Check again</Button>
        </div>}
    </Section>
    <Section title="Desktop bridge" description="Register Kora’s signed local messaging host once, then load the bundled extension in Chrome.">
      {!hasDesktopHost ? <div className="settings-callout"><CircleAlert size={18} /><div><strong>Open the Kora desktop app</strong><p>Desktop connection setup is available only in the installed Windows app.</p></div></div> :
        host.isLoading ? <LoadingState label="Checking desktop bridge" /> : host.isError ? <ErrorState error={host.error} onRetry={() => host.refetch()} /> :
          <div className="browser-bridge">
            <div className="browser-bridge__state">
              <StatusPill state={host.data?.registered ? "ready" : "attention"}>{host.data?.registered ? "Registered" : "Not registered"}</StatusPill>
              <span>{host.data?.registered ? "Chrome can reach Kora on this computer." : host.data?.reason ?? "The desktop connection needs setup."}</span>
            </div>
            {host.data?.extensionPath && <div className="browser-extension-path"><span>Unpacked extension folder</span><code>{host.data.extensionPath}</code><Button onClick={() => copyPath.mutate(host.data!.extensionPath!)} disabled={copyPath.isPending}>{copyPath.isPending ? "Copying…" : "Copy path"}</Button>{copyPath.isSuccess && <p className="settings-success" role="status">Extension path copied.</p>}{copyPath.isError && <ErrorState title="Extension path could not be copied." error={copyPath.error} onRetry={() => host.data?.extensionPath && copyPath.mutate(host.data.extensionPath)} />}</div>}
            <div className="browser-bridge__actions">
              <Button disabled={registration.isPending} onClick={() => registration.mutate(!host.data?.registered)}>
                {registration.isPending ? <LoaderCircle className="spin" size={14} /> : host.data?.registered ? <X size={14} /> : <Check size={14} />}
                {host.data?.registered ? "Remove bridge" : "Enable bridge"}
              </Button>
              <p>In Chrome, open <strong>chrome://extensions</strong>, enable Developer mode, choose “Load unpacked,” and select the folder above.</p>
            </div>
            {registration.isError && <ErrorState title="The desktop bridge was not changed." error={registration.error} onRetry={() => registration.variables !== undefined && registration.mutate(registration.variables)} />}
          </div>}
    </Section>
    <Section title="Protected sign-ins" description="Save a password with Windows protection, or hand Kora a one-time secret. Kora’s model sees only the label and website—not the secret.">
      <div className="browser-credentials">
        <div className="browser-credentials__toolbar">
          <span>{credentials.data?.credentials.length ?? 0} available</span>
          <Button ref={credentialTriggerRef} disabled={credentials.isLoading || credentials.isError || credentialPending} onClick={() => {
            if (adding) {
              if (credentialDirty) setConfirmCredentialDiscard(true);
              else setAdding(false);
              return;
            }
            if (!credentials.data?.protectedStorageAvailable) setOneTime(true);
            setAdding(true);
          }}>
            {adding ? <X size={14} /> : <Plus size={14} />}{adding ? "Cancel" : "Add sign-in"}
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {adding && <motion.div className="browser-credential-editor" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: DUR.base, ease: EASE.out }}>
            <BrowserCredentialEditor
              oneTime={oneTime}
              onOneTime={setOneTime}
              protectedStorageAvailable={Boolean(credentials.data?.protectedStorageAvailable)}
              onDirtyChange={setCredentialDirty}
              onPendingChange={setCredentialPending}
              onDiscard={() => {
                setCredentialDirty(false);
                setAdding(false);
              }}
              onSaved={() => {
                setCredentialDirty(false);
                setAdding(false);
                void queryClient.invalidateQueries({ queryKey: ["settings", "browser-credentials"] });
              }}
            />
          </motion.div>}
        </AnimatePresence>
        <div className="browser-credentials__results">
          {credentials.isLoading ? <LoadingState label="Reading protected sign-ins" /> : credentials.isError ? <ErrorState error={credentials.error} onRetry={() => credentials.refetch()} /> :
            credentials.data?.credentials.length ? <div className="settings-ledger">
              {credentials.data.credentials.map(credential => <div className="settings-row" key={credential.id}>
                <div><span className="settings-row__mark"><KeyRound size={15} /></span><span><strong>{credential.label}</strong><small>{credential.usernameLabel ? `${credential.usernameLabel} · ` : ""}{credential.normalizedOrigin}{credential.oneTime ? " · one time" : ""}</small></span></div>
                <div className="settings-row__actions">{confirmingRemoval === credential.id
                  ? <>
                      <Button tone="ghost" disabled={removeCredential.isPending} onClick={() => setConfirmingRemoval(undefined)}>Keep</Button>
                      <Button tone="primary" disabled={removeCredential.isPending} onClick={() => removeCredential.mutate(credential.id)}>Remove permanently</Button>
                    </>
                  : <Pressable aria-label={`Remove ${credential.label}`} disabled={removeCredential.isPending} onClick={() => setConfirmingRemoval(credential.id)}><Trash2 size={14} /></Pressable>}</div>
              </div>)}
            </div> : <EmptyState title="No protected sign-ins" body="Kora can still let you take over for sign-in. Add one only when you want her to fill it for you." />}
         </div>
         {removeCredential.isPending && <p className="settings-prose" role="status">Removing protected sign-in…</p>}
         {removeCredential.isError && <ErrorState title="Protected sign-in was not removed." error={removeCredential.error} onRetry={() => removeCredential.variables && removeCredential.mutate(removeCredential.variables)} />}
       </div>
    </Section>
    <Modal
      open={confirmCredentialDiscard}
      onOpenChange={setConfirmCredentialDiscard}
      title="Discard this sign-in draft?"
      description="The website, username hint, and private secret in this editor have not been saved."
      purpose="confirm"
      initialFocus={keepCredentialRef}
      finalFocus={credentialTriggerRef}
       actions={<><Button ref={keepCredentialRef} onClick={() => setConfirmCredentialDiscard(false)} disabled={credentialPending}>Keep editing</Button><Button tone="danger" onClick={() => { setConfirmCredentialDiscard(false); setCredentialDirty(false); setAdding(false); }} disabled={credentialPending}>Discard draft</Button></>}
    ><p className="settings-prose">Discarding closes the editor. Kora will not store or use any of these values.</p></Modal>
    <div className="settings-callout"><ShieldCheck size={18} /><div><strong>You stay in control</strong><p>Pause the extension from Chrome at any time. Consequential clicks still use Kora’s normal approval boundary.</p></div></div>
  </SettingsPage>;
}

type BrowserCredentialDraft = { label: string; origin: string; username: string; secret: string };
const emptyBrowserCredentialDraft: BrowserCredentialDraft = { label: "", origin: "", username: "", secret: "" };

function BrowserCredentialEditor({ oneTime, onOneTime, protectedStorageAvailable, onDirtyChange, onPendingChange, onDiscard, onSaved }: {
  oneTime: boolean;
  onOneTime: (value: boolean) => void;
  protectedStorageAvailable: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<BrowserCredentialDraft>(emptyBrowserCredentialDraft);
  const initialOneTime = useRef(oneTime);
  const dirty = oneTime !== initialOneTime.current || Object.values(draft).some(value => value.length > 0);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const draftGuard = useDirtyDraftGuard({
    id: "settings:browser-credential",
    label: "Protected sign-in draft",
    dirty,
    onDiscard: () => {
      setDraft(emptyBrowserCredentialDraft);
      onOneTime(initialOneTime.current);
      onDiscard();
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const input = {
        label: draft.label,
        origin: draft.origin,
        usernameLabel: draft.username || undefined,
        secret: draft.secret,
      };
      return oneTime ? runtime.createOneTimeBrowserCredential(input) : runtime.createBrowserCredential(input);
    },
    onSuccess: () => {
      draftGuard.release();
      setDraft(emptyBrowserCredentialDraft);
      onPendingChange(false);
      onSaved();
    },
    onError: value => {
      onPendingChange(false);
      setError(value instanceof Error ? value.message : "Kora could not protect this sign-in.");
    },
  });
  useEffect(() => {
    onPendingChange(save.isPending);
    return () => onPendingChange(false);
  }, [onPendingChange, save.isPending]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    setError(undefined);
    save.mutate();
  };
  const updateDraft = (changes: Partial<BrowserCredentialDraft>) => {
    if (save.isPending) return;
    save.reset();
    setError(undefined);
    setDraft(current => ({ ...current, ...changes }));
  };
  return <form className="settings-form browser-credential-form" onSubmit={submit}>
    <div className="browser-credential-mode" aria-label="Credential lifetime">
       <Pressable aria-pressed={!oneTime} disabled={!protectedStorageAvailable || save.isPending} onClick={() => { save.reset(); setError(undefined); onOneTime(false); }}>Save with Windows</Pressable>
       <Pressable aria-pressed={oneTime} disabled={save.isPending} onClick={() => { save.reset(); setError(undefined); onOneTime(true); }}>Use once</Pressable>
    </div>
    <div className="settings-form__split">
       <label><span>Label</span><Input disabled={save.isPending} name="label" value={draft.label} onChange={event => updateDraft({ label: event.target.value })} required={!oneTime} placeholder={oneTime ? "One-time sign-in" : "Main account"} autoComplete="off" /></label>
       <label><span>Website</span><Input disabled={save.isPending} name="origin" value={draft.origin} onChange={event => updateDraft({ origin: event.target.value })} required type="url" placeholder="https://example.com" autoComplete="url" /></label>
    </div>
     <label><span>Username hint</span><Input disabled={save.isPending} name="username" value={draft.username} onChange={event => updateDraft({ username: event.target.value })} placeholder="you@example.com" autoComplete="username" /><small>Kora may see this label. It is not treated as a secret.</small></label>
     <label><span>Password or secret</span><Input disabled={save.isPending} name="secret" value={draft.secret} onChange={event => updateDraft({ secret: event.target.value })} required type="password" placeholder="Enter privately" autoComplete="new-password" /><small>This value never enters conversation history or a model tool argument.</small></label>
    {error && <ContentState state="error" announcement="assertive" title="Couldn’t add sign-in" body={error} />}
    <div className="settings-form__actions"><Button type="submit" loading={save.isPending}>{!save.isPending && <ShieldCheck size={14} />}{oneTime ? "Hand to Kora once" : "Protect sign-in"}</Button></div>
  </form>;
}

const OAUTH_INTEGRATIONS = new Set(["google-workspace", "github", "spotify"]);
const supportsIntegrationOAuth = (providerId: string) => OAUTH_INTEGRATIONS.has(providerId);
type ProviderObservation = {
  kind: "current" | "connected-degraded" | "not-checked" | "access-denied" | "credentials-expired" | "unavailable" | "not-connected" | "not-configured";
  label: string;
  description: string;
  attention: boolean;
};

/**
 * Project provider state without inferring a live connection from configuration
 * or a nominal health enum. `connected` is the canonical observation; health
 * only qualifies that explicit observation.
 */
const providerObservation = (provider: NativeProvider): ProviderObservation => {
  if (provider.connectionState === "connected") {
    return provider.health === "available"
      ? { kind: "current", label: "Connected · current", description: "The provider currently reports this connection as available.", attention: false }
      : { kind: "connected-degraded", label: "Connected · needs attention", description: provider.problem?.message ?? provider.unavailableReason ?? "The account remains connected, but its current provider health needs attention.", attention: true };
  }
  if (provider.connectionState === "needs_attention") {
    return { kind: "connected-degraded", label: "Needs attention", description: provider.problem?.message ?? provider.unavailableReason ?? "The provider returned a connection observation that needs review.", attention: true };
  }
  if (provider.connectionState === "unchecked") {
    return { kind: "not-checked", label: "Not checked", description: "Kora has configuration for this provider, but no current connection observation in this runtime.", attention: false };
  }
  if (provider.connectionState === "not_configured") {
    return { kind: "not-configured", label: "Not configured", description: "No provider account has been configured.", attention: false };
  }
  if (provider.connected === true && provider.health === "available") {
    return { kind: "current", label: "Connected · current", description: "The provider currently reports this connection as available.", attention: false };
  }
  if (provider.connected === true) {
    return { kind: "connected-degraded", label: "Connected · needs attention", description: "The account remains connected, but its current provider health needs attention.", attention: true };
  }
  if (provider.accessState === "denied") {
    return { kind: "access-denied", label: "Not authorized", description: "The provider denied access. Reauthorize this account before Kora can use it.", attention: true };
  }
  if (provider.accessState === "expired") {
    return { kind: "credentials-expired", label: "Credentials expired", description: "The provider credentials expired. Reauthorize this account before Kora can use it.", attention: true };
  }
  if (provider.accessState === "not_configured") {
    return { kind: "not-configured", label: "Not configured", description: "No provider account has been configured.", attention: false };
  }
  if (provider.configured && !provider.lastCheckedAt) {
    return { kind: "not-checked", label: "Not checked", description: "Kora has configuration for this provider, but no current connection observation in this runtime.", attention: false };
  }
  if (provider.health === "degraded") {
    return { kind: "connected-degraded", label: "Needs attention", description: "The provider returned a degraded observation that needs review.", attention: true };
  }
  if (provider.connected === false && provider.accessState !== "unknown") {
    return { kind: "not-connected", label: "Not connected", description: "The provider was checked and no current account connection was confirmed.", attention: false };
  }
  if (provider.health === "unavailable") {
    return { kind: "unavailable", label: "Unavailable", description: "Provider status could not be read. This is not a disconnected-account result, and local data remains unchanged.", attention: true };
  }
  if (provider.configured || provider.connected === false) {
    return { kind: "not-connected", label: "Not connected", description: "The provider was checked and no current account connection was confirmed.", attention: false };
  }
  return { kind: "not-configured", label: "Not configured", description: "No provider account has been configured.", attention: false };
};

type IntegrationAuthEvent = NativeAuthInteractionEvent | {
  type: "unconfirmed";
  message: string;
};

function IntegrationOAuthControl({ providerId, connected, configured = connected, disabled = false, onBusyChange }: {
  providerId: string;
  connected: boolean;
  configured?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [interactionId, setInteractionId] = useState<string>();
  const [event, setEvent] = useState<IntegrationAuthEvent>();
  const [starting, setStarting] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState<string>();
  const [promptUncertain, setPromptUncertain] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const [openError, setOpenError] = useState<string>();
  const [signInUrl, setSignInUrl] = useState<string>();
  const openedUrl = useRef<string | undefined>(undefined);
  const currentPrompt = useRef<Extract<NativeAuthInteractionEvent, { type: "prompt" }> | undefined>(undefined);
  const promptValueRef = useRef("");
  const promptSubmittingRef = useRef(false);
  const cancelPendingRef = useRef(false);
  const generationRef = useRef(0);
  const uncertainObservationDelayRef = useRef(1000);
  useEffect(() => () => { promptValueRef.current = ""; }, []);

  const openSignIn = (url: string) => {
    setOpenError(undefined);
    if (!hasDesktopHost) {
      try {
        if (!window.open(url, "_blank", "noopener,noreferrer")) setOpenError("If sign-in did not open, use Open sign-in page to try again.");
      } catch (error) {
        setOpenError(error instanceof Error ? error.message : "Kora could not open the sign-in page.");
      }
      return;
    }
    void desktopHost.openExternalUrl(url).catch(error => {
      setOpenError(error instanceof Error ? error.message : "Kora could not open the sign-in page.");
    });
  };

  useEffect(() => {
    if (!interactionId) return;
    const generation = ++generationRef.current;
    let active = true;
    let timer: number | undefined;
    const observeAgain = () => {
      const delay = uncertainObservationDelayRef.current;
      uncertainObservationDelayRef.current = Math.min(4000, delay * 2);
      timer = window.setTimeout(() => {
        if (active) setPollRevision(value => value + 1);
      }, delay);
    };
    const read = async () => {
      while (active) {
        try {
          const next = await runtime.nextIntegrationAuth(interactionId);
          if (!active || generation !== generationRef.current) return;
          if (next.type === "prompt") {
            const samePrompt = currentPrompt.current?.promptId === next.promptId;
            if (!samePrompt) {
              uncertainObservationDelayRef.current = 1000;
              currentPrompt.current = next;
              promptValueRef.current = "";
              setPromptValue("");
              setPromptError(undefined);
              setPromptUncertain(false);
            }
            setEvent(next);
            if (samePrompt && promptUncertain) observeAgain();
            return;
          }
          if (next.type === "waiting" && promptUncertain && currentPrompt.current) {
            setEvent(currentPrompt.current);
            observeAgain();
            return;
          }
          setEvent(next);
          if (next.type === "auth_url" && openedUrl.current !== next.url) {
            setSignInUrl(next.url);
            openedUrl.current = next.url;
            openSignIn(next.url);
          }
          if (next.type === "device_code" && openedUrl.current !== next.verificationUri) {
            setSignInUrl(next.verificationUri);
            openedUrl.current = next.verificationUri;
            openSignIn(next.verificationUri);
          }
          if (["complete", "failed", "expired", "cancelled"].includes(next.type)) {
            uncertainObservationDelayRef.current = 1000;
            if (next.type === "complete" || next.type === "cancelled") setOpenError(undefined);
            setInteractionId(undefined);
            currentPrompt.current = undefined;
            promptValueRef.current = "";
            setPromptValue("");
            setPromptError(undefined);
            setPromptUncertain(false);
            cancelPendingRef.current = false;
            setCancelPending(false);
            if (next.type === "complete") {
              setEvent({ type: "progress", message: "Sign-in finished. Confirming current provider status…" });
              try {
                await queryClient.invalidateQueries({ queryKey: ["settings", "providers"], refetchType: "none" });
                const refreshed = await queryClient.fetchQuery({ queryKey: ["settings", "providers"], queryFn: runtime.providers, staleTime: 0 });
                const canonical = refreshed.providers.find(provider => provider.id === providerId);
                if (canonical && providerObservation(canonical).kind === "current") {
                  setEvent(next);
                } else {
                  const observation = canonical ? providerObservation(canonical) : undefined;
                  setEvent({
                    type: "unconfirmed",
                    message: canonical?.unavailableReason ?? observation?.description ?? "The provider did not return a current connection after sign-in.",
                  });
                }
              } catch {
                setEvent({ type: "unconfirmed", message: "Kora could not refresh provider status. No connection change is being claimed." });
              }
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["settings", "capabilities"] }),
                queryClient.invalidateQueries({ queryKey: ["settings", "overview"] }),
              ]);
            }
            return;
          }
        } catch (error) {
          if (!active || generation !== generationRef.current) return;
          const message = error instanceof Error ? error.message : "The connection could not continue.";
          if (promptUncertain && currentPrompt.current) {
            setEvent(currentPrompt.current);
            setPromptError(`Kora could not observe the existing sign-in. Retry observation or cancel it before starting over. (${message})`);
          } else {
            setEvent({ type: "failed", message });
          }
          return;
        }
      }
    };
    void read();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [interactionId, pollRevision, providerId, queryClient]);

  const begin = async () => {
    if (disabled || starting || interactionId || cancelPendingRef.current) return;
    setStarting(true);
    currentPrompt.current = undefined;
    promptValueRef.current = "";
    setPromptValue("");
    setPromptError(undefined);
    setPromptUncertain(false);
    openedUrl.current = undefined;
    setOpenError(undefined);
    setSignInUrl(undefined);
    setEvent({ type: "progress", message: `Starting ${humanize(providerId)} sign-in…` });
    try {
      const interaction = await runtime.startIntegrationAuth(providerId);
      setInteractionId(interaction.id);
    } catch (error) {
      setEvent({ type: "failed", message: error instanceof Error ? error.message : "Kora could not start sign-in." });
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!interactionId || cancelPendingRef.current) return;
    cancelPendingRef.current = true;
    setCancelPending(true);
    generationRef.current += 1;
    setOpenError(undefined);
    setEvent({ type: "progress", message: "Cancelling secure sign-in…" });
    try {
      await runtime.cancelIntegrationAuth(interactionId);
      setPollRevision(value => value + 1);
    } catch (error) {
      setEvent({ type: "failed", message: error instanceof Error ? error.message : "The connection could not be cancelled." });
    } finally {
      cancelPendingRef.current = false;
      setCancelPending(false);
    }
  };

  const answerPrompt = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!interactionId || event?.type !== "prompt" || !promptValue.trim() || promptSubmittingRef.current || promptUncertain || cancelPendingRef.current) return;
    const prompt = event;
    promptSubmittingRef.current = true;
    setPromptSubmitting(true);
    setPromptError(undefined);
    try {
      await runtime.respondIntegrationAuth(interactionId, prompt.promptId, promptValue.trim());
      promptValueRef.current = "";
      currentPrompt.current = undefined;
      setPromptValue("");
      setPromptUncertain(false);
      uncertainObservationDelayRef.current = 1000;
      setEvent({ type: "progress", message: "Continuing secure sign-in…" });
      setPollRevision(value => value + 1);
    } catch (error) {
      setPromptUncertain(true);
      setPromptError(error instanceof Error
        ? `Kora could not confirm this response. It is still observing the existing sign-in; cancel before trying a new response. (${error.message})`
        : "Kora could not confirm this response. It is still observing the existing sign-in; cancel before trying a new response.");
      setPollRevision(value => value + 1);
    } finally {
      promptSubmittingRef.current = false;
      setPromptSubmitting(false);
    }
  };

  const busy = starting || Boolean(interactionId);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const retryObservation = () => {
    if (!interactionId || cancelPendingRef.current) return;
    setEvent(currentPrompt.current ?? { type: "progress", message: "Checking secure sign-in status…" });
    setPollRevision(value => value + 1);
  };
  const exchanging = starting || event?.type === "progress";
  const busyLabel = event?.type === "prompt"
    ? "Waiting for your response"
    : event?.type === "auth_url" || event?.type === "device_code"
      ? "Waiting for sign-in"
      : "Connecting…";
  return <div className="settings-oauth">
    <Button
      tone={configured ? "secondary" : "primary"}
      aria-busy={exchanging || undefined}
      aria-disabled={disabled || busy || undefined}
      disabled={disabled || busy}
      onClick={() => { if (!disabled && !busy) void begin(); }}
    >
      {busy && (exchanging ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />)}
      {busy ? busyLabel : configured ? "Reconnect account" : "Connect account"}
    </Button>
    <AuthInteractionPanel
      event={event}
      busy={busy}
      cancelPending={cancelPending}
      openError={openError}
      promptError={promptError}
      promptUncertain={promptUncertain}
      promptSubmitting={promptSubmitting}
      onRetry={retryObservation}
      signInUrl={signInUrl}
      promptValue={promptValue}
      onPromptValue={value => { promptValueRef.current = value; setPromptValue(value); }}
      onOpen={openSignIn}
      onSubmit={answerPrompt}
      onCancel={() => void cancel()}
    />
  </div>;
}

function AuthInteractionPanel({ event, busy, cancelPending, openError, promptError, promptUncertain, promptSubmitting, onRetry, signInUrl, promptValue, onPromptValue, onOpen, onSubmit, onCancel }: {
  event?: IntegrationAuthEvent;
  busy: boolean;
  cancelPending: boolean;
  openError?: string;
  promptError?: string;
  promptUncertain: boolean;
  promptSubmitting: boolean;
  onRetry: () => void;
  signInUrl?: string;
  promptValue: string;
  onPromptValue: (value: string) => void;
  onOpen: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return <AnimatePresence initial={false}>
    {event && <motion.div
      className={`settings-oauth__status settings-oauth__status--${event.type}`}
      role={event.type === "failed" || event.type === "expired" || event.type === "unconfirmed" ? "alert" : "status"}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      <span className="settings-oauth__signal">{event.type === "complete" ? <Check size={15} /> : event.type === "failed" || event.type === "expired" || event.type === "unconfirmed" ? <CircleAlert size={15} /> : event.type === "progress" ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}</span>
      <div>
        <strong>{oauthEventTitle(event)}</strong>
        {event.type === "auth_url" && <Button tone="link" className="settings-auth-link" type="button" onClick={() => onOpen(event.url)}><ExternalLink size={13} />Open sign-in again</Button>}
        {event.type === "device_code" && <div className="settings-auth-device">
          <p>Enter this one-time code on the provider’s secure sign-in page.</p>
          <div className="settings-auth-device__code"><code>{event.userCode}</code><Button type="button" onClick={() => void copyText(event.userCode)}>Copy code</Button></div>
          {event.expiresInSeconds ? <small>Expires in about {Math.max(1, Math.ceil(event.expiresInSeconds / 60))} minute{event.expiresInSeconds > 60 ? "s" : ""}. Restart sign-in if the provider says it expired.</small> : null}
          <Button tone="link" className="settings-auth-link" type="button" onClick={() => onOpen(event.verificationUri)}><ExternalLink size={13} />Open sign-in page</Button>
        </div>}
        {event.type === "prompt" && <>
          {signInUrl && <Button tone="link" className="settings-auth-link" type="button" onClick={() => onOpen(signInUrl)}><ExternalLink size={13} />Open sign-in page</Button>}
          <form onSubmit={onSubmit}>{event.prompt.type === "select" ? <KoraSelect label={event.prompt.message} value={promptValue} disabled={promptSubmitting || promptUncertain} onValueChange={onPromptValue} options={event.prompt.options.map(option => ({ value: option.id, label: option.label, description: option.description }))} /> : <Input autoFocus disabled={promptSubmitting || promptUncertain} type={event.prompt.type === "secret" ? "password" : "text"} autoComplete="off" value={promptValue} onChange={change => onPromptValue(change.target.value)} placeholder={event.prompt.placeholder ?? "Enter value"} aria-label={event.prompt.message} />}<Button tone="secondary" type="submit" disabled={!promptValue.trim() || promptSubmitting || promptUncertain}>{promptSubmitting ? "Sending…" : promptUncertain ? "Waiting for acknowledgement" : "Continue"}</Button></form>
          {promptError && <><p className="settings-auth-error" role="alert">{promptError}</p><Button tone="link" type="button" onClick={onRetry} disabled={cancelPending}>Retry observation</Button></>}
        </>}
        {event.type === "failed" || event.type === "expired" || event.type === "unconfirmed" ? <><p>{event.message}</p>{event.type === "failed" && busy && <Button tone="link" type="button" onClick={onRetry} disabled={cancelPending}>Retry observation</Button>}</> : null}
        {event.type === "cancelled" ? <p>No credentials or connection state were changed.</p> : null}
        {openError && <p className="settings-auth-error">{openError}</p>}
      </div>
      {busy && <Button tone="ghost" className="settings-auth-cancel" type="button" onClick={onCancel} disabled={cancelPending || promptSubmitting}>{cancelPending ? "Cancelling…" : "Cancel"}</Button>}
    </motion.div>}
  </AnimatePresence>;
}

function oauthEventTitle(event: IntegrationAuthEvent) {
  if (event.type === "progress") return event.message;
  if (event.type === "auth_url") return event.instructions ?? "Finish sign-in in your browser.";
  if (event.type === "device_code") return "Finish sign-in with this device code.";
  if (event.type === "prompt") return event.prompt.message;
  if (event.type === "complete") return "Connection confirmed.";
  if (event.type === "unconfirmed") return "Sign-in finished. Connection not confirmed.";
  if (event.type === "failed") return "Connection failed.";
  if (event.type === "expired") return "Sign-in expired.";
  if (event.type === "cancelled") return "Connection cancelled.";
  return "Waiting for the provider…";
}

export function ModelSettingsPage() {
  const client = useQueryClient();
  const bootstrap = useQuery({ queryKey: ["settings", "bootstrap"], queryFn: () => runtime.bootstrap() });
  const models = useQuery({ queryKey: ["settings", "models"], queryFn: runtime.models });
  const [selection, setSelection] = useState<{ provider: string; model: string; reasoning: NativeThinkingLevel } | null>(null);
  const [selectionDirty, setSelectionDirty] = useState(false);
  useEffect(() => {
    if (!bootstrap.data || selectionDirty) return;
    setSelection({ provider: bootstrap.data.model.provider, model: bootstrap.data.model.model, reasoning: bootstrap.data.model.reasoning as NativeThinkingLevel });
  }, [bootstrap.data?.model.model, bootstrap.data?.model.provider, bootstrap.data?.model.reasoning, selectionDirty]);
  const selectionGuard = useDirtyDraftGuard({
    id: "settings:model-selection",
    label: "Model selection",
    dirty: selectionDirty,
    onDiscard: () => {
      if (bootstrap.data) setSelection({ provider: bootstrap.data.model.provider, model: bootstrap.data.model.model, reasoning: bootstrap.data.model.reasoning as NativeThinkingLevel });
      setSelectionDirty(false);
    },
  });
  const save = useMutation({
    mutationFn: (value: NonNullable<typeof selection>) => runtime.selectModel(value),
    onSuccess: model => {
      selectionGuard.release();
      setSelectionDirty(false);
      setSelection({ provider: model.provider, model: model.model, reasoning: model.reasoning as NativeThinkingLevel });
      client.setQueryData(["settings", "bootstrap"], (current: Awaited<ReturnType<typeof runtime.bootstrap>> | undefined) => current ? { ...current, model } : current);
    },
  });
  if (bootstrap.isLoading || models.isLoading) return <SettingsPage title="Model & reasoning" description="Loading your selected provider and model choices."><LoadingState label="Loading model catalog" /></SettingsPage>;
  if (bootstrap.isError || models.isError) return <SettingsPage title="Model & reasoning" description="Choose the active model and how much reasoning Kora uses for new work."><ErrorState title="Model settings couldn’t load." error={bootstrap.error ?? models.error} onRetry={() => void Promise.all([bootstrap.refetch(), models.refetch()])} /></SettingsPage>;
  if (!selection) return <SettingsPage title="Model & reasoning" description="Loading your selected provider and model choices."><LoadingState label="Loading model catalog" /></SettingsPage>;
  const provider = models.data?.providers.find(p => p.id === selection.provider);
  const model = provider?.models.find(m => m.id === selection.model);
  const additionalProviders = models.data!.providers.filter(p => p.id !== selection.provider).sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  const updateSelection = (next: NonNullable<typeof selection>) => {
    if (save.isPending) return;
    save.reset();
    setSelectionDirty(true);
    setSelection(next);
  };
  return <SettingsPage title="Model & reasoning" description="Choose the active model and how much reasoning Kora uses for new work.">
    <Section title="Selected provider" description={provider?.configured ? "This provider is ready for model selection." : "Set up this provider before choosing one of its models."}>
      <div className="settings-model-provider-lead">
        <div><Bot size={18} aria-hidden="true" /><span><strong>{provider?.name ?? humanize(selection.provider)}</strong><small>{provider?.configured ? `${provider.models.length} model${provider.models.length === 1 ? "" : "s"} available` : "Sign-in required"}</small></span></div>
        <Link className="button button--secondary" to={`/settings/model/providers/${selection.provider}`}>{provider?.configured ? "Manage sign-in" : "Set up provider"}</Link>
      </div>
    </Section>
    <Section title="Current selection"><div className="settings-model-grid">
      <label><span>Provider</span><KoraSelect label="Model provider" value={selection.provider} disabled={save.isPending} onValueChange={providerId => { const next = models.data!.providers.find(p => p.id === providerId)!; updateSelection({ provider: providerId, model: next.models[0]?.id ?? "", reasoning: next.models[0]?.reasoning[0] ?? "low" }); }} options={models.data!.providers.map(p => ({ value: p.id, label: p.name, description: p.configured ? "Configured" : "Authentication needed" }))} /></label>
      <label><span>Model</span><KoraSelect label="Model" value={selection.model} disabled={save.isPending} onValueChange={modelId => { const next = provider?.models.find(m => m.id === modelId); updateSelection({ ...selection, model: modelId, reasoning: next?.reasoning.includes(selection.reasoning) ? selection.reasoning : next?.reasoning[0] ?? "low" }); }} options={(provider?.models ?? []).map(m => ({ value: m.id, label: m.name }))} /></label>
      <label><span>Reasoning</span><KoraSelect label="Reasoning level" value={selection.reasoning} disabled={save.isPending} onValueChange={reasoning => updateSelection({ ...selection, reasoning: reasoning as NativeThinkingLevel })} options={(model?.reasoning ?? []).map(value => ({ value, label: humanize(value) }))} /></label>
      <Button className="settings-model-apply" tone="primary" loading={save.isPending} disabled={save.isPending || !selectionDirty || !selection.model} onClick={() => save.mutate(selection)}>Save selection</Button>
    </div>
    <div className="settings-model-save" aria-live="polite">
      {save.isPending && <p role="status">Saving this model selection…</p>}
      {save.isSuccess && <p className="settings-success" role="status"><Check size={14} /> Model selection saved</p>}
      {save.isError && <ContentState state="error" announcement="assertive" title="Model selection was not saved" body="Your choices remain in this form. Kora continues using the previous model." action={<Button onClick={() => save.mutate(selection)}>Try again</Button>} />}
    </div>
    </Section>
    <Section title="Additional providers" description="Set up another provider when you want more model choices.">{additionalProviders.length ? <div className="settings-ledger settings-provider-list">{additionalProviders.map(p => <Link className="settings-row" key={p.id} to={`/settings/model/providers/${p.id}`}><div><Bot size={16} /><span><strong>{p.name}</strong><small>{p.configured ? `${p.models.length} model${p.models.length === 1 ? "" : "s"} available` : p.authError ?? "Sign in required"}</small></span></div><StatusPill state={p.configured ? "ready" : "attention"}>{p.configured ? "Ready" : "Set up"}</StatusPill></Link>)}</div> : <p className="settings-prose">No additional providers are available.</p>}</Section>
  </SettingsPage>;
}

export function ModelProviderPage() {
  const { providerId = "" } = useParams();
  const result = useQuery({ queryKey: ["settings", "models"], queryFn: runtime.models });
  const provider = result.data?.providers.find(p => p.id === providerId);
  const modelBreadcrumb = <Link className="settings-back-link" to="/settings/model">Model & reasoning</Link>;
  const providerTitle = provider?.name ?? (providerId ? humanize(providerId) : "Model provider");
  if (result.isLoading) return <SettingsPage compact title={providerTitle} description="Reading this model provider’s sign-in and model list." breadcrumb={modelBreadcrumb}><LoadingState label="Loading model provider" /></SettingsPage>;
  if (result.isError) return <SettingsPage compact title={providerTitle} description="Kora could not read this model provider’s current state." breadcrumb={modelBreadcrumb}><ErrorState title="This provider couldn’t be checked." error={result.error} onRetry={() => result.refetch()} /></SettingsPage>;
  if (!provider) return <SettingsPage compact title={providerTitle} description="This provider is not in Kora’s current model list." breadcrumb={modelBreadcrumb}><EmptyState title="Model provider not found" body="Return to Model & reasoning to choose a provider in the current catalog." action={<Link className="button button--secondary" to="/settings/model">Back to model settings</Link>} /></SettingsPage>;
  return <SettingsPage compact title={provider.name} description={provider.configured ? "Authenticated and available to Kora." : "Sign in through the provider to make its models available to Kora."} breadcrumb={modelBreadcrumb}>
    <Section title="Authentication methods" description="Choose a provider sign-in method to make these models available."><ModelAuthControl providerId={providerId} configured={provider.configured} methods={provider.authMethods} /></Section>
    <Section title="Available models"><div className="settings-chips">{provider.models.map(model => <span key={model.id}>{model.name}</span>)}</div></Section>
  </SettingsPage>;
}

function ModelAuthControl({ providerId, configured, methods }: { providerId: string; configured: boolean; methods: Array<"oauth" | "api-key"> }) {
  const client = useQueryClient();
  const [interactionId, setInteractionId] = useState<string>();
  const [event, setEvent] = useState<IntegrationAuthEvent>();
  const [method, setMethod] = useState<"oauth" | "api-key">();
  const [starting, setStarting] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState<string>();
  const [promptUncertain, setPromptUncertain] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [openError, setOpenError] = useState<string>();
  const [signInUrl, setSignInUrl] = useState<string>();
  const openedUrl = useRef<string | undefined>(undefined);
  const currentPrompt = useRef<Extract<NativeAuthInteractionEvent, { type: "prompt" }> | undefined>(undefined);
  const promptValueRef = useRef("");
  const promptSubmittingRef = useRef(false);
  const cancelPendingRef = useRef(false);
  const generationRef = useRef(0);
  const uncertainObservationDelayRef = useRef(1000);
  useEffect(() => () => { promptValueRef.current = ""; }, []);

  const openUrl = (url: string) => {
    setOpenError(undefined);
    if (!hasDesktopHost) {
      try {
        if (!window.open(url, "_blank", "noopener,noreferrer")) setOpenError("If sign-in did not open, use Open sign-in page to try again.");
      } catch (error) {
        setOpenError(error instanceof Error ? error.message : "Kora could not open the provider sign-in page.");
      }
      return;
    }
    void desktopHost.openExternalUrl(url).catch(error => {
      setOpenError(error instanceof Error ? error.message : "Kora could not open the provider sign-in page.");
    });
  };

  useEffect(() => {
    if (!interactionId) return;
    const generation = ++generationRef.current;
    let active = true;
    let timer: number | undefined;
    const observeAgain = () => {
      const delay = uncertainObservationDelayRef.current;
      uncertainObservationDelayRef.current = Math.min(4000, delay * 2);
      timer = window.setTimeout(() => {
        if (active) setRevision(value => value + 1);
      }, delay);
    };
    const read = async () => {
      while (active) {
        try {
          const next = await runtime.nextModelAuth(interactionId);
          if (!active || generation !== generationRef.current) return;
          if (next.type === "prompt") {
            const samePrompt = currentPrompt.current?.promptId === next.promptId;
            if (!samePrompt) {
              uncertainObservationDelayRef.current = 1000;
              currentPrompt.current = next;
              promptValueRef.current = "";
              setPromptValue("");
              setPromptError(undefined);
              setPromptUncertain(false);
            }
            setEvent(next);
            if (samePrompt && promptUncertain) observeAgain();
            return;
          }
          if (next.type === "waiting" && promptUncertain && currentPrompt.current) {
            setEvent(currentPrompt.current);
            observeAgain();
            return;
          }
          setEvent(next);
          if (next.type === "auth_url" && openedUrl.current !== next.url) { setSignInUrl(next.url); openedUrl.current = next.url; openUrl(next.url); }
          if (next.type === "device_code" && openedUrl.current !== next.verificationUri) { setSignInUrl(next.verificationUri); openedUrl.current = next.verificationUri; openUrl(next.verificationUri); }
          if (["complete", "failed", "expired", "cancelled"].includes(next.type)) {
            uncertainObservationDelayRef.current = 1000;
            if (next.type === "complete" || next.type === "cancelled") setOpenError(undefined);
            setInteractionId(undefined);
            currentPrompt.current = undefined;
            promptValueRef.current = "";
            setPromptValue("");
            setPromptError(undefined);
            setPromptUncertain(false);
            cancelPendingRef.current = false;
            setCancelPending(false);
            if (next.type === "complete") {
              setEvent({ type: "progress", message: "Sign-in finished. Confirming the current model provider…" });
              try {
                await client.invalidateQueries({ queryKey: ["settings", "models"], refetchType: "none" });
                const refreshed = await client.fetchQuery({ queryKey: ["settings", "models"], queryFn: runtime.models, staleTime: 0 });
                const canonical = refreshed.providers.find(candidate => candidate.id === providerId);
                setEvent(canonical?.configured ? next : {
                  type: "unconfirmed",
                  message: canonical?.authError ?? "The provider did not report configured authentication after sign-in.",
                });
              } catch {
                setEvent({ type: "unconfirmed", message: "Kora could not refresh the model provider. No authentication change is being claimed." });
              }
              await client.invalidateQueries({ queryKey: ["settings", "bootstrap"] });
            }
            return;
          }
        } catch (error) {
          if (!active || generation !== generationRef.current) return;
          const message = error instanceof Error ? error.message : "Authentication could not continue.";
          if (promptUncertain && currentPrompt.current) {
            setEvent(currentPrompt.current);
            setPromptError(`Kora could not observe the existing sign-in. Retry observation or cancel it before starting over. (${message})`);
          } else {
            setEvent({ type: "failed", message });
          }
          return;
        }
      }
    };
    void read();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [client, interactionId, promptUncertain, providerId, revision]);

  const begin = async (nextMethod: "oauth" | "api-key") => {
    if (starting || interactionId || cancelPendingRef.current) return;
    setStarting(true);
    setMethod(nextMethod);
    currentPrompt.current = undefined;
    promptValueRef.current = "";
    setPromptValue("");
    setPromptError(undefined);
    setPromptUncertain(false);
    uncertainObservationDelayRef.current = 1000;
    openedUrl.current = undefined;
    setOpenError(undefined);
    setSignInUrl(undefined);
    setEvent({ type: "progress", message: `Starting ${humanize(providerId)} authentication…` });
    try { setInteractionId((await runtime.startModelAuth(providerId, nextMethod)).id); }
    catch (error) { setEvent({ type: "failed", message: error instanceof Error ? error.message : "Authentication could not start." }); }
    finally { setStarting(false); }
  };
  const cancel = async () => {
    if (!interactionId || cancelPendingRef.current) return;
    cancelPendingRef.current = true;
    setCancelPending(true);
    generationRef.current += 1;
    setOpenError(undefined);
    setEvent({ type: "progress", message: "Cancelling secure authentication…" });
    try {
      await runtime.cancelModelAuth(interactionId);
      setRevision(value => value + 1);
    } catch (error) {
      setEvent({ type: "failed", message: error instanceof Error ? error.message : "Authentication could not be cancelled." });
    } finally {
      cancelPendingRef.current = false;
      setCancelPending(false);
    }
  };
  const answer = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!interactionId || event?.type !== "prompt" || !promptValue.trim() || promptSubmittingRef.current || promptUncertain || cancelPendingRef.current) return;
    const prompt = event;
    promptSubmittingRef.current = true;
    setPromptSubmitting(true);
    setPromptError(undefined);
    try {
      await runtime.respondModelAuth(interactionId, prompt.promptId, promptValue.trim());
      promptValueRef.current = "";
      currentPrompt.current = undefined;
      setPromptValue("");
      setPromptUncertain(false);
      uncertainObservationDelayRef.current = 1000;
      setEvent({ type: "progress", message: "Continuing secure authentication…" });
      setRevision(value => value + 1);
    } catch (error) {
      setPromptUncertain(true);
      setPromptError(error instanceof Error
        ? `Kora could not confirm this response. It is still observing the existing sign-in; cancel before trying a new response. (${error.message})`
        : "Kora could not confirm this response. It is still observing the existing sign-in; cancel before trying a new response.");
      setRevision(value => value + 1);
    } finally {
      promptSubmittingRef.current = false;
      setPromptSubmitting(false);
    }
  };
  const busy = starting || Boolean(interactionId);
  const retryObservation = () => {
    if (!interactionId || cancelPendingRef.current) return;
    setEvent(currentPrompt.current ?? { type: "progress", message: "Checking secure authentication status…" });
    setRevision(value => value + 1);
  };
  const exchanging = starting || event?.type === "progress";
  const busyLabel = event?.type === "prompt"
    ? "Waiting for your response"
    : event?.type === "auth_url" || event?.type === "device_code"
      ? "Waiting for sign-in"
      : "Connecting…";
  return <div className="settings-oauth">
    <div className="settings-actions">{methods.map(candidate => <Button key={candidate} tone={candidate === "oauth" ? "primary" : "secondary"} disabled={busy} onClick={() => void begin(candidate)}>{busy && method === candidate ? <>{exchanging ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}{busyLabel}</> : candidate === "oauth" ? configured ? "Reconnect with OAuth" : "Continue with OAuth" : "Use API key"}</Button>)}</div>
    <AuthInteractionPanel
      event={event}
      busy={busy}
      cancelPending={cancelPending}
      openError={openError}
      promptError={promptError}
      promptUncertain={promptUncertain}
      promptSubmitting={promptSubmitting}
      onRetry={retryObservation}
      signInUrl={signInUrl}
      promptValue={promptValue}
      onPromptValue={value => { promptValueRef.current = value; setPromptValue(value); }}
      onOpen={openUrl}
      onSubmit={answer}
      onCancel={() => void cancel()}
    />
  </div>;
}

export function BackgroundPage() {
  const { restart } = useConnection();
  const client = useQueryClient();
  const preferences = useQuery({ queryKey: ["settings", "host-preferences"], queryFn: desktopHost.preferences, enabled: hasDesktopHost });
  const startup = useQuery({ queryKey: ["settings", "background-start"], queryFn: desktopHost.backgroundStart, enabled: hasDesktopHost });
  const condition = useQuery({ queryKey: ["settings", "host-condition"], queryFn: desktopHost.condition, enabled: hasDesktopHost, refetchInterval: 5_000 });
  const close = useMutation({ mutationFn: desktopHost.setCloseBehavior, onSuccess: value => client.setQueryData(["settings", "host-preferences"], value) });
  const start = useMutation({ mutationFn: (attempt: { enabled: boolean; requestKey: string }) => desktopHost.setBackgroundStart(attempt.enabled, attempt.requestKey), onSuccess: value => client.setQueryData(["settings", "background-start"], value) });
  const replaceStart = useMutation({ mutationFn: (requestKey: string) => desktopHost.replaceBackgroundStart(true, requestKey), onSuccess: value => client.setQueryData(["settings", "background-start"], value) });
  const recover = useMutation({ mutationFn: restart, onSuccess: () => condition.refetch() });
  return <SettingsPage title="Background & startup" description="Choose whether closing Kora exits completely or keeps Kora available in the background.">
    {!hasDesktopHost ? <Section title="Connection now"><div className="settings-callout"><Monitor size={18} /><div><strong>Desktop condition unavailable</strong><p>Browser review shows transport state elsewhere and does not claim Windows host health.</p></div></div></Section> : condition.isLoading ? <LoadingState label="Observing the Windows host" /> : condition.isError ? <ErrorState error={condition.error} onRetry={() => condition.refetch()} /> : <>
      <Section title="Connection now"><div className="settings-facts"><div><span>Lifecycle</span><strong>{humanize(condition.data?.lifecycle.state ?? "unknown")}</strong></div><div><span>Observed</span><strong>{formatDate(condition.data?.lifecycle.observedAt)}</strong></div></div>{condition.data?.lifecycle.problem && <div className="settings-callout"><CircleAlert size={18} /><div><strong>{humanize(condition.data.lifecycle.problem.code)}</strong><p>{condition.data.lifecycle.problem.message}</p></div></div>}</Section>
      <Section title="Resident state"><div className="settings-facts"><div><span>Condition</span><strong>{humanize(condition.data?.residentState.state ?? "unknown")}</strong></div><div><span>Window close</span><strong>{condition.data?.closeBehavior === "remain_resident" ? "Remain resident" : "Stop and exit"}</strong></div></div>{condition.data?.residentState.problem && <div className="settings-callout"><CircleAlert size={18} /><div><strong>Background recovery needs attention</strong><p>{condition.data.residentState.problem.message}</p>{condition.data.residentState.state === "unavailable" && <Button disabled={recover.isPending} onClick={() => recover.mutate()}>{recover.isPending ? "Retrying…" : "Retry background service"}</Button>}</div></div>}{recover.data?.status === "failed" && <ErrorState title="Kora could not recover the background service." error={new Error(recover.data.message)} />}</Section>
      <Section title="When I close Kora" description="Kora stops and exits by default. Background operation is an explicit choice.">
        {!hasDesktopHost ? <div className="settings-callout"><Monitor size={18} /><div><strong>Desktop control</strong><p>Open Kora’s desktop app to change background behavior.</p></div></div> :
          preferences.isLoading ? <LoadingState label="Reading close behavior" /> : preferences.isError ? <ErrorState title="Close behavior couldn’t load." error={preferences.error} onRetry={() => void preferences.refetch()} /> : <div className="settings-choice-list" aria-busy={close.isPending}><RadioGroup label="When I close Kora" value={preferences.data!.closeBehavior} onValueChange={choice => close.mutate(choice as "stop_kora_and_close" | "close_window_keep_kora_running")} options={[{ value: "stop_kora_and_close", title: "Stop Kora and exit", hint: "Stop the background service, then close the desktop app." }, { value: "close_window_keep_kora_running", title: "Keep Kora running in the background", hint: "Closing hides the window. Use Kora's Windows resident icon to open or quit her." }]} />{close.isPending && <p className="settings-prose" role="status">Saving close behavior…</p>}{close.isSuccess && <p className="settings-success" role="status"><Check size={14} /> Close behavior saved</p>}</div>}
      </Section>
      <Section title="Start with Windows" description="Starts Kora in the background when Windows starts.">
        {!hasDesktopHost ? <p className="settings-prose">Available in a built Kora desktop app.</p> :
          startup.isLoading ? <LoadingState label="Checking Windows startup" /> : startup.isError ? <ErrorState title="Windows startup couldn’t be checked." error={startup.error} onRetry={() => void startup.refetch()} /> : startup.data?.registration === "repair_required" ? <div className="settings-danger"><div><strong>Another startup entry is present</strong><p>Kora preserved the unknown content. Replace it only if you want the installed Kora desktop host to own startup.</p></div><div className="settings-actions"><Button onClick={() => replaceStart.reset()}>Leave unchanged</Button><Button tone="primary" disabled={replaceStart.isPending} onClick={() => replaceStart.mutate(crypto.randomUUID())}>{replaceStart.isPending ? "Replacing…" : "Replace with Kora launcher"}</Button></div></div> : <><CheckboxChoice disabled={startup.data?.registration === "unavailable" || start.isPending} checked={startup.data?.registration === "enabled"} onCheckedChange={enabled => start.mutate({ enabled, requestKey: crypto.randomUUID() })} title="Start Kora with Windows" hint={startup.data?.registration === "unavailable" ? "Available after Kora is built." : `Registration: ${humanize(startup.data?.registration ?? "checking")}`} />{start.isPending && <p className="settings-prose" role="status">Saving Windows startup…</p>}{start.isSuccess && <p className="settings-success" role="status"><Check size={14} /> Windows startup saved</p>}</>}
      </Section>
      {close.isError && <ErrorState title="Window-close behavior was not changed." error={close.error} onRetry={() => close.variables && close.mutate(close.variables)} />}
      {start.isError && <ErrorState title="Windows startup was not changed." error={start.error} onRetry={() => start.variables && start.mutate(start.variables)} />}
      {replaceStart.isError && <ErrorState title="Windows startup was not replaced." error={replaceStart.error} onRetry={() => replaceStart.variables && replaceStart.mutate(replaceStart.variables)} />}
    </>}
  </SettingsPage>;
}

/** A schematic of the choice, not a second live workspace or state owner. */
function AppearancePreview({ theme, density }: { theme?: "system" | "light" | "dark"; density?: "comfortable" | "compact" }) {
  return <span className="appearance-preview" data-theme-preview={theme} data-density-preview={density}>
    <span className="appearance-preview__rail"><i /><i /><i /></span>
    <span className="appearance-preview__page"><b /><span><i /><i /><i /><i /></span></span>
  </span>;
}

export function AppearancePage() {
  const [value, setValue] = useState(readAppearance);
  const valueRef = useRef(value);
  const [scaleError, setScaleError] = useState<string | undefined>(() => readAppearanceStartupError());
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [resetState, setResetState] = useState<"idle" | "pending" | "success">("idle");
  const [scalePending, setScalePending] = useState(false);
  const operationQueue = useRef(Promise.resolve());
  useEffect(() => {
    const refresh = () => { const next = readAppearance(); valueRef.current = next; setValue(next); applyAppearance(next); };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const enqueue = (operation: () => Promise<void>) => {
    const next = operationQueue.current.catch(() => undefined).then(operation);
    operationQueue.current = next.catch(() => undefined);
    return next;
  };
  const mergeCurrent = (changes: Partial<AppearancePreferences>) => {
    const next = { ...valueRef.current, ...changes };
    valueRef.current = next;
    setValue(next);
    saveAppearance(next);
    applyAppearance(next);
  };
  const update = (changes: Partial<AppearancePreferences>) => {
    setResetState("idle");
    mergeCurrent(changes);
  };
  const setScale = (scale: AppearancePreferences["scale"]) => {
    setScaleError(undefined);
    setScalePending(true);
    void enqueue(async () => {
      try {
        await desktopHost.setInterfaceScale(scale);
        clearAppearanceStartupError();
        mergeCurrent({ scale });
      } catch (error) {
        setScaleError(error instanceof Error ? error.message : "Kora could not apply that scale.");
        throw error;
      } finally {
        setScalePending(false);
      }
    }).catch(() => undefined);
  };
  const reset = () => {
    setScaleError(undefined);
    setResetState("pending");
    void enqueue(async () => {
      try {
        if (hasDesktopHost && valueRef.current.scale !== 1) await desktopHost.setInterfaceScale(1);
        clearAppearanceStartupError();
        mergeCurrent(DEFAULT_APPEARANCE);
        setResetState("success");
      } catch (error) {
        setResetState("idle");
        setScaleError(error instanceof Error ? error.message : "Kora could not reset appearance.");
        throw error;
      }
    }).catch(() => undefined);
  };
  const visibleShortcuts = KORA_SHORTCUTS.filter(shortcut => `${shortcut.label} ${shortcut.description} ${shortcut.keys}`.toLowerCase().includes(shortcutQuery.toLowerCase()));
  return <SettingsPage title="Appearance" description="Make the interface comfortable for you." actions={<Button onClick={reset} disabled={resetState === "pending"}>{resetState === "pending" ? "Resetting…" : "Reset appearance"}</Button>}>
    {resetState === "success" && <p className="settings-success" role="status"><Check size={14} /> Appearance reset to System, Comfortable, and 100%</p>}
    <SettingsPreference title="Theme" description="Match your system, or choose a light or dark appearance.">
      <RadioGroup layout="tiles" label="Theme" value={value.theme} onValueChange={(theme) => update({ theme: theme as AppearancePreferences["theme"] })}
        options={(["system", "light", "dark"] as const).map(theme => ({ value: theme, title: humanize(theme), disabled: resetState === "pending", preview: <AppearancePreview theme={theme} /> }))} />
    </SettingsPreference>
    <SettingsPreference title="Density" description="Choose the space between items. Your text size stays the same.">
      <RadioGroup layout="tiles" label="Interface density" value={value.density} onValueChange={density => update({ density: density as AppearancePreferences["density"] })}
        options={(["comfortable", "compact"] as const).map(density => ({ value: density, title: humanize(density), disabled: resetState === "pending", hint: density === "compact" ? "More in view" : "More breathing room", preview: <AppearancePreview density={density} /> }))} />
    </SettingsPreference>
    <SettingsPreference title="Interface scale" description="Make the desktop interface larger or smaller."><SegmentedControl label="Interface scale" layoutId="appearance-scale" value={String(value.scale)} disabled={!hasDesktopHost || scalePending || resetState === "pending"} onValueChange={(scale) => setScale(Number(scale) as AppearancePreferences["scale"])} options={([0.9, 1, 1.1, 1.25] as const).map(scale => ({ value: String(scale), label: `${Math.round(scale * 100)}%` }))} />{scalePending && <p className="settings-prose" role="status">Applying interface scale…</p>}{!hasDesktopHost && <p className="settings-prose">Scale is available in the Kora desktop app.</p>}{scaleError && <ErrorState title="Interface scale was not changed." error={new Error(scaleError)} />}</SettingsPreference>
    <Section title="Keyboard reference" description="These are the actual shortcuts registered by Kora’s shell."><SearchField label="Search shortcuts" value={shortcutQuery} onValueChange={setShortcutQuery} placeholder="Search shortcuts" /><div className="settings-shortcuts">{visibleShortcuts.map(shortcut => <div key={shortcut.id}><span><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span><kbd>{shortcut.keys}</kbd></div>)}</div>{!visibleShortcuts.length && <p className="settings-prose">No shortcuts match that search.</p>}</Section>
  </SettingsPage>;
}

export function DataPage() {
  return <DataSettingsPage />;
}

export function DiagnosticsPage() {
  return <DiagnosticsSettingsPage />;
}

export function SettingsPage({ title, description, breadcrumb, status, actions, children, compact = false }: {
  title: string;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return <SettingsFrame
    title={title}
    description={description}
    breadcrumb={breadcrumb}
    status={status}
    actions={actions}
    width={compact ? "focused" : "standard"}
  >{children}</SettingsFrame>;
}

function triggerLabel(trigger: NativeScheduleTrigger) {
  if (trigger.kind === "once") return `Once · ${formatDate(trigger.at)}`;
  if (trigger.kind === "interval") return `Every ${Math.round(trigger.everyMs / 3600_000)} hours`;
  const cadence = trigger.interval && trigger.interval > 1 ? `Every ${trigger.interval} ${trigger.frequency === "daily" ? "days" : trigger.frequency === "weekly" ? "weeks" : "months"}` : humanize(trigger.frequency);
  const detail = trigger.frequency === "weekly" && trigger.weekdays?.length ? ` · ${trigger.weekdays.map(day => WEEKDAYS.find(value => value.value === day)?.label).filter(Boolean).join(", ")}` : trigger.frequency === "monthly" && trigger.dayOfMonth ? ` · day ${trigger.dayOfMonth}` : "";
  return `${cadence}${detail} at ${trigger.localTime} · ${trigger.timezone ?? "UTC"}`;
}
function runStateLabel(state: string) {
  return ({
    claimed: "Queued",
    running: "Running",
    retry_wait: "Waiting to retry",
    finished: "Finished",
    stopped: "Stopped",
    cancelled: "Cancelled",
  } as Record<string, string>)[state] ?? humanize(state);
}
function humanize(value: string) { return value.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase()); }
