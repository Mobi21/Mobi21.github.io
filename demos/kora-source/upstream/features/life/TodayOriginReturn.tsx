import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { readTodayOrigin } from "./today-navigation";
import "./today-navigation.css";

function asState(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** A contextual return affordance for records opened from Today. */
export function TodayOriginReturn() {
  const location = useLocation();
  const origin = readTodayOrigin(location.state, `${location.pathname}${location.search}`);
  if (!origin) return null;
  // Calendar event details own a focus-contained return action inside their
  // inspector. Keeping this shell sibling hidden avoids an unreachable
  // duplicate behind the inspector's modal/focus boundary.
  if (/^\/calendar\/event\/[^/]+\/[^/]+$/.test(location.pathname)) return null;

  return (
    <div className="today-origin-return" data-origin="today">
      <Link
        className="today-origin-return__link"
        to={origin.route}
        state={{ ...asState(location.state), todayReturn: origin }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to Today
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}
