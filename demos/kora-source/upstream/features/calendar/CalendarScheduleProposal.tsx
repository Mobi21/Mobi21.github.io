import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, MessageCircleMore } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, Sheet } from "../../components/primitives";
import type { CalendarEvent, NativeToolConfirmation } from "../../lib/runtime";

type ProposalServices = {
  toolConfirmations?: () => Promise<{ confirmations: NativeToolConfirmation[] }>;
  approveToolConfirmation: (value: string | NativeToolConfirmation) => Promise<{ confirmation?: NativeToolConfirmation }>;
  rejectToolConfirmation: (value: string | NativeToolConfirmation) => Promise<{ confirmation?: NativeToolConfirmation }>;
};

type DecisionFeedback = { tone: "success" | "danger" | "warning"; message: string };

export function useCalendarScheduleProposalRead(services: ProposalServices, serviceScope: string, enabled = true) {
  return useQuery({
    queryKey: ["calendar", serviceScope, "schedule-proposals"] as const,
    queryFn: () => services.toolConfirmations!(),
    enabled: enabled && Boolean(services.toolConfirmations),
    refetchInterval: enabled ? 3_000 : false,
  });
}

export function CalendarScheduleProposal({ services, serviceScope, proposalRead, events, portalContainer, onEdit, onOpenEvent, onDiscuss }: {
  services: ProposalServices;
  serviceScope: string;
  proposalRead?: ReturnType<typeof useCalendarScheduleProposalRead>;
  events: readonly CalendarEvent[];
  portalContainer: React.RefObject<HTMLElement | null>;
  onEdit: (event: CalendarEvent, trigger: HTMLElement) => void;
  onOpenEvent?: (event: { calendarId: string; eventId: string }, trigger: HTMLElement) => void;
  onDiscuss: (event?: CalendarEvent) => void;
}) {
  const queryClient = useQueryClient();
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [handledIds, setHandledIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<DecisionFeedback>();
  const queryKey = ["calendar", serviceScope, "schedule-proposals"] as const;
  const ownedProposalRead = useCalendarScheduleProposalRead(services, serviceScope, proposalRead === undefined);
  const approvals = proposalRead ?? ownedProposalRead;
  const proposals = useMemo(() => (approvals.data?.confirmations ?? []).filter((confirmation) =>
    confirmation.state === "pending"
    && confirmation.presentation.calendar?.kind === "schedule_proposal"
    && !confirmation.owner?.toolCallId.startsWith("direct:")
    && !handledIds.has(confirmation.id)), [approvals.data, handledIds]);
  const confirmation = proposals[0];
  const proposal = confirmation?.presentation.calendar;
  const affectedEvent = proposal?.affectedEvents.flatMap((affected) => events.filter((event) => event.calendarId === affected.calendarId && event.eventId === affected.eventId))[0];
  const expired = confirmation ? Date.parse(confirmation.expiresAt) <= Date.now() : false;

  const decision = useMutation({
    mutationFn: async (kind: "approve" | "dismiss") => {
      if (!confirmation) throw new Error("proposal_unavailable");
      const result = kind === "approve"
        ? await services.approveToolConfirmation(confirmation)
        : await services.rejectToolConfirmation(confirmation);
      return { kind, result };
    },
    onSuccess: ({ kind, result }) => {
      const state = result.confirmation?.state;
      if (state === "approved" && kind === "approve") {
        setFeedback({ tone: "success", message: "Proposal approved. Kora’s owning run can now apply only this reviewed change." });
      } else if (state === "rejected" && kind === "dismiss") {
        setFeedback({ tone: "success", message: "Proposal dismissed. No Calendar change was approved." });
      } else if (state === "expired") {
        setFeedback({ tone: "warning", message: "This proposal expired before a decision was recorded. No Calendar change was approved." });
      } else if (state === "unavailable") {
        setFeedback({ tone: "danger", message: "The owning run is no longer available. No Calendar change was approved." });
      } else {
        setFeedback({ tone: "warning", message: "This proposal changed while it was open. Review the current approval before deciding." });
      }
      if (confirmation && state && state !== "pending") {
        setHandledIds((current) => new Set(current).add(confirmation.id));
      }
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => setFeedback({ tone: "danger", message: "Kora couldn’t reach the approval owner. The proposal is unchanged; try again from the current review." }),
  });

  if (!services.toolConfirmations) return null;
  if (approvals.isError && !confirmation) return <div className="calendar-proposal-status is-danger" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>Kora couldn’t load schedule proposals. Calendar events remain unchanged.</span><Button tone="ghost" onClick={() => void approvals.refetch()}>Try again</Button></div>;
  if (feedback) return <div className={`calendar-proposal-status is-${feedback.tone}`} role="status" aria-label="Kora schedule proposal outcome"><CircleAlert size={15} aria-hidden="true" /><span>{feedback.message}</span><Button tone="ghost" onClick={() => setFeedback(undefined)}>Dismiss</Button></div>;
  if (!confirmation || !proposal) return null;
  if (expired) return <div className="calendar-proposal-status is-warning" role="status" aria-label="Kora schedule proposal outcome"><CalendarClock size={15} aria-hidden="true" /><span>This schedule proposal expired. No Calendar change was approved.</span></div>;

  return <>
    <div className="calendar-proposal-summary" role="status" aria-label="Kora schedule proposal">
      <span className="calendar-proposal-summary__mark" aria-hidden="true"><CalendarClock size={16} /></span>
      <div><strong>{proposals.length} schedule {proposals.length === 1 ? "proposal needs" : "proposals need"} review</strong><span>{confirmation.presentation.action} · {confirmation.presentation.target}</span></div>
      <Button ref={reviewTrigger} tone="secondary" onClick={() => setOpen(true)}>Review proposal</Button>
    </div>
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Review schedule proposal"
      description="Proposal · no Calendar change has been made"
      purpose="inspector"
      closeLabel="Close schedule proposal"
      className="calendar-proposal-sheet"
      finalFocus={reviewTrigger}
      portalContainer={portalContainer}
      dismissPolicy="explicit"
      onDismissAttempt={() => setOpen(false)}
      busy={decision.isPending}
    >
      <div className="calendar-proposal-detail">
        <dl className="calendar-proposal-facts">
          <div><dt>Source</dt><dd>{proposal.source.label}<small>{proposal.source.authority === "kora" ? "Private Kora authority" : "Connected Google authority"}</small></dd></div>
          <div><dt>Scope</dt><dd>{proposal.scope}</dd></div>
          <div><dt>Consequence</dt><dd>{confirmation.presentation.consequence}</dd></div>
          <div><dt>Proposed by</dt><dd>{confirmation.owner?.kind === "schedule" ? "A scheduled Kora run" : "The foreground Kora run"}</dd></div>
        </dl>
        <section className="calendar-proposal-events" aria-labelledby="calendar-proposal-events-title">
          <div><h3 id="calendar-proposal-events-title">Exact affected {proposal.affectedEvents.length === 1 ? "event" : "events"}</h3><span>{proposal.affectedEvents.length}</span></div>
          {proposal.affectedEvents.map((event, eventIndex) => <article key={`${event.calendarId}:${event.eventId ?? eventIndex}`}>
            <header><strong>{event.title}</strong>{event.eventId && onOpenEvent ? <Button tone="ghost" aria-label={`Open event: ${event.title}`} onClick={() => {
              setOpen(false);
              onOpenEvent({ calendarId: event.calendarId, eventId: event.eventId! }, reviewTrigger.current!);
            }}>Open event</Button> : null}</header>
            <dl>{event.fields.map((field) => <div key={field.name}><dt>{fieldLabel(field.name)}</dt><dd>{field.before !== undefined && <span><small>Current</small>{field.before}</span>}<span><small>{field.before !== undefined ? "Proposed" : "Set to"}</small>{field.after ?? "Not set"}</span></dd></div>)}</dl>
          </article>)}
        </section>
        <p className="calendar-proposal-guard"><CircleAlert size={15} aria-hidden="true" />You’re approving only the changes shown here. Opening or editing an event does not approve this proposal.</p>
        {decision.isError ? <p className="calendar-proposal-error" role="alert">Kora couldn’t record that decision. The proposal remains pending.</p> : null}
        <div className="calendar-proposal-actions">
          <Button tone="ghost" onClick={() => { setOpen(false); onDiscuss(affectedEvent); }}><MessageCircleMore size={16} />Discuss</Button>
          {proposal.operation === "update" && affectedEvent ? <Button tone="secondary" onClick={() => { setOpen(false); onEdit(affectedEvent, reviewTrigger.current!); }}>Edit before approval</Button> : null}
          <Button tone="secondary" loading={decision.isPending} onClick={() => decision.mutate("dismiss")}>Dismiss proposal</Button>
          <Button tone="primary" loading={decision.isPending} onClick={() => decision.mutate("approve")}>Approve exact change</Button>
        </div>
      </div>
    </Sheet>
  </>;
}

function fieldLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
