import { ArrowUpRight, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Input, KoraSelect } from "../../components/primitives";

export type LifeQuickCaptureOwner = "life" | "work" | "calendar" | "brain";

const OWNER_OPTIONS: Array<{
  value: LifeQuickCaptureOwner;
  label: string;
  description: string;
}> = [
  { value: "life", label: "Life", description: "Personal state or a Life-owned record" },
  { value: "work", label: "Work", description: "A goal, task, or commitment" },
  { value: "calendar", label: "Calendar", description: "Scheduled time or an event" },
  { value: "brain", label: "Brain", description: "Knowledge or enduring context" },
];

const OWNER_LABELS: Record<LifeQuickCaptureOwner, string> = {
  life: "Life",
  work: "Work",
  calendar: "Calendar",
  brain: "Brain",
};

export function prepareLifeQuickCaptureDraft(
  thought: string,
  proposedOwner: LifeQuickCaptureOwner,
) {
  const captured = thought.trim();
  if (!captured || captured.length > 500) return undefined;
  return [
    "Life quick capture — draft only",
    `Suggested area: ${OWNER_LABELS[proposedOwner]}`,
    `Captured thought: ${captured}`,
    "Confirm the right area and next step with me before creating or changing any record.",
  ].join("\n");
}

export function LifeQuickCapture({
  onPrepare,
}: {
  onPrepare: (draft: string) => void;
}) {
  const [thought, setThought] = useState("");
  const [proposedOwner, setProposedOwner] = useState<LifeQuickCaptureOwner>("life");
  const [announcement, setAnnouncement] = useState("");
  const draft = prepareLifeQuickCaptureDraft(thought, proposedOwner);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    onPrepare(draft);
    setThought("");
    setAnnouncement(`Draft opened with ${OWNER_LABELS[proposedOwner]} as the suggested area. No record was changed.`);
  };

  return <section className="life-quick-capture" aria-labelledby="life-quick-capture-title">
    <div className="life-quick-capture__intro">
      <span className="life-quick-capture__mark" aria-hidden="true"><Sparkles size={16} /></span>
      <div>
        <h2 id="life-quick-capture-title">Capture something for Kora</h2>
        <p>Start a draft with Kora. Kora will confirm the right area before changing anything.</p>
      </div>
    </div>
    <form onSubmit={submit}>
      <Input
        aria-label="What is on your mind?"
        value={thought}
        maxLength={500}
        placeholder="Something to remember, plan, schedule, or understand…"
        onChange={(event) => { setThought(event.target.value); setAnnouncement(""); }}
      />
      <div className="life-quick-capture__owner">
        <span>Suggested area</span>
        <KoraSelect
          value={proposedOwner}
          onValueChange={(value) => setProposedOwner(value as LifeQuickCaptureOwner)}
          options={OWNER_OPTIONS}
          label="Suggested area"
        />
      </div>
      <Button type="submit" tone="primary" disabled={!draft}>
        Open draft <ArrowUpRight size={15} aria-hidden="true" />
      </Button>
    </form>
    <p className="life-quick-capture__disclosure">
      Draft only · suggested area: {OWNER_LABELS[proposedOwner]} · no record changes until you approve them.
    </p>
    {announcement ? <p className="sr-only" role="status" aria-live="polite">{announcement}</p> : null}
  </section>;
}
