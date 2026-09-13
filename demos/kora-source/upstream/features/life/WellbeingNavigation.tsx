import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  KoraSelect,
  PageFrame,
  WorkspaceLocalNav,
} from "../../components/primitives";
import { WELLBEING_SECTIONS } from "../../app/navigation";
import "./wellbeing-navigation.css";

export const WELLBEING_NAV_ITEMS = WELLBEING_SECTIONS;

export function WellbeingNavigation({
  onNavigate,
  variant = "sidebar",
}: {
  onNavigate?: () => void;
  variant?: "sidebar" | "picker";
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const current = [...WELLBEING_NAV_ITEMS].reverse().find((item) =>
    item.end
      ? location.pathname === item.to
      : location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`),
  ) ?? WELLBEING_NAV_ITEMS[0]!;
  if (variant === "picker") {
    const CurrentIcon = current.icon;
    return (
      <div className="wellbeing-destination-picker">
        <div className="wellbeing-destination-picker__context" aria-hidden="true">
          {CurrentIcon ? <CurrentIcon size={17} /> : null}
          <span>
            <strong>{current.group}</strong>
            <small>{current.description}</small>
          </span>
        </div>
        <div className="wellbeing-destination-picker__control">
          <KoraSelect
            label="Wellbeing page"
            value={current.to}
            options={[
              { value: "/life", label: "Life overview", description: "Return to your personal context" },
              ...WELLBEING_NAV_ITEMS.map((item) => ({
                value: item.to,
                label: item.label,
                description: item.description,
              })),
            ]}
            onValueChange={(value) => {
              onNavigate?.();
              navigate(value);
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <WorkspaceLocalNav
      label="Wellbeing pages"
      title={<span className="wellbeing-navigation__title life-domain-nav-title"><Link to="/life"><ArrowLeft size={14} aria-hidden="true" />Life</Link><strong>Wellbeing</strong><small>Daily rhythm, care, and patterns</small></span>}
      items={WELLBEING_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return {
        to: item.to,
        end: item.end,
        group: item.group,
        tooltip: item.label,
        label: <span className="wellbeing-navigation__item">{Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{item.label}</span></span>,
      };})}
      onNavigate={onNavigate}
      className="wellbeing-navigation"
    />
  );
}

export function WellbeingFrame({ children }: { children: ReactNode }) {
  return (
    <PageFrame
      width="wide"
      sidebar={<WellbeingNavigation />}
      sidebarLabel="Wellbeing"
      responsiveSidebar={false}
      className="wellbeing-frame"
    >
      <WellbeingNavigation variant="picker" />
      {children}
    </PageFrame>
  );
}
