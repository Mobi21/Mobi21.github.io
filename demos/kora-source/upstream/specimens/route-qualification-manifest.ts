/**
 * Browser qualification inventory for the reconstructed product UI.
 *
 * Every entry loads a real localhost specimen owner. The inventory is kept
 * deliberately separate from product navigation: these URLs are synthetic,
 * sanitized review surfaces, not additional application routes or state.
 * Conversation presentation is included through isolated component fixtures;
 * agent execution and private runtime internals are not exercised here.
 */
export const routeQualificationViewports = [
  { id: "wide-2560", width: 2560, height: 1440 },
  { id: "desktop-1920", width: 1920, height: 1080 },
  { id: "desktop-1440", width: 1440, height: 900 },
  { id: "desktop-1280", width: 1280, height: 720 },
  { id: "intermediate-960", width: 960, height: 768 },
  { id: "minimum-680", width: 680, height: 620 },
] as const;

export type RouteQualificationViewport = (typeof routeQualificationViewports)[number];

export type RouteQualificationTarget = {
  id: string;
  family: "shell" | "shared" | "today" | "work" | "calendar" | "life" | "money" | "wellbeing" | "about-you" | "brain" | "settings" | "notifications" | "conversation";
  label: string;
  href: `/specimens/${string}.html${string}`;
};

const settings = (id: string, label: string, surface: string, fixture = "populated"): RouteQualificationTarget => ({
  id: `settings-${id}`,
  family: "settings",
  label,
  href: `/specimens/settings-routes.html?surface=${surface}&fixture=${fixture}`,
});

const brain = (id: string, label: string, surface: string, mode = "list", fixture = "populated"): RouteQualificationTarget => ({
  id: `brain-${id}`,
  family: "brain",
  label,
  href: `/specimens/brain-routes.html?surface=${surface}&mode=${mode}&fixture=${fixture}`,
});

export const routeQualificationTargets: readonly RouteQualificationTarget[] = [
  { id: "shell", family: "shell", label: "Shared product shell", href: "/specimens/shell.html?state=degraded&route=%2Fwork" },
  { id: "foundation", family: "shared", label: "Foundation primitives", href: "/specimens/foundation.html" },
  { id: "foundation-light", family: "shared", label: "Foundation primitives · light", href: "/specimens/foundation.html?theme=light" },
  { id: "command-palette", family: "shared", label: "Command palette", href: "/specimens/command-palette.html" },
  { id: "dialog", family: "shared", label: "Dialog", href: "/specimens/dialog.html?fixture=confirm" },
  { id: "sheet", family: "shared", label: "Sheet", href: "/specimens/sheet.html" },
  { id: "menu", family: "shared", label: "Menu", href: "/specimens/menu.html" },
  { id: "popover", family: "shared", label: "Popover", href: "/specimens/popover.html?fixture=status" },
  { id: "toast", family: "shared", label: "Toast", href: "/specimens/toast.html" },
  { id: "tooltip", family: "shared", label: "Tooltip", href: "/specimens/tooltip.html" },
  { id: "disclosure", family: "shared", label: "Disclosure", href: "/specimens/disclosure.html?fixture=status" },
  { id: "page-frame", family: "shared", label: "Page frame", href: "/specimens/page-frame.html" },
  { id: "page-header", family: "shared", label: "Page header", href: "/specimens/page-header.html" },
  { id: "page-tabs", family: "shared", label: "Page tabs", href: "/specimens/page-tabs.html" },
  { id: "page-toolbar", family: "shared", label: "Page toolbar", href: "/specimens/page-toolbar.html" },
  { id: "page-section", family: "shared", label: "Page section", href: "/specimens/page-section.html" },
  { id: "accessible-chart", family: "shared", label: "Accessible chart", href: "/specimens/accessible-chart.html" },
  { id: "dense-data-table", family: "shared", label: "Dense data table", href: "/specimens/dense-data-table.html" },
  { id: "today", family: "today", label: "Today", href: "/specimens/today.html?fixture=populated" },

  { id: "work-goals", family: "work", label: "Work · Goals", href: "/specimens/work-goals.html?fixture=populated" },
  { id: "work-goal-detail", family: "work", label: "Work · Goal detail", href: "/specimens/work-goal-detail.html?fixture=populated" },
  { id: "work-tasks", family: "work", label: "Work · Tasks", href: "/specimens/work-tasks.html?fixture=populated" },
  { id: "work-task-detail", family: "work", label: "Work · Task detail", href: "/specimens/work-task-detail.html?fixture=populated" },
  { id: "work-timeline", family: "work", label: "Work · Timeline", href: "/specimens/work-timeline.html?fixture=populated" },
  { id: "work-archive", family: "work", label: "Work · Archive", href: "/specimens/work-archive.html?fixture=populated" },

  { id: "calendar", family: "calendar", label: "Calendar", href: "/specimens/calendar-workspace.html?fixture=connected-populated" },
  { id: "calendar-event-detail", family: "calendar", label: "Calendar · Event detail", href: "/specimens/calendar-workspace.html?fixture=event-current" },

  { id: "life-overview", family: "life", label: "Life overview", href: "/specimens/life-overview.html?fixture=one-focal" },
  { id: "money-overview", family: "money", label: "Money · Overview", href: "/specimens/money-overview.html?fixture=current-populated" },
  { id: "money-activity", family: "money", label: "Money · Activity", href: "/specimens/money-activity.html?fixture=twelve-current" },
  { id: "money-plan", family: "money", label: "Money · Plan", href: "/specimens/money-plan.html?fixture=populated" },
  { id: "money-recurring", family: "money", label: "Money · Recurring", href: "/specimens/money-recurring.html?fixture=populated" },
  { id: "money-accounts", family: "money", label: "Money · Accounts", href: "/specimens/money-accounts.html?fixture=populated" },

  { id: "wellbeing-today", family: "wellbeing", label: "Wellbeing · Today", href: "/specimens/wellbeing-today.html?fixture=populated" },
  { id: "wellbeing-food", family: "wellbeing", label: "Wellbeing · Food", href: "/specimens/wellbeing-food.html?fixture=populated" },
  { id: "wellbeing-routines", family: "wellbeing", label: "Wellbeing · Routines", href: "/specimens/wellbeing-routines.html?fixture=populated" },
  { id: "wellbeing-care", family: "wellbeing", label: "Wellbeing · Care", href: "/specimens/wellbeing-care.html?fixture=populated" },
  { id: "wellbeing-trends", family: "wellbeing", label: "Wellbeing · Trends", href: "/specimens/wellbeing-trends.html?fixture=populated" },
  { id: "wellbeing-records", family: "wellbeing", label: "Wellbeing · Records", href: "/specimens/wellbeing-records.html?fixture=populated" },
  { id: "wellbeing-privacy", family: "wellbeing", label: "Wellbeing · Privacy", href: "/specimens/wellbeing-privacy.html?fixture=read-only" },
  { id: "about-you", family: "about-you", label: "About You", href: "/specimens/about-you.html?fixture=populated" },

  { id: "brain-overview", family: "brain", label: "Brain overview", href: "/specimens/brain-overview.html?fixture=populated" },
  brain("memory", "Brain · Memory", "memory"),
  brain("memory-detail", "Brain · Memory detail", "memory", "detail"),
  brain("pages", "Brain · Pages", "pages"),
  brain("page-detail", "Brain · Page detail", "pages", "detail"),
  brain("page-new", "Brain · New page", "pages", "new"),
  brain("page-edit", "Brain · Edit page", "pages", "edit"),
  brain("people", "Brain · People", "people"),
  brain("person-detail", "Brain · Person detail", "people", "detail"),
  brain("person-new", "Brain · New person", "people", "new"),
  brain("person-edit", "Brain · Edit person", "people", "edit"),
  brain("sources", "Brain · Sources", "sources"),
  brain("source-detail", "Brain · Source detail", "sources", "detail"),
  brain("source-new", "Brain · New source", "sources", "new"),
  brain("source-edit", "Brain · Edit source", "sources", "edit"),
  brain("created", "Brain · Created", "created"),
  brain("created-detail", "Brain · Created detail", "created", "detail"),
  settings("overview", "Settings · Overview", "overview"),
  settings("schedules", "Settings · Schedules", "schedules"),
  settings("schedule-new", "Settings · New schedule", "schedule-new"),
  settings("schedule-detail", "Settings · Schedule detail", "schedule-detail", "enabled"),
  settings("schedule-run", "Settings · Schedule run", "schedule-run", "run-finished"),
  settings("notifications", "Settings · Notifications", "notifications"),
  settings("integrations", "Settings · Integrations", "integrations"),
  settings("integration-detail", "Settings · Integration detail", "integration-detail", "provider-connected"),
  settings("model", "Settings · Model", "model"),
  settings("model-provider", "Settings · Model provider", "model-provider"),
  settings("background", "Settings · Background", "background", "native-absent"),
  settings("appearance", "Settings · Appearance", "appearance", "theme-dark"),
  settings("data", "Settings · Data", "data"),
  settings("diagnostics", "Settings · Diagnostics", "diagnostics", "diagnostics-healthy"),
  settings("approval-detail", "Approval detail", "approval", "approval-valid"),

  { id: "notifications", family: "notifications", label: "Notifications", href: "/specimens/notifications.html?surface=page&fixture=mixed" },
  { id: "notification-detail", family: "notifications", label: "Notification detail", href: "/specimens/notifications.html?surface=detail&fixture=mixed" },
  { id: "conversation-reading", family: "conversation", label: "Conversation · Reading", href: "/specimens/conversation.html?fixture=populated" },
  { id: "conversation-statuses", family: "conversation", label: "Conversation · Activity states", href: "/specimens/conversation.html?fixture=statuses" },
  { id: "conversation-streaming", family: "conversation", label: "Conversation · Streaming", href: "/specimens/conversation.html?fixture=streaming" },
  { id: "conversation-approvals", family: "conversation", label: "Conversation · Approvals", href: "/specimens/conversation.html?fixture=approvals" },
  { id: "conversation-stress", family: "conversation", label: "Conversation · Long content", href: "/specimens/conversation.html?fixture=stress" },
] as const;
