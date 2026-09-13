import type { LifeTodayFeed } from "../lib/runtime";

export const TODAY_LARGE_DECISION_COUNT = 20;

/** Synthetic-only decisions for the Today scale contract. */
export function createSyntheticTodayDecisions(
  template: LifeTodayFeed["pendingConfirmations"][number],
): LifeTodayFeed["pendingConfirmations"] {
  return Array.from({ length: TODAY_LARGE_DECISION_COUNT }, (_, index) => {
    const position = index + 1;
    return {
      ...template,
      id: `synthetic-decision-${position}`,
      argumentsHash: `synthetic-fixture-${position}`,
      owner: {
        kind: "foreground" as const,
        sessionId: `synthetic-session-${position}`,
        nativeRunId: `synthetic-run-${position}`,
        toolCallId: `synthetic-call-${position}`,
      },
      presentation: {
        action: `Review synthetic external change ${position}`,
        target: `Synthetic record ${position}`,
        consequence: "This deterministic fixture models an external consequence without contacting a provider or changing product state.",
        risk: "external" as const,
      },
    };
  });
}
