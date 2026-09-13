import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ABOUT_YOU_SECTIONS, navigationSectionForLocation } from "../../app/navigation";
import { KoraSelect, WorkspaceLocalNav } from "../../components/primitives";
import "./about-you-navigation.css";

export const ABOUT_YOU_NAV_ITEMS = ABOUT_YOU_SECTIONS;

export function AboutYouNavigation({ onNavigate, variant = "sidebar" }: { onNavigate?: () => void; variant?: "sidebar" | "picker" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const current = navigationSectionForLocation(ABOUT_YOU_NAV_ITEMS, location.pathname, location.search) ?? ABOUT_YOU_NAV_ITEMS[0]!;

  if (variant === "picker") return <div className="about-you-destination-picker"><KoraSelect label="About You destination" value={current.to} options={[{ value: "/life", label: "Life overview", description: "Return to your personal context" }, ...ABOUT_YOU_NAV_ITEMS.map((item) => ({ value: item.to, label: item.label, description: item.description }))]} onValueChange={(value) => { onNavigate?.(); navigate(value); }} /></div>;

  return <WorkspaceLocalNav label="About You pages" title={<span className="about-you-navigation__title life-domain-nav-title"><Link to="/life"><ArrowLeft size={14} aria-hidden="true" />Life</Link><strong>About You</strong><small>Readable, correctable personal context</small></span>} items={ABOUT_YOU_NAV_ITEMS.map((item) => { const Icon = item.icon; return { to: item.to, end: item.end, activePrefixes: item.activePrefixes, active: item.to === current.to, group: item.group, label: <span className="about-you-navigation__item">{Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{item.label}</span></span> }; })} onNavigate={onNavigate} className="about-you-navigation" />;
}
