import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleOff,
  LockKeyhole,
  PauseCircle,
  WifiOff,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Pressable } from "../../components/button";
import { RuntimeRequestError, type NativeNotification } from "../../lib/runtime";
import "./notifications.css";

export type NotificationAvailability = "empty" | "offline" | "unavailable" | "restricted" | "not-found";

export function notificationAvailabilityForError(error: unknown): Exclude<NotificationAvailability, "empty"> {
  if (error instanceof RuntimeRequestError) {
    if (error.status === 404 || error.code === "notification_not_found") return "not-found";
    if (error.status === 401 || error.status === 403) return "restricted";
    if (["host_unavailable", "runtime_disconnected", "review_gateway_unreachable"].includes(error.code)) return "offline";
  }
  return "unavailable";
}

const typePresentation: Record<NativeNotification["type"], { label: string; icon: ReactNode }> = {
  run_finished: { label: "Run finished", icon: <CheckCircle2 size={16} /> },
  run_stopped: { label: "Run stopped", icon: <PauseCircle size={16} /> },
  custom: { label: "Kora update", icon: <Bell size={16} /> },
};

const attentionLabel = {
  interrupt: "Needs attention",
  digest: "Digest",
  silent: "Quiet",
} as const;

export const NOTIFICATION_PAGE_WINDOW = 30;
export const NOTIFICATION_POPOVER_WINDOW = 8;

export function notificationSource(notification: NativeNotification) {
  if (notification.scheduleId) return "Schedule";
  if (notification.sessionId) return "Kora session";
  return "Kora";
}

export function notificationStateLabel(notification: NativeNotification) {
  if (notification.seenAt) return "Seen";
  return notification.sourceAttentionTier ? attentionLabel[notification.sourceAttentionTier] : "Unseen";
}

export function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationAvailabilityView({
  state,
  message,
  onRetry,
  actions,
  headingLevel,
}: {
  state: NotificationAvailability;
  message?: string;
  onRetry?: () => void;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const content: Record<NotificationAvailability, { icon: ReactNode; title: string; body: string }> = {
    empty: {
      icon: <Bell size={18} />,
      title: "You’re all caught up",
      body: "New updates will appear here without interrupting your work.",
    },
    offline: {
      icon: <WifiOff size={18} />,
      title: "Notifications are offline",
      body: "Kora will show the durable inbox again after the local runtime reconnects.",
    },
    unavailable: {
      icon: <CircleOff size={18} />,
      title: "Notifications aren’t available",
      body: message ?? "Kora couldn’t read this inbox. Your existing notifications remain intact.",
    },
    restricted: {
      icon: <LockKeyhole size={18} />,
      title: "Some updates aren’t shown",
      body: "Restricted notification content stays omitted until this workspace is authorized to read it.",
    },
    "not-found": {
      icon: <CircleOff size={18} />,
      title: "Notification not found",
      body: "This notification was removed or the link is no longer valid. No other notification data was affected.",
    },
  };
  const selected = { ...content[state], body: message ?? content[state].body };
  const liveRole = state === "unavailable" ? "alert" : "status";

  return (
    <div className={`notification-state notification-state--${state}`} role={liveRole}>
      <span className="notification-state__icon" aria-hidden="true">{selected.icon}</span>
      {headingLevel === 1
        ? <h1 className="notification-state__title" tabIndex={-1}>{selected.title}</h1>
        : headingLevel === 2
          ? <h2 className="notification-state__title">{selected.title}</h2>
          : <strong className="notification-state__title">{selected.title}</strong>}
      <span>{selected.body}</span>
      {onRetry ? <Button tone="secondary" onClick={onRetry}>Try again</Button> : null}
      {actions ? <div className="notification-state__actions">{actions}</div> : null}
    </div>
  );
}

export function NotificationLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="notification-loading" role="status" aria-label="Loading notifications">
      {Array.from({ length: rows }, (_, index) => <span key={index} aria-hidden="true" />)}
    </div>
  );
}

export function NotificationFeed({
  notifications,
  onOpen,
  onVisibleWindowChange,
  density = "page",
  activeId,
  windowSize,
}: {
  notifications: readonly NativeNotification[];
  onOpen: (notification: NativeNotification, trigger: HTMLButtonElement) => void;
  onVisibleWindowChange?: (notifications: readonly NativeNotification[]) => void;
  density?: "popover" | "page";
  activeId?: string;
  windowSize?: number;
}) {
  const baseId = useId();
  const unseen = useMemo(() => notifications.filter((notification) => !notification.seenAt), [notifications]);
  const earlier = useMemo(() => notifications.filter((notification) => notification.seenAt), [notifications]);
  const groups = useMemo(() => [
    { id: "new", label: "New", items: unseen },
    { id: "earlier", label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0), [earlier, unseen]);
  const ordered = useMemo(() => [...unseen, ...earlier], [earlier, unseen]);
  const boundedWindowSize = Math.max(1, Math.floor(windowSize ?? (density === "popover" ? NOTIFICATION_POPOVER_WINDOW : NOTIFICATION_PAGE_WINDOW)));
  const [windowStart, setWindowStart] = useState(0);
  const previousPageRef = useRef<HTMLButtonElement>(null);
  const focusPreviousAtEnd = useRef(false);
  const maxWindowStart = Math.max(0, Math.floor((ordered.length - 1) / boundedWindowSize) * boundedWindowSize);
  const normalizedWindowStart = Math.min(windowStart, maxWindowStart);
  const visibleEnd = Math.min(ordered.length, normalizedWindowStart + boundedWindowSize);
  const visibleNotifications = useMemo(
    () => ordered.slice(normalizedWindowStart, visibleEnd),
    [normalizedWindowStart, ordered, visibleEnd],
  );
  const isWindowed = ordered.length > boundedWindowSize;
  const firstNotificationId = notifications[0]?.id;

  useEffect(() => {
    setWindowStart(0);
  }, [boundedWindowSize, density, firstNotificationId]);

  useEffect(() => {
    if (windowStart > maxWindowStart) setWindowStart(maxWindowStart);
  }, [maxWindowStart, windowStart]);

  useEffect(() => {
    if (!activeId) return;
    const activeIndex = ordered.findIndex((notification) => notification.id === activeId);
    if (activeIndex >= 0 && (activeIndex < normalizedWindowStart || activeIndex >= visibleEnd)) {
      setWindowStart(Math.floor(activeIndex / boundedWindowSize) * boundedWindowSize);
    }
  }, [activeId, boundedWindowSize, normalizedWindowStart, ordered, visibleEnd]);

  useEffect(() => {
    if (!focusPreviousAtEnd.current || visibleEnd < ordered.length) return;
    focusPreviousAtEnd.current = false;
    previousPageRef.current?.focus({ preventScroll: true });
  }, [ordered.length, visibleEnd]);

  useEffect(() => {
    onVisibleWindowChange?.(visibleNotifications);
  }, [onVisibleWindowChange, visibleNotifications]);

  let groupOffset = 0;
  const visibleGroups = groups.flatMap((group) => {
    const start = groupOffset;
    groupOffset += group.items.length;
    const visibleItems = group.items.filter((_, index) => {
      const orderedIndex = start + index;
      return orderedIndex >= normalizedWindowStart && orderedIndex < visibleEnd;
    });
    return visibleItems.length ? [{ ...group, items: visibleItems, total: group.items.length }] : [];
  });

  return (
    <div className="notification-feed" data-density={density} data-total={notifications.length}>
      {visibleGroups.map((group) => {
        const headingId = `${baseId}-${group.id}`;
        return (
          <section className="notification-group" aria-labelledby={headingId} key={group.id}>
            <div className="notification-group__head">
              <h2 id={headingId}>{group.label}</h2>
              <span>{group.total}</span>
            </div>
            <div className="notification-group__rows">
              {group.items.map((notification) => {
                const presentation = typePresentation[notification.type];
                const unseenItem = !notification.seenAt;
                return (
                  <Pressable
                    key={notification.id}
                    className="notification-row"
                    data-unseen={unseenItem || undefined}
                    data-active={activeId === notification.id || undefined}
                    onClick={(event) => onOpen(notification, event.currentTarget)}
                  >
                    <span className="notification-row__mark" aria-hidden="true">{presentation.icon}</span>
                    <span className="notification-row__copy">
                      <span className="notification-row__title-line">
                        <strong>{notification.title}</strong>
                        <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>
                      </span>
                      <span className="notification-row__message">{notification.message}</span>
                      <span className="notification-row__meta">
                        <span>{presentation.label}</span>
                        <span>{notificationSource(notification)}</span>
                        <span data-attention={notification.sourceAttentionTier ?? undefined}>{notificationStateLabel(notification)}</span>
                      </span>
                    </span>
                    <span className="notification-row__edge" aria-hidden="true">
                      {unseenItem ? <span className="notification-row__unseen" /> : null}
                      <ChevronRight size={15} />
                    </span>
                  </Pressable>
                );
              })}
            </div>
          </section>
        );
      })}
      {isWindowed ? <footer className="notification-feed__window" aria-label="Loaded notification pages">
        <span role="status">Showing {normalizedWindowStart + 1}–{visibleEnd} of {ordered.length} loaded</span>
        <div className="notification-feed__window-actions">
          <Button
            ref={previousPageRef}
            tone="secondary"
            disabled={normalizedWindowStart === 0}
            onClick={() => setWindowStart((current) => Math.max(0, current - boundedWindowSize))}
          >Previous loaded notifications</Button>
          <Button
            tone="secondary"
            disabled={visibleEnd >= ordered.length}
            onClick={() => setWindowStart((current) => {
              const nextStart = Math.min(maxWindowStart, current + boundedWindowSize);
              focusPreviousAtEnd.current = nextStart + boundedWindowSize >= ordered.length;
              return nextStart;
            })}
          >Next loaded notifications</Button>
        </div>
      </footer> : null}
    </div>
  );
}

export function NotificationInlineError({ children }: { children: ReactNode }) {
  return <span className="notification-inline-error" role="alert"><CircleAlert size={14} />{children}</span>;
}
