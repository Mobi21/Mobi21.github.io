import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { WorkspaceLocalNav } from "../../components/primitives";
import { WORKSPACES } from "../../app/navigation";
import { isSafeWorkReturnPath, workReturnPath } from "./work-navigation-state";
import "./work.css";

export const WORK_NAV_ITEMS = WORKSPACES.find((workspace) => workspace.to === "/work")!.sections!;

export function WorkNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return <WorkspaceLocalNav label="Work" title="Work" items={WORK_NAV_ITEMS.map((item) => ({ ...item, icon: item.icon ? <item.icon size={16} aria-hidden="true" /> : undefined }))} onNavigate={onNavigate} />;
}

function isBrainRecordPath(pathname: string) {
  return /^\/brain\/(?:pages|people|sources)\/[^/]+$/.test(pathname);
}

/** Return affordance for a Brain connection opened from a Work record. */
export function WorkOriginReturn() {
  const location = useLocation();
  if (!isBrainRecordPath(location.pathname)) return null;
  const state = location.state;
  const candidate = state && typeof state === "object" && !Array.isArray(state)
    ? (state as { workOrigin?: unknown }).workOrigin
    : undefined;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const returnTo = (candidate as { returnTo?: unknown }).returnTo;
  if (!isSafeWorkReturnPath(returnTo)) return null;
  const safeReturn = workReturnPath(returnTo, "/work");
  const label = safeReturn.startsWith("/work/tasks/") ? "Back to task" : safeReturn.startsWith("/work/goals/") ? "Back to project" : "Back to Work";
  return <div className="brain-return-bar brain-return-bar--external work-origin-return" data-origin="work">
    <Link className="brain-return-bar__link" to={safeReturn}>
      <ArrowLeft size={14} aria-hidden="true" />
      {label}
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  </div>;
}
