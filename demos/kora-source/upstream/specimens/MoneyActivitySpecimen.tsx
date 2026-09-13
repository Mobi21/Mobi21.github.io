import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../components/collections.css";
import "../features/life/money-activity.css";
import "./money-activity-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import { MoneyActivityWorkspace, type MoneyActivityLoaders } from "../features/life/MoneyActivityWorkspace";
import type { FinanceAccount, FinanceReceipt, FinanceTransaction, FinanceTransactionQuery } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = ["large-current", "all-loaded-large", "one-current", "twelve-current", "posted-pending", "last-confirmed", "ambiguous-evidence", "no-evidence", "partial-evidence", "batch-partial", "partial-source", "amounts-hidden", "long-copy", "detail-exact", "detail-conflict", "detail-gone", "missing-candidate-details", "empty", "query-error", "next-page-error", "loading"] as const;
type Fixture = typeof fixtures[number];
const requested = new URLSearchParams(window.location.search).get("fixture") as Fixture | null;
  const requestedTransaction = new URLSearchParams(window.location.search).get("transaction");
  const requestedView = new URLSearchParams(window.location.search).get("view");
const fixture: Fixture = requested && fixtures.includes(requested) ? requested : "large-current";
const generatedAt = "2026-08-27T12:00:00.000Z";
const accounts: FinanceAccount[] = [
  { accountId: "checking", connectionId: "connection-1", providerAccountId: "provider-checking", name: "Everyday checking", type: "depository", currency: "USD", balanceMinor: 659_650, updatedAt: "2026-08-27T10:42:00.000Z" },
  { accountId: "credit", connectionId: "connection-1", providerAccountId: "provider-credit", name: "Prime Visa", type: "credit", currency: "USD", balanceMinor: -92_140, updatedAt: "2026-08-27T10:42:00.000Z" },
];
const merchantProfiles = [
  { merchant: "Neighborhood market", category: "Groceries", direction: "outflow" as const, description: "Weekly groceries" },
  { merchant: "Local bakery", category: "Dining", direction: "outflow" as const, description: "Team breakfast" },
  { merchant: "City utilities", category: "Utilities", direction: "outflow" as const, description: "Monthly utilities" },
  { merchant: "Corner café", category: "Dining", direction: "outflow" as const, description: "Coffee and pastry" },
  { merchant: "Studio payroll", category: "Income", direction: "inflow" as const, description: "Studio payroll deposit" },
  { merchant: "Northline transit", category: "Transit", direction: "outflow" as const, description: "Commuter fare" },
  { merchant: "Riverside pharmacy", category: "Health", direction: "outflow" as const, description: "Prescription refill" },
  { merchant: "Riverside Residents Building Maintenance and Emergency Repair Cooperative", category: "Housing", direction: "outflow" as const, description: "Building maintenance" },
] as const;
const categories = [...new Set(merchantProfiles.map(({ category }) => category))];
const transactions: FinanceTransaction[] = Array.from({ length: 5_004 }, (_, index) => {
  const occurredAt = new Date(Date.parse(generatedAt) - index * 6 * 60_000).toISOString();
  const profile = merchantProfiles[index % merchantProfiles.length];
  const missingMerchant = index % 47 === 0;
  const inflow = profile.direction === "inflow";
  const account = accounts[index % accounts.length];
  return { id: `txn-${String(5_004 - index).padStart(5, "0")}`, connectionId: account.connectionId, providerTransactionId: `provider-txn-${5_004 - index}`, accountId: account.accountId, accountName: account.name, accountType: account.type, amountMinor: inflow ? -(75_000 + index % 220_000) : 875 + (index * 173) % 38_000, currency: "USD", merchant: missingMerchant ? null : profile.merchant, description: missingMerchant ? "Unidentified transaction" : profile.description, note: index % 31 === 0 ? `Reimbursable activity ${index + 1}` : "", category: index === 200 ? null : profile.category, evidenceState: index === 0 || index === 200 ? "needs_review" : index === 1 ? "matched" : "none", freshness: index > 4_900 ? "last_confirmed" : "current", lastSyncedAt: generatedAt, occurredAt, pending: index < 8, updatedAt: occurredAt };
});
// Receipt-review examples are deliberately coherent test-only records: two similar purchases require a human decision.
Object.assign(transactions[0], { merchant: "Neighborhood market", description: "Weekly groceries", amountMinor: 8_450, category: "Groceries", pending: false });
Object.assign(transactions[8], { merchant: "Neighborhood market", description: "Household supplies", amountMinor: 8_490, category: "Groceries", accountId: accounts[1].accountId, accountName: accounts[1].name, accountType: accounts[1].type, pending: false });
Object.assign(transactions[1], { merchant: "Local bakery", description: "Team breakfast", amountMinor: 3_600, category: "Dining", pending: false });
function typedCandidate(transaction: FinanceTransaction, confidence: "high" | "medium" | "low", reasons: string[]) {
  return { transactionId: transaction.id, confidence, reasons, merchant: transaction.merchant, amountMinor: transaction.amountMinor, currency: transaction.currency, occurredAt: transaction.occurredAt, accountName: transaction.accountName };
}
const receipts: FinanceReceipt[] = [
  { id: "receipt-review", gmailMessageId: "message-review", subject: "Your neighborhood market receipt", sender: "receipts@market.example", extractedMerchant: "Neighborhood market", extractedAmountMinor: 8_470, extractedCurrency: "USD", extractedDate: "2026-08-27", extractionConfidence: "medium", matchState: "ambiguous", matchConfidence: "medium", candidateTransactionIds: [transactions[0].id, transactions[8].id], candidates: [typedCandidate(transactions[0], "medium", ["The amounts differ by 20 minor currency units.", "The normalized merchant names overlap.", "The purchase dates are within one day."]), typedCandidate(transactions[8], "medium", ["The amounts differ by 20 minor currency units.", "The normalized merchant names overlap.", "The purchase dates are within one day."])], reviewedByUser: false, updatedAt: generatedAt },
  { id: "receipt-linked", gmailMessageId: "message-linked", subject: "Local bakery order", sender: "orders@bakery.example", extractedMerchant: "Local bakery", extractedAmountMinor: 3_600, extractedCurrency: "USD", extractedDate: "2026-08-27", extractionConfidence: "high", matchState: "matched", matchConfidence: "high", matchedTransactionId: transactions[1].id, candidateTransactionIds: [transactions[1].id], candidates: [typedCandidate(transactions[1], "high", ["Merchant, amount, and purchase date match the receipt."])], reviewedByUser: true, updatedAt: generatedAt },
  { id: "receipt-beyond-200", gmailMessageId: "message-beyond-200", subject: "Activity outside the first receipt batch", sender: "receipts@example.test", extractedMerchant: transactions[200].merchant, extractionConfidence: "medium", matchState: "ambiguous", matchConfidence: "low", candidateTransactionIds: [transactions[200].id], candidates: [typedCandidate(transactions[200], "low", ["Merchant matches; the receipt amount and date could not be extracted."])], reviewedByUser: false, updatedAt: generatedAt },
];
const source = fixture === "partial-source" || fixture === "last-confirmed" ? { plaid: { state: "partial" as const, unavailableSources: ["latest activity"] }, gmail: { state: "ok" as const } } : fixture === "partial-evidence" ? { plaid: { state: "ok" as const }, gmail: { state: "partial" as const, unavailableSources: ["gmail"] } } : { plaid: { state: "ok" as const }, gmail: { state: "ok" as const } };
const fixtureTransactions = fixture === "one-current" ? transactions.slice(0, 1) : fixture === "twelve-current" || fixture === "posted-pending" ? transactions.slice(0, 12) : fixture === "last-confirmed" ? transactions.slice(0, 12).map((item) => ({ ...item, freshness: "last_confirmed" as const, lastSyncedAt: "2026-08-19T10:42:00.000Z" })) : fixture === "empty" ? [] : fixture === "long-copy" ? transactions.slice(0, 12).map((item, index) => ({ ...item, merchant: `${item.merchant ?? "Untitled transaction"} — Riverside Community Cooperative, household membership ${index + 1}`, accountName: `${item.accountName} — joint household expenses and apartment renovation reserve` })) : transactions;
const fixtureAccounts = fixture === "long-copy" ? accounts.map((item) => ({ ...item, name: `${item.name} — joint household expenses and apartment renovation reserve` })) : accounts;

function page(input: FinanceTransactionQuery) {
  if (fixture === "query-error") return Promise.reject(new Error("Synthetic transaction query failure"));
  if (fixture === "next-page-error" && input.cursor) return Promise.reject(new Error("Synthetic next page failure"));
  if (fixture === "loading") return new Promise<never>(() => undefined);
  let filtered = fixtureTransactions;
  if (input.transactionId) filtered = filtered.filter((item) => item.id === input.transactionId);
  if (input.accountId) filtered = filtered.filter((item) => item.accountId === input.accountId);
  if (input.query) { const query = input.query.toLowerCase(); filtered = filtered.filter((item) => `${item.merchant ?? ""} ${item.description ?? ""} ${item.accountName} ${item.note ?? ""}`.toLowerCase().includes(query)); }
  else if (input.merchant) filtered = filtered.filter((item) => (item.merchant ?? "").toLowerCase().includes(input.merchant!.toLowerCase()));
  if (input.direction === "inflow") filtered = filtered.filter((item) => item.amountMinor < 0);
  if (input.direction === "outflow") filtered = filtered.filter((item) => item.amountMinor > 0);
  if (input.pending === "only") filtered = filtered.filter((item) => item.pending);
  if (input.pending === "exclude") filtered = filtered.filter((item) => !item.pending);
  if (input.fromDate) filtered = filtered.filter((item) => item.occurredAt >= input.fromDate!);
  if (input.toDate) filtered = filtered.filter((item) => item.occurredAt <= input.toDate!);
  if (input.category === "uncategorized") filtered = filtered.filter((item) => !item.category?.trim());
  else if (input.category) filtered = filtered.filter((item) => item.category === input.category);
  if (input.evidence && input.evidence !== "all") filtered = filtered.filter((item) => item.evidenceState === input.evidence);
  if (input.freshness && input.freshness !== "all") filtered = filtered.filter((item) => item.freshness === input.freshness);
  const needsReviewTotal = filtered.filter((item) => !item.category?.trim() || item.evidenceState === "needs_review").length;
  if (input.review === "only") filtered = filtered.filter((item) => !item.category?.trim() || item.evidenceState === "needs_review");
  filtered = [...filtered].sort((left, right) => input.sort === "oldest" ? left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id) : input.sort === "amount_desc" ? right.amountMinor - left.amountMinor || right.id.localeCompare(left.id) : input.sort === "amount_asc" ? left.amountMinor - right.amountMinor || left.id.localeCompare(right.id) : right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  const total = filtered.length, offset = Number(input.cursor ?? 0), size = input.pageSize ?? 100, items = filtered.slice(offset, offset + size), complete = offset + items.length >= total;
  return Promise.resolve({ items, ...(complete ? {} : { cursor: String(offset + items.length) }), complete, total, needsReviewTotal, categories, sources: source });
}

const loaders: MoneyActivityLoaders = {
  accounts: async () => ({ accounts: fixtureAccounts, sources: source }),
  transactions: page,
  receipts: async (input) => { if (fixture === "batch-partial" && input?.transactionIds?.includes(transactions[200].id)) throw new Error("Synthetic receipt batch failure"); const available = fixture === "no-evidence" || fixture === "partial-evidence" ? [] : fixture === "missing-candidate-details" ? receipts.map((receipt) => receipt.id === "receipt-review" ? { ...receipt, candidates: undefined } : receipt) : receipts; return { items: input?.transactionIds?.length ? available.filter((receipt) => input.transactionIds!.some((id) => receipt.matchedTransactionId === id || receipt.candidateTransactionIds.includes(id))) : available, complete: fixture !== "partial-evidence", sources: { ...source, gmail: fixture === "partial-evidence" ? { state: "partial", unavailableSources: ["gmail"] } : { state: "ok" } } }; },
  context: async () => ({ generatedAt, viewerTimeZone: "America/New_York" }),
  updateAnnotation: async (_id, input) => fixture === "detail-conflict"
    ? { status: "conflict", current: { note: "Saved by another Money view", category: "Household", version: 3, updatedAt: generatedAt } }
    : { status: "settled", annotation: { note: input.note, category: input.category ?? null, version: input.expectedVersion + 1, updatedAt: generatedAt }, history: [] },
  resolveReceipt: async (id, input) => ({ status: "settled", receipt: { ...receipts.find((receipt) => receipt.id === id)!, matchState: input.action === "confirm_match" ? "matched" : "unmatched", matchedTransactionId: input.transactionId ?? null, reviewedByUser: true, version: input.expectedVersion + 1 }, sources: {} }),
};
function choose(next: string) { const query = new URLSearchParams(window.location.search); query.set("fixture", next); window.location.search = query.toString(); }
function Specimen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaultTransaction = fixture === "detail-exact" || fixture === "detail-conflict" ? fixtureTransactions[0]?.id : fixture === "detail-gone" ? "gone-transaction" : undefined;
  const routeQuery = new URLSearchParams({
    ...(fixture !== "empty" && fixture !== "query-error" && fixture !== "loading" ? { range: "all" } : {}),
    ...(requestedView === "review" ? { view: "review" } : {}),
  });
  const transactionId = requestedTransaction ?? defaultTransaction;
  const initialRoute = `/life/finances/activity${transactionId ? `/${encodeURIComponent(transactionId)}` : ""}${routeQuery.size ? `?${routeQuery}` : ""}`;
  return <main className="money-activity-specimen" id="main-content"><header className="money-activity-specimen__controls"><div><strong>Money activity qualification</strong><span>{fixtureTransactions.length.toLocaleString()} synthetic records · no product or provider mutation</span></div><KoraSelect label="Activity fixture" value={fixture} options={fixtures.map((value) => ({ value, label: value.replaceAll("-", " ") }))} onValueChange={choose} /></header><MemoryRouter initialEntries={[initialRoute]}><QueryClientProvider client={client}><ViewBarProvider><SyntheticAmountPrivacy hidden={fixture === "amounts-hidden"} /><ViewBar /><Routes><Route path="/life/finances/activity/:transactionId?" element={<MoneyActivityWorkspace onAskKora={() => undefined} loaders={loaders} requestKey={fixture} />} /></Routes></ViewBarProvider></QueryClientProvider></MemoryRouter></main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
