import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./settings-integrations-specimen.css";
import { GitBranch, Globe2, Landmark, Link2, MessageCircleMore, Search, ShieldCheck } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Button, IconButton } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { SettingsFrame, SettingsListRow, SettingsSection } from "../features/settings/SettingsFrame";
import { SettingsLayout } from "../features/settings/SettingsLayout";

export type ProviderState = "connected" | "stale" | "checking" | "unknown" | "not-configured" | "not-connected" | "unavailable" | "expired" | "restricted" | "partial";
export type Provider = {
  id: string;
  name: string;
  icon: "chrome" | "github" | "workspace" | "plaid" | "spotify";
  state: ProviderState;
  account?: string;
  checked: string;
  consequence: string;
};

export const settingsIntegrationFixtures = ["populated", "checking", "partial", "expired", "restricted", "loading", "unavailable", "error", "empty"] as const;
export type SettingsIntegrationFixture = typeof settingsIntegrationFixtures[number];
const requestedFixture = new URLSearchParams(window.location.search).get("fixture");
const fixture: SettingsIntegrationFixture = settingsIntegrationFixtures.includes(requestedFixture as SettingsIntegrationFixture)
  ? requestedFixture as SettingsIntegrationFixture
  : "populated";

const defaultProviders: Provider[] = [
  { id: "chrome-browser", name: "Personal Chrome", icon: "chrome", state: "connected", account: "Personal profile", checked: "Checked just now", consequence: "Browser tabs and signed-in sites are available when you explicitly ask Kora to use them." },
  { id: "github", name: "GitHub", icon: "github", state: "connected", account: "mobi21", checked: "Checked 4 minutes ago", consequence: "Repository tools are available; consequential writes still require their normal review boundary." },
  { id: "google-workspace", name: "Google Workspace", icon: "workspace", state: "unknown", checked: "Not checked in this runtime yet", consequence: "This runtime has no current provider observation. Open the connection to inspect its exact configuration before acting." },
  { id: "plaid", name: "Plaid", icon: "plaid", state: "unavailable", checked: "Last checked 12 minutes ago", consequence: "Financial account reads are unavailable. Existing local records remain intact." },
  { id: "spotify", name: "Spotify", icon: "spotify", state: "not-connected", checked: "Checked 18 minutes ago", consequence: "Spotify is not connected; no music account data is available to Kora." },
];

const providerIcon = (provider: Provider) => provider.icon === "chrome" ? <Globe2 size={17} /> : provider.icon === "github" ? <GitBranch size={17} /> : provider.icon === "plaid" ? <Landmark size={17} /> : provider.icon === "workspace" ? <ShieldCheck size={17} /> : <Link2 size={17} />;
const stateLabel = (state: ProviderState) => ({
  connected: "Connected · current",
  stale: "Connected · stale",
  checking: "Checking",
  unknown: "Not checked",
  "not-configured": "Not configured",
  "not-connected": "Not connected",
  unavailable: "Unavailable",
  expired: "Credentials expired",
  restricted: "Permission restricted",
  partial: "Partial access",
}[state]);
const stateTone = (state: ProviderState) => state === "connected" ? "success" : state === "checking" || state === "unknown" || state === "not-connected" || state === "not-configured" ? "quiet" : state === "expired" || state === "restricted" ? "danger" : "warning";
const actionLabel = (state: ProviderState) => state === "connected" || state === "checking" || state === "unknown" ? "Open" : state === "not-connected" || state === "not-configured" ? "Set up" : state === "expired" ? "Reconnect" : "Review";
const providerGroup = (state: ProviderState) => state === "connected" ? "Connected" : ["not-connected", "not-configured", "checking", "unknown"].includes(state) ? "Available" : "Needs attention";

export function settingsIntegrationProvidersForFixture(selected: SettingsIntegrationFixture): Provider[] {
  if (selected === "checking") return defaultProviders.map((provider) => ({ ...provider, state: "checking", checked: "Checking now" }));
  if (selected === "partial") return defaultProviders.map((provider) => provider.id === "github" ? {
    ...provider,
    state: "partial",
    checked: "Checked 7 minutes ago",
    consequence: "Repository reading is available; write capability could not be confirmed.",
  } : provider);
  if (selected === "expired") return defaultProviders.map((provider) => provider.id === "github" ? {
    ...provider,
    state: "expired",
    checked: "Credentials expired 6 minutes ago",
    consequence: "Repository access is paused until this exact connection is renewed. Existing local repository data remains intact.",
  } : provider);
  if (selected === "restricted") return defaultProviders.map((provider) => provider.id === "google-workspace" ? {
    ...provider,
    state: "restricted",
    account: "Personal Workspace",
    checked: "Permissions checked 3 minutes ago",
    consequence: "Calendar and mail permissions are restricted. No protected provider content was read or inferred.",
  } : provider);
  return defaultProviders;
}

const fixtureNotice = (selected: SettingsIntegrationFixture) => selected === "partial"
  ? { title: "Some capability coverage could not be confirmed.", body: "Qualified provider rows remain available below; open a service for exact details." }
  : selected === "expired"
    ? { title: "One connection needs renewed credentials.", body: "Kora has not treated the provider as disconnected, and existing local records remain intact." }
    : selected === "restricted"
      ? { title: "One connection has restricted permissions.", body: "Protected provider content remains omitted; open the exact service to review its permission boundary." }
      : undefined;

function ProviderRows({ providers }: { providers: Provider[] }) {
  return <div className="k-settings-list">
    {providers.map((provider) => <SettingsListRow
      key={provider.id}
      href={`/settings/integrations/${provider.id}`}
      icon={providerIcon(provider)}
      title={provider.name}
      description={provider.account ?? provider.consequence}
      qualification={provider.account ? `${provider.consequence} · ${provider.checked}` : provider.checked}
      state={stateLabel(provider.state)}
      stateTone={stateTone(provider.state)}
      actionLabel={actionLabel(provider.state)}
    />)}
  </div>;
}

export function SettingsIntegrationsSpecimen({ selectedFixture = fixture }: { selectedFixture?: SettingsIntegrationFixture } = {}) {
  const [retrying, setRetrying] = useState(false);
  const [retryStatus, setRetryStatus] = useState("");
  const providers = settingsIntegrationProvidersForFixture(selectedFixture);
  const notice = fixtureNotice(selectedFixture);
  const groups = ["Needs attention", "Connected", "Available"] as const;
  return <MemoryRouter initialEntries={["/settings/integrations"]}>
    <div className="settings-integrations-specimen app-shell">
      <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="settings-integrations-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
      <main className="settings-integrations-specimen__main">
        <SettingsLayout><SettingsFrame title="Accounts & integrations" description="Connect, inspect, and repair the services Kora can use. A connection grants capability access—it does not authorize Kora to act without the normal review boundaries." status={<span>Synthetic review state · provider status is observed, never inferred</span>}>
          {selectedFixture === "loading" ? <div className="settings-integrations-specimen__loading" role="status" aria-live="polite" aria-label="Checking accounts and integrations">{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true"><i /><b /><em /></span>)}</div>
            : selectedFixture === "unavailable" || selectedFixture === "error" ? <div className="settings-integrations-specimen__recovery"><div className="settings-integrations-specimen__state" role="alert"><strong>Connections are unavailable</strong><p>Kora could not read provider status. No account was disconnected and existing local data remains intact.</p><Button aria-busy={retrying || undefined} aria-disabled={retrying || undefined} onClick={() => { if (retrying) return; setRetrying(true); setRetryStatus(""); window.setTimeout(() => { setRetrying(false); setRetryStatus("Provider status is still unavailable. No account or local data changed."); }, 300); }}>{retrying ? "Checking connections…" : "Try again"}</Button></div>{retryStatus ? <p className="settings-integrations-specimen__recovery-status" role="status">{retryStatus}</p> : null}</div>
              : selectedFixture === "empty" ? <div className="settings-integrations-specimen__state" role="status"><strong>No provider catalog is available</strong><p>This is not the same as having no connected accounts. Kora did not return a service catalog for this runtime.</p></div>
                : <>
                  {notice ? <div className="settings-integrations-specimen__notice" role="status"><strong>{notice.title}</strong><span>{notice.body}</span></div> : null}
                  {groups.map((group) => {
                    const items = providers.filter((provider) => providerGroup(provider.state) === group);
                    if (!items.length) return null;
                    const description = group === "Needs attention" ? "Connections whose current observation needs review or repair." : group === "Connected" ? "Services currently available to Kora through the local runtime." : "Services you can inspect or set up when you need them.";
                    return <SettingsSection key={group} title={group} description={description}><ProviderRows providers={items} /></SettingsSection>;
                  })}
                </>}
        </SettingsFrame></SettingsLayout>
      </main>
    </div>
  </MemoryRouter>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<SettingsIntegrationsSpecimen />);
