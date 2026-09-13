import { useMemo } from "react";
import { Check, Clipboard, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Button, ContentState } from "../../components/primitives";
import { copyText } from "../../lib/clipboard";
import { desktopHost, hasDesktopHost } from "../../lib/desktop-host";
import { runtime, type NativeCapabilityDiagnostics, type ShellBootstrap } from "../../lib/runtime";
import { ErrorState, LoadingState, Section } from "./shared";
import { SettingsFrame } from "./SettingsFrame";
import { useMutation, useQuery } from "@tanstack/react-query";

type RuntimeObservation = "checking" | "reachable" | "unavailable";
type CopyPhase = "starting" | "ready" | "unavailable";

function runtimeObservation(bootstrap: { isLoading: boolean; isError: boolean }): RuntimeObservation {
  if (bootstrap.isLoading) return "checking";
  if (bootstrap.isError) return "unavailable";
  return "reachable";
}

function copyPhase(observation: RuntimeObservation): CopyPhase {
  return observation === "checking" ? "starting" : observation === "reachable" ? "ready" : "unavailable";
}

function safeRuntimeDetails(bootstrap: { data?: ShellBootstrap; isError: boolean }, observation: RuntimeObservation, hasCachedData: boolean) {
  const model = bootstrap.data?.model;
  const details: Record<string, unknown> = {
    phase: copyPhase(observation),
    runtimeBuild: "kora-native",
    revision: bootstrap.data?.revision,
    modelCredentialState: hasCachedData
      ? "unknown"
      : model
        ? model.authenticationRequired ? "required" : model.configured ? "configured" : "unknown"
        : "unknown",
    ...(bootstrap.isError ? { currentError: { code: "runtime_unavailable", message: "Kora local service details are unavailable." } } : {}),
  };
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function CapabilityInventory({ data, partial, onRetry }: {
  data?: NativeCapabilityDiagnostics;
  partial: boolean;
  onRetry: () => void;
}) {
  if (!data) return null;
  return <>
    {partial && <ContentState
      state="partial"
      announcement="assertive"
      title="Some capability details could not be refreshed."
      body="The last readable capability counts remain visible."
      action={<Button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Try again</Button>}
    />}
    <div className="settings-facts" aria-label="Capability counts">
      <div><span>Skills</span><strong>{data.resources.skills}</strong></div>
      <div><span>Prompts</span><strong>{data.resources.prompts}</strong></div>
      <div><span>Diagnostics</span><strong>{data.resources.diagnostics}</strong></div>
    </div>
    {data.groups.length > 0 && <details>
      <summary>Capability groups</summary>
      <div className="settings-ledger">
        {data.groups.map(group => <div className="settings-row" key={group.name}>
          <div><FileText size={16} aria-hidden="true" /><span><strong>{group.name}</strong><small>{group.toolCount} tools · {group.health}</small></span></div>
        </div>)}
      </div>
    </details>}
  </>;
}

export function DiagnosticsSettingsPage() {
  const bootstrap = useQuery({ queryKey: ["settings", "bootstrap"], queryFn: () => runtime.bootstrap() });
  const capabilities = useQuery({
    queryKey: ["settings", "capabilities"],
    queryFn: () => runtime.capabilities(),
    placeholderData: previous => previous,
  });
  const observation = runtimeObservation(bootstrap);
  const hasCachedBootstrap = bootstrap.isError && Boolean(bootstrap.data);
  const technicalLabel = (label: string) => hasCachedBootstrap ? `Last known ${label.toLowerCase()}` : label;
  const safeDetails = useMemo(() => safeRuntimeDetails(bootstrap, observation, hasCachedBootstrap), [bootstrap.data, bootstrap.isError, observation, hasCachedBootstrap]);
  const copy = useMutation({
    mutationFn: async () => {
      if (!hasDesktopHost) {
        await copyText(JSON.stringify(safeDetails, null, 2));
        return;
      }
      const host = await desktopHost.troubleshootingDetails();
      // Keep the renderer's observed service phase separate from the native
      // host phase. The desktop helper filters the merged object to its safe
      // troubleshooting allowlist before writing anything to the clipboard.
      await desktopHost.copyTroubleshootingDetails({ ...safeDetails, ...host, phase: safeDetails.phase, hostPhase: host.hostPhase });
    },
  });
  const openLogs = useMutation({ mutationFn: () => desktopHost.openLocation("logs") });
  const openAttribution = useMutation({ mutationFn: () => desktopHost.openDocument("pi_attribution") });
  const openLicenses = useMutation({ mutationFn: () => desktopHost.openDocument("third_party_licenses") });
  const serviceState = observation === "checking" ? "loading" : observation === "unavailable" ? "unavailable" : "success";
  const serviceTitle = observation === "checking" ? "Checking Kora service" : observation === "unavailable" ? "Kora service unavailable" : "Kora service reachable";
  const serviceBody = observation === "checking"
    ? "Reading the local service identity."
    : observation === "unavailable"
      ? "Kora could not answer right now. Check the service and capability status below."
      : "Kora answered this check. Provider or model access may still need attention.";

  return <SettingsFrame
    title="Diagnostics & about"
    description="Check Kora’s service and share support details without sharing your conversations."
    actions={<Button type="button" onClick={() => copy.mutate()} disabled={copy.isPending}>
      <Clipboard size={14} aria-hidden="true" />
      {copy.isPending ? "Copying…" : "Copy details"}
    </Button>}
  >
    <Section title="Service status" description="This check tells you whether Kora answered. Provider and model access can still need attention.">
      <ContentState
        state={serviceState}
        announcement={observation === "unavailable" ? "assertive" : "polite"}
        title={serviceTitle}
        body={serviceBody}
        action={observation === "unavailable" ? <Button type="button" onClick={() => void bootstrap.refetch()} disabled={bootstrap.isFetching}><RefreshCw size={14} aria-hidden="true" /> {bootstrap.isFetching ? "Checking…" : "Retry"}</Button> : undefined}
      />
      {copy.isSuccess && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> Support details copied.</p>}
      {copy.isError && <ErrorState title="Troubleshooting details could not be copied." error={copy.error} onRetry={() => copy.mutate()} />}
    </Section>

    <Section title="Capability inventory" description="These counts show what Kora currently exposes.">
      {capabilities.isLoading && !capabilities.data
        ? <LoadingState label="Loading capability inventory" />
        : capabilities.isError && !capabilities.data
          ? <ErrorState title="Capability inventory could not load." error={capabilities.error} onRetry={() => capabilities.refetch()} />
          : <CapabilityInventory data={capabilities.data} partial={capabilities.isError} onRetry={() => void capabilities.refetch()} />}
    </Section>

    <Section title="Technical details" description="Additional service details for support.">
      {bootstrap.isLoading && !bootstrap.data
        ? <LoadingState label="Loading service details" />
        : bootstrap.data
          ? <>
            {hasCachedBootstrap && <ContentState
              state="stale"
              title="Showing last known service details"
              body="Kora could not refresh these values. Check the service status above before relying on them."
            />}
            <div className="settings-facts">
            <div><span>{technicalLabel("Epoch")}</span><strong>{bootstrap.data.epoch}</strong></div>
            <div><span>{technicalLabel("Revision")}</span><strong>{bootstrap.data.revision}</strong></div>
            <div><span>{technicalLabel("Selected model")}</span><strong>{bootstrap.data.model.provider} / {bootstrap.data.model.model}</strong></div>
            <div><span>{technicalLabel("Reasoning")}</span><strong>{bootstrap.data.model.reasoning}</strong></div>
            <div><span>{technicalLabel("Model credentials")}</span><strong>{hasCachedBootstrap ? "Unknown while service is unavailable" : bootstrap.data.model.authenticationRequired ? "Authentication required" : bootstrap.data.model.configured ? "Configured" : "Unknown"}</strong></div>
            <div><span>{technicalLabel("Viewer time zone")}</span><strong>{bootstrap.data.viewerTimeZone}</strong></div>
            </div>
          </>
          : <ErrorState title="Service details are unavailable." error={bootstrap.error} onRetry={() => bootstrap.refetch()} />}
    </Section>

    <Section title="Support tools" description="Open local support locations from the desktop app when you need to inspect logs.">
      {!hasDesktopHost
        ? <p className="settings-prose">Open Kora on your desktop to inspect logs and support documents.</p>
        : <>
          <div className="settings-actions">
            <Button type="button" onClick={() => openLogs.mutate()} disabled={openLogs.isPending}>{openLogs.isPending ? "Opening logs…" : "Open logs"}</Button>
          </div>
          {openLogs.isSuccess && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> Logs opened.</p>}
          {openLogs.isError && <ErrorState title="Logs could not be opened." error={openLogs.error} onRetry={() => openLogs.mutate()} />}
        </>}
    </Section>

    <Section title="About Kora" description="Product identity and attribution for this build.">
      <p className="settings-prose">Kora keeps your data on this computer. Open the attribution and license documents when you need product or dependency details.</p>
      {hasDesktopHost
        ? <>
          <div className="settings-actions">
            <Button type="button" onClick={() => openAttribution.mutate()} disabled={openAttribution.isPending}>{openAttribution.isPending ? "Opening…" : "Pi attribution"}<ExternalLink size={14} aria-hidden="true" /></Button>
            <Button type="button" onClick={() => openLicenses.mutate()} disabled={openLicenses.isPending}>{openLicenses.isPending ? "Opening…" : "Third-party licenses"}<ExternalLink size={14} aria-hidden="true" /></Button>
          </div>
          {openAttribution.isSuccess && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> Pi attribution opened.</p>}
          {openAttribution.isError && <ErrorState title="Pi attribution could not be opened." error={openAttribution.error} onRetry={() => openAttribution.mutate()} />}
          {openLicenses.isSuccess && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> Third-party licenses opened.</p>}
          {openLicenses.isError && <ErrorState title="Third-party licenses could not be opened." error={openLicenses.error} onRetry={() => openLicenses.mutate()} />}
        </>
        : <p className="settings-prose">Open Kora on your desktop to read attribution and license documents.</p>}
    </Section>
  </SettingsFrame>;
}

export default DiagnosticsSettingsPage;
