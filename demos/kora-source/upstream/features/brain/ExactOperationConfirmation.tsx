import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3, ShieldCheck, X } from "lucide-react";
import { StateView } from "../../components/display";
import { Button, Modal } from "../../components/primitives";
import { runtime, type NativeToolConfirmation } from "../../lib/runtime";
import "./exact-operation-confirmation.css";

export type ExactOperationConfirmationClient = {
  toolConfirmations(): Promise<{ confirmations: NativeToolConfirmation[] }>;
  approveToolConfirmation(value: string | NativeToolConfirmation): Promise<unknown>;
  rejectToolConfirmation(value: string | NativeToolConfirmation): Promise<unknown>;
};

const defaultClient = runtime as typeof runtime & ExactOperationConfirmationClient;

export function ExactOperationConfirmation({
  open,
  confirmationIds,
  title,
  description,
  approveLabel = "Approve once",
  approveTone = "primary",
  onOpenChange,
  onApproved,
  onRejected,
  client = defaultClient,
}: {
  open: boolean;
  confirmationIds: readonly string[];
  title: string;
  description: string;
  approveLabel?: string;
  approveTone?: "primary" | "danger";
  onOpenChange: (open: boolean) => void;
  onApproved: () => void | Promise<void>;
  onRejected?: () => void | Promise<void>;
  client?: ExactOperationConfirmationClient;
}) {
  const ids = [...new Set(confirmationIds.filter(Boolean))];
  const confirmations = useQuery({
    queryKey: ["exact-operation-confirmations", ...ids],
    enabled: open && ids.length > 0,
    queryFn: () => client.toolConfirmations(),
  });
  const records = ids.map((id) =>
    confirmations.data?.confirmations.find((confirmation) => confirmation.id === id),
  );
  const missing = records.some((record) => !record);
  const resolve = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const exact = records.filter(Boolean) as NativeToolConfirmation[];
      if (exact.length !== ids.length)
        throw new Error("Those approvals are no longer available.");
      if (decision === "approve") {
        for (const confirmation of exact)
          await client.approveToolConfirmation(confirmation);
        await onApproved();
      } else {
        for (const confirmation of exact)
          await client.rejectToolConfirmation(confirmation);
        await onRejected?.();
      }
      return decision;
    },
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="exact-operation-confirmation-modal"
    >
      {confirmations.isLoading ? (
        <StateView state="loading" title="Reading exact approval" />
      ) : confirmations.isError || missing || ids.length === 0 ? (
        <StateView
          state="unavailable"
          title="This approval is no longer waiting"
          body="It may have expired or been handled from another Kora surface. Your draft and record are unchanged."
        />
      ) : (
        <section className="exact-operation-confirmation" aria-live="polite">
          {records.map((record) => record && (
            <div className="exact-operation-confirmation__item" key={record.id}>
              <div className="exact-operation-confirmation__title">
                <ShieldCheck size={19} aria-hidden="true" />
                <span>
                  <strong>{record.presentation.action}</strong>
                  <small>{record.presentation.target}</small>
                </span>
              </div>
              <p>{record.presentation.consequence}</p>
              <small className="exact-operation-confirmation__expiry">
                <Clock3 size={13} aria-hidden="true" />
                Expires {new Date(record.expiresAt).toLocaleString()}
              </small>
            </div>
          ))}
          {resolve.isError && (
            <p className="exact-operation-confirmation__error" role="alert">
              {resolve.error.message}
            </p>
          )}
          <div className="exact-operation-confirmation__actions">
            <Button disabled={resolve.isPending} onClick={() => resolve.mutate("reject")}>
              <X size={14} />Reject
            </Button>
            <Button tone={approveTone} disabled={resolve.isPending} onClick={() => resolve.mutate("approve")}>
              <ShieldCheck size={14} />{approveLabel}
            </Button>
          </div>
        </section>
      )}
    </Modal>
  );
}
