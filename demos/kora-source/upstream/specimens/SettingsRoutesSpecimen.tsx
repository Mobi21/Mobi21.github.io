import "@fontsource-variable/mona-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router-dom";
import { DirtyDraftGuardProvider } from "../app/DirtyDraftGuard";
import { ConnectionContext, type ConnectionValue } from "../app/connection-context";
import { pathForOperationalRoute } from "../app/navigation";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect, ToastProvider, TooltipProvider } from "../components/primitives";
import { ApprovalDetailPage, SettingsWorkspace } from "../features/settings/SettingsWorkspace";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { DEFAULT_APPEARANCE, saveAppearance, type AppearancePreferences } from "../lib/appearance";
import { runtime, RuntimeRequestError, type NativeProvider, type NativeSchedule, type NativeScheduleRun, type NativeScheduleTrigger, type NativeToolConfirmation } from "../lib/runtime";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/shell.css";
import "../styles/app.css";
import "./settings-routes-specimen.css";

export const settingsRouteSurfaces = [
  "overview", "schedules", "schedule-new", "schedule-detail", "schedule-run",
  "notifications", "integrations", "integration-detail", "model", "model-provider",
  "background", "appearance", "data", "diagnostics", "approval",
] as const;
type Surface = (typeof settingsRouteSurfaces)[number];
export const settingsRouteFixtures = [
  "populated", "empty", "loading", "unavailable", "attention", "long-copy",
  "overview-partial", "overview-isolated-attention",
  "filtered-empty", "large", "partial", "due-unknown", "action-error",
  "schedule-create-pending", "schedule-create-success", "schedule-once", "schedule-interval", "runs-large",
  "enabled", "paused", "cancelled", "missing", "runs-empty", "runs-partial",
  "run-queued", "run-running", "run-retry-wait", "run-finished", "run-stopped", "run-cancelled", "run-missing", "run-provider-unavailable",
  "provider-connected", "provider-not-checked", "provider-stale", "provider-not-configured", "provider-not-connected", "provider-unavailable", "provider-repair", "provider-partial", "provider-check-pending", "provider-check-error", "provider-check-stale", "authority-not-supported", "github-connected", "unknown-provider",
  "provider-denied", "provider-expired", "auth-url", "auth-device-code", "auth-prompt", "auth-secret", "auth-failed", "auth-cancelled", "auth-expired", "auth-response-pending", "auth-cancel-uncertain",
  "browser-ready", "browser-connecting", "browser-waiting-owner", "browser-degraded", "browser-bridge-unavailable",
  "schedule-dirty", "schedule-error", "model-dirty", "model-error", "credential-loading", "credential-empty", "credential-populated", "credential-read-error", "credential-dirty", "credential-error",
  "invalid", "conflict", "permission-granted", "permission-denied", "permission-not-determined", "permission-unavailable",
  "quiet-unset", "quiet-same-day", "quiet-cross-midnight", "quiet-invalid",
  "theme-system", "theme-light", "theme-dark", "density-comfortable", "density-compact", "scale-90", "scale-100", "scale-110", "scale-125", "appearance-native-absent", "appearance-reset", "shortcuts-empty", "shortcuts-many",
  "native-present", "native-absent", "startup-enabled", "startup-disabled", "startup-unavailable", "startup-checking", "startup-error", "startup-mutation-error",
  "drafts-none", "drafts-some", "drafts-unknown", "clear-pending", "clear-error", "clear-success", "migration-none", "migration-some", "migration-error", "folder-unavailable",
  "migration-restricted", "migration-dismissed", "model-catalog-large", "model-conflict",
  "diagnostics-healthy", "diagnostics-degraded", "diagnostics-offline", "diagnostics-partial", "diagnostics-long-values", "diagnostics-copy-error", "diagnostics-open-logs-error",
  "approval-valid", "approval-expired", "approval-decided", "approval-missing", "approval-multiple", "approval-decision-error",
  "approval-pending", "approval-success", "approval-error", "approval-conflict", "approval-runtime-unavailable",
] as const;
export type SettingsRouteFixture = (typeof settingsRouteFixtures)[number];
type Fixture = SettingsRouteFixture;

export const settingsAcceptanceViewports = [
  { id: "wide-2560", width: 2560, height: 1440 },
  { id: "desktop-1920", width: 1920, height: 1080 },
  { id: "desktop-1440", width: 1440, height: 900 },
  { id: "desktop-1280", width: 1280, height: 800 },
  { id: "intermediate-960", width: 960, height: 768 },
  { id: "minimum-680", width: 680, height: 620 },
] as const;

type AcceptanceCase = {
  category: "invalid-conflict" | "notifications-quiet-hours" | "permission-auth" | "unavailable-offline" | "native-startup" | "appearance" | "data-clear" | "diagnostics" | "approval";
  surface: Surface;
  fixture: Fixture;
  qualification: "browser" | "native";
};

/** Deterministic PRD 11 qualification registry. Native cases remain explicit
 * without pretending the browser specimen certifies Tauri or OS behavior. */
export const settingsRequiredAcceptanceCases: readonly AcceptanceCase[] = [
  { category: "invalid-conflict", surface: "schedule-new", fixture: "invalid", qualification: "browser" },
  { category: "invalid-conflict", surface: "schedule-new", fixture: "conflict", qualification: "browser" },
  { category: "invalid-conflict", surface: "schedule-detail", fixture: "conflict", qualification: "browser" },
  { category: "notifications-quiet-hours", surface: "notifications", fixture: "quiet-unset", qualification: "browser" },
  { category: "notifications-quiet-hours", surface: "notifications", fixture: "quiet-same-day", qualification: "browser" },
  { category: "notifications-quiet-hours", surface: "notifications", fixture: "quiet-cross-midnight", qualification: "browser" },
  { category: "notifications-quiet-hours", surface: "notifications", fixture: "quiet-invalid", qualification: "browser" },
  { category: "notifications-quiet-hours", surface: "notifications", fixture: "conflict", qualification: "browser" },
  { category: "permission-auth", surface: "notifications", fixture: "permission-granted", qualification: "native" },
  { category: "permission-auth", surface: "notifications", fixture: "permission-denied", qualification: "native" },
  { category: "permission-auth", surface: "notifications", fixture: "permission-not-determined", qualification: "native" },
  { category: "permission-auth", surface: "notifications", fixture: "permission-unavailable", qualification: "native" },
  { category: "permission-auth", surface: "integration-detail", fixture: "provider-denied", qualification: "browser" },
  { category: "permission-auth", surface: "integration-detail", fixture: "provider-expired", qualification: "browser" },
  { category: "permission-auth", surface: "integration-detail", fixture: "auth-expired", qualification: "browser" },
  { category: "unavailable-offline", surface: "integration-detail", fixture: "provider-unavailable", qualification: "browser" },
  { category: "unavailable-offline", surface: "diagnostics", fixture: "diagnostics-offline", qualification: "browser" },
  { category: "native-startup", surface: "background", fixture: "native-present", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "native-absent", qualification: "browser" },
  { category: "native-startup", surface: "background", fixture: "startup-enabled", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "startup-disabled", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "startup-unavailable", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "startup-checking", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "startup-error", qualification: "native" },
  { category: "native-startup", surface: "background", fixture: "startup-mutation-error", qualification: "native" },
  { category: "appearance", surface: "appearance", fixture: "theme-system", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "theme-light", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "theme-dark", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "density-comfortable", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "density-compact", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "scale-90", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "scale-100", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "scale-110", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "scale-125", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "appearance-native-absent", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "appearance-reset", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "shortcuts-empty", qualification: "browser" },
  { category: "appearance", surface: "appearance", fixture: "shortcuts-many", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "drafts-none", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "drafts-some", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "drafts-unknown", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "clear-pending", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "clear-error", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "clear-success", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "migration-none", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "migration-some", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "migration-error", qualification: "browser" },
  { category: "data-clear", surface: "data", fixture: "folder-unavailable", qualification: "browser" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-healthy", qualification: "browser" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-degraded", qualification: "browser" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-offline", qualification: "browser" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-partial", qualification: "browser" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-copy-error", qualification: "native" },
  { category: "diagnostics", surface: "diagnostics", fixture: "diagnostics-open-logs-error", qualification: "native" },
  { category: "approval", surface: "approval", fixture: "approval-valid", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-expired", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-decided", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-missing", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-multiple", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-decision-error", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-pending", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-success", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-error", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-conflict", qualification: "browser" },
  { category: "approval", surface: "approval", fixture: "approval-runtime-unavailable", qualification: "browser" },
] as const;

export const settingsUnsupportedAcceptanceClaims = [
  {
    id: "schedule-approval-required",
    reason: "NativeSchedule and schedule mutation responses do not expose a pending approval reference; approval remains a separate tool-confirmation surface.",
  },
  {
    id: "schedule-stale",
    reason: "NativeSchedule has version and update timestamps but no canonical freshness or stale state.",
  },
  {
    id: "run-partial",
    reason: "NativeScheduleRun has canonical active and terminal states but no partial-result state or completeness field.",
  },
  {
    id: "migration-stale",
    reason: "Migration summary and pending-candidate contracts expose timestamps and dispositions, not a canonical stale qualification.",
  },
  {
    id: "browser-bridge-browser-certification",
    reason: "Desktop bridge registration is owned by the Tauri host and cannot be established by a browser specimen.",
  },
] as const;

export const settingsSupplementalAcceptanceCases: ReadonlyArray<{
  id: string;
  surface: Surface;
  fixture: Fixture;
  qualification: "browser" | "native";
}> = [
  { id: "overview-partial", surface: "overview", fixture: "overview-partial", qualification: "browser" },
  { id: "overview-isolated-attention", surface: "overview", fixture: "overview-isolated-attention", qualification: "browser" },
  { id: "schedule-create-pending", surface: "schedule-new", fixture: "schedule-create-pending", qualification: "browser" },
  { id: "schedule-create-success", surface: "schedule-new", fixture: "schedule-create-success", qualification: "browser" },
  { id: "schedule-trigger-once", surface: "schedule-detail", fixture: "schedule-once", qualification: "browser" },
  { id: "schedule-trigger-interval", surface: "schedule-detail", fixture: "schedule-interval", qualification: "browser" },
  { id: "schedule-large-run-history", surface: "schedule-detail", fixture: "runs-large", qualification: "browser" },
  { id: "run-waiting", surface: "schedule-run", fixture: "run-retry-wait", qualification: "browser" },
  { id: "run-retryable", surface: "schedule-run", fixture: "run-stopped", qualification: "browser" },
  { id: "run-terminal", surface: "schedule-run", fixture: "run-finished", qualification: "browser" },
  { id: "provider-not-checked", surface: "integration-detail", fixture: "provider-not-checked", qualification: "browser" },
  { id: "provider-partial", surface: "integration-detail", fixture: "provider-partial", qualification: "browser" },
  { id: "provider-check-pending", surface: "integration-detail", fixture: "provider-check-pending", qualification: "browser" },
  { id: "provider-check-error", surface: "integration-detail", fixture: "provider-check-error", qualification: "browser" },
  { id: "provider-check-stale", surface: "integration-detail", fixture: "provider-check-stale", qualification: "browser" },
  { id: "authority-not-supported", surface: "integration-detail", fixture: "authority-not-supported", qualification: "browser" },
  { id: "github-connected", surface: "integration-detail", fixture: "github-connected", qualification: "browser" },
  { id: "auth-response-pending", surface: "integration-detail", fixture: "auth-response-pending", qualification: "browser" },
  { id: "auth-cancel-uncertain", surface: "integration-detail", fixture: "auth-cancel-uncertain", qualification: "browser" },
  { id: "browser-ready", surface: "integration-detail", fixture: "browser-ready", qualification: "browser" },
  { id: "browser-connecting", surface: "integration-detail", fixture: "browser-connecting", qualification: "browser" },
  { id: "browser-waiting-owner", surface: "integration-detail", fixture: "browser-waiting-owner", qualification: "browser" },
  { id: "browser-degraded", surface: "integration-detail", fixture: "browser-degraded", qualification: "browser" },
  { id: "browser-bridge-registration", surface: "integration-detail", fixture: "browser-bridge-unavailable", qualification: "native" },
  { id: "model-catalog-large", surface: "model", fixture: "model-catalog-large", qualification: "browser" },
  { id: "model-auth-device-code", surface: "model-provider", fixture: "auth-device-code", qualification: "browser" },
  { id: "model-selection-conflict", surface: "model", fixture: "model-conflict", qualification: "browser" },
  { id: "migration-restricted", surface: "data", fixture: "migration-restricted", qualification: "browser" },
  { id: "migration-dismissed", surface: "data", fixture: "migration-dismissed", qualification: "browser" },
  { id: "diagnostics-long-values", surface: "diagnostics", fixture: "diagnostics-long-values", qualification: "browser" },
] as const;

const commonFixtures = ["populated", "empty", "loading", "unavailable", "long-copy"] as const;
export const settingsRouteFixtureMatrix: Record<Surface, readonly Fixture[]> = {
  overview: [...commonFixtures, "attention", "overview-partial", "overview-isolated-attention"],
  schedules: [...commonFixtures, "filtered-empty", "large", "partial", "due-unknown", "action-error"],
  "schedule-new": ["populated", "long-copy", "schedule-dirty", "schedule-error", "schedule-create-pending", "schedule-create-success", "invalid", "conflict", "loading", "unavailable"],
  "schedule-detail": ["enabled", "paused", "cancelled", "missing", "runs-empty", "runs-partial", "runs-large", "schedule-once", "schedule-interval", "action-error", "conflict", "loading", "unavailable", "long-copy"],
  "schedule-run": ["run-queued", "run-running", "run-retry-wait", "run-finished", "run-stopped", "run-cancelled", "run-missing", "run-provider-unavailable", "loading", "unavailable", "long-copy"],
  notifications: [...commonFixtures, "attention", "quiet-unset", "quiet-same-day", "quiet-cross-midnight", "quiet-invalid", "conflict", "permission-granted", "permission-denied", "permission-not-determined", "permission-unavailable"],
  integrations: [...commonFixtures, "attention", "provider-not-checked", "provider-stale", "provider-unavailable", "provider-repair", "provider-partial"],
  "integration-detail": ["provider-connected", "provider-not-checked", "provider-stale", "provider-not-configured", "provider-not-connected", "provider-unavailable", "provider-repair", "provider-partial", "provider-check-pending", "provider-check-error", "provider-check-stale", "authority-not-supported", "github-connected", "provider-denied", "provider-expired", "unknown-provider", "auth-url", "auth-device-code", "auth-prompt", "auth-secret", "auth-failed", "auth-cancelled", "auth-expired", "auth-response-pending", "auth-cancel-uncertain", "browser-ready", "browser-connecting", "browser-waiting-owner", "browser-degraded", "browser-bridge-unavailable", "credential-loading", "credential-empty", "credential-populated", "credential-read-error", "credential-dirty", "credential-error", "loading", "unavailable", "long-copy"],
  model: [...commonFixtures, "attention", "model-catalog-large", "model-dirty", "model-error", "model-conflict"],
  "model-provider": [...commonFixtures, "attention", "auth-url", "auth-device-code", "auth-prompt", "auth-secret", "auth-failed", "auth-cancelled", "auth-response-pending", "auth-cancel-uncertain"],
  background: [...commonFixtures, "attention", "native-present", "native-absent", "startup-enabled", "startup-disabled", "startup-unavailable", "startup-checking", "startup-error", "startup-mutation-error"],
  appearance: [...commonFixtures, "theme-system", "theme-light", "theme-dark", "density-comfortable", "density-compact", "scale-90", "scale-100", "scale-110", "scale-125", "appearance-native-absent", "appearance-reset", "shortcuts-empty", "shortcuts-many"],
  data: [...commonFixtures, "attention", "drafts-none", "drafts-some", "drafts-unknown", "clear-pending", "clear-error", "clear-success", "migration-none", "migration-some", "migration-error", "migration-restricted", "migration-dismissed", "folder-unavailable"],
  diagnostics: [...commonFixtures, "attention", "diagnostics-healthy", "diagnostics-degraded", "diagnostics-offline", "diagnostics-partial", "diagnostics-long-values", "diagnostics-copy-error", "diagnostics-open-logs-error"],
  approval: [...commonFixtures, "attention", "approval-valid", "approval-expired", "approval-decided", "approval-missing", "approval-multiple", "approval-decision-error", "approval-pending", "approval-success", "approval-error", "approval-conflict", "approval-runtime-unavailable"],
};

const search = new URLSearchParams(window.location.search);
const requestedSurface = search.get("surface") as Surface | null;
const requestedFixture = search.get("fixture") as Fixture | null;
const surface: Surface = requestedSurface && settingsRouteSurfaces.includes(requestedSurface) ? requestedSurface : "overview";
const fixture: Fixture = requestedFixture && settingsRouteFixtureMatrix[surface].includes(requestedFixture) ? requestedFixture : settingsRouteFixtureMatrix[surface][0];
const appearanceForFixture = (): AppearancePreferences => ({
  ...DEFAULT_APPEARANCE,
  theme: fixture === "theme-light" ? "light" : fixture === "theme-dark" || fixture === "appearance-reset" ? "dark" : "system",
  density: fixture === "density-compact" || fixture === "appearance-reset" ? "compact" : "comfortable",
  scale: fixture === "scale-90" ? 0.9 : fixture === "scale-110" ? 1.1 : fixture === "scale-125" || fixture === "appearance-reset" ? 1.25 : 1,
});
if (surface === "appearance") saveAppearance(appearanceForFixture());
const now = "2026-08-29T18:20:00.000Z";
const earlier = "2026-08-29T13:05:00.000Z";
const never = () => new Promise<never>(() => undefined);
const unavailable = () => Promise.reject(new RuntimeRequestError("Synthetic Settings authority is unavailable.", { code: "runtime_unavailable", status: 503 }));

const scheduleState = fixture === "paused" ? "paused" : fixture === "cancelled" ? "cancelled" : "enabled";
const longScheduleName = "Weekly review across every open commitment and provider-qualified planning source";
const scheduleTrigger: NativeScheduleTrigger = fixture === "schedule-once"
  ? { kind: "once", at: "2026-09-02T13:15:00.000Z" }
  : fixture === "schedule-interval"
    ? { kind: "interval", everyMs: 21_600_000, anchorAt: "2026-08-30T13:15:00.000Z" }
    : { kind: "recurring", frequency: "weekly", localTime: "17:30", startDate: "2026-08-30", timezone: "America/New_York", weekdays: [7] };
const schedule: NativeSchedule = {
  id: "schedule-weekly-review",
  name: fixture === "long-copy" ? longScheduleName : "Weekly review",
  displayLabel: fixture === "long-copy" ? longScheduleName : "Weekly review",
  prompt: fixture === "long-copy"
    ? "Review every open commitment, preserve exact project names and source qualifications, explain any unavailable provider coverage, and prepare a detailed Sunday planning note without changing records or implying that an unchecked source is disconnected."
    : "Review open commitments and prepare a concise Sunday planning note.",
  trigger: scheduleTrigger,
  timezone: "America/New_York",
  nextDueAt: fixture === "due-unknown" || fixture === "cancelled" ? null : "2026-08-30T21:30:00.000Z",
  state: fixture === "attention" ? "paused" : scheduleState,
  attentionTier: "digest" as const,
  isTouchpoint: true,
  version: 3,
  createdAt: earlier,
  updatedAt: now,
  lastRunState: fixture === "attention" ? "stopped" : fixture === "runs-empty" ? null : "finished",
  lastRunId: "run-weekly-review",
};
const runState = fixture === "run-queued" ? "claimed"
  : fixture === "run-running" ? "running"
    : fixture === "run-retry-wait" ? "retry_wait"
      : fixture === "run-stopped" || fixture === "run-provider-unavailable" || fixture === "attention" ? "stopped"
        : fixture === "run-cancelled" ? "cancelled"
          : "finished";
const runActive = runState === "claimed" || runState === "running" || runState === "retry_wait";
const run: NativeScheduleRun = {
  id: "run-weekly-review",
  scheduleId: schedule.id,
  occurrence: earlier,
  trigger: "automatic" as const,
  state: runState,
  attentionTier: "digest" as const,
  reasonCode: fixture === "run-provider-unavailable" || fixture === "attention" ? "provider_unavailable" : fixture === "run-retry-wait" ? "retry_scheduled" : null,
  detail: fixture === "run-provider-unavailable" || fixture === "attention" ? "Calendar coverage could not be confirmed; no event was changed." : fixture === "run-retry-wait" ? "Kora will retry after the current provider backoff window." : null,
  sessionId: "synthetic-session",
  artifactId: null,
  resultText: runActive ? null : fixture === "run-provider-unavailable" || fixture === "attention" ? "The review stopped because calendar coverage was unavailable." : fixture === "run-stopped" ? null : fixture === "run-cancelled" ? null : fixture === "long-copy" ? "The weekly review completed with three commitments carried forward. Two source checks remained explicitly qualified because the runtime did not return a current observation, so the note preserves that uncertainty instead of treating either source as disconnected." : "Weekly review completed with three commitments carried forward.",
  claimedAt: earlier,
  turnStartedAt: earlier,
  finishedAt: runActive ? null : now,
};
let scheduleCatalog: NativeSchedule[] = fixture === "large"
  ? Array.from({ length: 100 }, (_, index) => ({
      ...schedule,
      id: `schedule-${String(index + 1).padStart(3, "0")}`,
      name: `Planning routine ${index + 1}`,
      displayLabel: `Planning routine ${index + 1}`,
      state: index % 9 === 0 ? "paused" : "enabled",
      nextDueAt: new Date(Date.parse(schedule.nextDueAt ?? now) + index * 3_600_000).toISOString(),
      version: index + 1,
    }))
  : [schedule];
const runCatalog: NativeScheduleRun[] = fixture === "runs-large"
  ? Array.from({ length: 75 }, (_, index) => ({
      ...run,
      id: `run-${String(index + 1).padStart(3, "0")}`,
      occurrence: new Date(Date.parse(earlier) - index * 86_400_000).toISOString(),
      state: index % 11 === 0 ? "stopped" : index % 13 === 0 ? "cancelled" : "finished",
      reasonCode: index % 11 === 0 ? "provider_unavailable" : null,
      detail: index % 11 === 0 ? "A synthetic provider check was unavailable; no external record changed." : null,
      resultText: index % 11 === 0 ? null : `Synthetic retained result ${index + 1}.`,
      claimedAt: new Date(Date.parse(earlier) - index * 86_400_000).toISOString(),
      turnStartedAt: new Date(Date.parse(earlier) - index * 86_400_000 + 30_000).toISOString(),
      finishedAt: new Date(Date.parse(earlier) - index * 86_400_000 + 90_000).toISOString(),
    }))
  : [run];
let currentSchedule = schedule;
let scheduleRevision = 0;
const nextScheduleRevision = () => new Date(Date.parse(now) + (++scheduleRevision * 1_000)).toISOString();
let scheduleConflictInjected = false;
const providerId = fixture === "authority-not-supported" || fixture === "github-connected" ? "github" : "google-workspace";
const providerConnected = fixture === "provider-connected" || fixture === "populated" || fixture === "provider-check-pending" || fixture === "provider-check-stale" || fixture === "authority-not-supported" || fixture === "github-connected";
const providerUnconfigured = fixture === "empty" || fixture === "provider-not-configured";
const providerNotChecked = fixture === "provider-not-checked" || providerUnconfigured;
const providerAccessDenied = fixture === "provider-denied";
const providerAccessExpired = fixture === "provider-expired";
const providerUnavailable = fixture === "provider-unavailable" || fixture === "unavailable";
const providerDegraded = fixture === "provider-stale" || fixture === "provider-repair" || fixture === "provider-partial" || fixture === "provider-check-error" || fixture === "attention" || providerAccessDenied || providerAccessExpired;
const authorityNotSupported = providerId === "github";
const providerSupportedOperations = providerId === "github"
  ? ["repository.read", "issue.write", "pull-request.write", "actions.read", "actions.write", "release.read", "release.write"]
  : ["workspace.read", "workspace.write"];
const providerAvailableOperations = providerConnected ? providerSupportedOperations : [];
const providerReportedScopes = providerId === "github" ? ["repo", "workflow"] : ["calendar.readonly", "drive.readonly"];
const providerHasHistoricalAuthority = providerDegraded || fixture === "provider-unavailable" || fixture === "unavailable";
const providerFailedWithoutHistory = providerAccessDenied || providerAccessExpired || fixture === "provider-check-error" || fixture === "unavailable";
const authorityObservation: NonNullable<NativeProvider["authorityObservation"]> = authorityNotSupported
  ? { state: "not_supported" }
  : providerNotChecked
    ? { state: "not_checked" }
    : providerHasHistoricalAuthority
      ? { state: "failed", ...(providerFailedWithoutHistory ? {} : { lastSuccessfulScopes: providerReportedScopes, lastSuccessfulAt: "2026-08-25T18:00:00.000Z" }) }
      : { state: "reported", scopes: providerReportedScopes, observedAt: earlier };
const providerLifecycleActions = providerId === "github"
  ? [{ kind: "disconnect" as const, label: "Disconnect GitHub CLI", operation: "disconnect_github", effect: { localCredential: "removed" as const, remoteAuthority: "unchanged" as const } }]
  : [{ kind: "disconnect" as const, label: "Disconnect Google Workspace", operation: "disconnect_google_workspace", effect: { localCredential: "removed" as const, remoteAuthority: "not-claimed" as const } }];
const providerConfigured = !providerUnconfigured;
const providerUnavailableReason = providerUnconfigured
  ? "No provider account has been configured."
  : providerUnavailable
    ? "The provider status query is unavailable. This is not a disconnected-account result."
    : providerAccessDenied
      ? "The provider denied access. Reauthorize this account before Kora can use it."
      : providerAccessExpired
        ? "The provider credentials expired. Reauthorize this account before Kora can use it."
        : fixture === "provider-stale"
          ? "The latest provider observation is stale; prior authority details are retained for review."
          : fixture === "provider-partial"
            ? "Synthetic partial observation: current provider coverage is unavailable; prior reported scopes are retained as history."
            : providerDegraded
              ? "The synthetic provider check needs attention; no current capability grant is claimed."
              : undefined;
const providerProblem = providerUnconfigured
  ? { code: "not_configured", message: providerUnavailableReason ?? "No provider account has been configured." }
  : providerAccessDenied
    ? { code: "access_denied", message: providerUnavailableReason ?? "The provider denied access. Reauthorize this account before Kora can use it." }
    : providerAccessExpired
      ? { code: "credentials_expired", message: providerUnavailableReason ?? "The provider credentials expired. Reauthorize this account before Kora can use it." }
      : providerUnavailable
        ? { code: "provider_unavailable", message: providerUnavailableReason ?? "The provider status query is unavailable." }
        : fixture === "provider-check-error" || providerDegraded
          ? { code: "connection_check_failed", message: providerUnavailableReason ?? "The synthetic provider check needs attention." }
          : undefined;
const provider: NativeProvider = {
  id: providerId,
  configured: providerConfigured,
  accessState: providerUnconfigured ? "not_configured" : providerAccessDenied ? "denied" : providerAccessExpired ? "expired" : providerConnected ? "available" : "unknown",
  connected: providerConnected,
  health: providerUnconfigured || providerUnavailable ? "unavailable" : providerDegraded ? "degraded" : "available",
  ...(providerNotChecked ? {} : { lastCheckedAt: earlier }),
  lastSuccessfulCheckAt: authorityObservation.state === "reported" ? authorityObservation.observedAt : authorityObservation.state === "failed" ? authorityObservation.lastSuccessfulAt : undefined,
  unavailableReason: providerUnavailableReason,
  connectionState: !providerConfigured ? "not_configured" : providerConnected ? "connected" : providerNotChecked ? "unchecked" : "needs_attention",
  connectionObservedAt: providerNotChecked ? undefined : earlier,
  supportedOperations: providerSupportedOperations,
  availableOperations: providerAvailableOperations,
  authorityObservation,
  lifecycleActions: providerLifecycleActions,
  problem: providerProblem,
  scopes: authorityObservation.state === "reported" ? authorityObservation.scopes : authorityObservation.state === "failed" ? authorityObservation.lastSuccessfulScopes ?? [] : [],
  operations: providerAvailableOperations,
  updatedAt: now,
};
let currentProvider = provider;
let providerRevision = 0;
const nextProviderRevision = () => new Date(Date.parse(now) + (++providerRevision * 1_000)).toISOString();
let githubAccountTargets = [
  { hostname: "github.com", user: "synthetic-user", active: true },
  { hostname: "github.enterprise.test", user: "synthetic-user", active: false },
];
const modelProvider = {
  id: "openai-codex",
  name: "OpenAI Codex",
  configured: fixture !== "attention",
  authMethods: ["oauth" as const, "api-key" as const],
  authError: fixture === "attention" ? "Sign-in needs attention" : undefined,
  models: [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", input: ["text", "image"], reasoning: ["low" as const, "medium" as const, "high" as const] }],
};
const modelCatalog = fixture === "model-catalog-large"
  ? Array.from({ length: 5 }, (_, providerIndex) => ({
      ...modelProvider,
      id: providerIndex === 0 ? modelProvider.id : `synthetic-provider-${providerIndex + 1}`,
      name: providerIndex === 0 ? modelProvider.name : `Synthetic provider ${providerIndex + 1}`,
      configured: providerIndex < 2,
      authError: providerIndex < 2 ? undefined : "Synthetic sign-in required",
      models: Array.from({ length: 12 }, (_, modelIndex) => ({
        id: providerIndex === 0 && modelIndex === 0 ? "gpt-5.6-sol" : `synthetic-model-${providerIndex + 1}-${modelIndex + 1}`,
        name: providerIndex === 0 && modelIndex === 0 ? "GPT-5.6 Sol" : `Synthetic model ${providerIndex + 1}.${modelIndex + 1}`,
        input: ["text"],
        reasoning: ["low" as const, "medium" as const, "high" as const],
      })),
    }))
  : [modelProvider];
let modelSelection: { provider: string; model: string; reasoning: "low" | "medium" | "high" } = {
  provider: modelProvider.id,
  model: "gpt-5.6-sol",
  reasoning: "high",
};
const confirmation = {
  id: "approval-synthetic",
  toolName: "synthetic_review",
  argumentsHash: "sanitized-hash",
  state: "pending" as const,
  owner: { kind: "foreground" as const, sessionId: "synthetic-session", nativeRunId: "synthetic-run", toolCallId: "synthetic-call" },
  presentation: { action: "Approve this exact synthetic action", target: "The selected sanitized review record", consequence: "Kora will update only this synthetic fixture record.", risk: "private" as const },
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: earlier,
  updatedAt: now,
};
let approvalState: NativeToolConfirmation["state"] = fixture === "approval-expired" ? "expired" : fixture === "approval-decided" ? "approved" : "pending";
const approvalConfirmation = (): NativeToolConfirmation => ({
  ...confirmation,
  state: approvalState,
  owner: approvalState === "pending" ? confirmation.owner : null,
  ...(approvalState === "pending" ? {} : { resolvedAt: now }),
});
const quietHoursForFixture = (): { quietStart: string | null; quietEnd: string | null; version: number; updatedAt: string } => fixture === "quiet-unset"
  ? { quietStart: null, quietEnd: null, version: 2, updatedAt: now }
  : fixture === "quiet-same-day"
    ? { quietStart: "09:30", quietEnd: "17:45", version: 2, updatedAt: now }
    : fixture === "quiet-invalid"
      ? { quietStart: "22:00", quietEnd: "22:00", version: 2, updatedAt: now }
      : { quietStart: "22:00", quietEnd: "07:00", version: 2, updatedAt: now };
let currentQuietHours = quietHoursForFixture();
let notificationConflictInjected = false;
const overviewItems = () => {
  const quietSummary = currentQuietHours.quietStart && currentQuietHours.quietEnd
    ? `Quiet hours ${currentQuietHours.quietStart}–${currentQuietHours.quietEnd}`
    : "Quiet hours not set";
  const scheduleSummary = fixture === "empty"
    ? "No schedules"
    : fixture === "overview-isolated-attention"
      ? "One stopped run needs review"
      : `1 ${currentSchedule.state}`;
  const selectedModel = modelCatalog
    .flatMap(provider => provider.models.map(model => ({ provider: provider.id, model })))
    .find(candidate => candidate.provider === modelSelection.provider && candidate.model.id === modelSelection.model)?.model.name ?? modelSelection.model;
  return [
    { section: "schedules", state: fixture === "attention" || fixture === "overview-isolated-attention" ? "attention" : "normal", summary: scheduleSummary, route: "/settings/schedules" },
    { section: "integrations", state: fixture === "attention" ? "attention" : "normal", summary: fixture === "empty" ? "No services configured" : "1 connected", route: "/settings/integrations" },
    { section: "notifications", state: "normal", summary: quietSummary, route: "/settings/notifications" },
    { section: "background", state: "normal", summary: "Desktop host available", route: "/settings/background" },
    { section: "model", state: fixture === "attention" ? "attention" : "normal", summary: fixture === "attention" ? "Sign-in needed" : `${selectedModel} · ${modelSelection.reasoning.charAt(0).toUpperCase()}${modelSelection.reasoning.slice(1)}`, route: "/settings/model" },
    { section: "migration", state: "normal", summary: "No migration review needed", route: "/settings/data" },
  ].filter(item => fixture !== "overview-partial" || ["model", "schedules", "migration"].includes(item.section));
};
let integrationAuthReads = 0;
let integrationAuthCancelled = false;
let modelAuthReads = 0;
let modelAuthCancelled = false;
let migrationDismissed = false;
const authEvent = (cancelled: boolean, readIndex: number, authProviderId: string) => {
  if (cancelled) return { type: "cancelled" as const };
  if (readIndex > 0) return never();
  if (fixture === "auth-url") return { type: "auth_url" as const, url: "about:blank#kora-synthetic-auth", instructions: "Continue on the synthetic provider sign-in page." };
  if (fixture === "auth-device-code") return { type: "device_code" as const, userCode: "KORA-SYNTHETIC", verificationUri: "about:blank#kora-synthetic-device", expiresInSeconds: 900 };
  if (fixture === "auth-prompt" || fixture === "auth-cancelled" || fixture === "auth-response-pending" || fixture === "auth-cancel-uncertain") return { type: "prompt" as const, promptId: "synthetic-prompt", prompt: { type: "text" as const, message: "Provider organization", placeholder: "example.test" } };
  if (fixture === "auth-secret") return { type: "prompt" as const, promptId: "synthetic-secret", prompt: { type: "secret" as const, message: "Provider secret", placeholder: "Enter privately" } };
  if (fixture === "auth-failed") return { type: "failed" as const, message: "The synthetic provider rejected this sign-in. No connection is being claimed." };
  if (fixture === "auth-expired") return { type: "expired" as const, message: "This synthetic sign-in session expired. Restart sign-in to request a new code or token." };
  return { type: "complete" as const, provider: authProviderId, method: "oauth" as const };
};
const integrationAuthEvent = () => authEvent(integrationAuthCancelled, integrationAuthReads++, currentProvider.id);
const modelAuthEvent = () => authEvent(modelAuthCancelled, modelAuthReads++, modelProvider.id);

const runtimeFixture: Record<string, unknown> = {
  settingsOverview: async () => ({ revision: 1, items: overviewItems() }),
  schedules: async ({ pageSize = 25, cursor, state, query }: { pageSize?: number; cursor?: string; state?: string; query?: string }) => {
    if (fixture === "empty" || fixture === "filtered-empty") return { schedules: [], complete: true };
    const normalizedQuery = query?.trim().toLowerCase();
    const filteredSchedules = scheduleCatalog.filter(item =>
      (!state || state === "all" || item.state === state)
      && (!normalizedQuery || [item.name, item.displayLabel, item.prompt].some(value => value?.toLowerCase().includes(normalizedQuery))),
    );
    if (fixture === "partial") return filteredSchedules.length ? { schedules: [schedule], complete: false } : { schedules: [], complete: true };
    const start = cursor ? Number(cursor) : 0;
    const schedules = filteredSchedules.slice(start, start + pageSize).map(item => item.id === currentSchedule.id ? currentSchedule : item);
    const next = start + schedules.length;
    return { schedules, ...(next < filteredSchedules.length ? { cursor: String(next), complete: false } : { complete: true }) };
  },
  schedule: async () => {
    if (fixture === "missing") throw new RuntimeRequestError("Schedule not found.", { code: "schedule_not_found", status: 404 });
    return { schedule: currentSchedule };
  },
  scheduleRuns: async (scheduleId: string, pageSize = 20, cursor?: string) => {
    if (fixture === "empty" || fixture === "runs-empty") return { runs: [], complete: true };
    if (scheduleId !== run.scheduleId) return { runs: [], complete: true };
    if (fixture === "runs-partial") return { runs: [run], complete: false };
    const start = cursor ? Number(cursor) : 0;
    const runs = runCatalog.slice(start, start + pageSize);
    const next = start + runs.length;
    return next < runCatalog.length ? { runs, cursor: String(next), complete: false } : { runs, complete: true };
  },
  scheduleRun: async () => {
    if (fixture === "run-missing") throw new RuntimeRequestError("Run not found.", { code: "schedule_run_not_found", status: 404 });
    return { run };
  },
  previewSchedule: async (trigger: NativeScheduleTrigger) => ({
    occurrences: [trigger.kind === "recurring"
      ? new Date(`${trigger.startDate}T${trigger.localTime}:00-04:00`).toISOString()
      : trigger.kind === "once" ? trigger.at : schedule.nextDueAt],
  }),
  createSchedule: async (input: {
    prompt: string;
    name?: string;
    trigger: NativeScheduleTrigger;
    timezone?: string;
    attentionTier: NativeSchedule["attentionTier"];
    isTouchpoint?: boolean;
  }) => {
    if (fixture === "schedule-create-pending") return never();
    if (fixture === "schedule-error") throw new Error("The schedule runtime is temporarily unavailable. Your draft remains in this form.");
    if (fixture === "conflict") throw new RuntimeRequestError("This schedule changed before the synthetic save settled. Review the latest version; your draft remains here.", { code: "schedule_conflict", status: 409 });
    const created: NativeSchedule = {
      ...currentSchedule,
      id: "schedule-created",
      name: input.name?.trim() || "Untitled schedule",
      displayLabel: input.name?.trim() || "Untitled schedule",
      prompt: input.prompt,
      trigger: input.trigger,
      timezone: input.timezone ?? (input.trigger.kind === "recurring" ? input.trigger.timezone ?? currentSchedule.timezone : currentSchedule.timezone),
      nextDueAt: input.trigger.kind === "once" ? input.trigger.at : currentSchedule.nextDueAt,
      state: "enabled",
      attentionTier: input.attentionTier,
      isTouchpoint: input.isTouchpoint ?? false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      lastRunState: null,
      lastRunId: null,
    };
    currentSchedule = created;
    scheduleCatalog = [...scheduleCatalog.filter(item => item.id !== created.id), created];
    return { schedule: created };
  },
  updateSchedule: async (id: string, expectedVersion: number, input: {
    name?: string | null;
    prompt?: string;
    trigger?: NativeScheduleTrigger;
    timezone?: string | null;
    attentionTier?: NativeSchedule["attentionTier"];
    isTouchpoint?: boolean;
  }) => {
    if (fixture === "conflict" && !scheduleConflictInjected) {
      scheduleConflictInjected = true;
      currentSchedule = { ...currentSchedule, version: currentSchedule.version + 1, updatedAt: nextScheduleRevision() };
      throw new RuntimeRequestError("This schedule changed before the synthetic save settled. Review the latest version; your draft remains here.", { code: "schedule_conflict", status: 409 });
    }
    if (id !== currentSchedule.id || expectedVersion !== currentSchedule.version) throw new RuntimeRequestError("This schedule changed before the synthetic save settled. Review the latest version; your draft remains here.", { code: "schedule_conflict", status: 409 });
    currentSchedule = {
      ...currentSchedule,
      ...input,
      name: input.name === undefined ? currentSchedule.name : input.name,
      displayLabel: input.name === undefined ? currentSchedule.displayLabel : input.name?.trim() || "Untitled schedule",
      trigger: input.trigger ?? currentSchedule.trigger,
      version: currentSchedule.version + 1,
      updatedAt: now,
    };
    scheduleCatalog = scheduleCatalog.map(item => item.id === currentSchedule.id ? currentSchedule : item);
    return { schedule: currentSchedule };
  },
  runSchedule: async () => {
    if (fixture === "action-error") throw new RuntimeRequestError("The schedule runtime could not start this run. The schedule is unchanged.", { code: "schedule_action_failed", status: 503 });
    return { run };
  },
  pauseSchedule: async (id: string, expectedVersion: number) => {
    if (id !== currentSchedule.id || expectedVersion !== currentSchedule.version) throw new RuntimeRequestError("This schedule changed before it could be paused. Reload before trying again.", { code: "schedule_conflict", status: 409 });
    currentSchedule = { ...currentSchedule, state: "paused", version: currentSchedule.version + 1, updatedAt: now };
    return { schedule: currentSchedule };
  },
  resumeSchedule: async (id: string, expectedVersion: number) => {
    if (id !== currentSchedule.id || expectedVersion !== currentSchedule.version) throw new RuntimeRequestError("This schedule changed before it could be resumed. Reload before trying again.", { code: "schedule_conflict", status: 409 });
    currentSchedule = { ...currentSchedule, state: "enabled", version: currentSchedule.version + 1, updatedAt: now };
    return { schedule: currentSchedule };
  },
  cancelSchedule: async (id: string, expectedVersion: number) => {
    if (id !== currentSchedule.id || expectedVersion !== currentSchedule.version) throw new RuntimeRequestError("This schedule changed before it could be cancelled. Reload before trying again.", { code: "schedule_conflict", status: 409 });
    currentSchedule = { ...currentSchedule, state: "cancelled", version: currentSchedule.version + 1, updatedAt: now };
    return { schedule: currentSchedule };
  },
  notificationSettings: async () => currentQuietHours,
  updateNotificationSettings: async (input: { start: string | null; end: string | null; expectedVersion: number }) => {
    if (fixture === "conflict" && !notificationConflictInjected) {
      notificationConflictInjected = true;
      currentQuietHours = { ...currentQuietHours, quietStart: "21:00", quietEnd: "06:00", version: currentQuietHours.version + 1, updatedAt: now };
      throw new RuntimeRequestError("Quiet hours changed before the synthetic save settled. Review the latest values; your draft remains here.", { code: "notification_settings_conflict", status: 409 });
    }
    if (input.expectedVersion !== currentQuietHours.version) throw new RuntimeRequestError("Quiet hours changed before the synthetic save settled. Review the latest values; your draft remains here.", { code: "notification_settings_conflict", status: 409 });
    currentQuietHours = { quietStart: input.start, quietEnd: input.end, version: currentQuietHours.version + 1, updatedAt: now };
    return currentQuietHours;
  },
  providers: async () => ({ providers: fixture === "empty" ? [] : [currentProvider] }),
  checkProvider: async (id: string, expectedUpdatedAt: string) => {
    if (id !== currentProvider.id || expectedUpdatedAt !== currentProvider.updatedAt || fixture === "provider-check-stale") return { status: "stale" as const };
    if (fixture === "provider-check-pending") return never();
    if (fixture === "provider-check-error") throw new RuntimeRequestError("The synthetic provider check failed; the last known authority state is retained.", { code: "connection_check_failed", status: 503 });
    const updatedAt = nextProviderRevision();
    currentProvider = { ...currentProvider, connectionObservedAt: updatedAt, lastCheckedAt: updatedAt, updatedAt };
    return { status: "settled" as const, provider: currentProvider };
  },
  disconnectGoogleWorkspace: async () => {
    if (currentProvider.id === "google-workspace") {
      const updatedAt = nextProviderRevision();
      currentProvider = { ...currentProvider, configured: false, connected: false, accessState: "not_configured", connectionState: "not_configured", health: "unavailable", connectionObservedAt: updatedAt, lastCheckedAt: updatedAt, lastSuccessfulCheckAt: undefined, scopes: [], operations: [], availableOperations: [], authorityObservation: { state: "not_checked" }, problem: { code: "not_configured", message: "Google Workspace is not connected in this synthetic fixture." }, updatedAt };
    }
    return { disconnected: true as const };
  },
  githubAccounts: async () => ({ accounts: githubAccountTargets.map(account => ({ ...account })) }),
  disconnectGithub: async (hostname: string, user: string) => {
    const target = githubAccountTargets.find(account => account.hostname === hostname && account.user === user);
    if (!target) throw new RuntimeRequestError("Choose an exact saved GitHub account target before disconnecting.", { code: "github_target_not_found", status: 404 });
    githubAccountTargets = githubAccountTargets.filter(account => account !== target);
    if (currentProvider.id === "github") {
      const updatedAt = nextProviderRevision();
      const hasActiveAccount = githubAccountTargets.some(account => account.active);
      currentProvider = hasActiveAccount
        ? { ...currentProvider, connected: true, accessState: "available", connectionState: "connected", health: "available", connectionObservedAt: updatedAt, lastCheckedAt: updatedAt, availableOperations: providerSupportedOperations, operations: providerSupportedOperations, problem: undefined, updatedAt }
        : { ...currentProvider, connected: false, accessState: "unknown", connectionState: "needs_attention", health: "degraded", connectionObservedAt: updatedAt, lastCheckedAt: updatedAt, availableOperations: [], operations: [], problem: { code: "not_connected", message: "The selected GitHub CLI account was removed locally. GitHub permissions were not revoked." }, updatedAt };
    }
    return { disconnected: true as const, hostname, user };
  },
  browserStatus: async () => ({
    state: fixture === "browser-ready" ? "ready"
      : fixture === "browser-connecting" ? "connecting"
        : fixture === "browser-waiting-owner" ? "waiting_owner"
          : fixture === "browser-degraded" || fixture === "attention" ? "degraded"
            : "disconnected",
    profileLabel: "Personal Chrome profile",
    extensionVersion: fixture === "browser-ready" ? "1.0.0-synthetic" : undefined,
    lastConnectedAt: fixture === "browser-ready" || fixture === "browser-degraded" ? earlier : undefined,
    reason: fixture === "browser-bridge-unavailable"
      ? "The browser extension is installed, but the desktop bridge has not been registered."
      : fixture === "browser-waiting-owner" ? "Chrome is waiting for you to finish the current page step."
        : fixture === "browser-degraded" ? "The extension heartbeat is stale; browser actions are paused."
          : undefined,
  }),
  browserCredentials: async () => {
    if (fixture === "credential-loading") return never();
    if (fixture === "credential-read-error") throw new Error("Synthetic protected sign-ins are unavailable. No credential data was exposed.");
    if (fixture === "credential-populated") return {
      credentials: [{
        id: "synthetic-credential",
        label: "Travel account",
        normalizedOrigin: "https://travel.example.test",
        usernameLabel: "synthetic-user@example.test",
        createdAt: earlier,
        updatedAt: now,
        oneTime: false,
      }],
      protectedStorageAvailable: true,
    };
    return { credentials: [], protectedStorageAvailable: true };
  },
  startIntegrationAuth: async () => ({ id: "synthetic-integration-auth" }),
  nextIntegrationAuth: async () => integrationAuthEvent(),
  respondIntegrationAuth: async () => {
    if (fixture === "auth-response-pending") return never();
    return { accepted: true };
  },
  cancelIntegrationAuth: async () => {
    if (fixture === "auth-cancel-uncertain") return never();
    integrationAuthCancelled = true;
    return { cancelled: true };
  },
  bootstrap: async () => {
    if (fixture === "diagnostics-offline" || fixture === "diagnostics-partial") throw new RuntimeRequestError("The synthetic authenticated runtime is offline.", { code: "runtime_disconnected", status: 503 });
    return {
      epoch: fixture === "diagnostics-long-values" ? "synthetic-epoch-with-an-intentionally-long-but-copy-safe-runtime-identity-0123456789abcdef" : "synthetic-epoch",
      revision: 42,
      viewerTimeZone: fixture === "diagnostics-long-values" ? "America/Argentina/ComodRivadavia" : "America/New_York",
      model: fixture === "diagnostics-long-values"
        ? { provider: "synthetic-provider-with-a-very-long-qualified-name", model: "synthetic-model-with-a-long-version-and-capability-suffix-2026-08-29", reasoning: "high" }
        : modelSelection,
    };
  },
  models: async () => ({ providers: modelCatalog }),
  selectModel: async (selection: { provider: string; model: string; reasoning: "low" | "medium" | "high" }) => {
    if (fixture === "model-conflict") throw new RuntimeRequestError("The active model changed before this selection settled. Review the current catalog and try again; your draft remains here.", { code: "model_selection_conflict", status: 409 });
    if (fixture === "model-error") throw new Error("The active runtime rejected this synthetic model change. Your selection remains available to retry.");
    modelSelection = { ...selection };
    return modelSelection;
  },
  createBrowserCredential: async () => {
    if (fixture === "credential-error") throw new Error("Windows protected storage is temporarily unavailable. No sign-in was saved.");
    return { credential: { id: "synthetic-credential" } };
  },
  createOneTimeBrowserCredential: async () => {
    if (fixture === "credential-error") throw new Error("The one-time handoff could not be prepared. No sign-in was saved.");
    return { credential: { id: "synthetic-one-time-credential" } };
  },
  startModelAuth: async () => ({ id: "synthetic-model-auth" }),
  nextModelAuth: async () => modelAuthEvent(),
  respondModelAuth: async () => {
    if (fixture === "auth-response-pending") return never();
    return { accepted: true };
  },
  cancelModelAuth: async () => {
    if (fixture === "auth-cancel-uncertain") return never();
    modelAuthCancelled = true;
    return { cancelled: true };
  },
  backgroundStatus: async () => fixture === "native-absent"
    ? ({ configured: false, healthy: false, taskName: undefined })
    : ({ configured: true, healthy: fixture !== "attention", taskName: "Kora" }),
  migrationSummary: async () => {
    if (fixture === "migration-error") throw new RuntimeRequestError("The finite migration summary could not be read.", { code: "migration_unavailable", status: 503 });
    if (fixture === "migration-restricted") throw new RuntimeRequestError("Migration review is restricted on this profile.", { code: "migration_restricted", status: 403 });
    const none = fixture === "empty" || fixture === "migration-none";
    const waiting = (fixture === "attention" || fixture === "migration-some" || fixture === "migration-dismissed") && !migrationDismissed;
    return {
      sources: none ? [] : [{ sourceKind: "legacy_sessions", recordCount: 4, disposition: "archived" as const, createdAt: earlier }],
      pending: waiting ? [{ sourceCollection: "legacy_sessions", count: 1 }] : [],
    };
  },
  migrationPending: async () => {
    if (fixture === "migration-error") throw new RuntimeRequestError("Pending migration review could not be read.", { code: "migration_unavailable", status: 503 });
    if (fixture === "migration-restricted") throw new RuntimeRequestError("Migration review is restricted on this profile.", { code: "migration_restricted", status: 403 });
    const waiting = (fixture === "attention" || fixture === "migration-some" || fixture === "migration-dismissed") && !migrationDismissed;
    return { items: waiting ? [{ id: "candidate-1", sourceCollection: "legacy_sessions", sourceId: "legacy-session-1", summary: { kind: "record" as const, title: "Earlier conversation archive", detail: "Review before dismissing" }, createdAt: earlier }] : [] };
  },
  dismissMigrationPending: async () => { migrationDismissed = true; return { status: "settled" as const }; },
  capabilities: async () => {
    if (fixture === "diagnostics-offline") throw new RuntimeRequestError("Capability inventory is unavailable while the runtime is offline.", { code: "runtime_disconnected", status: 503 });
    return { groups: [], providers: [], resources: { skills: 18, prompts: 7, diagnostics: 4 }, limits: { maxToolsPerGroup: 25, maxActiveGroups: 8, maxActiveTools: 100, maxSchemaCharactersPerGroup: 100000, maxActiveSchemaCharacters: 500000 } };
  },
  toolConfirmations: async () => {
    if (fixture === "approval-runtime-unavailable") throw new RuntimeRequestError("The approval authority is unavailable. No decision was recorded.", { code: "runtime_unavailable", status: 503 });
    if (fixture === "empty" || fixture === "approval-missing") return { confirmations: [] };
    if (fixture === "approval-multiple") return { confirmations: [
      approvalConfirmation(),
      { ...approvalConfirmation(), id: "confirmation-secondary", presentation: { ...approvalConfirmation().presentation, action: "Approve the second exact synthetic action", target: "A separate sanitized fixture record" } },
    ] };
    return { confirmations: [approvalConfirmation()] };
  },
  approveToolConfirmation: async () => {
    if (fixture === "approval-pending") return never();
    if (fixture === "approval-error" || fixture === "approval-decision-error") throw new RuntimeRequestError("The approval authority did not record this decision. The request is still pending.", { code: "approval_decision_failed", status: 503 });
    if (fixture === "approval-conflict") throw new RuntimeRequestError("This request was resolved from another Kora surface. Refresh before deciding again.", { code: "approval_conflict", status: 409 });
    approvalState = "approved";
    return { confirmation: approvalConfirmation() };
  },
  rejectToolConfirmation: async () => {
    approvalState = "rejected";
    return { confirmation: approvalConfirmation() };
  },
};
if (fixture === "loading") {
  for (const key of Object.keys(runtimeFixture)) if (!["approveToolConfirmation", "rejectToolConfirmation"].includes(key)) runtimeFixture[key] = never;
} else if (fixture === "unavailable") {
  for (const key of Object.keys(runtimeFixture)) if (!["approveToolConfirmation", "rejectToolConfirmation"].includes(key)) runtimeFixture[key] = unavailable;
}
Object.assign(runtime as unknown as Record<string, unknown>, runtimeFixture);

const routeFor: Record<Surface, string> = {
  overview: "/settings",
  schedules: "/settings/schedules",
  "schedule-new": "/settings/schedules/new",
  "schedule-detail": `/settings/schedules/${schedule.id}`,
  "schedule-run": `/settings/schedules/${schedule.id}/runs/${run.id}`,
  notifications: "/settings/notifications",
  integrations: "/settings/integrations",
  "integration-detail": fixture.startsWith("credential-") || fixture.startsWith("browser-") ? "/settings/integrations/chrome-browser" : fixture === "unknown-provider" ? "/settings/integrations/unknown-provider" : `/settings/integrations/${provider.id}`,
  model: "/settings/model",
  "model-provider": `/settings/model/providers/${modelProvider.id}`,
  background: "/settings/background",
  appearance: "/settings/appearance",
  data: "/settings/data",
  diagnostics: "/settings/diagnostics",
  approval: `${pathForOperationalRoute("approval-detail", { approvalId: confirmation.id })}?returnTo=%2Fsettings`,
};
function choose(key: "surface" | "fixture", value: string) {
  const next = new URLSearchParams(window.location.search);
  next.set(key, value);
  window.location.search = next.toString();
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
const specimenConnection: ConnectionValue = {
  phase: "ready",
  retry: async () => undefined,
  restart: async () => ({ status: "settled", runtimeId: "settings-specimen-runtime", startedAt: "2026-08-19T12:00:00Z" }),
  refresh: async () => undefined,
};

const pause = (duration = 40) => new Promise(resolve => window.setTimeout(resolve, duration));
function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const owner = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(owner, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function FixtureAutomation() {
  useEffect(() => {
    const control = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)
      ?? [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].find(element => element.labels?.[0]?.textContent?.includes(label));
    const run = async () => {
      if (["schedule-dirty", "schedule-error", "schedule-create-pending", "schedule-create-success", "conflict"].includes(fixture)) {
        const name = control("Name");
        const prompt = control("What Kora should do");
        if (name) setControlValue(name, "Weekly review across every open commitment");
        if (prompt) setControlValue(prompt, "Review every open commitment and prepare a detailed planning note that keeps exact project names, uncertainty, and next actions intact without changing any record.");
        await pause();
        if (["schedule-error", "schedule-create-pending", "schedule-create-success", "conflict"].includes(fixture)) {
          document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
          await pause(120);
          document.querySelector<HTMLElement>(fixture === "schedule-create-success" ? ".settings-facts" : '.k-content-state[data-state="error"]')?.scrollIntoView({ block: "center" });
        }
      }
      if (fixture === "filtered-empty") {
        const search = control("Search schedules");
        if (search) setControlValue(search, "quarterly source review");
      }
      if (fixture === "action-error") {
        await pause();
        document.querySelector<HTMLButtonElement>('button[aria-label^="Run "]')?.click();
        await pause(120);
      }
      if (fixture === "model-dirty" || fixture === "model-error" || fixture === "model-conflict") {
        document.querySelector<HTMLButtonElement>('[aria-label="Reasoning level"]')?.click();
        await pause();
        [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.trim() === "Low")?.click();
        await pause();
        if (fixture === "model-error" || fixture === "model-conflict") [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Save selection"))?.click();
      }
      if (fixture === "credential-dirty" || fixture === "credential-error") {
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Add sign-in"))?.click();
        await pause();
        const label = control("Label");
        const origin = control("Website");
        const username = control("Username hint");
        const secret = control("Password or secret");
        if (label) setControlValue(label, "Primary travel account with an intentionally long recognizable label");
        if (origin) setControlValue(origin, "https://travel.example.test");
        if (username) setControlValue(username, "synthetic-user@example.test");
        if (secret) setControlValue(secret, "synthetic-only-not-a-credential");
        await pause();
        if (fixture === "credential-error") [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Protect sign-in"))?.click();
        await pause(120);
        document.querySelector<HTMLElement>(".browser-credentials")?.scrollIntoView({ block: "start" });
      }
      if (["auth-url", "auth-device-code", "auth-prompt", "auth-secret", "auth-failed", "auth-cancelled", "auth-expired", "auth-response-pending", "auth-cancel-uncertain"].includes(fixture)) {
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => /^(Connect|Reconnect) account$/.test(button.textContent?.trim() ?? "") || /OAuth$/.test(button.textContent?.trim() ?? ""))?.click();
        await pause(180);
        if (fixture === "auth-cancelled") {
          [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Cancel")?.click();
          await pause(120);
        }
        if (fixture === "auth-response-pending") {
          const organization = control("Provider organization");
          if (organization) setControlValue(organization, "example.test");
          await pause();
          [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Continue")?.click();
          await pause(120);
        }
        if (fixture === "auth-cancel-uncertain") {
          [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Cancel")?.click();
          await pause(120);
        }
        document.querySelector<HTMLElement>(".settings-oauth")?.scrollIntoView({ block: "center" });
      }
      if (fixture === "shortcuts-empty") {
        const shortcuts = control("Search shortcuts");
        if (shortcuts) setControlValue(shortcuts, "command that is not registered");
      }
      if (fixture === "appearance-reset") {
        await pause();
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Reset appearance")?.click();
        await pause(80);
      }
      if (fixture === "migration-dismissed") {
        await pause();
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Dismiss")?.click();
        await pause(160);
      }
      if (["approval-pending", "approval-success", "approval-error", "approval-conflict", "approval-decision-error"].includes(fixture)) {
        await pause();
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Approve")?.click();
        await pause(160);
      }
    };
    const timer = window.setTimeout(() => void run(), 120);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

const specimenRouter = createMemoryRouter([{
  path: "/",
  element: <DirtyDraftGuardProvider><TooltipProvider><ToastProvider timeout={0}><ViewBarProvider>
    <div className="pane">
      <header><ViewBar /></header>
      <FixtureAutomation />
      <main className="pane__content" id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  </ViewBarProvider></ToastProvider></TooltipProvider></DirtyDraftGuardProvider>,
  children: [
    { path: "settings/*", element: <SettingsLayout><SettingsWorkspace onAskKora={() => undefined} /></SettingsLayout> },
    { path: "approvals/:approvalId", element: <ApprovalDetailPage /> },
  ],
}], { initialEntries: [routeFor[surface]] });

export function SettingsRoutesSpecimen() {
  return <div className="settings-routes-specimen">
    <nav className="settings-routes-specimen__controls" aria-label="Settings qualification controls">
      <div><strong>Settings route qualification</strong><span>Synthetic sanitized preferences · native controls are unavailable · no provider, account, or product writes</span></div>
      <div className="settings-routes-specimen__pickers">
        <KoraSelect label="Settings surface" value={surface} options={settingsRouteSurfaces.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={(value) => choose("surface", value)} />
        <KoraSelect label="Settings fixture" value={fixture} options={settingsRouteFixtureMatrix[surface].map((value) => ({ value, label: value }))} onValueChange={(value) => choose("fixture", value)} />
      </div>
    </nav>
    <div className="settings-routes-specimen__app">
      <QueryClientProvider client={queryClient}><ConnectionContext.Provider value={specimenConnection}><RouterProvider router={specimenRouter} /></ConnectionContext.Provider></QueryClientProvider>
    </div>
  </div>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><SettingsRoutesSpecimen /></StrictMode>);
