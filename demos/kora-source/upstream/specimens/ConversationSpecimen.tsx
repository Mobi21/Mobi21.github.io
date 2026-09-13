import "@fontsource-variable/mona-sans";
import { CheckCircle2, CircleAlert, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, KoraSelect } from "../components/primitives";
import { ConversationItemView, responseItems } from "../features/conversation/ConversationItems";
import "../styles/tokens.css";
import "../styles/app.css";
import "../components/kora-ui.css";
import "../features/conversation/conversation.css";
import type { ConversationItem } from "../lib/runtime";
import "./conversation-specimen.css";

export const conversationSpecimenFixtures = ["populated", "statuses", "streaming", "long", "approvals", "stress"] as const;
export type ConversationSpecimenFixture = (typeof conversationSpecimenFixtures)[number];
export type ConversationSpecimenTheme = "dark" | "light";
export const conversationSpecimenDirections = ["baseline", "reading", "panels"] as const;
export type ConversationSpecimenDirection = (typeof conversationSpecimenDirections)[number];

const createdAt = "2026-09-04T15:00:00.000Z";

function fixtureFromQuery(): ConversationSpecimenFixture {
  const requested = new URLSearchParams(window.location.search).get("fixture") as ConversationSpecimenFixture | null;
  return requested && conversationSpecimenFixtures.includes(requested) ? requested : "populated";
}

function themeFromQuery(): ConversationSpecimenTheme {
  return new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
}

function directionFromQuery(): ConversationSpecimenDirection {
  const requested = new URLSearchParams(window.location.search).get("direction") as ConversationSpecimenDirection | null;
  return requested && conversationSpecimenDirections.includes(requested) ? requested : "baseline";
}

function userMessage(id: string, text: string): ConversationItem {
  return { id, kind: "user_message", status: "completed", createdAt, content: [{ type: "text", text }] };
}

function assistantMessage(id: string, content: string, status: ConversationItem["status"] = "completed"): ConversationItem {
  return { id, kind: "assistant_message", status, createdAt, content };
}

function toolActivity(
  id: string,
  status: ConversationItem["status"],
  label: string,
  options: { toolName?: string; summary?: string; durationMs?: number } = {},
): ConversationItem {
  return {
    id,
    kind: "tool_activity",
    status,
    createdAt,
    toolCallId: `call-${id}`,
    toolName: options.toolName ?? "read_notes",
    label,
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
  };
}

function skillActivity(id: string, status: ConversationItem["status"], name: string, description: string): ConversationItem {
  return { id, kind: "skill_activity", status, createdAt, name, description, invocation: "explicit" };
}

function populatedItems(): ConversationItem[] {
  return [
    userMessage("pop-user-1", "Can you help me make a gentle plan for Saturday? I want time for the market, a long walk, and two focused hours for my portfolio without making the day feel overbooked."),
    assistantMessage("pop-assistant-1", `## A spacious Saturday

Here is a light structure that leaves room to change your mind:

- **9:00** — Coffee and a slow start
- **10:00** — Neighborhood market
- **11:30** — Long walk, with no errands attached
- **2:00** — Two focused hours for the portfolio
- **4:30** — Stop working and keep the evening open

The key constraint is to protect the walk and the work block as separate kinds of time. If the morning runs long, move the work block rather than compressing both.

| Block | Intention | Flex point |
| --- | --- | --- |
| Market | Gather what you need | Leave after the essentials |
| Walk | Reset your attention | Take the shorter loop |
| Portfolio | Finish one meaningful slice | Stop at the timebox |

\`\`\`text
Saturday plan: market → walk → portfolio
Reminder: leave one unassigned hour
\`\`\``),
    { id: "pop-reasoning", kind: "reasoning_summary", status: "completed", createdAt, content: "Checked the requested priorities and kept the plan reversible.", source: "provider_summary" },
    toolActivity("pop-tool", "completed", "Read your planning notes", { summary: "Used the synthetic planning context supplied by this fixture.", durationMs: 412 }),
    skillActivity("pop-skill", "completed", "Personal planning", "Turned the stated priorities into a low-pressure sequence."),
    toolActivity("pop-browser", "completed", "Checked the walking route", { toolName: "browser_observe", summary: "Synthetic browser activity: the route details are represented only for visual review.", durationMs: 780 }),
    { id: "pop-command", kind: "command_result", status: "completed", createdAt, command: "/status", result: { kind: "facts", title: "Synthetic session status", facts: [{ label: "Conversation", value: "Local fixture", state: "ready" }, { label: "Agent execution", value: "Disabled", state: "neutral" }, { label: "Provider", value: "Not connected", state: "neutral" }] } },
    assistantMessage("pop-assistant-2", "I also prepared a compact version you can keep nearby: choose the market, take the walk, then make one portfolio decision before you call the work block done."),
    { id: "pop-approval", kind: "approval", status: "waiting", createdAt, approvalId: "synthetic-approval", title: "Approve the Saturday reminder", target: "A local reminder at 1:45 PM", consequence: "This would add a reminder to the local fixture only; no real calendar or notification is changed.", expiresAt: "2026-09-05T13:45:00.000Z" },
    { id: "pop-artifact", kind: "artifact", status: "completed", createdAt, artifact: { id: "synthetic-artifact", mediaType: "text/markdown", title: "Saturday plan brief · preview unavailable" }, provenance: "Synthetic summary · no stored artifact" },
  ];
}

const statusOrder: ConversationItem["status"][] = ["queued", "starting", "running", "waiting", "stopped", "failed", "completed"];

function statusItems(): { generic: ConversationItem[]; browser: ConversationItem[] } {
  return {
    generic: statusOrder.map((status) => toolActivity(`generic-${status}`, status, `Generic tool · ${status}`, { toolName: "read_notes" })),
    browser: statusOrder.map((status) => toolActivity(`browser-${status}`, status, `Browser tool · ${status}`, { toolName: "browser_fixture_status" })),
  };
}

function streamingItems(status: "running" | "completed"): ConversationItem[] {
  return [
    userMessage("stream-user", "Draft the first paragraph for my weekend plan, then let me decide when it is finished."),
    toolActivity("stream-tool", status, "Shape the opening paragraph", { summary: "Synthetic streaming work: this disclosure remains available for manual expansion before settlement." }),
    assistantMessage("stream-assistant", status === "running"
      ? "## A small beginning\n\nStart with one clear promise to yourself: make room for the walk, then choose one portfolio task that can be complete by dinner."
      : "## A small beginning\n\nStart with one clear promise to yourself: make room for the walk, then choose one portfolio task that can be complete by dinner.\n\nThat is enough structure to begin without turning the plan into another obligation.", status),
  ];
}

function longItems(): ConversationItem[] {
  const turns: ConversationItem[] = [];
  const prompts = [
    "Help me shape a calm personal planning rhythm around the studio launch, exercise, and enough blank space to notice what is actually changing.",
    "Now turn that rhythm into a realistic Monday through Friday outline with explicit handoffs between creative work, admin, meals, and recovery.",
    "Add a review ritual that tells me what to carry forward, what to cancel, and what needs a real decision from another person.",
    "Make the language warm enough to use as a note to myself, while keeping the commitments and their boundaries precise.",
    "Give me a final compact version and leave the unresolved choices visible so I do not accidentally treat a draft as a promise.",
  ];
  prompts.forEach((prompt, index) => {
    turns.push(userMessage(`long-user-${index}`, prompt));
    turns.push({ id: `long-reasoning-${index}`, kind: "reasoning_summary", status: "completed", createdAt, content: `Reviewed the accumulated planning context for turn ${index + 1} and kept owner, timing, and reversibility visible.`, source: "provider_summary" });
    turns.push(toolActivity(`long-tool-${index}`, index === 2 ? "failed" : "completed", index === 2 ? "Re-reading the exceptionally long planning context and its unresolved dependencies" : `Read the long planning note for turn ${index + 1}`, { summary: index === 2 ? "Synthetic failure state for layout review; no work was performed." : "Synthetic fixture context was available for this visual review.", durationMs: 380 + index * 127 }));
    turns.push(skillActivity(`long-skill-${index}`, "completed", index % 2 === 0 ? "Long-form personal planning" : "Decision boundary review", "Kept the response grounded in the user’s stated constraints and made open choices explicit."));
    turns.push(assistantMessage(`long-assistant-${index}`, `## Turn ${index + 1}: keep the plan usable

The plan works when it names the next decision without pretending that every later detail is settled. Protect one anchor block, give the supporting tasks a visible home, and leave a deliberate margin for the parts of the week that cannot be known yet.

- Keep the anchor block small enough to finish.
- Put coordination after the first draft, so feedback has something concrete to react to.
- Record what changed and why, then let the next review start from that evidence.

This is intentionally long copy for the specimen. It should remain readable at a wide desktop viewport, wrap without creating a horizontal page scroll, and preserve the relationship between a user turn, grouped work, and the assistant’s final response.`, "completed"));
  });
  return turns;
}

type ApprovalConversationItem = Extract<ConversationItem, { kind: "approval" }>;

function approvalItems(): ApprovalConversationItem[] {
  return [
    { id: "approval-pending", kind: "approval", status: "waiting", createdAt, approvalId: "approval-pending", title: "Pending · move the Saturday reminder", target: "Local reminder at 1:45 PM", consequence: "This would change only the synthetic reminder record shown in this fixture.", expiresAt: "2026-09-05T13:45:00.000Z" },
    { id: "approval-approved", kind: "approval", status: "completed", createdAt, approvalId: "approval-approved", title: "Resolved · add the market note", target: "Saturday planning note", consequence: "The synthetic note was marked approved for this rendered conversation.", resolvedAs: "approved" },
    { id: "approval-rejected", kind: "approval", status: "completed", createdAt, approvalId: "approval-rejected", title: "Resolved · share the draft route", target: "Walking route suggestion", consequence: "The synthetic share proposal was declined and no local fixture record changed.", resolvedAs: "rejected" },
    { id: "approval-callback-error", kind: "approval", status: "waiting", createdAt, approvalId: "approval-callback-error", title: "Callback error · save the open choice", target: "Synthetic decision record", consequence: "Choosing this option deliberately returns a fixture error so the component recovery state can be reviewed.", expiresAt: "2026-09-05T15:00:00.000Z" },
  ];
}

const stressPrompts = [
  "Help me decide what deserves the first hour of tomorrow when the studio launch, laundry, and a tired brain all compete for attention.",
  "Turn that first hour into a small plan that still works if I wake up late or need a slower start.",
  "I want a short way to tell the difference between a task I can finish and a task that only needs a next step.",
  "Can you make the next step for the launch review concrete without pretending the review itself is already approved?",
  "I have a walk, a grocery run, and two calls; help me keep the day from becoming a chain of rushed transitions.",
  "What should I write down after the first call so the second call starts with the right context?",
  "The draft is almost ready, but the open questions are scattered across notes. Help me gather them without solving them yet.",
  "Give me a calm order for the open questions: evidence first, decisions second, wording last.",
  "I need to protect a quiet evening even though the launch checklist is not finished. What boundary would be honest?",
  "Can you phrase that boundary as a note I can send to the people waiting for the next draft?",
  "The morning changed. Replan the rest of today from the commitments that still have a real owner.",
  "Show me what can move to Friday and what would become risky if I moved it again.",
  "I keep reopening the same decision about the portfolio case study. Help me name the smallest decision that ends the loop.",
  "Turn that decision into a two sentence acceptance check I can use before I publish anything.",
  "The work block is starting. Give me a short focus ritual that does not add another project to manage.",
  "I finished the main edit but not the cleanup. How should I record that honestly for tomorrow?",
  "There are three pieces of feedback and they do not agree. Help me separate preference from an actual constraint.",
  "Make a table of those feedback types that I can review with a collaborator without implying a final answer.",
  "I need to ask for a decision from someone else. What context is enough, and what can wait until they answer?",
  "Draft that request so the recipient can respond without having to reconstruct the entire project history.",
  "The response came back with one clear yes and two vague maybes. What should I treat as settled?",
  "Help me choose a follow up that is direct but leaves the other person room to say no.",
  "The launch notes now contain old dates. Give me a safe cleanup order that preserves the source of each date.",
  "I want to keep the notes readable for next week without deleting context that explains why the plan changed.",
  "Can you suggest a compact daily review with one question about energy, one about evidence, and one about ownership?",
  "The plan feels too full again. Which commitment should become a placeholder instead of a promise?",
  "I have enough information to choose, but I am still waiting for certainty. Help me state the remaining uncertainty precisely.",
  "Write a short checkpoint for the end of the week that distinguishes finished work, pending decisions, and abandoned ideas.",
  "I want a version of this week that I can read in ninety seconds before Monday begins.",
  "Keep the final version warm and practical, with the unresolved choices visible instead of hidden in optimistic wording.",
];

const stressStatuses: ConversationItem["status"][] = ["completed", "starting", "running", "waiting", "stopped", "failed"];

const stressMarkdown = `## Evidence before momentum

The long form remains readable when it keeps one decision per paragraph and gives every open question a visible owner. Preserve the source trail, leave the next move small, and let a quiet evening stay quiet.

| Monday morning planning block | Tuesday evidence review | Wednesday collaborator handoff | Thursday final wording pass | Friday gentle close |
| --- | --- | --- | --- | --- |
| Choose one anchor | Check the source | Name the decision owner | Write the smallest useful draft | Record what changed |
| Keep one hour open | Mark uncertain dates | Ask for a clear response | Preserve unresolved choices | Leave the evening unassigned |

The reference may be long and unbroken: https://planning.example.invalid/workspace/weekly-review/2026-09-04/decision-boundary/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

[Planning reference](https://planning.example.invalid/review) is an explicit synthetic external link for inspecting the link confirmation without opening an external site.

\`\`\`text
owner: studio-launch
next: ask for the smallest useful decision
reference: https://planning.example.invalid/source/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Keep the open question visible until its owner answers.
\`\`\``;

function stressItems(): ConversationItem[] {
  const items: ConversationItem[] = [];
  stressPrompts.forEach((prompt, index) => {
    const status = stressStatuses[index % stressStatuses.length];
    items.push(userMessage(`stress-user-${index}`, prompt));
    items.push({ id: `stress-reasoning-${index}`, kind: "reasoning_summary", status: status === "starting" ? "starting" : "completed", createdAt, content: index === 0 ? "Sorted the request into an owner, a next step, and a boundary." : `Kept the open decision and its source visible for planning turn ${index + 1}.`, source: "provider_summary" });
    items.push(toolActivity(`stress-tool-${index}`, status, index === 2 ? "Read the unusually long planning reference" : `Read the planning note for the ${index % 2 === 0 ? "morning" : "evening"} review`, { toolName: index % 5 === 0 ? "browser_fixture_status" : "read_notes", summary: index % 4 === 0 ? undefined : "Synthetic stress fixture detail; no external work was performed.", durationMs: 280 + index * 19 }));
    if (index % 3 === 0) items.push(skillActivity(`stress-skill-${index}`, status === "failed" ? "failed" : "completed", index % 2 === 0 ? "Personal planning" : "Decision boundary review", "Kept the response grounded in the stated constraints."));
    if (index === 7) items.push({ id: "stress-command-failure", kind: "command_result", status: "failed", createdAt, command: "/review", result: { kind: "failure", title: "Synthetic command error", message: "The rendered review state could not settle this fixture command.", code: "synthetic_review_failure", retryable: false } });
    if (index === 14) items.push({ id: "stress-command-empty", kind: "command_result", status: "completed", createdAt, command: "/checkpoint", result: { kind: "completed" } });
    const content = index === 0 ? stressMarkdown : `## Turn ${index + 1}: one useful next step\n\nThe plan can stay calm when it records what is known, what needs a decision, and who owns the next move. Keep the request small enough to answer and the boundary clear enough to honor.`;
    items.push(assistantMessage(`stress-assistant-${index}`, content, status));
  });
  return items;
}

function chooseQuery(key: "fixture" | "theme" | "direction", value: string) {
  const query = new URLSearchParams(window.location.search);
  query.set(key, value);
  window.location.search = query.toString();
}

function ConversationFeed({ items, onResolveApproval }: { items: ConversationItem[]; onResolveApproval?: (item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => Promise<void> }) {
  return <div className="conversation-specimen__feed">{responseItems(items, onResolveApproval)}</div>;
}

function StatusFixture() {
  const { generic, browser } = statusItems();
  return <>
    <div className="conversation-specimen__section-heading"><h2>Tool status matrix</h2><span>Every row is the actual public item view</span></div>
    <div className="conversation-specimen__status-grid">
      <section className="conversation-specimen__status-column" aria-labelledby="generic-statuses-title">
        <h2 id="generic-statuses-title">Generic tool activity</h2>
        {generic.map((item) => <ConversationItemView key={item.id} item={item} />)}
      </section>
      <section className="conversation-specimen__status-column" aria-labelledby="browser-statuses-title">
        <h2 id="browser-statuses-title">Browser tool activity</h2>
        {browser.map((item) => <ConversationItemView key={item.id} item={item} />)}
      </section>
    </div>
  </>;
}

function StreamingFixture() {
  const [status, setStatus] = useState<"running" | "completed">("running");
  return <>
    <div className="conversation-specimen__streaming-actions">
      <div>
        <strong>{status === "running" ? "Response is streaming" : "Response is settled"}</strong>
        <p>Expand the live response manually before settling it; the button only changes the local item status.</p>
      </div>
      <Button tone="primary" onClick={() => setStatus((current) => current === "running" ? "completed" : "running")}>
        {status === "running" ? "Settle response" : "Resume streaming"}
      </Button>
    </div>
    <ConversationFeed items={streamingItems(status)} />
  </>;
}

function ApprovalsFixture() {
  const [items, setItems] = useState<ApprovalConversationItem[]>(approvalItems);
  const [lastOutcome, setLastOutcome] = useState<string>();

  const resolveApproval = async (item: ApprovalConversationItem, disposition: "approved" | "rejected") => {
    if (item.approvalId === "approval-callback-error") throw new Error("Synthetic callback error: this local approval could not be recorded.");
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status: "completed", resolvedAs: disposition } : candidate));
    setLastOutcome(`${item.title} → ${disposition}. Local fixture state updated; no runtime call was made.`);
  };

  return <>
    <div className="conversation-specimen__section-heading"><h2>Approval state matrix</h2><span>Keyboard reachable · local callback only</span></div>
    {lastOutcome && <div className="conversation-specimen__simulated-result" role="status"><CheckCircle2 size={14} aria-hidden="true" /><span>{lastOutcome}</span></div>}
    <ConversationFeed items={items} onResolveApproval={resolveApproval} />
  </>;
}

function Specimen() {
  const fixture = fixtureFromQuery();
  const theme = themeFromQuery();
  const direction = directionFromQuery();
  const [approvalOutcome, setApprovalOutcome] = useState<string>();

  useEffect(() => {
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      if (previous) document.documentElement.dataset.theme = previous;
      else delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const resolveApproval = async (_item: Extract<ConversationItem, { kind: "approval" }>, disposition: "approved" | "rejected") => {
    setApprovalOutcome(`Simulated approval outcome recorded locally: ${disposition}. No runtime or provider call was made.`);
  };

  return <main className="conversation-specimen" data-direction={direction} id="main-content">
    <header className="conversation-specimen__controls">
      <div className="conversation-specimen__identity">
        <h1>Conversation item audit · issue #76</h1>
        <span>Synthetic UI specimen — no agent execution</span>
      </div>
      <div className="conversation-specimen__controls-actions">
        <span className="conversation-specimen__controls-label">Fixture</span>
        <KoraSelect label="Conversation fixture" value={fixture} options={conversationSpecimenFixtures.map((value) => ({ value, label: value }))} onValueChange={(value) => chooseQuery("fixture", value)} size="sm" />
        <span className="conversation-specimen__controls-label">Theme</span>
        <KoraSelect label="Theme" value={theme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onValueChange={(value) => chooseQuery("theme", value)} size="sm" />
        <span className="conversation-specimen__controls-label">Direction</span>
        <KoraSelect label="Direction" value={direction} options={conversationSpecimenDirections.map((value) => ({ value, label: value }))} onValueChange={(value) => chooseQuery("direction", value)} size="sm" />
      </div>
    </header>
    <section className="conversation-specimen__surface" aria-label="Synthetic conversation surface">
      <div className="conversation-viewport" tabIndex={0} aria-label="Conversation items">
        <div className="conversation-lane">
          <div className="conversation-specimen__intro">
            <strong><FlaskConical size={14} aria-hidden="true" /> Audit data only</strong>
            <p>This page is isolated from the product surface. It uses the real conversation item presentation and synthetic records so reviewers can inspect hierarchy, status, grouping, streaming, and responsive behavior.</p>
          </div>
          {approvalOutcome && <div className="conversation-specimen__simulated-result" role="status"><CheckCircle2 size={14} aria-hidden="true" /><span><strong>Local fixture state:</strong> {approvalOutcome}</span></div>}
          {fixture === "populated" && <ConversationFeed items={populatedItems()} onResolveApproval={resolveApproval} />}
          {fixture === "statuses" && <StatusFixture />}
          {fixture === "streaming" && <StreamingFixture />}
          {fixture === "long" && <ConversationFeed items={longItems()} />}
          {fixture === "approvals" && <ApprovalsFixture />}
          {fixture === "stress" && <ConversationFeed items={stressItems()} />}
          {fixture === "populated" && <p className="conversation-specimen__controls-label"><CircleAlert size={13} aria-hidden="true" /> The artifact row intentionally names its unavailable preview; this specimen has no stored artifact payload.</p>}
        </div>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Specimen />);
