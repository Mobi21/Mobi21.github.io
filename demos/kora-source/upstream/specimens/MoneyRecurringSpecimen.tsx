import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/money-recurring.css";
import "./money-recurring-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { MoneyRecurringWorkspace, type RecurringLoaders } from "../features/life/MoneyRecurringWorkspace";
import { RuntimeRequestError, type FinanceAccount, type FinanceBill, type FinanceSources, type FinanceSubscription } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = ["populated", "amount-variation", "hidden", "empty", "loading", "partial", "provider-unavailable", "exact-partial", "uncertain", "paused-archived", "conflict", "clipped", "large-list", "page-error", "long-copy", "gone", "unavailable"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "populated";
const current: FinanceSources = { plaid: { state: "ok" } };
const partial: FinanceSources = { plaid: { state: "partial", unavailableSources: ["latest activity"] } };
const unavailable: FinanceSources = { plaid: { state: "unavailable" } };
const sources = fixture === "partial" ? partial : fixture === "provider-unavailable" ? unavailable : current;
const updatedAt = "2026-08-27T12:00:00.000Z";
const viewerTimeZone = "America/New_York";
const evidence = [{ actionKey: "observed-1", evidenceKind: "installment_settlement" as const, receiptId: "receipt-1", transactionId: "transaction-1", details: { previousRemaining: 3, remaining: 2 }, createdAt: "2026-08-18T15:00:00.000Z", observedAmountMinor: 17_900, observedCurrency: "USD", observedAt: "2026-07-18T15:00:00.000Z" }, { actionKey: "observed-2", evidenceKind: "installment_settlement" as const, receiptId: "receipt-2", transactionId: "transaction-2", details: { previousRemaining: 2, remaining: 1 }, createdAt: "2026-08-25T15:00:00.000Z", observedAmountMinor: 19_100, observedCurrency: "USD", observedAt: "2026-08-25T15:00:00.000Z" }];
const accounts: FinanceAccount[] = [
  { accountId: "checking", connectionId: "connection", providerAccountId: "provider-checking", name: "Everyday checking", type: "depository", currency: "USD", balanceMinor: 659_650, updatedAt },
  { accountId: "euro-card", connectionId: "connection", providerAccountId: "provider-euro", name: "European travel card", type: "credit", currency: "EUR", balanceMinor: -82_000, updatedAt },
];
const baseBills: FinanceBill[] = [
  { id: "rent", billerName: "Rent", expectedAmountMinor: 145_000, category: "Housing", dueRule: "day:1", accountId: "checking", accountName: "Everyday checking", currency: "USD", autopayState: "enabled", nextExpectedAt: "2026-09-01T03:59:59.999Z", installmentsTotal: null, installmentsRemaining: null, provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt },
  { id: "studio", billerName: "Studio equipment installment", expectedAmountMinor: null, expectedAmountMinMinor: 17_500, expectedAmountMaxMinor: 19_500, category: "Equipment", dueRule: "day:29", accountId: "checking", accountName: "Everyday checking", currency: "USD", nextExpectedAt: "2026-08-29T03:59:59.999Z", installmentsTotal: 4, installmentsRemaining: 2, provenance: "receipt:receipt-1", reconciliationEvidence: evidence, state: "active", updatedAt },
];
const baseSubscriptions: FinanceSubscription[] = [
  { id: "music", merchantName: "Music subscription", accountId: "checking", accountName: "Everyday checking", currency: "USD", cadence: "monthly", expectedAmountMinor: 1_199, category: "Media", lastSeenDate: "2026-08-19T12:00:00.000Z", nextExpectedAt: "2026-09-19T12:00:00.000Z", provenance: "receipt:receipt-music", reconciliationEvidence: [], state: "active", updatedAt },
  { id: "language", merchantName: fixture === "long-copy" ? "International Language and Cultural Exchange Cooperative — family membership with weekly conversation workshops" : "Language learning", accountId: "euro-card", accountName: "European travel card", currency: "EUR", cadence: "annual", expectedAmountMinor: 8_900, lastSeenDate: "2026-02-10T12:00:00.000Z", nextExpectedAt: "2027-02-10T12:00:00.000Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt },
];
const reject = async () => { throw new Error("Synthetic recurring failure"); };
const rejectConflict = async () => { throw new RuntimeRequestError("This saved record has a newer revision.", { code: "conflict", status: 409 }); };
const pending = async () => new Promise<never>(() => undefined);
function data() {
  if (fixture === "empty") return { bills: [] as FinanceBill[], subscriptions: [] as FinanceSubscription[] };
  if (fixture === "uncertain") return { bills: [{ ...baseBills[0], id: "unknown", billerName: "Amount without linked currency", accountId: null, accountName: null, currency: null, dueRule: null, nextExpectedAt: null }], subscriptions: [] as FinanceSubscription[] };
  if (fixture === "paused-archived") return { bills: [{ ...baseBills[0], state: "paused" }, { ...baseBills[1], state: "completed" }], subscriptions: [{ ...baseSubscriptions[0], state: "archived" }] };
  if (fixture === "large-list" || fixture === "page-error") return { bills: Array.from({ length: 205 }, (_, index) => ({ ...baseBills[index % baseBills.length]!, id: `bill-${String(index + 1).padStart(3, "0")}`, billerName: `Household expectation ${index + 1}`, nextExpectedAt: new Date(Date.UTC(2026, 7, 28 + (index % 28), 12)).toISOString() })), subscriptions: baseSubscriptions };
  return { bills: baseBills, subscriptions: baseSubscriptions };
}
function makeLoaders(): RecurringLoaders {
  if (fixture === "loading") return { bills: pending, subscriptions: pending, recurring: pending, bill: pending, subscription: pending, accounts: pending, createBill: pending, updateBill: pending, createSubscription: pending, updateSubscription: pending };
  if (fixture === "unavailable") return { bills: reject, subscriptions: reject, recurring: reject, bill: reject, subscription: reject, accounts: reject, createBill: reject, updateBill: reject, createSubscription: reject, updateSubscription: reject };
  const rows = data(); const readBills = async () => ({ bills: rows.bills, archivedCount: rows.bills.filter((row) => row.state === "archived").length, complete: fixture !== "clipped" && fixture !== "large-list", viewerTimeZone, sources }); const readSubscriptions = async () => ({ subscriptions: rows.subscriptions, archivedCount: rows.subscriptions.filter((row) => row.state === "archived").length, complete: true, viewerTimeZone, sources });
  return {
    bills: readBills, subscriptions: readSubscriptions,
    recurring: async (input) => {
      if (fixture === "page-error" && input.cursor) return reject();
      const query = input.query?.toLowerCase();
      const combined = [
        ...rows.bills.map((row) => ({ kind: "bill" as const, row })),
        ...rows.subscriptions.map((row) => ({ kind: "subscription" as const, row })),
      ].filter((item) => (!input.state || item.row.state === input.state) && (!query || (item.kind === "bill" ? item.row.billerName : item.row.merchantName).toLowerCase().includes(query)));
      const pageSize = input.pageSize ?? 50;
      const start = Number(input.cursor?.replace("spec-recurring-", "") ?? 0);
      const page = combined.slice(start, start + pageSize);
      const complete = start + pageSize >= combined.length;
      return { bills: page.filter((item) => item.kind === "bill").map((item) => item.row as FinanceBill), subscriptions: page.filter((item) => item.kind === "subscription").map((item) => item.row as FinanceSubscription), archivedCount: combined.filter((item) => item.row.state === "archived").length, complete, cursor: complete ? undefined : `spec-recurring-${start + pageSize}`, total: combined.length, viewerTimeZone, sources };
    },
    bill: async (id) => fixture === "exact-partial" && id === "external" ? ({ bills: [{ ...baseBills[0], id: "external", billerName: "Exact record with partial coverage" }], archivedCount: 0, complete: false, viewerTimeZone: "Pacific/Honolulu", sources: partial }) : ({ ...(await readBills()), bills: rows.bills.filter((row) => row.id === id) }),
    subscription: async (id) => ({ ...(await readSubscriptions()), subscriptions: rows.subscriptions.filter((row) => row.id === id) }),
    accounts: async () => ({ accounts, sources }),
    createBill: async (input) => ({ id: "created-bill", billerName: input.billerName, expectedAmountMinor: input.expectedAmountMinor, expectedAmountMinMinor: input.expectedAmountMinMinor, expectedAmountMaxMinor: input.expectedAmountMaxMinor, category: input.category, dueRule: input.dueRule, accountId: input.accountId, accountName: accounts.find((item) => item.accountId === input.accountId)?.name, currency: accounts.find((item) => item.accountId === input.accountId)?.currency, nextExpectedAt: "2026-09-01T03:59:59.999Z", provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt }),
    updateBill: fixture === "conflict" ? rejectConflict : async (_id, changes) => ({ ...baseBills[0], ...changes, updatedAt }),
    createSubscription: async (input) => ({ id: "created-subscription", merchantName: input.merchantName, expectedAmountMinor: input.expectedAmountMinor, expectedAmountMinMinor: input.expectedAmountMinMinor, expectedAmountMaxMinor: input.expectedAmountMaxMinor, category: input.category, accountId: input.accountId, accountName: accounts.find((item) => item.accountId === input.accountId)?.name, currency: accounts.find((item) => item.accountId === input.accountId)?.currency, cadence: input.cadence, lastSeenDate: input.lastSeenDate, nextExpectedAt: null, provenance: "user:confirmed", reconciliationEvidence: [], state: "active", updatedAt }),
    updateSubscription: fixture === "conflict" ? rejectConflict : async (_id, changes) => ({ ...baseSubscriptions[0], ...changes, updatedAt }),
  };
}
function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }
function Specimen() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const entry = fixture === "gone" ? "/life/finances/recurring/bill/missing" : fixture === "exact-partial" ? "/life/finances/recurring/bill/external" : fixture === "amount-variation" ? "/life/finances/recurring/bill/studio" : fixture === "page-error" ? "/life/finances/recurring?recurringPageCursor=synthetic-failure&recurringPageHistory=~" : "/life/finances/recurring"; return <main className="money-recurring-specimen" id="main-content"><header className="money-recurring-specimen__controls"><div><strong>Money recurring qualification</strong><span>Synthetic local records · no product or provider mutation</span></div><KoraSelect label="Recurring fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><ViewBarProvider><SyntheticAmountPrivacy hidden={fixture === "hidden"} /><ViewBar /><div className="life-stage"><Routes><Route path="/life/finances/recurring/:recordKind?/:recordId?" element={<MoneyRecurringWorkspace onAskKora={() => undefined} loaders={makeLoaders()} requestKey={fixture} now={new Date("2026-08-27T12:00:00.000Z")} />} /></Routes></div></ViewBarProvider></QueryClientProvider></MemoryRouter></main>; }
createRoot(document.getElementById("root")!).render(<Specimen />);
