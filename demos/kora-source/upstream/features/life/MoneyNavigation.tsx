import { ArrowLeft } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { KoraSelect, WorkspaceLocalNav } from "../../components/primitives";
import { MONEY_SECTIONS } from "../../app/navigation";
import "./money-navigation.css";

export const MONEY_NAV_ITEMS = MONEY_SECTIONS;

export function MoneyNavigation({ onNavigate, variant = "sidebar" }: { onNavigate?: () => void; variant?: "sidebar" | "bar" }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (variant === "bar") {
    const current = [...MONEY_NAV_ITEMS].reverse().find((item) => item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) ?? MONEY_NAV_ITEMS[0]!;
    return <div className="money-local-navigation"><nav className="money-local-nav" aria-label="Money pages"><ul><li><NavLink to="/life" end onClick={onNavigate}>Life overview</NavLink></li>{MONEY_NAV_ITEMS.map((item) => <li key={item.to}><NavLink to={item.to} end={item.end} onClick={onNavigate}>{item.label}</NavLink></li>)}</ul></nav><div className="money-local-picker"><KoraSelect label="Money destination" value={current.to} options={[{ value: "/life", label: "Life overview", description: "Return to your personal context" }, ...MONEY_NAV_ITEMS.map((item) => ({ value: item.to, label: item.label, description: item.description }))]} onValueChange={(value) => { onNavigate?.(); navigate(value); }} /></div></div>;
  }
  return <WorkspaceLocalNav label="Money" title={<span className="life-domain-nav-title"><Link to="/life"><ArrowLeft size={14} aria-hidden="true" />Life</Link><strong>Money</strong><small>Position, activity, and plans</small></span>} items={MONEY_NAV_ITEMS.map((item) => ({ ...item, icon: item.icon ? <item.icon size={16} aria-hidden="true" /> : undefined }))} onNavigate={onNavigate} />;
}
