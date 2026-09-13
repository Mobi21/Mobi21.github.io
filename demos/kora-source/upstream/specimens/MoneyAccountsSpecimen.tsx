import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/money-accounts.css";
import "./money-accounts-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { MoneyAccountsWorkspace, type MoneyAccountsLoaders } from "../features/life/MoneyAccountsWorkspace";
import type { FinanceAccount, FinanceAccountsRead, FinanceConnectionSource, FinanceSources, FinanceTransaction } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = ["populated", "hidden", "loading", "not-configured", "source-not-configured", "empty", "mixed", "mixed-currency", "partial", "reauthorization", "manual", "unavailable", "clipped", "page-error", "long-copy", "read-error", "detail-missing", "detail-error"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";

const updatedAt = "2026-08-29T12:00:00.000Z";
const lastSyncedAt = "2026-08-29T11:42:00.000Z";
const viewerTimeZone = "America/New_York";
const sources: FinanceSources = fixture === "not-configured" || fixture === "source-not-configured"
  ? { plaid: { state: "unavailable", reason: "Plaid is not connected." } }
  : fixture === "partial"
  ? { plaid: { state: "partial", unavailableSources: ["latest transactions"] } }
  : fixture === "unavailable"
    ? { plaid: { state: "unavailable", reason: "Synthetic provider outage" } }
    : { plaid: { state: "ok" } };

function connection(overrides: Partial<FinanceConnectionSource> = {}): FinanceConnectionSource {
  return { connectionId: "plaid-main", providerId: "plaid", providerConnectionId: "provider-connection", state: "current", accountCount: 3, permissions: ["accounts", "transactions"], coveredDataKinds: ["accounts", "balances", "transactions"], lastSyncedAt, lastCheckedAt: updatedAt, lastSuccessfulAt: lastSyncedAt, unavailableReason: null, recoveryOwner: "Settings · Accounts & integrations", updatedAt, ...overrides };
}
const activity: FinanceTransaction[] = [
  { id: "tx-market", connectionId: "plaid-main", providerTransactionId: "provider-market", accountId: "checking", accountName: "Everyday checking", accountType: "depository", amountMinor: 8_450, currency: "USD", merchant: "Neighborhood market", occurredAt: "2026-08-29T10:14:00.000Z", pending: false, updatedAt },
  { id: "tx-payroll", connectionId: "plaid-main", providerTransactionId: "provider-payroll", accountId: "checking", accountName: "Everyday checking", accountType: "depository", amountMinor: -325_000, currency: "USD", merchant: "Studio payroll", occurredAt: "2026-08-28T14:30:00.000Z", pending: false, updatedAt },
  { id: "tx-transit", connectionId: "plaid-main", providerTransactionId: "provider-transit", accountId: "checking", accountName: "Everyday checking", accountType: "depository", amountMinor: 275, currency: "USD", merchant: "City transit", occurredAt: "2026-08-28T12:10:00.000Z", pending: true, updatedAt },
];
function account(overrides: Partial<FinanceAccount> = {}): FinanceAccount {
  return { accountId: "checking", connectionId: "plaid-main", providerId: "plaid", providerAccountId: "provider-checking", name: fixture === "long-copy" ? "Riverside Community Credit Union Joint Household Checking and Renovation Reserve" : "Everyday checking", type: "depository", currency: "USD", balanceMinor: 659_650, updatedAt, connectionState: "current", lastSyncedAt, balanceQualification: "current", includedInAllowance: true, allowanceInclusionReason: "Included explicitly in the current plan.", linkedRecurringCount: 3, recentActivity: activity, ...overrides };
}
const baseAccounts: FinanceAccount[] = [
  account(),
  account({ accountId: "savings", providerAccountId: "provider-savings", name: "Rainy day savings", balanceMinor: 1_280_000, includedInAllowance: false, allowanceInclusionReason: "Not selected in the current plan.", linkedRecurringCount: 0, recentActivity: [] }),
  account({ accountId: "card", providerAccountId: "provider-card", name: "Travel card", type: "credit", balanceMinor: -42_875, includedInAllowance: false, allowanceInclusionReason: "Not selected in the current plan.", linkedRecurringCount: 1, recentActivity: [] }),
];
const clippedAccounts = [...baseAccounts, ...Array.from({ length: 207 }, (_, index) => account({ accountId: `account-${index + 4}`, providerAccountId: `provider-account-${index + 4}`, name: `Everyday account ${index + 4}`, balanceMinor: 10_000 + index * 125, includedInAllowance: index % 5 === 0, allowanceInclusionReason: index % 5 === 0 ? "Included explicitly in the current plan." : "Not selected in the current plan.", linkedRecurringCount: index % 3, recentActivity: [] }))];

function fixtureData(): FinanceAccountsRead {
  if (fixture === "not-configured") return { accounts: [], connections: [], complete: true, viewerTimeZone, sources };
  if (fixture === "source-not-configured") return { accounts: [], connections: [connection({ state: "not_configured", accountCount: 0, lastSyncedAt: null, lastCheckedAt: null, lastSuccessfulAt: null, unavailableReason: "Plaid has not been configured." })], complete: true, viewerTimeZone, sources };
  if (fixture === "empty") return { accounts: [], connections: [connection({ accountCount: 0 })], complete: true, viewerTimeZone, sources };
  if (fixture === "mixed") { const stale = connection({ connectionId: "plaid-stale", providerConnectionId: "stale-item", state: "stale", accountCount: 1, lastSyncedAt: "2026-08-19T12:00:00.000Z", lastCheckedAt: updatedAt, lastSuccessfulAt: "2026-08-19T12:00:00.000Z", unavailableReason: "This source has not refreshed since Aug 19." }); return { accounts: [...baseAccounts, account({ accountId: "stale-card", connectionId: stale.connectionId, providerAccountId: "stale-provider-account", name: "Last-confirmed household card", balanceMinor: -18_250, connectionState: "stale", balanceQualification: "last_confirmed", lastSyncedAt: stale.lastSuccessfulAt })], connections: [connection(), stale], complete: true, viewerTimeZone, sources: { plaid: { state: "partial", unavailableSources: ["stale-item"] } } }; }
  if (fixture === "mixed-currency") return { accounts: [...baseAccounts, account({ accountId: "euro-card", providerAccountId: "provider-euro", name: "European travel account", currency: "EUR", balanceMinor: 82_000 })], connections: [connection({ accountCount: 4 })], complete: true, viewerTimeZone, sources };
  if (fixture === "manual") return { accounts: [account({ connectionId: "manual-cash", providerId: "manual-local", providerAccountId: "", name: "Cash reserve", balanceMinor: 32_000, connectionState: "manual", balanceQualification: "manual", lastSyncedAt: null })], connections: [connection({ connectionId: "manual-cash", providerId: "manual-local", providerConnectionId: null, state: "manual", accountCount: 1, permissions: [], coveredDataKinds: [], lastSyncedAt: null, lastCheckedAt: null, lastSuccessfulAt: null, recoveryOwner: "Money" })], complete: true, viewerTimeZone, sources };
  if (fixture === "partial") return { accounts: baseAccounts.map((item) => ({ ...item, connectionState: "partial" as const, balanceQualification: "last_confirmed" as const })), connections: [connection({ state: "partial", unavailableReason: "Latest transaction coverage is temporarily incomplete." })], complete: true, viewerTimeZone, sources };
  if (fixture === "reauthorization") return { accounts: baseAccounts.map((item) => ({ ...item, connectionState: "reauthorization_required" as const, balanceQualification: "last_confirmed" as const })), connections: [connection({ state: "reauthorization_required", unavailableReason: "Provider authorization expired; sign in again to resume reads." })], complete: true, viewerTimeZone, sources };
  if (fixture === "unavailable") return { accounts: baseAccounts.map((item) => ({ ...item, connectionState: "unavailable" as const, balanceQualification: "last_confirmed" as const })), connections: [connection({ state: "unavailable", unavailableReason: "The provider could not be reached. Saved balances remain last-confirmed." })], complete: true, viewerTimeZone, sources };
  const paged = fixture === "clipped" || fixture === "page-error";
  return { accounts: paged ? clippedAccounts : baseAccounts, connections: [connection({ accountCount: paged ? clippedAccounts.length : 3 })], complete: !paged, viewerTimeZone, sources };
}
const reject = async (): Promise<FinanceAccountsRead> => { throw new Error("Synthetic account read failure"); };
const pending = async (): Promise<FinanceAccountsRead> => new Promise(() => undefined);
function loaders(): MoneyAccountsLoaders {
  if (fixture === "loading") return { accounts: pending };
  if (fixture === "read-error") return { accounts: reject };
  return { accounts: async (input) => {
    const data = fixtureData();
    if (typeof input === "string") {
      if (fixture === "detail-error") return reject();
      if (fixture === "detail-missing") return { ...data, accounts: [] };
      return { ...data, accounts: data.accounts.filter((item) => item.accountId === input).map((item) => ({ ...item, recentActivity: item.recentActivity ?? activity })), complete: true, total: data.accounts.some((item) => item.accountId === input) ? 1 : 0 };
    }
    if (fixture === "page-error" && input?.cursor) return reject();
    const pageSize = input?.pageSize ?? 50;
    const start = Number(input?.cursor?.replace("spec-account-", "") ?? 0);
    const accounts = data.accounts.slice(start, start + pageSize);
    const complete = start + pageSize >= data.accounts.length;
    return { ...data, accounts, complete, cursor: complete ? undefined : `spec-account-${start + pageSize}`, total: data.accounts.length };
  } };
}
function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }
function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const entry = fixture === "detail-missing" || fixture === "detail-error" ? "/life/finances/accounts/checking" : fixture === "page-error" ? "/life/finances/accounts?accountPageCursor=synthetic-failure&accountPageHistory=~" : "/life/finances/accounts";
  return <main className="money-accounts-specimen" id="main-content"><header className="money-accounts-specimen__controls"><div><strong>Money accounts qualification</strong><span>Synthetic local account and source states · no provider access</span></div><KoraSelect label="Accounts fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><ViewBarProvider><SyntheticAmountPrivacy hidden={fixture === "hidden"} /><ViewBar /><div className="life-stage"><Routes><Route path="/life/finances/accounts/:accountId?" element={<MoneyAccountsWorkspace onAskKora={() => undefined} loaders={loaders()} requestKey={fixture} />} /></Routes></div></ViewBarProvider></QueryClientProvider></MemoryRouter></main>;
}
createRoot(document.getElementById("root")!).render(<Specimen />);
