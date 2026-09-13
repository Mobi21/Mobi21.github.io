import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/finances.css";
import "./money-overview-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { FinancesWorkspace, type MoneyOverviewLoaders } from "../features/life/FinancesWorkspace";
import type { FinanceAccountsRead, FinanceAllowance, FinanceReceipt, FinanceSnapshot } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = ["current-populated", "non-positive", "partial", "mixed-currency", "provider-unavailable-local", "all-unavailable", "not-configured", "amounts-hidden", "long-copy", "loading", "empty-success", "large-summary"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "current-populated";

const generatedAt = "2026-08-27T12:00:00.000Z";

const transactions = [
  { occurredAt: "2026-08-27T10:00:00.000Z", amountMinor: 3_600, currency: "USD", merchant: "Local bakery", pending: 1, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1" },
  { occurredAt: "2026-08-26T10:00:00.000Z", amountMinor: 8_450, currency: "USD", merchant: "Neighborhood market", pending: 0, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1" },
  { occurredAt: "2026-08-25T10:00:00.000Z", amountMinor: -325_000, currency: "USD", merchant: "Studio payroll", pending: 0, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1" },
  { occurredAt: "2026-08-24T10:00:00.000Z", amountMinor: 12_900, currency: "USD", merchant: "City utilities", pending: 0, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1" },
  { occurredAt: "2026-08-23T10:00:00.000Z", amountMinor: 2_875, currency: "USD", merchant: "Corner café", pending: 0, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1" },
  ...Array.from({ length: 25 }, (_, index) => ({
    occurredAt: new Date(Date.parse("2026-08-22T12:00:00.000Z") - index * 86_400_000).toISOString(),
    amountMinor: [8_495, 1_875, 0, 4_200, 12_900, 925, 6_750][index % 7],
    currency: "USD", merchant: ["Neighborhood market", "Northline transit", "Account adjustment", "Riverside pharmacy", "City utilities", "Corner café", "Studio supplies"][index % 7],
    pending: 0, accountName: "Everyday checking", accountType: "depository", connectionId: "connection-1",
  })).filter((transaction) => transaction.amountMinor !== 0),
];
// The visual chart and its ledger share the same test-only records and date window.
const postedDays = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.parse("2026-07-29T12:00:00.000Z") + index * 86_400_000).toISOString().slice(0, 10);
  return { date, amountMinor: transactions.filter((item) => !item.pending && item.amountMinor > 0 && item.occurredAt.slice(0, 10) === date).reduce((total, item) => total + item.amountMinor, 0) };
});
const snapshot: FinanceSnapshot = {
  generatedAt, viewerTimeZone: "America/New_York", dailyPostedOutflows: postedDays,
  window: { days: 30, cutoff: "2026-07-29", transactionLimit: 250, totalTransactions: transactions.length, returnedTransactions: transactions.length, clipped: false, oldestTransactionAt: transactions.at(-1)!.occurredAt, newestTransactionAt: "2026-08-27T10:00:00.000Z", pendingTransactions: 1 },
  connections: [{ connectionId: "connection-1", providerId: "plaid", state: "connected", lastSyncedAt: "2026-08-27T10:42:00.000Z", updatedAt: "2026-08-27T10:42:00.000Z" }],
  accounts: [
    { accountId: "checking", connectionId: "connection-1", name: "Everyday checking", type: "depository", currency: "USD", balanceMinor: 659_650, updatedAt: "2026-08-27T10:42:00.000Z" },
    { accountId: "savings", connectionId: "connection-1", name: "Protected savings", type: "depository", currency: "USD", balanceMinor: 150_000, updatedAt: "2026-08-27T10:42:00.000Z" },
  ],
  monthlyCashFlow: [], transactions,
  plans: { budgets: { records: [] }, bills: { records: [] }, goals: { records: [] }, subscriptions: { records: [] }, alerts: { records: [] } },
  sources: { plaid: { state: "ok" } },
};
const accountRead: FinanceAccountsRead = {
  viewerTimeZone: "America/New_York", complete: true,
  accounts: snapshot.accounts.map((account) => ({ ...account, providerId: "plaid", connectionState: "current", balanceQualification: "current" })),
  connections: [{ connectionId: "connection-1", providerId: "plaid", providerConnectionId: "item-1", state: "current", accountCount: 2, permissions: ["transactions"], coveredDataKinds: ["balances", "transactions"], lastSyncedAt: "2026-08-27T10:42:00.000Z", lastCheckedAt: "2026-08-27T10:42:00.000Z", lastSuccessfulAt: "2026-08-27T10:42:00.000Z", unavailableReason: null, recoveryOwner: "provider", updatedAt: generatedAt }],
  sources: { plaid: { state: "ok" } },
};
const allowance: FinanceAllowance = { generatedAt, viewerTimeZone: "America/New_York", currency: "USD", includedAccountIds: ["checking"], usedDepositoryFallback: false, availableBalanceMinor: 659_650, upcomingObligationsMinor: 146_199, incomeExpectedMinor: 325_000, bufferMinor: 75_000, dailyFloorMinor: 150_000, monthToDateOutflowMinor: 35_225, remainingDays: 5, planningRemainderMinor: 613_451, dailyAllowanceMinor: 122_690, status: "within_plan", isNonPositive: false, explanation: "Raw service explanation is not rendered.", sources: { plaid: { state: "ok" } } };
const bills = [
  { id: "payroll", billerName: "Studio payroll", expectedAmountMinor: -325_000, currency: "USD", nextExpectedAt: "2026-08-28T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt: generatedAt },
  { id: "rent", billerName: "Rent", expectedAmountMinor: 145_000, currency: "USD", nextExpectedAt: "2026-08-29T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt: generatedAt },
  { id: "insurance", billerName: "Home insurance", expectedAmountMinor: 18_600, currency: "USD", nextExpectedAt: "2026-09-03T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt: generatedAt },
  { id: "maintenance", billerName: "Building maintenance estimate", currency: "USD", nextExpectedAt: "2026-09-06T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt: generatedAt },
];
const subscriptions = [{ id: "music", merchantName: "Music subscription", cadence: "monthly", expectedAmountMinor: 1_199, currency: "USD", nextExpectedAt: "2026-09-01T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt: generatedAt }];
const receipts: FinanceReceipt[] = [{ id: "receipt-1", gmailMessageId: "message-1", extractedMerchant: "Neighborhood market", extractedAmountMinor: 8_450, extractedCurrency: "USD", extractionConfidence: "medium", matchState: "ambiguous", candidateTransactionIds: ["one", "two"], reviewedByUser: false, updatedAt: generatedAt }];

function baseLoaders(): MoneyOverviewLoaders { return {
  accounts: async () => accountRead, snapshot: async () => snapshot, allowance: async () => allowance,
  bills: async () => ({ bills, sources: { plaid: { state: "ok" } } }),
  subscriptions: async () => ({ subscriptions, sources: { plaid: { state: "ok" } } }),
  goals: async () => ({ goals: [], sources: { plaid: { state: "ok" } } }),
  receipts: async () => ({ items: receipts, complete: true, sources: { plaid: { state: "ok" }, gmail: { state: "ok" } } }),
}; }
function loadersFor(value: Fixture): MoneyOverviewLoaders {
  const base = baseLoaders();
  if (value === "loading") { const pending = () => new Promise<never>(() => undefined); return { accounts: pending, snapshot: pending, allowance: pending, bills: pending, subscriptions: pending, goals: pending, receipts: pending }; }
  if (value === "all-unavailable") { const rejected = async () => { throw new Error("Synthetic unavailable"); }; return { accounts: rejected, snapshot: rejected, allowance: rejected, bills: rejected, subscriptions: rejected, goals: rejected, receipts: rejected }; }
  if (value === "provider-unavailable-local") return { ...base, accounts: async () => ({ ...accountRead, accounts: accountRead.accounts.map((account) => ({ ...account, connectionState: "unavailable", balanceQualification: "last_confirmed" })), sources: { plaid: { state: "unavailable", reason: "Synthetic provider outage" } }, connections: accountRead.connections.map((connection) => ({ ...connection, state: "unavailable", unavailableReason: "Synthetic provider outage" })) }), snapshot: async () => { throw new Error("Synthetic provider outage"); }, allowance: async () => { throw new Error("Synthetic allowance unavailable"); } };
  if (value === "partial") return { ...base, accounts: async () => ({ ...accountRead, accounts: [{ ...accountRead.accounts[0]!, connectionId: "current", connectionState: "current" }, { ...accountRead.accounts[1]!, connectionId: "stale", connectionState: "stale", balanceQualification: "last_confirmed" }], connections: [{ ...accountRead.connections[0]!, connectionId: "current", state: "current", accountCount: 1 }, { ...accountRead.connections[0]!, connectionId: "stale", state: "stale", accountCount: 1, lastSuccessfulAt: "2026-08-19T10:00:00.000Z" }], sources: { plaid: { state: "partial", unavailableSources: ["stale"] } } }), snapshot: async () => ({ ...snapshot, sources: { plaid: { state: "partial", unavailableSources: ["stale"] } } }), allowance: async () => ({ ...allowance, sources: { plaid: { state: "partial", unavailableSources: ["stale"] } } }), bills: async () => ({ bills, sources: { plaid: { state: "partial", unavailableSources: ["stale"] } } }) };
  if (value === "non-positive") return { ...base, allowance: async () => ({ ...allowance, planningRemainderMinor: -42_175, dailyAllowanceMinor: -8_435, status: "over_floor", isNonPositive: true, explanation: "Recorded obligations, protected floor, and buffer exceed the confirmed planning position by $421.75." }) };
  if (value === "mixed-currency") return { ...base, accounts: async () => ({ ...accountRead, accounts: [{ ...accountRead.accounts[0]!, currency: "USD" }, { ...accountRead.accounts[1]!, currency: "EUR" }] }) };
  if (value === "not-configured") return { ...base, accounts: async () => ({ ...accountRead, accounts: [], connections: [{ ...accountRead.connections[0]!, providerConnectionId: null, state: "not_configured", accountCount: 0 }], sources: { plaid: { state: "unavailable", reason: "Synthetic not configured" } } }), snapshot: async () => ({ ...snapshot, accounts: [], transactions: [], dailyPostedOutflows: [], sources: { plaid: { state: "unavailable", reason: "Synthetic not configured" } } }), allowance: async () => ({ ...allowance, sources: { plaid: { state: "unavailable", reason: "Synthetic not configured" } } }) };
  if (value === "empty-success") return { ...base, accounts: async () => ({ ...accountRead, accounts: [], connections: [], sources: { plaid: { state: "ok" } } }), snapshot: async () => ({ ...snapshot, accounts: [], transactions: [], dailyPostedOutflows: [], window: { ...snapshot.window, totalTransactions: 0, returnedTransactions: 0, pendingTransactions: 0 }, sources: { plaid: { state: "ok" } } }), allowance: async () => { throw new Error("No allowance inputs"); }, bills: async () => ({ bills: [], sources: { plaid: { state: "ok" } } }), subscriptions: async () => ({ subscriptions: [], sources: { plaid: { state: "ok" } } }), receipts: async () => ({ items: [], complete: true, sources: { plaid: { state: "ok" }, gmail: { state: "ok" } } }) };
  if (value === "long-copy") return { ...base, accounts: async () => ({ ...accountRead, accounts: accountRead.accounts.map((account) => ({ ...account, name: `${account.name} — joint household expenses and apartment renovation reserve` })) }), bills: async () => ({ bills: bills.map((bill) => ({ ...bill, billerName: `${bill.billerName} — annual residential maintenance and emergency support agreement` })), sources: { plaid: { state: "ok" } } }), snapshot: async () => ({ ...snapshot, transactions: transactions.map((item) => ({ ...item, merchant: `${item.merchant} — neighborhood cooperative and community market` })) }) };
  if (value === "large-summary") return { ...base, snapshot: async () => ({ ...snapshot, window: { ...snapshot.window, totalTransactions: 5_001, returnedTransactions: 250, clipped: true } }) };
  return base;
}

function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }
function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <main className="money-overview-specimen" id="main-content"><header className="money-overview-specimen__controls"><div><strong>Money overview qualification</strong><span>Synthetic, sanitized records · no product or provider mutation</span></div><KoraSelect label="Money fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={["/life/finances"]}><QueryClientProvider client={client}><ViewBarProvider><SyntheticAmountPrivacy hidden={fixture === "amounts-hidden"} /><ViewBar /><FinancesWorkspace onAskKora={() => undefined} loaders={loadersFor(fixture)} requestKey={fixture} /></ViewBarProvider></QueryClientProvider></MemoryRouter></main>;
}
createRoot(document.getElementById("root")!).render(<Specimen />);
