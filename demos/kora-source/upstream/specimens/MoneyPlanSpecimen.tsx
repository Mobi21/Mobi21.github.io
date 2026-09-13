import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "../components/workspace.css";
import "../features/life/money-plan.css";
import "./money-plan-specimen.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";
import { KoraSelect } from "../components/primitives";
import {
  MoneyPlanWorkspace,
  type PlanLoaders,
} from "../features/life/MoneyPlanWorkspace";
import type {
  FinanceAllowance,
  FinanceAllowanceSettings,
  FinanceBudget,
  FinanceGoal,
  FinanceSources,
} from "../lib/runtime";
import { RuntimeRequestError } from "../lib/runtime";
import { SyntheticAmountPrivacy } from "./SyntheticAmountPrivacy";

const fixtures = [
  "populated",
  "hidden",
  "empty",
  "archived-only",
  "partial",
  "partial-zero",
  "provider-unavailable",
  "allowance-error",
  "missing-values",
  "section-error",
  "conflict",
  "save-error",
  "goal-error",
  "long-copy",
  "multiple-currencies",
  "target-detail",
  "loading",
  "unavailable",
] as const;
type Fixture = (typeof fixtures)[number];
const requested = new URLSearchParams(window.location.search).get(
  "fixture",
) as Fixture | null;
const fixture: Fixture =
  requested && fixtures.includes(requested) ? requested : "populated";
const generatedAt = "2026-08-27T12:00:00.000Z";
const currentSources: FinanceSources = { plaid: { state: "ok" } };
const partialSources: FinanceSources = {
  plaid: { state: "partial", unavailableSources: ["credit activity"] },
};
const sources =
  fixture === "partial" || fixture === "partial-zero"
    ? partialSources
    : fixture === "provider-unavailable"
      ? {
          plaid: {
            state: "unavailable" as const,
            unavailableSources: ["plaid"],
          },
        }
      : currentSources;
const allowance: FinanceAllowance = {
  generatedAt,
  viewerTimeZone: "America/New_York",
  currency: "USD",
  includedAccountIds: ["checking"],
  usedDepositoryFallback: false,
  availableBalanceMinor: 659_650,
  upcomingObligationsMinor: 145_000,
  incomeExpectedMinor: 325_000,
  bufferMinor: 75_000,
  dailyFloorMinor: 150_000,
  monthToDateOutflowMinor: 35_225,
  remainingDays: 5,
  planningRemainderMinor: 289_650,
  dailyAllowanceMinor: 57_930,
  status: "within_plan",
  isNonPositive: false,
  explanation:
    "$6,596.50 confirmed cash, expected income, obligations, protected floor, and buffer leave $579.30 per day through the current horizon.",
  sources,
};
const settings: FinanceAllowanceSettings = {
  includedAccountIds: ["checking"],
  dailyFloorMinor: 150_000,
  bufferMinor: 75_000,
  obligationHorizonDays: 30,
  updatedAt: generatedAt,
  version: 4,
  sources,
};
const never = () => new Promise<never>(() => undefined);
const reject = async () => {
  throw new Error("Synthetic plan read failure");
};

function makeLoaders(): PlanLoaders {
  if (fixture === "loading")
    return {
      allowance: never,
      settings: never,
      accounts: never,
      budgets: never,
      goals: never,
      updateSettings: never,
      createGoal: never,
      updateBudget: never,
      updateGoal: never,
    };
  if (fixture === "unavailable")
    return {
      allowance: reject,
      settings: reject,
      accounts: reject,
      budgets: reject,
      goals: reject,
      updateSettings: reject,
      createGoal: reject,
      updateBudget: reject,
      updateGoal: reject,
    };
  let settingsReads = 0;
  let archivedBudgets: FinanceBudget[] = fixture === "archived-only"
    ? [
        {
          id: "budget-archived-home",
          displayName: "Earlier home allocation",
          periodKind: "monthly",
          category: "Home",
          targetAmountMinor: 80_000,
          currency: "USD",
          state: "archived",
          updatedAt: generatedAt,
        },
        {
          id: "budget-archived-learning",
          displayName: "Earlier learning allocation",
          periodKind: "monthly",
          category: "Learning",
          targetAmountMinor: 15_000,
          currency: "USD",
          state: "archived",
          updatedAt: generatedAt,
        },
      ]
    : [];
  let archivedGoals: FinanceGoal[] = fixture === "archived-only"
    ? [
        {
          id: "goal-archived-buffer",
          displayName: "Earlier emergency buffer",
          goalKind: "savings",
          targetAmountMinor: 300_000,
          currentAmountMinor: 125_000,
          currency: "USD",
          linkedAccountIds: ["checking"],
          state: "archived",
          updatedAt: generatedAt,
        },
      ]
    : [];
  return {
    allowance: fixture === "allowance-error" ? reject : async () => allowance,
    settings: async () => {
      settingsReads += 1;
      return fixture === "conflict" && settingsReads > 1
        ? { ...settings, includedAccountIds: ["credit"], version: 5 }
        : settings;
    },
    accounts: async () => ({
      accounts: [
        {
          accountId: "checking",
          connectionId: "connection-1",
          providerAccountId: "provider-checking",
          name: "Everyday checking",
          type: "depository",
          currency: "USD",
          balanceMinor: 659_650,
          updatedAt: generatedAt,
        },
        {
          accountId: "credit",
          connectionId: "connection-1",
          providerAccountId: "provider-credit",
          name: "Prime Visa",
          type: "credit",
          currency: "USD",
          balanceMinor: -92_140,
          updatedAt: generatedAt,
        },
      ],
      sources,
    }),
    budgets:
      fixture === "section-error"
        ? reject
        : async (state = "active") => ({
            budgets:
              state === "archived" && fixture === "archived-only"
                ? archivedBudgets
                : state === "archived" || fixture === "empty" ||
              fixture === "partial-zero" ||
              fixture === "archived-only"
                ? []
                : [
                    {
                      id: "budget-home",
                      displayName: "Home essentials",
                      periodKind: "monthly",
                      category: "Home",
                      targetAmountMinor: 90_000,
                      currency: "USD",
                      state: "active",
                      updatedAt: generatedAt,
                    },
                    {
                      id: "budget-flex",
                      displayName: "Flexible spending",
                      periodKind: "monthly",
                      category: "Everyday",
                      targetAmountMinor: 42_500,
                      currency: "USD",
                      state: "active",
                      updatedAt: generatedAt,
                    },
                    {
                      id: "budget-learning",
                      displayName:
                        fixture === "long-copy"
                          ? "Professional certificate in architectural photography, documentary storytelling, and independent studio business management"
                          : "Learning and creative practice",
                      periodKind: "monthly",
                      category:
                        fixture === "long-copy"
                          ? "Personal learning, experimentation, and long-form creative practice"
                          : "Learning",
                      targetAmountMinor: 18_000,
                      currency:
                        fixture === "multiple-currencies" ? "EUR" : "USD",
                      state: "active",
                      updatedAt: generatedAt,
                    },
                  ],
            archivedCount: archivedBudgets.length,
            sources,
          }),
    goals:
      fixture === "section-error"
        ? reject
        : async (state = "active") => ({
            goals:
              state === "archived" && fixture === "archived-only"
                ? archivedGoals
                : state === "archived" || fixture === "empty" ||
              fixture === "partial-zero" ||
              fixture === "archived-only"
                ? []
                : [
                    {
                      id: "goal-buffer",
                      displayName: "Emergency buffer",
                      goalKind: "savings",
                      targetAmountMinor: 500_000,
                      currentAmountMinor: 210_000,
                      currency: "USD",
                      linkedAccountIds: ["checking"],
                      periodEnd: "2027-02-01",
                      state: "active",
                      updatedAt: generatedAt,
                    },
                    {
                      id: "goal-debt",
                      displayName: "Pay down Prime Visa",
                      goalKind: "debt_payoff",
                      targetAmountMinor:
                        fixture === "missing-values" ? undefined : 180_000,
                      currentAmountMinor:
                        fixture === "missing-values" ? undefined : 87_860,
                      currency:
                        fixture === "multiple-currencies" ? "EUR" : "USD",
                      linkedAccountIds: ["credit"],
                      periodEnd: "2027-04-01",
                      state: "active",
                      updatedAt: generatedAt,
                    },
                  ],
            archivedCount: archivedGoals.length,
            sources,
          }),
    updateSettings:
      fixture === "conflict"
        ? async () => {
            throw new RuntimeRequestError(
              "The saved version no longer matches.",
              {
                code: "conflict",
                status: 409,
              },
            );
          }
        : fixture === "save-error"
          ? async () => {
              throw new Error("Synthetic settings save failure");
            }
          : async (input) => ({
              ...settings,
              ...input,
              updatedAt: generatedAt,
              version: settings.version + 1,
            }),
    createGoal:
      fixture === "goal-error"
        ? async () => {
            throw new Error("Synthetic goal creation failure");
          }
        : async (input) => ({
            id: "goal-new",
            ...input,
            linkedAccountIds: [],
            state: "active",
            updatedAt: generatedAt,
          }),
    updateBudget: async (id, changes, expectedUpdatedAt) => {
      const record = archivedBudgets.find((item) => item.id === id);
      if (!record || record.updatedAt !== expectedUpdatedAt)
        throw new RuntimeRequestError("The archived allocation changed.", { code: "conflict", status: 409 });
      if (changes.state === "active") archivedBudgets = archivedBudgets.filter((item) => item.id !== id);
      return { ...record, state: changes.state ?? record.state, updatedAt: "2026-08-27T12:01:00.000Z" };
    },
    updateGoal: async (id, changes, expectedUpdatedAt) => {
      const record = archivedGoals.find((item) => item.id === id);
      if (!record || record.updatedAt !== expectedUpdatedAt)
        throw new RuntimeRequestError("The archived goal changed.", { code: "conflict", status: 409 });
      if (changes.state === "active") archivedGoals = archivedGoals.filter((item) => item.id !== id);
      return { ...record, state: changes.state ?? record.state, updatedAt: "2026-08-27T12:01:00.000Z" };
    },
  };
}

function choose(next: string) {
  const query = new URLSearchParams(window.location.search);
  query.set("fixture", next);
  window.location.search = query.toString();
}

function Specimen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <main className="money-plan-specimen" id="main-content">
      <header className="money-plan-specimen__controls">
        <div>
          <strong>Money plan qualification</strong>
          <span>
            Synthetic local plan records · no product or provider mutation
          </span>
        </div>
        <KoraSelect
          label="Plan fixture"
          value={fixture}
          options={fixtures.map((value) => ({
            value,
            label: value.replaceAll("-", " "),
          }))}
          onValueChange={choose}
        />
      </header>
      <MemoryRouter initialEntries={[
        fixture === "archived-only"
          ? "/life/finances/plan?view=archived"
          : fixture === "target-detail"
            ? "/life/finances/plan/targets/goal-buffer"
          : "/life/finances/plan",
      ]}>
        <QueryClientProvider client={client}>
          <ViewBarProvider>
            <SyntheticAmountPrivacy hidden={fixture === "hidden"} />
            <ViewBar />
            <Routes>
              <Route path="/life/finances/plan" element={<MoneyPlanWorkspace onAskKora={() => undefined} loaders={makeLoaders()} requestKey={fixture} />} />
              <Route path="/life/finances/plan/targets/:targetId" element={<MoneyPlanWorkspace onAskKora={() => undefined} loaders={makeLoaders()} requestKey={fixture} />} />
            </Routes>
          </ViewBarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Specimen />);
