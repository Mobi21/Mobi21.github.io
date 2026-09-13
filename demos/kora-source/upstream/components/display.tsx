import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX, LoaderCircle, ShieldBan, TriangleAlert, Unplug, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import "./kora-ui.css";
import { contentIn, DUR, EASE, skeletonOut } from "../lib/motion";

/* ── Badge ───────────────────────────────────────────────────────────────
   One pill for every piece of state in the product. Raw enums never reach the
   user — pass a humanised label. */

export type BadgeTone =
  | "neutral"
  | "signal"
  | "assistant"
  | "work"
  | "brain"
  | "life"
  | "calendar"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "quiet";

export function Badge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`k-badge${tone === "neutral" ? "" : ` k-badge--${tone}`}`}>
      {dot && <span className="k-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ── Chip ────────────────────────────────────────────────────────────── */

export function Chip({
  icon,
  onRemove,
  removeLabel,
  children,
}: {
  icon?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}) {
  return (
    <span className="k-chip">
      {icon}
      <span>{children}</span>
      {onRemove && (
        <button type="button" className="k-chip__remove" aria-label={removeLabel ?? "Remove"} onClick={onRemove}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      )}
    </span>
  );
}

/* ── Kbd ─────────────────────────────────────────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="k-kbd">{children}</kbd>;
}

export type ItemProps = {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  lines?: 1 | 2;
  className?: string;
  rowProps?: {
    ref?: (node: HTMLElement | null) => void;
    tabIndex?: number;
    onFocus?: () => void;
    "data-focused"?: string;
  };
} & (
  | { kind: "static"; href?: never; onAction?: never; disabled?: never; busy?: never }
  | { kind: "link"; href: string; onAction?: never; disabled?: never; busy?: never }
  | { kind: "action"; href?: never; onAction: () => void; disabled?: boolean; busy?: boolean }
);

/** A readable item with one primary target and sibling secondary actions. */
export function Item({ title, description, leading, trailing, actions, selected = false, lines = 1, className = "", rowProps, ...target }: ItemProps) {
  const busy = target.kind === "action" && target.busy;
  const disabled = target.kind === "action" && (target.disabled || busy);
  const body = <>
    {busy || leading ? <span className="k-item__leading" aria-hidden="true">{busy ? <LoaderCircle size={16} className="spin" /> : leading}</span> : null}
    <span className="k-item__copy"><strong>{title}</strong>{description ? <span className="k-item__description">{description}</span> : null}</span>
    {trailing ? <span className="k-item__trailing">{trailing}</span> : null}
  </>;
  const common = { ...rowProps, className: "k-item__primary" };
  return <div className={`k-item ${className}`.trim()} data-selected={selected || undefined} data-disabled={disabled || undefined} data-lines={lines} data-description={description ? "true" : undefined} data-kind={target.kind}>
    {target.kind === "link"
      ? <Link {...common} to={target.href} aria-current={selected ? "page" : undefined}>{body}</Link>
      : target.kind === "action"
        ? <button {...common} type="button" onClick={target.onAction} disabled={disabled} aria-busy={busy || undefined} aria-current={selected ? "true" : undefined}>{body}</button>
        : <div {...common}>{body}</div>}
    {actions ? <div className="k-item__actions">{actions}</div> : null}
  </div>;
}

/* ── Panel / Toolbar ─────────────────────────────────────────────────── */

export function Panel({
  elevation = "raised",
  className = "",
  children,
}: {
  elevation?: "flat" | "raised" | "floating";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`k-panel${elevation === "raised" ? "" : ` k-panel--${elevation}`} ${className}`}>{children}</div>
  );
}

/** The 44px docked band at the top of a pane. Replaces every page banner. */
export function Toolbar({
  title,
  leading,
  children,
  className = "",
}: {
  title?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`k-toolbar ${className}`}>
      {leading}
      {title && <span className="k-toolbar__title">{title}</span>}
      <span className="k-toolbar__spacer" />
      {children}
    </div>
  );
}

/* ── ListRow ─────────────────────────────────────────────────────────────
   One row for every ledger in the app. Selection is a rail that moves, via a
   shared layoutId — pass `railId` per list. */

export function ListRow({
  title,
  detail,
  meta,
  mark,
  actions,
  selected = false,
  railId,
  to,
  onClick,
  lines = 1,
  className = "",
  rowProps,
}: {
  title: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  mark?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  railId?: string;
  to?: string;
  onClick?: () => void;
  lines?: 1 | 2;
  className?: string;
  rowProps?: {
    ref?: (node: HTMLElement | null) => void;
    tabIndex?: number;
    onFocus?: () => void;
    "data-focused"?: string;
  };
}) {
  const body = (
    <>
      {selected && railId && (
        <motion.span
          layoutId={railId}
          className="k-row__rail"
          transition={{ duration: DUR.quick, ease: EASE.out }}
        />
      )}
      {mark ? <span className="k-row__mark">{mark}</span> : <span />}
      <span className="k-row__copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {actions ? <span className="k-row__actions">{actions}</span> : meta ? <span className="k-row__meta">{meta}</span> : <span />}
    </>
  );

  const classes = `k-row${lines === 2 ? " k-row--double" : ""}${!to && !onClick ? " k-row--static" : ""} ${className}`;

  if (to) {
    return (
      <Link
        {...rowProps}
        to={to}
        className={classes}
        data-selected={selected || undefined}
        aria-current={selected ? "page" : undefined}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      {...rowProps}
      type="button"
      className={classes}
      data-selected={selected || undefined}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/* ── EmptyState ──────────────────────────────────────────────────────────
   Shows the shape of what would be here. It does not advertise the feature. */

export type StateKind = "loading" | "empty" | "unavailable" | "denied" | "partial" | "error" | "offline";

export type ContentStateKind = Exclude<StateKind, "denied"> | "filtered-empty" | "stale" | "restricted" | "success";
export type ContentStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  state: ContentStateKind;
  title: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  geometry?: ReactNode;
  size?: "inline" | "section" | "page";
  announcement?: "off" | "polite" | "assertive";
  headingLevel?: 1 | 2 | 3;
};

const contentStateIcon: Partial<Record<ContentStateKind, ReactNode>> = {
  unavailable: <Unplug size={20} aria-hidden="true" />,
  restricted: <ShieldBan size={20} aria-hidden="true" />,
  partial: <TriangleAlert size={20} aria-hidden="true" />,
  stale: <TriangleAlert size={20} aria-hidden="true" />,
  error: <CircleX size={20} aria-hidden="true" />,
  offline: <WifiOff size={20} aria-hidden="true" />,
  success: <CircleCheck size={20} aria-hidden="true" />,
};

/** One visual owner for content truth. The caller chooses when a change is announced. */
export function ContentState({
  state, title, body, icon, action, geometry, size = "section",
  announcement = "off", headingLevel, className = "", ...props
}: ContentStateProps) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "strong";
  const mark = icon ?? contentStateIcon[state];
  return (
    <div
      {...props}
      className={`k-content-state ${className}`.trim()}
      data-state={state}
      data-size={size}
      role={props.role ?? (announcement === "assertive" ? "alert" : announcement === "polite" ? "status" : undefined)}
      aria-busy={state === "loading" || undefined}
    >
      {mark ? <span className="k-content-state__icon" aria-hidden="true">{mark}</span> : null}
      <div className="k-content-state__copy">
        <Heading className="k-content-state__title" tabIndex={headingLevel === 1 ? -1 : undefined}>{title}</Heading>
        {body ? <div className="k-content-state__body">{body}</div> : null}
      </div>
      {action ? <div className="k-content-state__action">{action}</div> : null}
      {state === "loading" ? <div className="k-content-state__geometry">{geometry ?? <Skeleton rows={3} />}</div> : null}
    </div>
  );
}

/** Preserve legacy announcements while delegating all visual rendering to ContentState. */
export function StateView({
  state, title, align = "start", headingLevel = 2,
  announcement = state === "error" ? "assertive" : state === "empty" ? "off" : "polite",
  "aria-label": ariaLabel, ...props
}: Omit<ContentStateProps, "state" | "size"> & {
  state: StateKind;
  align?: "start" | "center";
}) {
  return <ContentState {...props} title={title} announcement={announcement}
    aria-label={ariaLabel ?? (state === "loading" ? typeof title === "string" ? title : "Loading" : undefined)}
    state={state === "denied" ? "restricted" : state} size={align === "center" ? "page" : "section"} headingLevel={headingLevel} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  align = "start",
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  align?: "start" | "center";
}) {
  return <StateView state="empty" title={title} body={body} icon={icon} action={action} align={align} className="k-empty" />;
}

/* ── Skeleton ────────────────────────────────────────────────────────── */

/**
 * Row-shaped placeholders at the target row height, with one shared shimmer.
 *
 * Wrap with `<SkeletonSwap>` for a short opacity-only handoff to loaded content.
 * Avoid blur or spatial travel while the user is waiting for information.
 */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <motion.div className={`k-skeleton ${className}`} aria-hidden="true" {...skeletonOut}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="k-skeleton__bar" />
      ))}
    </motion.div>
  );
}

/**
 * Crossfades a skeleton to its content. `loading` drives which side is mounted;
 * `AnimatePresence mode="wait"` keeps the two states from overlapping.
 */
export function SkeletonSwap({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading
        ? <motion.div key="skeleton">{skeleton}</motion.div>
        : <motion.div key="content" {...contentIn}>{children}</motion.div>}
    </AnimatePresence>
  );
}

/* ── Callout ─────────────────────────────────────────────────────────── */

export function Callout({
  icon,
  title,
  tone = "neutral",
  children,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  tone?: "neutral" | "signal" | "assistant" | "success" | "warning" | "danger" | "info";
  children?: ReactNode;
}) {
  return (
    <div className={`k-callout${tone === "neutral" ? "" : ` k-callout--${tone}`}`}>
      {icon ?? <span />}
      <div>
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}


/* ── DangerZone ──────────────────────────────────────────────────────────
   Every irreversible action in the product lives in one of these, with a
   confirm. There is no destructive action without one. */

export function DangerZone({
  title,
  body,
  children,
}: {
  title: ReactNode;
  body?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="k-danger">
      <div>
        <span className="k-danger__title">{title}</span>
        {body && <p className="k-danger__body">{body}</p>}
      </div>
      <div className="k-danger__actions">{children}</div>
    </div>
  );
}

/* ── Breadcrumb ──────────────────────────────────────────────────────── */

export type Crumb = { label: string; to?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="k-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.to && index < items.length - 1 ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span className="k-breadcrumb__current" aria-current="page">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
