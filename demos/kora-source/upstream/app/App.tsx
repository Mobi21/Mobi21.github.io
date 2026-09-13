import { Popover } from "@base-ui/react/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GripHorizontal,
  KeyRound,
  Maximize2,
  MessageCircleMore,
  Minimize2,
  PanelLeftOpen,
  Plus,
  RotateCw,
  Search,
  ShieldAlert,
  WifiOff,
  X,
} from "lucide-react";
import {
  animate as animateMotion,
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createHashRouter,
  createMemoryRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  isRemoteDevelopment,
  runtime,
  type ConversationContextReference,
  type ConversationContextRequest,
  type ConversationContextSelection,
  type NativeNotification,
  type SessionMetadata,
} from "../lib/runtime";
import { hasDraft, restoreRoute, saveRoute } from "../lib/persistence";
import {
  clearActivationFromHash,
  consumeSessionActivation,
} from "../lib/activation";
import { requestSessionTransition } from "../lib/session-transition";
import { DUR, EASE, SPRING } from "../lib/motion";
import {
  Button,
  Disclosure,
  IconButton,
  KoraPresenceMark,
  Popover as KoraPopover,
  Pressable,
  Sheet,
  StatusText,
  ToastProvider,
  TooltipProvider,
} from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { LocalRecoveryControls } from "../components/LocalRecoveryControls";
import { ConversationBoundary } from "../features/conversation/ConversationBoundary";
import {
  ConversationRail,
  type ConversationRailView,
} from "../features/conversation/ConversationRail";
import { BrainLayout } from "../features/brain/BrainLayout";
import { BrainOriginReturn } from "../features/brain/BrainOriginReturn";
import { WorkOriginReturn } from "../features/work/WorkNavigation";
import { TodayOriginReturn } from "../features/life/TodayOriginReturn";
import { LifeLayout } from "../features/life/LifeLayout";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { useConnection } from "./connection-context";
import { recordTitle } from "../lib/language";
import { Navigator } from "./Navigator";
import { NavigationToggle } from "./NavigationToggle";
import { ViewBar, ViewBarProvider } from "./ViewBar";
import { RuntimeStopGuard } from "./RuntimeStopGuard";
import { CommandPalette } from "./CommandPalette";
import { searchPaletteRecords } from "./palette-search";
import { rememberCommandDestination } from "./command-history";
import { WindowControls } from "./WindowControls";
import {
  ALL_WORKSPACES,
  atmosphereForPath,
  matchesOperationalRoutePath,
  operationalRouteForId,
  workspaceForPath,
} from "./navigation";
import { globalShortcutForKeyboardEvent } from "./shortcut-registry";
import { InvalidRouteRecovery } from "./InvalidRouteRecovery";
import { ApplicationRouteError } from "./ApplicationRouteError";
import { isConversationContextSelection } from "../features/conversation/conversation-context";
import { DirtyDraftGuardProvider } from "./DirtyDraftGuard";
import {
  notificationAvailabilityForError,
  NotificationAvailabilityView,
  NotificationFeed,
  NotificationLoading,
} from "../features/notifications/NotificationFeed";

const ConversationWorkspace = lazy(() =>
  import("../features/conversation/ConversationWorkspace").then((module) => ({
    default: module.ConversationWorkspace,
  })),
);
const CalendarWorkspace = lazy(() =>
  import("../features/calendar/CalendarWorkspace").then((module) => ({
    default: module.CalendarWorkspace,
  })),
);
const WorkTasksWorkspace = lazy(() =>
  import("../features/work/WorkTasksWorkspace").then((module) => ({
    default: module.WorkTasksWorkspace,
  })),
);
const WorkOverviewWorkspace = lazy(() =>
  import("../features/work/WorkOverviewWorkspace").then((module) => ({
    default: module.WorkOverviewWorkspace,
  })),
);
const WorkTimelineWorkspace = lazy(() =>
  import("../features/work/WorkTimelineWorkspace").then((module) => ({
    default: module.WorkTimelineWorkspace,
  })),
);
const WorkArchiveWorkspace = lazy(() =>
  import("../features/work/WorkArchiveWorkspace").then((module) => ({
    default: module.WorkArchiveWorkspace,
  })),
);
const ProjectsWorkspace = lazy(() =>
  import("../features/work/ProjectsWorkspace").then((module) => ({
    default: module.ProjectsWorkspace,
  })),
);
const ProjectWorkspace = lazy(() =>
  import("../features/work/ProjectWorkspace").then((module) => ({
    default: module.ProjectWorkspace,
  })),
);
const WorkItemWorkspace = lazy(() =>
  import("../features/work/WorkItemWorkspace").then((module) => ({
    default: module.WorkItemWorkspace,
  })),
);
const BrainOverview = lazy(() =>
  import("../features/brain/BrainOverview").then((module) => ({
    default: module.BrainOverview,
  })),
);
const MemoryWorkspace = lazy(() =>
  import("../features/brain/MemoryWorkspace").then((module) => ({
    default: module.MemoryWorkspace,
  })),
);
const PagesWorkspace = lazy(() =>
  import("../features/brain/PagesWorkspace").then((module) => ({
    default: module.PagesWorkspace,
  })),
);
const PeopleWorkspace = lazy(() =>
  import("../features/brain/PeopleWorkspace").then((module) => ({
    default: module.PeopleWorkspace,
  })),
);
const SourcesWorkspace = lazy(() =>
  import("../features/brain/SourcesWorkspace").then((module) => ({
    default: module.SourcesWorkspace,
  })),
);
const OutputsWorkspace = lazy(() =>
  import("../features/brain/OutputsWorkspace").then((module) => ({
    default: module.OutputsWorkspace,
  })),
);
const TodayWorkspace = lazy(() =>
  import("../features/life/TodayWorkspace").then((module) => ({
    default: module.TodayWorkspace,
  })),
);
const LifeOverviewWorkspace = lazy(() =>
  import("../features/life/LifeOverviewWorkspace").then((module) => ({
    default: module.LifeOverviewWorkspace,
  })),
);
const FinancesWorkspace = lazy(() =>
  import("../features/life/FinancesWorkspace").then((module) => ({
    default: module.FinancesWorkspace,
  })),
);
const MoneyActivityWorkspace = lazy(() =>
  import("../features/life/MoneyActivityWorkspace").then((module) => ({
    default: module.MoneyActivityWorkspace,
  })),
);
const MoneyPlanWorkspace = lazy(() =>
  import("../features/life/MoneyPlanWorkspace").then((module) => ({
    default: module.MoneyPlanWorkspace,
  })),
);
const MoneyRecurringWorkspace = lazy(() =>
  import("../features/life/MoneyRecurringWorkspace").then((module) => ({
    default: module.MoneyRecurringWorkspace,
  })),
);
const MoneyAccountsWorkspace = lazy(() =>
  import("../features/life/MoneyAccountsWorkspace").then((module) => ({
    default: module.MoneyAccountsWorkspace,
  })),
);
const LifeProfileWorkspace = lazy(() =>
  import("../features/life/LifeProfileWorkspace").then((module) => ({
    default: module.LifeProfileWorkspace,
  })),
);
const WellbeingTodayWorkspace = lazy(() =>
  import("../features/life/WellbeingTodayWorkspace").then((module) => ({
    default: module.WellbeingTodayWorkspace,
  })),
);
const WellbeingFoodWorkspace = lazy(() =>
  import("../features/life/WellbeingFoodWorkspace").then((module) => ({
    default: module.WellbeingFoodWorkspace,
  })),
);
const WellbeingCareWorkspace = lazy(() =>
  import("../features/life/WellbeingCareWorkspace").then((module) => ({
    default: module.WellbeingCareWorkspace,
  })),
);
const WellbeingRoutinesWorkspace = lazy(() =>
  import("../features/life/WellbeingRoutinesWorkspace").then((module) => ({
    default: module.WellbeingRoutinesWorkspace,
  })),
);
const WellbeingTrendsWorkspace = lazy(() =>
  import("../features/life/WellbeingTrendsWorkspace").then((module) => ({
    default: module.WellbeingTrendsWorkspace,
  })),
);
const WellbeingRecordsWorkspace = lazy(() =>
  import("../features/life/WellbeingRecordsWorkspace").then((module) => ({
    default: module.WellbeingRecordsWorkspace,
  })),
);
const WellbeingPrivacyWorkspace = lazy(() =>
  import("../features/life/WellbeingPrivacyWorkspace").then((module) => ({
    default: module.WellbeingPrivacyWorkspace,
  })),
);
const SettingsWorkspace = lazy(() =>
  import("../features/settings").then((module) => ({
    default: module.SettingsWorkspace,
  })),
);
const MotionButton = motion.create(Button);
const NotificationInboxPage = lazy(() =>
  import("../features/settings").then((module) => ({
    default: module.NotificationInboxPage,
  })),
);
const NotificationDetailPage = lazy(() =>
  import("../features/settings").then((module) => ({
    default: module.NotificationDetailPage,
  })),
);
const ApprovalDetailPage = lazy(() =>
  import("../features/settings").then((module) => ({
    default: module.ApprovalDetailPage,
  })),
);

const notificationInboxRoute = operationalRouteForId("notifications");
const notificationDetailRoute = operationalRouteForId("notification-detail");
const approvalDetailRoute = operationalRouteForId("approval-detail");

const floatingConversationGeometryKey =
  "kora:floating-conversation-geometry:v1";
const floatingConversationDefaultSize = { width: 520, height: 720 };
type FloatingConversationGeometry = typeof floatingConversationDefaultSize & {
  x: number;
  y: number;
};
type FloatingConversationSnap = {
  kind:
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "maximize";
  left: number;
  top: number;
  width: number;
  height: number;
};
type FloatingConversationResizeDirection =
  "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type FloatingConversationRect = Pick<
  DOMRect,
  "left" | "top" | "right" | "bottom" | "width" | "height"
>;

const floatingConversationResizeDirections: FloatingConversationResizeDirection[] =
  ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function floatingConversationResizeRect(
  bounds: FloatingConversationRect,
  origin: FloatingConversationRect,
  direction: FloatingConversationResizeDirection,
  deltaX: number,
  deltaY: number,
): FloatingConversationRect {
  const inset = 8;
  const boundaryLeft = bounds.left + inset;
  const boundaryTop = bounds.top + inset;
  const boundaryRight = bounds.right - inset;
  const boundaryBottom = bounds.bottom - inset;
  const minimumWidth = Math.min(360, boundaryRight - boundaryLeft);
  const minimumHeight = Math.min(430, boundaryBottom - boundaryTop);
  let left = origin.left;
  let top = origin.top;
  let right = origin.right;
  let bottom = origin.bottom;

  if (direction.includes("w"))
    left = Math.min(
      Math.max(boundaryLeft, origin.left + deltaX),
      right - minimumWidth,
    );
  if (direction.includes("e"))
    right = Math.max(
      Math.min(boundaryRight, origin.right + deltaX),
      left + minimumWidth,
    );
  if (direction.includes("n"))
    top = Math.min(
      Math.max(boundaryTop, origin.top + deltaY),
      bottom - minimumHeight,
    );
  if (direction.includes("s"))
    bottom = Math.max(
      Math.min(boundaryBottom, origin.bottom + deltaY),
      top + minimumHeight,
    );

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function floatingConversationSnapForPoint(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">,
  size: { width: number; height: number },
  clientX: number,
  clientY: number,
): FloatingConversationSnap | undefined {
  const inset = 8;
  const threshold = 52;
  const nearLeft = clientX <= rect.left + threshold;
  const nearRight = clientX >= rect.right - threshold;
  const nearTop = clientY <= rect.top + threshold;
  const nearBottom = clientY >= rect.bottom - threshold;
  const width = Math.min(size.width, rect.width - inset * 2);
  const height = Math.min(size.height, rect.height - inset * 2);
  if (nearTop && !nearLeft && !nearRight) {
    return {
      kind: "maximize",
      left: rect.left + inset,
      top: rect.top + inset,
      width: rect.width - inset * 2,
      height: rect.height - inset * 2,
    };
  }
  if (nearLeft && nearTop)
    return {
      kind: "top-left",
      left: rect.left + inset,
      top: rect.top + inset,
      width,
      height,
    };
  if (nearRight && nearTop)
    return {
      kind: "top-right",
      left: rect.right - inset - width,
      top: rect.top + inset,
      width,
      height,
    };
  if (nearLeft && nearBottom)
    return {
      kind: "bottom-left",
      left: rect.left + inset,
      top: rect.bottom - inset - height,
      width,
      height,
    };
  if (nearRight && nearBottom)
    return {
      kind: "bottom-right",
      left: rect.right - inset - width,
      top: rect.bottom - inset - height,
      width,
      height,
    };
  if (nearLeft || nearRight) {
    const dockWidth = Math.max(360, (rect.width - inset * 3) / 2);
    return {
      kind: nearLeft ? "left" : "right",
      left: nearLeft ? rect.left + inset : rect.right - inset - dockWidth,
      top: rect.top + inset,
      width: dockWidth,
      height: rect.height - inset * 2,
    };
  }
}

function readFloatingConversationGeometry(): FloatingConversationGeometry {
  const fallback = { ...floatingConversationDefaultSize, x: 0, y: 0 };
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(floatingConversationGeometryKey) ?? "null",
    ) as Partial<FloatingConversationGeometry> | null;
    if (!stored) return fallback;
    return {
      width: Number.isFinite(stored.width)
        ? Math.max(360, stored.width!)
        : fallback.width,
      height: Number.isFinite(stored.height)
        ? Math.max(430, stored.height!)
        : fallback.height,
      x: Number.isFinite(stored.x) ? stored.x! : 0,
      y: Number.isFinite(stored.y) ? stored.y! : 0,
    };
  } catch {
    return fallback;
  }
}

export function isRestorableRoute(pathname: string) {
  return (
    pathname === "/life" ||
    ALL_WORKSPACES.some((workspace) => workspace.to === pathname) ||
    pathname.startsWith("/brain/") ||
    pathname.startsWith("/life/") ||
    pathname.startsWith("/calendar/event/") ||
    pathname.startsWith("/work/") ||
    pathname.startsWith("/settings/") ||
    matchesOperationalRoutePath(pathname)
  );
}

export function isLegacyProfileSearch(search: string) {
  return new URLSearchParams(search).get("view") === "profile";
}

type InspectorContent =
  | { kind: "runtime" }
  | { kind: "approvals" }
  | { kind: "notifications" }
  | { kind: "capabilities" };

export type ShellActions = {
  openComposer: (
    context?: ConversationContextRequest | ConversationContextRequest[],
    draft?: string,
  ) => void;
  openInspector: (
    content?: InspectorContent,
    trigger?: HTMLElement | null,
  ) => void;
};

export const ShellActionContext = createContext<ShellActions | null>(null);

function useShellActions() {
  const value = useContext(ShellActionContext);
  if (!value) throw new Error("Shell actions are unavailable");
  return value;
}

export function AttentionCluster() {
  const { phase, bootstrap } = useConnection();
  const { openInspector } = useShellActions();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NativeNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<Error>();
  const [notificationRetry, setNotificationRetry] = useState(0);
  const compactNotifications = useMediaQuery("(max-width: 899px)");
  const notificationTrigger = useRef<HTMLButtonElement>(null);
  const notificationNavigationPending = useRef(false);
  const notificationReadGeneration = useRef(0);
  const unsolicitedUnseen = bootstrap?.attention.unseenNotifications ?? 0;
  const explicitlyViewedUnseen = notifications.filter(
    (notification) => !notification.seenAt,
  ).length;

  useEffect(() => {
    if (!open) return;
    const generation = ++notificationReadGeneration.current;
    setLoading(true);
    setLoadError(undefined);
    void runtime
      .notifications()
      .then(
        (result) => {
          if (notificationReadGeneration.current === generation) setNotifications(result.notifications);
        },
        (reason: Error) => {
          if (notificationReadGeneration.current === generation) setLoadError(reason);
        },
      )
      .finally(() => {
        if (notificationReadGeneration.current === generation) setLoading(false);
      });
    return () => {
      if (notificationReadGeneration.current === generation) notificationReadGeneration.current += 1;
    };
  }, [open, bootstrap?.revision, notificationRetry]);

  useEffect(() => {
    if (!notificationNavigationPending.current) return;
    const main = document.getElementById("main-content");
    if (!main) return;
    let observer: MutationObserver | undefined;
    const focusDestination = () => {
      const heading = main.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.focus({ preventScroll: true });
      if (document.activeElement !== heading) return false;
      notificationNavigationPending.current = false;
      observer?.disconnect();
      return true;
    };
    if (focusDestination()) return;
    observer = new MutationObserver(focusDestination);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, [location.key]);

  const navigateFromNotifications = (destination: string) => {
    notificationNavigationPending.current = true;
    setOpen(false);
    navigate(destination);
  };

  if (phase === "starting" || phase === "restarting") {
    return null;
  }
  if (phase === "disconnected" || phase === "failed") {
    return null;
  }
  const pendingApprovals = bootstrap?.attention.pendingApprovals.length ?? 0;
  const trigger = (
    <IconButton
      ref={notificationTrigger}
      className="notification-trigger"
      label={
        unsolicitedUnseen > 0
          ? `${unsolicitedUnseen} unseen notifications`
          : "Notifications"
      }
      onClick={compactNotifications ? () => setOpen(true) : undefined}
    >
      <Bell size={18} aria-hidden="true" />
      <AnimatePresence initial={false}>
        {unsolicitedUnseen > 0 && (
          <motion.span
            key={unsolicitedUnseen}
            className="notification-trigger__badge"
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.55 }}
            transition={{ duration: DUR.quick, ease: EASE.out }}
          >
            {unsolicitedUnseen > 99 ? "99+" : unsolicitedUnseen}
          </motion.span>
        )}
      </AnimatePresence>
    </IconButton>
  );
  const collection = (
    <div className="notification-list" aria-live="polite">
      {loading && notifications.length === 0 ? (
        <NotificationLoading rows={4} />
      ) : null}
      {!loading && loadError ? (
        <NotificationAvailabilityView
          state={notificationAvailabilityForError(loadError)}
          message={
            notificationAvailabilityForError(loadError) === "unavailable"
              ? loadError.message
              : undefined
          }
          onRetry={() => setNotificationRetry((attempt) => attempt + 1)}
        />
      ) : null}
      {!loading && !loadError && notifications.length === 0 ? (
        <NotificationAvailabilityView state="empty" />
      ) : null}
      {notifications.length > 0 ? (
        <NotificationFeed
          density="popover"
          notifications={notifications.slice(0, 8)}
          onOpen={(notification) => {
            navigateFromNotifications(`/notifications/${encodeURIComponent(notification.id)}`);
          }}
        />
      ) : null}
    </div>
  );
  const collectionActions = (
    <>
      {explicitlyViewedUnseen > 0 ? (
        <span className="notification-popover__count">
          {explicitlyViewedUnseen} new
        </span>
      ) : (
        <span />
      )}
      <Button
        tone="ghost"
        onClick={() => navigateFromNotifications("/notifications")}
      >
        Open notification center
      </Button>
    </>
  );
  return (
    <div className="attention-ready-cluster">
      {pendingApprovals > 0 && (
        <IconButton
          className="notification-trigger notification-trigger--approval"
          label={`${pendingApprovals} pending approval${pendingApprovals === 1 ? "" : "s"}`}
          onClick={(event) =>
            openInspector({ kind: "approvals" }, event.currentTarget)
          }
        >
          <ShieldAlert size={18} />
          <span className="notification-trigger__badge">
            {pendingApprovals > 99 ? "99+" : pendingApprovals}
          </span>
        </IconButton>
      )}
      {compactNotifications ? (
        <>
          {trigger}
          <Sheet
            key="attention-ready-sheet"
            open={open}
            onOpenChange={setOpen}
            purpose="notifications"
            title="Notifications"
            description="Finished work, stopped runs, and updates that need your attention."
            finalFocus={notificationNavigationPending.current ? false : notificationTrigger}
            className="notification-sheet"
            closeLabel="Close notifications"
            actions={collectionActions}
          >
            {collection}
          </Sheet>
        </>
      ) : (
        <KoraPopover
          key="attention-ready-popover"
          open={open}
          onOpenChange={setOpen}
          purpose="notifications"
          title="Notifications"
          description="Finished work, stopped runs, and updates that need your attention."
          align="end"
          sideOffset={8}
          initialFocus={false}
          finalFocus={notificationNavigationPending.current ? false : undefined}
          className="notification-popover"
          trigger={trigger}
          actions={collectionActions}
        >
          {collection}
        </KoraPopover>
      )}
    </div>
  );
}

export function focusMainContent(event: { preventDefault: () => void }) {
  event.preventDefault();
  requestAnimationFrame(() => document.getElementById("main-content")?.focus());
}

export function focusNavigationDestinationLandmark() {
  const main = document.getElementById("main-content");
  if (!main) return false;
  const heading = main.querySelector<HTMLElement>("h1")
    ?? document.querySelector<HTMLElement>(".view-bar__title");
  const target = heading ?? main;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

function WorkspaceHeader({
  navigationControl,
  connectionStatus,
  sideChatOpen,
  onSearchOpen,
  onSideChatToggle,
}: {
  navigationControl: ReactNode;
  connectionStatus: ReactNode;
  sideChatOpen: boolean;
  onSearchOpen: () => void;
  onSideChatToggle: () => void;
}) {
  const { phase, bootstrap } = useConnection();
  const koraState =
    bootstrap?.run.state === "active"
      ? "working"
      : "ready";
  const koraLabel = sideChatOpen
    ? "Close Kora panel"
    : `Open Kora panel${koraState === "working" ? ", Kora is working" : ""}`;
  return (
    /* The window bar owns global location, drag space, and global utilities.
       Route-local PageHeaders own page/subview identity; the ViewBar below is a
       bounded migration slot for routes that have not reached that contract. */
    <header className="window-bar" data-tauri-drag-region>
      <div className="window-bar__brand">
        {navigationControl}
      </div>
      <div className="window-bar__actions">
        <IconButton
          type="button"
          className="shell-command-trigger"
          label="Search pages and commands"
          tooltip="Search"
          aria-keyshortcuts="Ctrl+K"
          onClick={onSearchOpen}
        >
          <Search size={16} aria-hidden="true" />
        </IconButton>
        {connectionStatus}
        <AttentionCluster />
        <IconButton
          className="kora-sidechat-trigger shell-kora-trigger"
          data-state={koraState}
          label={koraLabel}
          tooltip={sideChatOpen ? "Close Kora" : "Kora"}
          aria-keyshortcuts="Ctrl+J"
          aria-pressed={sideChatOpen}
          onClick={onSideChatToggle}
        >
          <MessageCircleMore size={17} />
          {koraState === "working" ? <span className="shell-kora-trigger__state" aria-hidden="true" /> : null}
        </IconButton>
        <WindowControls />
      </div>
    </header>
  );
}

function SideChatConversationPicker() {
  const { bootstrap, refresh } = useConnection();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<string>();
  const active = bootstrap?.run.state === "active";

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await runtime.sessions();
      setSessions(result.sessions);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [bootstrap?.session.id, load, open]);

  const select = async (sessionId?: string) => {
    if (busy || active || sessionId === bootstrap?.session.id) return;
    setBusy(true);
    setPendingId(sessionId ?? "new");
    setError(undefined);
    try {
      const result = await requestSessionTransition({
        kind: sessionId ? "resume" : "create",
        targetSessionId: sessionId,
        expectedCurrentSessionId: bootstrap!.session.id,
        origin: "side_chat",
      });
      if (result.state !== "settled") {
        setError(result.message);
        return;
      }
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: ["conversation-transcript"],
      });
      setOpen(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      setPendingId(undefined);
    }
  };

  const visible = sessions.slice(0, 12);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            tone="ghost"
            className="sidechat-conversation-trigger"
            aria-label="Change conversation"
          >
            <KoraPresenceMark state={active ? "active" : "idle"} />
            <span>
              <strong>Kora</strong>
              <small>
                {bootstrap?.session.name ?? "Untitled conversation"}
              </small>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={7} align="start" collisionPadding={12}>
          <Popover.Popup className="sidechat-conversation-picker">
            <div className="sidechat-conversation-picker__head">
              <div>
                <Popover.Title>Conversations</Popover.Title>
                <Popover.Description>
                  Continue somewhere else without leaving this workspace.
                </Popover.Description>
              </div>
              <IconButton
                label="Refresh conversations"
                tooltip="Refresh"
                disabled={busy}
                onClick={() => void load()}
              >
                <RotateCw size={15} />
              </IconButton>
            </div>
            <Button
              tone="ghost"
              className="sidechat-conversation-picker__new"
              disabled={busy || active}
              aria-busy={pendingId === "new" || undefined}
              onClick={() => void select()}
            >
              <Plus size={15} />
              <span>
                {pendingId === "new"
                  ? "Starting conversation…"
                  : "New conversation"}
              </span>
            </Button>
            {active && (
              <p className="sidechat-conversation-picker__working">
                <KoraPresenceMark state="active" />
                Finish or stop Kora’s current turn before switching
                conversations.
              </p>
            )}
            <div
              className="sidechat-conversation-picker__list"
              role="listbox"
              aria-label="Recent conversations"
            >
              {visible.map((session) => {
                const current = session.id === bootstrap?.session.id;
                const pending = session.id === pendingId;
                return (
                  <Button
                    tone="ghost"
                    key={session.id}
                    role="option"
                    aria-selected={current}
                    aria-busy={pending || undefined}
                    className={
                      current
                        ? "sidechat-conversation-picker__current"
                        : undefined
                    }
                    disabled={busy || active || current}
                    onClick={() => void select(session.id)}
                  >
                    <span>{recordTitle(session.name, "New conversation")}</span>
                    <time>
                      {new Date(session.updatedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </time>
                  </Button>
                );
              })}
              {!error && visible.length === 0 && <p>No conversations yet.</p>}
            </div>
            {error && (
              <p className="sidechat-conversation-picker__error">
                <CircleAlert size={14} />
                {error}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function KoraConversationSurface({
  expanded,
  compact,
  bounds,
  pendingContext,
  pendingDraft,
  onOpenChange,
  onExpandedChange,
  onContextAttached,
}: {
  expanded: boolean;
  compact: boolean;
  bounds: React.RefObject<HTMLDivElement | null>;
  pendingContext: ConversationContextSelection[];
  pendingDraft?: string;
  onOpenChange: (open: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  onContextAttached: () => void;
}) {
  const storedGeometry = useRef<FloatingConversationGeometry>(
    readFloatingConversationGeometry(),
  );
  const panelRef = useRef<HTMLElement>(null);
  const resizeOrigin = useRef<
    | {
        pointerX: number;
        pointerY: number;
        direction: FloatingConversationResizeDirection;
        rect: FloatingConversationRect;
        x: number;
        y: number;
      }
    | undefined
  >(undefined);
  const pendingSnap = useRef<FloatingConversationSnap | undefined>(undefined);
  const dragControls = useDragControls();
  const panelX = useMotionValue(storedGeometry.current.x);
  const panelY = useMotionValue(storedGeometry.current.y);
  const clampFrame = useRef<number | undefined>(undefined);
  const [panelSize, setPanelSize] = useState({
    width: storedGeometry.current.width,
    height: storedGeometry.current.height,
  });
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [snapPreview, setSnapPreview] = useState<FloatingConversationSnap>();
  const fillsViewport = expanded || compact;
  const fillsViewportRef = useRef(fillsViewport);
  fillsViewportRef.current = fillsViewport;
  const wasViewportFilled = useRef(fillsViewport);

  const cancelPanelClamp = useCallback(() => {
    if (clampFrame.current === undefined) return;
    window.cancelAnimationFrame(clampFrame.current);
    clampFrame.current = undefined;
  }, []);

  const persistGeometry = useCallback(
    (override?: FloatingConversationGeometry) => {
      const geometry = override ?? {
        width: panelSize.width,
        height: panelSize.height,
        x: panelX.get(),
        y: panelY.get(),
      };
      storedGeometry.current = geometry;
      try {
        window.localStorage.setItem(
          floatingConversationGeometryKey,
          JSON.stringify(geometry),
        );
      } catch {
        // Geometry is a convenience. Storage failures must never block chat.
      }
    },
    [panelSize.height, panelSize.width, panelX, panelY],
  );

  const snapForPoint = useCallback(
    (
      clientX: number,
      clientY: number,
    ): FloatingConversationSnap | undefined => {
      const boundary = bounds.current;
      if (!boundary || fillsViewport) return;
      const rect = boundary.getBoundingClientRect();
      return floatingConversationSnapForPoint(
        rect,
        panelSize,
        clientX,
        clientY,
      );
    },
    [bounds, fillsViewport, panelSize.height, panelSize.width],
  );

  const applySnap = useCallback(
    (target: FloatingConversationSnap) => {
      if (fillsViewportRef.current) return;
      if (target.kind === "maximize") {
        onExpandedChange(true);
        return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const currentX = panelX.get();
      const currentY = panelY.get();
      const nextX =
        target.left -
        (panelRect.left - currentX + panelRect.width - target.width);
      const nextY = target.top - (panelRect.top - currentY);
      const geometry = {
        width: target.width,
        height: target.height,
        x: nextX,
        y: nextY,
      };
      setPanelSize({ width: target.width, height: target.height });
      panelX.set(nextX);
      panelY.set(nextY);
      persistGeometry(geometry);
    },
    [onExpandedChange, panelX, panelY, persistGeometry],
  );

  const applyResize = useCallback(
    (
      origin: NonNullable<typeof resizeOrigin.current>,
      deltaX: number,
      deltaY: number,
    ) => {
      if (fillsViewportRef.current) return;
      const boundary = bounds.current;
      if (!boundary) return;
      const target = floatingConversationResizeRect(
        boundary.getBoundingClientRect(),
        origin.rect,
        origin.direction,
        deltaX,
        deltaY,
      );
      const nextX = origin.x + target.right - origin.rect.right;
      const nextY = origin.y + target.top - origin.rect.top;
      const geometry = {
        width: target.width,
        height: target.height,
        x: nextX,
        y: nextY,
      };
      storedGeometry.current = geometry;
      setPanelSize({ width: target.width, height: target.height });
      panelX.set(nextX);
      panelY.set(nextY);
    },
    [bounds, panelX, panelY],
  );

  const keepPanelInBounds = useCallback(() => {
    cancelPanelClamp();
    if (fillsViewportRef.current) return;
    const panel = panelRef.current;
    const boundary = bounds.current;
    if (!panel || !boundary) return;
    const boundaryRect = boundary.getBoundingClientRect();
    setPanelSize((current) => ({
      width: Math.min(current.width, Math.max(360, boundaryRect.width - 16)),
      height: Math.min(current.height, Math.max(430, boundaryRect.height - 16)),
    }));
    clampFrame.current = window.requestAnimationFrame(() => {
      clampFrame.current = undefined;
      if (fillsViewportRef.current) return;
      const currentBoundaryRect = boundary.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const inset = 8;
      let nextX = panelX.get();
      let nextY = panelY.get();
      if (panelRect.left < currentBoundaryRect.left + inset)
        nextX += currentBoundaryRect.left + inset - panelRect.left;
      if (panelRect.right > currentBoundaryRect.right - inset)
        nextX -= panelRect.right - (currentBoundaryRect.right - inset);
      if (panelRect.top < currentBoundaryRect.top + inset)
        nextY += currentBoundaryRect.top + inset - panelRect.top;
      if (panelRect.bottom > currentBoundaryRect.bottom - inset)
        nextY -= panelRect.bottom - (currentBoundaryRect.bottom - inset);
      panelX.set(nextX);
      panelY.set(nextY);
      persistGeometry();
    });
  }, [bounds, cancelPanelClamp, panelX, panelY, persistGeometry]);

  useEffect(() => {
    if (fillsViewport) cancelPanelClamp();
    const xAnimation = animateMotion(
      panelX,
      fillsViewport ? 0 : storedGeometry.current.x,
      SPRING.ui,
    );
    const yAnimation = animateMotion(
      panelY,
      fillsViewport ? 0 : storedGeometry.current.y,
      SPRING.ui,
    );
    const clampTimer = fillsViewport
      ? undefined
      : window.setTimeout(keepPanelInBounds, 420);
    return () => {
      if (clampTimer !== undefined) window.clearTimeout(clampTimer);
      cancelPanelClamp();
      xAnimation.stop();
      yAnimation.stop();
    };
  }, [cancelPanelClamp, fillsViewport, keepPanelInBounds, panelX, panelY]);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      keepPanelInBounds();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [keepPanelInBounds]);

  useEffect(() => {
    const previouslyFilled = wasViewportFilled.current;
    wasViewportFilled.current = fillsViewport;
    // Restoring the floating surface animates back to the saved normal
    // geometry. Do not sample its transient x/y=0 state into that saved value.
    if (!fillsViewport && !previouslyFilled) persistGeometry();
  }, [fillsViewport, panelSize, persistGeometry]);

  return (
    <>
      <AnimatePresence initial={false}>
        {snapPreview && (
          <motion.div
            className="kora-conversation-snap-preview"
            aria-hidden="true"
            style={{
              left: snapPreview.left,
              top: snapPreview.top,
              width: snapPreview.width,
              height: snapPreview.height,
            }}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: DUR.quick, ease: EASE.out }}
          />
        )}
      </AnimatePresence>
      <motion.aside
        ref={panelRef}
        className={`kora-conversation-panel${expanded ? " kora-conversation-panel--expanded" : ""}${compact ? " kora-conversation-panel--compact" : ""}`}
        aria-label="Kora conversation"
        drag={!fillsViewport}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={bounds}
        /* Progressive resistance at the shell boundary, and a flick that carries
       past the pointer. dragElastic 0 + dragMomentum false read as a brick wall. */
        dragElastic={0.14}
        dragMomentum
        dragTransition={{
          power: 0.28,
          timeConstant: 220,
          bounceStiffness: 340,
          bounceDamping: 38,
        }}
        onDrag={(_, info) =>
          setSnapPreview(snapForPoint(info.point.x, info.point.y))
        }
        onDragEnd={() => {
          pendingSnap.current = snapPreview;
          if (!snapPreview) setSnapPreview(undefined);
        }}
        onDragTransitionEnd={() => {
          const target = pendingSnap.current;
          pendingSnap.current = undefined;
          setSnapPreview(undefined);
          if (target && !fillsViewportRef.current) applySnap(target);
          else if (!fillsViewportRef.current) {
            keepPanelInBounds();
            persistGeometry();
          }
        }}
        whileDrag={{ scale: 1.008 }}
        style={{
          // Filled modes own the panel's viewport placement. Keep a stale drag
          // transform from leaking through while the normal geometry restores.
          x: fillsViewport ? 0 : panelX,
          y: fillsViewport ? 0 : panelY,
        }}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{
          opacity: 1,
          scale: 1,
          top: fillsViewport ? 8 : 50,
          right: fillsViewport ? 8 : 14,
          width: fillsViewport ? viewportSize.width - 16 : panelSize.width,
          height: fillsViewport ? viewportSize.height - 16 : panelSize.height,
          borderRadius: fillsViewport ? 10 : 12,
        }}
        exit={{
          opacity: 0,
          scale: 0.97,
          y: 8,
          transition: { duration: DUR.quick, ease: EASE.in },
        }}
        transition={{
          opacity: { duration: DUR.base, ease: EASE.out },
          scale: { duration: DUR.base, ease: EASE.out },
          top: SPRING.ui,
          right: SPRING.ui,
          width: SPRING.ui,
          height: SPRING.ui,
          borderRadius: SPRING.ui,
        }}
      >
        <header
          className={`kora-conversation-panel__head${fillsViewport ? "" : " kora-conversation-panel__head--draggable"}`}
          onPointerDown={(event) => {
            if (
              !fillsViewport &&
              !(event.target as HTMLElement).closest("button")
            )
              dragControls.start(event);
          }}
        >
          <SideChatConversationPicker />
          {!fillsViewport && (
            <GripHorizontal
              className="kora-conversation-panel__grip"
              size={17}
              aria-hidden="true"
            />
          )}
          <div className="kora-conversation-panel__actions">
            {!compact && (
              <IconButton
                label={
                  expanded
                    ? "Restore floating conversation"
                    : "Expand conversation across screen"
                }
                tooltip={expanded ? "Restore" : "Expand"}
                onClick={() => onExpandedChange(!expanded)}
              >
                {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </IconButton>
            )}
            <IconButton
              label="Close Kora chat panel"
              tooltip="Close"
              onClick={() => onOpenChange(false)}
            >
              <X size={17} />
            </IconButton>
          </div>
        </header>
        <div className="kora-conversation-panel__body">
          <ConversationBoundary>
            <Suspense
              fallback={
                <div className="conversation-route-loading">
                  <KoraPresenceMark
                    state="gathering"
                    label="Opening conversation"
                  />
                </div>
              }
            >
              <ConversationWorkspace
                pendingContext={pendingContext}
                pendingDraft={pendingDraft}
                onContextAttached={onContextAttached}
              />
            </Suspense>
          </ConversationBoundary>
        </div>
        {!fillsViewport &&
          floatingConversationResizeDirections.map((direction) => (
            <Pressable
              key={direction}
              type="button"
              className={`kora-conversation-panel__resize kora-conversation-panel__resize--${direction}`}
              aria-label={`Resize Kora conversation panel from the ${direction} edge`}
              onPointerDown={(event) => {
                if (fillsViewportRef.current) return;
                const panel = panelRef.current;
                if (!panel) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeOrigin.current = {
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  direction,
                  rect: panel.getBoundingClientRect(),
                  x: panelX.get(),
                  y: panelY.get(),
                };
              }}
              onPointerMove={(event) => {
                const origin = resizeOrigin.current;
                if (!origin || origin.direction !== direction) return;
                applyResize(
                  origin,
                  event.clientX - origin.pointerX,
                  event.clientY - origin.pointerY,
                );
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                resizeOrigin.current = undefined;
                if (!fillsViewportRef.current)
                  persistGeometry(storedGeometry.current);
              }}
              onPointerCancel={() => {
                resizeOrigin.current = undefined;
                keepPanelInBounds();
              }}
              onKeyDown={(event) => {
                if (fillsViewportRef.current) return;
                const panel = panelRef.current;
                if (
                  !panel ||
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const step = event.shiftKey ? 32 : 8;
                const origin = {
                  pointerX: 0,
                  pointerY: 0,
                  direction,
                  rect: panel.getBoundingClientRect(),
                  x: panelX.get(),
                  y: panelY.get(),
                };
                applyResize(
                  origin,
                  event.key === "ArrowLeft"
                    ? -step
                    : event.key === "ArrowRight"
                      ? step
                      : 0,
                  event.key === "ArrowUp"
                    ? -step
                    : event.key === "ArrowDown"
                      ? step
                      : 0,
                );
                persistGeometry(storedGeometry.current);
              }}
            />
          ))}
      </motion.aside>
    </>
  );
}

export function Inspector({
  content,
  onClose,
  onNavigate,
}: {
  content: InspectorContent;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const { bootstrap, phase, error, retry, restart } = useConnection();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);
  const title =
    content.kind === "approvals"
      ? "Approvals"
      : content.kind === "notifications"
        ? "Notifications"
        : content.kind === "capabilities"
          ? "Connections"
          : "Environment";
  return (
    <aside className="inspector" aria-label="Contextual inspector">
      <div className="inspector__head">
        <h2>{title}</h2>
        <IconButton
          ref={closeButtonRef}
          label="Close inspector"
          onClick={onClose}
        >
          <X size={19} />
        </IconButton>
      </div>
      <div className="inspector__body">
        {content.kind === "runtime" && (
          <>
            <StatusText
              icon={
                <KoraPresenceMark
                  state={
                    phase === "failed"
                      ? "failed"
                      : bootstrap?.run.state === "active"
                        ? "active"
                        : "idle"
                  }
                />
              }
            >
              {phase === "ready" ? "Connected locally" : phase}
            </StatusText>
            <dl className="inspector-list">
              <div>
                <dt>Runtime</dt>
                <dd>
                  {isRemoteDevelopment ? "kora-native · remote" : "kora-native"}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{bootstrap?.model.model ?? "Waiting"}</dd>
              </div>
              <div>
                <dt>Reasoning</dt>
                <dd>{bootstrap?.model.reasoning ?? "Waiting"}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{bootstrap?.revision ?? "—"}</dd>
              </div>
            </dl>
            {error && (
              <p className="inline-error">
                <CircleAlert size={16} />
                {error.message}
              </p>
            )}
            {(phase === "failed" || phase === "disconnected") && (
              <div className="inspector-actions">
                <Button onClick={() => void retry()}>Retry</Button>
                <Button tone="primary" onClick={() => void restart()}>
                  Restart
                </Button>
              </div>
            )}
          </>
        )}
        {content.kind === "approvals" && <InspectorApprovals onNavigate={onNavigate} />}
        {content.kind === "notifications" && (
          <p className="inspector-copy">
            {bootstrap?.attention.unseenNotifications ?? 0} unseen local
            notification(s). Notification detail will live in its canonical
            Settings surface.
          </p>
        )}
        {content.kind === "capabilities" && (
          <div className="inspector-stack">
            {[
              ...(bootstrap?.capabilities.degraded ?? []),
              ...(bootstrap?.capabilities.unavailable ?? []),
            ].map((capability) => (
              <div className="inspector-item" key={capability.id}>
                <WifiOff size={18} />
                <div>
                  <strong>{capability.id}</strong>
                  <p>
                    {capability.reason ??
                      "This connection is currently limited."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function InspectorApprovals({ onNavigate = () => undefined }: { onNavigate?: () => void }) {
  const location = useLocation();
  const confirmations = useQuery({
    queryKey: ["approvals"],
    queryFn: runtime.toolConfirmations,
    refetchInterval: 4_000,
  });
  const pending =
    confirmations.data?.confirmations.filter(
      (item) => item.state === "pending" && item.owner,
    ) ?? [];
  if (confirmations.isLoading)
    return <div className="inspector-copy">Reading pending approvals…</div>;
  if (confirmations.isError)
    return (
      <p className="inline-error">
        <CircleAlert size={16} />
        {confirmations.error.message}
      </p>
    );
  if (!pending.length)
    return <p className="inspector-copy">Nothing is waiting for approval.</p>;
  const returnTo = `${location.pathname}${location.search}`;
  const riskLabel = {
    external: "External action",
    destructive: "Destructive action",
    private: "Private data",
    financial: "Financial action",
    high_risk_local: "High-risk local action",
  } as const;
  return <div className="inspector-stack" aria-label="Pending approvals">
    {pending.map((item) => <Link
      key={item.id}
      className="inspector-item inspector-item--link"
      to={`/approvals/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(returnTo)}`}
      onClick={onNavigate}
    >
      <ShieldAlert size={18} aria-hidden="true" />
      <div>
        <strong>{item.presentation.action}</strong>
        <p>{item.presentation.target}</p>
        <small>{item.presentation.consequence}</small>
        <small>{riskLabel[item.presentation.risk]} · Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.expiresAt))}</small>
      </div>
      <ChevronRight className="inspector-item__open" size={16} aria-hidden="true" />
    </Link>)}
  </div>;
}

export function runtimeFailurePresentation(error?: {
  code?: string;
  message?: string;
  canRetry?: boolean;
  canRestart?: boolean;
}) {
  if (error?.code === "review_access_missing") {
    return {
      kind: "access_missing" as const,
      title: "This development link is missing its access key.",
      body:
        error.message ?? "Kora cannot authenticate this localhost review link.",
      recovery:
        "Open Kora from the local review launcher, then copy its complete link.",
      allowRetry: false,
      allowRestart: false,
    };
  }
  if (error?.code === "runtime_incompatible") {
    return {
      kind: "incompatible" as const,
      title: "Kora needs a compatible local runtime.",
      body:
        error.message ??
        "The desktop app and local runtime do not speak the same protocol.",
      recovery:
        "Update or repair this Kora installation, then try this screen again.",
      allowRetry: error.canRetry ?? false,
      allowRestart: error.canRestart ?? false,
    };
  }
  if (error?.code === "runtime_unauthorized") {
    return {
      kind: "access_stale" as const,
      title: "Kora needs a fresh local connection.",
      body:
        error.message ??
        "The desktop app could not authenticate with the local runtime.",
      recovery:
        "Reopen Kora so the desktop host can issue a fresh authenticated connection.",
      allowRetry: false,
      allowRestart: false,
    };
  }
  if (
    error?.code === "runtime_unresponsive" ||
    error?.code === "runtime_ownership_unknown" ||
    error?.code === "runtime_restart_blocked"
  ) {
    return {
      kind: "blocked" as const,
      title: "Kora preserved an unsafe runtime state.",
      body: error.message ?? "Kora could not safely replace the recorded local runtime.",
      recovery: "Close any other Kora window or wait for the recorded operation to settle, then try again. No local data was changed.",
      allowRetry: error.canRetry ?? false,
      allowRestart: error.canRestart ?? false,
    };
  }
  if (error?.code === "runtime_build_receipt_invalid") {
    return {
      kind: "repair_required" as const,
      title: "This Kora installation needs repair.",
      body: error.message ?? "The installed runtime build could not be verified.",
      recovery: "Rebuild or reinstall this Kora candidate. Repeating startup cannot repair an invalid installed build.",
      allowRetry: false,
      allowRestart: false,
    };
  }
  return {
    kind: "unavailable" as const,
    title: "Kora couldn’t open your local workspace.",
    body:
      error?.message ??
      "The Windows host did not return a healthy native runtime.",
    recovery:
      "Try the local connection again. Restart Kora only if the runtime remains unavailable.",
    allowRetry: error?.canRetry ?? true,
    allowRestart: error?.canRestart ?? false,
  };
}

function StartupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="startup-shell">
      <header className="window-bar startup-shell__bar" data-tauri-drag-region>
        <div className="window-bar__brand">
          <KoraMark width={16} height={16} />
          <span>Kora</span>
        </div>
        <WindowControls />
      </header>
      {children}
    </div>
  );
}

function RuntimeGate({ children }: { children: React.ReactNode }) {
  const { phase, bootstrap, error, retry, restart } = useConnection();
  const [startupDelayed, setStartupDelayed] = useState(false);
  useEffect(() => {
    if (phase !== "starting" && !(phase === "restarting" && !bootstrap)) {
      setStartupDelayed(false);
      return;
    }
    const timeout = window.setTimeout(() => setStartupDelayed(true), 3500);
    return () => window.clearTimeout(timeout);
  }, [bootstrap, phase]);
  if (phase === "starting" || (phase === "restarting" && !bootstrap)) {
    return (
      <StartupFrame>
        <main className="runtime-state" aria-live="polite">
          <KoraPresenceMark
            state="gathering"
            label={
              phase === "restarting" ? "Kora is restarting" : "Kora is starting"
            }
          />
          <span className="runtime-state__kicker">Opening local workspace</span>
          <h1>
            {phase === "restarting"
              ? "Restarting Kora"
              : "Getting things ready"}
          </h1>
          <p>
            {phase === "restarting"
              ? "Reconnecting the desktop to Kora’s authenticated local runtime. Your saved workspace remains intact."
              : "Connecting the authenticated runtime, then restoring your last safe place."}
          </p>
          {startupDelayed && (
            <Disclosure
              className="runtime-state__details"
              trigger={
                <Button type="button" tone="link">
                  Show details
                </Button>
              }
            >
              <span>
                The local runtime is taking longer than usual to answer. Kora is
                still waiting; no workspace data has been changed.
              </span>
            </Disclosure>
          )}
        </main>
      </StartupFrame>
    );
  }
  if (phase === "failed") {
    const presentation = runtimeFailurePresentation(error);
    return (
      <StartupFrame>
        <main className="runtime-state runtime-state--failed">
          <KoraPresenceMark state="failed" label="Kora failed to start" />
          <span className="runtime-state__kicker">
            Local workspace unavailable
          </span>
          <h1>{presentation.title}</h1>
          <p>{presentation.body}</p>
          <p className="runtime-state__recovery">
            Kora has stopped startup. Review the recovery options before changing local data.
          </p>
          <p className="runtime-state__recovery">{presentation.recovery}</p>
          <LocalRecoveryControls startup />
          {presentation.allowRetry || presentation.allowRestart ? <div className="runtime-state__actions">
            {presentation.allowRetry && <Button tone="primary" onClick={() => void retry()}>Try again</Button>}
            {presentation.allowRestart && <Button onClick={() => void restart()}>Restart Kora</Button>}
          </div> : null}
          {(error?.code || error?.requestId) && (
            <Disclosure
              className="runtime-state__details"
              trigger={
                <Button type="button" tone="link">
                  Technical details
                </Button>
              }
            >
              <code>
                {error.code ?? "runtime_start_failed"}
                {error.stage ? ` · Stage ${error.stage}` : ""}
                {error.requestId ? ` · Request ${error.requestId}` : ""}
              </code>
            </Disclosure>
          )}
        </main>
      </StartupFrame>
    );
  }
  return children;
}

type DraftRecovery = {
  sessionId: string;
  conversationName: string;
  external: boolean;
};

function DraftRecoveryNotice({
  recovery,
  onDismiss,
}: {
  recovery: DraftRecovery;
  onDismiss: () => void;
}) {
  const { bootstrap, refresh } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const restore = async () => {
    if (!bootstrap) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await requestSessionTransition({
        kind: "resume",
        targetSessionId: recovery.sessionId,
        expectedCurrentSessionId: bootstrap.session.id,
        origin: "conversation_rail",
      });
      if (result.state !== "settled") {
        setError(result.message);
        return;
      }
      await refresh();
      onDismiss();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.aside
      className="draft-recovery-notice"
      role="status"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      <span>
        <strong>Your draft is safe in {recovery.conversationName}.</strong>
        {recovery.external && (
          <small>Kora changed conversation from another surface.</small>
        )}
        {error && (
          <small className="draft-recovery-notice__error">{error}</small>
        )}
      </span>
      <Button type="button" disabled={busy} onClick={() => void restore()}>
        {busy ? "Returning…" : "Return to draft"}
      </Button>
      <IconButton
        label="Dismiss draft reminder"
        tooltip="Dismiss"
        onClick={onDismiss}
      >
        <X size={14} />
      </IconButton>
    </motion.aside>
  );
}

function ConnectionStatusControl() {
  const { phase, bootstrap, retry } = useConnection();
  const modelSignIn = bootstrap?.model.authenticationRequired;
  if (
    phase !== "starting" &&
    phase !== "disconnected" &&
    phase !== "degraded" &&
    phase !== "restarting" &&
    phase !== "failed" &&
    !modelSignIn
  )
    return null;
  const copy =
    phase === "starting" || phase === "restarting"
      ? {
          title: phase === "restarting" ? "Kora is restarting." : "Kora is starting.",
          consequence: "Your local workspace and drafts are saved.",
        }
      : phase === "failed"
        ? {
            title: "Kora is unavailable.",
            consequence: "Local pages remain available, but live capabilities are paused.",
          }
      : phase === "disconnected"
        ? {
            title: "Kora is offline.",
            consequence:
              "Saved local pages remain available; connected information may be out of date.",
          }
        : phase === "degraded"
          ? {
              title: "Kora is limited.",
              consequence:
                "Local work remains available, but some connected capabilities are paused.",
            }
          : {
              title: "Model sign-in is needed.",
              consequence: "Kora cannot answer until model access is restored.",
            };
  const NoticeIcon =
    phase === "starting" || phase === "restarting"
      ? RotateCw
      : modelSignIn && phase !== "disconnected" && phase !== "degraded"
        ? KeyRound
        : phase === "degraded"
          ? CircleAlert
          : WifiOff;
  const fullLabel = `${copy.title} ${copy.consequence}`;
  return <KoraPopover
    trigger={<IconButton
      className="shell-connection-status"
      data-state={phase === "starting" || phase === "restarting" ? "restarting" : phase === "disconnected" ? "offline" : phase === "failed" || modelSignIn ? "unavailable" : "limited"}
      label={fullLabel}
      tooltip={fullLabel}
    ><NoticeIcon size={16} aria-hidden="true" /></IconButton>}
    side="bottom"
    align="end"
    sideOffset={8}
    className="shell-connection-popover"
    aria-label="Kora connection status"
  >
    <div className="shell-connection-popover__copy" role="status" aria-live="polite">
      <NoticeIcon size={17} aria-hidden="true" />
      <span><strong>{copy.title}</strong><small>{copy.consequence}</small></span>
    </div>
    <div className="shell-connection-popover__actions">
      {modelSignIn && phase !== "disconnected" ? <NavLink className="button" to="/settings/model">Open model settings</NavLink> : phase !== "starting" && phase !== "restarting" ? <Button onClick={() => void retry()}>Reconnect</Button> : null}
    </div>
  </KoraPopover>;
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bootstrap, refresh, phase } = useConnection();
  const shellBounds = useRef<HTMLDivElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationOverlayClosed, setNavigationOverlayClosed] = useState(true);
  const [navigationConversationView, setNavigationConversationView] =
    useState<ConversationRailView>("conversations");
  const [conversationRailDockedOpen, setConversationRailDockedOpen] = useState(true);
  const [conversationRailDrawerOpen, setConversationRailDrawerOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerContext, setComposerContext] = useState<
    ConversationContextSelection[]
  >([]);
  const [composerTargetRequests, setComposerTargetRequests] = useState<ConversationContextReference[]>([]);
  const [composerDraft, setComposerDraft] = useState<string>();
  const [inspector, setInspector] = useState<InspectorContent>();
  const [draftRecovery, setDraftRecovery] = useState<DraftRecovery>();
  const [activationStatus, setActivationStatus] = useState<string>();
  const composerTargetRequestsInFlight = useRef(new Map<string, string>());
  const composerTargetSessionId = useRef<string | undefined>(undefined);
  composerTargetSessionId.current = bootstrap?.session.id;
  const priorSession = useRef<{ id: string; name?: string } | undefined>(
    undefined,
  );
  const localTransitionTarget = useRef<string | undefined>(undefined);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const navigationFocusPending = useRef(false);
  const navigationFocusOrigin = useRef("");
  const navigationReturnFocusPending = useRef(false);
  const updateNavigationOpen = useCallback((open: boolean) => {
    if (open) setNavigationOverlayClosed(false);
    setNavigationOpen(open);
  }, []);
  const toggleNavigation = useCallback(() => {
    setNavigationOpen((open) => {
      const next = !open;
      if (next) setNavigationOverlayClosed(false);
      return next;
    });
  }, []);
  const completeNavigationOverlay = useCallback((open: boolean) => {
    if (!open) setNavigationOverlayClosed(true);
  }, []);
  const clearComposerTransfer = useCallback(() => {
    setComposerContext([]);
    setComposerDraft(undefined);
  }, []);
  useEffect(() => {
    const sessionId = bootstrap?.session.id;
    if (!sessionId || composerTargetRequests.length === 0) return;
    const requestKey = (target: ConversationContextReference) => `${target.kind}:${target.id}`;
    const targets = composerTargetRequests.filter((target) => composerTargetRequestsInFlight.current.get(requestKey(target)) !== sessionId);
    if (targets.length === 0) return;
    targets.forEach((target) => composerTargetRequestsInFlight.current.set(requestKey(target), sessionId));
    void Promise.allSettled(targets.map((target) => runtime.issueConversationContextSelection({
      sessionId,
      target: { kind: target.kind, id: target.id },
      ...(target.range ? { range: target.range } : {}),
    }))).then((results) => {
      targets.forEach((target) => {
        const key = requestKey(target);
        if (composerTargetRequestsInFlight.current.get(key) === sessionId) composerTargetRequestsInFlight.current.delete(key);
      });
      // A foreground session change leaves the intent queued for the new session;
      // an old response must never become ready context in that session.
      if (composerTargetSessionId.current !== sessionId) return;
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      const selections = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof runtime.issueConversationContextSelection>>> => result.status === "fulfilled").map((result) => result.value.selection);
      if (selections.length) {
        setComposerContext((current) => {
          const selectionIds = new Set(current.flatMap((item) => "selectionId" in item ? [item.selectionId] : []));
          return [...current, ...selections.filter((item) => !(("selectionId" in item) && selectionIds.has(item.selectionId)))];
        });
      }
      setComposerTargetRequests((current) => current.filter((target) => !targets.some((candidate) => requestKey(candidate) === requestKey(target))));
      if (failures.length) {
        const reason = failures[0]?.reason;
        setActivationStatus(`Kora context could not be prepared: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    });
  }, [bootstrap?.session.id, composerTargetRequests]);
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const composerTrigger = useRef<HTMLElement | null>(null);
  const composerWasOpen = useRef(false);
  const inspectorOverlay = useMediaQuery("(max-width: 1180px)");
  const conversationRailOverlay = useMediaQuery("(max-width: 899px)");
  // A docked rail is layout, not an invitation to open a modal after resizing.
  const conversationRailOpen = conversationRailOverlay ? conversationRailDrawerOpen : conversationRailDockedOpen;
  const setConversationRailOpen = conversationRailOverlay ? setConversationRailDrawerOpen : setConversationRailDockedOpen;
  // This matches the breakpoint where workspace-local rails leave the layout.
  // Below it the global drawer becomes the sole owner of local destinations.
  // Global navigation owns its breakpoint independently. Inspector overlays
  // begin earlier because they consume substantially more horizontal room;
  // coupling the two made the K switcher turn into a full-height drawer on
  // ordinary desktop windows.
  const compactNavigation = useMediaQuery("(max-width: 899px)");
  const compactKoraSurface = useMediaQuery("(max-width: 700px)");
  const reducedMotion = Boolean(useReducedMotion());
  const shellAtmosphere = atmosphereForPath(location.pathname);
  const activeWorkspace =
    workspaceForPath(location.pathname) ?? ALL_WORKSPACES[0];
  const commitNavigation = useCallback(() => {
    navigationFocusPending.current = true;
    navigationFocusOrigin.current = `${location.pathname}${location.search}`;
    setNavigationOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!navigationFocusPending.current || navigationOpen || !navigationOverlayClosed) return;
    if (`${location.pathname}${location.search}` === navigationFocusOrigin.current) return;
    const frame = requestAnimationFrame(() => {
      if (focusNavigationDestinationLandmark()) navigationFocusPending.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.search, navigationOpen, navigationOverlayClosed]);
  useEffect(() => {
    if (
      !navigationReturnFocusPending.current ||
      navigationOpen ||
      !navigationOverlayClosed
    )
      return;
    const frame = requestAnimationFrame(() => {
      navigationTrigger.current?.focus({ preventScroll: true });
      navigationReturnFocusPending.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationOpen, navigationOverlayClosed]);
  useEffect(() => {
    const track = (event: Event) => {
      const detail = (
        event as CustomEvent<{ state?: string; sessionId?: string }>
      ).detail;
      if (detail?.state === "settled" && detail.sessionId)
        localTransitionTarget.current = detail.sessionId;
    };
    window.addEventListener("kora:session-transition", track);
    return () => window.removeEventListener("kora:session-transition", track);
  }, []);
  useEffect(() => {
    const activation = consumeSessionActivation(
      location.pathname,
      location.search,
    );
    if (!activation) return;
    clearActivationFromHash();
    if (!bootstrap?.session.id) return;
    setActivationStatus("Opening conversation…");
    void (async () => {
      try {
        const sessions = await runtime.sessions();
        if (
          !sessions.sessions.some(
            (session) => session.id === activation.targetSessionId,
          )
        )
          throw new Error("That conversation is no longer available.");
        const result = await requestSessionTransition({
          kind: "resume",
          targetSessionId: activation.targetSessionId,
          expectedCurrentSessionId: bootstrap.session.id,
          requestKey: activation.id,
          origin: "activation",
        });
        if (result.state !== "settled") {
          setActivationStatus(result.message);
          return;
        }
        await refresh();
        setActivationStatus(undefined);
      } catch (reason) {
        setActivationStatus((reason as Error).message);
      }
    })();
  }, [bootstrap?.session.id, location.pathname, location.search, refresh]);

  useEffect(() => {
    const current = bootstrap?.session;
    if (!current) return;
    const previous = priorSession.current;
    if (previous && previous.id !== current.id && hasDraft(previous.id)) {
      const local = localTransitionTarget.current === current.id;
      setDraftRecovery({
        sessionId: previous.id,
        conversationName: previous.name?.trim() || "your previous conversation",
        external: !local,
      });
      localTransitionTarget.current = undefined;
    }
    priorSession.current = { id: current.id, name: current.name };
  }, [bootstrap?.session]);
  const onKoraWorkspace = location.pathname.startsWith("/kora");

  useEffect(() => {
    const openManager = (event: Event) => {
      const requested = (event as CustomEvent<{ view?: ConversationRailView }>)
        .detail?.view;
      if (requested) setNavigationConversationView(requested);
      if (!location.pathname.startsWith("/kora")) navigate("/kora");
      setConversationRailOpen(true);
    };
    const toggleManager = (event: Event) => {
      const requested = (event as CustomEvent<{ view?: ConversationRailView }>)
        .detail?.view;
      if (requested) setNavigationConversationView(requested);
      if (!location.pathname.startsWith("/kora")) {
        navigate("/kora");
        setConversationRailOpen(true);
        return;
      }
      setConversationRailOpen((open) => !open);
    };
    window.addEventListener("kora:open-session-manager", openManager);
    window.addEventListener("kora:toggle-session-manager", toggleManager);
    return () => {
      window.removeEventListener("kora:open-session-manager", openManager);
      window.removeEventListener("kora:toggle-session-manager", toggleManager);
    };
  }, [location.pathname, navigate, setConversationRailOpen]);

  const closeInspector = useCallback(() => {
    setInspector(undefined);
    requestAnimationFrame(() => inspectorTrigger.current?.focus());
  }, []);
  const openComposer = useCallback(() => {
    setComposerOpen((open) => {
      if (!open)
        composerTrigger.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      return true;
    });
  }, []);
  const toggleComposer = useCallback(() => {
    setInspector(undefined);
    setComposerOpen((open) => {
      if (!open)
        composerTrigger.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      return !open;
    });
  }, []);
  useEffect(() => {
    if (composerOpen) {
      composerWasOpen.current = true;
      return;
    }
    if (!composerWasOpen.current) return;
    composerWasOpen.current = false;
    const trigger = composerTrigger.current;
    composerTrigger.current = null;
    requestAnimationFrame(() => trigger?.focus());
  }, [composerOpen]);
  const actions = useMemo<ShellActions>(
    () => ({
      openComposer: (context, draft) => {
        const requested = context
          ? Array.isArray(context)
            ? context
            : [context]
          : [];
        const ready = requested.filter(isConversationContextSelection);
        if (ready.length) {
          setComposerContext((current) => {
            const selectionIds = new Set(
              current.flatMap((item) =>
                "selectionId" in item ? [item.selectionId] : [],
              ),
            );
            return [
              ...current,
              ...ready.filter(
                (item) =>
                  !("selectionId" in item) ||
                  !selectionIds.has(item.selectionId),
              ),
            ];
          });
        }
        const targets = requested.filter(
          (item): item is ConversationContextReference =>
            !isConversationContextSelection(item),
        );
        if (targets.length) {
          setComposerTargetRequests((current) => {
            const keys = new Set(current.map((target) => `${target.kind}:${target.id}`));
            return [...current, ...targets.filter((target) => !keys.has(`${target.kind}:${target.id}`))];
          });
        }
        if (draft !== undefined) setComposerDraft(draft);
        setInspector(undefined);
        openComposer();
      },
      openInspector: (content = { kind: "runtime" }, trigger) => {
        inspectorTrigger.current =
          trigger ?? (document.activeElement as HTMLElement | null);
        setInspector(content);
      },
    }),
    [bootstrap?.session.id, openComposer],
  );

  useEffect(() => {
    if (isRestorableRoute(location.pathname)) {
      saveRoute(`${location.pathname}${location.search}`);
      rememberCommandDestination(`${location.pathname}${location.search}`);
    }
  }, [location.pathname, location.search]);
  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      const shortcut = globalShortcutForKeyboardEvent(event);
      if (shortcut && !(shortcut.id === "go-to-alternate" && typing)) {
        event.preventDefault();
        if (shortcut.action === "workspace" && shortcut.to) navigate(shortcut.to);
        else if (shortcut.action === "command-palette") {
          if (shortcut.id === "go-to-alternate") setPaletteOpen(true);
          else setPaletteOpen((value) => !value);
        } else if (shortcut.action === "side-chat") toggleComposer();
        else if (shortcut.action === "global-navigation") toggleNavigation();
        else if (shortcut.action === "open-settings") navigate("/settings");
      }
      // Nested overlays get first refusal. Shell fallback then closes global
      // navigation, the expanded panel, the panel, or the inspector.
      if (event.key === "Escape") {
        // This is a bubble fallback. Base UI's document-level dismissal runs
        // first for dialogs/popovers and stops the event when it owns Escape.
        if (event.defaultPrevented) return;
        if (typing) return;
        if (navigationOpen) {
          event.preventDefault();
          navigationReturnFocusPending.current = true;
          updateNavigationOpen(false);
        } else if (composerOpen) {
          if (composerExpanded) setComposerExpanded(false);
          else setComposerOpen(false);
        } else if (inspector) {
          closeInspector();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    actions,
    closeInspector,
    composerExpanded,
    composerOpen,
    inspector,
    location.pathname,
    navigate,
    navigationOpen,
    toggleComposer,
    toggleNavigation,
    updateNavigationOpen,
  ]);

  /* Sub-scope counts shown beside their destination in the navigator.
     Reuses the Brain overview query by key, so navigating to Brain populates the
     navigator without a second request, and the navigator shows nothing until that
     data exists rather than rendering a placeholder zero. */
  const navigationControl = compactNavigation ? (
    <NavigationToggle
      ref={navigationTrigger}
      open={navigationOpen}
      aria-keyshortcuts="Ctrl+B"
      controls="kora-navigator-sheet"
      onToggle={toggleNavigation}
    />
  ) : (
    <KoraPopover
      id="kora-navigator-menu"
      open={navigationOpen}
      onOpenChange={updateNavigationOpen}
      onOpenChangeComplete={completeNavigationOverlay}
      trigger={
        <NavigationToggle
          ref={navigationTrigger}
          open={navigationOpen}
          aria-keyshortcuts="Ctrl+B"
        />
      }
      side="bottom"
      align="start"
      sideOffset={6}
      className="navigation-popover"
      aria-label="Navigate"
      finalFocus={navigationFocusPending.current ? false : undefined}
    >
      <Navigator presentation="popover" onNavigate={commitNavigation} />
    </KoraPopover>
  );

  return (
    <ShellActionContext.Provider value={actions}>
      <ViewBarProvider>
        <div
          ref={shellBounds}
          className="app-shell"
          data-workspace={shellAtmosphere}
          data-conversation-rail={
            onKoraWorkspace && !conversationRailOverlay
              ? conversationRailOpen
                ? "open"
                : "closed"
              : undefined
          }
        >
          <a
            className="skip-link"
            href="#main-content"
            onClick={focusMainContent}
          >
            Skip to content
          </a>
          <WorkspaceHeader
            navigationControl={navigationControl}
            connectionStatus={<ConnectionStatusControl />}
            sideChatOpen={composerOpen}
            onSearchOpen={() => setPaletteOpen(true)}
            onSideChatToggle={toggleComposer}
          />
          {compactNavigation && (
            <Sheet
              id="kora-navigator-sheet"
              open={navigationOpen}
              onOpenChange={updateNavigationOpen}
              onOpenChangeComplete={completeNavigationOverlay}
              title="Navigate"
              description="Move between Kora's main spaces."
              side="left"
              closeLabel="Close navigation"
              className="navigation-drawer"
              finalFocus={navigationFocusPending.current ? false : undefined}
            >
              <div className="navigation-drawer__body">
                <Navigator onNavigate={commitNavigation} />
              </div>
            </Sheet>
          )}
          <AnimatePresence initial={false}>
            {onKoraWorkspace &&
              conversationRailOpen &&
              !conversationRailOverlay && (
                <motion.aside
                  className="conversation-rail-slot"
                  initial={{
                    opacity: 0,
                    transform: reducedMotion
                      ? "translateX(0px)"
                      : "translateX(-10px)",
                  }}
                  animate={{ opacity: 1, transform: "translateX(0px)" }}
                  exit={{
                    opacity: 0,
                    transform: reducedMotion
                      ? "translateX(0px)"
                      : "translateX(-8px)",
                  }}
                  transition={{
                    duration: reducedMotion ? DUR.quick : DUR.base,
                    ease: EASE.out,
                  }}
                >
                  <ConversationRail
                    open
                    variant="docked"
                    view={navigationConversationView}
                    onViewChange={setNavigationConversationView}
                    onOpenChange={setConversationRailOpen}
                  />
                </motion.aside>
              )}
          </AnimatePresence>
          {onKoraWorkspace && conversationRailOverlay && (
            <Sheet
              id="conversation-rail-sheet"
              open={conversationRailOpen}
              onOpenChange={setConversationRailOpen}
              title="Conversations"
              description="Search chats, start a conversation, or move through branches."
              side="left"
              closeLabel="Close conversations"
              className="conversation-navigation-drawer"
            >
              <ConversationRail
                open={conversationRailOpen}
                variant="sheet"
                view={navigationConversationView}
                onViewChange={setNavigationConversationView}
                onOpenChange={setConversationRailOpen}
              />
            </Sheet>
          )}
          <motion.div
            className="pane"
            layout={reducedMotion ? false : "position"}
            transition={{ duration: DUR.base, ease: EASE.out }}
            inert={
              (inspector && inspectorOverlay) || paletteOpen ? true : undefined
            }
            aria-hidden={Boolean(inspector && inspectorOverlay) || undefined}
          >
            <ViewBar />
            <main className="pane__content" id="main-content" tabIndex={-1}>
              <BrainOriginReturn />
              <WorkOriginReturn />
              <TodayOriginReturn />
              <Routes>
                <Route path="/" element={<RestoredWorkspaceRoute />} />
                <Route
                  path="/kora"
                  element={
                    <ConversationBoundary>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening conversation"
                            />
                          </div>
                        }
                      >
                        <ConversationWorkspace
                          conversationRailControlId={conversationRailOpen
                            ? conversationRailOverlay
                              ? "conversation-rail-sheet"
                              : "conversation-rail"
                            : undefined}
                        />
                      </Suspense>
                    </ConversationBoundary>
                  }
                />
                <Route
                  path="/calendar"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Calendar"
                          />
                        </div>
                      }
                    >
                      <CalendarWorkspace
                        onAskKora={(reference) =>
                          actions.openComposer(reference)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/calendar/event/:calendarId/:eventId"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Calendar event"
                          />
                        </div>
                      }
                    >
                      <CalendarWorkspace
                        onAskKora={(reference) =>
                          actions.openComposer(reference)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Work overview"
                          />
                        </div>
                      }
                    >
                      <WorkOverviewWorkspace
                        onAskKora={(reference, draft) =>
                          actions.openComposer(reference, draft)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/goals/:goalId"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Goal"
                          />
                        </div>
                      }
                    >
                      <ProjectWorkspace
                        onAskKora={(reference) =>
                          actions.openComposer(reference)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/tasks"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Tasks"
                          />
                        </div>
                      }
                    >
                      <WorkTasksWorkspace
                        onAskKora={(reference, draft) =>
                          actions.openComposer(reference, draft)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/tasks/:itemId"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Task"
                          />
                        </div>
                      }
                    >
                      <WorkItemWorkspace
                        onAskKora={(reference) =>
                          actions.openComposer(reference)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/timeline"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Work timeline"
                          />
                        </div>
                      }
                    >
                      <WorkTimelineWorkspace
                        onAskKora={(reference, draft) =>
                          actions.openComposer(reference, draft)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/archive"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Work archive"
                          />
                        </div>
                      }
                    >
                      <WorkArchiveWorkspace />
                    </Suspense>
                  }
                />
                <Route
                  path="/work/goals"
                  element={
                    <Suspense fallback={<div className="conversation-route-loading"><KoraPresenceMark state="gathering" label="Opening Projects" /></div>}>
                      <ProjectsWorkspace onAskKora={(reference, draft) => actions.openComposer(reference, draft)} />
                    </Suspense>
                  }
                />
                <Route path="/work/projects" element={<LegacyLifeRoute destination="/work/goals" />} />
                <Route path="/work/projects/:projectId" element={<LegacyLifeRoute destination="/work/goals" param="projectId" />} />
                <Route
                  path="/work/items"
                  element={<LegacyLifeRoute destination="/work/tasks" />}
                />
                <Route path="/work/items/:itemId" element={<LegacyLifeRoute destination="/work/tasks" param="itemId" />} />
                <Route
                  path="/brain"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Brain"
                          />
                        </div>
                      }
                    >
                      <BrainOverview
                        onAskKora={(reference, draft) =>
                          actions.openComposer(reference, draft)
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/brain/memory"
                  element={
                    <LegacyMemoryWorkspace
                      onAskKora={(reference) => actions.openComposer(reference)}
                    />
                  }
                />
                <Route
                  path="/brain/memory/:memoryId"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Memory"
                            />
                          </div>
                        }
                      >
                        <MemoryWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/pages"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Pages"
                            />
                          </div>
                        }
                      >
                        <PagesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/pages/new"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Page editor"
                            />
                          </div>
                        }
                      >
                        <PagesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/pages/:pageId"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Page"
                            />
                          </div>
                        }
                      >
                        <PagesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/pages/:pageId/edit"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Page editor"
                            />
                          </div>
                        }
                      >
                        <PagesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/people"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening People"
                            />
                          </div>
                        }
                      >
                        <PeopleWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/people/new"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Person editor"
                            />
                          </div>
                        }
                      >
                        <PeopleWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/people/:personId"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Person"
                            />
                          </div>
                        }
                      >
                        <PeopleWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/people/:personId/edit"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Person editor"
                            />
                          </div>
                        }
                      >
                        <PeopleWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/sources"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Sources"
                            />
                          </div>
                        }
                      >
                        <SourcesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/sources/new"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Source editor"
                            />
                          </div>
                        }
                      >
                        <SourcesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/sources/:sourceId"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Source"
                            />
                          </div>
                        }
                      >
                        <SourcesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/sources/:sourceId/edit"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Source editor"
                            />
                          </div>
                        }
                      >
                        <SourcesWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/outputs"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Outputs"
                            />
                          </div>
                        }
                      >
                        <OutputsWorkspace />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/brain/outputs/:artifactId"
                  element={
                    <BrainLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Output"
                            />
                          </div>
                        }
                      >
                        <OutputsWorkspace />
                      </Suspense>
                    </BrainLayout>
                  }
                />
                <Route
                  path="/life"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Life"
                            />
                          </div>
                        }
                      >
                        <LifeOverviewWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/today"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Today"
                            />
                          </div>
                        }
                      >
                        <TodayWorkspace
                          connectionPhase={phase}
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Money"
                            />
                          </div>
                        }
                      >
                        <FinancesWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances/activity/:transactionId?"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Money activity"
                            />
                          </div>
                        }
                      >
                        <MoneyActivityWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances/plan"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Money plan"
                            />
                          </div>
                        }
                      >
                        <MoneyPlanWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances/plan/targets/:targetId"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Money target"
                            />
                          </div>
                        }
                      >
                        <MoneyPlanWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances/recurring/:recordKind?/:recordId?"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening recurring Money"
                            />
                          </div>
                        }
                      >
                        <MoneyRecurringWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/finances/accounts/:accountId?"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Money accounts"
                            />
                          </div>
                        }
                      >
                        <MoneyAccountsWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Wellbeing"
                            />
                          </div>
                        }
                      >
                        <WellbeingTodayWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/food"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Food"
                            />
                          </div>
                        }
                      >
                        <WellbeingFoodWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/care"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Care"
                            />
                          </div>
                        }
                      >
                        <WellbeingCareWorkspace
                          onAskKora={(reference, draft) =>
                            actions.openComposer(reference, draft)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/routines"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening Routines"
                            />
                          </div>
                        }
                      >
                        <WellbeingRoutinesWorkspace />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/trends"
                  element={
                    <LifeLayout>
                      <Suspense fallback={<div className="conversation-route-loading"><KoraPresenceMark state="gathering" label="Opening Wellbeing Trends" /></div>}>
                        <WellbeingTrendsWorkspace
                          onAskKora={(references, draft) => actions.openComposer(references, draft)}
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/records"
                  element={
                    <LifeLayout>
                      <Suspense fallback={<div className="conversation-route-loading"><KoraPresenceMark state="gathering" label="Opening Wellbeing Records" /></div>}>
                        <WellbeingRecordsWorkspace
                          onAskKora={(reference, draft) => actions.openComposer(reference, draft)}
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/privacy"
                  element={
                    <LifeLayout>
                      <Suspense fallback={<div className="conversation-route-loading"><KoraPresenceMark state="gathering" label="Opening Wellbeing Privacy" /></div>}>
                        <WellbeingPrivacyWorkspace />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/wellbeing/sources"
                  element={<Navigate to="/life/wellbeing/records" replace />}
                />
                <Route
                  path="/life/about-you"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening About You"
                            />
                          </div>
                        }
                      >
                        <LifeProfileWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/about-you/sources"
                  element={<Navigate to="/life/about-you" replace />}
                />
                <Route
                  path="/life/about-you/facts/:factKey"
                  element={
                    <LifeLayout>
                      <Suspense fallback={<div className="conversation-route-loading"><KoraPresenceMark state="gathering" label="Opening personal detail" /></div>}>
                        <LifeProfileWorkspace onAskKora={(reference) => actions.openComposer(reference)} />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/about-you/:profileKey"
                  element={
                    <LifeLayout>
                      <Suspense
                        fallback={
                          <div className="conversation-route-loading">
                            <KoraPresenceMark
                              state="gathering"
                              label="Opening personal detail"
                            />
                          </div>
                        }
                      >
                        <LifeProfileWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </Suspense>
                    </LifeLayout>
                  }
                />
                <Route
                  path="/life/money"
                  element={<LegacyLifeRoute destination="/life/finances" />}
                />
                <Route
                  path="/life/profile"
                  element={<Navigate to="/life/about-you" replace />}
                />
                <Route
                  path="/life/profile/:profileKey"
                  element={
                    <LegacyLifeRoute
                      destination="/life/about-you"
                      param="profileKey"
                    />
                  }
                />
                <Route
                  path="/life/health"
                  element={<LegacyLifeRoute destination="/life/wellbeing" />}
                />
                <Route
                  path="/life/applications"
                  element={<Navigate to="/work" replace />}
                />
                <Route
                  path="/life/applications/:applicationId"
                  element={<Navigate to="/work" replace />}
                />
                <Route
                  path="/brain/today"
                  element={<LegacyLifeRoute destination="/life/today" />}
                />
                <Route
                  path="/brain/finances"
                  element={<LegacyLifeRoute destination="/life/finances" />}
                />
                <Route
                  path="/brain/applications"
                  element={<LegacyLifeRoute destination="/work" />}
                />
                <Route
                  path="/brain/applications/:applicationId"
                  element={<LegacyLifeRoute destination="/work" />}
                />
                <Route
                  path="/brain/profile"
                  element={<LegacyLifeRoute destination="/life/about-you" />}
                />
                <Route
                  path="/brain/profile/:profileKey"
                  element={
                    <LegacyLifeRoute
                      destination="/life/about-you"
                      param="profileKey"
                    />
                  }
                />
                <Route
                  path="/brain/health"
                  element={<LegacyLifeRoute destination="/life/wellbeing" />}
                />
                <Route
                  path="/settings/*"
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label="Opening Settings"
                          />
                        </div>
                      }
                    >
                      <SettingsLayout>
                        <SettingsWorkspace
                          onAskKora={(reference) =>
                            actions.openComposer(reference)
                          }
                        />
                      </SettingsLayout>
                    </Suspense>
                  }
                />
                <Route
                  path={notificationInboxRoute.path}
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label={notificationInboxRoute.loadingLabel}
                          />
                        </div>
                      }
                    >
                      <NotificationInboxPage />
                    </Suspense>
                  }
                />
                <Route
                  path={notificationDetailRoute.path}
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label={notificationDetailRoute.loadingLabel}
                          />
                        </div>
                      }
                    >
                      <NotificationDetailPage />
                    </Suspense>
                  }
                />
                <Route
                  path={approvalDetailRoute.path}
                  element={
                    <Suspense
                      fallback={
                        <div className="conversation-route-loading">
                          <KoraPresenceMark
                            state="gathering"
                            label={approvalDetailRoute.loadingLabel}
                          />
                        </div>
                      }
                    >
                      <ApprovalDetailPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<InvalidRouteRecovery />} />
              </Routes>
            </main>
          </motion.div>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            contextCommands={[
              {
                id: "browse-current-workspace",
                label: `Browse ${activeWorkspace.label}`,
                description:
                  "Open this workspace's navigation and available sections.",
                icon: <PanelLeftOpen size={16} />,
                keys: "Ctrl+B",
                run: () => updateNavigationOpen(true),
              },
            ]}
            searchRecords={searchPaletteRecords}
          />
          <AnimatePresence>
            {draftRecovery && (
              <DraftRecoveryNotice
                recovery={draftRecovery}
                onDismiss={() => setDraftRecovery(undefined)}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {activationStatus && (
              <motion.div
                className="activation-status"
                role="status"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                <span>{activationStatus}</span>
                {activationStatus !== "Opening conversation…" && (
                  <IconButton
                    label="Dismiss conversation notice"
                    tooltip="Dismiss"
                    onClick={() => setActivationStatus(undefined)}
                  >
                    <X size={14} />
                  </IconButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* The open test lives here, not inside the component. AnimatePresence
            tracks its own children, so an always-rendered child never exits. */}
          <AnimatePresence initial={false}>
            {composerOpen && (
              <KoraConversationSurface
                expanded={composerExpanded}
                compact={compactKoraSurface}
                bounds={shellBounds}
                pendingContext={composerContext}
                pendingDraft={composerDraft}
                onOpenChange={(open) => {
                  setComposerOpen(open);
                  if (!open) setComposerExpanded(false);
                }}
                onExpandedChange={setComposerExpanded}
                onContextAttached={clearComposerTransfer}
              />
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {inspector && inspectorOverlay && (
              <MotionButton
                tone="ghost"
                key="inspector-scrim"
                type="button"
                className="inspector-scrim"
                aria-label="Close inspector"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.base, ease: EASE.out }}
                onClick={closeInspector}
              />
            )}
          </AnimatePresence>
          {inspector && (
            <Inspector content={inspector} onClose={closeInspector} onNavigate={() => setInspector(undefined)} />
          )}
        </div>
      </ViewBarProvider>
    </ShellActionContext.Provider>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function RestoredWorkspaceRoute() {
  const route = restoreRoute(),
    pathname = route?.split("?")[0];
  const valid = Boolean(pathname && isRestorableRoute(pathname));
  return <Navigate to={valid ? route! : "/kora"} replace />;
}

function LegacyMemoryWorkspace({
  onAskKora,
}: {
  onAskKora: (reference: ConversationContextRequest) => void;
}) {
  const location = useLocation();
  if (isLegacyProfileSearch(location.search))
    return <Navigate to="/brain/profile" replace />;
  return (
    <BrainLayout>
      <Suspense
        fallback={
          <div className="conversation-route-loading">
            <KoraPresenceMark state="gathering" label="Opening Memory" />
          </div>
        }
      >
        <MemoryWorkspace onAskKora={onAskKora} />
      </Suspense>
    </BrainLayout>
  );
}

function LegacyLifeRoute({
  destination,
  param,
}: {
  destination: string;
  param?: string;
}) {
  const location = useLocation();
  const params = useParams<Record<string, string>>();
  const id = param ? params[param] : undefined;
  return (
    <Navigate
      to={`${destination}${id ? `/${encodeURIComponent(id)}` : ""}${location.search}`}
      replace
    />
  );
}

function AppRouterRoot() {
  return (
    <DirtyDraftGuardProvider>
      <TooltipProvider delay={500}>
        <ToastProvider>
          <RuntimeGate>
            <Shell />
          </RuntimeGate>
          <RuntimeStopGuard />
        </ToastProvider>
      </TooltipProvider>
    </DirtyDraftGuardProvider>
  );
}

const appRoutes = [
  {
    path: "*",
    element: <AppRouterRoot />,
    errorElement: <ApplicationRouteError />,
  },
] satisfies Parameters<typeof createHashRouter>[0];

const appRouter = createHashRouter(appRoutes);

/**
 * Browser and component qualification use the production route tree with an
 * isolated history. This keeps localhost evidence on the real App, shell,
 * startup gate, and recovery owners without connecting a runtime or inventing
 * a parallel specimen router.
 */
export function createAppMemoryRouter(initialEntries: string[]) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

export function App({
  router = appRouter,
}: {
  router?: ReturnType<typeof createHashRouter>;
} = {}) {
  return <RouterProvider router={router} />;
}
