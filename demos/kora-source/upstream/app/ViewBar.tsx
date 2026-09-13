import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../components/primitives";
import { workspaceForPath } from "./navigation";

/**
 * Transitional shell bar contributions.
 *
 * The top bar is the global location owner and migrated routes keep their title
 * and actions in a canvas PageHeader. The modes below are the single migration
 * boundary for routes that still need this older shell slot; feature CSS may not
 * opt a route back into it.
 */

type ViewBarState = {
  title?: string;
  titleRole?: "heading" | "label";
  context?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  variant?: "conversation";
};

export type LegacyViewBarMode = "agent" | "none";

/**
 * Central route ownership for the remaining ViewBar migration boundary.
 *
 * - Agent keeps its existing conversation framing.
 * - Every other product route owns identity and actions inside its canvas.
 */
export function legacyViewBarModeForPath(pathname: string): LegacyViewBarMode {
  if (pathname === "/kora") return "agent";
  return "none";
}

export function viewBarFallbackForPath(pathname: string) {
  if (pathname === "/notifications") return "Notifications";
  if (pathname.startsWith("/notifications/")) return "Notification";
  if (pathname.startsWith("/approvals/")) return "Approval";
  return workspaceForPath(pathname)?.label ?? "Kora";
}

const ViewBarContext = createContext<{
  state: ViewBarState;
  set: (next: ViewBarState) => void;
} | null>(null);

export function ViewBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewBarState>({});
  const value = useMemo(() => ({ state, set: setState }), [state]);
  return <ViewBarContext.Provider value={value}>{children}</ViewBarContext.Provider>;
}

/**
 * Contribute this pane's title, meta and actions to the shell's view bar.
 *
 * `deps` exists because `actions` is JSX and would be a new object every render;
 * without an explicit dependency list this would set state in a loop. Pass the
 * primitive values the actions close over.
 */
export function useViewBar(
  produce: () => ViewBarState,
  deps: readonly unknown[],
) {
  const ctx = useContext(ViewBarContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.set(produce());
    return () => ctx.set({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Render a route contribution as the canvas' single PageHeader. */
export function CanvasPageHeader({ className = "" }: { className?: string }) {
  const ctx = useContext(ViewBarContext);
  const location = useLocation();
  const activeWorkspace = workspaceForPath(location.pathname);
  const { title: contributedTitle, context, meta, leading, actions, variant } = ctx?.state ?? {};
  if (variant === "conversation") return null;
  const title = contributedTitle ?? viewBarFallbackForPath(location.pathname);
  const workspaceContext = context ?? (
    activeWorkspace && activeWorkspace.label !== title ? activeWorkspace.label : undefined
  );
  return <PageHeader className={className} breadcrumb={leading ?? workspaceContext} title={title} status={meta} actions={actions} />;
}

export function ViewBar() {
  const ctx = useContext(ViewBarContext);
  const location = useLocation();
  const mode = legacyViewBarModeForPath(location.pathname);
  const activeWorkspace = workspaceForPath(location.pathname);
  const {
    title: contributedTitle,
    context,
    meta,
    leading,
    actions,
    variant,
  } = ctx?.state ?? {};
  const title = contributedTitle ?? viewBarFallbackForPath(location.pathname);
  const workspaceContext = variant === "conversation" ? context : context ?? (
    activeWorkspace && activeWorkspace.label !== title ? activeWorkspace.label : undefined
  );

  if (mode === "none") {
    return <div className="view-bar view-bar--empty" aria-hidden="true" />;
  }

  return (
    <section
      aria-labelledby="view-bar-title"
      className={`view-bar${variant ? ` view-bar--${variant}` : ""}`}
      data-view-bar-owner={mode}
    >
      <div className="view-bar__identity">
        {leading && <div className="view-bar__leading">{leading}</div>}
        {workspaceContext && (
          <span className="view-bar__context">
            <span aria-hidden="true" />
            {workspaceContext}
          </span>
        )}
        <h1 id="view-bar-title" className="view-bar__title" tabIndex={-1}>{title}</h1>
        {meta && <span className="view-bar__meta">{meta}</span>}
      </div>
      {actions && <div className="view-bar__actions">{actions}</div>}
    </section>
  );
}
