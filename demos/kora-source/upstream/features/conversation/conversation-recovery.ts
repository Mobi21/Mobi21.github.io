import type { ConversationRunFailure } from "../../lib/runtime";

export type ConversationFailureRecovery = {
  kind: "open_model_access" | "retry" | "edit";
  label: "Open model access" | "Retry request" | "Edit request";
  description: string;
};

export type ConversationRetryAttempt = { failedRunId: string; clientRequestId: string };

export function conversationRetryAttempt(
  current: ConversationRetryAttempt | undefined,
  failedRunId: string,
  createRequestId: () => string,
): ConversationRetryAttempt {
  return current?.failedRunId === failedRunId
    ? current
    : { failedRunId, clientRequestId: createRequestId() };
}

export function conversationFailureRecovery(
  failure?: ConversationRunFailure,
  modelAccess?: "unknown" | "ready" | "authentication_required" | "selected_model_unavailable",
): ConversationFailureRecovery {
  if (failure?.code === "selected_model_unavailable") return {
    kind: "open_model_access",
    label: "Open model access",
    description: "Choose a model available to this account, then retry the preserved request.",
  };
  if (failure?.category === "authentication") {
    if (modelAccess === undefined || modelAccess === "authentication_required") return {
      kind: "open_model_access",
      label: "Open model access",
      description: "Sign in or choose an available provider, then retry the preserved request.",
    };
    return {
      kind: "retry",
      label: "Retry request",
      description: "Model access changed. Retry the preserved canonical request.",
    };
  }
  if (failure?.retryable === false) return {
    kind: "edit",
    label: "Edit request",
    description: "The request is preserved so you can update the unavailable input.",
  };
  return {
    kind: "retry",
    label: "Retry request",
    description: "Your request is preserved and can be retried safely.",
  };
}

export function createModelAccessEvent(provider?: string): CustomEvent<{ provider?: string }> {
  return new CustomEvent("kora:open-model-control", {
    detail: provider ? { provider } : {},
  });
}
