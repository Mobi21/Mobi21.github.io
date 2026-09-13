import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Link2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, ContentState, KoraSelect, Modal } from "../../components/primitives";
import { runtime, type NativeProvider, type NativeProviderLifecycleAction } from "../../lib/runtime";
import { SettingsFrame } from "./SettingsFrame";
import { ErrorState, Section, StatusPill } from "./shared";

const PROVIDER_NAMES: Record<string, string> = {
  "google-workspace": "Google Workspace",
  github: "GitHub",
};

const OPERATION_LABELS: Record<string, string> = {
  "workspace.read": "Read workspace",
  "workspace.write": "Write workspace",
  "repository.read": "Read repositories",
  "repository.write": "Write repositories",
  "issue.write": "Write issues",
  "pull-request.write": "Write pull requests",
  "actions.read": "Read Actions",
  "actions.write": "Write Actions",
  "release.read": "Read releases",
  "release.write": "Write releases",
};

export type IntegrationAccountAuthProps = {
  provider: NativeProvider;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};

export type IntegrationAccountPageProps = {
  integrationId: string;
  renderAuth?: (props: IntegrationAccountAuthProps) => ReactNode;
};

type CheckOutcome =
  | { kind: "pending" }
  | { kind: "settled"; provider: NativeProvider }
  | { kind: "stale"; refreshed: boolean }
  | { kind: "error"; message: string };

type LifecycleOutcome =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type GithubAccount = { hostname: string; user: string; active: boolean };
type RefreshResult = "refreshed" | "failed" | "ignored";
type DisconnectRecovery = {
  providerId: string;
  generation: number;
  refreshPending: boolean;
  refreshFailed: boolean;
  requiresCheck: boolean;
};

const providerName = (id: string) => PROVIDER_NAMES[id] ?? id.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase());

const safeDate = (value: string | null | undefined, missing = "Not reported") => {
  if (!value) return missing;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
    : missing;
};

const compareUpdatedAt = (left: string | undefined, right: string | undefined) => {
  if (!left || !right) return left ? 1 : right ? -1 : 0;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  if (Number.isFinite(leftTime)) return 1;
  if (Number.isFinite(rightTime)) return -1;
  return 0;
};

function connectionView(provider: NativeProvider) {
  const state = provider.connectionState
    ?? (provider.connected === true
      ? "connected"
      : provider.configured && !provider.lastCheckedAt
        ? "unchecked"
        : provider.configured
          ? "needs_attention"
          : "not_configured");
  if (state === "connected") return {
    label: "Connected · current",
    description: "The provider currently reports this account as available to Kora.",
    tone: "ready" as const,
    connected: true,
  };
  if (state === "needs_attention") return {
    label: provider.problem?.code === "status_refresh_pending"
      ? "Connection needs refresh"
      : provider.problem?.code === "not_connected" ? "Not connected" : "Needs attention",
    description: provider.problem?.message ?? provider.unavailableReason ?? "The current account status needs review.",
    tone: provider.problem?.code === "not_connected" ? "quiet" as const : "attention" as const,
    connected: false,
  };
  if (state === "unchecked") return {
    label: "Not checked",
    description: "This provider is configured, but Kora has not confirmed its current connection.",
    tone: "quiet" as const,
    connected: false,
  };
  return {
    label: "Not configured",
    description: provider.problem?.message ?? provider.unavailableReason ?? "No account is configured for Kora.",
    tone: "quiet" as const,
    connected: false,
  };
}

function knownLifecycleAction(provider: NativeProvider): NativeProviderLifecycleAction | undefined {
  const actions = provider.lifecycleActions ?? [];
  if (provider.id === "google-workspace") {
    return actions.find(action => action.kind === "disconnect"
      && action.operation === "disconnect_google_workspace"
      && action.effect?.localCredential === "removed"
      && (action.effect?.remoteAuthority === "not-claimed" || action.effect?.remoteAuthority === "unchanged"));
  }
  if (provider.id === "github") {
    return actions.find(action => action.kind === "disconnect"
      && action.operation === "disconnect_github"
      && action.effect?.localCredential === "removed"
      && action.effect?.remoteAuthority === "unchanged");
  }
  return undefined;
}

function OperationList({ operations, emptyLabel }: { operations: string[]; emptyLabel: string }) {
  if (!operations.length) return <p className="settings-prose">{emptyLabel}</p>;
  return <div className="integration-account__operation-list">{operations.map(operation => <div className="integration-account__operation" key={operation}>
    <span>{OPERATION_LABELS[operation] ?? "Additional capability"}</span>
    <code>{operation}</code>
  </div>)}</div>;
}

function AuthorityDetails({ provider, needsRefresh = false }: { provider: NativeProvider; needsRefresh?: boolean }) {
  if (needsRefresh) {
    return <ContentState state="stale" title="Permissions need a fresh check" body="The local account changed. Check the connection to see current permissions." />;
  }
  const observation = provider.authorityObservation;
  if (!observation || observation.state === "not_checked") {
    return <ContentState state="stale" title="Permissions have not been checked" body="Kora has not checked this account’s current permissions yet." />;
  }
  if (observation.state === "not_supported") {
    return <ContentState state="restricted" title="Permissions aren’t reported" body="This account does not report a permissions list." />;
  }
  if (observation.state === "failed") {
    const scopes = observation.lastSuccessfulScopes ?? [];
    if (!scopes.length && !observation.lastSuccessfulAt) {
      return <ContentState state="error" title="Permissions check failed" body={provider.problem?.message ?? "Kora has no current or previously reported permissions to show."} />;
    }
    return <div className="integration-account__authority-history">
      <ContentState state="stale" title="Previously reported permissions" body="The latest permissions check failed. These permissions were reported previously and may no longer be current." />
      <div className="settings-chips">{scopes.length ? scopes.map(scope => <span key={scope}>{scope}</span>) : <p className="settings-prose">No permission identifiers were reported in the last successful check.</p>}</div>
      <p className="integration-account__timestamp">Last reported {safeDate(observation.lastSuccessfulAt, "Not reported")}</p>
    </div>;
  }
  const scopes = observation.state === "reported" ? observation.scopes ?? [] : [];
  return <div className="integration-account__authority-current">
    <div className="settings-chips">{scopes.length ? scopes.map(scope => <span key={scope}>{scope}</span>) : <p className="settings-prose">No permission identifiers are currently reported.</p>}</div>
    <p className="integration-account__timestamp">Reported {safeDate(observation.observedAt, "Not reported")}</p>
  </div>;
}

export function IntegrationAccountPage({ integrationId, renderAuth }: IntegrationAccountPageProps) {
  const queryClient = useQueryClient();
  const providers = useQuery({ queryKey: ["settings", "providers"], queryFn: runtime.providers });
  const providerFromQuery = providers.data?.providers.find(candidate => candidate.id === integrationId);
  const [checkedProvider, setCheckedProvider] = useState<NativeProvider>();
  const [checkOutcome, setCheckOutcome] = useState<CheckOutcome>();
  const [refreshError, setRefreshError] = useState<string>();
  const [authBusy, setAuthBusy] = useState(false);
  const [lifecycleOutcome, setLifecycleOutcome] = useState<LifecycleOutcome>();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [githubTargetKey, setGithubTargetKey] = useState("");
  const [disconnectRecovery, setDisconnectRecovery] = useState<DisconnectRecovery>();
  const routeRef = useRef({ integrationId, generation: 0 });
  if (routeRef.current.integrationId !== integrationId) {
    routeRef.current = { integrationId, generation: routeRef.current.generation + 1 };
  }
  const routeGeneration = routeRef.current.generation;
  const isCurrentRoute = (generation: number, targetId: string) => routeRef.current.generation === generation && routeRef.current.integrationId === targetId;

  useEffect(() => {
    setCheckedProvider(undefined);
    setCheckOutcome(undefined);
    setRefreshError(undefined);
    setLifecycleOutcome(undefined);
    setDisconnectRecovery(undefined);
    setAuthBusy(false);
    setConfirmDisconnect(false);
    setGithubTargetKey("");
  }, [integrationId]);

  const checkedForRoute = checkedProvider?.id === integrationId ? checkedProvider : undefined;
  const provider = checkedForRoute && providerFromQuery && compareUpdatedAt(checkedForRoute.updatedAt, providerFromQuery.updatedAt) >= 0
    ? checkedForRoute
    : checkedForRoute && !providerFromQuery
      ? checkedForRoute
      : providerFromQuery;
  const lifecycleAction = provider ? knownLifecycleAction(provider) : undefined;
  const githubAccounts = useQuery({
    queryKey: ["settings", "github-accounts"],
    queryFn: runtime.githubAccounts,
    enabled: Boolean(provider?.id === "github" && lifecycleAction?.operation === "disconnect_github"),
  });
  const githubAccountsList = githubAccounts.data?.accounts ?? [];
  const selectedGithubAccount = githubAccountsList.find(account => `${account.hostname}\u0000${account.user}` === githubTargetKey);

  useEffect(() => {
    if (githubAccountsList.length === 1 && !selectedGithubAccount) {
      const account = githubAccountsList[0];
      setGithubTargetKey(`${account.hostname}\u0000${account.user}`);
    }
    if (selectedGithubAccount && !githubAccountsList.includes(selectedGithubAccount)) setGithubTargetKey("");
  }, [githubAccountsList, selectedGithubAccount]);

  const refreshProviders = async (message: string, generation: number, targetId: string): Promise<RefreshResult> => {
    if (!isCurrentRoute(generation, targetId)) return "ignored";
    try {
      const result = await providers.refetch();
      if (!isCurrentRoute(generation, targetId)) return "ignored";
      if (result.isError) {
        setRefreshError(`${message} ${result.error instanceof Error ? result.error.message : "The account status could not be refreshed."}`);
        return "failed";
      }
      return "refreshed";
    } catch (error) {
      if (!isCurrentRoute(generation, targetId)) return "ignored";
      setRefreshError(`${message} ${error instanceof Error ? error.message : "The account status could not be refreshed."}`);
      return "failed";
    }
  };

  const check = useMutation({
    mutationFn: ({ id, expectedUpdatedAt, generation, targetId }: { id: string; expectedUpdatedAt: string; generation: number; targetId: string }) => {
      if (!isCurrentRoute(generation, targetId)) throw new Error("This account view is no longer active.");
      return runtime.checkProvider(id, expectedUpdatedAt);
    },
    onMutate: variables => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      setCheckOutcome({ kind: "pending" });
      setRefreshError(undefined);
    },
    onSuccess: async (result, variables) => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      if (result.status === "stale") {
        setCheckedProvider(undefined);
        const refreshResult = await refreshProviders("The account changed while it was being checked.", variables.generation, variables.targetId);
        if (!isCurrentRoute(variables.generation, variables.targetId)) return;
        setCheckOutcome({ kind: "stale", refreshed: refreshResult === "refreshed" });
        return;
      }
      if (result.provider.id !== variables.targetId) {
        setCheckOutcome({ kind: "error", message: "Kora received a different account than the one open here. No account status was changed." });
        return;
      }
      const latestCatalog = queryClient.getQueryData<{ providers?: NativeProvider[] }>(["settings", "providers"]);
      const latestProvider = latestCatalog?.providers?.find(candidate => candidate.id === variables.targetId);
      if (latestProvider && compareUpdatedAt(latestProvider.updatedAt, result.provider.updatedAt) > 0) {
        setCheckedProvider(undefined);
        const refreshResult = await refreshProviders("A newer account status was already available when this check finished.", variables.generation, variables.targetId);
        if (!isCurrentRoute(variables.generation, variables.targetId)) return;
        setCheckOutcome({ kind: "stale", refreshed: refreshResult === "refreshed" });
        return;
      }
      setCheckedProvider(current => !current || compareUpdatedAt(result.provider.updatedAt, current.updatedAt) >= 0 ? result.provider : current);
      setDisconnectRecovery(undefined);
      setCheckOutcome({ kind: "settled", provider: result.provider });
      await refreshProviders("The check completed, but the current account status could not be refreshed.", variables.generation, variables.targetId);
    },
    onError: (error, variables) => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      setCheckOutcome({ kind: "error", message: error instanceof Error ? error.message : "Kora could not check this provider." });
    },
  });

  const disconnect = useMutation({
    mutationFn: async ({ action, target, generation, targetId }: { action: NativeProviderLifecycleAction; target?: GithubAccount; generation: number; targetId: string }) => {
      if (!isCurrentRoute(generation, targetId)) throw new Error("This account view is no longer active.");
      if (action.operation === "disconnect_google_workspace" && targetId === "google-workspace") return runtime.disconnectGoogleWorkspace();
      if (action.operation === "disconnect_github" && targetId === "github" && target) return runtime.disconnectGithub(target.hostname, target.user);
      throw new Error("No supported account disconnect target is available here.");
    },
    onMutate: variables => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      setLifecycleOutcome(undefined);
      setRefreshError(undefined);
    },
    onSuccess: async (_result, variables) => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      setConfirmDisconnect(false);
      setCheckedProvider(undefined);
      setCheckOutcome(undefined);
      setDisconnectRecovery({
        providerId: variables.targetId,
        generation: variables.generation,
        refreshPending: true,
        refreshFailed: false,
        requiresCheck: variables.targetId === "github",
      });
      setLifecycleOutcome({
        kind: "success",
        message: variables.action.operation === "disconnect_google_workspace"
          ? "Google Workspace authorization was removed from this computer. Remote revocation is not claimed."
          : "The selected GitHub account was removed from this computer. Other saved accounts may keep GitHub connected; check the connection to confirm current availability.",
      });
      if (variables.targetId === "github") await queryClient.invalidateQueries({ queryKey: ["settings", "github-accounts"] });
      const refreshResult = await refreshProviders("The disconnect completed, but the current account status could not be refreshed.", variables.generation, variables.targetId);
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      if (variables.targetId === "google-workspace" && refreshResult === "refreshed") {
        setDisconnectRecovery(undefined);
      } else {
        setDisconnectRecovery(current => current && current.generation === variables.generation && current.providerId === variables.targetId
          ? { ...current, refreshPending: false, refreshFailed: refreshResult === "failed" }
          : current);
      }
    },
    onError: (error, variables) => {
      if (!isCurrentRoute(variables.generation, variables.targetId)) return;
      setConfirmDisconnect(false);
      setLifecycleOutcome({ kind: "error", message: error instanceof Error ? error.message : "The account could not be disconnected." });
    },
  });

  if (providers.isLoading) return <SettingsFrame width="focused" title={providerName(integrationId)} description="Checking this provider’s current connection." breadcrumb={<Link className="settings-back-link" to="/settings/integrations">Accounts & integrations</Link>}><Section title="Account connection"><ContentState state="loading" title="Checking connection" announcement="polite" /></Section></SettingsFrame>;
  if (providers.isError && !providers.data) return <SettingsFrame width="focused" title={providerName(integrationId)} description="Kora could not read this provider’s current state." breadcrumb={<Link className="settings-back-link" to="/settings/integrations">Accounts & integrations</Link>}><ErrorState title="This integration couldn’t be checked." error={providers.error} onRetry={() => providers.refetch()} /></SettingsFrame>;
  if (!provider) return <SettingsFrame width="focused" title={providerName(integrationId)} description="This provider is not in Kora’s current catalog." breadcrumb={<Link className="settings-back-link" to="/settings/integrations">Accounts & integrations</Link>}><ContentState state="empty" title="Integration not found" body="Open Accounts & integrations to choose a provider that is currently available." /></SettingsFrame>;

  const recoveryForRoute = disconnectRecovery?.generation === routeGeneration && disconnectRecovery.providerId === integrationId ? disconnectRecovery : undefined;
  const suppressCachedStatus = Boolean(recoveryForRoute && (recoveryForRoute.refreshPending || recoveryForRoute.refreshFailed || recoveryForRoute.requiresCheck));
  const providerForRender: NativeProvider = suppressCachedStatus
    ? {
      ...provider,
      connected: false,
      connectionState: "needs_attention",
      availableOperations: [],
      operations: [],
      problem: { code: "status_refresh_pending", message: "The local account changed. Check the connection to see current status." },
    }
    : provider;
  const state = connectionView(providerForRender);
  const busy = check.isPending || disconnect.isPending || authBusy;
  const availableOperations = providerForRender.connectionState === "connected"
    ? [...new Set(providerForRender.availableOperations ?? providerForRender.operations)]
    : providerForRender.connectionState === undefined && providerForRender.connected === true
      ? [...new Set(providerForRender.operations)]
      : [];
  const supportedOperations = [...new Set(provider.supportedOperations ?? [])];
  const unavailableOperations = supportedOperations.filter(operation => !availableOperations.includes(operation));
  const renderAuthProps: IntegrationAccountAuthProps = {
    provider: providerForRender,
    disabled: busy,
    onBusyChange: nextBusy => {
      if (isCurrentRoute(routeGeneration, integrationId)) setAuthBusy(nextBusy);
    },
  };
  const disconnectReady = Boolean(!suppressCachedStatus && lifecycleAction && (lifecycleAction.operation === "disconnect_google_workspace" || selectedGithubAccount));

  return <SettingsFrame width="focused" title={providerName(provider.id)} description={state.description} breadcrumb={<Link className="settings-back-link" to="/settings/integrations">Accounts & integrations</Link>}>
    <Section title="Account connection" description="Current account status and the actions available for this local connection.">
      <div className="settings-connection-panel integration-account">
        <div className="settings-connection-panel__identity">
          <span className="settings-row__mark"><Link2 size={16} /></span>
          <span><strong>{state.label}</strong><small>{state.description}</small></span>
        </div>
        <StatusPill state={state.tone}>{state.label}</StatusPill>
        <div className="integration-account__actions">
          <Button disabled={busy} loading={check.isPending} onClick={() => check.mutate({ id: provider.id, expectedUpdatedAt: provider.updatedAt, generation: routeGeneration, targetId: integrationId })}><Check size={14} aria-hidden="true" />Check connection</Button>
          {lifecycleAction && provider.id === "google-workspace" ? <Button tone="danger" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Disconnect account</Button> : null}
          {lifecycleAction && provider.id === "github" && !githubAccounts.isError ? <Button tone="danger" disabled={busy || githubAccounts.isLoading || !disconnectReady} onClick={() => setConfirmDisconnect(true)}>Disconnect account</Button> : null}
        </div>
        {renderAuth ? <div className="integration-account__auth">{renderAuth(renderAuthProps)}</div> : <p className="settings-connection-panel__note">This provider’s sign-in flow is managed by the provider.</p>}
        {checkOutcome?.kind === "pending" ? <ContentState state="loading" title="Checking connection" announcement="polite" /> : null}
        {checkOutcome?.kind === "settled" ? (() => {
          const checkedState = connectionView(checkOutcome.provider);
          return <ContentState state={checkedState.tone === "ready" ? "success" : "stale"} title={checkedState.tone === "ready" ? "Connection check complete" : "Connection check complete · review needed"} body={`Current account status: ${checkedState.label}.`} announcement="polite" />;
        })() : null}
        {checkOutcome?.kind === "stale" ? <ContentState state="stale" title="Account changed before the check settled" body={checkOutcome.refreshed ? "Kora refreshed the current account details. Review them and choose Check connection again when you are ready." : "Kora could not refresh the account details after they changed. Review the current information and try Check connection again when you are ready."} announcement="assertive" /> : null}
        {checkOutcome?.kind === "error" ? <ContentState state="error" title="Connection check failed" body={checkOutcome.message} announcement="assertive" /> : null}
        {refreshError ? <ContentState state="error" title="Latest account status could not be refreshed" body={`${refreshError} The completed check result remains separate from this refresh failure.`} announcement="assertive" /> : null}
        {lifecycleOutcome?.kind === "success" ? <ContentState state="success" title="Disconnect complete" body={lifecycleOutcome.message} announcement="polite" /> : null}
        {lifecycleOutcome?.kind === "error" ? <ContentState state="error" title="Disconnect failed" body={lifecycleOutcome.message} announcement="assertive" /> : null}
      </div>
    </Section>

    <Section title="What Kora can do next" description="Actions available for this account right now.">
      <OperationList operations={availableOperations} emptyLabel="No actions are currently available through this connection." />
      {unavailableOperations.length ? <div className="integration-account__secondary-operations"><strong>Other supported actions currently unavailable</strong><OperationList operations={unavailableOperations} emptyLabel="No unavailable actions are reported." /></div> : null}
    </Section>

    <Section title="Observed permissions" description="Permissions reported for this account, with whether they are current, historical, or unavailable.">
      <AuthorityDetails provider={providerForRender} needsRefresh={suppressCachedStatus} />
    </Section>

    {lifecycleAction && provider.id === "github" ? <Section title="Disconnect this account" description="Choose the exact saved GitHub account before removing its local authorization.">
      {githubAccounts.isLoading ? <ContentState state="loading" title="Reading saved GitHub accounts" announcement="polite" /> : githubAccounts.isError ? <ErrorState title="Saved GitHub accounts couldn’t be read." error={githubAccounts.error} onRetry={() => githubAccounts.refetch()} /> : githubAccountsList.length ? <>
        <KoraSelect label="GitHub account to disconnect" value={githubTargetKey} options={[{ value: "", label: "Choose a saved account", disabled: true }, ...githubAccountsList.map(account => ({ value: `${account.hostname}\u0000${account.user}`, label: `${account.user} · ${account.hostname}${account.active ? " · active" : " · saved"}` }))]} onValueChange={setGithubTargetKey} disabled={busy} />
        <p className="settings-prose">This removes only the selected local GitHub account. Other saved accounts may keep GitHub connected.</p>
      </> : <p className="settings-prose">No saved local GitHub account is available to disconnect.</p>}
    </Section> : null}

    {!lifecycleAction ? <Section title="Account management" description="Disconnect is shown only when Kora can safely manage this account."><p className="settings-prose">Kora does not have a safe local disconnect action for this account. Use the provider’s own sign-in or account settings to manage access.</p></Section> : null}

    <Section title="Account details" description="Additional account information for troubleshooting and support.">
      <div className="settings-facts integration-account__technical-facts">
        <div><span>Account identifier</span><strong>{provider.id}</strong></div>
        <div><span>Current account state</span><strong>{state.label}</strong></div>
        <div><span>Last connection check</span><strong>{suppressCachedStatus ? "Fresh check needed" : safeDate(provider.connectionObservedAt ?? provider.lastCheckedAt, "Not checked")}</strong></div>
        <div><span>Last account update</span><strong>{safeDate(provider.updatedAt, "Not reported")}</strong></div>
      </div>
      {provider.problem?.message && !suppressCachedStatus ? <div className="settings-callout"><AlertCircle size={18} /><div><strong>Account status note</strong><p>{provider.problem.message}</p></div></div> : null}
      <div className="settings-callout"><ShieldCheck size={18} /><div><strong>Credentials stay protected</strong><p>Kora displays account status and available actions without exposing provider secrets.</p></div></div>
    </Section>

    <Modal
      open={confirmDisconnect}
      onOpenChange={setConfirmDisconnect}
      title="Disconnect this account?"
      description={provider.id === "github" && selectedGithubAccount ? `${selectedGithubAccount.user} on ${selectedGithubAccount.hostname}` : providerName(provider.id)}
      purpose="confirm"
      busy={disconnect.isPending}
      actions={<><Button onClick={() => setConfirmDisconnect(false)} disabled={disconnect.isPending}>Keep account</Button><Button tone="danger" onClick={() => {
        if (!lifecycleAction) return;
        disconnect.mutate({ action: lifecycleAction, target: selectedGithubAccount, generation: routeGeneration, targetId: integrationId });
      }} disabled={busy || !disconnectReady} loading={disconnect.isPending}>Confirm disconnect</Button></>}
    >
      <p className="settings-prose">{provider.id === "github" ? "This removes only the selected local GitHub account. GitHub permissions remain unchanged." : "This removes Google Workspace authorization stored locally by Kora. Remote revocation is not claimed."}</p>
    </Modal>
  </SettingsFrame>;
}
