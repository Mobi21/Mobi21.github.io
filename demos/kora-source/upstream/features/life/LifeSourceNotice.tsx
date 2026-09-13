import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "../../components/primitives";
import type { LifeSourceState } from "../../lib/runtime";
import "./life-source-notice.css";

export type LifeSourceStatus = LifeSourceState | { state: "loading" };

export function LifeSourceNotice({
  status,
  onRetry,
}: {
  status: LifeSourceStatus;
  onRetry?: () => void;
}) {
  if (status.state === "ok") return null;
  if (status.state === "loading")
    return (
      <div className="today-source-skeleton" role="status" aria-label="Loading source">
        <span />
        <span />
      </div>
    );
  return (
    <div className={`today-source today-source--${status.state}`} role="status">
      <CircleAlert size={14} />
      <span>
        {status.state === "partial"
          ? `Some sources could not be read: ${status.unavailableSources.join(", ")}.`
          : status.reason ?? "This source is unavailable."}
      </span>
      {status.state === "unavailable" && onRetry ? (
        <Button tone="ghost" onClick={onRetry}>
          <RotateCw size={13} /> Retry
        </Button>
      ) : null}
    </div>
  );
}
