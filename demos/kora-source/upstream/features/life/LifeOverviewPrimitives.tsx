import type { ReactNode } from "react";
import "./life-overview-primitives.css";

export type LifeSourceStatusState =
  | "loading"
  | "current"
  | "stale"
  | "partial"
  | "unavailable"
  | "restricted"
  | "not_configured";

const SOURCE_STATUS_LABELS: Record<LifeSourceStatusState, string> = {
  loading: "Loading",
  current: "Current",
  stale: "Stale",
  partial: "Partial",
  unavailable: "Unavailable",
  restricted: "Restricted",
  not_configured: "Not set up",
};

export function LifeSourceStatus({
  state,
  label = SOURCE_STATUS_LABELS[state],
}: {
  state: LifeSourceStatusState;
  label?: string;
}) {
  return <span className="life-source-state" data-state={state}>{label}</span>;
}

/** One bounded, destination-oriented matter that deserves attention. */
export function LifeAttentionRow({
  leading,
  title,
  description,
  meta,
  trailing,
}: {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return <div className="life-attention-row">
    {leading ? <div className="life-attention-row__leading">{leading}</div> : null}
    <div className="life-attention-row__copy">
      <strong>{title}</strong>
      {description ? <small>{description}</small> : null}
      {meta ? <span className="life-attention-row__meta">{meta}</span> : null}
    </div>
    {trailing ? <div className="life-attention-row__trailing">{trailing}</div> : null}
  </div>;
}

/** One enabled Life-owned area. Source inspection remains separate from navigation. */
export function LifeAreaRow({
  areaId,
  className = "",
  icon,
  label,
  sourceAction,
  children,
}: {
  areaId: string;
  className?: string;
  icon: ReactNode;
  label: ReactNode;
  sourceAction: ReactNode;
  children: ReactNode;
}) {
  return <article className={`life-area-row ${className}`.trim()} data-domain={areaId}>
    <div className="life-area-row__head life-signal__head">
      <span className="life-area-row__icon life-signal__icon">{icon}</span>
      <strong>{label}</strong>
      {sourceAction}
    </div>
    {children}
  </article>;
}
