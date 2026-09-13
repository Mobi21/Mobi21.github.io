import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  isBrainExternalRecordPath,
  readBrainOrigin,
  searchReturnPath,
  withBrainOrigin,
} from "./brain-navigation";

/** Return navigation for Brain results whose destination is owned by another workspace. */
export function BrainOriginReturn() {
  const location = useLocation();
  const brainOrigin = readBrainOrigin(location.state);
  if (!brainOrigin || !isBrainExternalRecordPath(location.pathname)) return null;
  const returnTo = brainOrigin.kind === "search" ? searchReturnPath(brainOrigin.snapshot) : "/brain";
  return (
    <div className="brain-return-bar brain-return-bar--external">
      <Link
        className="brain-return-bar__link"
        to={returnTo}
        state={withBrainOrigin(location.state, brainOrigin)}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {brainOrigin.kind === "search" ? "Back to Search" : "Back to Brain"}
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}
