import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CircleAlert,
  Eye,
  EyeOff,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAmountPrivacy } from "../../app/amount-privacy";
import {
  Badge,
  Button,
  CheckboxChoice,
  Field,
  Input,
  KoraSelect,
  PageFrame,
  PageHeader,
  RadioGroup,
  Sheet,
  StateNotice,
} from "../../components/primitives";
import {
  runtime,
  RuntimeRequestError,
  type ConversationContextReference,
  type FinanceAccount,
  type FinanceAllowance,
  type FinanceAllowanceSettings,
  type FinanceBudget,
  type FinanceGoal,
  type FinanceSources,
} from "../../lib/runtime";
import { MoneyNavigation } from "./MoneyNavigation";
import "./money-plan.css";

type Ask = (reference?: ConversationContextReference, draft?: string) => void;
export type PlanLoaders = {
  allowance: () => Promise<FinanceAllowance>;
  settings: () => Promise<FinanceAllowanceSettings>;
  accounts: () => Promise<{
    accounts: FinanceAccount[];
    sources: FinanceSources;
  }>;
  budgets: (state?: "active" | "archived") => Promise<{
    budgets: FinanceBudget[];
    archivedCount: number;
    sources: FinanceSources;
  }>;
  goals: (state?: "active" | "archived") => Promise<{
    goals: FinanceGoal[];
    archivedCount: number;
    sources: FinanceSources;
  }>;
  updateSettings: (input: {
    includedAccountIds?: string[];
    dailyFloorMinor?: number;
    bufferMinor?: number;
    obligationHorizonDays?: number;
    expectedVersion: number;
  }) => Promise<FinanceAllowanceSettings>;
  createGoal: (input: {
    displayName: string;
    goalKind: "savings" | "debt_payoff" | "business_revenue" | "custom";
    targetAmountMinor?: number;
    currentAmountMinor?: number;
    currency: string;
    periodEnd?: string;
  }) => Promise<FinanceGoal>;
  updateBudget: (
    id: string,
    changes: Partial<FinanceBudget>,
    expectedUpdatedAt: string,
  ) => Promise<FinanceBudget>;
  updateGoal: (
    id: string,
    changes: Partial<FinanceGoal>,
    expectedUpdatedAt: string,
  ) => Promise<FinanceGoal>;
};

const liveLoaders: PlanLoaders = {
  allowance: runtime.financeAllowance,
  settings: runtime.financeAllowanceSettings,
  accounts: runtime.financeAccounts,
  budgets: runtime.financeBudgets,
  goals: runtime.financeGoals,
  updateSettings: runtime.updateFinanceAllowanceSettings,
  createGoal: runtime.createFinanceGoal,
  updateBudget: runtime.updateFinanceBudget,
  updateGoal: runtime.updateFinanceGoal,
};

export function MoneyPlanWorkspace({
  onAskKora,
  loaders = liveLoaders,
  requestKey = "live",
}: {
  onAskKora: Ask;
  loaders?: PlanLoaders;
  requestKey?: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { targetId: routeTargetId } = useParams<{ targetId?: string }>();
  const [searchParams] = useSearchParams();
  const archiveView = searchParams.get("view") === "archived";
  const { amountsHidden, toggleAmounts } = useAmountPrivacy();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [recordEditorOpen, setRecordEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<
    | { kind: "allocation"; id: string }
    | { kind: "goal"; id: string }
    | null
  >(null);
  const recordEditTriggerRef = useRef<HTMLButtonElement>(null);
  const allocationHeadingRef = useRef<HTMLHeadingElement>(null);
  const goalHeadingRef = useRef<HTMLHeadingElement>(null);
  const archivedFromEditorRef = useRef<"allocation" | "goal" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const archiveHeadingRef = useRef<HTMLHeadingElement>(null);
  const openedRouteTarget = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (amountsHidden) {
      setSettingsOpen(false);
      setGoalOpen(false);
      setRecordEditorOpen(false);
    }
  }, [amountsHidden]);
  const allowance = useQuery({
    queryKey: ["money-plan", requestKey, "allowance"],
    queryFn: loaders.allowance,
  });
  const settings = useQuery({
    queryKey: ["money-plan", requestKey, "settings"],
    queryFn: loaders.settings,
  });
  const accounts = useQuery({
    queryKey: ["money-plan", requestKey, "accounts"],
    queryFn: loaders.accounts,
  });
  const budgets = useQuery({
    queryKey: ["money-plan", requestKey, "budgets", "active"],
    queryFn: () => loaders.budgets("active"),
  });
  const goals = useQuery({
    queryKey: ["money-plan", requestKey, "goals", "active"],
    queryFn: () => loaders.goals("active"),
  });
  const archivedBudgets = useQuery({
    queryKey: ["money-plan", requestKey, "budgets", "archived"],
    queryFn: () => loaders.budgets("archived"),
    enabled: archiveView,
  });
  const archivedGoals = useQuery({
    queryKey: ["money-plan", requestKey, "goals", "archived"],
    queryFn: () => loaders.goals("archived"),
    enabled: archiveView,
  });
  const restoreRecord = useMutation<
    FinanceBudget | FinanceGoal,
    Error,
    | { kind: "allocation"; value: FinanceBudget }
    | { kind: "goal"; value: FinanceGoal }
  >({
    mutationFn: (record: { kind: "allocation"; value: FinanceBudget } | { kind: "goal"; value: FinanceGoal }) =>
      record.kind === "allocation"
        ? loaders.updateBudget(record.value.id, { state: "active" }, record.value.updatedAt)
        : loaders.updateGoal(record.value.id, { state: "active" }, record.value.updatedAt),
    onMutate: () => {
      setRestoreError("");
      setAnnouncement("Restoring archived plan record.");
    },
    onSuccess: async (_value, record) => {
      await refresh();
      setAnnouncement(`${record.kind === "allocation" ? "Allocation" : "Goal"} restored to the current plan.`);
      requestAnimationFrame(() => archiveHeadingRef.current?.focus());
    },
    onError: () => {
      setRestoreError("This record changed or could not be restored. Refresh the archive and try again.");
      setAnnouncement("Plan record restore failed.");
    },
  });
  const pending = [allowance, settings, accounts, budgets, goals].some(
    (query) => query.isPending,
  );
  const failed = [allowance, settings, accounts, budgets, goals].every(
    (query) => query.isError,
  );
  const allowanceSource = allowance.data?.sources.plaid;
  const settingsSource = settings.data?.sources.plaid;
  const accountSource = accounts.data?.sources.plaid;
  const budgetSource = budgets.data?.sources.plaid;
  const goalSource = goals.data?.sources.plaid;
  const sourceState = combinedSourceState([
    allowanceSource?.state,
    settingsSource?.state,
    accountSource?.state,
    budgetSource?.state,
    goalSource?.state,
  ]);
  const supportedAllowance = allowance.data?.status === "unsupported" ? undefined : allowance.data;
  const allowanceCurrency = supportedAllowance?.currency ?? undefined;
  const guideQualified = Boolean(
    !allowance.isError &&
      !allowance.isPending &&
      supportedAllowance?.currency &&
      allowanceSource?.state === "ok",
  );
  const guideQualification = allowance.isError
    ? "Current read failed"
    : allowance.isPending
      ? "Source read in progress"
      : allowance.data?.status === "unsupported"
        ? "Currency boundary required"
        : !supportedAllowance?.currency
          ? "Currency unavailable"
          : sourceQualification(allowanceSource?.state);
  const sourceTime = settings.data?.updatedAt ?? allowance.data?.generatedAt;
  const sourceMeta =
    sourceState === "ok"
      ? `Local plan · Updated ${sourceTime ? shortTime(sourceTime, allowance.data?.viewerTimeZone) : "recently"}`
      : sourceState === "partial"
        ? `Local plan · partial coverage${sourceTime ? ` · Updated ${shortTime(sourceTime, allowance.data?.viewerTimeZone)}` : ""}`
        : sourceState === "unavailable"
          ? "Local plan · connected activity unavailable"
          : pending
            ? "Opening plan"
            : "Local plan";
  const period = allowance.data
    ? monthLabel(allowance.data.generatedAt, allowance.data.viewerTimeZone)
    : "Current plan";
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["money-plan", requestKey] });
  const canAskGuide = !amountsHidden && guideQualified;
  const canAskPlan =
    !amountsHidden &&
    [
      allowanceSource,
      settingsSource,
      accountSource,
      budgetSource,
      goalSource,
    ].every((item) => item?.state === "ok") &&
    !budgets.isError &&
    !goals.isError;

  const headerActions = (
        <>
          <Button
            tone="secondary"
            aria-label={amountsHidden ? "Show amounts" : "Hide amounts"}
            onClick={toggleAmounts}
          >
            {amountsHidden ? <Eye size={15} /> : <EyeOff size={15} />}
            <span className="money-plan-view-action__label">
              {amountsHidden ? "Show amounts" : "Hide amounts"}
            </span>
          </Button>
          {canAskGuide ? (
            <Button
              tone="secondary"
              aria-label="Explain guide with Kora"
              onClick={() =>
                onAskKora(
                  {
                    kind: "finance_record",
                    id: "allowance",
                    title: "Current planning guide",
                  },
                  "Explain this qualified planning guide and identify which recorded assumption has the largest effect. Do not change anything.",
                )
              }
            >
              <MessageCircleMore size={15} />
              <span className="money-plan-view-action__label">
                Explain guide
              </span>
            </Button>
          ) : null}
        </>
  );

  useEffect(() => {
    if (!routeTargetId || goals.isPending || openedRouteTarget.current === routeTargetId) return;
    openedRouteTarget.current = routeTargetId;
    archivedFromEditorRef.current = null;
    setEditingRecord({ kind: "goal", id: routeTargetId });
    setRecordEditorOpen(true);
  }, [goals.isPending, routeTargetId]);

  if (pending && !settings.data && !budgets.data && !goals.data)
    return <PlanLoading actions={headerActions} />;
  if (failed) return <PlanUnavailable actions={headerActions} onRetry={() => void refresh()} />;
  const activeBudgets = budgets.data?.budgets ?? [];
  const activeGoals = goals.data?.goals ?? [];
  const archivedBudgetCount = budgets.data?.archivedCount ?? 0;
  const archivedGoalCount = goals.data?.archivedCount ?? 0;
  const hasPlanRecords = activeBudgets.length > 0 || activeGoals.length > 0;
  const hasArchivedPlanRecords =
    archivedBudgetCount > 0 || archivedGoalCount > 0;
  const showEmptyStart =
    !budgets.isError &&
    !goals.isError &&
    !hasPlanRecords &&
    !hasArchivedPlanRecords;
  const selectedRecord:
    | { kind: "allocation"; value: FinanceBudget }
    | { kind: "goal"; value: FinanceGoal }
    | undefined = editingRecord?.kind === "allocation"
    ? (() => {
        const value = activeBudgets.find((budget) => budget.id === editingRecord.id);
        return value ? { kind: "allocation" as const, value } : undefined;
      })()
    : editingRecord?.kind === "goal"
      ? (() => {
          const value = activeGoals.find((goal) => goal.id === editingRecord.id);
          return value ? { kind: "goal" as const, value } : undefined;
        })()
      : undefined;
  const openRecordEditor = (
    record: { kind: "allocation"; id: string } | { kind: "goal"; id: string },
    trigger: HTMLButtonElement,
  ) => {
    recordEditTriggerRef.current = trigger;
    archivedFromEditorRef.current = null;
    setEditingRecord(record);
    setRecordEditorOpen(true);
  };

  const goalRows = activeGoals.length ? (
    <div className="money-plan-goals">
      {activeGoals.map((goal) => (
        <GoalRow
          key={goal.id}
          goal={goal}
          hidden={amountsHidden}
          onEdit={(trigger) => {
            openRecordEditor({ kind: "goal", id: goal.id }, trigger);
            void navigate(`/life/finances/plan/targets/${encodeURIComponent(goal.id)}`);
          }}
        />
      ))}
    </div>
  ) : null;

  const allocationRows = activeBudgets.length ? (
    <div
      className="money-plan-grid"
      role="table"
      aria-label="Planned allocations"
    >
      <div className="money-plan-grid__head" role="row">
        <span role="columnheader">Allocation</span>
        <span role="columnheader">Planned</span>
        <span className="sr-only" role="columnheader">Actions</span>
      </div>
      {activeBudgets.map((budget) => (
        <div
          className="money-plan-grid__row"
          role="row"
          key={budget.id}
        >
          <span role="cell">
            <strong>{budget.displayName}</strong>
            <small>
              {budget.category || humanize(budget.periodKind)} · {humanize(budget.state)}
            </small>
          </span>
          <span role="cell">
            <MaskedMoney
              minor={budget.targetAmountMinor}
              currency={budget.currency}
              hidden={amountsHidden}
            />
            <small>{budget.currency} · Local target</small>
          </span>
          <span role="cell">
            <Button
              tone="ghost"
              disabled={amountsHidden}
              onClick={(event) =>
                openRecordEditor(
                  { kind: "allocation", id: budget.id },
                  event.currentTarget,
                )
              }
            >
              <Pencil size={14} />
              Edit
            </Button>
          </span>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <section className="money-plan-workspace">
      <PageFrame width="wide">
        <PageHeader
          title="Plan"
          description="Protect what matters, name intentional targets, and keep assumptions inspectable."
          status={
            <>
              <span>{period}</span>
              <span aria-hidden="true">·</span>
              <span>{sourceMeta}</span>
            </>
          }
          actions={headerActions}
        />
        <MoneyNavigation variant="bar" />
        <nav className="money-plan-record-view" aria-label="Plan record view">
          <Link
            to="/life/finances/plan"
            aria-current={archiveView ? undefined : "page"}
          >
            Current plan
          </Link>
          <Link
            to="/life/finances/plan?view=archived"
            aria-current={archiveView ? "page" : undefined}
          >
            Archive
            {archivedBudgetCount + archivedGoalCount > 0 ? (
              <span>{archivedBudgetCount + archivedGoalCount}</span>
            ) : null}
          </Link>
        </nav>
        {sourceState !== "ok" ? (
          <div className="money-plan-notice" role="status">
            <CircleAlert size={16} />
            <span>
              Connected activity is {sourceState ?? "unavailable"}. Local plan
              records remain available and are not being presented as current
              spending.
            </span>
            <Link to="/settings/integrations">Review connections</Link>
          </div>
        ) : null}
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
        {archiveView ? (
          <ArchivedPlanCollection
            budgets={archivedBudgets.data?.budgets ?? []}
            goals={archivedGoals.data?.goals ?? []}
            loading={archivedBudgets.isPending || archivedGoals.isPending}
            failed={archivedBudgets.isError || archivedGoals.isError}
            restoring={restoreRecord.isPending}
            error={restoreError}
            timeZone={allowance.data?.viewerTimeZone}
            hidden={amountsHidden}
            headingRef={archiveHeadingRef}
            onRestore={(record) => restoreRecord.mutate(record)}
            onRetry={() => {
              setRestoreError("");
              void Promise.all([archivedBudgets.refetch(), archivedGoals.refetch()]);
            }}
          />
        ) : (
        <div className="money-plan-layout">
          <section className="money-plan-main" aria-label="Plan details">
            <section
              className="money-plan-section money-plan-goals-section"
              aria-labelledby="money-plan-goals-title"
            >
              <header>
                <div>
                  <h2 ref={goalHeadingRef} id="money-plan-goals-title" tabIndex={-1}>Goals in progress</h2>
                  <p>Set a target and track progress.</p>
                </div>
                <Button
                  disabled={amountsHidden || goals.isError}
                  onClick={() => setGoalOpen(true)}
                >
                  <Plus size={14} />
                  New goal
                </Button>
              </header>
              {archivedGoalCount > 0 && activeGoals.length > 0 ? (
                <ArchiveNotice count={archivedGoalCount} kind="goal" />
              ) : null}
              {goals.isError ? (
                <>
                  <SectionUnavailable
                    title="Goals unavailable"
                    body="Kora could not read local goal records. Existing goals may still be present."
                    onRetry={() => void goals.refetch()}
                    retrying={goals.isFetching}
                  />
                  {goalRows}
                </>
              ) : goalRows ? (
                goalRows
              ) : archivedGoalCount > 0 ? (
                <ArchivedPlanState count={archivedGoalCount} kind="goal" />
              ) : (
                <div className="money-plan-inline-empty">
                  <strong>No active goals</strong>
                  <p>
                    Create a savings, debt, revenue, or custom target when you
                    are ready to track one explicitly.
                  </p>
                </div>
              )}
            </section>

            <section
              className="money-plan-section money-plan-allocations-section"
              aria-labelledby="money-plan-allocations-title"
            >
              <header>
                <div>
                  <h2 ref={allocationHeadingRef} id="money-plan-allocations-title" tabIndex={-1}>Planned allocations</h2>
                  <p>Targets for {period}. Spending comparisons are unavailable.</p>
                </div>
                <Badge tone="quiet">Local targets</Badge>
              </header>
              {archivedBudgetCount > 0 && activeBudgets.length > 0 ? (
                <ArchiveNotice count={archivedBudgetCount} kind="allocation" />
              ) : null}
              {budgets.isError ? (
                <>
                  <SectionUnavailable
                    title="Allocations unavailable"
                    body="Kora could not read local category targets. This is not being presented as an empty plan."
                    onRetry={() => void budgets.refetch()}
                    retrying={budgets.isFetching}
                  />
                  {allocationRows}
                </>
              ) : allocationRows ? (
                allocationRows
              ) : archivedBudgetCount > 0 ? (
                <ArchivedPlanState
                  count={archivedBudgetCount}
                  kind="allocation"
                />
              ) : (
                <div className="money-plan-allocation-empty">
                  <strong>Category allocations</strong>
                  <p>You can edit saved allocations here. Creating allocations is not available yet.</p>
                  <div className="money-plan-allocation-empty__action">
                    <span>To track a new target, create a goal.</span>
                    <Button
                      tone="secondary"
                      disabled={amountsHidden || goals.isError}
                      onClick={() => setGoalOpen(true)}
                    >
                      Create a goal
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {showEmptyStart ? (
              <section
                className="money-plan-empty"
                aria-labelledby="money-plan-empty-title"
              >
                <header>
                  <ShieldCheck size={22} />
                  <div>
                    <h2 id="money-plan-empty-title">
                      Start with one useful commitment
                    </h2>
                    <p>
                      Each start below writes through an existing owner or opens
                      the exact owning Money view.
                    </p>
                  </div>
                </header>
                <div className="money-plan-starts">
                  <Button
                    disabled={
                      amountsHidden ||
                      !settings.data ||
                      (!allowanceCurrency && allowance.data?.status !== "unsupported")
                    }
                    onClick={() => setSettingsOpen(true)}
                  >
                    Protect a floor
                  </Button>
                  <Link
                    className="button button--secondary"
                    to="/life/finances/recurring"
                  >
                    Record an obligation
                  </Link>
                  <Button
                    tone="secondary"
                    disabled={amountsHidden || goals.isError}
                    onClick={() => setGoalOpen(true)}
                  >
                    Create a target
                  </Button>
                </div>
                {canAskPlan ? (
                  <Button
                    tone="ghost"
                    onClick={() =>
                      onAskKora(
                        {
                          kind: "finance_record",
                          id: "snapshot",
                          title: "Money snapshot",
                        },
                        "Propose one useful starting point for my Money plan from this exact snapshot. Do not create or change anything until I confirm.",
                      )
                    }
                  >
                    Build a reviewable proposal with Kora
                  </Button>
                ) : (
                  <span className="money-plan-empty__unavailable">
                    A fully qualified snapshot is required before Kora can
                    propose a plan.
                  </span>
                )}
              </section>
            ) : null}
          </section>

          <aside className="money-plan-context" aria-label="Plan context">
            <section
              className="money-plan-protection"
              aria-labelledby="money-plan-protection-title"
            >
              <header>
                <div>
                  <h2 id="money-plan-protection-title">
                    Your working boundaries
                  </h2>
                  <p>
                    Local boundaries that shape the guide without moving
                    provider funds.
                  </p>
                </div>
                <Button
                  aria-label="Edit boundaries"
                  disabled={
                    amountsHidden ||
                    !settings.data ||
                    (!allowanceCurrency && allowance.data?.status !== "unsupported")
                  }
                  onClick={() => setSettingsOpen(true)}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
              </header>
              {settings.isError ? (
                <SectionUnavailable
                  title="Plan boundaries unavailable"
                  body="Kora could not read the local floor, buffer, horizon, or included-account settings."
                />
              ) : settings.isPending ? (
                <div className="money-plan-inline-pending" role="status">
                  Opening protected boundaries…
                </div>
              ) : (
                <>
                  <div className="money-plan-equation">
                    <PlanValue
                      label="Protected floor"
                      value={
                        settings.data && allowanceCurrency
                          ? money(
                              settings.data.dailyFloorMinor,
                              allowanceCurrency,
                            )
                          : undefined
                      }
                      hidden={amountsHidden}
                      note="Outside the daily guide"
                      meta={allowanceCurrency ?? "Currency unavailable"}
                    />
                    <PlanValue
                      label="Buffer"
                      value={
                        settings.data && allowanceCurrency
                          ? money(
                              settings.data.bufferMinor,
                              allowanceCurrency,
                            )
                          : undefined
                      }
                      hidden={amountsHidden}
                      note="Extra planning room"
                      meta={allowanceCurrency ?? "Currency unavailable"}
                    />
                    <PlanValue
                      label="Horizon"
                      value={
                        settings.data
                          ? `${settings.data.obligationHorizonDays} days`
                          : undefined
                      }
                      hidden={false}
                      note="Bills checked"
                    />
                    <PlanValue
                      label="Accounts"
                      value={
                        settings.data
                          ? String(
                              settings.data.includedAccountIds.length ||
                                "Automatic",
                            )
                          : undefined
                      }
                      hidden={false}
                      note={
                        settings.data?.includedAccountIds.length
                          ? "Explicit selection"
                          : "Depository fallback"
                      }
                    />
                  </div>
                  <p className="money-plan-setting-provenance">
                    Local settings · Updated {shortTime(settings.data.updatedAt, allowance.data?.viewerTimeZone)}
                  </p>
                </>
              )}
              {amountsHidden ? (
                <p className="money-plan-private-note">
                  <EyeOff size={14} />
                  Show amounts before editing protected values.
                </p>
              ) : null}
            </section>
            <section className="money-plan-guide">
              <span>{guideQualified ? "Current guide" : "Guide status"}</span>
              <h2>
                {guideQualified
                  ? allowance.data?.status === "over_floor"
                    ? "Needs review"
                    : "Within the plan"
                  : "Daily guide unavailable"}
              </h2>
              <p>
                {guideQualified
                  ? amountsHidden
                    ? "Amounts are hidden. Show them to inspect the guide."
                    : (allowance.data?.explanation ??
                      "The current guide could not be calculated.")
                  : allowance.isPending
                    ? "Reading saved planning inputs and refreshed account balances to confirm a daily amount."
                    : allowance.data?.status === "unsupported"
                      ? "Your accounts use different currencies. A daily amount is available only when the plan uses one currency."
                      : allowance.isError || allowanceSource?.state !== "ok"
                        ? "The planning calculation uses saved inputs, but refreshed account balances are required to confirm a daily amount."
                        : !supportedAllowance?.currency
                        ? "A supported currency and refreshed account balances are required to confirm a daily amount."
                        : "The planning calculation uses saved inputs, but refreshed account balances are required to confirm a daily amount."}
              </p>
              {guideQualified && supportedAllowance?.currency ? (
                <dl>
                  <div>
                    <dt>Guide today</dt>
                    <dd>
                      <MaskedMoney
                        minor={supportedAllowance.dailyAllowanceMinor}
                        currency={supportedAllowance.currency}
                        hidden={amountsHidden}
                      />
                      <small>
                        {supportedAllowance.currency} ·{" "}
                        {sourceQualification(allowanceSource?.state)}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Remainder</dt>
                    <dd>
                      <MaskedMoney
                        minor={supportedAllowance.planningRemainderMinor}
                        currency={supportedAllowance.currency}
                        hidden={amountsHidden}
                      />
                      <small>
                        {supportedAllowance.currency} ·{" "}
                        {sourceQualification(allowanceSource?.state)} ·{" "}
                        {shortTime(
                          supportedAllowance.generatedAt,
                          supportedAllowance.viewerTimeZone,
                        )}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Time left</dt>
                    <dd>
                      {supportedAllowance.remainingDays} days
                      <small>Current horizon</small>
                    </dd>
                  </div>
                </dl>
              ) : (
                <dl className="money-plan-guide__unqualified">
                  <div>
                    <dt>Planning calculation</dt>
                    <dd>
                      <strong>Unconfirmed daily estimate</strong>
                      <small>
                        {supportedAllowance?.currency
                          ? `${supportedAllowance.currency} · `
                          : ""}
                        {guideQualification}
                        {supportedAllowance?.generatedAt
                          ? ` · ${shortTime(
                              supportedAllowance.generatedAt,
                              supportedAllowance.viewerTimeZone,
                            )}`
                          : ""}
                      </small>
                    </dd>
                  </div>
                </dl>
              )}
            </section>
            <details className="money-plan-authority">
              <summary>What this plan can change</summary>
              <ul>
                <li>
                  Local settings own floor, buffer, horizon, and included
                  accounts.
                </li>
                <li>
                  Goals are explicit records; business revenue progress is
                  computed.
                </li>
                <li>Category spending is not inferred from merchants.</li>
                <li>Archived allocations and goals remain inspectable and can be restored from the Archive view.</li>
              </ul>
            </details>
          </aside>
        </div>
        )}
      </PageFrame>
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings.data}
        accounts={accounts.data?.accounts ?? []}
        accountsUnavailable={accounts.isError}
        currency={allowanceCurrency}
        hidden={amountsHidden}
        save={loaders.updateSettings}
        onRefresh={refresh}
        onSaved={async () => {
          await refresh();
          setAnnouncement("Plan boundaries saved.");
        }}
      />
      <GoalSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        hidden={amountsHidden}
        create={loaders.createGoal}
        onSaved={async () => {
          await refresh();
          setAnnouncement("Goal created.");
        }}
      />
      <PlanRecordEditor
        open={recordEditorOpen}
        record={selectedRecord}
        activeBudgets={activeBudgets}
        hidden={amountsHidden}
        finalFocus={recordEditTriggerRef}
        updateBudget={loaders.updateBudget}
        updateGoal={loaders.updateGoal}
        onOpenChange={setRecordEditorOpen}
        onOpenChangeComplete={(open) => {
          if (!open) {
            const archived = archivedFromEditorRef.current;
            setEditingRecord(null);
            archivedFromEditorRef.current = null;
            if (routeTargetId) {
              openedRouteTarget.current = undefined;
              void navigate("/life/finances/plan", { replace: true });
              requestAnimationFrame(() => goalHeadingRef.current?.focus());
              return;
            }
            if (archived) {
              requestAnimationFrame(() =>
                (archived === "allocation"
                  ? allocationHeadingRef.current
                  : goalHeadingRef.current
                )?.focus(),
              );
            }
          }
        }}
        onRefresh={refresh}
        onSaved={async (kind, archived) => {
          if (archived) archivedFromEditorRef.current = kind;
          await refresh();
          setAnnouncement(
            `${kind === "allocation" ? "Allocation" : "Goal"} ${archived ? "archived" : "saved"}.`,
          );
        }}
      />
    </section>
  );
}

function ArchivedPlanCollection({
  budgets,
  goals,
  loading,
  failed,
  restoring,
  error,
  timeZone,
  hidden,
  headingRef,
  onRestore,
  onRetry,
}: {
  budgets: FinanceBudget[];
  goals: FinanceGoal[];
  loading: boolean;
  failed: boolean;
  restoring: boolean;
  error: string;
  timeZone?: string;
  hidden: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRestore: (
    record:
      | { kind: "allocation"; value: FinanceBudget }
      | { kind: "goal"; value: FinanceGoal },
  ) => void;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <StateNotice role="status" title="Opening archived plan records…" />
    );
  if (failed)
    return (
      <StateNotice role="alert" tone="danger" title="Archive unavailable" body="Kora could not read archived allocations and goals. No records are being presented as absent." action={<Button tone="secondary" onClick={onRetry}>Try again</Button>} />
    );

  return (
    <section className="money-plan-archive" aria-labelledby="money-plan-archive-title">
      <header>
        <div>
          <p className="money-module-label">Recovery</p>
          <h2 ref={headingRef} id="money-plan-archive-title" tabIndex={-1}>Archived plan records</h2>
          <p>Inspect records outside the current plan and restore one using its saved version.</p>
        </div>
        <span>{budgets.length + goals.length} archived</span>
      </header>
      {error ? <p className="money-plan-archive__error" role="alert">{error}</p> : null}
      {!budgets.length && !goals.length ? (
        <StateNotice title="Nothing is archived" body="Archived allocations and goals will remain recoverable here." />
      ) : (
        <div className="money-plan-archive__groups">
          <section aria-labelledby="money-plan-archive-allocations">
            <h3 id="money-plan-archive-allocations">Allocations</h3>
            {budgets.length ? (
              <ul>
                {budgets.map((budget) => (
                  <li key={budget.id}>
                    <span>
                      <strong>{budget.displayName}</strong>
                      <small>{budget.category || humanize(budget.periodKind)} · Archived {shortTime(budget.updatedAt, timeZone)}</small>
                    </span>
                    <span>
                      <MaskedMoney minor={budget.targetAmountMinor} currency={budget.currency} hidden={hidden} />
                      <Button
                        tone="secondary"
                        disabled={restoring}
                        onClick={() => onRestore({ kind: "allocation", value: budget })}
                      >
                        Restore allocation
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p>No archived allocations.</p>}
          </section>
          <section aria-labelledby="money-plan-archive-goals">
            <h3 id="money-plan-archive-goals">Goals</h3>
            {goals.length ? (
              <ul>
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <span>
                      <strong>{goal.displayName}</strong>
                      <small>{humanize(goal.goalKind)} · Archived {shortTime(goal.updatedAt, timeZone)}</small>
                    </span>
                    <span>
                      <MaskedMoney minor={goal.targetAmountMinor} currency={goal.currency} hidden={hidden} />
                      <Button
                        tone="secondary"
                        disabled={restoring}
                        onClick={() => onRestore({ kind: "goal", value: goal })}
                      >
                        Restore goal
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p>No archived goals.</p>}
          </section>
        </div>
      )}
    </section>
  );
}

function PlanValue({
  label,
  value,
  hidden,
  note,
  meta,
}: {
  label: string;
  value?: string;
  hidden: boolean;
  note: string;
  meta?: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {hidden ? (
          <span aria-label="Amount hidden">••••••</span>
        ) : (
          (value ?? "Unavailable")
        )}
      </strong>
      <small>{note}</small>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}
function SectionUnavailable({
  title,
  body,
  onRetry,
  retrying = false,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="money-plan-inline-unavailable" role="status">
      <CircleAlert size={16} />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {onRetry ? (
        <Button
          type="button"
          tone="ghost"
          disabled={retrying}
          onClick={onRetry}
        >
          <RefreshCw size={14} />
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
function ArchiveNotice({
  count,
  kind,
}: {
  count: number;
  kind: "allocation" | "goal";
}) {
  return (
    <p className="money-plan-archive-note" role="status">
      {count} archived {kind}
      {count === 1 ? "" : "s"} {count === 1 ? "is" : "are"} preserved outside
      the active plan. <Link to="/life/finances/plan?view=archived">Review archive</Link>
    </p>
  );
}
function ArchivedPlanState({
  count,
  kind,
}: {
  count: number;
  kind: "allocation" | "goal";
}) {
  return (
    <div className="money-plan-inline-archived" role="status">
      <strong>No active {kind}s</strong>
      <p>
        {count} archived {kind}
        {count === 1 ? "" : "s"} {count === 1 ? "is" : "are"} preserved in
        Kora’s archive and {count === 1 ? "is" : "are"} not included in the
        current plan. <Link to="/life/finances/plan?view=archived">Review and restore</Link>
      </p>
    </div>
  );
}
function MaskedMoney({
  minor,
  currency,
  hidden,
}: {
  minor?: number | null;
  currency: string;
  hidden: boolean;
}) {
  return (
    <>
      {hidden ? (
        <span aria-label="Amount hidden">••••••</span>
      ) : minor == null ? (
        "Unavailable"
      ) : (
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          minor / 100,
        )
      )}
    </>
  );
}
function GoalRow({
  goal,
  hidden,
  onEdit,
}: {
  goal: FinanceGoal;
  hidden: boolean;
  onEdit: (trigger: HTMLButtonElement) => void;
}) {
  const current = goal.currentAmountMinor,
    target = goal.targetAmountMinor,
    hasProgress = current != null && target != null && target > 0,
    progress = hasProgress
      ? Math.max(0, Math.min(100, (current / target) * 100))
      : 0;
  return (
    <article>
      <header>
        <div>
          <strong>{goal.displayName}</strong>
          <small>{humanize(goal.goalKind)} · {goal.currency}</small>
        </div>
        <Button
          tone="ghost"
          disabled={hidden}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          <Pencil size={14} />
          Edit
        </Button>
      </header>
      {hasProgress ? (
        <div
          className="money-plan-progress"
          role="progressbar"
          aria-label={`${goal.displayName} progress`}
          aria-valuemin={0}
          aria-valuemax={hidden ? 100 : target}
          aria-valuenow={hidden ? undefined : current}
          aria-valuetext={
            hidden
              ? "Amount hidden"
              : `${money(current!, goal.currency)} of ${money(target!, goal.currency)}`
          }
        >
          <span style={{ width: hidden ? "0%" : `${progress}%` }} />
        </div>
      ) : (
        <div className="money-plan-progress-unavailable" role="status">
          Progress unavailable because the current amount or target is missing.
        </div>
      )}
      <footer>
        <span>
          <MaskedMoney
            minor={current}
            currency={goal.currency}
            hidden={hidden}
          />{" "}
          current
        </span>
        <span>
          <MaskedMoney
            minor={target}
            currency={goal.currency}
            hidden={hidden}
          />{" "}
          target
        </span>
        {goal.periodEnd ? (
          <span>
            By{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${goal.periodEnd}T12:00:00Z`))}
          </span>
        ) : (
          <span>No target date</span>
        )}
      </footer>
    </article>
  );
}

type EditablePlanRecord =
  | { kind: "allocation"; value: FinanceBudget }
  | { kind: "goal"; value: FinanceGoal };

type PlanRecordDraft = {
  name: string;
  target: string;
  current: string;
  category: string;
  period: string;
  end: string;
};

function draftForRecord(record: EditablePlanRecord): PlanRecordDraft {
  return record.kind === "allocation"
    ? {
        name: record.value.displayName,
        target: String(record.value.targetAmountMinor / 100),
        current: "",
        category: record.value.category ?? "",
        period: record.value.periodKind,
        end: "",
      }
    : {
        name: record.value.displayName,
        target:
          record.value.targetAmountMinor == null
            ? ""
            : String(record.value.targetAmountMinor / 100),
        current:
          record.value.currentAmountMinor == null
            ? ""
            : String(record.value.currentAmountMinor / 100),
        category: "",
        period: humanize(record.value.goalKind),
        end: record.value.periodEnd ?? "",
      };
}

function PlanRecordEditor({
  open,
  record,
  activeBudgets,
  hidden,
  finalFocus,
  updateBudget,
  updateGoal,
  onOpenChange,
  onOpenChangeComplete,
  onRefresh,
  onSaved,
}: {
  open: boolean;
  record?: EditablePlanRecord;
  activeBudgets: FinanceBudget[];
  hidden: boolean;
  finalFocus: RefObject<HTMLButtonElement | null>;
  updateBudget: PlanLoaders["updateBudget"];
  updateGoal: PlanLoaders["updateGoal"];
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete: (open: boolean) => void;
  onRefresh: () => Promise<unknown>;
  onSaved: (kind: "allocation" | "goal", archived: boolean) => Promise<unknown>;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const initializedId = useRef<string | null>(null);
  const expectedUpdatedAt = useRef("");
  const [draft, setDraft] = useState<PlanRecordDraft>({
    name: "",
    target: "",
    current: "",
    category: "",
    period: "",
    end: "",
  });
  const [conflict, setConflict] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ archived }: { archived: boolean }) => {
      if (!record) throw new Error("This plan record is no longer available.");
      if (record.kind === "allocation") {
        return updateBudget(
          record.value.id,
          archived
            ? { state: "archived" }
            : {
                displayName: draft.name.trim(),
                targetAmountMinor: cents(draft.target)!,
                category: draft.category.trim() || null,
                periodKind: draft.period,
              },
          expectedUpdatedAt.current,
        );
      }
      return updateGoal(
        record.value.id,
        archived
          ? { state: "archived" }
          : {
              displayName: draft.name.trim(),
              targetAmountMinor: cents(draft.target),
              ...(record.value.goalKind === "business_revenue"
                ? {}
                : { currentAmountMinor: cents(draft.current) }),
              periodEnd: draft.end || null,
            },
        expectedUpdatedAt.current,
      );
    },
    onMutate: () => {
      setConflict(false);
    },
    onSuccess: async (_saved, input) => {
      if (!record) return;
      await onSaved(record.kind, input.archived);
      onOpenChange(false);
    },
    onError: async (error) => {
      if (isRecordConflict(error)) {
        setConflict(true);
        await onRefresh();
      }
    },
  });

  useEffect(() => {
    if (!open) {
      initializedId.current = null;
      setConflict(false);
      setArchiveConfirm(false);
      mutation.reset();
      return;
    }
    if (record && initializedId.current !== record.value.id) {
      setDraft(draftForRecord(record));
      expectedUpdatedAt.current = record.value.updatedAt;
      initializedId.current = record.value.id;
      setConflict(false);
      setArchiveConfirm(false);
      mutation.reset();
    }
  }, [open, record?.value.id]);

  const latestDraft = record ? draftForRecord(record) : undefined;
  const businessRevenue =
    record?.kind === "goal" && record.value.goalKind === "business_revenue";
  const valid = Boolean(
    record &&
      !hidden &&
      draft.name.trim() &&
      (record.kind === "allocation" ? cents(draft.target) != null : true) &&
      (record.kind !== "allocation" || draft.period.trim()),
  );
  const dirty = Boolean(
    latestDraft &&
      (draft.name !== latestDraft.name ||
        draft.target !== latestDraft.target ||
        draft.current !== latestDraft.current ||
        draft.category !== latestDraft.category ||
        draft.period !== latestDraft.period ||
        draft.end !== latestDraft.end),
  );
  const draftAllocationTotal =
    record?.kind === "allocation" && cents(draft.target) != null
      ? activeBudgets
          .filter(
            (budget) =>
              budget.id !== record.value.id &&
              budget.currency === record.value.currency,
          )
          .reduce((sum, budget) => sum + budget.targetAmountMinor, 0) +
        cents(draft.target)!
      : undefined;

  const useLatest = () => {
    if (!record) return;
    setDraft(draftForRecord(record));
    expectedUpdatedAt.current = record.value.updatedAt;
    setConflict(false);
    mutation.reset();
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  };
  const keepEditing = () => {
    if (!record) return;
    expectedUpdatedAt.current = record.value.updatedAt;
    setConflict(false);
    mutation.reset();
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={
        record
          ? `Edit ${record.kind === "allocation" ? "allocation" : "goal"}`
          : "Plan record unavailable"
      }
      description="Changes stay in Kora’s local Money records. No provider funds move."
      purpose="properties"
      initialFocus={firstFieldRef}
      finalFocus={finalFocus}
      busy={mutation.isPending}
    >
      {!record ? (
        <StateNotice
          role="alert"
          tone="warning"
          title="This record is no longer current"
          body="Close this panel and open the latest saved record from the plan."
        />
      ) : (
        <form
          className="money-plan-form money-plan-record-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !conflict) mutation.mutate({ archived: false });
          }}
        >
          <Field label="Label">
            <Input
              ref={firstFieldRef}
              aria-label={`${record.kind === "allocation" ? "Allocation" : "Goal"} label`}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field
            label={`Target amount (${record.value.currency})`}
            hint={
              record.kind === "allocation"
                ? "Required for a saved allocation."
                : "Leave blank only when the target is genuinely unknown."
            }
          >
            <Input
              aria-label="Target amount"
              inputMode="decimal"
              value={draft.target}
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            />
          </Field>
          {record.kind === "goal" ? (
            businessRevenue ? (
              <p className="money-plan-form__note">
                Current progress is computed from posted linked-account inflows and cannot be edited here.
              </p>
            ) : (
              <Field label={`Current amount (${record.value.currency})`} hint="Leave blank when current progress is not known.">
                <Input
                  aria-label="Current amount"
                  inputMode="decimal"
                  value={draft.current}
                  onChange={(event) => setDraft({ ...draft, current: event.target.value })}
                />
              </Field>
            )
          ) : (
            <Field label="Category" hint="Optional local grouping label.">
              <Input
                aria-label="Allocation category"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
            </Field>
          )}
          {record.kind === "allocation" ? (
            <Field label="Period">
              <KoraSelect
                label="Allocation period"
                value={draft.period}
                options={[
                  ...(!["monthly", "weekly", "quarterly", "annual"].includes(draft.period)
                    ? [{ value: draft.period, label: humanize(draft.period) }]
                    : []),
                  { value: "monthly", label: "Monthly" },
                  { value: "weekly", label: "Weekly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "annual", label: "Annual" },
                ]}
                onValueChange={(period) => setDraft({ ...draft, period })}
              />
            </Field>
          ) : (
            <Field label="Target date" hint="Optional.">
              <Input
                aria-label="Target date"
                type="date"
                value={draft.end}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
              />
            </Field>
          )}

          <dl className="money-plan-record-meta">
            <div><dt>Currency</dt><dd>{record.value.currency} · fixed for this record</dd></div>
            <div><dt>{record.kind === "allocation" ? "Period" : "Kind"}</dt><dd>{record.kind === "allocation" ? humanize(record.value.periodKind) : humanize(record.value.goalKind)}</dd></div>
            <div><dt>Source</dt><dd>Local Money record</dd></div>
            <div><dt>Saved</dt><dd>{shortTime(record.value.updatedAt)}</dd></div>
          </dl>

          {dirty ? (
            <div className="money-plan-draft" role="status">
              <strong>Draft</strong>
              <span>{draft.name.trim() || "Label required"}</span>
              <span>
                {cents(draft.target) == null
                  ? record.kind === "allocation"
                    ? "Amount required"
                    : "Target unavailable"
                  : money(cents(draft.target)!, record.value.currency)}
              </span>
              {draftAllocationTotal != null ? (
                <span>
                  Draft {record.value.currency} allocation total {money(draftAllocationTotal, record.value.currency)}
                </span>
              ) : record.kind === "goal" && !businessRevenue ? (
                <span>
                  {cents(draft.current) == null
                    ? "Current progress unavailable"
                    : `${money(cents(draft.current)!, record.value.currency)} current`}
                </span>
              ) : null}
            </div>
          ) : null}

          {conflict && latestDraft ? (
            <div className="money-plan-conflict" role="alert">
              <strong>This record changed elsewhere</strong>
              <p>Compare the latest saved record with your draft before retrying.</p>
              <dl>
                <div>
                  <dt>Label</dt>
                  <dd>Latest {latestDraft.name}<small>Draft {draft.name || "Unavailable"}</small></dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>
                    Latest {latestDraft.target ? money(cents(latestDraft.target)!, record.value.currency) : "Unavailable"}
                    <small>Draft {cents(draft.target) == null ? "Unavailable" : money(cents(draft.target)!, record.value.currency)}</small>
                  </dd>
                </div>
              </dl>
              <div>
                <Button type="button" tone="secondary" onClick={useLatest}>Use latest</Button>
                <Button type="button" tone="ghost" onClick={keepEditing}>Keep editing</Button>
                <Button type="button" tone="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              </div>
            </div>
          ) : mutation.isError ? (
            <p className="money-plan-form__error" role="alert">
              {mutation.error.message || "This plan record could not be saved."}
            </p>
          ) : null}

          {archiveConfirm ? (
            <div className="money-plan-dismiss" role="alert">
              <strong>Archive this {record.kind}?</strong>
              <p>
                It will leave the current plan and remain available in Archive for restoration.
                {dirty ? " This unsaved draft will not be applied." : ""}
              </p>
              <div>
                <Button
                  type="button"
                  tone="danger"
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate({ archived: true })}
                >
                  Confirm archive
                </Button>
                <Button type="button" tone="ghost" onClick={() => setArchiveConfirm(false)}>
                  Keep current
                </Button>
              </div>
            </div>
          ) : null}

          <div className={`money-plan-form__actions${conflict || archiveConfirm ? " money-plan-form__actions--resolution" : ""}`}>
            <Button
              type="button"
              tone="danger"
              disabled={mutation.isPending || conflict}
              onClick={() => setArchiveConfirm(true)}
            >
              <Archive size={14} />
              Archive
            </Button>
            <span className="money-plan-form__actions-spacer" />
            <Button type="button" tone="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              tone="primary"
              loading={mutation.isPending}
              disabled={!valid || conflict || archiveConfirm || !dirty}
            >
              Save changes
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

type AccountSelectionMode = "automatic" | "custom";
type SettingsDraft = {
  floor: string;
  buffer: string;
  horizon: string;
  accountIds: string[];
  accountMode: AccountSelectionMode;
};

function settingsDraft(settings: FinanceAllowanceSettings): SettingsDraft {
  return {
    floor: String(settings.dailyFloorMinor / 100),
    buffer: String(settings.bufferMinor / 100),
    horizon: String(settings.obligationHorizonDays),
    accountIds: [...settings.includedAccountIds],
    accountMode: settings.includedAccountIds.length ? "custom" : "automatic",
  };
}

function SettingsSheet({
  open,
  onOpenChange,
  settings,
  accounts,
  accountsUnavailable,
  currency,
  hidden,
  save,
  onRefresh,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings?: FinanceAllowanceSettings;
  accounts: FinanceAccount[];
  accountsUnavailable: boolean;
  currency?: string;
  hidden: boolean;
  save: PlanLoaders["updateSettings"];
  onRefresh: () => Promise<unknown>;
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({
    floor: "",
    buffer: "",
    horizon: "30",
    accountIds: [] as string[],
    accountMode: "automatic",
  });
  const [conflict, setConflict] = useState(false);
  const [dismissWarning, setDismissWarning] = useState(false);
  const initializedVersion = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: async () => {
      await onSaved();
      onOpenChange(false);
    },
    onError: async (error) => {
      if (isSettingsConflict(error)) {
        setConflict(true);
        await onRefresh();
      }
    },
  });
  useEffect(() => {
    if (!open) {
      initializedVersion.current = null;
      return;
    }
    if (settings && initializedVersion.current == null) {
      setDraft(settingsDraft(settings));
      initializedVersion.current = settings.version;
      setConflict(false);
      setDismissWarning(false);
    }
  }, [open, settings]);
  const selectedAccounts = accounts.filter((account) =>
    draft.accountIds.includes(account.accountId),
  );
  const automaticAccounts = accounts.filter((account) =>
    account.type.toLowerCase().startsWith("depository"),
  );
  const accountIdsForSave =
    draft.accountMode === "automatic" ? [] : draft.accountIds;
  const effectiveAccounts =
    draft.accountMode === "automatic" ? automaticAccounts : selectedAccounts;
  const effectiveCurrencies = [
    ...new Set(effectiveAccounts.map((account) => account.currency)),
  ].sort();
  const mixedCurrencies = effectiveCurrencies.length > 1;
  const draftCurrency =
    effectiveCurrencies.length === 1 ? effectiveCurrencies[0] : currency;
  const selectedCurrency = draft.accountMode === "custom"
    ? selectedAccounts[0]?.currency
    : undefined;
  const valid = Boolean(
    settings &&
    draftCurrency &&
    !mixedCurrencies &&
    !hidden &&
    (draft.accountMode === "automatic" || draft.accountIds.length > 0) &&
    cents(draft.floor) != null &&
    cents(draft.buffer) != null &&
    Number.isInteger(Number(draft.horizon)) &&
    Number(draft.horizon) >= 1 &&
    Number(draft.horizon) <= 90,
  );
  const savedAccountMode = settings
    ? settings.includedAccountIds.length
      ? "custom"
      : "automatic"
    : undefined;
  const dirty = Boolean(
    settings &&
    (cents(draft.floor) !== settings.dailyFloorMinor ||
      cents(draft.buffer) !== settings.bufferMinor ||
      Number(draft.horizon) !== settings.obligationHorizonDays ||
      draft.accountMode !== savedAccountMode ||
      accountIdsForSave.join("|") !== settings.includedAccountIds.join("|")),
  );
  const useLatest = () => {
    if (settings) {
      setDraft(settingsDraft(settings));
      initializedVersion.current = settings.version;
    }
    setConflict(false);
    mutation.reset();
  };
  const requestClose = () => {
    if (dirty) setDismissWarning(true);
    else onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else onOpenChange(true);
      }}
      title="Plan boundaries"
      description="Edit local planning assumptions. No provider funds move."
      purpose="properties"
    >
      <form
        className="money-plan-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !settings) return;
          mutation.mutate({
            includedAccountIds: accountIdsForSave,
            dailyFloorMinor: cents(draft.floor)!,
            bufferMinor: cents(draft.buffer)!,
            obligationHorizonDays: Number(draft.horizon),
            expectedVersion: initializedVersion.current ?? settings.version,
          });
        }}
      >
        <Field
          label={`Protected floor${draftCurrency ? ` (${draftCurrency})` : ""}`}
          hint="Amount kept outside the daily guide."
        >
          <Input
            aria-label="Protected floor"
            inputMode="decimal"
            value={draft.floor}
            onChange={(event) =>
              setDraft({ ...draft, floor: event.target.value })
            }
          />
        </Field>
        <Field
          label={`Buffer${draftCurrency ? ` (${draftCurrency})` : ""}`}
          hint="Extra room before Kora calculates a guide."
        >
          <Input
            aria-label="Buffer"
            inputMode="decimal"
            value={draft.buffer}
            onChange={(event) =>
              setDraft({ ...draft, buffer: event.target.value })
            }
          />
        </Field>
        <Field label="Obligation horizon" hint="1–90 days.">
          <Input
            aria-label="Obligation horizon"
            type="number"
            min={1}
            max={90}
            value={draft.horizon}
            onChange={(event) =>
              setDraft({ ...draft, horizon: event.target.value })
            }
          />
        </Field>
        <fieldset>
          <legend>Account selection</legend>
          <p className="money-plan-form__note">
            Choose how the daily guide selects accounts.
          </p>
          <RadioGroup
            label="Account selection"
            value={draft.accountMode}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                accountMode: value as AccountSelectionMode,
              })
            }
            options={[
              {
                value: "automatic",
                title: "Automatic",
                hint: "Use eligible deposit accounts; mixed currencies remain unavailable.",
              },
              {
                value: "custom",
                title: "Choose accounts",
                hint: "Select at least one account and keep the selection in one currency.",
              },
            ]}
          />
        </fieldset>
        <fieldset>
          <legend>Included accounts</legend>
          <p>
            {accountsUnavailable
              ? "Account records are unavailable. The saved account selection will be preserved."
              : draft.accountMode === "automatic"
                ? mixedCurrencies
                  ? "Eligible deposit accounts span multiple currencies."
                  : automaticAccounts.length
                    ? "Eligible deposit accounts will be included automatically."
                    : "Automatic uses eligible deposit accounts when available. No eligible deposit accounts are currently available to preview."
                : mixedCurrencies
                  ? "Selected accounts span multiple currencies."
                  : draft.accountIds.length
                    ? "Selected accounts will be included."
                    : "Choose at least one account."}
          </p>
          {accounts.map((account) => {
            const automaticallyIncluded = automaticAccounts.some(
              (eligible) => eligible.accountId === account.accountId,
            );
            const checked =
              draft.accountMode === "automatic"
                ? automaticallyIncluded
                : draft.accountIds.includes(account.accountId);
            const incompatible = Boolean(
              draft.accountMode === "custom" &&
                selectedCurrency &&
                account.currency !== selectedCurrency &&
                !checked,
            );
            return (
              <CheckboxChoice
                key={account.accountId}
                checked={checked}
                disabled={draft.accountMode === "automatic" || incompatible}
                onCheckedChange={(nextChecked) =>
                  setDraft({
                    ...draft,
                    accountIds: nextChecked
                      ? [...draft.accountIds, account.accountId]
                      : draft.accountIds.filter((id) => id !== account.accountId),
                  })
                }
                title={account.name}
                hint={
                  draft.accountMode === "automatic"
                    ? `${accountTypeLabel(account.type)} · ${account.currency} · ${automaticallyIncluded ? "Included automatically" : "Not eligible for automatic selection"}`
                    : `${accountTypeLabel(account.type)} · ${account.currency}${incompatible ? " · Choose only accounts in the selected currency" : ""}`
                }
              />
            );
          })}
        </fieldset>
        {draft.accountMode === "custom" && draft.accountIds.length === 0 ? (
          <p className="money-plan-form__error" role="alert">
            Choose at least one account to save a custom selection.
          </p>
        ) : null}
        {mixedCurrencies ? (
          <p className="money-plan-form__error" role="alert">
            {draft.accountMode === "automatic"
              ? "Automatic selection includes eligible accounts in multiple currencies. Switch to Choose accounts and select one currency to calculate a daily guide."
              : "Choose accounts in one currency to calculate a daily guide."} The
            available accounts use {effectiveCurrencies.join(" and ")}.
          </p>
        ) : null}
        {dirty && draftCurrency ? (
          <div className="money-plan-draft" role="status">
            <strong>Draft boundaries</strong>
            <span>
              Floor{" "}
              {cents(draft.floor) == null
                ? "Unavailable"
                : money(cents(draft.floor)!, draftCurrency)}
            </span>
            <span>
              Buffer{" "}
              {cents(draft.buffer) == null
                ? "Unavailable"
                : money(cents(draft.buffer)!, draftCurrency)}
            </span>
            <span>{draft.horizon} day horizon</span>
          </div>
        ) : null}
        {dismissWarning ? (
          <div className="money-plan-dismiss" role="alert">
            <strong>Discard this draft?</strong>
            <p>Your saved plan is unchanged.</p>
            <div>
              <Button
                type="button"
                tone="danger"
                onClick={() => {
                  useLatest();
                  setDismissWarning(false);
                  onOpenChange(false);
                }}
              >
                Discard draft
              </Button>
              <Button
                type="button"
                tone="ghost"
                onClick={() => setDismissWarning(false)}
              >
                Keep editing
              </Button>
            </div>
          </div>
        ) : null}
        {conflict && settings ? (
          <div className="money-plan-conflict" role="alert">
            <strong>Plan changed elsewhere</strong>
            <p>
              Review the latest saved values beside your draft before deciding.
            </p>
            <dl>
              <div>
                <dt>Protected floor</dt>
                <dd>
                  Latest{" "}
                  {draftCurrency
                    ? money(settings.dailyFloorMinor, draftCurrency)
                    : "Unavailable"}
                  <small>
                    Draft{" "}
                    {draftCurrency && cents(draft.floor) != null
                      ? money(cents(draft.floor)!, draftCurrency)
                      : "Unavailable"}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Buffer</dt>
                <dd>
                  Latest{" "}
                  {draftCurrency
                    ? money(settings.bufferMinor, draftCurrency)
                    : "Unavailable"}
                  <small>
                    Draft{" "}
                    {draftCurrency && cents(draft.buffer) != null
                      ? money(cents(draft.buffer)!, draftCurrency)
                      : "Unavailable"}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Horizon</dt>
                <dd>
                  Latest {settings.obligationHorizonDays} days
                  <small>Draft {draft.horizon} days</small>
                </dd>
              </div>
              <div>
                <dt>Included accounts</dt>
                <dd>
                  Latest{" "}
                  {accountSelection(settings.includedAccountIds, accounts)}
                  <small>
                    Draft {accountSelection(draft.accountIds, accounts, draft.accountMode)}
                  </small>
                </dd>
              </div>
            </dl>
            <div>
              <Button type="button" tone="secondary" onClick={useLatest}>
                Use latest
              </Button>
              <Button
                type="button"
                tone="ghost"
                onClick={() => {
                  setConflict(false);
                  initializedVersion.current = settings.version;
                  mutation.reset();
                }}
              >
                Keep editing
              </Button>
            </div>
          </div>
        ) : mutation.isError ? (
          <p className="money-plan-form__error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        <div
          className={`money-plan-form__actions${
            conflict || dismissWarning
              ? " money-plan-form__actions--resolution"
              : ""
          }`}
        >
          <Button type="button" tone="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            loading={mutation.isPending}
            disabled={!valid || conflict}
          >
            Save boundaries
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function GoalSheet({
  open,
  onOpenChange,
  hidden,
  create,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hidden: boolean;
  create: PlanLoaders["createGoal"];
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState({
    name: "",
    kind: "savings",
    target: "",
    current: "",
    currency: "USD",
    end: "",
  });
  const mutation = useMutation({
    mutationFn: async () =>
      create({
        displayName: draft.name.trim(),
        goalKind: draft.kind as
          "savings" | "debt_payoff" | "business_revenue" | "custom",
        targetAmountMinor: cents(draft.target) ?? undefined,
        currentAmountMinor:
          draft.kind === "business_revenue"
            ? undefined
            : (cents(draft.current) ?? undefined),
        currency: draft.currency.toUpperCase(),
        periodEnd: draft.end || undefined,
      }),
    onSuccess: async () => {
      await onSaved();
      onOpenChange(false);
    },
  });
  useEffect(() => {
    if (open)
      setDraft({
        name: "",
        kind: "savings",
        target: "",
        current: "0",
        currency: "USD",
        end: "",
      });
  }, [open]);
  const valid =
    !hidden &&
    draft.name.trim().length > 0 &&
    cents(draft.target) != null &&
    (draft.kind === "business_revenue" || cents(draft.current) != null) &&
    /^[A-Z]{3}$/i.test(draft.currency);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New goal"
      description="Save an explicit local target. Nothing moves at a provider."
      purpose="properties"
    >
      <form
        className="money-plan-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) mutation.mutate();
        }}
      >
        <Field label="Name">
          <Input
            aria-label="Goal name"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field label="Kind">
          <KoraSelect
            label="Goal kind"
            value={draft.kind}
            options={[
              { value: "savings", label: "Savings" },
              { value: "debt_payoff", label: "Debt payoff" },
              { value: "business_revenue", label: "Business revenue" },
              { value: "custom", label: "Custom" },
            ]}
            onValueChange={(kind) => setDraft({ ...draft, kind })}
          />
        </Field>
        <Field label="Target amount">
          <Input
            aria-label="Target amount"
            inputMode="decimal"
            value={draft.target}
            onChange={(event) =>
              setDraft({ ...draft, target: event.target.value })
            }
          />
        </Field>
        {draft.kind !== "business_revenue" ? (
          <Field label="Current amount">
            <Input
              aria-label="Current amount"
              inputMode="decimal"
              value={draft.current}
              onChange={(event) =>
                setDraft({ ...draft, current: event.target.value })
              }
            />
          </Field>
        ) : (
          <p className="money-plan-form__note">
            Business revenue progress is computed from posted linked-account
            inflows and cannot be typed here.
          </p>
        )}
        <Field label="Currency" hint="Three-letter currency code.">
          <Input
            aria-label="Currency"
            maxLength={3}
            value={draft.currency}
            onChange={(event) =>
              setDraft({ ...draft, currency: event.target.value })
            }
          />
        </Field>
        <Field label="Target date" hint="Optional.">
          <Input
            aria-label="Target date"
            type="date"
            value={draft.end}
            onChange={(event) =>
              setDraft({ ...draft, end: event.target.value })
            }
          />
        </Field>
        {mutation.isError ? (
          <p className="money-plan-form__error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        <div className="money-plan-form__actions">
          <Button
            type="button"
            tone="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            loading={mutation.isPending}
            disabled={!valid}
          >
            Create goal
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function PlanLoading({ actions }: { actions?: ReactNode }) {
  return (
    <PlanStateFrame
      status="Opening plan"
      description="Opening local planning records and their source qualification."
      actions={actions}
    >
      <div className="money-plan-loading" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </PlanStateFrame>
  );
}
function PlanUnavailable({ onRetry, actions }: { onRetry: () => void; actions?: ReactNode }) {
  return (
    <PlanStateFrame
      status="Unavailable"
      description="Protect what matters, name intentional targets, and keep assumptions inspectable."
      actions={actions}
    >
      <StateNotice
        role="alert"
        tone="danger"
        icon={<CircleAlert size={22} />}
        title="Plan could not be opened"
        body="Kora could not read local plan records. No missing amount has been converted to zero."
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    </PlanStateFrame>
  );
}
function PlanStateFrame({
  status,
  description,
  actions,
  children,
}: {
  status: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="money-plan-workspace"
      aria-busy={status === "Opening plan" || undefined}
    >
      <PageFrame width="wide">
        <PageHeader title="Plan" description={description} status={status} actions={actions} />
        <MoneyNavigation variant="bar" />
        {children}
      </PageFrame>
    </section>
  );
}
function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
}
function cents(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : null;
}
function isSettingsConflict(error: Error) {
  if (error instanceof RuntimeRequestError)
    return error.status === 409 || error.code === "conflict";
  // The local finance owner still throws this exact legacy message before
  // every transport has converted the failure to a typed 409.
  return (
    error.message ===
    "Finance allowance settings changed; refresh and try again"
  );
}
function isRecordConflict(error: Error) {
  if (error instanceof RuntimeRequestError)
    return error.status === 409 || error.code === "conflict";
  return (
    error.message === "Finance budget changed; refresh and try again" ||
    error.message === "Finance goal changed; refresh and try again"
  );
}
function accountSelection(
  ids: string[],
  accounts: FinanceAccount[],
  mode: AccountSelectionMode = ids.length ? "custom" : "automatic",
) {
  if (mode === "automatic") return "Automatic eligible-account selection";
  if (ids.length === 0) return "No accounts selected";
  return ids
    .map(
      (id) => accounts.find((account) => account.accountId === id)?.name ?? id,
    )
    .join(", ");
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function accountTypeLabel(value: string) {
  const raw = value.trim();
  const normalized = raw.toLowerCase().replaceAll("_", ":").replaceAll("-", ":");
  if (normalized === "credit:card") return "Credit card";
  if (/(^|:)checking$/.test(normalized) || /\bchecking$/.test(normalized)) return "Checking";
  if (/(^|:)savings$/.test(normalized) || /\bsavings$/.test(normalized)) return "Savings";
  return raw ? humanize(raw) : "Account type unavailable";
}
function monthLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}
function shortTime(value: string, timeZone?: string) {
  return timeZone
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }).format(new Date(value))
    : `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function sourceQualification(state?: string) {
  return state === "ok"
    ? "Current source read"
    : state === "partial"
      ? "Last confirmed · partial coverage"
      : state === "unavailable"
        ? "Last confirmed · connected source unavailable"
        : "Source not qualified";
}
function combinedSourceState(
  states: Array<string | undefined>,
): "ok" | "partial" | "unavailable" | undefined {
  return states.includes("unavailable")
    ? "unavailable"
    : states.includes("partial")
      ? "partial"
      : states.some(Boolean) && states.every((state) => state === "ok")
        ? "ok"
        : undefined;
}
