import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/wellbeing-navigation.css";
import "../features/life/wellbeing-privacy.css";
import "./wellbeing-privacy-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect, ToastProvider } from "../components/primitives";
import { WellbeingPrivacyWorkspace, type WellbeingPrivacyLoaders } from "../features/life/WellbeingPrivacyWorkspace";
import type { WellbeingPrivacyOverview } from "../lib/runtime";

const fixtures = ["read-only", "loading", "unavailable", "restricted-omitted", "no-history", "long-copy"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "read-only";
const OVERVIEW: WellbeingPrivacyOverview = {
  policy: { state: "read_only", defaultPrivacy: "private", storageAuthority: "local_sqlite", writableControls: false },
  ordinaryUse: { permittedPrivateRecords: "wellbeing_workspace", conversationUse: "shared_personal_information_policy", restrictedRecords: "omitted", restrictedCounts: "omitted" },
  exactRestrictedAccess: { enforcement: "record_version_purpose_request_expiry", permittedPurpose: "kora_context_attachment", visualRead: "unavailable", wellbeingControl: "unavailable" },
  controls: { recordCorrection: "records", archiveRestore: "records", exactDeletion: "records", policyEditing: "unavailable", privacyHistory: "unavailable" },
};
const loaders: WellbeingPrivacyLoaders = {
  read: async () => {
    if (fixture === "loading") return new Promise(() => {});
    if (fixture === "unavailable") throw new Error("Synthetic privacy capability read is unavailable.");
    return OVERVIEW;
  },
};

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function App() {
  return <ToastProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={["/life/wellbeing/privacy"]}><ViewBarProvider>
    <main className="wellbeing-privacy-specimen" id="main-content">
      <div className="wellbeing-privacy-specimen__controls">
        <div><strong>Privacy specimen</strong><span>{fixture} · deterministic synthetic capability state</span></div>
        <KoraSelect label="Fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value }))} onValueChange={(value) => { const next = new URL(location.href); next.searchParams.set("fixture", value); location.href = next.toString(); }} />
      </div>
      <ViewBar />
      <WellbeingPrivacyWorkspace loaders={loaders} longCopy={fixture === "long-copy"} />
    </main>
  </ViewBarProvider></MemoryRouter></QueryClientProvider></ToastProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
