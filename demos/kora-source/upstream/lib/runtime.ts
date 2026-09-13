import { invoke } from "@tauri-apps/api/core";

export type SessionMetadata = {
  id: string;
  createdAt: string;
  updatedAt: string;
  purpose: "foreground" | "scheduled_job" | "background" | "evaluation";
  parentSessionId?: string;
  archivedAt?: string;
  name?: string;
  leafId?: string | null;
};
export type SessionSearchResult = {
  sessionId: string;
  entryId: string;
  role: "user" | "assistant";
  occurredAt: string;
  excerpt: string;
};
export type SessionTitleResult = {
  sessionId: string;
  state: "generated" | "unchanged" | "not_eligible" | "deferred" | "failed";
  title?: string;
  message?: string;
};
export type SessionTransitionOrigin =
  | "cli"
  | "command"
  | "conversation_rail"
  | "side_chat"
  | "activation"
  | "notification"
  | "schedule"
  | "memory"
  | "output"
  | "artifact";
export type SessionTransitionInput = {
  kind: "create" | "resume";
  targetSessionId?: string;
  expectedCurrentSessionId: string;
  requestKey: string;
  origin: SessionTransitionOrigin;
  activeRunPolicy: "reject";
};
export type SessionTransitionOutcome =
  | {
      status: "confirmed";
      previousSessionId: string;
      sessionId: string;
      origin: SessionTransitionOrigin;
      replayed: boolean;
    }
  | {
      status: "conflict";
      reason: "expected_current_mismatch" | "request_key_reused";
      currentSessionId: string;
      origin: SessionTransitionOrigin;
      replayed: boolean;
    }
  | {
      status: "blocked_by_active_run";
      currentSessionId: string;
      origin: SessionTransitionOrigin;
      replayed: boolean;
    }
  | {
      status: "failed";
      code: "target_not_found" | "replacement_failed";
      currentSessionId: string;
      origin: SessionTransitionOrigin;
      replayed: boolean;
    };
export type SessionNavigationEntry = {
  id: string;
  parentId: string | null;
  occurredAt: string;
  kind:
    | "message"
    | "model"
    | "reasoning"
    | "tools"
    | "compaction"
    | "branch"
    | "label"
    | "state";
  label: string;
  role?: "user" | "assistant" | "system";
  preview?: string;
  name?: string;
  depth: number;
  childCount: number;
  activityCount: number;
  branchPoint: boolean;
  onCurrentPath: boolean;
  current: boolean;
};

export type NativeNotification = {
  id: string;
  sourceAttentionTier: NativeAttentionTier | null;
  sourceResultText: string | null;
  type: "run_finished" | "run_stopped" | "custom";
  title: string;
  message: string;
  scheduleId: string | null;
  runId: string | null;
  terminalRunId: string | null;
  sessionId: string | null;
  artifactId: string | null;
  createdAt: string;
  seenAt: string | null;
  idempotencyKey: string;
};
export type NativeScheduleTrigger =
  | { kind: "once"; at: string }
  | { kind: "interval"; everyMs: number; anchorAt: string }
  | {
      kind: "recurring";
      frequency: "daily" | "weekly" | "monthly";
      localTime: string;
      timezone?: string;
      startDate: string;
      interval?: number;
      weekdays?: number[];
      dayOfMonth?: number;
    };
/** Delivery posture for a schedule. Governs presentation only, never execution. */
export type NativeAttentionTier = "silent" | "digest" | "interrupt";
export type NativeSchedule = {
  id: string;
  name: string | null;
  displayLabel: string;
  prompt: string;
  trigger: NativeScheduleTrigger;
  timezone: string | null;
  nextDueAt: string | null;
  state: string;
  attentionTier: NativeAttentionTier;
  isTouchpoint: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastRunState: string | null;
  lastRunId: string | null;
};
export type NativeScheduleRun = {
  id: string;
  scheduleId: string;
  occurrence: string;
  trigger: "automatic" | "manual";
  state:
    "claimed" | "running" | "retry_wait" | "finished" | "stopped" | "cancelled";
  attentionTier: NativeAttentionTier;
  reasonCode: string | null;
  detail: string | null;
  sessionId: string | null;
  artifactId: string | null;
  resultText: string | null;
  claimedAt: string;
  turnStartedAt: string | null;
  finishedAt: string | null;
};
export type NativeProvider = {
  id: string;
  configured: boolean;
  accessState: "available" | "unknown" | "not_configured" | "denied" | "expired";
  connected?: boolean;
  scopes: string[];
  operations: string[];
  health: "available" | "unavailable" | "degraded";
  unavailableReason?: string;
  lastCheckedAt?: string;
  lastSuccessfulCheckAt?: string;
  /** Runtime-owned provider truth retained alongside presentation aliases. */
  connectionState?: "not_configured" | "unchecked" | "connected" | "needs_attention";
  connectionObservedAt?: string;
  supportedOperations?: string[];
  availableOperations?: string[];
  authorityObservation?: NativeProviderAuthorityObservation;
  problem?: { code: string; message: string };
  lifecycleActions?: NativeProviderLifecycleAction[];
  updatedAt: string;
};
export type NativeProviderAuthorityObservation =
  | { state: "not_checked" }
  | { state: "reported"; scopes: string[]; observedAt: string }
  | { state: "not_supported" }
  | { state: "failed"; lastSuccessfulScopes?: string[]; lastSuccessfulAt?: string };
export type NativeProviderLifecycleAction = {
  kind: "disconnect";
  label: string;
  operation: string;
  effect: {
    localCredential: "removed" | "unchanged";
    remoteAuthority: "revoked" | "unchanged" | "item-removal" | "not-claimed";
  };
};
type NativeProviderWire = {
  id: string;
  connectionState: "not_configured" | "unchecked" | "connected" | "needs_attention";
  connectionObservedAt?: string;
  supportedOperations: string[];
  availableOperations: string[];
  authorityObservation: NativeProviderAuthorityObservation;
  problem?: { code: string; message: string };
  lifecycleActions: NativeProviderLifecycleAction[];
  updatedAt: string;
};
export type NativeCapabilityDiagnostics = {
  groups: Array<{
    name: string;
    description: string;
    installed: boolean;
    active: boolean;
    enabled: boolean;
    health: "available" | "unavailable" | "degraded";
    toolCount: number;
    schemaCharacters: number;
    tools: Array<{
      name: string;
      available: boolean;
      unavailableReason?: string;
    }>;
    foundations: Array<{
      id: string;
      version?: string;
      providerId?: string;
      provenance: string;
      installed: boolean;
      configured?: boolean;
      connected?: boolean;
      health: "available" | "unavailable" | "degraded";
      unavailableReason?: string;
    }>;
  }>;
  providers: Array<
    NativeProvider & {
      connected: boolean;
      revocation: { supported: boolean; operation?: string };
    }
  >;
  resources: { skills: number; prompts: number; diagnostics: number };
  limits: {
    maxToolsPerGroup: number;
    maxActiveGroups: number;
    maxActiveTools: number;
    maxSchemaCharactersPerGroup: number;
    maxActiveSchemaCharacters: number;
  };
};
export type BrowserStatus = {
  state:
    | "disconnected"
    | "connecting"
    | "ready"
    | "acting"
    | "waiting_owner"
    | "degraded";
  connectionEpoch?: string;
  profileId?: string;
  profileLabel?: string;
  incognito?: boolean;
  extensionVersion?: string;
  activeActionId?: string;
  lastConnectedAt?: string;
  reason?: string;
};
export type BrowserCredential = {
  id: string;
  label: string;
  normalizedOrigin: string;
  usernameLabel?: string;
  createdAt: string;
  updatedAt: string;
  oneTime: boolean;
};
export type NativeNotificationSettings = {
  quietStart: string | null;
  quietEnd: string | null;
  updatedAt: string;
  version: number;
  currentlyQuiet?: boolean;
};
export type NativeBackgroundStatus = {
  configured: boolean;
  healthy: boolean;
  taskName: string;
};
export type NativeMigrationSummary = {
  sources: Array<{
    sourceKind: string;
    recordCount: number;
    disposition:
      "imported" | "archived" | "discarded" | "missing" | "reset_approved";
    createdAt: string;
  }>;
  pending: Array<{ sourceCollection: string; count: number }>;
};
export type NativeMigrationPending = {
  id: string;
  sourceCollection: string;
  sourceId: string;
  summary: { kind: "record"; title: string; detail?: string };
  createdAt: string;
};
export type ApplicationStage =
  | "researching"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn";
export type ApplicationSourceState = {
  status: "ok" | "partial" | "unavailable" | "empty";
  label: string;
  detail?: string;
};
export type ApplicationRecord = {
  project: {
    id: string;
    title: string;
    purposeMarkdown: string;
    state:
      "planned" | "active" | "blocked" | "completed" | "cancelled" | "archived";
    priority: number;
    startDate?: string;
    targetDate?: string;
    sensitivity: "private" | "restricted";
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  application: {
    projectId: string;
    company: string;
    roleTitle: string;
    source: string;
    listingUrl?: string;
    stage: ApplicationStage;
    stageUpdatedAt: string;
    stageProvenance: string;
    stageEvidence: { kind: "gmail"; messageId: string } | { kind: "user" };
    version: number;
    createdAt: string;
    updatedAt: string;
  };
};
export type ApplicationsResponse = {
  applications: ApplicationRecord[];
  sources: {
    nativeWork: ApplicationSourceState;
    gmail: ApplicationSourceState;
  };
};
export type ApplicationDetailResponse = ApplicationRecord & {
  evidence: Array<{
    id: string;
    fromType: "project" | "work_item";
    fromId: string;
    relation: string;
    toType: string;
    toId: string;
    providerId?: string;
    providerKind?: string;
    availability: "available" | "unverified" | "unavailable" | "degraded";
    verifiedAt?: string;
    createdAt: string;
  }>;
  aperture: {
    state: ApplicationSourceState;
    sources: Array<{
      source: {
        id: string;
        label: string;
        sourceKind: "file" | "inline";
        sourcePath?: string;
        version: number;
        contentHash: string;
        sensitivity: "private" | "restricted";
        state: "active" | "unavailable";
        createdAt: string;
        updatedAt: string;
      };
      status: "current" | "changed" | "unavailable";
      reason?: "content_changed" | "locator_changed" | "missing_or_invalid";
      observedContentHash?: string;
    }>;
    notice: string;
  };
};
export type NativeSettingsOverview = {
  revision: number;
  items: Array<{
    section:
      | "model"
      | "integrations"
      | "schedules"
      | "background"
      | "notifications"
      | "migration";
    state: "normal" | "attention" | "unavailable";
    summary: string;
    route: string;
  }>;
};

export type ShellBootstrap = {
  readiness: "ready";
  epoch: string;
  revision: number;
  viewerTimeZone: string;
  session: SessionMetadata;
  run: {
    state: "idle" | "active";
    cursor: number | null;
    runId?: string;
    snapshot?: ConversationRunSnapshot;
  };
  model: {
    provider: string;
    model: string;
    reasoning: string;
    updatedAt: string;
    configured: boolean;
    authenticationRequired: boolean;
    access: {
      state: "unknown" | "ready" | "authentication_required" | "selected_model_unavailable";
      reasonCode: string;
      observedAt: string;
    };
  };
  attention: {
    pendingApprovals: Array<{
      id: string;
      toolName: string;
      expiresAt: string;
      createdAt: string;
    }>;
    unseenNotifications: number;
  };
  capabilities: {
    unavailable: Array<{ id: string; reason?: string }>;
    degraded: Array<{ id: string; reason?: string }>;
  };
};
export type NativeCondition = {
  state: "ready" | "attention" | "unavailable" | "unknown";
  observedAt: string;
  problem?: { code: string; message: string; requestId?: string };
};
export type NativeRuntimeCondition = {
  observedAt: string;
  storage: NativeCondition & {
    integrity: "ok" | "failed" | "not_checked";
    lastCheckedAt?: string;
    schemaVersion: number;
  };
  model: { credentialState: "configured" | "required" | "unknown" };
  integrations: { connected: number; needsAttention: number };
  currentProblem?: { code: string; message: string; requestId?: string };
};

export type ConversationRunPhase =
  | "queued"
  | "preparing"
  | "thinking"
  | "responding"
  | "using_tool"
  | "waiting_for_approval"
  | "finishing";
export type ConversationRunFailure = {
  category:
    | "authentication"
    | "provider"
    | "network"
    | "tool"
    | "context"
    | "runtime"
    | "unknown";
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
};
export type ConversationItemStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped";
export type BrainObjectKind =
  | "profile"
  | "memory"
  | "page"
  | "person"
  | "knowledge_source"
  | "project"
  | "work_item"
  | "output"
  | "calendar_event"
  | "calendar_query"
  | "assistant_run"
  | "finance_record"
  | "wellbeing_record";
export type SafeContextDisplay = {
  objectKind: BrainObjectKind;
  title: string;
  originLabel?: string;
};
/**
 * Safe presentation-only citation metadata projected by the authenticated
 * runtime. Handles are opaque and intentionally have no UI representation.
 */
export type KoraBrainCitationReceipt = {
  citationHandle: string;
  traceHandle: string;
  statement: { start: number; end: number; unit: "utf16_code_unit" };
  display: SafeContextDisplay;
  status:
    "supported" | "deferred" | "changed" | "gone" | "expired" | "unavailable";
};

export type BrainCitationTraceSummary = {
  sourceWasRead: boolean;
  sourceWasCited: boolean;
  readCount: number;
  citedCount: number;
};

export type BrainCitationEvidenceInspection =
  | {
      state: "ready";
      display: SafeContextDisplay;
      excerpt: { format: "text" | "markdown" | "json_excerpt"; text: string };
      trace: BrainCitationTraceSummary;
    }
  | {
      state:
        "deferred" | "changed" | "gone" | "expired" | "denied" | "unavailable";
      display?: SafeContextDisplay;
      trace?: BrainCitationTraceSummary;
    };
export type KoraBrainGrounding = "supported" | "partial" | "unsupported";
export type ConversationContextSelection =
  | {
      state: "ready";
      authorization: "allowed";
      selectionId: string;
      evidenceHandle: string;
      display: SafeContextDisplay;
      expiresAt: string;
    }
  | {
      state: "approval_required";
      authorization: "approval_required";
      selectionId: string;
      approvalHandle: string;
      display: { objectKind: "restricted"; title: "Restricted item" };
      expiresAt: string;
    }
  | {
      state: "unavailable";
      authorization: "allowed";
      selectionId: string;
      display: SafeContextDisplay;
      reason: "stale" | "gone" | "expired" | "unavailable";
      retryable: boolean;
    }
  | {
      state: "withheld";
      authorization: "denied" | "unavailable";
      opaqueHandle?: string;
      display: { objectKind: "restricted"; title: "Restricted item" };
      reason: "denied" | "expired" | "unavailable";
      retryable: boolean;
    };
export type ConversationContextReceipt = {
  state:
    | "available"
    | "read"
    | "cited"
    | "deferred"
    | "changed"
    | "gone"
    | "expired"
    | "denied"
    | "unavailable";
  display:
    SafeContextDisplay | { objectKind: "restricted"; title: "Restricted item" };
};
/** A canonical target used only to ask the authenticated runtime to mint an opaque selection. */
export type ConversationContextReference = {
  kind: BrainObjectKind;
  id: string;
  title: string;
  range?: { start: number; end?: number };
};
export type ConversationContextRequest =
  ConversationContextReference | ConversationContextSelection;
export type PublicMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; artifactId: string; mediaType: string; name?: string }
  | { type: "context"; reference: ConversationContextReceipt };
export type ConversationInputPart =
  | { type: "text"; text: string }
  | { type: "image"; artifactId: string; mediaType: string; name?: string }
  | { type: "context"; reference: ConversationContextSelection };
export type CalendarDateValue =
  | { kind: "date"; date: string }
  | { kind: "dateTime"; instant: string; timeZone: string };
export type CalendarSource = {
  calendarId: string;
  name: string;
  providerId: "kora" | "google-workspace";
  authority: "kora" | "google";
  primary: boolean;
  selected: boolean;
  timeZone?: string;
  color?: string;
  accessRole: string;
  writable: boolean;
  status: "available" | "degraded" | "unavailable";
  syncState: "local" | "synced" | "stale" | "unavailable";
  lastSyncedAt?: string;
};
export type CalendarAttendee = {
  email: string;
  displayName?: string;
  organizer: boolean;
  self: boolean;
  optional: boolean;
  responseStatus:
    "needsAction" | "declined" | "tentative" | "accepted" | "unknown";
};
export type CalendarEvent = {
  calendarId: string;
  eventId: string;
  providerId: "kora" | "google-workspace";
  authority: "kora" | "google";
  title: string;
  description?: string;
  start: CalendarDateValue;
  end: CalendarDateValue;
  allDay: boolean;
  eventTimeZone?: string;
  viewerTimeZone: string;
  status: "confirmed" | "tentative" | "cancelled" | "unknown";
  availability: "busy" | "free";
  location?: string;
  conference?: { kind: string; uri?: string; label?: string };
  organizer?: { email?: string; displayName?: string; self: boolean };
  attendees: CalendarAttendee[];
  recurrence: string[];
  recurringEventId?: string;
  originalStart?: CalendarDateValue;
  providerUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: string;
  syncState: "local" | "synced" | "stale";
  lastSyncedAt?: string;
  capabilities: {
    readable: boolean;
    writable: boolean;
    deletable: boolean;
    manageAttendees: boolean;
    editSeries: boolean;
    editOccurrence: boolean;
  };
};
export type CalendarEventDraft = {
  calendarId: string;
  title: string;
  description?: string;
  start: CalendarDateValue;
  end: CalendarDateValue;
  location?: string;
  availability?: "busy" | "free";
  attendees?: Array<{ email: string; optional?: boolean }>;
  recurrence?: string[];
  conference: { kind: "none" } | { kind: "google_meet" };
};
export type CalendarMutationOutcome =
  | {
      status: "acknowledged";
      operationId: string;
      event?: CalendarEvent;
      recovery?: {
        kind: "restore_local_calendar_event";
        calendarId: "kora:personal";
        eventId: string;
        deletedRevision: string;
      };
    }
  | {
      status: "waiting_confirmation";
      confirmationId: string;
      expiresAt: string;
      consequence: string;
    }
  | { status: "rejected"; message: string }
  | {
      status:
        | "validation_failure"
        | "permission_failure"
        | "conflict"
        | "unavailable";
      message: string;
      retryable?: boolean;
    }
  | { status: "uncertain"; operationId: string; message: string }
  | { status: "cancelled"; operationId?: string };
export type WorkState =
  "planned" | "active" | "blocked" | "completed" | "cancelled" | "archived";
export type GoalShape = "finish" | "target" | "ongoing";
export type GoalLifecycle =
  | "idea" | "planned" | "active" | "paused" | "achieved" | "stopped" | "archived";
export type Goal = {
  id: string;
  title: string;
  area?: string;
  purposeMarkdown: string;
  successDefinitionMarkdown?: string;
  shape: GoalShape;
  lifecycle: GoalLifecycle;
  priority: number;
  plannedStart?: string;
  targetDate?: string;
  hardDeadline?: string;
  currentPositionMarkdown?: string;
  pauseReason?: string;
  resultMarkdown?: string;
  stopReason?: string;
  terminalProvenance?: string;
  resumeReason?: string;
  resumeProvenance?: string;
  resumedAt?: string;
  sensitivity: "private" | "restricted";
  provenance: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  achievedAt?: string;
  stoppedAt?: string;
  archivedAt?: string;
};
/** @deprecated Bounded compatibility for legacy Project routes. */
export type Project = {
  id: string;
  title: string;
  area?: string;
  purposeMarkdown: string;
  state: WorkState;
  priority: number;
  startDate?: string;
  targetDate?: string;
  blocker?: string;
  resultMarkdown?: string;
  cancellationReason?: string;
  terminalProvenance?: string;
  reactivationReason?: string;
  reactivationProvenance?: string;
  reactivatedAt?: string;
  provenance: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  archivedAt?: string;
};
export type WorkItem = {
  id: string;
  goalId?: string;
  /** @deprecated Use goalId. */
  projectId?: string;
  parentWorkItemId?: string;
  kind: "outcome" | "task" | "milestone" | "commitment";
  commitmentDirection?: "owed_by_user" | "owed_to_user";
  title: string;
  area?: string;
  descriptionMarkdown?: string;
  state: WorkState;
  priority: number;
  dueAt?: string;
  attentionAt?: string;
  personId?: string;
  blocker?: string;
  resultMarkdown?: string;
  cancellationReason?: string;
  terminalProvenance?: string;
  reactivationReason?: string;
  reactivationProvenance?: string;
  reactivatedAt?: string;
  provenance: string;
  sourceSessionId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  archivedAt?: string;
};
export type WorkItemListFilter =
  "open" | "active" | "planned" | "blocked" | "terminal" | "archived";
export type WorkItemListEntry = {
  item: WorkItem;
  goal?: Pick<Goal, "id" | "title" | "area" | "shape" | "lifecycle" | "priority" | "plannedStart" | "targetDate" | "hardDeadline" | "pauseReason" | "version" | "updatedAt">;
  /** @deprecated Bounded compatibility for older runtimes. */
  project?: Pick<
    Project,
    | "id"
    | "title"
    | "area"
    | "state"
    | "priority"
    | "targetDate"
    | "blocker"
    | "version"
    | "updatedAt"
  >;
  assignee?: { id: string; displayName: string };
  inUserAttention: boolean;
};
export type WorkItemListPage = {
  items: WorkItemListEntry[];
  cursor?: string;
  complete: boolean;
};
export type FocusTarget = { type: "project" | "work_item"; id: string };
export type ActiveWorkRecord =
  | ({
      target: { type: "project"; id: string };
      nextActions: WorkItem[];
    } & Project)
  | ({ target: { type: "work_item"; id: string }; nextActions: [] } & WorkItem);
export type ActiveWorkResponse = {
  version: number;
  records: ActiveWorkRecord[];
  capacity:
    | { state: "known"; count: number; limit: number; canAdd: boolean }
    | { state: "undisclosed" };
};
export type WorkSearchResponse = {
  results: Array<
    | { recordType: "project"; record: Project }
    | { recordType: "work_item"; record: WorkItem }
  >;
  complete: boolean;
};
export type WorkPerson = {
  id: string;
  displayName: string;
  relationship?: string;
  version: number;
};
export type ProjectChanges = {
  title?: string;
  area?: string | null;
  purposeMarkdown?: string;
  state?: "planned" | "active" | "blocked";
  priority?: number;
  startDate?: string | null;
  targetDate?: string | null;
  blocker?: string | null;
  provenance: string;
};
export type GoalChanges = {
  title?: string;
  area?: string | null;
  purposeMarkdown?: string;
  successDefinitionMarkdown?: string | null;
  shape?: GoalShape;
  lifecycle?: "idea" | "planned" | "active" | "paused";
  priority?: number;
  plannedStart?: string | null;
  targetDate?: string | null;
  hardDeadline?: string | null;
  currentPositionMarkdown?: string | null;
  pauseReason?: string | null;
  provenance: string;
};
export type WorkItemChanges = {
  goalId?: string | null;
  /** @deprecated Use goalId. */
  projectId?: string | null;
  parentWorkItemId?: string | null;
  kind?: "outcome" | "task" | "milestone" | "commitment";
  commitmentDirection?: "owed_by_user" | "owed_to_user" | null;
  title?: string;
  area?: string | null;
  descriptionMarkdown?: string;
  state?: "planned" | "active" | "blocked";
  priority?: number;
  dueAt?: string | null;
  attentionAt?: string | null;
  personId?: string | null;
  blocker?: string | null;
  provenance: string;
};
export type WorkMutationOutcome<T> =
  { status: "settled"; record: T; replayed: boolean };
export type WorkActivity = {
  id: string;
  occurredAt: string;
  operation: string;
  targetType: string;
  targetId: string;
  outcome: string;
  summary: string;
};
export type ProjectListFilter =
  "open" | "active" | "planned" | "blocked" | "terminal";
export type ProjectListEntry = {
  project: Project;
  visibleOpenWorkItemCount: number;
  visibleBlockedWorkItemCount?: number;
  visibleOverdueWorkItemCount?: number;
  nextOpenWorkItem?: Pick<
    WorkItem,
    | "id"
    | "projectId"
    | "parentWorkItemId"
    | "kind"
    | "title"
    | "area"
    | "state"
    | "priority"
    | "dueAt"
    | "attentionAt"
    | "blocker"
    | "version"
    | "updatedAt"
  >;
  inUserAttention: boolean;
  lastActivityAt?: string;
};
export type ProjectListPage = {
  items: ProjectListEntry[];
  cursor?: string;
  complete: boolean;
  /** Present on current runtimes; omitted only by older page producers. */
  coverage?:
    | { state: "complete" }
    | {
        state: "partial";
        omittedOrdinaryCollections: Array<"goal_activity">;
      };
};
export type GoalListFilter = "open" | "active" | "planned" | "paused" | "idea" | "terminal";
export type GoalListEntry = {
  goal: Goal;
  visibleOpenWorkItemCount: number;
  visibleBlockedWorkItemCount?: number;
  visibleOverdueWorkItemCount?: number;
  nextOpenWorkItem?: Pick<WorkItem, "id" | "goalId" | "parentWorkItemId" | "kind" | "title" | "area" | "state" | "priority" | "dueAt" | "attentionAt" | "blocker" | "version" | "updatedAt">;
  inUserAttention: boolean;
  lastActivityAt?: string;
};
export type GoalListPage = {
  items: GoalListEntry[];
  cursor?: string;
  complete: boolean;
  coverage?: ProjectListPage["coverage"];
};
export type WorkConnectionRelation =
  | "related_person"
  | "supporting_page"
  | "supporting_source"
  | "source_session"
  | "result_artifact"
  | "provider_record"
  | "provider_operation"
  | "depends_on"
  | "workspace_path"
  | "evidence_of";
export type WorkConnectionTarget =
  | {
      type:
        | "person"
        | "page"
        | "knowledge_source"
        | "session"
        | "artifact"
        | "project"
        | "work_item"
        | "workspace_path";
      id: string;
    }
  | {
      type: "provider_record" | "provider_operation";
      id: string;
      providerId: string;
      providerKind: string;
  };
export type WorkConnectionSummaryTarget = WorkConnectionTarget | { type: "unavailable" };
export type WorkConnectionSummary = {
  id: string;
  from: { type: "project" | "work_item"; id: string };
  relation: WorkConnectionRelation;
  target: WorkConnectionSummaryTarget;
  label: string;
  availability: "available" | "unverified" | "unavailable" | "degraded";
  destination?: BrainSearchDestination;
  verifiedAt?: string;
  createdAt: string;
};
export type WorkOutlineNode = {
  item: WorkItem;
  children: { items: WorkItem[]; cursor?: string; complete: boolean };
};
export type WorkOutlinePage = {
  nodes: WorkOutlineNode[];
  cursor?: string;
  complete: boolean;
};
export type ProjectWorkspaceView = {
  project: Project;
  focus: { inUserAttention: boolean; capacity: ActiveWorkResponse["capacity"] };
  work: WorkOutlinePage;
  connections: {
    items: WorkConnectionSummary[];
    cursor?: string;
    complete: boolean;
  };
  activity: { items: WorkActivity[]; cursor?: string; complete: boolean };
};
export type GoalWorkspaceView = Omit<ProjectWorkspaceView, "project"> & { goal: Goal };
export type WorkItemWorkspaceView = {
  item: WorkItem;
  assignee?: { id: string; displayName: string };
  goal?: Pick<Goal, "id" | "title" | "area" | "shape" | "lifecycle" | "priority" | "plannedStart" | "targetDate" | "hardDeadline" | "pauseReason" | "version" | "updatedAt">;
  /** @deprecated Bounded compatibility for older runtimes. */
  project?: Pick<
    Project,
    | "id"
    | "title"
    | "area"
    | "state"
    | "priority"
    | "targetDate"
    | "blocker"
    | "version"
    | "updatedAt"
  >;
  parent?: Pick<
    WorkItem,
    | "id"
    | "projectId"
    | "parentWorkItemId"
    | "kind"
    | "title"
    | "area"
    | "state"
    | "priority"
    | "dueAt"
    | "attentionAt"
    | "blocker"
    | "version"
    | "updatedAt"
  >;
  children: { items: WorkItem[]; cursor?: string; complete: boolean };
  focus: { inUserAttention: boolean; capacity: ActiveWorkResponse["capacity"] };
  connections: {
    items: WorkConnectionSummary[];
    cursor?: string;
    complete: boolean;
  };
  activity: { items: WorkActivity[]; cursor?: string; complete: boolean };
};
export type WorkDeletionOutcome =
  | {
      status: "waiting_confirmation";
      confirmations: Array<{
        confirmationId: string;
        expiresAt: string;
        purpose: "exact_deletion" | "restricted_record_mutation";
      }>;
      consequence: string;
      replayed: false;
    }
  | {
      status: "settled";
      deletion?: {
        surface: "project" | "work_item";
        id: string;
        deleted: true;
        negativeRead: true;
        erased: string[];
        independentSources: string[];
      };
      replayed: boolean;
    }
  | {
      status: "gone";
      surface: "project" | "work_item";
      id: string;
      replayed: boolean;
    }
  | {
      status: "stale";
      surface: "project" | "work_item";
      id: string;
      message: string;
      replayed: false;
    }
  | { status: "rejected" | "expired"; message: string; replayed: false }
  | {
      status: "uncertain";
      requestKey: string;
      message: string;
      retryable: true;
    };
export type WellbeingDeletionOutcome =
  | {
      status: "waiting_confirmation";
      confirmations: Array<{
        confirmationId: string;
        expiresAt: string;
        purpose: "exact_deletion" | "restricted_record_mutation";
      }>;
      consequence: string;
      replayed: false;
    }
  | {
      status: "settled";
      deletion: {
        surface: "wellbeing_record";
        id: string;
        deleted: true;
        negativeRead: true;
        erased: string[];
        independentSources: string[];
      };
      replayed: boolean;
    }
  | {
      status: "gone";
      surface: "wellbeing_record";
      id: string;
      replayed: boolean;
    }
  | {
      status: "stale";
      surface: "wellbeing_record";
      id: string;
      message: string;
      replayed: false;
    }
  | { status: "rejected" | "expired"; message: string; replayed: false }
  | {
      status: "uncertain";
      requestKey: string;
      message: string;
      retryable: true;
    };
export type BrainScope =
  | "profile"
  | "memory"
  | "pages"
  | "people"
  | "knowledge_sources"
  | "work"
  | "outputs";
export type BrainContextReference = ConversationContextSelection;
export type BrainSearchDestination = {
  kind:
    | "profile"
    | "memory"
    | "page"
    | "person"
    | "knowledge_source"
    | "project"
    | "work_item"
    | "output";
  /** Canonical product route authored by the runtime, never reconstructed from an opaque evidence handle. */
  path: string;
};
export type PersonalBrainSearchResult =
  | (BrainSearchRanking & {
      scope: "profile";
      display: SafeContextDisplay;
      preview: BrainValue;
      provenance: string;
      updatedAt: string;
      context: BrainContextReference;
    })
  | (BrainSearchRanking & {
      scope: "memory" | "pages";
      display: SafeContextDisplay;
      preview: string;
      provenance: string;
      updatedAt: string;
      context: BrainContextReference;
    })
  | (BrainSearchRanking & {
      scope: "people";
      display: SafeContextDisplay;
      preview?: string;
      provenance: string;
      updatedAt: string;
      context: BrainContextReference;
    })
  | (BrainSearchRanking & {
      scope: "knowledge_sources";
      display: SafeContextDisplay;
      preview: string;
      updatedAt: string;
      context: BrainContextReference;
    })
  | (BrainSearchRanking & {
      scope: "work";
      display: SafeContextDisplay;
      preview?: string;
      state: string;
      provenance: string;
      updatedAt: string;
      context: BrainContextReference;
    })
  | (BrainSearchRanking & {
      scope: "outputs";
      display: SafeContextDisplay;
      preview: string;
      mediaType: string;
      updatedAt: string;
      context: BrainContextReference;
    });
export type BrainSearchChannel = "lexical" | "semantic";
export type BrainSearchRanking = {
  matchChannels: BrainSearchChannel[];
  stableRank: number;
  matchReason: string;
  destination?: BrainSearchDestination;
};
export type BrainSearchChannelCoverage =
  | { channel: BrainSearchChannel; state: "complete" }
  | {
      channel: BrainSearchChannel;
      state: "limited";
      reason:
        | "authority_unavailable"
        | "bounded_text_subset"
        | "candidate_cap"
        | "semantic_index_incomplete"
        | "semantic_runtime_unavailable"
        | "semantic_model_mismatch"
        | "semantic_candidate_cap"
        | "metadata_only";
    }
  | {
      channel: BrainSearchChannel;
      state: "unavailable";
      reason:
        | "authority_unavailable"
        | "semantic_runtime_unavailable"
        | "semantic_model_mismatch";
    }
  | {
      channel: BrainSearchChannel;
      state: "unsupported";
      reason: "unsupported";
    };
export type BrainSearchScopeCoverage = {
  scope: BrainScope;
  state: "complete" | "limited" | "unavailable";
  usableCount: number;
  channels: BrainSearchChannelCoverage[];
};
export type BrainSearchSnapshotOmissions = {
  changed: number;
  gone: number;
  unavailable: number;
};
export type BrainSearchPage = {
  state: "ok" | "partial" | "unavailable";
  results: PersonalBrainSearchResult[];
  cursor?: string;
  complete: boolean;
  unavailableScopes: Array<{ scope: BrainScope; reason: "unavailable" }>;
  limitedScopes: Array<{
    scope: BrainScope;
    reason:
      | "semantic_index_incomplete"
      | "semantic_runtime_unavailable"
      | "semantic_model_mismatch"
      | "semantic_candidate_cap";
  }>;
  coverage: BrainSearchScopeCoverage[];
  snapshotOmissions: BrainSearchSnapshotOmissions;
};
export type BrainValue =
  | string
  | number
  | boolean
  | null
  | BrainValue[]
  | { [key: string]: BrainValue };
export type BrainCursorPage<T> = {
  items: T[];
  cursor?: string;
  complete: boolean;
};
export type BrainMutationOutcome<T> =
  | { status: "settled"; record: T; replayed: boolean }
  | { status: "conflict"; current: T; replayed: boolean }
  | { status: "gone"; replayed: boolean }
  | { status: "validation_failure"; message: string; replayed: boolean };
export type KnowledgeSourceIngestionFailureCategory =
  | "unsupported_format"
  | "invalid_signature"
  | "malformed_document"
  | "encrypted_document"
  | "image_only_pdf"
  | "source_too_large"
  | "extracted_text_too_large"
  | "processing_limit_exceeded"
  | "source_changed"
  | "unavailable";
export type KnowledgeSourceMutationOutcome<T> =
  | BrainMutationOutcome<T>
  | {
      status: "ingestion_failure";
      category: KnowledgeSourceIngestionFailureCategory;
      replayed: boolean;
    };
export type PersonalBrainSurface =
  | "memory"
  | "profile"
  | "page"
  | "person"
  | "knowledge-source";
export type PersonalBrainRecordMap = {
  memory: MemoryRecord;
  profile: ProfileRecord;
  page: BrainPage;
  person: PersonRecord;
  "knowledge-source": KnowledgeSource;
};
export type BrainDeletionOutcome =
  | {
      status: "waiting_confirmation";
      confirmations: Array<{
        confirmationId: string;
        expiresAt: string;
        purpose: "exact_deletion";
      }>;
      consequence: string;
      replayed: false;
    }
  | {
      status: "settled";
      id: string;
      surface: string;
      negativeRead: boolean;
      replayed: boolean;
      deletion?: {
        erased: string[];
        independentSources: string[];
      };
    }
  | {
      status: "gone";
      id: string;
      surface: string;
      negativeRead: true;
      replayed: boolean;
    }
  | {
      status: "conflict";
      current?:
        | MemoryRecord
        | ProfileRecord
        | BrainPage
        | PersonRecord
        | KnowledgeSource;
      replayed: boolean;
    }
  | { status: "rejected" | "expired"; message: string; replayed: false }
  | {
      status: "uncertain";
      requestKey: string;
      message: string;
      retryable: true;
    };
export type MemoryRecord = {
  id: string;
  content: string;
  status: "active" | "expired";
  provenance: string;
  confidence: number;
  sourceSessionId?: string;
  sourceUserEntryId?: string;
  sourceAssistantEntryId?: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
  score?: number;
};
export type MemoryRevision = {
  action: "remembered" | "corrected";
  content: string;
  previousContent?: string;
  occurredAt: string;
};
export type MemoryPipelineHealth = {
  automaticLearning: { enabled: boolean; updatedAt: string };
  processing: {
    state: "never_run" | "idle" | "processing" | "attention";
    pending: number;
    processing: number;
    failed: number;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
  };
  recent: Array<{
    state: "processing" | "empty" | "completed" | "retryable_failure" | "skipped";
    attempts: number;
    acceptedCount: number;
    updatedAt: string;
    failureCategory?:
      "credentials" | "embedding_runtime" | "provider" | "storage" | "unknown";
  }>;
  deletionReceipts: Array<{ occurredAt: string }>;
  processingBoundary: {
    extraction: "remote_model";
    embedding: "local_runtime";
    canonicalStorage: "local_sqlite";
  };
  complete: boolean;
};
export type ProfileRecord = {
  key: string;
  /** Present on canonical Profile page responses; optional for legacy local fixtures. */
  category?: ProfileCategory;
  value: BrainValue;
  provenance: string;
  version: number;
  createdAt?: string;
  updatedAt: string;
  state?: "confirmed" | "proposed" | "conflicted" | "archived" | "dismissed";
  mutability?: "editable" | "read_only";
  source?: ProfileSource;
  history?: Array<{
    version: number;
    action: "created" | "corrected" | "confirmed" | "dismissed" | "archived" | "restored" | "conflicted";
    provenance: string;
    state: "confirmed" | "proposed" | "conflicted" | "archived" | "dismissed";
    recordedAt: string;
  }>;
};
export type ProfileCategory =
  | "identity"
  | "communication"
  | "household"
  | "preferences"
  | "privacy"
  | "unknown";
export type ProfileSource =
  | {
      kind: "owner_entered" | "owner_corrected" | "owner_confirmed";
      label: "Saved by you" | "Corrected by you" | "Confirmed by you";
      correctionOwner: "owner";
    }
  | {
      kind: "kora_proposed";
      label: "Proposed by Kora";
      correctionOwner: "owner";
    }
  | {
      kind: "system_read_only";
      label: "System owned";
      correctionOwner: "source";
    };
export type ProfileOverview = {
  portrait: {
    sections: Array<{
      category: Exclude<ProfileCategory, "unknown">;
      statements: Array<{
        text: string;
        state: "confirmed" | "proposed" | "conflicted";
        mutability: "editable" | "read_only";
        support: { key: string; version: number };
        source?: ProfileSource;
      }>;
    }>;
  };
  review: {
    items: Array<{
      text: string;
      state: "proposed" | "conflicted";
      updatedAt: string;
      support: { key: string; version: number };
      source?: ProfileSource;
    }>;
    total: number;
    complete: boolean;
  };
  recentChanges: {
    items: Array<{
      action: ProfileHistoryEntry["action"];
      category: ProfileCategory;
      recordedAt: string;
      support: { key: string; version: number };
      source?: ProfileSource;
    }>;
    total: number;
    complete: boolean;
  };
  counts: {
    visible: number;
    active: number;
    setupArtifacts: number;
    byState: Record<NonNullable<ProfileRecord["state"]>, number>;
    byCategory: Record<ProfileCategory, number>;
  };
  complete: boolean;
  generatedAt: string;
};
export type ProfileHistoryEntry = {
  profileKey: string;
  version: number;
  action: "created" | "corrected" | "confirmed" | "dismissed" | "archived" | "restored" | "conflicted";
  provenance: string;
  state: "confirmed" | "proposed" | "conflicted" | "archived" | "dismissed";
  recordedAt: string;
};
export type BrainPage = {
  id: string;
  title: string;
  slug?: string;
  kind: "area" | "goal" | "note" | "reference";
  bodyMarkdown: string;
  provenance: string;
  state: "active" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type ProviderReference = {
  providerId: string;
  providerKind: string;
  recordId: string;
  label: string;
  availability?: "available" | "unverified" | "unavailable" | "degraded";
  verifiedAt?: string;
};
export type PersonRecord = {
  id: string;
  displayName: string;
  relationshipLabel?: string;
  contextMarkdown?: string;
  providerRefs: ProviderReference[];
  provenance: string;
  state: "active" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type KnowledgeSourceRetrievalRole =
  "default" | "task_relevant" | "deep_research" | "evidence_only";
export type KnowledgeSourceTemporalScope =
  "current" | "historical" | "mixed" | "unknown";
export type KnowledgeSource = {
  id: string;
  label: string;
  sourceKind: "file" | "inline";
  pathLabel?: string;
  format: "markdown" | "text" | "json" | "pdf" | "docx" | "xlsx" | "pptx" | "inline";
  mediaType: string;
  extraction: {
    parser: string;
    coverage: {
      status: "complete" | "partial";
      indexed: string[];
      omitted: string[];
      metrics?: Record<string, number>;
    };
  };
  retrievalRole: KnowledgeSourceRetrievalRole;
  temporalScope: KnowledgeSourceTemporalScope;
  freshness: "persisted" | "verified";
  version: number;
  contentHash: string;
  state: "active" | "unavailable";
  observedState?: "current" | "changed" | "unavailable";
  createdAt: string;
  updatedAt: string;
};
export type OutputSummary = {
  id: string;
  title?: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  role: "output";
  ownerSessionId?: string;
  ownerJobRunId?: string;
  createdAt: string;
  updatedAt: string;
  previewState: "ready" | "available" | "unsupported" | "not_requested";
};
export type ArtifactReference = {
  id: string;
  mediaType: string;
  title?: string;
};
export type ConversationAttachmentReference = {
  artifactId: string;
  mediaType: string;
  name?: string;
};
export type KoraCommandResult =
  | { kind: "message"; content: string }
  | {
      kind: "facts";
      title: string;
      facts: Array<{
        label: string;
        value: string;
        state?: "ready" | "attention" | "neutral";
      }>;
    }
  | {
      kind: "selection_required";
      title: string;
      options: Array<{
        id: string;
        value: string;
        label: string;
        description?: string;
      }>;
    }
  | { kind: "session_changed"; sessionId: string; summary?: string }
  | { kind: "run_started"; runId: string; sessionId: string }
  | {
      kind: "open_surface";
      surface: "settings" | "model_auth" | "resources" | "session_tree";
      reference?: string;
    }
  | { kind: "clipboard"; content: string; label: string }
  | {
      kind: "download";
      fileName: string;
      mediaType: string;
      content: string;
      summary: string;
    }
  | { kind: "external_link"; url: string; label: string; summary?: string }
  | {
      kind: "failure";
      title: string;
      message: string;
      code: string;
      retryable: boolean;
    }
  | { kind: "completed"; summary?: string };
export type ConversationItem =
  | {
      id: string;
      kind: "user_message";
      status: "completed";
      createdAt: string;
      content: PublicMessagePart[];
    }
  | {
      id: string;
      kind: "assistant_message";
      status: ConversationItemStatus;
      createdAt: string;
      content: string;
      failure?: ConversationRunFailure;
      citations?: KoraBrainCitationReceipt[];
      grounding?: KoraBrainGrounding;
    }
  | {
      id: string;
      kind: "reasoning_summary";
      status: ConversationItemStatus;
      createdAt: string;
      content: string;
      source: "provider_summary";
    }
  | {
      id: string;
      kind: "tool_activity";
      status: ConversationItemStatus;
      createdAt: string;
      toolCallId: string;
      toolName: string;
      label: string;
      summary?: string;
      durationMs?: number;
      artifacts?: ArtifactReference[];
      detail?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "skill_activity";
      status: ConversationItemStatus;
      createdAt: string;
      name: string;
      description?: string;
      invocation: "explicit" | "implicit";
    }
  | {
      id: string;
      kind: "capability_activity";
      status: ConversationItemStatus;
      createdAt: string;
      name: string;
      summary?: string;
    }
  | {
      id: string;
      kind: "command_result";
      status: ConversationItemStatus;
      createdAt: string;
      command: string;
      result: KoraCommandResult;
    }
  | {
      id: string;
      kind: "approval";
      status: ConversationItemStatus;
      createdAt: string;
      approvalId: string;
      title: string;
      target: string;
      consequence: string;
      expiresAt?: string;
      resolvedAs?: "approved" | "rejected" | "expired";
    }
  | {
      id: string;
      kind: "artifact";
      status: ConversationItemStatus;
      createdAt: string;
      artifact: ArtifactReference;
      provenance?: string;
    };
export type ConversationInvocation =
  | { kind: "user_message"; content: ConversationInputPart[] }
  | { kind: "command"; command: string };
export type PublicConversationInvocation =
  | { kind: "user_message"; content: PublicMessagePart[] }
  | { kind: "command"; command: string };
export type ConversationEvent = {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  sessionId: string;
  runId: string;
  createdAt: string;
  type:
    | "run.started"
    | "run.status_changed"
    | "item.started"
    | "item.delta"
    | "item.completed"
    | "item.failed"
    | "queue.updated"
    | "approval.requested"
    | "approval.resolved"
    | "run.completed";
  payload: Record<string, unknown>;
};
export type ConversationRunSnapshot = {
  schemaVersion: 1;
  runId: string;
  sessionId: string;
  clientRequestId: string;
  acceptedEntryId: string;
  invocation: PublicConversationInvocation;
  phase: ConversationRunPhase;
  terminalStatus?: "completed" | "failed" | "stopped";
  failure?: ConversationRunFailure;
  stopRequested: boolean;
  acceptedAt: string;
  completedAt?: string;
  items: ConversationItem[];
  queue: Array<{
    id: string;
    clientRequestId?: string;
    kind: "follow_up" | "next_turn" | "steer";
    content: string;
    attachments?: ArtifactReference[];
    context?: ConversationContextReceipt[];
  }>;
  lastSequence: number;
};
export type CanonicalConversationTurn = {
  id: string;
  acceptedEntryId: string;
  clientRequestId?: string;
  createdAt: string;
  items: ConversationItem[];
};
export type ConversationTranscript = {
  sessionId: string;
  turns: CanonicalConversationTurn[];
  page: { hasMore: boolean; nextBefore?: string };
};
export type KoraCommandDefinition = {
  commandId: string;
  name: string;
  canonicalInvocation: string;
  sourceKind: "builtin" | "skill" | "prompt_template" | "extension";
  source?: { kind: "bundled" | "user-approved"; label: string };
  durability: "canonical_turn" | "transient";
  aliases: string[];
  description: string;
  category: "conversation" | "session" | "model" | "resource" | "system";
  availability: "always" | "idle_only" | "running_allowed";
  arguments: Array<{
    name: string;
    required: boolean;
    kind: "text" | "session" | "model" | "provider" | "skill" | "reasoning";
    description?: string;
  }>;
};
export type NativeToolConfirmation = {
  id: string;
  toolName: string;
  argumentsHash: string;
  state:
    | "pending"
    | "approved"
    | "consumed"
    | "rejected"
    | "expired"
    | "unavailable";
  owner:
    | {
        kind: "foreground";
        sessionId: string;
        nativeRunId: string;
        toolCallId: string;
      }
    | {
        kind: "schedule";
        sessionId: string;
        scheduleRunId: string;
        toolCallId: string;
      }
    | null;
  presentation: {
    action: string;
    target: string;
    consequence: string;
    risk:
      "external" | "destructive" | "private" | "financial" | "high_risk_local";
    calendar?: NativeCalendarScheduleProposal;
    technical?: Array<{ label: string; value: string }>;
  };
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  consumedAt?: string;
};
export type NativeCalendarScheduleProposal = {
  kind: "schedule_proposal";
  operation: "create" | "update" | "delete";
  source: { authority: "kora" | "google"; calendarId: string; label: string };
  scope: string;
  notifications: "all" | "externalOnly" | "none";
  affectedEvents: Array<{
    calendarId: string;
    eventId?: string;
    title: string;
    fields: Array<{ name: string; before?: string; after?: string }>;
  }>;
};
export type LifeSourceState =
  | { state: "ok" }
  | { state: "partial"; unavailableSources: string[]; reason?: string }
  | { state: "unavailable"; reason?: string };
export type LifeOverviewDomain = "money" | "wellbeing" | "about_you";
export type LifeOverviewDayInput = {
  viewerDate: string;
  viewerTimeZone: string;
};
export type LifeOverviewSource = {
  id: LifeOverviewDomain;
  label: string;
  state: "current" | "partial" | "unavailable" | "not_configured";
  authority: string;
  lastSuccessfulRead?: string;
  limitation?: string;
  privacyEffect: string;
  recoveryOwner: "user" | "kora" | "provider";
};
export type LifeOverviewMoment = {
  id: string;
  kind: "obligation_due" | "wellbeing_care" | "confirmation_deadline";
  domain: LifeOverviewDomain;
  title: string;
  explanation: string;
  horizon: string;
  horizonTimeZone?: string;
  sourceId: LifeOverviewDomain;
  sourceFreshness: string;
  destination: string;
  priority: {
    consequence: 0 | 1 | 2 | 3;
    timeProximity: 0 | 1 | 2 | 3;
    userReviewRequired: boolean;
    sourceConfidence: 0 | 1 | 2 | 3;
  };
};
export type LifeOverviewDay = {
  viewerDate: string;
  viewerTimeZone: string;
  items: LifeOverviewMoment[];
  totalCount: number;
  clipped: boolean;
};
export type LifeOverviewSignal = {
  domain: LifeOverviewDomain;
  label: string;
  state: string;
  support: string;
  destination: string;
  sourceId: LifeOverviewDomain;
  updatedAt?: string;
  amountMinor?: number;
  currency?: string;
};
export type LifeOverviewThreadEvent = {
  id: string;
  kind:
    | "wellbeing_logged"
    | "preference_confirmed"
    | "obligation_due"
    | "record_restored"
    | "record_archived"
    | "proposal_accepted"
    | "proposal_corrected"
    | "profile_changed";
  domain: LifeOverviewDomain;
  occurredAt: string;
  title: string;
  detail: string;
  destination: string;
  sourceId: LifeOverviewDomain;
};
export type LifeOverview = {
  generatedAt: string;
  status: "current" | "review" | "partial" | "setup" | "unavailable";
  orientation: { currentSources: number; needsReview: number };
  rightNow: LifeOverviewMoment | null;
  attentionCandidatesTotal: number;
  next: LifeOverviewMoment[];
  signals: LifeOverviewSignal[];
  sources: LifeOverviewSource[];
  thread: {
    items: LifeOverviewThreadEvent[];
    cursor?: string;
    complete: boolean;
  };
  restrictedOmitted: boolean;
  day?: LifeOverviewDay;
};
export type TodayWorkEntry = {
  item: WorkItem;
  timing: "overdue" | "today" | "future";
  due: {
    kind: "instant";
    instant: string;
    viewerDate: string;
  };
  canonicalRoute: string;
};
export type TodaySettledWorkEntry = {
  item: WorkItem;
  disposition: "completed" | "cancelled";
  settledAt: string;
  viewerDate: string;
  canonicalRoute: string;
};
export type TodayAttentionWorkEntry = {
  item: WorkItem;
  timing: "overdue" | "today";
  attention: {
    kind: "instant";
    instant: string;
    viewerDate: string;
  };
  canonicalRoute: string;
};
export type TodayAffectedObject =
  | {
      objectKind: "project" | "work_item";
      id: string;
      state: "current" | "cancelled" | "archived";
      title: string;
      canonicalRoute: string;
    }
  | {
      objectKind: "project" | "work_item";
      id: string;
      state: "deleted";
    };
export type TodayOutcome = {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  relevance: {
    kind: "current_viewer_day";
    viewerDate: string;
  };
  evidence: {
    kind: "schedule_run";
    scheduleId: string;
    runId: string;
    canonicalRoute: string;
  };
  freshness: {
    state: "current";
    observedAt: string;
  };
  affectedObjects: TodayAffectedObject[];
};
export type TodayContinuityReference =
  | {
      objectKind: "project" | "work_item";
      id: string;
      state: "cancelled" | "archived";
      title: string;
      canonicalRoute: string;
    }
  | {
      objectKind: "project" | "work_item";
      id: string;
      state: "deleted";
    };
export type LifeTodayFeed = {
  generatedAt: string;
  date: string;
  viewerTimeZone: string;
  viewerTimeZoneAuthority: {
    source: "profile" | "system" | "utc";
    reason?: string;
  };
  freshness: {
    state: "current";
    generatedAt: string;
    viewerDate: string;
    viewerTimeZone: string;
    nextDayChangeAt: string;
  };
  assistantActivity: Array<{
    scheduleName: string;
    run: NativeScheduleRun;
    project?: { id: string; title: string };
  }>;
  calendar: CalendarEvent[];
  work: {
    current: {
      items: TodayWorkEntry[];
      totalCount: number;
      overdueCount: number;
      todayCount: number;
      clipped: boolean;
    };
    future: {
      items: TodayWorkEntry[];
      totalCount: number;
      clipped: boolean;
    };
    attention?: {
      items: TodayAttentionWorkEntry[];
      totalCount: number;
      clipped: boolean;
    };
    settled: {
      items: TodaySettledWorkEntry[];
      totalCount: number;
      clipped: boolean;
      order: "settled_at_descending";
    };
    order: "overdue_then_due_ascending_priority_descending";
    viewAllRoute: "/work/tasks";
  };
  dueCommitments: WorkItem[];
  outcomes?: {
    items: TodayOutcome[];
    totalCount: number;
    clipped: boolean;
    viewAllRoute: "/settings/schedules";
  };
  continuityReferences: TodayContinuityReference[];
  pendingConfirmations: NativeToolConfirmation[];
  sources: {
    schedules: LifeSourceState;
    calendar: LifeSourceState;
    native_work: LifeSourceState;
    confirmations: LifeSourceState;
  };
};
export type WellbeingRecordKind =
  | "meal"
  | "drink"
  | "observation"
  | "symptom"
  | "measurement"
  | "medication_plan"
  | "dose"
  | "appointment"
  | "care_document"
  | "routine"
  | "routine_checkin"
  | "note";
export type WellbeingRecordSource = {
  kind: "manual" | "agent" | "provider" | "imported";
  label: string;
  providerId?: string;
  sourceId?: string;
};
export type WellbeingPayloadByKind = {
  meal: {
    description?: string;
    foods?: string[];
    tags?: string[];
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    notes?: string;
    interpretation?: {
      state: "proposed" | "confirmed";
      items: Array<{ name: string; portion?: string }>;
      tags?: string[];
      generatedAt?: string;
    };
    evidence?: {
      state: "available" | "unavailable";
      label: string;
      artifactId?: string;
    };
  };
  drink: { name: string; volumeMl?: number; notes?: string };
  observation: {
    category: "mood" | "energy" | "sleep" | "digestion" | "other";
    value?: string;
    rating?: number;
    notes?: string;
  };
  symptom: { name: string; severity?: number; notes?: string };
  measurement: { metric: string; value: number; unit: string; notes?: string };
  medication_plan: {
    medication: string;
    instructions: string;
    schedule?: string;
    prescriber?: string;
    active: boolean;
    notes?: string;
  };
  dose: {
    medication: string;
    amount?: string;
    takenAt: string;
    status: "taken" | "skipped" | "missed";
    notes?: string;
  };
  appointment: {
    startsAt: string;
    clinician?: string;
    specialty?: string;
    location?: string;
    notes?: string;
  };
  care_document: { name: string; artifactId?: string; notes?: string };
  routine: {
    name: string;
    cadence: string;
    cue?: string;
    reason?: string;
    enabled: boolean;
    preferredWindow?: "morning" | "afternoon" | "evening" | "anytime";
    daysOfWeek?: number[];
    completionChoices?: Array<"done" | "skipped">;
    noteRequired?: boolean;
    carePlanId?: string;
  };
  routine_checkin: {
    name: string;
    routineId?: string;
    status: "done" | "skipped";
    notes?: string;
  };
  note: { body: string };
};
export type WellbeingRecordDraft<
  K extends WellbeingRecordKind = WellbeingRecordKind,
> = {
  kind: K;
  title: string;
  payload: WellbeingPayloadByKind[K];
  recordedAt: string;
  privacy: "private" | "restricted";
  source: WellbeingRecordSource;
};
export type WellbeingRecord<
  K extends WellbeingRecordKind = WellbeingRecordKind,
> = WellbeingRecordDraft<K> & {
  id: string;
  state: "active" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
export type WellbeingRecordPage = {
  items: WellbeingRecord[];
  cursor?: string;
  complete: boolean;
  restrictedOmitted: boolean;
  visibleTotal?: number;
};
export type WellbeingRecordRevision = {
  version: number;
  action: "created" | "updated" | "archived" | "restored";
  recordedAt: string;
  record: WellbeingRecord;
};
export type WellbeingRecordChanges = {
  title?: string;
  payload?: WellbeingPayloadByKind[WellbeingRecordKind];
  recordedAt?: string;
  privacy?: "private" | "restricted";
  source?: WellbeingRecordSource;
};
export type WellbeingSourceCoverage = {
  state: "local_only" | "saved_external_records" | "partial" | "unavailable";
  local: {
    state: "current";
    visibleRecordCount: number;
    lastRecordedAt?: string;
    dataKinds?: WellbeingRecordKind[];
  };
  external: Array<{
    id: string;
    kind: "provider" | "imported";
    label: string;
    providerId?: string;
    state:
      | "saved_only"
      | "current"
      | "partial"
      | "unavailable"
      | "not_configured"
      | "permission_restricted"
      | "no_data";
    visibleRecordCount: number;
    lastRecordedAt?: string;
    lastSuccessfulAt?: string;
    dataKinds?: WellbeingRecordKind[];
    coverage?: string;
    limitation?: string;
    recoveryOwner: string;
    recoveryPath?: string;
  }>;
  complete: boolean;
  restrictedOmitted?: boolean;
};
export type WellbeingPrivacyOverview = {
  policy: {
    state: "read_only";
    defaultPrivacy: "private";
    storageAuthority: "local_sqlite";
    writableControls: false;
  };
  ordinaryUse: {
    permittedPrivateRecords: "wellbeing_workspace";
    conversationUse: "shared_personal_information_policy";
    restrictedRecords: "omitted";
    restrictedCounts: "omitted";
  };
  exactRestrictedAccess: {
    enforcement: "record_version_purpose_request_expiry";
    permittedPurpose: "kora_context_attachment";
    visualRead: "unavailable";
    wellbeingControl: "unavailable";
  };
  controls: {
    recordCorrection: "records";
    archiveRestore: "records";
    exactDeletion: "records";
    policyEditing: "unavailable";
    privacyHistory: "unavailable";
  };
};
export type WellbeingTrendRangeKey = "7d" | "30d" | "3m" | "6m" | "1y" | "custom";
export type WellbeingTrendMetric = {
  key: string;
  metric: string;
  unit: string;
  visibleRecordCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
  sources: Array<{ kind: WellbeingRecordSource["kind"]; label: string; providerId?: string }>;
};
export type WellbeingTrendMetricCatalog = {
  metrics: WellbeingTrendMetric[];
  restrictedOmitted: boolean;
  excludedRecordCount: number;
  complete: boolean;
};
export type WellbeingTrendPoint = {
  id: string;
  mode: "raw" | "aggregated";
  time: string;
  rangeStart: string;
  rangeEnd: string;
  value: number;
  metric: string;
  unit: string;
  exactRecordCount: number;
  recordIds: string[];
  evidenceHandle: string;
  evidenceComplete: boolean;
  aggregationMethod: "exact_value" | "arithmetic_mean";
  sourceLabels: string[];
};
export type WellbeingTrendBaseline =
  | { qualification: "qualified"; label: "Personal recorded baseline"; lower: number; upper: number; median: number; exactRecordCount: number; recordedDayCount: number; restrictedOmitted: false; excludedRecordCount: 0; complete: true; window: { start: string; end: string }; policy: string }
  | { qualification: "unqualified"; label: "Personal recorded baseline"; reason: string; exactRecordCount: number; recordedDayCount: number; restrictedOmitted: boolean; excludedRecordCount: number; complete: boolean; window: { start: string; end: string }; policy: string };
export type WellbeingTrendOverlay = {
  key: string;
  kind: "tag" | "symptom" | "routine_checkin";
  label: string;
  exactRecordCount: number;
  recordIds: string[];
  evidenceHandle: string;
  complete: boolean;
};
export type WellbeingTrendIntervalProvenance = {
  kind: "provider_report" | "import_manifest";
  reference: string;
  observedAt: string;
  completeness: "complete" | "partial";
  limitation?: string;
};
export type WellbeingTrendIntervalProjection = {
  id: string;
  start: string;
  end: string;
  label: string;
  source: { kind: "provider" | "imported"; label: string; providerId?: string; sourceId?: string };
  provenance: WellbeingTrendIntervalProvenance;
  evidence: { intervalId: string; version: number };
};
export type WellbeingTrendIntervalCoverage =
  | { state: "unsupported"; reason: string; restrictedOmitted: boolean }
  | {
      state: "explicit" | "partial";
      reason: string;
      restrictedOmitted: boolean;
      sources: Array<{
        key: string;
        kind: "provider" | "imported";
        label: string;
        providerId?: string;
        sourceId?: string;
        completeness: "complete" | "partial";
      }>;
    };
export type WellbeingTrendEvidencePage = { evidenceHandle: string; recordIds: string[]; totalExactRecords: number; cursor?: string; complete: boolean };
export type WellbeingTrendResult = {
  status: "no_records" | "insufficient" | "sufficient_no_supported_pattern" | "partial" | "unavailable" | "metric_unavailable";
  generatedAt: string;
  viewerTimeZone: string;
  metric?: WellbeingTrendMetric;
  range: { key: WellbeingTrendRangeKey; start: string; end: string; startDate: string; endDate: string };
  points: WellbeingTrendPoint[];
  totalExactRecords: number;
  excludedRecordCount: number;
  restrictedOmitted: boolean;
  seriesMode: "raw" | "aggregated";
  seriesQualification: { state: "no_records" | "insufficient" | "sufficient" | "partial" | "unavailable"; exactRecordCount: number; recordedDayCount: number; policyKey?: string; requiredRecords?: number; requiredDays?: number; reason: string; policy: string };
  sourceQualification: { state: "complete" | "partial" | "unavailable"; sources: WellbeingSourceCoverage; limitation?: string };
  baseline: WellbeingTrendBaseline;
  missingSpans: WellbeingTrendIntervalProjection[];
  outageAnnotations: WellbeingTrendIntervalProjection[];
  intervalCoverage: WellbeingTrendIntervalCoverage;
  observations: { state: "unsupported"; items: [] };
  overlaps: { state: "unsupported"; items: [] };
  overlayCatalog: { items: WellbeingTrendOverlay[]; totalItems: number; complete: boolean; restrictedOmitted: boolean };
  selectedOverlays: { items: Array<{ id: string; key: string; time: string; label: string; recordId: string }>; totalExactRecords: number; complete: boolean };
  koraContext?: { metricKey: string; range: { start: string; end: string }; exactRecordIds: string[]; totalExactRecords: number; complete: boolean; caution: string };
};
export type FinanceSources = Record<string, LifeSourceState>;
export type FinanceConnectionSource = {
  connectionId: string;
  providerId: string;
  providerConnectionId: string | null;
  state:
    | "current"
    | "stale"
    | "partial"
    | "reauthorization_required"
    | "manual"
    | "unavailable"
    | "not_configured";
  accountCount: number;
  permissions: string[];
  coveredDataKinds: string[];
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  unavailableReason: string | null;
  recoveryOwner: string;
  updatedAt: string;
};
export type FinanceAccount = {
  accountId: string;
  connectionId: string;
  providerId?: string;
  providerAccountId?: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: number | null;
  updatedAt: string;
  connectionState?: FinanceConnectionSource["state"];
  lastSyncedAt?: string | null;
  balanceQualification?:
    "current" | "last_confirmed" | "manual" | "unavailable";
  includedInAllowance?: boolean;
  allowanceInclusionReason?: string;
  linkedRecurringCount?: number;
  recentActivity?: FinanceTransaction[];
};
export type FinanceAccountsRead = {
  accounts: FinanceAccount[];
  connections: FinanceConnectionSource[];
  complete: boolean;
  cursor?: string;
  total?: number;
  viewerTimeZone: string;
  sources: FinanceSources;
};
export type FinanceTransaction = {
  id: string;
  connectionId: string;
  providerTransactionId: string;
  accountId: string;
  accountName: string;
  accountType: string;
  amountMinor: number;
  currency: string;
  merchant: string | null;
  description?: string | null;
  occurredAt: string;
  pending: boolean;
  updatedAt: string;
  note?: string;
  category?: string | null;
  annotationVersion?: number;
  annotationUpdatedAt?: string | null;
  evidenceState?: "matched" | "needs_review" | "none" | "unknown";
  freshness?: "current" | "last_confirmed" | "manual";
  lastSyncedAt?: string | null;
};
export type FinanceTransactionQuery = {
  transactionId?: string;
  accountId?: string;
  query?: string;
  merchant?: string;
  direction?: "inflow" | "outflow" | "all";
  pending?: "only" | "exclude" | "all";
  fromDate?: string;
  toDate?: string;
  category?: string;
  evidence?: "matched" | "needs_review" | "none" | "all";
  freshness?: "current" | "last_confirmed" | "manual" | "all";
  review?: "only";
  sort?: "newest" | "oldest" | "amount_desc" | "amount_asc";
  cursor?: string;
  pageSize?: number;
};
export type FinanceReceiptQuery = {
  transactionIds?: string[];
  cursor?: string;
  pageSize?: number;
};
export type FinanceSnapshot = {
  generatedAt: string;
  viewerTimeZone: string;
  dailyPostedOutflows: Array<{ date: string; currency?: string; amountMinor: number }>;
  window: {
    days: number;
    cutoff: string;
    transactionLimit: number;
    totalTransactions: number;
    returnedTransactions: number;
    clipped: boolean;
    oldestTransactionAt: string | null;
    newestTransactionAt: string | null;
    pendingTransactions: number;
  };
  connections: Array<{
    connectionId: string;
    providerId: string;
    state: string;
    lastSyncedAt: string | null;
    updatedAt: string;
  }>;
  accounts: Array<{
    accountId: string;
    connectionId: string;
    name: string;
    type: string;
    currency: string;
    balanceMinor: number | null;
    updatedAt: string;
  }>;
  monthlyCashFlow: Array<{
    month: string;
    currency: string;
    inflowMinor: number;
    outflowMinor: number;
    netCashFlowMinor: number;
    pendingInflowMinor: number;
    pendingOutflowMinor: number;
    transactionCount: number;
  }>;
  transactions: Array<{
    occurredAt: string;
    amountMinor: number;
    currency: string;
    merchant: string | null;
    description?: string | null;
    pending: number;
    accountName: string;
    accountType: string;
    connectionId: string;
  }>;
  plans: {
    budgets: { records: unknown[] };
    bills: { records: unknown[] };
    goals: { records: unknown[] };
    subscriptions: { records: unknown[] };
    alerts: { records: unknown[] };
  };
  sources: FinanceSources;
};
export type FinanceAllowance = {
  generatedAt: string;
  viewerTimeZone: string;
  currency: string | null;
  includedAccountIds: string[];
  usedDepositoryFallback: boolean;
  availableBalanceMinor: number | null;
  upcomingObligationsMinor: number | null;
  incomeExpectedMinor: number | null;
  bufferMinor: number | null;
  dailyFloorMinor: number | null;
  monthToDateOutflowMinor: number | null;
  remainingDays: number | null;
  planningRemainderMinor: number | null;
  dailyAllowanceMinor: number | null;
  status: "over_floor" | "within_plan" | "unsupported";
  isNonPositive: boolean | null;
  unsupportedReason?: "mixed_currency" | "unknown_balance" | "unknown_currency" | "unlinked_obligation";
  currencies?: string[];
  explanation: string;
  sources: FinanceSources;
};
export type FinanceAllowanceSettings = {
  includedAccountIds: string[];
  dailyFloorMinor: number;
  bufferMinor: number;
  obligationHorizonDays: number;
  updatedAt: string;
  version: number;
  sources: FinanceSources;
};
export type FinanceBudget = {
  id: string;
  displayName: string;
  periodKind: string;
  category?: string | null;
  accountId?: string | null;
  targetAmountMinor: number;
  currency: string;
  state: string;
  updatedAt: string;
};
export type FinanceObligationEvidence =
  | {
      actionKey: string;
      evidenceKind: "corroborated_creation";
      receiptId: string;
      transactionId?: string | null;
      details: {
        corroboratingReceiptId?: string;
        corroboratingTransactionId: string;
        cadence: "weekly" | "monthly" | "quarterly" | "annual";
      };
      createdAt: string;
      observedAmountMinor?: number | null;
      observedCurrency?: string | null;
      observedAt?: string | null;
    }
  | {
      actionKey: string;
      evidenceKind: "installment_settlement";
      receiptId: string;
      transactionId?: string | null;
      details: { previousRemaining: number; remaining: number };
      createdAt: string;
      observedAmountMinor?: number | null;
      observedCurrency?: string | null;
      observedAt?: string | null;
    };
export type FinanceBill = {
  id: string;
  billerName: string;
  expectedAmountMinor?: number | null;
  expectedAmountMinMinor?: number | null;
  expectedAmountMaxMinor?: number | null;
  category?: string | null;
  dueRule?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  currency?: string | null;
  autopayState?: string | null;
  installmentsTotal?: number | null;
  installmentsRemaining?: number | null;
  provenance?: string | null;
  nextExpectedAt?: string | null;
  reconciliationEvidence: FinanceObligationEvidence[];
  state: string;
  updatedAt: string;
};
export type FinanceSubscription = {
  id: string;
  merchantName: string;
  accountId?: string | null;
  accountName?: string | null;
  currency?: string | null;
  cadence?: string | null;
  expectedAmountMinor?: number | null;
  expectedAmountMinMinor?: number | null;
  expectedAmountMaxMinor?: number | null;
  category?: string | null;
  lastSeenDate?: string | null;
  provenance?: string | null;
  nextExpectedAt?: string | null;
  reconciliationEvidence: FinanceObligationEvidence[];
  state: string;
  updatedAt: string;
};
export type FinanceGoal = {
  id: string;
  displayName: string;
  goalKind: string;
  targetAmountMinor?: number | null;
  currentAmountMinor?: number | null;
  currency: string;
  linkedAccountIds: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
  state: string;
  updatedAt: string;
};
export type FinanceReceipt = {
  id: string;
  gmailMessageId: string;
  subject?: string | null;
  sender?: string | null;
  extractedMerchant?: string | null;
  extractedAmountMinor?: number | null;
  extractedCurrency?: string | null;
  extractedDate?: string | null;
  extractionConfidence: string;
  matchState: string;
  matchedTransactionId?: string | null;
  candidateTransactionIds: string[];
  candidates?: Array<{
    transactionId: string;
    confidence: "high" | "medium" | "low";
    reasons: string[];
    merchant: string | null;
    amountMinor: number;
    currency: string;
    occurredAt: string;
    accountName: string;
  }>;
  matchConfidence?: string | null;
  reviewedByUser: boolean;
  version?: number;
  history?: Array<{
    version: number;
    action: "confirm_match" | "reject_match" | "dismiss" | "create_bill" | "create_subscription";
    transactionId?: string | null;
    outcome: "settled" | "conflict" | "gone";
    recordedAt: string;
  }>;
  updatedAt: string;
};
export type FinanceTransactionAnnotationOutcome =
  | { status: "settled"; annotation: { note: string; category: string | null; version: number; updatedAt: string }; history: Array<{ version: number; note: string; category: string | null; action: "created" | "updated"; recordedAt: string }> }
  | { status: "conflict"; current: { note: string; category: string | null; version: number; updatedAt: string | null } }
  | { status: "gone" };
export type FinanceReceiptResolutionOutcome =
  | { status: "settled"; receipt: FinanceReceipt; bill?: FinanceBill; subscription?: FinanceSubscription; sources: FinanceSources }
  | { status: "conflict"; current: FinanceReceipt }
  | { status: "gone" };
export type NativeArtifact = {
  id: string;
  title?: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  role: "output" | "attachment" | "preview";
  sourceArtifactId?: string;
  ownerSessionId?: string;
  ownerJobRunId?: string;
  createdAt: string;
  updatedAt: string;
  previews?: Array<ArtifactReference & { byteSize: number }>;
  text?: string;
  data?: string;
};
export type NativeThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type NativeAuthInteractionEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: "progress"; message: string }
  | {
      type: "prompt";
      promptId: string;
      prompt:
        | {
            type: "text" | "secret" | "manual_code";
            message: string;
            placeholder?: string;
          }
        | {
            type: "select";
            message: string;
            options: readonly {
              id: string;
              label: string;
              description?: string;
            }[];
          };
    }
  | { type: "complete"; provider: string; method: "oauth" | "api-key" }
  | { type: "failed"; message: string }
  | { type: "expired"; message?: string }
  | { type: "cancelled" }
  | { type: "waiting" };
export type NativeModelCatalog = Array<{
  id: string;
  name: string;
  configured: boolean;
  entitlement: "unknown";
  authMethods: Array<"oauth" | "api-key">;
  authError?: string;
  models: Array<{
    id: string;
    name: string;
    input: string[];
    reasoning: NativeThinkingLevel[];
  }>;
}>;

export type RendererConnection = {
  runtimeId: string;
  runtimeKind: "kora-native";
  protocolVersion: "2";
  pid: number;
  url: string;
  token: string;
  startedAt: string;
};

export type HostFailure = {
  code: string;
  message: string;
  canRetry: boolean;
  canRestart: boolean;
  requestId?: string;
  stage?: string;
};

type NativeProblem = {
  error?: { code?: string; message?: string; requestId?: string };
};

export class RuntimeRequestError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly canRetry?: boolean;
  readonly canRestart?: boolean;
  readonly stage?: string;

  constructor(
    message: string,
    options: {
      code: string;
      status?: number;
      requestId?: string;
      canRetry?: boolean;
      canRestart?: boolean;
      stage?: string;
    },
  ) {
    super(message);
    this.name = "RuntimeRequestError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.canRetry = options.canRetry;
    this.canRestart = options.canRestart;
    this.stage = options.stage;
  }
}

const nativeInvoke =
  typeof window !== "undefined"
    ? (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } })
        .__TAURI_INTERNALS__?.invoke
    : undefined;

type PublicRendererConnection = Omit<RendererConnection, "token">;
type ActiveConnection =
  | { kind: "native"; value: RendererConnection }
  | { kind: "remote"; value: PublicRendererConnection };
let connection: ActiveConnection | null = null;

export function selectRuntimeTransport(
  remoteDevelopment: boolean,
  invokeCapability: unknown,
): "native" | "remote" | "unavailable" {
  if (typeof invokeCapability === "function") return "native";
  if (remoteDevelopment) return "remote";
  return "unavailable";
}

const transport = selectRuntimeTransport(
  import.meta.env.VITE_KORA_REMOTE === "true",
  nativeInvoke,
);
export const isRemoteDevelopment = transport === "remote";

function readRemoteAccessKey() {
  if (!isRemoteDevelopment || typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  const supplied = query.get("access")?.trim();
  if (supplied) {
    window.sessionStorage.setItem("kora:remote-development-access", supplied);
    query.delete("access");
    const search = query.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }
  return (
    supplied ??
    window.sessionStorage.getItem("kora:remote-development-access") ??
    undefined
  );
}

const remoteAccessKey = readRemoteAccessKey();

const publicConnection = (value: PublicRendererConnection) => ({
  runtimeId: value.runtimeId,
  runtimeKind: value.runtimeKind,
  protocolVersion: value.protocolVersion,
  pid: value.pid,
  url: value.url,
  startedAt: value.startedAt,
});

async function nativeHostConnection(
  command: "prepare_runtime" | "restart_runtime",
) {
  try {
    const value = await invoke<RendererConnection>(command);
    if (value.runtimeKind !== "kora-native" || value.protocolVersion !== "2") {
      throw new RuntimeRequestError(
        "The Windows host returned an incompatible Kora runtime.",
        {
          code: "runtime_incompatible",
        },
      );
    }
    connection = { kind: "native", value };
    return publicConnection(value);
  } catch (error) {
    if (error instanceof RuntimeRequestError) throw error;
    const failure = error as Partial<HostFailure>;
    throw new RuntimeRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Kora's Windows host is unavailable.",
      {
        code:
          typeof failure?.code === "string" ? failure.code : "host_unavailable",
        canRetry: failure.canRetry,
        canRestart: failure.canRestart,
        requestId: failure.requestId,
        stage: failure.stage,
      },
    );
  }
}

async function remoteHostConnection(command: "prepare" | "restart") {
  if (!remoteAccessKey) {
    throw new RuntimeRequestError(
      "This Kora development link is missing its access key.",
      { code: "review_access_missing" },
    );
  }
  let response: Response;
  try {
    response = await fetch(`/__kora/${command}`, {
      headers: { "x-kora-review-key": remoteAccessKey },
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new RuntimeRequestError(
      "Kora's remote development gateway could not be reached.",
      { code: "review_gateway_unreachable" },
    );
  }
  const value = (await response
    .json()
    .catch(() => ({}))) as Partial<PublicRendererConnection> & NativeProblem;
  if (!response.ok) {
    throw new RuntimeRequestError(
      value.error?.message ??
        "Kora's remote development gateway rejected the connection.",
      {
        code: value.error?.code ?? "review_gateway_failed",
        status: response.status,
        requestId: value.error?.requestId,
      },
    );
  }
  if (
    value.runtimeKind !== "kora-native" ||
    value.protocolVersion !== "2" ||
    typeof value.url !== "string"
  ) {
    throw new RuntimeRequestError(
      "The development gateway returned an incompatible Kora runtime.",
      { code: "runtime_incompatible" },
    );
  }
  const connected = value as PublicRendererConnection;
  connection = { kind: "remote", value: connected };
  return publicConnection(connected);
}

async function prepareConnection(restart = false) {
  if (transport === "native")
    return nativeHostConnection(
      restart ? "restart_runtime" : "prepare_runtime",
    );
  if (transport === "remote")
    return remoteHostConnection(restart ? "restart" : "prepare");
  throw new RuntimeRequestError(
    "Kora requires either the native Windows host or the authenticated development gateway.",
    { code: "host_unavailable" },
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!connection) {
    throw new RuntimeRequestError("Kora's native runtime is not connected.", {
      code: "runtime_disconnected",
    });
  }
  let response: Response;
  try {
    const active = connection;
    response = await fetch(`${active.value.url}${path}`, {
      ...init,
      headers: {
        ...(active.kind === "native"
          ? { authorization: `Bearer ${active.value.token}` }
          : { "x-kora-review-key": remoteAccessKey ?? "" }),
        "content-type": "application/json",
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RuntimeRequestError(
      "Kora's native runtime could not be reached.",
      {
        code: "runtime_unreachable",
      },
    );
  }
  const body = (await response.json().catch(() => ({}))) as T & NativeProblem;
  if (!response.ok) {
    throw new RuntimeRequestError(
      body.error?.message ??
        `Kora's native runtime returned ${response.status}.`,
      {
        code: body.error?.code ?? "runtime_request_failed",
        status: response.status,
        requestId: body.error?.requestId,
      },
    );
  }
  return body;
}

async function outputContent(id: string, signal?: AbortSignal) {
  if (!connection)
    throw new RuntimeRequestError("Kora's native runtime is not connected.", {
      code: "runtime_disconnected",
    });
  const active = connection;
  const response = await fetch(
    `${active.value.url}/v1/artifacts/${encodeURIComponent(id)}/content`,
    {
      headers:
        active.kind === "native"
          ? { authorization: `Bearer ${active.value.token}` }
          : { "x-kora-review-key": remoteAccessKey ?? "" },
      signal: signal ?? AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as NativeProblem;
    throw new RuntimeRequestError(
      body.error?.message ?? "Output content is unavailable.",
      {
        code: body.error?.code ?? "output_content_failed",
        status: response.status,
        requestId: body.error?.requestId,
      },
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "",
    title = disposition.match(/filename="([^"]+)"/)?.[1] ?? `kora-output-${id}`,
    blob = await response.blob();
  return {
    blob,
    mediaType:
      response.headers.get("content-type") ??
      (blob.type || "application/octet-stream"),
    title,
    byteSize: Number(response.headers.get("content-length") ?? blob.size),
    sha256: response.headers.get("x-kora-sha256") ?? "",
  };
}

async function streamConversation(
  runId: string,
  after: number,
  signal: AbortSignal,
  onEvent: (event: ConversationEvent) => void,
) {
  if (!connection)
    throw new RuntimeRequestError("Kora's native runtime is not connected.", {
      code: "runtime_disconnected",
    });
  const { ticket } = await request<{ ticket: string; expiresAt: string }>(
    `/v1/conversation-runs/${encodeURIComponent(runId)}/ticket`,
    { method: "POST", body: "{}", signal },
  );
  const active = connection;
  const response = await fetch(
    `${active.value.url}/v1/conversation-runs/${encodeURIComponent(runId)}/events?ticket=${encodeURIComponent(ticket)}&after=${after}`,
    {
      headers:
        active.kind === "native"
          ? { authorization: `Bearer ${active.value.token}` }
          : { "x-kora-review-key": remoteAccessKey ?? "" },
      signal,
    },
  ).catch(() => {
    throw new RuntimeRequestError(
      "The live conversation stream could not be reached.",
      { code: "stream_unreachable" },
    );
  });
  if (!response.ok || !response.body) {
    const problem = (await response.json().catch(() => ({}))) as NativeProblem;
    throw new RuntimeRequestError(
      problem.error?.message ?? "The live conversation stream could not open.",
      {
        code: problem.error?.code ?? "stream_failed",
        status: response.status,
        requestId: problem.error?.requestId,
      },
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const value = JSON.parse(line) as
        ConversationEvent | { type: "heartbeat" };
      if (value.type !== "heartbeat") onEvent(value as ConversationEvent);
    }
    if (done) break;
  }
}

const normalizeProvider = (provider: NativeProviderWire): NativeProvider => {
  const problemCode = provider.problem?.code.toLowerCase() ?? "";
  const scopes = provider.authorityObservation.state === "reported"
    ? provider.authorityObservation.scopes
    : provider.authorityObservation.state === "failed"
      ? provider.authorityObservation.lastSuccessfulScopes ?? []
      : [];
  const accessState: NativeProvider["accessState"] = problemCode.includes("expired")
    ? "expired"
    : problemCode.includes("denied") || problemCode.includes("forbidden")
      ? "denied"
      : provider.connectionState === "not_configured"
        ? "not_configured"
        : provider.connectionState === "connected"
          ? "available"
          : "unknown";
  return {
    ...provider,
    configured: provider.connectionState !== "not_configured",
    accessState,
    connected: provider.connectionState === "connected",
    scopes,
    operations: provider.availableOperations,
    health: provider.connectionState === "connected"
      ? "available"
      : provider.connectionState === "needs_attention"
        ? "degraded"
        : "unavailable",
    unavailableReason: provider.problem?.message,
    lastCheckedAt: provider.connectionObservedAt,
    lastSuccessfulCheckAt: provider.authorityObservation.state === "reported"
      ? provider.authorityObservation.observedAt
      : provider.authorityObservation.state === "failed"
        ? provider.authorityObservation.lastSuccessfulAt
        : undefined,
  };
};

export const runtime = {
  isPreview: false,
  isRemoteDevelopment,
  prepare: () => prepareConnection(false),
  restart: () => prepareConnection(true),
  bootstrap: (signal?: AbortSignal) =>
    request<ShellBootstrap>("/v1/shell/bootstrap", { signal }),
  runtimeCondition: () =>
    request<NativeRuntimeCondition>("/v1/diagnostics/condition"),
  checkLocalData: () =>
    request<NativeRuntimeCondition>("/v1/diagnostics/storage/check", {
      method: "POST",
      body: "{}",
    }),
  settingsOverview: () =>
    request<NativeSettingsOverview>("/v1/settings/overview"),
  sessions: () => request<{ sessions: SessionMetadata[] }>("/v1/sessions"),
  searchSessions: (query: string, limit = 12) =>
    request<{ results: SessionSearchResult[] }>("/v1/sessions/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  notifications: async (unseen = false, cursor?: string) => {
    const query = new URLSearchParams({
      pageSize: "50",
      seen: unseen ? "unseen" : "all",
      ...(cursor ? { cursor } : {}),
    });
    const page = await request<{
      items: NativeNotification[];
      cursor?: string;
      complete: boolean;
      unseenCount: number;
    }>(`/v1/notifications?${query}`);
    return {
      notifications: page.items,
      cursor: page.cursor,
      complete: page.complete,
      unseenCount: page.unseenCount,
    };
  },
  notification: (id: string) =>
    request<{ notification: NativeNotification }>(
      `/v1/notifications/${encodeURIComponent(id)}`,
    ),
  markNotificationSeen: (id: string) =>
    request<{ notification: NativeNotification }>(
      `/v1/notifications/${encodeURIComponent(id)}/seen`,
      {
        method: "POST",
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      },
    ),
  markNotificationsSeenThrough: (
    boundary: { createdAt: string; id: string },
    tier?: NativeAttentionTier,
  ) =>
    request<{ changed: number; unseenCount: number }>(
      "/v1/notifications/seen-through",
      {
        method: "POST",
        body: JSON.stringify({
          boundary,
          tier,
          requestKey: crypto.randomUUID(),
        }),
      },
    ),
  notificationSettings: () =>
    request<NativeNotificationSettings>("/v1/notification-settings"),
  updateNotificationSettings: (input: {
    start?: string | null;
    end?: string | null;
    expectedVersion: number;
  }) =>
    request<NativeNotificationSettings>("/v1/notification-settings", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  schedules: (
    input: {
      pageSize?: number;
      cursor?: string;
      state?: string;
      query?: string;
    } = {},
  ) => {
    const query = new URLSearchParams({
      pageSize: String(input.pageSize ?? 50),
      });
    if (input.cursor) query.set("cursor", input.cursor);
    if (input.state) query.set("state", input.state);
    if (input.query?.trim()) query.set("query", input.query.trim());
    return request<{
      schedules: NativeSchedule[];
      cursor?: string;
      complete: boolean;
    }>(`/v1/schedules?${query}`);
  },
  schedule: (id: string) =>
    request<{ schedule: NativeSchedule }>(
      `/v1/schedules/${encodeURIComponent(id)}`,
    ),
  createSchedule: (input: {
    prompt: string;
    name?: string;
    trigger: NativeScheduleTrigger;
    timezone?: string;
    attentionTier: NativeAttentionTier;
    isTouchpoint?: boolean;
  }) =>
    request<{ schedule: NativeSchedule }>("/v1/schedules", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  updateSchedule: (
    id: string,
    expectedVersion: number,
    input: {
      name?: string | null;
      prompt?: string;
      trigger?: NativeScheduleTrigger;
      timezone?: string | null;
      attentionTier?: NativeAttentionTier;
      isTouchpoint?: boolean;
    },
  ) =>
    request<{ schedule: NativeSchedule }>(
      `/v1/schedules/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          expectedVersion,
          requestKey: crypto.randomUUID(),
        }),
      },
    ),
  pauseSchedule: (id: string, expectedVersion: number) =>
    request<{ schedule: NativeSchedule }>(
      `/v1/schedules/${encodeURIComponent(id)}/pause`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey: crypto.randomUUID(),
        }),
      },
    ),
  resumeSchedule: (id: string, expectedVersion: number) =>
    request<{ schedule: NativeSchedule }>(
      `/v1/schedules/${encodeURIComponent(id)}/resume`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey: crypto.randomUUID(),
        }),
      },
    ),
  runSchedule: (id: string) =>
    request<{ run: NativeScheduleRun }>(
      `/v1/schedules/${encodeURIComponent(id)}/run`,
      {
        method: "POST",
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      },
    ),
  cancelSchedule: (id: string, expectedVersion: number) =>
    request<{ cancelled: boolean }>(`/v1/schedules/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({
        expectedVersion,
        requestKey: crypto.randomUUID(),
      }),
    }),
  previewSchedule: (trigger: NativeScheduleTrigger, count = 3) =>
    request<{
      trigger: NativeScheduleTrigger;
      occurrences: string[];
      complete: boolean;
    }>("/v1/schedules/preview", {
      method: "POST",
      body: JSON.stringify({ trigger, count }),
    }),
  scheduleRuns: (id: string, pageSize = 20, cursor?: string) => {
    const query = new URLSearchParams({ pageSize: String(pageSize) });
    if (cursor) query.set("cursor", cursor);
    return request<{
      runs: NativeScheduleRun[];
      cursor?: string;
      complete: boolean;
    }>(`/v1/schedules/${encodeURIComponent(id)}/runs?${query}`);
  },
  scheduleRun: (id: string, runId: string) =>
    request<{ run: NativeScheduleRun }>(
      `/v1/schedules/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,
    ),
  lifeTodayFeed: () => request<LifeTodayFeed>("/v1/life/today"),
  lifeOverview: (cursor?: string, pageSize = 12, day?: LifeOverviewDayInput) => {
    const query = new URLSearchParams({ pageSize: String(pageSize) });
    if (cursor) query.set("cursor", cursor);
    if (day) {
      query.set("viewerDate", day.viewerDate);
      query.set("viewerTimeZone", day.viewerTimeZone);
    }
    return request<LifeOverview>(`/v1/life/overview?${query}`);
  },
  wellbeingRecords: (
    input: {
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
      routineSchedule?: "due" | "later";
      routineDay?: number;
      routineDayStart?: string;
      routineDayEnd?: string;
    } = {},
  ) => {
    const query = new URLSearchParams({
      state: input.state ?? "active",
      pageSize: String(input.pageSize ?? 50),
    });
    input.kinds?.forEach((kind) => query.append("kind", kind));
    input.sourceKinds?.forEach((kind) => query.append("source", kind));
    if (input.privacy) query.set("privacy", input.privacy);
    if (input.sort) query.set("sort", input.sort);
    if (input.start) query.set("start", input.start);
    if (input.end) query.set("end", input.end);
    if (input.routineSchedule) query.set("routineSchedule", input.routineSchedule);
    if (input.routineDay !== undefined) query.set("routineDay", String(input.routineDay));
    if (input.routineDayStart) query.set("routineDayStart", input.routineDayStart);
    if (input.routineDayEnd) query.set("routineDayEnd", input.routineDayEnd);
    if (input.query?.trim()) query.set("query", input.query.trim());
    if (input.cursor) query.set("cursor", input.cursor);
    return request<WellbeingRecordPage>(`/v1/wellbeing/records?${query}`);
  },
  wellbeingSources: (input: { kinds?: WellbeingRecordKind[] } = {}) => {
    const query = new URLSearchParams();
    for (const kind of input.kinds ?? []) query.append("kind", kind);
    return request<WellbeingSourceCoverage>(
      `/v1/wellbeing/sources${query.size ? `?${query}` : ""}`,
    );
  },
  wellbeingPrivacy: () =>
    request<WellbeingPrivacyOverview>("/v1/wellbeing/privacy"),
  wellbeingTrendMetrics: () =>
    request<WellbeingTrendMetricCatalog>("/v1/wellbeing/trends/metrics"),
  wellbeingTrend: (input: {
    metricKey: string;
    range: WellbeingTrendRangeKey;
    customStart?: string;
    customEnd?: string;
    overlayKeys?: string[];
  }) => {
    const query = new URLSearchParams({ metricKey: input.metricKey, range: input.range });
    if (input.customStart) query.set("customStart", input.customStart);
    if (input.customEnd) query.set("customEnd", input.customEnd);
    for (const key of input.overlayKeys ?? []) query.append("overlay", key);
    return request<WellbeingTrendResult>(`/v1/wellbeing/trends?${query}`);
  },
  wellbeingTrendEvidence: (input: {
    metricKey: string;
    range: WellbeingTrendRangeKey;
    evidenceHandle: string;
    customStart?: string;
    customEnd?: string;
    overlayKeys?: string[];
    pageSize?: number;
    cursor?: string;
  }) => {
    const query = new URLSearchParams({ metricKey: input.metricKey, range: input.range, evidenceHandle: input.evidenceHandle, pageSize: String(input.pageSize ?? 50) });
    if (input.customStart) query.set("customStart", input.customStart);
    if (input.customEnd) query.set("customEnd", input.customEnd);
    if (input.cursor) query.set("cursor", input.cursor);
    for (const key of input.overlayKeys ?? []) query.append("overlay", key);
    return request<WellbeingTrendEvidencePage>(`/v1/wellbeing/trends/evidence?${query}`);
  },
  wellbeingRecord: (id: string) =>
    request<{ record: WellbeingRecord; history: WellbeingRecordRevision[] }>(
      `/v1/wellbeing/records/${encodeURIComponent(id)}`,
    ),
  createWellbeingRecord: (
    record: WellbeingRecordDraft,
    requestKey: string = crypto.randomUUID(),
  ) =>
    request<{ record: WellbeingRecord; replayed: boolean }>(
      "/v1/wellbeing/records",
      {
        method: "POST",
        body: JSON.stringify({ record, requestKey }),
      },
    ),
  updateWellbeingRecord: (
    id: string,
    expectedVersion: number,
    changes: WellbeingRecordChanges,
    requestKey: string,
  ) =>
    request<{ record: WellbeingRecord; replayed: boolean }>(
      `/v1/wellbeing/records/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          changes,
          expectedVersion,
          requestKey,
        }),
      },
    ),
  archiveWellbeingRecord: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) =>
    request<{ record: WellbeingRecord; replayed: boolean }>(
      `/v1/wellbeing/records/${encodeURIComponent(id)}/archive`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
        }),
      },
    ),
  restoreWellbeingRecord: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) =>
    request<{ record: WellbeingRecord; replayed: boolean }>(
      `/v1/wellbeing/records/${encodeURIComponent(id)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
        }),
      },
    ),
  deleteWellbeingRecord: (
    id: string,
    expectedVersion: number,
    requestKey: string,
  ) =>
    request<WellbeingDeletionOutcome>(
      `/v1/local-data/wellbeing_record/${encodeURIComponent(id)}/delete`,
      { method: "POST", body: JSON.stringify({ expectedVersion, requestKey }) },
    ),
  applications: () => request<ApplicationsResponse>("/v1/life/applications"),
  application: (projectId: string) =>
    request<ApplicationDetailResponse>(
      `/v1/life/applications/${encodeURIComponent(projectId)}`,
    ),
  updateApplicationStage: (
    projectId: string,
    input: {
      expectedVersion: number;
      targetStage: ApplicationStage;
      provenance: string;
      correctionReason?: string;
    },
  ) =>
    request<{ application: ApplicationRecord; replayed: boolean }>(
      `/v1/life/applications/${encodeURIComponent(projectId)}/stage`,
      {
        method: "POST",
        body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
      },
    ),
  financeSnapshot: () =>
    request<FinanceSnapshot>(
      "/v1/finance/snapshot?days=120&transactionLimit=250",
    ),
  financeAccounts: (input?: string | { id?: string; cursor?: string; pageSize?: number }) => {
    const exactId = typeof input === "string" ? input : input?.id;
    const query = new URLSearchParams({
      ...(exactId ? { id: exactId } : {}),
      ...(!exactId && typeof input === "object" && input?.cursor ? { cursor: input.cursor } : {}),
      ...(!exactId && typeof input === "object" && input?.pageSize ? { pageSize: String(input.pageSize) } : {}),
    });
    return request<FinanceAccountsRead>(`/v1/finance/accounts${query.size ? `?${query}` : ""}`);
  },
  financeTransactions: (input: FinanceTransactionQuery = {}) => {
    const query = new URLSearchParams({
      pageSize: String(input.pageSize ?? 100),
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.merchant ? { merchant: input.merchant } : {}),
      ...(input.direction && input.direction !== "all"
        ? { direction: input.direction }
        : {}),
      ...(input.pending && input.pending !== "all"
        ? { pending: input.pending }
        : {}),
      ...(input.fromDate ? { fromDate: input.fromDate } : {}),
      ...(input.toDate ? { toDate: input.toDate } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.evidence && input.evidence !== "all" ? { evidence: input.evidence } : {}),
      ...(input.freshness && input.freshness !== "all" ? { freshness: input.freshness } : {}),
      ...(input.review ? { review: input.review } : {}),
      ...(input.sort && input.sort !== "newest" ? { sort: input.sort } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return request<{
      items: FinanceTransaction[];
      cursor?: string;
      complete: boolean;
      total: number;
      needsReviewTotal: number;
      categories: string[];
      sources: FinanceSources;
    }>(`/v1/finance/transactions?${query}`);
  },
  updateFinanceTransactionAnnotation: (
    id: string,
    input: { note: string; category?: string | null; expectedVersion: number; requestKey?: string },
  ) => request<FinanceTransactionAnnotationOutcome>(
    `/v1/finance/transactions/${encodeURIComponent(id)}/annotation`,
    {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: input.requestKey ?? crypto.randomUUID() }),
    },
  ),
  financeAllowance: () => request<FinanceAllowance>("/v1/finance/allowance"),
  financeAllowanceSettings: () =>
    request<FinanceAllowanceSettings>("/v1/finance/allowance-settings"),
  financeBudgets: (state: string | null = "active") =>
    request<{
      budgets: FinanceBudget[];
      archivedCount: number;
      sources: FinanceSources;
    }>(`/v1/finance/budgets${state ? `?state=${encodeURIComponent(state)}` : ""}`),
  updateFinanceBudget: (
    id: string,
    changes: Partial<FinanceBudget>,
    expectedUpdatedAt: string,
  ) =>
    request<FinanceBudget>(`/v1/finance/budgets/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({
        changes,
        expectedUpdatedAt,
        requestKey: crypto.randomUUID(),
      }),
    }),
  financeBills: (state: string | null = "active", cursor?: string, pageSize = 50) =>
    request<{
      bills: FinanceBill[];
      archivedCount: number;
      complete: boolean;
      cursor?: string;
      total?: number;
      viewerTimeZone: string;
      sources: Record<string, LifeSourceState>;
    }>(
      `/v1/finance/bills?${new URLSearchParams({ ...(state ? { state } : {}), ...(cursor ? { cursor } : {}), pageSize: String(pageSize) })}`,
    ),
  financeBill: (id: string) =>
    request<{
      bills: FinanceBill[];
      archivedCount: number;
      complete: boolean;
      cursor?: string;
      total?: number;
      viewerTimeZone: string;
      sources: Record<string, LifeSourceState>;
    }>(`/v1/finance/bills?id=${encodeURIComponent(id)}`),
  financeSubscriptions: (state: string | null = "active", cursor?: string, pageSize = 50) =>
    request<{
      subscriptions: FinanceSubscription[];
      archivedCount: number;
      complete: boolean;
      cursor?: string;
      total?: number;
      viewerTimeZone: string;
      sources: Record<string, LifeSourceState>;
    }>(
      `/v1/finance/subscriptions?${new URLSearchParams({ ...(state ? { state } : {}), ...(cursor ? { cursor } : {}), pageSize: String(pageSize) })}`,
    ),
  financeSubscription: (id: string) =>
    request<{
      subscriptions: FinanceSubscription[];
      archivedCount: number;
      complete: boolean;
      cursor?: string;
      total?: number;
      viewerTimeZone: string;
      sources: Record<string, LifeSourceState>;
    }>(`/v1/finance/subscriptions?id=${encodeURIComponent(id)}`),
  financeRecurring: (input: { state?: string; query?: string; cursor?: string; pageSize?: number } = {}) =>
    request<{
      bills: FinanceBill[];
      subscriptions: FinanceSubscription[];
      archivedCount: number;
      complete: boolean;
      cursor?: string;
      total: number;
      viewerTimeZone: string;
      sources: FinanceSources;
    }>(`/v1/finance/recurring?${new URLSearchParams({
      ...(input.state ? { state: input.state } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      pageSize: String(input.pageSize ?? 50),
    })}`),
  financeGoals: (state: string | null = "active") =>
    request<{
      goals: FinanceGoal[];
      archivedCount: number;
      sources: Record<string, LifeSourceState>;
    }>(`/v1/finance/goals${state ? `?state=${encodeURIComponent(state)}` : ""}`),
  updateFinanceAllowanceSettings: (input: {
    includedAccountIds?: string[];
    dailyFloorMinor?: number;
    bufferMinor?: number;
    obligationHorizonDays?: number;
    expectedVersion: number;
  }) =>
    request<FinanceAllowanceSettings>("/v1/finance/allowance-settings", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  createFinanceBill: (input: {
    billerName: string;
    expectedAmountMinor?: number;
    expectedAmountMinMinor?: number;
    expectedAmountMaxMinor?: number;
    category?: string;
    dueRule?: string;
    accountId?: string;
    autopayState?: string;
    installmentsTotal?: number;
    installmentsRemaining?: number;
  }) =>
    request<FinanceBill>("/v1/finance/bills", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  updateFinanceBill: (
    id: string,
    changes: Partial<FinanceBill>,
    expectedUpdatedAt?: string,
  ) =>
    request<FinanceBill>(`/v1/finance/bills/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({
        changes,
        expectedUpdatedAt,
        requestKey: crypto.randomUUID(),
      }),
    }),
  createFinanceSubscription: (input: {
    merchantName: string;
    accountId?: string;
    cadence?: string;
    expectedAmountMinor?: number;
    expectedAmountMinMinor?: number;
    expectedAmountMaxMinor?: number;
    category?: string;
    lastSeenDate?: string;
  }) =>
    request<FinanceSubscription>("/v1/finance/subscriptions", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  updateFinanceSubscription: (
    id: string,
    changes: Partial<FinanceSubscription>,
    expectedUpdatedAt?: string,
  ) =>
    request<FinanceSubscription>(
      `/v1/finance/subscriptions/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          changes,
          expectedUpdatedAt,
          requestKey: crypto.randomUUID(),
        }),
      },
    ),
  createFinanceGoal: (input: {
    displayName: string;
    goalKind: "savings" | "debt_payoff" | "business_revenue" | "custom";
    targetAmountMinor?: number;
    currentAmountMinor?: number;
    currency: string;
    linkedAccountIds?: string[];
    periodStart?: string;
    periodEnd?: string;
  }) =>
    request<FinanceGoal>("/v1/finance/goals", {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: crypto.randomUUID() }),
    }),
  updateFinanceGoal: (
    id: string,
    changes: Partial<FinanceGoal>,
    expectedUpdatedAt: string,
  ) =>
    request<FinanceGoal>(`/v1/finance/goals/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ changes, expectedUpdatedAt, requestKey: crypto.randomUUID() }),
    }),
  financeReceipts: (input: FinanceReceiptQuery = {}) => {
    const query = new URLSearchParams({
      matchState: "all",
      pageSize: String(input.pageSize ?? 200),
      ...(input.transactionIds?.length
        ? { transactionIds: input.transactionIds.join(",") }
        : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return request<{
      items: FinanceReceipt[];
      cursor?: string;
      complete: boolean;
      sources: Record<string, LifeSourceState>;
    }>(`/v1/finance/receipts?${query}`);
  },
  resolveFinanceReceipt: (
    id: string,
    input: {
      action: "confirm_match" | "reject_match" | "dismiss" | "create_bill" | "create_subscription";
      transactionId?: string;
      expectedVersion: number;
      requestKey?: string;
    },
  ) => request<FinanceReceiptResolutionOutcome>(
    `/v1/finance/receipts/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ ...input, requestKey: input.requestKey ?? crypto.randomUUID() }),
    },
  ),
  providers: async () => {
    const response = await request<{ providers: NativeProviderWire[] }>("/v1/providers");
    return { providers: response.providers.map(normalizeProvider) };
  },
  checkProvider: async (id: string, expectedUpdatedAt: string) => {
    const response = await request<
      | { status: "settled"; provider: NativeProviderWire }
      | { status: "stale" }
    >(`/v1/providers/${encodeURIComponent(id)}/check`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt }),
    });
    return response.status === "settled"
      ? { ...response, provider: normalizeProvider(response.provider) }
      : response;
  },
  disconnectGoogleWorkspace: () =>
    request<{ disconnected: true }>(
      "/v1/providers/google-workspace/disconnect",
      { method: "POST" },
    ),
  githubAccounts: () =>
    request<{
      accounts: Array<{ hostname: string; user: string; active: boolean }>;
    }>("/v1/providers/github/accounts"),
  disconnectGithub: (hostname: string, user: string) =>
    request<{ disconnected: true; hostname: string; user: string }>(
      "/v1/providers/github/disconnect",
      { method: "POST", body: JSON.stringify({ hostname, user }) },
    ),
  startIntegrationAuth: (provider: string) =>
    request<{ id: string }>("/v1/integration-auth", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  nextIntegrationAuth: (id: string) =>
    request<NativeAuthInteractionEvent>(
      `/v1/integration-auth/${encodeURIComponent(id)}/next`,
    ),
  respondIntegrationAuth: (id: string, promptId: string, value: string) =>
    request<{ accepted: true }>(
      `/v1/integration-auth/${encodeURIComponent(id)}/respond`,
      { method: "POST", body: JSON.stringify({ promptId, value }) },
    ),
  cancelIntegrationAuth: (id: string) =>
    request<{ cancelled: true }>(
      `/v1/integration-auth/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  capabilities: () => request<NativeCapabilityDiagnostics>("/v1/capabilities"),
  browserStatus: () => request<BrowserStatus>("/v1/browser/status"),
  browserCredentials: () =>
    request<{
      credentials: BrowserCredential[];
      protectedStorageAvailable: boolean;
    }>("/v1/browser/credentials"),
  createBrowserCredential: (input: {
    label: string;
    origin: string;
    usernameLabel?: string;
    secret: string;
  }) =>
    request<{ credential: BrowserCredential }>("/v1/browser/credentials", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createOneTimeBrowserCredential: (input: {
    label?: string;
    origin: string;
    usernameLabel?: string;
    secret: string;
  }) =>
    request<{ credential: BrowserCredential }>(
      "/v1/browser/credentials/one-time",
      { method: "POST", body: JSON.stringify(input) },
    ),
  deleteBrowserCredential: (id: string) =>
    request<{ deleted: boolean }>(
      `/v1/browser/credentials/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  backgroundStatus: () => request<NativeBackgroundStatus>("/v1/background"),
  migrationSummary: () => request<NativeMigrationSummary>("/v1/migration"),
  migrationPending: () =>
    request<{ items: NativeMigrationPending[] }>("/v1/migration/pending"),
  dismissMigrationPending: (id: string) =>
    request<{ status: "settled" | "replayed" | "gone" }>(
      "/v1/migration/pending/dismiss",
      {
        method: "POST",
        body: JSON.stringify({ id, requestKey: crypto.randomUUID() }),
      },
    ),
  calendarSources: (pageSize = 50, cursor?: string) =>
    request<{
      sources: CalendarSource[];
      cursor?: string;
      complete: boolean;
      status: {
        state: "available" | "partial" | "unavailable";
        reason?: string;
      };
    }>(
      `/v1/calendar/sources?${new URLSearchParams({ pageSize: String(pageSize), ...(cursor ? { cursor } : {}) })}`,
    ),
  calendarEvents: (
    input: {
      start: string;
      end: string;
      calendarIds: string[];
      viewerTimeZone: string;
      pageSize?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      start: input.start,
      end: input.end,
      viewerTimeZone: input.viewerTimeZone,
      pageSize: String(input.pageSize ?? 200),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    input.calendarIds.forEach((id) => query.append("calendarId", id));
    return request<{
      events: CalendarEvent[];
      range: { start: string; end: string };
      cursor?: string;
      complete: boolean;
      status: {
        state: "available" | "partial" | "unavailable";
        reason?: string;
      };
      sourceErrors: Array<{ calendarId: string; reason: string }>;
    }>(`/v1/calendar/events?${query}`, { signal });
  },
  calendarEvent: (
    calendarId: string,
    eventId: string,
    viewerTimeZone: string,
  ) =>
    request<{
      event: CalendarEvent;
      status: {
        state: "available" | "partial" | "unavailable";
        reason?: string;
      };
    }>(
      `/v1/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}?viewerTimeZone=${encodeURIComponent(viewerTimeZone)}`,
    ),
  calendarFreeBusy: (input: {
    start: string;
    end: string;
    calendarIds: string[];
    viewerTimeZone: string;
  }) =>
    request<{
      calendars: Record<
        string,
        { busy: Array<{ start: string; end: string }>; errors: string[] }
      >;
      status: {
        state: "available" | "partial" | "unavailable";
        reason?: string;
      };
    }>("/v1/calendar/free-busy", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCalendarEvent: (input: {
    clientRequestId: string;
    requestKey: string;
    sendUpdates: "all" | "externalOnly" | "none";
    event: CalendarEventDraft;
  }) =>
    request<CalendarMutationOutcome>("/v1/calendar/events", {
      method: "POST",
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(45_000),
    }),
  updateCalendarEvent: (
    calendarId: string,
    eventId: string,
    input: {
      clientRequestId: string;
      requestKey: string;
      sendUpdates: "all" | "externalOnly" | "none";
      expectedRevision?: string;
      recurrenceScope: "occurrence" | "series";
      patch: Partial<Omit<CalendarEventDraft, "calendarId">>;
    },
  ) =>
    request<CalendarMutationOutcome>(
      `/v1/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`,
      {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45_000),
      },
    ),
  deleteCalendarEvent: (
    calendarId: string,
    eventId: string,
    input: {
      clientRequestId: string;
      requestKey: string;
      sendUpdates: "all" | "externalOnly" | "none";
      expectedRevision?: string;
      recurrenceScope: "occurrence" | "series";
    },
  ) =>
    request<CalendarMutationOutcome>(
      `/v1/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45_000),
      },
    ),
  restoreCalendarEvent: (
    calendarId: string,
    eventId: string,
    input: { requestKey: string; deletedRevision: string },
  ) =>
    request<CalendarMutationOutcome>(
      `/v1/calendar/events/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      },
    ),
  issueCalendarContextReference: (
    input: (
      | { kind: "event"; calendarId: string; eventId: string }
      | {
          kind: "query";
          calendarIds: string[];
          start: string;
          end: string;
          viewerTimeZone: string;
          title: string;
        }
    ) & { sessionId: string },
  ) =>
    request<{ selection: ConversationContextSelection }>(
      "/v1/calendar/context-references",
      { method: "POST", body: JSON.stringify(input) },
    ),
  activeWork: () => request<ActiveWorkResponse>("/v1/active-work"),
  goalsPage: (
    input: { filter?: GoalListFilter; includeArchived?: boolean; query?: string; area?: string; limit?: number; cursor?: string } = {},
  ) => request<GoalListPage>(`/v1/work/goals-page?${new URLSearchParams({
    filter: input.filter ?? "open",
    includeArchived: String(input.includeArchived ?? false),
    limit: String(input.limit ?? 50),
    ...(input.query ? { query: input.query } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  })}`),
  createGoal: (input: {
    requestKey: string;
    goal: {
      title: string; area?: string; purposeMarkdown: string; successDefinitionMarkdown?: string;
      shape: GoalShape; lifecycle: "idea" | "planned" | "active" | "paused"; priority: number;
      plannedStart?: string; targetDate?: string; hardDeadline?: string; currentPositionMarkdown?: string;
      pauseReason?: string; sensitivity?: "private" | "restricted"; provenance: string;
    };
  }) => request<WorkMutationOutcome<Goal>>("/v1/work/goals", { method: "POST", body: JSON.stringify(input) }),
  goal: (id: string) => request<{ goal: Goal }>(`/v1/work/goals/${encodeURIComponent(id)}`),
  goalWorkspace: (id: string) => request<GoalWorkspaceView>(`/v1/work/goals/${encodeURIComponent(id)}/workspace`),
  goalOutline: (id: string, historyMode: "current" | "terminal" = "current", limit = 50, cursor?: string) =>
    request<WorkOutlinePage>(`/v1/work/goals/${encodeURIComponent(id)}/outline?${new URLSearchParams({ historyMode, limit: String(limit), ...(cursor ? { cursor } : {}) })}`),
  createGoalWorkItem: (id: string, input: {
    requestKey: string;
    item: { parentWorkItemId?: string; kind: WorkItem["kind"]; title: string; area?: string; descriptionMarkdown?: string; state: "planned" | "active" | "blocked"; priority: number; dueAt?: string; attentionAt?: string; personId?: string; blocker?: string };
  }) => request<WorkMutationOutcome<WorkItem>>(`/v1/work/goals/${encodeURIComponent(id)}/work-items`, { method: "POST", body: JSON.stringify(input) }),
  updateGoal: (id: string, expectedVersion: number, changes: GoalChanges, requestKey = crypto.randomUUID()) =>
    request<WorkMutationOutcome<Goal>>(`/v1/work/goals/${encodeURIComponent(id)}/update`, { method: "POST", body: JSON.stringify({ expectedVersion, requestKey, changes }) }),
  achieveGoal: (id: string, expectedVersion: number, resultMarkdown: string, requestKey = crypto.randomUUID()) =>
    request<WorkMutationOutcome<Goal>>(`/v1/work/goals/${encodeURIComponent(id)}/achieve`, { method: "POST", body: JSON.stringify({ expectedVersion, requestKey, resultMarkdown, provenance: "gui_direct" }) }),
  stopGoal: (id: string, expectedVersion: number, reason: string, requestKey = crypto.randomUUID()) =>
    request<WorkMutationOutcome<Goal>>(`/v1/work/goals/${encodeURIComponent(id)}/stop`, { method: "POST", body: JSON.stringify({ expectedVersion, requestKey, reason, provenance: "gui_direct" }) }),
  resumeGoal: (id: string, expectedVersion: number, destination: "planned" | "active", reason: string, requestKey = crypto.randomUUID()) =>
    request<WorkMutationOutcome<Goal>>(`/v1/work/goals/${encodeURIComponent(id)}/resume`, { method: "POST", body: JSON.stringify({ expectedVersion, requestKey, destination, reason, provenance: "gui_direct" }) }),
  archiveGoal: (id: string, expectedVersion: number, requestKey = crypto.randomUUID()) =>
    request<WorkMutationOutcome<Goal>>(`/v1/work/goals/${encodeURIComponent(id)}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion, requestKey }) }),
  /** @deprecated Bounded compatibility for legacy Project clients. */
  projectsPage: (
    input: {
      filter?: ProjectListFilter;
      includeArchived?: boolean;
      query?: string;
      area?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) =>
    request<ProjectListPage>(
      `/v1/work/projects-page?${new URLSearchParams({
        filter: input.filter ?? "open",
        includeArchived: String(input.includeArchived ?? false),
        limit: String(input.limit ?? 50),
        ...(input.query ? { query: input.query } : {}),
        ...(input.area ? { area: input.area } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  createProject: (input: {
    requestKey: string;
    project: {
      title: string;
      area?: string;
      purposeMarkdown: string;
      state: "planned" | "active";
      priority: number;
      startDate?: string;
      targetDate?: string;
    };
  }) =>
    request<WorkMutationOutcome<Project>>("/v1/work/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  searchWork: (
    query: string,
    mode: "work" | "add_focus" | "project_parent" = "work",
    recordTypes: Array<"project" | "work_item"> = ["project", "work_item"],
    limit = 30,
  ) =>
    request<WorkSearchResponse>(
      `/v1/work/search?${new URLSearchParams({ query, mode, recordTypes: recordTypes.join(","), limit: String(limit) })}`,
    ),
  searchWorkPeople: (query: string, limit = 20) =>
    request<{
      results: WorkPerson[];
      complete: boolean;
    }>(
      `/v1/work/people/search?${new URLSearchParams({ query, limit: String(limit) })}`,
    ),
  project: (id: string) =>
    request<{ project: Project }>(
      `/v1/work/projects/${encodeURIComponent(id)}`,
    ),
  projectWorkspace: (id: string) =>
    request<ProjectWorkspaceView>(
      `/v1/work/projects/${encodeURIComponent(id)}/workspace`,
    ),
  projectOutline: (
    id: string,
    historyMode: "current" | "terminal" = "current",
    limit = 50,
    cursor?: string,
  ) =>
    request<WorkOutlinePage>(
      `/v1/work/projects/${encodeURIComponent(id)}/outline?${new URLSearchParams({ historyMode, limit: String(limit), ...(cursor ? { cursor } : {}) })}`,
    ),
  createProjectWorkItem: (
    id: string,
    input: {
      requestKey: string;
      item: {
        parentWorkItemId?: string;
        kind: WorkItem["kind"];
        title: string;
        area?: string;
        descriptionMarkdown?: string;
        state: "planned" | "active" | "blocked";
        priority: number;
        dueAt?: string;
        attentionAt?: string;
        personId?: string;
        blocker?: string;
      };
    },
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/projects/${encodeURIComponent(id)}/items`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  workItems: async (
    input: {
      filter?: WorkItemListFilter;
      kind?: WorkItem["kind"];
      goalId?: string;
      /** @deprecated Use goalId. */
      projectId?: string;
      query?: string;
      area?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    return request<WorkItemListPage>(
      `/v1/work/items?${new URLSearchParams({
        filter: input.filter ?? "open",
        limit: String(input.limit ?? 50),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.goalId ? { goalId: input.goalId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.query ? { query: input.query } : {}),
        ...(input.area ? { area: input.area } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    );
  },
  workItem: (id: string) =>
    request<{ item: WorkItem }>(`/v1/work/items/${encodeURIComponent(id)}`),
  workItemWorkspace: (id: string) =>
    request<WorkItemWorkspaceView>(
      `/v1/work/items/${encodeURIComponent(id)}/workspace`,
    ),
  workConnections: (input: {
    recordType: "project" | "work_item";
    id: string;
    limit?: number;
    cursor?: string;
  }) =>
    request<{
      items: WorkConnectionSummary[];
      cursor?: string;
      complete: boolean;
    }>(
      `/v1/work/connections?${new URLSearchParams({
        recordType: input.recordType,
        id: input.id,
        ...(input.limit === undefined ? {} : { limit: String(input.limit) }),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  workItemChildren: (id: string, limit = 50, cursor?: string) =>
    request<{
      items: WorkItem[];
      cursor?: string;
      complete: boolean;
    }>(
      `/v1/work/items/${encodeURIComponent(id)}/children?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`,
    ),
  createWorkConnection: (input: {
    requestKey: string;
    from: { type: "project" | "work_item"; id: string };
    relation: WorkConnectionRelation;
    target: WorkConnectionTarget;
  }) =>
    request<{
      status: "settled";
      connection: WorkConnectionSummary;
      replayed: boolean;
    }>("/v1/work/connections", { method: "POST", body: JSON.stringify(input) }),
  unlinkWorkConnection: (id: string, requestKey = crypto.randomUUID()) =>
    request<
      | { status: "settled"; id: string; deleted: true; replayed: boolean }
      | { status: "not_available"; id: string; replayed: false }
    >(`/v1/work/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ requestKey }),
    }),
  updateProject: (
    id: string,
    expectedVersion: number,
    changes: ProjectChanges,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<Project>>(
      `/v1/work/projects/${encodeURIComponent(id)}/update`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion, requestKey, changes }),
      },
    ),
  updateWorkItem: (
    id: string,
    expectedVersion: number,
    changes: WorkItemChanges,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/items/${encodeURIComponent(id)}/update`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion, requestKey, changes }),
      },
    ),
  completeProject: (
    id: string,
    expectedVersion: number,
    resultMarkdown: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<Project>>(
      `/v1/work/projects/${encodeURIComponent(id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          resultMarkdown,
          provenance: "gui_direct",
        }),
      },
    ),
  completeWorkItem: (
    id: string,
    expectedVersion: number,
    resultMarkdown: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/items/${encodeURIComponent(id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          resultMarkdown,
          provenance: "gui_direct",
        }),
      },
    ),
  cancelProject: (
    id: string,
    expectedVersion: number,
    reason: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<Project>>(
      `/v1/work/projects/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          reason,
          provenance: "gui_direct",
        }),
      },
    ),
  cancelWorkItem: (
    id: string,
    expectedVersion: number,
    reason: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/items/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          reason,
          provenance: "gui_direct",
        }),
      },
    ),
  reactivateProject: (
    id: string,
    expectedVersion: number,
    destination: "planned" | "active",
    reason: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<Project>>(
      `/v1/work/projects/${encodeURIComponent(id)}/reactivate`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          destination,
          reason,
          provenance: "gui_direct",
        }),
      },
    ),
  reactivateWorkItem: (
    id: string,
    expectedVersion: number,
    destination: "planned" | "active",
    reason: string,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/items/${encodeURIComponent(id)}/reactivate`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          destination,
          reason,
          provenance: "gui_direct",
        }),
      },
    ),
  archiveProject: (
    id: string,
    expectedVersion: number,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<Project>>(
      `/v1/work/projects/${encodeURIComponent(id)}/archive`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          provenance: "gui_direct",
        }),
      },
    ),
  archiveWorkItem: (
    id: string,
    expectedVersion: number,
    requestKey = crypto.randomUUID(),
  ) =>
    request<WorkMutationOutcome<WorkItem>>(
      `/v1/work/items/${encodeURIComponent(id)}/archive`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey,
          provenance: "gui_direct",
        }),
      },
    ),
  addWorkFocus: (
    target: FocusTarget,
    expectedVersion: number,
    requestKey = crypto.randomUUID(),
  ) =>
    request<{
      status: "settled";
      activeWork: ActiveWorkResponse;
      replayed: boolean;
    }>("/v1/work/focus/user-attention/add", {
      method: "POST",
      body: JSON.stringify({
        target,
        expectedVersion,
        requestKey,
        provenance: "gui_direct",
      }),
    }),
  removeWorkFocus: (
    target: FocusTarget,
    expectedVersion: number,
    requestKey = crypto.randomUUID(),
  ) =>
    request<{
      status: "settled";
      activeWork: ActiveWorkResponse;
      replayed: boolean;
    }>("/v1/work/focus/user-attention/remove", {
      method: "POST",
      body: JSON.stringify({
        target,
        expectedVersion,
        requestKey,
        provenance: "gui_direct",
      }),
    }),
  workActivity: (
    recordType: "project" | "work_item",
    id: string,
    limit = 20,
    cursor?: string,
  ) =>
    request<{ items: WorkActivity[]; cursor?: string; complete: boolean }>(
      `/v1/work/${recordType}/${encodeURIComponent(id)}/activity?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`,
    ),
  deleteWorkRecord: (
    surface: "project" | "work_item",
    id: string,
    requestKey: string,
  ) =>
    request<WorkDeletionOutcome>(
      `/v1/local-data/${surface}/${encodeURIComponent(id)}/delete`,
      { method: "POST", body: JSON.stringify({ requestKey }) },
    ),
  transitionSession: (input: SessionTransitionInput) =>
    request<SessionTransitionOutcome>("/v1/sessions/transition", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  synchronizeSessionTitles: () =>
    request<{ results: SessionTitleResult[] }>(
      "/v1/sessions/titles/synchronize",
      {
        method: "POST",
        body: "{}",
      },
    ),
  renameNamedSession: (id: string, name: string) =>
    request<SessionMetadata>(`/v1/sessions/${encodeURIComponent(id)}/name`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteSession: (id: string) =>
    request<{ deleted: true; sessionId: string }>(
      `/v1/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  renameSession: (name: string) =>
    request<SessionMetadata>("/v1/sessions/current/name", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  forkSession: (entryId?: string, position: "before" | "at" = "at") =>
    request<{ sessionId: string }>("/v1/sessions/current/fork", {
      method: "POST",
      body: JSON.stringify({ ...(entryId ? { entryId, position } : {}) }),
    }),
  cloneSession: () =>
    request<{ sessionId: string }>("/v1/sessions/current/clone", {
      method: "POST",
      body: "{}",
    }),
  sessionNavigation: () =>
    request<{ leafId: string | null; entries: SessionNavigationEntry[] }>(
      "/v1/conversation/sessions/current/tree",
    ),
  navigateSession: (targetId: string) =>
    request<{ cancelled: boolean }>("/v1/sessions/current/tree", {
      method: "POST",
      body: JSON.stringify({ targetId }),
    }),
  exportSession: () => request<unknown>("/v1/sessions/current/export"),
  importSession: (session: unknown) =>
    request<{ sessionId: string }>("/v1/sessions/import", {
      method: "POST",
      body: JSON.stringify({ session }),
      signal: AbortSignal.timeout(45_000),
    }),
  submit: (message: string) =>
    request<{ sessionId: string; assistant: string; stopReason: string }>(
      "/v1/chat",
      {
        method: "POST",
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10 * 60_000),
      },
    ),
  conversationTranscript: (sessionId?: string, before?: string, limit = 80) => {
    const query = new URLSearchParams();
    if (sessionId) query.set("sessionId", sessionId);
    if (before) query.set("before", before);
    query.set("limit", String(limit));
    return request<ConversationTranscript>(
      `/v1/conversation/transcript?${query.toString()}`,
    );
  },
  conversationRun: async (runId: string) => ({
    run: await request<ConversationRunSnapshot>(
      `/v1/conversation-runs/${encodeURIComponent(runId)}`,
    ),
  }),
  createConversationRun: async (input: {
    sessionId: string;
    clientRequestId: string;
    invocation: ConversationInvocation;
  }) => {
    const accepted = await request<{
      runId: string;
      sessionId: string;
      acceptedEntryId: string;
      acceptedAt: string;
      eventCursor: number;
    }>("/v1/conversation-runs", {
      method: "POST",
      body: JSON.stringify({
        sessionId: input.sessionId,
        clientRequestId: input.clientRequestId,
        input: input.invocation,
      }),
    });
    return {
      run: await request<ConversationRunSnapshot>(
        `/v1/conversation-runs/${encodeURIComponent(accepted.runId)}`,
      ),
    };
  },
  retryConversationRun: async (input: {
    sessionId: string;
    acceptedEntryId: string;
    clientRequestId: string;
  }) => {
    const accepted = await request<{
      runId: string;
      sessionId: string;
      acceptedEntryId: string;
      acceptedAt: string;
      eventCursor: number;
    }>(`/v1/conversation-runs/${encodeURIComponent(input.acceptedEntryId)}/retry`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: input.sessionId,
        clientRequestId: input.clientRequestId,
      }),
    });
    return {
      run: await request<ConversationRunSnapshot>(
        `/v1/conversation-runs/${encodeURIComponent(accepted.runId)}`,
      ),
    };
  },
  issueConversationContextSelection: (input: {
    sessionId: string;
    target: { kind: BrainObjectKind; id: string };
    range?: { start: number; end?: number };
  }) =>
    request<{ selection: ConversationContextSelection }>(
      "/v1/context-selections",
      { method: "POST", body: JSON.stringify(input) },
    ),
  approveConversationContextSelection: (input: {
    sessionId: string;
    approvalHandle: string;
  }) =>
    request<{ selection: ConversationContextSelection }>(
      "/v1/context-selections/approve",
      { method: "POST", body: JSON.stringify(input) },
    ),
  inspectConversationCitation: (input: {
    citationHandle: string;
    traceHandle: string;
  }) =>
    request<{ inspection: BrainCitationEvidenceInspection }>(
      "/v1/conversation/citations/inspect",
      {
        method: "POST",
        body: JSON.stringify({
          citationHandle: input.citationHandle,
          traceHandle: input.traceHandle,
        }),
      },
    ),
  streamConversation,
  ingestConversationAttachment: (input: {
    sessionId: string;
    attachment: {
      type: "image";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      data: string;
      name?: string;
    };
  }) =>
    request<{ artifact: ArtifactReference & { byteSize: number } }>(
      "/v1/conversation-attachments",
      {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45_000),
      },
    ),
  deleteConversationAttachment: (id: string) =>
    request<{ deleted: boolean }>(
      `/v1/conversation-attachments/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  commands: () =>
    request<{ commands: KoraCommandDefinition[] }>("/v1/commands"),
  completeCommand: async (input: { input: string; cursor?: number }) => ({
    candidates: (
      await request<{
        completions: Array<{
          value: string;
          label: string;
          description?: string;
        }>;
      }>("/v1/commands/complete", {
        method: "POST",
        body: JSON.stringify({ input: input.input }),
      })
    ).completions.map((candidate) => ({ ...candidate, kind: "command" })),
  }),
  personalBrainSearch: (query: string) =>
    request<BrainSearchPage>(
      `/v1/personal-brain/search?query=${encodeURIComponent(query)}`,
    ),
  personalBrainSearchPage: (
    input: {
      query: string;
      scopes?: BrainScope[];
      pageStates?: Array<"active" | "archived">;
      workStates?: Array<
        | "planned"
        | "active"
        | "blocked"
        | "completed"
        | "cancelled"
        | "archived"
      >;
      workDueAfter?: string;
      workDueBefore?: string;
      pageSize?: number;
      cursor?: string;
      changedSince?: string;
    },
    signal?: AbortSignal,
  ) =>
    request<BrainSearchPage>("/v1/personal-brain/search", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    }),
  memoriesPage: (
    input: {
      query?: string;
      status?: "active" | "expired";
      provenance?: string;
      pageSize?: number;
      cursor?: string;
    } = {},
  ) =>
    request<BrainCursorPage<MemoryRecord>>(
      `/v1/personal-brain/memory-page?${new URLSearchParams({
        pageSize: String(input.pageSize ?? 50),
        ...(input.query ? { query: input.query } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.provenance ? { provenance: input.provenance } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  memoryPage: async (
    input: {
      query?: string;
      status?: "active" | "expired";
      provenance?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    const page = await runtime.memoriesPage({
      ...input,
      pageSize: input.limit,
    });
    return { ...page, nextCursor: page.cursor };
  },
  memoryPipelineHealth: () =>
    request<MemoryPipelineHealth>("/v1/personal-brain/memory-pipeline-health"),
  updateMemorySettings: (input: {
    enabled: boolean;
    expectedUpdatedAt: string;
    requestKey?: string;
  }) =>
    request<{
      enabled: boolean;
      updatedAt: string;
      replayed: boolean;
    }>("/v1/personal-brain/memory-settings", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  profilePage: async (
    input: {
      query?: string;
      category?: ProfileCategory;
      states?: Array<NonNullable<ProfileRecord["state"]>>;
      includeSetupArtifacts?: boolean;
      provenance?: string;
      pageSize?: number;
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    const page = await request<BrainCursorPage<ProfileRecord> & { matchingCount?: number }>(
      `/v1/personal-brain/profile?${new URLSearchParams({
        pageSize: String(input.pageSize ?? input.limit ?? 50),
        ...(input.query ? { query: input.query } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.states?.length ? { states: input.states.join(",") } : {}),
        ...(input.includeSetupArtifacts !== undefined
          ? { includeSetupArtifacts: String(input.includeSetupArtifacts) }
          : {}),
        ...(input.provenance ? { provenance: input.provenance } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    );
    return { ...page, nextCursor: page.cursor };
  },
  profileOverview: async (
    input: { reviewLimit?: number; recentChangeLimit?: number } = {},
  ) => request<ProfileOverview>(
    `/v1/personal-brain/profile/overview?${new URLSearchParams({
      ...(input.reviewLimit !== undefined ? { reviewLimit: String(input.reviewLimit) } : {}),
      ...(input.recentChangeLimit !== undefined
        ? { recentChangeLimit: String(input.recentChangeLimit) }
        : {}),
    })}`,
  ),
  profileHistoryPage: async (
    input: {
      profileKey?: string;
      action?: ProfileHistoryEntry["action"];
      pageSize?: number;
      cursor?: string;
    } = {},
  ) => {
    const page = await request<BrainCursorPage<ProfileHistoryEntry>>(
      `/v1/personal-brain/profile/history?${new URLSearchParams({
        pageSize: String(input.pageSize ?? 50),
        ...(input.profileKey ? { profileKey: input.profileKey } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    );
    return { ...page, nextCursor: page.cursor };
  },
  createMemory: (input: {
    content: string;
    requestKey?: string;
  }) =>
    request<BrainMutationOutcome<MemoryRecord>>("/v1/personal-brain/memory", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  memoryHistory: (id: string) =>
    request<{ revisions: MemoryRevision[] }>(
      `/v1/personal-brain/memory/${encodeURIComponent(id)}/history`,
    ),
  correctMemory: (
    id: string,
    input: {
      content: string;
      expectedUpdatedAt: string;
      requestKey?: string;
    },
  ) =>
    request<BrainMutationOutcome<MemoryRecord>>(
      `/v1/personal-brain/memory/${encodeURIComponent(id)}/correct`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  setProfileRecord: (
    key: string,
    input: {
      value: BrainValue;
      expectedVersion?: number;
      requestKey?: string;
    },
  ) =>
    request<BrainMutationOutcome<ProfileRecord>>(
      `/v1/personal-brain/profile/${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  setProfileFact: (input: {
    key: string;
    value: BrainValue;
    expectedVersion: number;
    requestKey?: string;
  }) => runtime.setProfileRecord(input.key, input),
  transitionProfileRecord: (
    key: string,
    input: {
      action: "confirm" | "dismiss" | "archive" | "restore";
      expectedVersion: number;
      requestKey?: string;
    },
  ) => request<
    | { status: "settled"; record: ProfileRecord; replayed: boolean }
    | { status: "conflict"; current: ProfileRecord }
    | { status: "read_only"; current: ProfileRecord }
    | { status: "gone" }
  >(`/v1/personal-brain/profile/${encodeURIComponent(key)}/state`, {
    method: "POST",
    body: JSON.stringify({ ...input, requestKey: input.requestKey ?? crypto.randomUUID() }),
  }),
  pagesPage: (
    input: {
      query?: string;
      kind?: BrainPage["kind"];
      state?: BrainPage["state"];
      pageSize?: number;
      cursor?: string;
    } = {},
  ) =>
    request<BrainCursorPage<BrainPage>>(
      `/v1/personal-brain/pages-page?${new URLSearchParams({
        pageSize: String(input.pageSize ?? 50),
        ...(input.query ? { query: input.query } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  brainRecord: <Surface extends PersonalBrainSurface>(
    surface: Surface,
    id: string,
  ) =>
    request<{
      surface: Surface;
      record: PersonalBrainRecordMap[Surface];
    }>(`/v1/personal-brain/${surface}/${encodeURIComponent(id)}`),
  createPage: (input: {
    title: string;
    bodyMarkdown: string;
    kind: BrainPage["kind"];
    slug?: string;
    requestKey?: string;
  }) =>
    request<BrainMutationOutcome<BrainPage>>("/v1/personal-brain/pages", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  updatePage: (
    id: string,
    input: {
      title: string;
      bodyMarkdown: string;
      kind: BrainPage["kind"];
      slug?: string;
      expectedVersion: number;
      requestKey?: string;
    },
  ) => {
    const { expectedVersion, requestKey, ...changes } = input;
    return request<BrainMutationOutcome<BrainPage>>(
      `/v1/personal-brain/pages/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey: requestKey ?? crypto.randomUUID(),
          changes,
        }),
      },
    );
  },
  archivePage: (
    id: string,
    input: { expectedVersion: number; requestKey?: string },
  ) =>
    request<BrainMutationOutcome<BrainPage>>(
      `/v1/personal-brain/pages/${encodeURIComponent(id)}/archive`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  peoplePage: (
    input: {
      query?: string;
      order?: "name_asc" | "updated_desc";
      pageSize?: number;
      cursor?: string;
    } = {},
  ) =>
    request<BrainCursorPage<PersonRecord>>(
      `/v1/personal-brain/people-page?${new URLSearchParams({
        pageSize: String(input.pageSize ?? 50),
        order: input.order ?? "name_asc",
        ...(input.query ? { query: input.query } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  personWorkspace: (
    id: string,
    input: {
      workPageSize?: number;
      workCursor?: string;
    } = {},
  ) =>
    request<{
      person: PersonRecord;
      work: {
        items: Array<{
          recordType: "project" | "work_item";
          id: string;
          title: string;
          state: WorkState;
          route: string;
        }>;
        cursor?: string;
        complete: boolean;
      };
    }>(
      `/v1/personal-brain/people/${encodeURIComponent(id)}/workspace?${new URLSearchParams(
        {
          workPageSize: String(input.workPageSize ?? 50),
          ...(input.workCursor ? { workCursor: input.workCursor } : {}),
        },
      )}`,
    ),
  createPerson: (input: {
    displayName: string;
    relationshipLabel?: string;
    contextMarkdown?: string;
    providerRefs: ProviderReference[];
    requestKey?: string;
  }) =>
    request<BrainMutationOutcome<PersonRecord>>("/v1/personal-brain/people", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  updatePerson: (
    id: string,
    input: {
      displayName: string;
      relationshipLabel?: string;
      contextMarkdown?: string;
      providerRefs: ProviderReference[];
      expectedVersion: number;
      requestKey?: string;
    },
  ) => {
    const { expectedVersion, requestKey, ...changes } = input;
    return request<BrainMutationOutcome<PersonRecord>>(
      `/v1/personal-brain/people/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion,
          requestKey: requestKey ?? crypto.randomUUID(),
          changes,
        }),
      },
    );
  },
  knowledgeSourcesPage: (
    input: {
      query?: string;
      sourceKind?: KnowledgeSource["sourceKind"];
      state?: "active" | "unavailable";
      pageSize?: number;
      cursor?: string;
    } = {},
  ) =>
    request<BrainCursorPage<KnowledgeSource>>(
      `/v1/personal-brain/knowledge-sources-page?${new URLSearchParams({
        pageSize: String(input.pageSize ?? 50),
        ...(input.query ? { query: input.query } : {}),
        ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })}`,
    ),
  knowledgeSourceWorkspace: (id: string) =>
    request<{ source: KnowledgeSource }>(
      `/v1/personal-brain/knowledge-sources/${encodeURIComponent(id)}/workspace`,
    ),
  knowledgeSourceSpans: (
    id: string,
    input: { pageSize?: number; cursor?: string } = {},
  ) =>
    request<{
      items: Array<{
        sourceId: string;
        label: string;
        version: number;
        start: number;
        end: number;
        text: string;
        updatedAt: string;
      }>;
      cursor?: string;
      complete: boolean;
    }>(
      `/v1/personal-brain/knowledge-sources/${encodeURIComponent(id)}/spans?${new URLSearchParams(
        {
          limit: String(input.pageSize ?? 64_000),
          ...(input.cursor ? { start: input.cursor } : {}),
        },
      )}`,
    ),
  registerKnowledgeSource: (
    input:
      | {
          sourceKind: "file";
          label: string;
          path: string;
          retrievalRole?: KnowledgeSource["retrievalRole"];
          temporalScope?: KnowledgeSource["temporalScope"];
          requestKey?: string;
        }
      | {
          sourceKind: "inline";
          label: string;
          contentMarkdown: string;
          retrievalRole?: KnowledgeSource["retrievalRole"];
          temporalScope?: KnowledgeSource["temporalScope"];
          requestKey?: string;
        },
  ) =>
    request<KnowledgeSourceMutationOutcome<KnowledgeSource>>(
      "/v1/personal-brain/knowledge-sources",
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  updateKnowledgeSource: (
    id: string,
    input: {
      expectedVersion: number;
      priorContentHash: string;
      label?: string;
      contentMarkdown?: string;
      retrievalRole?: KnowledgeSource["retrievalRole"];
      temporalScope?: KnowledgeSource["temporalScope"];
      requestKey?: string;
    },
  ) =>
    request<KnowledgeSourceMutationOutcome<KnowledgeSource>>(
      `/v1/personal-brain/knowledge-sources/${encodeURIComponent(id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  reconcileKnowledgeSource: (
    id: string,
    input: {
      expectedVersion: number;
      priorContentHash: string;
      requestKey?: string;
    },
  ) =>
    request<KnowledgeSourceMutationOutcome<KnowledgeSource>>(
      `/v1/personal-brain/knowledge-sources/${encodeURIComponent(id)}/reconcile`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  unregisterKnowledgeSource: (
    id: string,
    input: {
      expectedVersion: number;
      priorContentHash: string;
      requestKey?: string;
    },
  ) =>
    request<BrainDeletionOutcome>(
      `/v1/personal-brain/knowledge-sources/${encodeURIComponent(id)}/unregister`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  deleteBrainRecord: (
    surface:
      | "memory"
      | "stable_profile"
      | "profile"
      | "personal_brain_page"
      | "person"
      | "knowledge_source",
    id: string,
    input: {
      expectedVersion?: number;
      expectedUpdatedAt?: string;
      expectedContentHash?: string;
      requestKey?: string;
    },
  ) =>
    request<BrainDeletionOutcome>(
      `/v1/local-data/${encodeURIComponent(surface === "profile" ? "stable_profile" : surface)}/${encodeURIComponent(id)}/delete`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          expectedUpdatedAt: input.expectedUpdatedAt,
          expectedContentHash: input.expectedContentHash,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  outputsPage: (
    input: {
      query?: string;
      mediaTypes?: string[];
      origin?: "conversation" | "schedule" | "unowned";
      createdAfter?: string;
      createdBefore?: string;
      pageSize?: number;
      cursor?: string;
    } = {},
  ) => {
    const query = new URLSearchParams({
      pageSize: String(input.pageSize ?? 50),
      ...(input.query ? { query: input.query } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
      ...(input.createdBefore ? { createdBefore: input.createdBefore } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    for (const mediaType of input.mediaTypes ?? [])
      query.append("mediaType", mediaType);
    return request<BrainCursorPage<OutputSummary>>(
      `/v1/artifacts/outputs?${query}`,
    );
  },
  outputWorkspace: (id: string) =>
    request<{
      output: OutputSummary;
      previews: ArtifactReference[];
      origins: Array<{
        type: "conversation" | "schedule_run" | "work";
        id: string;
        label: string;
        route?: string;
        availability: "available" | "unavailable";
      }>;
    }>(`/v1/artifacts/${encodeURIComponent(id)}/workspace`),
  outputContent,
  renameOutput: (
    id: string,
    input: { title: string; expectedUpdatedAt: string; requestKey?: string },
  ) =>
    request<BrainMutationOutcome<OutputSummary>>(
      `/v1/artifacts/${encodeURIComponent(id)}/rename`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestKey: input.requestKey ?? crypto.randomUUID(),
        }),
      },
    ),
  renderOutputPreview: (id: string, input: { requestKey?: string } = {}) =>
    request<{
      status: "ready" | "generating" | "unsupported" | "failed";
      previews: ArtifactReference[];
      truncated?: boolean;
      message?: string;
      replayed: boolean;
    }>(`/v1/artifacts/${encodeURIComponent(id)}/preview`, {
      method: "POST",
      body: JSON.stringify({
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(120_000),
    }),
  deleteOutput: (
    id: string,
    input: { expectedUpdatedAt: string; requestKey?: string },
  ) =>
    request<{
      status: "settled" | "gone";
      id: string;
      surface: "artifact";
      negativeRead: boolean;
      replayed: boolean;
    }>(`/v1/artifacts/${encodeURIComponent(id)}/delete`, {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  attachImageOutput: (id: string, input: { requestKey?: string } = {}) =>
    request<{
      artifact: ArtifactReference & { byteSize: number };
      replayed: boolean;
    }>(`/v1/artifacts/${encodeURIComponent(id)}/attach-to-current-session`, {
      method: "POST",
      body: JSON.stringify({
        requestKey: input.requestKey ?? crypto.randomUUID(),
      }),
    }),
  sendNext: (
    message: string,
    clientRequestId = crypto.randomUUID(),
    attachments?: ConversationAttachmentReference[],
    context?: ConversationContextSelection[],
  ) =>
    request<{ queued: true; clientRequestId?: string }>(
      "/v1/sessions/current/next-turn",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          clientRequestId,
          ...(attachments?.length ? { attachments } : {}),
          ...(context?.length ? { context } : {}),
        }),
      },
    ),
  followUp: (
    message: string,
    clientRequestId = crypto.randomUUID(),
    attachments?: ConversationAttachmentReference[],
    context?: ConversationContextSelection[],
  ) =>
    request<{ queued: true; clientRequestId?: string }>(
      "/v1/sessions/current/follow-up",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          clientRequestId,
          ...(attachments?.length ? { attachments } : {}),
          ...(context?.length ? { context } : {}),
        }),
      },
    ),
  steer: (
    message: string,
    clientRequestId = crypto.randomUUID(),
    attachments?: ConversationAttachmentReference[],
    context?: ConversationContextSelection[],
  ) =>
    request<{ queued: true; clientRequestId?: string }>(
      "/v1/sessions/current/steer",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          clientRequestId,
          ...(attachments?.length ? { attachments } : {}),
          ...(context?.length ? { context } : {}),
        }),
      },
    ),
  stop: () =>
    request<unknown>("/v1/sessions/current/abort", {
      method: "POST",
      body: "{}",
    }),
  toolConfirmations: () =>
    request<{ confirmations: NativeToolConfirmation[] }>(
      "/v1/tool-confirmations",
    ),
  approveToolConfirmation: async (value: string | NativeToolConfirmation) => {
    const confirmation =
      typeof value === "string"
        ? (
            await request<{ confirmations: NativeToolConfirmation[] }>(
              "/v1/tool-confirmations",
            )
          ).confirmations.find((item) => item.id === value)
        : value;
    if (!confirmation || !confirmation.owner)
      throw new RuntimeRequestError("That approval is no longer available.", {
        code: "confirmation_unavailable",
      });
    return request<{ confirmation?: NativeToolConfirmation }>(
      `/v1/tool-confirmations/${encodeURIComponent(confirmation.id)}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedArgumentsHash: confirmation.argumentsHash,
          expectedOwner: confirmation.owner,
          requestKey: crypto.randomUUID(),
        }),
      },
    );
  },
  rejectToolConfirmation: async (value: string | NativeToolConfirmation) => {
    const confirmation =
      typeof value === "string"
        ? (
            await request<{ confirmations: NativeToolConfirmation[] }>(
              "/v1/tool-confirmations",
            )
          ).confirmations.find((item) => item.id === value)
        : value;
    if (!confirmation || !confirmation.owner)
      throw new RuntimeRequestError("That approval is no longer available.", {
        code: "confirmation_unavailable",
      });
    return request<{ confirmation?: NativeToolConfirmation }>(
      `/v1/tool-confirmations/${encodeURIComponent(confirmation.id)}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          expectedArgumentsHash: confirmation.argumentsHash,
          expectedOwner: confirmation.owner,
          requestKey: crypto.randomUUID(),
        }),
      },
    );
  },
  artifact: (id: string) =>
    request<NativeArtifact>(`/v1/artifacts/${encodeURIComponent(id)}`),
  openArtifact: (id: string) =>
    request<{ dispatched: true }>(
      `/v1/artifacts/${encodeURIComponent(id)}/open`,
      { method: "POST", body: "{}" },
    ),
  models: () => request<{ providers: NativeModelCatalog }>("/v1/models"),
  startModelAuth: (provider: string, method: "oauth" | "api-key") =>
    request<{ id: string }>("/v1/model-auth", {
      method: "POST",
      body: JSON.stringify({ provider, method }),
    }),
  nextModelAuth: (id: string) =>
    request<NativeAuthInteractionEvent>(
      `/v1/model-auth/${encodeURIComponent(id)}/next`,
    ),
  respondModelAuth: (id: string, promptId: string, value: string) =>
    request<{ accepted: true }>(
      `/v1/model-auth/${encodeURIComponent(id)}/respond`,
      { method: "POST", body: JSON.stringify({ promptId, value }) },
    ),
  cancelModelAuth: (id: string) =>
    request<{ cancelled: true }>(`/v1/model-auth/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  selectModel: (input: {
    provider: string;
    model: string;
    reasoning: NativeThinkingLevel;
  }) =>
    request<ShellBootstrap["model"]>("/v1/model-selection", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  eventTicket: () =>
    request<{ ticket: string; expiresAt: string }>("/v1/events/ticket", {
      method: "POST",
      body: "{}",
    }),
  nextEvent: (ticket: string, after: number, signal: AbortSignal) =>
    request<{
      type: "invalidate" | "heartbeat";
      epoch: string;
      revision: number;
      domains: string[];
      createdAt: string;
      sessionId?: string;
      activeRunId?: string;
    }>(`/v1/events/next?ticket=${encodeURIComponent(ticket)}&after=${after}`, {
      signal,
    }),
  clearConnection: () => {
    connection = null;
  },
};
