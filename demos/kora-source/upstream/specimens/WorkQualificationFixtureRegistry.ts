/**
 * Deterministic localhost-only states used to qualify the Work route family.
 * These labels are presentation evidence, not a second Work state model.
 */
export const WORK_GOALS_FIXTURES = [
  "populated", "loading", "empty", "filtered-empty", "partial",
  "stale", "offline", "unavailable", "background-error", "archived-terminal",
  "large", "long-copy",
] as const;

export const WORK_TASKS_FIXTURES = [
  "populated", "loading", "empty", "filtered-empty", "partial-goal",
  "stale", "offline", "unavailable", "background-error", "next-page-error",
  "terminal", "archived-terminal", "large", "long-copy", "move-conflict", "bulk-failure",
] as const;

export const WORK_GOAL_DETAIL_FIXTURES = [
  "populated", "loading", "empty-work", "partial", "terminal", "archived",
  "stale", "offline", "missing", "unavailable", "deletion-recoverable",
  "deletion-expired", "deletion-stale", "deletion-uncertain", "large", "long-copy",
] as const;

export const WORK_TASK_DETAIL_FIXTURES = [
  "populated", "standalone", "empty", "blocked", "completed-result",
  "completed-no-result", "cancelled", "archived", "loading", "stale", "offline",
  "unavailable", "missing", "partial", "pagination", "focus-failure",
  "deletion-recoverable", "deletion-expired", "deletion-stale", "deletion-uncertain",
  "long-copy",
] as const;

export const WORK_TIMELINE_FIXTURES = [
  "populated", "spanning-range", "sparse", "loading", "true-empty", "range-empty", "partial-goals",
  "partial-items", "stale", "offline",
  "unavailable", "retry-success", "pagination", "next-page-error", "unscheduled-mix",
  "single-date-goals", "terminal", "long-copy", "large", "date-edit", "date-conflict",
  "date-save-error", "timezone-east", "timezone-west", "kora-review",
] as const;

export const WORK_ARCHIVE_FIXTURES = [
  "populated", "goals-only", "tasks-only", "loading", "true-empty", "filtered-empty",
  "partial-goals", "partial-tasks", "unqualified-active-result",
  "stale", "offline", "unavailable", "retry-success", "pagination-before-first-archive",
  "next-page-error", "restore-active", "restore-planned", "restore-conflict",
  "restore-error", "restore-record-gone", "dirty-dismiss",
  "long-copy", "large", "no-recovery-horizon",
] as const;
