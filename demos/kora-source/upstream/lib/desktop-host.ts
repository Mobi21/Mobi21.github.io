import { invoke } from "@tauri-apps/api/core";

const tauriInternals = (window as Window & {
  __TAURI_INTERNALS__?: { invoke?: unknown; transformCallback?: unknown };
}).__TAURI_INTERNALS__;

export const hasDesktopHost = Boolean(
  typeof tauriInternals?.invoke === "function" &&
  typeof tauriInternals?.transformCallback === "function",
);

export type HostPreferences = {
  version: 1;
  closeBehavior: "close_window_keep_kora_running" | "stop_kora_and_close";
  windowsNotificationsEnabled: boolean;
  notificationPreview: "show_details" | "hide_details";
  windowsNotificationsEnabledAt: string | null;
  amountsHidden: boolean;
};

export type BackgroundStartState = {
  registration: "enabled" | "disabled" | "repair_required" | "unavailable";
  startsPresentationHost: boolean;
};

export type HostLifecycleState = {
  phase: "starting" | "ready" | "degraded" | "failed" | "restarting" | "stopping";
  startedAt: string | null;
  problemCode: string | null;
};
type NativeHostCondition = {
  state: "ready" | "attention" | "unavailable" | "unknown";
  observedAt: string;
  problem?: { code: string; message: string };
};
export type HostCondition = {
  observedAt: string;
  lifecycle: NativeHostCondition;
  registration: BackgroundStartState["registration"];
  closeBehavior: "stop" | "remain_resident";
  residentState: NativeHostCondition;
};

export type TroubleshootingCopyDetails = {
  phase: "starting" | "ready" | "degraded" | "restarting" | "stopping" | "failed" | "unavailable";
  observedAt?: string;
  storageState?: "ready" | "attention" | "unavailable" | "unknown";
  storageIntegrity?: "ok" | "failed" | "not_checked";
  storageLastCheckedAt?: string;
  schemaVersion?: number;
  modelCredentialState?: "configured" | "required" | "unknown";
  integrationsConnected?: number;
  integrationsNeedsAttention?: number;
  runtimeBuild?: string;
  revision?: number;
  windowsVersion?: string;
  webviewVersion?: string;
  currentError?: { code: string; message: string; requestId?: string };
};

export type RuntimeStopOperation = {
  operationId: string;
  state: "stopping" | "settled" | "timed_out" | "failed";
  errorCode: string | null;
};

export type BrowserExtensionHostState = {
  registered: boolean;
  extensionId: string;
  hostName: string;
  extensionPath: string | null;
  hostPath: string | null;
  reason: string | null;
};
export type LocalBackupSummary = {
  createdAt: string;
  schemaVersion: number;
  recordCount: number;
  artifactCount: number;
  totalFiles: number;
  totalBytes: number;
  exclusions: Array<"credentials" | "external_originals" | "provider_owned_unadmitted_data" | "device_preferences" | "regenerable_previews">;
};
export type LocalBackupInspectionOutcome =
  | { status: "settled"; operationId: string; backupHandle: string; summary: LocalBackupSummary }
  | { status: "cancelled"; operationId: string }
  | { status: "failed"; operationId: string; code: string; message: string; currentStatePreserved?: boolean };
export type LocalRecoveryOutcome =
  | { status: "settled"; operationId: string; phase: "settled"; summary?: LocalBackupSummary; validatedRollbackAvailable?: boolean; unvalidatedCurrentStateConfirmed?: boolean }
  | { status: "cancelled"; operationId: string }
  | { status: "failed"; operationId: string; phase: "failed"; code: string; message: string; currentStatePreserved?: boolean };
export type LocalRecoveryStatus = {
  operationId: string;
  kind: "backup" | "inspect" | "restore";
  status: "running" | "settled" | "cancelled" | "failed";
  phase: "inspecting" | "inspected" | "backing_up" | "quiescing" | "restoring" | "recovering" | "restarting" | "verifying" | "settled" | "cancelled" | "failed";
  receipt?: { status: "settled" | "failed"; code?: string; completedAt: string; currentStatePreserved?: boolean; validatedRollbackAvailable?: boolean; unvalidatedCurrentStateConfirmed?: boolean };
  currentStatePreserved?: boolean;
};

function desktopInvoke<T>(command: string, args?: Record<string, unknown>) {
  if (!hasDesktopHost) return Promise.reject(new Error("This control is available in the Kora desktop app."));
  return invoke<T>(command, args);
}

export function projectTroubleshootingInvoke(details: TroubleshootingCopyDetails | Record<string, unknown>) {
  const allowed = [
    "phase", "observedAt", "storageState", "storageIntegrity", "storageLastCheckedAt",
    "schemaVersion", "modelCredentialState", "integrationsConnected",
    "integrationsNeedsAttention", "runtimeBuild", "revision", "windowsVersion",
    "webviewVersion", "currentError",
  ] as const;
  const exact = Object.fromEntries(
    allowed.flatMap((key) => details[key] === undefined ? [] : [[key, details[key]]]),
  );
  return { command: "copy_troubleshooting_details", args: { details: exact } } as const;
}

function copyTroubleshootingDetails(details: TroubleshootingCopyDetails | Record<string, unknown>) {
  const invocation = projectTroubleshootingInvoke(details);
  return desktopInvoke<void>(invocation.command, invocation.args);
}

export const desktopHost = {
  preferences: () => desktopInvoke<HostPreferences>("read_window_preferences"),
  setCloseBehavior: (closeBehavior: HostPreferences["closeBehavior"]) =>
    desktopInvoke<HostPreferences>("set_close_behavior", { closeBehavior }),
  setNotificationPreferences: (enabled: boolean, preview: HostPreferences["notificationPreview"]) =>
    desktopInvoke<HostPreferences>("set_windows_notification_preferences", { enabled, preview }),
  setAmountsHidden: (amountsHidden: boolean) =>
    desktopInvoke<HostPreferences>("set_amounts_hidden", { amountsHidden }),
  setInterfaceScale: (scale: 0.9 | 1 | 1.1 | 1.25) =>
    desktopInvoke<number>("set_interface_scale", { scale }),
  backgroundStart: () => desktopInvoke<BackgroundStartState>("background_start_status"),
  setBackgroundStart: (enabled: boolean, requestKey: string = crypto.randomUUID()) =>
    desktopInvoke<BackgroundStartState & { status: "settled" }>("set_background_start", { enabled, requestKey }),
  replaceBackgroundStart: (confirmed: true, requestKey: string = crypto.randomUUID()) =>
    desktopInvoke<BackgroundStartState & { status: "settled" }>("replace_background_start", { confirmed, requestKey }),
  lifecycleState: () => desktopInvoke<HostLifecycleState>("host_lifecycle_state"),
  condition: () => desktopInvoke<HostCondition>("host_condition"),
  closeApplication: () => desktopInvoke<void>("close_application"),
  requestRuntimeStop: (requestKey = crypto.randomUUID()) =>
    desktopInvoke<RuntimeStopOperation>("request_runtime_stop", { requestKey }),
  runtimeStopStatus: (operationId: string) =>
    desktopInvoke<RuntimeStopOperation>("runtime_stop_status", { operationId }),
  forceCloseHost: () => desktopInvoke<void>("force_close_host"),
  notificationPermission: () => desktopInvoke<"granted" | "denied" | "prompt">("windows_notification_permission"),
  requestNotificationPermission: () => desktopInvoke<"granted" | "denied" | "prompt">("request_windows_notification_permission"),
  openLocation: (target: "data_root" | "logs") => desktopInvoke<void>("open_kora_location", { target }),
  openDocument: (target: "pi_attribution" | "third_party_licenses") => desktopInvoke<void>("open_bundled_document", { target }),
  openExternalUrl: (url: string) => desktopInvoke<void>("open_external_url", { url }),
  inspectLocalBackup: () => desktopInvoke<LocalBackupInspectionOutcome>("inspect_local_backup"),
  createLocalBackup: () => desktopInvoke<LocalRecoveryOutcome>("create_local_backup"),
  restoreLocalBackup: (backupHandle: string, confirmation: { replaceCurrentState: true; allowUnvalidatedCurrentState?: true }) =>
    desktopInvoke<LocalRecoveryOutcome>("restore_local_backup", { backupHandle, confirmation }),
  recoveryStatus: (operationId: string) =>
    desktopInvoke<LocalRecoveryStatus>("recovery_status", { operationId }),
  latestRecoveryStatus: () =>
    desktopInvoke<LocalRecoveryStatus | null>("latest_recovery_status"),
  troubleshootingDetails: () => desktopInvoke<{ guiBuild?: string; candidateId: string; sourceRevision: string; sourceDirty: boolean; builtAt: string; rendererDigest: string; runtimeDigest: string; protocolVersion?: string; daemonPid?: number; daemonEpoch?: string; startedAt?: string; lastTransitionAt?: string; hostPhase: HostLifecycleState["phase"]; hostProblemCode?: string; hostInstance: string }>("host_troubleshooting_details"),
  copyTroubleshootingDetails,
  browserExtensionStatus: () =>
    desktopInvoke<BrowserExtensionHostState>("browser_extension_status"),
  setBrowserExtensionEnabled: (enabled: boolean) =>
    desktopInvoke<BrowserExtensionHostState>(
      enabled ? "register_browser_extension" : "unregister_browser_extension",
    ),
};
