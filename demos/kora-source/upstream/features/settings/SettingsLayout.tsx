import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ResponsiveLocalNavigation, SearchField, WorkspaceLocalNav, useCompactLocalNavigation } from "../../components/primitives";
import {
  SETTINGS_ROUTES,
  searchSettingsDestinations,
  settingsDestinationForHash,
  settingsRouteIdForPath,
  type SettingsDestinationDefinition,
} from "./registry";
import "./settings-frame.css";

function SettingsSearchField({
  compact,
  inputRef,
  query,
  onQueryChange,
  onActivate,
}: {
  compact: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onActivate?: () => void;
}) {
  const requestCompactNavigation = useCompactLocalNavigation();
  return <SearchField
    inputRef={inputRef}
    value={query}
    onValueChange={onQueryChange}
    label="Search settings"
    placeholder="Search settings"
    onKeyDown={(event) => {
      if (event.key !== "Enter" || !onActivate) return;
      event.preventDefault();
      if (compact && requestCompactNavigation) {
        requestCompactNavigation(onActivate, { focusAfterCommit: false });
      }
      else onActivate();
    }}
  />;
}

export function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const activeId = settingsRouteIdForPath(location.pathname);
  const destinations = useMemo(() => searchSettingsDestinations(query), [query]);
  const searching = Boolean(query.trim());
  const visibleDestinations = searching && destinations.length === 0
    ? SETTINGS_ROUTES.map<SettingsDestinationDefinition>((route) => ({
      id: `browse:${route.id}`,
      routeId: route.id,
      group: route.group,
      label: route.label,
      description: `No exact match · ${route.description}`,
      aliases: route.keywords,
      href: `${route.href}#setting-route-${route.id}`,
      anchor: `route-${route.id}`,
      icon: route.icon,
      focus: { role: "heading", name: route.label === "Overview" ? "Settings" : route.label },
      availability: "always",
      kind: "route",
      breadcrumb: `Browse ${route.group}`,
    }))
    : destinations;
  const navigation = (compact = false) => <WorkspaceLocalNav
    label="Settings categories"
    title="Settings"
    persistenceKey="settings"
    headerExtra={<SettingsSearchField
      compact={compact}
      inputRef={compact ? undefined : desktopSearchRef}
      query={query}
      onQueryChange={setQuery}
      onActivate={searching && visibleDestinations[0] ? () => navigate(visibleDestinations[0].href) : undefined}
    />}
    items={visibleDestinations.map((destination) => ({
      to: searching ? destination.href : SETTINGS_ROUTES.find((route) => route.id === destination.routeId)?.href ?? destination.href,
      label: destination.label,
      description: searching ? `${destination.breadcrumb} · ${destination.description}` : undefined,
      group: destination.group,
      end: destination.kind === "route" && destination.routeId === "overview",
      active: searching ? false : destination.routeId === activeId,
      icon: <destination.icon size={16} aria-hidden="true" />,
    }))}
  />;
  const desktopNavigation = navigation();
  const compactNavigation = navigation(true);

  useEffect(() => {
    const focusSettingsSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      if (window.matchMedia?.("(min-width: 1000px)").matches ?? true) {
        desktopSearchRef.current?.focus();
        return;
      }
      const trigger = document.querySelector<HTMLButtonElement>(".settings-capability-layout .k-workspace-local-nav-trigger");
      trigger?.click();
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.k-workspace-local-nav-sheet input[type="search"]')?.focus(), 80);
    };
    window.addEventListener("keydown", focusSettingsSearch);
    return () => window.removeEventListener("keydown", focusSettingsSearch);
  }, []);

  useEffect(() => {
    const destination = settingsDestinationForHash(location.hash);
    if (!destination) return;
    let attempts = 0;
    let timer = 0;
    let highlighted: HTMLElement | null = null;
    let originalTabIndex: string | null = null;
    let originalOutline = "";
    let originalOutlineOffset = "";
    let originalBorderRadius = "";
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const normalize = (value: string | null) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase();

    const focusDestination = () => {
      const selector = destination.focus.role === "heading"
        ? "h1, h2, h3, [role='heading']"
        : "button, a, input, textarea, select, [role='switch'], [role='radio'], [role='combobox']";
      const target = [...document.querySelectorAll<HTMLElement>(selector)]
        .find((candidate) => normalize(candidate.textContent || candidate.getAttribute("aria-label")) === normalize(destination.focus.name));
      if (!target && attempts++ < 30) {
        timer = window.setTimeout(focusDestination, 50);
        return;
      }
      if (!target) return;

      originalTabIndex = target.getAttribute("tabindex");
      if (!target.matches("button, a, input, textarea, select, [tabindex]")) target.tabIndex = -1;
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      }
      target.focus({ preventScroll: true });

      highlighted = target.closest<HTMLElement>(".settings-section, .k-settings-section") ?? target;
      originalOutline = highlighted.style.outline;
      originalOutlineOffset = highlighted.style.outlineOffset;
      originalBorderRadius = highlighted.style.borderRadius;
      highlighted.style.outline = "2px solid var(--focus-ring, Highlight)";
      highlighted.style.outlineOffset = "4px";
      highlighted.style.borderRadius = "var(--radius-control)";
      setAnnouncement(`Opened ${destination.label} in ${destination.breadcrumb}.`);
      timer = window.setTimeout(() => {
        if (!highlighted) return;
        highlighted.style.outline = originalOutline;
        highlighted.style.outlineOffset = originalOutlineOffset;
        highlighted.style.borderRadius = originalBorderRadius;
      }, reducedMotion ? 900 : 1800);
    };

    focusDestination();
    return () => {
      window.clearTimeout(timer);
      if (highlighted) {
        highlighted.style.outline = originalOutline;
        highlighted.style.outlineOffset = originalOutlineOffset;
        highlighted.style.borderRadius = originalBorderRadius;
      }
      const target = document.activeElement as HTMLElement | null;
      if (target && originalTabIndex === null && target.tabIndex === -1) target.removeAttribute("tabindex");
    };
  }, [location.hash, location.pathname]);

  return (
    <section className="settings-capability-layout">
      <aside className="settings-capability-layout__navigation" aria-label="Settings">
        {desktopNavigation}
      </aside>
      <div className="settings-capability-layout__stage">
        <ResponsiveLocalNavigation navigation={compactNavigation} label="Settings" triggerLabel="Browse settings" />
        {children}
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </div>
    </section>
  );
}
