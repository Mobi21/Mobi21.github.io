import { Check, Clock3, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/primitives";
import "./settings.css";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function ApprovalPanel({ approvals, onApprove, onReject, busyId, busyAction, showSummary = true }: {
  approvals: Array<{ id: string; title: string; target: string; consequence: string; expiresAt?: string }>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  busyId?: string;
  busyAction?: "approve" | "reject";
  showSummary?: boolean;
}) {
  return <div className="settings-approvals">{approvals.map(approval => <motion.article aria-label={`Decision for ${approval.title}`} layout key={approval.id} className={`settings-approval${showSummary ? "" : " settings-approval--actions-only"}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 18 }}>
    {showSummary ? <><div><ShieldCheck size={18} /><span><strong>{approval.title}</strong><small>{approval.target}</small></span></div><p>{approval.consequence}</p></> : null}
    {approval.expiresAt && <small className="settings-expiry"><Clock3 size={12} /> Expires {formatDate(approval.expiresAt)}</small>}
    <div className="settings-approval__actions"><Button aria-busy={busyId === approval.id && busyAction === "reject" || undefined} onClick={() => onReject(approval.id)} disabled={busyId === approval.id}><X size={14} /> {busyId === approval.id && busyAction === "reject" ? "Rejecting…" : "Reject"}</Button><Button tone="primary" aria-busy={busyId === approval.id && busyAction === "approve" || undefined} onClick={() => onApprove(approval.id)} disabled={busyId === approval.id}><Check size={14} /> {busyId === approval.id && busyAction === "approve" ? "Approving…" : "Approve"}</Button></div>
  </motion.article>)}</div>;
}
