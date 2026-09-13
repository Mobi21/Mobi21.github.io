import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { PanelLeft, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./button";
import { ContentState } from "./display";
import { Disclosure, Tooltip } from "./overlays";
import { Sheet } from "./primitives";
import "./workspace.css";

export type PageFrameWidth = "focused" | "standard" | "wide" | "fill";
export type PageFrameScroll = "page" | "internal";

export type PageFrameProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  width?: PageFrameWidth;
  scroll?: PageFrameScroll;
  sidebar?: ReactNode;
  sidebarLabel?: string;
  responsiveSidebar?: boolean;
  inspector?: ReactNode;
  inspectorLabel?: string;
  children: ReactNode;
};

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  breadcrumb?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export type RecordPageProps = Omit<PageFrameProps, "children" | "inspector" | "inspectorLabel"> &
  PageHeaderProps & {
    details: ReactNode;
    detailsLabel: string;
    detailsDescription: string;
    children: ReactNode;
  };

export type PageTabItem = {
  value: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
};

export type PageTabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: PageTabItem[];
};

export type PageToolbarProps = HTMLAttributes<HTMLDivElement> & {
  search?: ReactNode;
  controls?: ReactNode;
  compactControls?: ReactNode;
  secondaryActions?: ReactNode;
  primaryAction?: ReactNode;
  density?: "normal" | "compact";
  sticky?: boolean;
};

export type PageSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  layout?: "stack" | "split";
  headingLevel?: 2 | 3;
  children: ReactNode;
};

export type CoverageStripState =
  | "current"
  | "manual"
  | "empty"
  | "partial"
  | "stale"
  | "loading"
  | "reauthorization_required"
  | "unavailable"
  | "not_configured";

export type CoverageStripProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  state: CoverageStripState;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
};

export type SourceInspectorFact = {
  label: ReactNode;
  value: ReactNode;
};

export type SourceInspectorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  status?: ReactNode;
  facts: readonly SourceInspectorFact[];
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  children?: ReactNode;
  className?: string;
};

export type KoraBriefingProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
};

export type StateNoticeProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "restricted";
  presentation?: "inline" | "bounded" | "section";
  title: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export type WorkspaceLocalNavItem = {
  to: string;
  label: ReactNode;
  /** Pointer-visible name used when the shared rail is collapsed. */
  tooltip?: string;
  /** Supporting copy for search-like navigation results, never route state. */
  description?: ReactNode;
  end?: boolean;
  meta?: ReactNode;
  group?: string;
  activePrefixes?: readonly string[];
  activeSearch?: string;
  excludeSearchKeys?: readonly string[];
  active?: boolean;
  icon?: ReactNode;
};

type CompactLocalNavigationRequest = (
  commit: () => void,
  options?: { focusAfterCommit?: boolean },
) => void;

const CompactLocalNavigationContext = createContext<CompactLocalNavigationRequest | null>(null);

/** Lets a custom local-navigation tree participate in the shared close-then-commit flow. */
export function useCompactLocalNavigation() {
  return useContext(CompactLocalNavigationContext);
}

/** Places within one product workspace. Filters and peer views do not belong here. */
export function WorkspaceLocalNav({
  label,
  title,
  items,
  onNavigate,
  className = "",
  persistenceKey,
  headerExtra,
}: {
  label: string;
  title: ReactNode;
  items: WorkspaceLocalNavItem[];
  onNavigate?: () => void;
  className?: string;
  persistenceKey?: string;
  headerExtra?: ReactNode;
}) {
  const groupId = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const requestCompactNavigation = useCompactLocalNavigation();
  const storageKey = `kora.workspace-navigation.${persistenceKey ?? label.toLowerCase().replace(/\W+/g, "-")}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === "collapsed"; }
    catch { return false; }
  });
  const effectiveCollapsed = !requestCompactNavigation && collapsed;
  const toggleCollapsed = () => setCollapsed((current) => {
    const next = !current;
    try { window.localStorage.setItem(storageKey, next ? "collapsed" : "expanded"); } catch { /* storage is optional */ }
    return next;
  });
  const groups = items.reduce<Array<{ label?: string; items: WorkspaceLocalNavItem[] }>>(
    (result, item) => {
      const current = result.at(-1);
      if (!current || current.label !== item.group)
        result.push({ label: item.group, items: [item] });
      else current.items.push(item);
      return result;
    },
    [],
  );
  return (
    <nav className={`k-workspace-local-nav ${className}`.trim()} aria-label={label} data-collapsed={effectiveCollapsed ? "true" : undefined}>
      <div className="k-workspace-local-nav__header">
        <div className="k-workspace-local-nav__title">{title}</div>
        {!requestCompactNavigation ? <Button className="k-workspace-local-nav__collapse" aria-label={effectiveCollapsed ? `Expand ${label}` : `Collapse ${label}`} title={effectiveCollapsed ? `Expand ${label}` : `Collapse ${label}`} onClick={toggleCollapsed}>
          {effectiveCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
        </Button> : null}
      </div>
      {headerExtra ? <div className="k-workspace-local-nav__header-extra">{headerExtra}</div> : null}
      <div className="k-workspace-local-nav__groups">
        {groups.map((group, index) => {
          const labelId = group.label ? `${groupId}-${index}` : undefined;
          return (
            <section
              key={`${group.label ?? "ungrouped"}-${index}`}
              className="k-workspace-local-nav__group"
              aria-labelledby={labelId}
            >
              {group.label ? (
                <h2 id={labelId} className="k-workspace-local-nav__group-label">
                  {group.label}
                </h2>
              ) : null}
              <ul>
                {group.items.map((item) => {
                  const itemPath = item.to.split("?")[0];
                  const params = new URLSearchParams(location.search);
                  const expectedSearch = item.activeSearch ? new URLSearchParams(item.activeSearch) : undefined;
                  const searchMatches = !expectedSearch || [...expectedSearch].every(([key, value]) => params.get(key) === value);
                  const searchExcluded = item.excludeSearchKeys?.some((key) => params.has(key)) ?? false;
                  const detailMatches = item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix)) ?? false;
                  const routeMatches = item.end
                    ? location.pathname === itemPath
                    : location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`);
                  const owns = item.active ?? (!searchExcluded && searchMatches && (detailMatches || routeMatches));
                  const tooltip = item.tooltip ?? (typeof item.label === "string" ? item.label : undefined);
                  const destination = (
                    <Link
                      to={item.to}
                      onClick={(event) => {
                        onNavigate?.();
                        if (!requestCompactNavigation) return;
                        event.preventDefault();
                        requestCompactNavigation(() => navigate(item.to));
                      }}
                      aria-current={owns ? "page" : undefined}
                      className={`k-workspace-local-nav__link${owns ? " is-active" : ""}`}
                    >
                      {item.icon ? <span className="k-workspace-local-nav__icon" aria-hidden="true">{item.icon}</span> : null}
                      {item.description ? <span className="k-workspace-local-nav__copy">
                        <span className="k-workspace-local-nav__label">{item.label}</span>
                        <small className="k-workspace-local-nav__description">{item.description}</small>
                      </span> : <span className="k-workspace-local-nav__label">{item.label}</span>}
                      {item.meta ? <small>{item.meta}</small> : null}
                    </Link>
                  );
                  return (
                  <li key={item.to}>
                    <Tooltip content={tooltip ?? ""} side="right" disabled={!effectiveCollapsed || !tooltip}>{destination}</Tooltip>
                  </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </nav>
  );
}

/** Reuses one local-navigation tree as a compact, focus-managed Sheet. */
export function ResponsiveLocalNavigation({ navigation, label, triggerLabel }: { navigation: ReactNode; label: string; triggerLabel?: string }) {
  const navigationId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingCommit = useRef<{ commit: () => void; focusAfterCommit: boolean } | null>(null);
  const focusObserverRef = useRef<MutationObserver | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  const requestNavigation = useCallback<CompactLocalNavigationRequest>((commit, options) => {
    pendingCommit.current = { commit, focusAfterCommit: options?.focusAfterCommit ?? true };
    setOpen(false);
  }, []);

  const completeNavigation = useCallback((nextOpen: boolean) => {
    if (nextOpen || !pendingCommit.current) return;
    focusObserverRef.current?.disconnect();
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    const request = pendingCommit.current;
    pendingCommit.current = null;
    if (!request.focusAfterCommit) {
      request.commit();
      return;
    }
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>(".view-bar__title, #main-content .k-page-header__title, #main-content h1");
      if (!heading) return false;
      heading.focus({ preventScroll: true });
      return true;
    };
    const main = document.getElementById("main-content");
    let settled = false;
    const observer = main ? new MutationObserver(() => requestAnimationFrame(() => {
      if (focusHeading()) {
        settled = true;
        observer?.disconnect();
        focusObserverRef.current = null;
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    })) : undefined;
    focusObserverRef.current = observer ?? null;
    observer?.observe(main!, { childList: true, subtree: true });
    request.commit();
    focusTimerRef.current = window.setTimeout(() => {
      if (!settled) focusHeading();
      observer?.disconnect();
      focusObserverRef.current = null;
      focusTimerRef.current = null;
    }, 240);
  }, []);

  useEffect(() => () => {
    focusObserverRef.current?.disconnect();
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
  }, []);

  return <>
    <div className="k-page-frame__local-nav-bar">
      <Button
        ref={triggerRef}
        className="k-workspace-local-nav-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen(true)}
      >
        <PanelLeft size={16} aria-hidden="true" />
        {triggerLabel ?? `${label} pages`}
      </Button>
    </div>
    <Sheet
      id={navigationId}
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={completeNavigation}
      title={`${label} pages`}
      description={`Move between pages in ${label}.`}
      purpose="navigation"
      side="left"
      closeLabel={`Close ${label} navigation`}
      className="k-workspace-local-nav-sheet"
      finalFocus={pendingCommit.current ? false : triggerRef}
    >
      <CompactLocalNavigationContext.Provider value={requestNavigation}>
        <div className="k-workspace-local-nav-sheet__body">{navigation}</div>
      </CompactLocalNavigationContext.Provider>
    </Sheet>
  </>;
}

/**
 * The shared geometry owner for product routes.
 *
 * `PageFrame` deliberately does not render a second `main`: the app shell
 * already owns the page landmark. It owns canvas width, gutters, and scroll
 * boundaries while feature code owns the meaning of the content placed in its
 * optional navigation and inspector slots.
 *
 * Responsive sidebar/inspector conversion is handled by the shared local-nav
 * and inspector owners that host those slots. The frame never silently hides
 * meaningful content at a breakpoint.
 */
export function PageFrame({
  width = "standard",
  scroll = width === "fill" ? "internal" : "page",
  sidebar,
  sidebarLabel = "Section navigation",
  responsiveSidebar = true,
  inspector,
  inspectorLabel = "Details",
  className = "",
  children,
  ...props
}: PageFrameProps) {
  return (
    <div
      {...props}
      className={`k-page-frame ${className}`.trim()}
      data-width={width}
      data-scroll={scroll}
      data-has-sidebar={sidebar ? "true" : undefined}
      data-has-inspector={inspector ? "true" : undefined}
    >
      {sidebar ? (
        <aside className="k-page-frame__sidebar" aria-label={sidebarLabel}>
          {sidebar}
        </aside>
      ) : null}
      <div className="k-page-frame__viewport">
        {sidebar && responsiveSidebar ? (
          <ResponsiveLocalNavigation navigation={sidebar} label={sidebarLabel} />
        ) : null}
        <div className="k-page-frame__content">{children}</div>
      </div>
      {inspector ? (
        <aside className="k-page-frame__inspector" aria-label={inspectorLabel}>
          {inspector}
        </aside>
      ) : null}
    </div>
  );
}

/** The single route/record identity block below the global product chrome. */
export function PageHeader({
  breadcrumb,
  title,
  description,
  status,
  actions,
  className = "",
  ...props
}: PageHeaderProps) {
  return (
    <header {...props} className={`k-page-header ${className}`.trim()}>
      {breadcrumb ? <div className="k-page-header__breadcrumb">{breadcrumb}</div> : null}
      <div className="k-page-header__identity">
        <h1 className="k-page-header__title" tabIndex={-1}>{title}</h1>
        {description ? <div className="k-page-header__description">{description}</div> : null}
        {status ? <div className="k-page-header__status">{status}</div> : null}
      </div>
      {actions ? <div className="k-page-header__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * The shared full-record anatomy for canonical domain records.
 *
 * The same details tree is docked at wide widths and disclosed in the reading
 * flow when the shared frame can no longer support a rail. Feature pages own
 * record meaning and actions; this component owns structural composition.
 */
export function RecordPage({
  breadcrumb,
  title,
  description,
  status,
  actions,
  details,
  detailsLabel,
  detailsDescription,
  className = "",
  children,
  ...frameProps
}: RecordPageProps) {
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1181px)").matches);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1181px)");
    const update = () => {
      // A narrower window must not hide the control the person is using.
      if (!media.matches && layoutRef.current?.querySelector('.k-record-page__details')?.contains(document.activeElement)) {
        setDetailsOpen(true);
      }
      setWide(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <PageFrame
      {...frameProps}
      className={`k-record-page ${className}`.trim()}
    >
      <PageHeader
        breadcrumb={breadcrumb}
        title={title}
        description={description}
        status={status}
        actions={actions}
      />
      <div className="k-record-page__layout" ref={layoutRef}>
        <Disclosure
          className="k-record-page__details"
          summary={detailsLabel}
          description={detailsDescription}
          open={wide || detailsOpen}
          onOpenChange={setDetailsOpen}
          keepMounted
        >
          <aside aria-label={detailsLabel}>{details}</aside>
        </Disclosure>
        <div className="k-record-page__body">{children}</div>
      </div>
    </PageFrame>
  );
}

/** Peer views of one page or record, with Base UI owning tab semantics. */
export function PageTabs({
  label,
  value,
  onValueChange,
  items,
  className = "",
  ...props
}: PageTabsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const updateScrollEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = {
      left: viewport.scrollLeft > 1,
      right: viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
    };
    setScrollEdges((current) => current.left === next.left && current.right === next.right ? current : next);
  }, []);

  const revealSelectedTab = useCallback(() => {
    const viewport = viewportRef.current;
    const selected = viewport?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!viewport || !selected) return;

    const selectedStart = selected.offsetLeft;
    const selectedEnd = selectedStart + selected.offsetWidth;
    const visibleStart = viewport.scrollLeft;
    const visibleEnd = visibleStart + viewport.clientWidth;

    if (selectedStart < visibleStart) viewport.scrollLeft = selectedStart;
    else if (selectedEnd > visibleEnd) viewport.scrollLeft = selectedEnd - viewport.clientWidth;

    updateScrollEdges();
  }, [updateScrollEdges, value]);

  useEffect(() => {
    revealSelectedTab();
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return undefined;
    let active = true;
    const observer = new ResizeObserver(revealSelectedTab);
    observer.observe(viewport);
    const list = viewport.querySelector(".k-page-tabs__list");
    if (list) observer.observe(list);
    void document.fonts?.ready.then(() => {
      if (active) revealSelectedTab();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [revealSelectedTab]);

  useLayoutEffect(() => {
    revealSelectedTab();
  }, [revealSelectedTab]);

  return (
    <div {...props} className={`k-page-tabs ${className}`.trim()}>
      <BaseTabs.Root value={value} onValueChange={(next) => onValueChange(String(next))}>
        <div
          className="k-page-tabs__rail"
          data-can-scroll-left={scrollEdges.left || undefined}
          data-can-scroll-right={scrollEdges.right || undefined}
        >
          <div ref={viewportRef} className="k-page-tabs__viewport" onScroll={updateScrollEdges}>
            <BaseTabs.List className="k-page-tabs__list" aria-label={label} activateOnFocus>
              {items.map((item) => (
                <BaseTabs.Tab
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className="k-page-tabs__tab"
                >
                  {item.label}
                </BaseTabs.Tab>
              ))}
              <BaseTabs.Indicator className="k-page-tabs__indicator" />
            </BaseTabs.List>
          </div>
        </div>
        <div className="k-page-tabs__panels">
          {items.map((item) => (
            <BaseTabs.Panel key={item.value} value={item.value} className="k-page-tabs__panel">
              {item.panel}
            </BaseTabs.Panel>
          ))}
        </div>
      </BaseTabs.Root>
    </div>
  );
}

/** Search, view controls, and actions for a route collection or canvas. */
export function PageToolbar({
  search,
  controls,
  compactControls,
  secondaryActions,
  primaryAction,
  density = "normal",
  sticky = false,
  className = "",
  ...props
}: PageToolbarProps) {
  return (
    <div
      {...props}
      className={`k-page-toolbar ${className}`.trim()}
      role="group"
      aria-label={props["aria-label"] ?? "Page controls"}
      data-density={density}
      data-sticky={sticky || undefined}
      data-has-compact-controls={compactControls ? "true" : undefined}
    >
      <div className="k-page-toolbar__query">
        {search ? <div className="k-page-toolbar__search">{search}</div> : null}
        {controls ? <div className="k-page-toolbar__controls">{controls}</div> : null}
        {compactControls ? <div className="k-page-toolbar__compact-controls">{compactControls}</div> : null}
      </div>
      {(secondaryActions || primaryAction) ? (
        <div className="k-page-toolbar__actions">
          {secondaryActions ? <div className="k-page-toolbar__secondary-actions">{secondaryActions}</div> : null}
          {primaryAction ? <div className="k-page-toolbar__primary-action">{primaryAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A page-level content group whose hierarchy is carried by type and space. */
export function PageSection({
  title,
  description,
  actions,
  headingLevel = 2,
  layout = "stack",
  className = "",
  children,
  ...props
}: PageSectionProps) {
  const generatedHeadingId = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const labelledBy = props["aria-labelledby"] ?? generatedHeadingId;

  return (
    <section
      {...props}
      className={`k-page-section ${className}`.trim()}
      data-layout={layout}
      aria-labelledby={labelledBy}
    >
      <div className="k-page-section__header">
        <div className="k-page-section__identity">
          <Heading id={generatedHeadingId} className="k-page-section__title">{title}</Heading>
          {description ? <div className="k-page-section__description">{description}</div> : null}
        </div>
        {actions ? <div className="k-page-section__actions">{actions}</div> : null}
      </div>
      <div className="k-page-section__content">{children}</div>
    </section>
  );
}

/** A single source-coverage summary with one bounded recovery destination. */
export function CoverageStrip({
  state,
  title,
  description,
  action,
  className = "",
  ...props
}: CoverageStripProps) {
  return (
    <section
      {...props}
      className={`k-coverage-strip ${className}`.trim()}
      data-state={state}
    >
      <span className="k-coverage-strip__indicator" aria-hidden="true" />
      <div className="k-coverage-strip__copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {action ? <div className="k-coverage-strip__action">{action}</div> : null}
    </section>
  );
}

/** A source-trust inspector whose facts retain their exact domain-owned values. */
export function SourceInspector({
  open,
  onOpenChange,
  title,
  description,
  status,
  facts,
  finalFocus,
  children,
  className = "",
}: SourceInspectorProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      purpose="inspector"
      finalFocus={finalFocus}
      className={`k-source-inspector ${className}`.trim()}
    >
      <div className="k-source-inspector__content">
        {status ? <div className="k-source-inspector__status">{status}</div> : null}
        <dl className="k-source-inspector__facts">
          {facts.map((fact, index) => (
            <div key={index}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {children ? <div className="k-source-inspector__actions">{children}</div> : null}
      </div>
    </Sheet>
  );
}

/** A restrained assistant synthesis band for recorded outcomes and evidence. */
export function KoraBriefing({
  title = "Kora briefing",
  meta,
  icon = <Sparkles size={18} aria-hidden="true" />,
  children,
  className = "",
  ...props
}: KoraBriefingProps) {
  const headingId = useId();
  return (
    <section
      {...props}
      className={`k-kora-briefing ${className}`.trim()}
      aria-labelledby={props["aria-labelledby"] ?? headingId}
    >
      <div className="k-kora-briefing__mark">{icon}</div>
      <div className="k-kora-briefing__body">
        <div className="k-kora-briefing__heading">
          <h2 id={headingId}>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        <div className="k-kora-briefing__content">{children}</div>
      </div>
    </section>
  );
}

/** Honest local state and recovery without taking over the surrounding page. */
export function StateNotice({
  tone = "neutral",
  presentation = "section",
  title,
  body,
  icon,
  action,
  className = "",
  ...props
}: StateNoticeProps) {
  return <ContentState
    {...props}
    className={className}
    state={tone === "danger" ? "error" : tone === "warning" ? "partial" : tone === "restricted" ? "restricted" : tone === "success" ? "success" : "empty"}
    size={presentation === "inline" || presentation === "bounded" ? "inline" : "section"}
    title={title} body={body} icon={icon} action={action}
  />;
}
