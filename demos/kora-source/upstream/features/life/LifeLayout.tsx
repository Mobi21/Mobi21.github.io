import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ABOUT_YOU_SECTIONS, MONEY_SECTIONS, WELLBEING_SECTIONS, WORKSPACES, type NavSection } from "../../app/navigation";
import { ResponsiveLocalNavigation, WorkspaceLocalNav } from "../../components/primitives";
import "./life.css";

const LIFE_SECTIONS = WORKSPACES.find((workspace) => workspace.to === "/life")!.sections!;

function LifeNavigation() {
  const location = useLocation();
  const branch = location.pathname.startsWith("/life/finances")
    ? { label: "Money", sections: MONEY_SECTIONS }
    : location.pathname.startsWith("/life/wellbeing")
      ? { label: "Wellbeing", sections: WELLBEING_SECTIONS }
      : location.pathname.startsWith("/life/about-you")
        ? { label: "About You", sections: ABOUT_YOU_SECTIONS }
        : undefined;
  const itemFor = (section: NavSection, group?: string, active?: boolean) => ({
    to: section.to,
    label: section.label,
    end: section.end,
    group,
    active,
    activePrefixes: section.activePrefixes,
    activeSearch: section.activeSearch,
    excludeSearchKeys: section.excludeSearchKeys,
    icon: section.icon ? <section.icon size={16} aria-hidden="true" /> : undefined,
  });
  const roots = LIFE_SECTIONS.map((section) => itemFor(
    section,
    undefined,
    section.to === "/life"
      ? location.pathname === "/life"
      : location.pathname === section.to,
  ));
  return <WorkspaceLocalNav
    label="Life navigation"
    title="Life"
    persistenceKey="life"
    items={[...roots, ...(branch ? branch.sections.map((section) => itemFor(section, branch.label)) : [])]}
  />;
}

export function LifeLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (location.pathname === "/life/today") {
    return <section className="life-workspace" data-life-scope="today"><div className="life-stage">{children}</div></section>;
  }
  const scope = location.pathname.startsWith("/life/wellbeing")
    ? "wellbeing"
    : location.pathname.startsWith("/life/finances")
      ? "money"
      : location.pathname.startsWith("/life/about-you")
        ? "about-you"
      : "life";
  const renderNavigation = () => <LifeNavigation />;
  return (
    <section className="life-workspace" data-has-navigation="true" data-life-scope={scope}>
      <aside className="life-workspace__navigation" aria-label="Life">
        {renderNavigation()}
      </aside>
      <div className="life-stage">
        <ResponsiveLocalNavigation navigation={renderNavigation()} label="Life" />
        {children}
      </div>
    </section>
  );
}
