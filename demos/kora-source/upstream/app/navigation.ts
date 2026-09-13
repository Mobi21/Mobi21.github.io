import {
  Bell,
  Bot,
  CalendarClock,
  Database,
  Gauge,
  Link2,
  Monitor,
  Palette,
  Stethoscope,
  BookOpenText,
  Brain,
  Calendar,
  CalendarCheck,
  FileOutput,
  Files,
  HeartPulse,
  Activity,
  Archive,
  CalendarHeart,
  GanttChart,
  Landmark,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  ReceiptText,
  Repeat2,
  Search,
  ShieldCheck,
  Soup,
  SunMedium,
  Settings as SettingsIcon,
  Target,
  Users,
  UserRound,
  Home,
  SlidersHorizontal,
  Briefcase,
  Keyboard,
  type LucideIcon,
} from "lucide-react";

/**
 * The whole navigation model, in one place.
 *
 * Previously the six workspaces lived in App.tsx while each workspace's own
 * sub-sections lived in a per-feature nav component — `BrainNav`, `LifeNav`, the
 * Work pill, `SettingsNav`. Each of those rendered its own horizontal band, so a
 * route ended up with two or three stacked navigation bars and the content
 * started as far as 336px down. Measured across 21 routes, chrome above content
 * ranged from 44px to 336px with no two workspaces agreeing.
 *
 * Both levels are declared here. The shell Navigator consumes only workspaces;
 * feature rails and their compact local Sheets consume section definitions.
 * A workspace must not invent another navigation band or private destination
 * registry.
 */

export type NavSection = {
  to: string;
  label: string;
  description?: string;
  group?: string;
  icon?: LucideIcon;
  /** Matches only the exact path, for index routes. */
  end?: boolean;
  /** Key into the live-count record supplied by the shell. */
  countKey?: string;
  /** Additional detail-route prefixes owned by this section. */
  activePrefixes?: readonly string[];
  /** Query-state discriminator used only when an additional detail prefix matches. */
  activePrefixSearch?: string;
  /** Optional query-state discriminator when sibling destinations share a path. */
  activeSearch?: string;
  /** Query keys that make this otherwise-exact destination inactive. */
  excludeSearchKeys?: readonly string[];
};

export type Workspace = {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcutId: string;
  /** Prefix used to decide whether this workspace owns the current route. */
  match: string;
  /** Stable atmosphere name consumed by shell tokens and active navigation. */
  atmosphere: "kora" | "today" | "work" | "calendar" | "brain" | "life" | "settings";
  /** Stable global-navigation group. Local subroutes never appear here. */
  group: "Daily" | "Organize" | "System";
  /** Sub-scope nav, shown in the sidebar beneath the workspace list. */
  sections?: readonly NavSection[];
  /** Heading above the section group. */
  sectionLabel?: string;
};

export type SettingsRouteId =
  | "overview" | "appearance" | "background" | "model" | "notifications"
  | "schedules" | "integrations" | "data" | "diagnostics";
export type SettingsRouteGroup = "General" | "Kora" | "Connections" | "Privacy & data" | "Support";
export type SettingsDestinationAvailability = "always" | "native-qualified" | "known-provider";
export type SettingsDestinationFocus = {
  role: "heading" | "control";
  name: string;
};
export type SettingsNestedDestinationDefinition = {
  id: string;
  label: string;
  description: string;
  aliases: readonly string[];
  /** A stable Settings-local route event, resolved to the real heading/control below. */
  anchor?: string;
  /** Only detail destinations override their owning category route. */
  href?: string;
  focus: SettingsDestinationFocus;
  availability: SettingsDestinationAvailability;
  kind: "section" | "provider" | "flow";
};
export type SettingsRouteDefinition = {
  id: SettingsRouteId;
  group: SettingsRouteGroup;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  keywords: readonly string[];
  destinations: readonly SettingsNestedDestinationDefinition[];
};

export type SettingsDestinationDefinition = {
  id: string;
  routeId: SettingsRouteId;
  group: SettingsRouteGroup;
  label: string;
  description: string;
  aliases: readonly string[];
  href: string;
  anchor?: string;
  icon: LucideIcon;
  focus: SettingsDestinationFocus;
  availability: SettingsDestinationAvailability;
  kind: "route" | SettingsNestedDestinationDefinition["kind"];
  breadcrumb: string;
};

export type ShortcutCategory = "Navigation" | "Kora" | "Editing";
export type ShortcutDefinition = {
  keys: string;
  label: string;
  description: string;
  category: ShortcutCategory;
  /** Alternate bindings remain operable without duplicating the Settings list. */
  visible?: boolean;
};

export type RegisteredWorkspace = Omit<Workspace, "shortcutId"> & {
  id: string;
  shortcut: ShortcutDefinition;
};

export type RegisteredApplicationAction = {
  id: string;
  action: "command-palette" | "global-navigation" | "open-settings" | "side-chat" | "context";
  shortcut?: ShortcutDefinition;
  shortcutOrder?: number;
  palette?: {
    label: string;
    description: string;
    icon: LucideIcon;
    destinationId: string;
    keywords: readonly string[];
  };
};

export type RegisteredOperationalRoute = {
  id: "notifications" | "notification-detail" | "approval-detail";
  /** React Router pattern. Parameter names are schema, never observed record IDs. */
  path: string;
  loadingLabel: string;
  restorable: boolean;
  /** Operational routes are opened from their owning shell/context, not global browse surfaces. */
  globalDestination: false;
  specimen: {
    entrypoint: "notifications" | "settings-routes";
    surface: string;
  };
};

/**
 * One typed application registry owns stable locations, global commands, and
 * their actual keyboard bindings. Navigation, the command palette, shell key
 * handling, and Settings are projections of this object; none authors a
 * parallel route or shortcut list.
 */
export const APPLICATION_REGISTRY = {
  operationalRoutes: [
    {
      id: "notifications",
      path: "/notifications",
      loadingLabel: "Opening notifications",
      restorable: true,
      globalDestination: false,
      specimen: { entrypoint: "notifications", surface: "page" },
    },
    {
      id: "notification-detail",
      path: "/notifications/:notificationId",
      loadingLabel: "Opening notification",
      restorable: true,
      globalDestination: false,
      specimen: { entrypoint: "notifications", surface: "detail" },
    },
    {
      id: "approval-detail",
      path: "/approvals/:approvalId",
      loadingLabel: "Opening approval",
      restorable: true,
      globalDestination: false,
      specimen: { entrypoint: "settings-routes", surface: "approval" },
    },
  ] satisfies readonly RegisteredOperationalRoute[],
  settingsRoutes: [
    { id: "overview", group: "General", label: "Overview", description: "Kora status and important setup", href: "/settings", icon: Gauge, keywords: ["status", "setup", "summary"], destinations: [
      { id: "overview-current", label: "Current state", description: "Active model and local background behavior", aliases: ["status", "model", "background"], anchor: "current-state", focus: { role: "heading", name: "Current state" }, availability: "always", kind: "section" },
      { id: "overview-attention", label: "Needs attention", description: "Settings that need review or repair", aliases: ["warning", "repair", "setup"], anchor: "needs-attention", focus: { role: "heading", name: "Needs attention" }, availability: "always", kind: "section" },
      { id: "overview-quick", label: "Quick destinations", description: "Frequently revisited Settings categories", aliases: ["common", "frequent"], anchor: "quick-destinations", focus: { role: "heading", name: "Quick destinations" }, availability: "always", kind: "section" },
    ] },
    { id: "appearance", group: "General", label: "Appearance", description: "Theme, density, scale, and shortcuts", href: "/settings/appearance", icon: Palette, keywords: ["theme", "density", "scale", "keyboard", "shortcuts"], destinations: [
      { id: "appearance-theme", label: "Theme", description: "Follow Windows or choose light or dark", aliases: ["system", "light", "dark", "color"], anchor: "theme", focus: { role: "heading", name: "Theme" }, availability: "always", kind: "section" },
      { id: "appearance-density", label: "Density", description: "Choose comfortable or compact collection spacing", aliases: ["comfortable", "compact", "spacing"], anchor: "density", focus: { role: "heading", name: "Density" }, availability: "always", kind: "section" },
      { id: "appearance-scale", label: "Interface scale", description: "Scale the installed desktop interface", aliases: ["zoom", "90%", "100%", "110%", "125%"], anchor: "interface-scale", focus: { role: "heading", name: "Interface scale" }, availability: "native-qualified", kind: "section" },
      { id: "appearance-shortcuts", label: "Keyboard reference", description: "Search the shortcuts registered by Kora", aliases: ["keyboard", "shortcuts", "hotkeys", "keys"], anchor: "keyboard-reference", focus: { role: "heading", name: "Keyboard reference" }, availability: "always", kind: "section" },
    ] },
    { id: "background", group: "General", label: "Background & startup", description: "Resident behavior and Windows startup", href: "/settings/background", icon: Monitor, keywords: ["startup", "windows", "close", "resident"], destinations: [
      { id: "background-status", label: "Current background status", description: "Resident host configuration and health", aliases: ["health", "resident", "task"], anchor: "current-status", focus: { role: "heading", name: "Current status" }, availability: "native-qualified", kind: "section" },
      { id: "background-close", label: "When I close Kora", description: "Choose whether Kora exits or keeps running", aliases: ["exit", "quit", "resident", "tray"], anchor: "when-i-close-kora", focus: { role: "heading", name: "When I close Kora" }, availability: "native-qualified", kind: "section" },
      { id: "background-startup", label: "Start with Windows", description: "Control resident startup on this computer", aliases: ["boot", "launch", "login"], anchor: "start-with-windows", focus: { role: "heading", name: "Start with Windows" }, availability: "native-qualified", kind: "section" },
    ] },
    { id: "model", group: "Kora", label: "Model & reasoning", description: "Active model, provider, and reasoning effort", href: "/settings/model", icon: Bot, keywords: ["ai", "provider", "reasoning", "authentication"], destinations: [
      { id: "model-selection", label: "Current model selection", description: "Choose provider, model, and reasoning level", aliases: ["active model", "reasoning", "effort"], anchor: "current-selection", focus: { role: "heading", name: "Current selection" }, availability: "always", kind: "section" },
      { id: "model-authentication", label: "Model provider authentication", description: "Review or set up model-provider sign-in", aliases: ["sign in", "api key", "oauth", "credential"], anchor: "provider-authentication", focus: { role: "heading", name: "Provider authentication" }, availability: "always", kind: "section" },
    ] },
    { id: "notifications", group: "Kora", label: "Notifications", description: "Quiet hours and desktop delivery", href: "/settings/notifications", icon: Bell, keywords: ["quiet", "hours", "inbox", "interruptions"], destinations: [
      { id: "notifications-quiet-hours", label: "Quiet hours", description: "Choose when notification presentation waits", aliases: ["do not disturb", "from", "until", "interruption"], anchor: "quiet-hours", focus: { role: "heading", name: "Quiet hours" }, availability: "always", kind: "section" },
      { id: "notifications-windows", label: "Windows notifications", description: "Review system permission and desktop delivery", aliases: ["desktop", "permission", "alerts"], anchor: "windows-notifications", focus: { role: "heading", name: "Windows notifications" }, availability: "native-qualified", kind: "section" },
    ] },
    { id: "schedules", group: "Kora", label: "Schedules", description: "Recurring and one-time Kora work", href: "/settings/schedules", icon: CalendarClock, keywords: ["automation", "recurring", "runs", "timing"], destinations: [
      { id: "schedules-create", label: "Create schedule", description: "Define new recurring or one-time Kora work", aliases: ["new schedule", "automation", "recurring", "once"], href: "/settings/schedules/new", focus: { role: "heading", name: "Create schedule" }, availability: "always", kind: "flow" },
    ] },
    { id: "integrations", group: "Connections", label: "Accounts & integrations", description: "Connect, inspect, and repair services", href: "/settings/integrations", icon: Link2, keywords: ["accounts", "providers", "chrome", "github", "google", "plaid", "spotify"], destinations: [
      { id: "integration-chrome", label: "Personal Chrome", description: "Inspect the local browser connection and protected sign-ins", aliases: ["browser", "extension", "credentials"], href: "/settings/integrations/chrome-browser", focus: { role: "heading", name: "Personal Chrome" }, availability: "known-provider", kind: "provider" },
      { id: "integration-github", label: "GitHub", description: "Inspect GitHub connection, permissions, and availability", aliases: ["repositories", "git", "oauth"], href: "/settings/integrations/github", focus: { role: "heading", name: "Github" }, availability: "known-provider", kind: "provider" },
      { id: "integration-google", label: "Google Workspace", description: "Inspect Google Workspace connection and permissions", aliases: ["google", "calendar", "drive", "gmail", "oauth"], href: "/settings/integrations/google-workspace", focus: { role: "heading", name: "Google workspace" }, availability: "known-provider", kind: "provider" },
      { id: "integration-plaid", label: "Plaid", description: "Inspect financial account connection coverage", aliases: ["bank", "finance", "accounts"], href: "/settings/integrations/plaid", focus: { role: "heading", name: "Plaid" }, availability: "known-provider", kind: "provider" },
      { id: "integration-spotify", label: "Spotify", description: "Inspect Spotify availability and connection state", aliases: ["music", "provider"], href: "/settings/integrations/spotify", focus: { role: "heading", name: "Spotify" }, availability: "known-provider", kind: "provider" },
    ] },
    { id: "data", group: "Privacy & data", label: "Local data", description: "Storage, drafts, and migration", href: "/settings/data", icon: Database, keywords: ["privacy", "storage", "drafts", "migration", "delete"], destinations: [
      { id: "data-storage", label: "Stored locally", description: "Understand Kora's local storage boundaries", aliases: ["sqlite", "files", "artifacts", "indexes"], anchor: "stored-locally", focus: { role: "heading", name: "Stored locally" }, availability: "always", kind: "section" },
      { id: "data-drafts", label: "Conversation drafts", description: "Review or clear unsent local drafts", aliases: ["unsent", "clear drafts", "delete drafts"], anchor: "conversation-drafts", focus: { role: "heading", name: "Conversation drafts" }, availability: "always", kind: "section" },
      { id: "data-migration", label: "Migration review", description: "Review finite historical local-data migration", aliases: ["legacy", "historical", "older data"], anchor: "migration-review", focus: { role: "heading", name: "Migration review" }, availability: "always", kind: "section" },
    ] },
    { id: "diagnostics", group: "Support", label: "Diagnostics & about", description: "Runtime health and copy-safe support details", href: "/settings/diagnostics", icon: Stethoscope, keywords: ["health", "logs", "version", "support", "about"], destinations: [
      { id: "diagnostics-runtime", label: "Kora runtime", description: "Review runtime identity and current health", aliases: ["revision", "epoch", "timezone", "status"], anchor: "kora-runtime", focus: { role: "heading", name: "Kora runtime" }, availability: "always", kind: "section" },
      { id: "diagnostics-capabilities", label: "Capability inventory", description: "Review currently reported capability coverage", aliases: ["capability health", "tools", "providers", "resources"], anchor: "capability-inventory", focus: { role: "heading", name: "Capability inventory" }, availability: "always", kind: "section" },
      { id: "diagnostics-support", label: "Support tools", description: "Open local logs in the installed desktop app", aliases: ["logs", "troubleshoot"], anchor: "support", focus: { role: "heading", name: "Support" }, availability: "native-qualified", kind: "section" },
      { id: "diagnostics-about", label: "About Kora", description: "Version, attribution, and third-party licenses", aliases: ["version", "pi", "licenses", "credits"], anchor: "about-kora", focus: { role: "heading", name: "About Kora" }, availability: "always", kind: "section" },
    ] },
  ] satisfies readonly SettingsRouteDefinition[],
  workspaces: [
  {
    id: "workspace-kora",
    to: "/kora",
    label: "Kora",
    icon: MessageSquare,
    shortcut: { keys: "Ctrl+1", label: "Open Kora", description: "Open the conversation workspace.", category: "Navigation" },
    match: "/kora",
    atmosphere: "kora",
    group: "System",
  },
  {
    id: "workspace-today",
    to: "/life/today",
    label: "Today",
    icon: CalendarCheck,
    shortcut: { keys: "Ctrl+2", label: "Open Today", description: "Open your current day.", category: "Navigation" },
    match: "/life/today",
    atmosphere: "today",
    group: "Daily",
  },
  {
    id: "workspace-work",
    to: "/work",
    label: "Work",
    icon: Briefcase,
    shortcut: { keys: "Ctrl+3", label: "Open Work", description: "Open Work and Projects.", category: "Navigation" },
    match: "/work",
    atmosphere: "work",
    group: "Organize",
    sectionLabel: "Work",
    sections: [
      { to: "/work", label: "Overview", description: "What needs attention across your work", icon: LayoutGrid, end: true, excludeSearchKeys: ["view"] },
      { to: "/work/goals", label: "Projects", description: "Outcomes you are working toward", icon: Target, countKey: "projects", activePrefixes: ["/work/goals/"] },
      { to: "/work/tasks", label: "Tasks", description: "Actions across every goal", icon: ListTodo },
      { to: "/work/timeline", label: "Timeline", description: "Dated work and milestones", icon: GanttChart },
      { to: "/work/archive", label: "Archive", description: "Archived and recoverable Work", icon: Archive },
    ],
  },
  {
    id: "workspace-calendar",
    to: "/calendar",
    label: "Calendar",
    icon: Calendar,
    shortcut: { keys: "Ctrl+4", label: "Open Calendar", description: "Open Calendar.", category: "Navigation" },
    match: "/calendar",
    atmosphere: "calendar",
    group: "Daily",
  },
  {
    id: "workspace-brain",
    to: "/brain",
    label: "Brain",
    icon: Brain,
    shortcut: { keys: "Ctrl+5", label: "Open Brain", description: "Open your Personal Brain.", category: "Navigation" },
    match: "/brain",
    atmosphere: "brain",
    group: "Organize",
    sectionLabel: "Brain",
    sections: [
      { to: "/brain", label: "Home", icon: LayoutGrid, end: true, excludeSearchKeys: ["view"] },
      { to: "/brain?view=search", label: "Search", icon: Search, end: true, activeSearch: "view=search" },
      { to: "/brain/memory", label: "Memory", countKey: "memory" },
      { to: "/brain/pages", label: "Pages", countKey: "pages" },
      { to: "/brain/people", label: "People", countKey: "people" },
      { to: "/brain/sources", label: "Sources", countKey: "sources" },
      { to: "/brain/outputs", label: "Created", countKey: "outputs" },
    ],
  },
  {
    id: "workspace-life",
    to: "/life",
    label: "Life",
    icon: HeartPulse,
    shortcut: { keys: "Ctrl+6", label: "Open Life", description: "Open Life overview, Money, Wellbeing, and About You.", category: "Navigation" },
    match: "/life",
    atmosphere: "life",
    group: "Organize",
    sectionLabel: "Life",
    sections: [
      { to: "/life", label: "Overview", end: true },
      { to: "/life/finances", label: "Money" },
      { to: "/life/wellbeing", label: "Wellbeing" },
      { to: "/life/about-you", label: "About You", countKey: "profileFacts" },
    ],
  },
  {
    id: "workspace-settings",
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    shortcut: { keys: "Ctrl+7", label: "Switch to Settings", description: "Switch to the Settings workspace.", category: "Navigation" },
    match: "/settings",
    atmosphere: "settings",
    group: "System",
    sectionLabel: "Settings",
  },
  ] satisfies readonly RegisteredWorkspace[],
  actions: [
    { id: "go-to", action: "command-palette", shortcutOrder: 0, shortcut: { keys: "Ctrl+K", label: "Go to a page or command", description: "Open Kora's page and command navigator.", category: "Navigation" } },
    { id: "go-to-alternate", action: "command-palette", shortcut: { keys: "/", label: "Go to a page or command", description: "Open Kora's page and command navigator.", category: "Navigation", visible: false } },
    { id: "global-navigation", action: "global-navigation", shortcutOrder: 1, shortcut: { keys: "Ctrl+B", label: "Toggle navigation", description: "Open or close the global location menu.", category: "Navigation" } },
    {
      id: "open-settings",
      action: "open-settings",
      shortcutOrder: 2,
      shortcut: { keys: "Ctrl+,", label: "Open Settings overview", description: "Open the Settings overview from anywhere.", category: "Navigation" },
      palette: { label: "Open Settings", description: "Review Kora preferences and connected capabilities.", icon: SettingsIcon, destinationId: "page:/settings", keywords: ["preferences", "configuration"] },
    },
    { id: "side-chat", action: "side-chat", shortcutOrder: 10, shortcut: { keys: "Ctrl+J", label: "Toggle Kora panel", description: "Open or close Kora from any workspace.", category: "Kora" } },
    { id: "side-chat-alternate", action: "side-chat", shortcutOrder: 11, shortcut: { keys: "Ctrl+Shift+Space", label: "Toggle Kora side chat", description: "Alternate Kora side-chat shortcut.", category: "Kora" } },
    { id: "save-editor", action: "context", shortcutOrder: 12, shortcut: { keys: "Ctrl+S", label: "Save current editor", description: "Save the active Brain editor when supported.", category: "Editing" } },
    { id: "brain-search", action: "context", shortcutOrder: 13, shortcut: { keys: "Ctrl+F", label: "Search Brain", description: "Focus Brain search while in Brain.", category: "Editing" } },
    {
      id: "open-keyboard-shortcuts",
      action: "open-settings",
      palette: { label: "Keyboard shortcuts", description: "See every available Kora shortcut.", icon: Keyboard, destinationId: "page:/settings/appearance", keywords: ["keys", "hotkeys", "navigation"] },
    },
  ] satisfies readonly RegisteredApplicationAction[],
} as const;

export type OperationalRouteId = (typeof APPLICATION_REGISTRY.operationalRoutes)[number]["id"];
export const OPERATIONAL_ROUTES: readonly RegisteredOperationalRoute[] = APPLICATION_REGISTRY.operationalRoutes;

export function operationalRouteForId(id: OperationalRouteId): RegisteredOperationalRoute {
  return OPERATIONAL_ROUTES.find((route) => route.id === id)!;
}

export function pathForOperationalRoute(
  id: OperationalRouteId,
  parameters: Readonly<Record<string, string>> = {},
) {
  return operationalRouteForId(id).path.replace(/:([^/]+)/g, (_match, name: string) => {
    const value = parameters[name];
    if (!value) throw new Error(`Missing operational route parameter: ${name}`);
    return encodeURIComponent(value);
  });
}

export function matchesOperationalRoutePath(pathname: string) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const pathSegments = normalizedPath.split("/");
  return OPERATIONAL_ROUTES.some((route) => {
    if (!route.restorable) return false;
    const routeSegments = route.path.split("/");
    return routeSegments.length === pathSegments.length && routeSegments.every(
      (segment, index) => segment.startsWith(":") ? Boolean(pathSegments[index]) : segment === pathSegments[index],
    );
  });
}

export const SETTINGS_ROUTES: readonly SettingsRouteDefinition[] = APPLICATION_REGISTRY.settingsRoutes;
export const SETTINGS_GROUPS: readonly SettingsRouteGroup[] = ["General", "Kora", "Connections", "Privacy & data", "Support"];

/**
 * Searchable Settings destinations are a projection of the category registry,
 * never a second list of routes or provider state. Provider entries contain
 * only public product names; account labels and observed connection state stay
 * with the typed runtime owners that render their detail pages.
 */
export const SETTINGS_DESTINATIONS: readonly SettingsDestinationDefinition[] = SETTINGS_ROUTES.flatMap((route) => {
  const routeDestination: SettingsDestinationDefinition = {
    id: `page:${route.href}`,
    routeId: route.id,
    group: route.group,
    label: route.label,
    description: route.description,
    aliases: route.keywords,
    href: `${route.href}#setting-route-${route.id}`,
    anchor: `route-${route.id}`,
    icon: route.icon,
    focus: { role: "heading", name: route.label === "Overview" ? "Settings" : route.label },
    availability: "always",
    kind: "route",
    breadcrumb: `Settings / ${route.group}`,
  };
  return [routeDestination, ...route.destinations.map<SettingsDestinationDefinition>((destination) => ({
    ...destination,
    routeId: route.id,
    group: route.group,
    href: `${destination.href ?? route.href}${destination.anchor ? `#setting-${destination.anchor}` : ""}`,
    icon: route.icon,
    breadcrumb: `Settings / ${route.group} / ${route.label}`,
  }))];
});

const registeredWorkspaces = APPLICATION_REGISTRY.workspaces;
export const WORKSPACES: readonly Workspace[] = registeredWorkspaces
  .filter((workspace) => workspace.id !== "workspace-settings")
  .map(({ id, shortcut: _shortcut, ...workspace }) => ({ ...workspace, shortcutId: id }));

/** Pinned to the foot of the sidebar rather than sitting in the main list. */
const settingsWorkspace = registeredWorkspaces.find((workspace) => workspace.id === "workspace-settings")!;
export const SETTINGS_WORKSPACE: Workspace = {
  ...settingsWorkspace,
  shortcutId: settingsWorkspace.id,
  sections: SETTINGS_ROUTES.map((route, index) => ({
    to: route.href,
    label: route.label,
    description: route.description,
    group: route.group,
    icon: route.icon,
    end: index === 0,
  })),
};

/** Keyboard and command-palette order. Settings remains visually pinned. */
export const ALL_WORKSPACES: readonly Workspace[] = [...WORKSPACES, SETTINGS_WORKSPACE];

export const NAVIGATION_GROUPS = (["Daily", "Organize", "System"] as const).map((label) => ({
  label,
  workspaces: ALL_WORKSPACES.filter((workspace) => workspace.group === label),
}));

/** Icons for the sub-scope rows, kept separate so the sidebar stays icon-light. */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  "/settings": Gauge,
  "/settings/schedules": CalendarClock,
  "/settings/notifications": Bell,
  "/settings/integrations": Link2,
  "/settings/model": Bot,
  "/settings/background": Monitor,
  "/settings/appearance": Palette,
  "/settings/data": Database,
  "/settings/diagnostics": Stethoscope,
  "/brain": LayoutGrid,
  "/brain/memory": Brain,
  "/brain/pages": BookOpenText,
  "/brain/people": Users,
  "/brain/sources": Files,
  "/brain/outputs": FileOutput,
};

export type NavigationScope = {
  label: string;
  match: string;
  parent?: { to: string; label: string };
  sections: readonly NavSection[];
};

export const MONEY_SECTIONS: readonly NavSection[] = [
  { to: "/life/finances", label: "Overview", description: "Your current money picture", group: "Review", icon: LayoutGrid, end: true },
  { to: "/life/finances/activity", label: "Activity", description: "Qualified money movement", group: "Review", icon: ReceiptText },
  { to: "/life/finances/plan", label: "Plan", description: "Intentions, buffers, and targets", group: "Plan ahead", icon: Target },
  { to: "/life/finances/recurring", label: "Recurring", description: "Bills and subscriptions", group: "Plan ahead", icon: Repeat2 },
  { to: "/life/finances/accounts", label: "Accounts & sources", description: "Coverage and connected sources", group: "Control", icon: Landmark },
];

export const WELLBEING_SECTIONS: readonly NavSection[] = [
  { to: "/life/wellbeing", label: "Today", description: "Your day at a glance", group: "Today", icon: SunMedium, end: true },
  { to: "/life/wellbeing/food", label: "Food", description: "Meals and drinks you remember", group: "Track", icon: Soup },
  { to: "/life/wellbeing/care", label: "Care", description: "Appointments, observations, and documents", group: "Track", icon: CalendarHeart },
  { to: "/life/wellbeing/routines", label: "Routines", description: "The rhythms you want to keep", group: "Track", icon: Activity },
  { to: "/life/wellbeing/trends", label: "Trends", description: "Patterns with their evidence and gaps", group: "Understand & control", icon: GanttChart },
  { to: "/life/wellbeing/records", label: "Records", description: "Review and correct your history", group: "Understand & control", icon: Files },
  { to: "/life/wellbeing/privacy", label: "Privacy", description: "How your personal records are handled", group: "Understand & control", icon: ShieldCheck },
];

export const ABOUT_YOU_SECTIONS: readonly NavSection[] = [
  { to: "/life/about-you", label: "Overview", description: "A readable portrait backed by saved facts", group: "Understand", icon: LayoutGrid, end: true, activePrefixes: ["/life/about-you/facts/"] },
  { to: "/life/about-you/identity", label: "Identity", description: "Names, language, location, and address", group: "Your context", icon: UserRound, activePrefixes: ["/life/about-you/facts/"], activePrefixSearch: "from=identity" },
  { to: "/life/about-you/communication", label: "Communication", description: "How you prefer information and choices", group: "Your context", icon: MessageSquare, activePrefixes: ["/life/about-you/facts/"], activePrefixSearch: "from=communication" },
  { to: "/life/about-you/household", label: "Household", description: "Stable home and household context", group: "Your context", icon: Home, activePrefixes: ["/life/about-you/facts/"], activePrefixSearch: "from=household" },
  { to: "/life/about-you/preferences", label: "Needs & preferences", description: "Needs and preferences worth remembering", group: "Your context", icon: SlidersHorizontal, activePrefixes: ["/life/about-you/facts/"], activePrefixSearch: "from=preferences" },
  { to: "/life/about-you/privacy", label: "Boundaries & privacy", description: "Rules Kora must respect and use boundaries", group: "Control", icon: ShieldCheck, activePrefixes: ["/life/about-you/facts/"], activePrefixSearch: "from=privacy" },
];

/** The most-specific page family for the current route. */
export const NAVIGATION_SCOPES: readonly NavigationScope[] = [
  { label: "Money", match: "/life/finances", parent: { to: "/life", label: "Life" }, sections: MONEY_SECTIONS },
  { label: "Wellbeing", match: "/life/wellbeing", parent: { to: "/life", label: "Life" }, sections: WELLBEING_SECTIONS },
  { label: "About You", match: "/life/about-you", parent: { to: "/life", label: "Life" }, sections: ABOUT_YOU_SECTIONS },
  ...ALL_WORKSPACES.filter((workspace) => workspace.sections?.length).map((workspace) => ({
    label: workspace.sectionLabel ?? workspace.label,
    match: workspace.match,
    sections: workspace.sections!,
  })),
];

export function navigationScopeForPath(pathname: string): NavigationScope | undefined {
  return NAVIGATION_SCOPES
    .filter((scope) => pathname === scope.match || pathname.startsWith(`${scope.match}/`))
    .sort((left, right) => right.match.length - left.match.length)[0];
}

export function sectionOwnsPath(section: NavSection, pathname: string) {
  return sectionOwnsLocation(section, pathname, "");
}

function searchMatches(expectedSearch: string | undefined, params: URLSearchParams) {
  if (!expectedSearch) return true;
  const expected = new URLSearchParams(expectedSearch);
  return [...expected].every(([key, value]) => params.get(key) === value);
}

export function navigationSectionForLocation(sections: readonly NavSection[], pathname: string, search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const routeOwner = sections.find((section) => {
    const sectionPath = section.to.split("?")[0];
    const routeMatches = section.end
      ? pathname === sectionPath
      : pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
    return routeMatches
      && searchMatches(section.activeSearch, params)
      && !section.excludeSearchKeys?.some((key) => params.has(key));
  });
  if (routeOwner) return routeOwner;

  const prefixOwners = sections.filter((section) =>
    section.activePrefixes?.some((prefix) => pathname.startsWith(prefix)),
  );
  return prefixOwners.find((section) =>
    Boolean(section.activePrefixSearch) && searchMatches(section.activePrefixSearch, params),
  ) ?? prefixOwners.find((section) => !section.activePrefixSearch);
}

export function sectionOwnsLocation(section: NavSection, pathname: string, search = "") {
  return navigationSectionForLocation([section], pathname, search) === section;
}

export function navigationLocationForPath(pathname: string, search = "") {
  const workspace = workspaceForPath(pathname);
  const scope = navigationScopeForPath(pathname);
  const section = scope ? navigationSectionForLocation(scope.sections, pathname, search) : undefined;
  if (!scope || !section) return workspace?.label ?? "Kora";
  return `${scope.label} / ${section.label}`;
}

export type NavigationDestination = {
  id: string;
  to: string;
  label: string;
  context: string;
  kind: "page" | "setting";
  icon: LucideIcon;
  shortcutId?: string;
  keywords: readonly string[];
  description?: string;
};

/**
 * Shared page registry consumed by global navigation and command surfaces.
 *
 * Detail routes and records remain owned by their domain. This list contains
 * only stable destinations a person can intentionally browse to, so command
 * history never persists record titles, provider data, or opaque identifiers.
 */
export const NAVIGATION_DESTINATIONS: readonly NavigationDestination[] = ALL_WORKSPACES
  .filter((workspace) => workspace.to !== "/settings")
  .flatMap((workspace) => {
  const rootSection = workspace.sections?.find((section) => section.to === workspace.to);
  const root: NavigationDestination = {
    id: `page:${workspace.to}`,
    to: workspace.to,
    label: rootSection?.label ?? workspace.label,
    context: workspace.label,
    kind: workspace.to === "/settings" ? "setting" : "page",
    icon: workspace.icon,
    shortcutId: workspace.shortcutId,
    keywords: [workspace.label, workspace.group, rootSection?.label ?? ""].filter(Boolean),
  };
  const sections = (workspace.sections ?? [])
    .filter((section) => section.to !== workspace.to)
    .map<NavigationDestination>((section) => ({
      id: `page:${section.to}`,
      to: section.to,
      label: section.label,
      context: workspace.label,
      kind: workspace.to === "/settings" ? "setting" : "page",
      icon: section.icon ?? SECTION_ICONS[section.to] ?? workspace.icon,
      keywords: [workspace.label, workspace.group, section.label],
    }));
  return [root, ...sections];
}).concat(
  [
    { context: "Money", root: "/life/finances", sections: MONEY_SECTIONS },
    { context: "Wellbeing", root: "/life/wellbeing", sections: WELLBEING_SECTIONS },
    { context: "About You", root: "/life/about-you", sections: ABOUT_YOU_SECTIONS },
  ].flatMap(({ context, root, sections }) => sections
    .filter((section) => section.to !== root)
    .map<NavigationDestination>((section) => ({
      id: `page:${section.to}`,
      to: section.to,
      label: section.label,
      context,
      kind: "page",
      icon: section.icon ?? SECTION_ICONS[section.to] ?? HeartPulse,
      keywords: [context, section.group ?? "", section.label, section.description ?? ""].filter(Boolean),
    }))),
  SETTINGS_DESTINATIONS.map<NavigationDestination>((destination) => ({
    id: destination.id,
    to: destination.href,
    label: destination.label,
    context: destination.breadcrumb,
    description: destination.description,
    kind: "setting",
    icon: destination.icon,
    shortcutId: destination.kind === "route" && destination.routeId === "overview" ? SETTINGS_WORKSPACE.shortcutId : undefined,
    keywords: [destination.breadcrumb, destination.description, ...destination.aliases],
  })),
);

export function destinationForPath(pathname: string): NavigationDestination | undefined {
  const basePath = pathname.split(/[?#]/, 1)[0];
  return NAVIGATION_DESTINATIONS
    .filter((destination) => destination.to.includes("?")
      ? pathname === destination.to
      : (() => {
        const destinationPath = destination.to.split("#", 1)[0];
        return basePath === destinationPath || basePath.startsWith(`${destinationPath}/`);
      })())
    .sort((a, b) => {
      const pathSpecificity = b.to.split(/[?#]/, 1)[0].length - a.to.split(/[?#]/, 1)[0].length;
      if (pathSpecificity) return pathSpecificity;
      // Query and fragment destinations are deliberate sub-locations of a
      // shared route. Prefer the exact registered location over its plain
      // route so history/search never silently collapse it to the parent.
      const aExact = a.to === pathname ? 1 : 0;
      const bExact = b.to === pathname ? 1 : 0;
      return bExact - aExact;
    })[0];
}

export function destinationForId(id: string): NavigationDestination | undefined {
  return NAVIGATION_DESTINATIONS.find((destination) => destination.id === id);
}

export function workspaceForPath(pathname: string): Workspace | undefined {
  // Longest match wins so /work/projects resolves to Work, not to /.
  return ALL_WORKSPACES
    .filter((w) => pathname === w.match || pathname.startsWith(`${w.match}/`))
    .sort((a, b) => b.match.length - a.match.length)[0];
}

export function atmosphereForPath(pathname: string): Workspace["atmosphere"] {
  if (pathname.startsWith("/notifications") || pathname.startsWith("/approvals/")) return "settings";
  return workspaceForPath(pathname)?.atmosphere ?? "kora";
}
