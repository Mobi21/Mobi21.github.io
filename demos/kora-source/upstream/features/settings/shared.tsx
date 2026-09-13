import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Badge, Button, ContentState, PageSection } from "../../components/primitives";
import { useViewBar } from "../../app/ViewBar";

/**
 * Contributes the page's title and actions to the shell's view bar.
 *
 * Was an 82–90px banner: a red uppercase eyebrow, an <h1>, and an explanatory
 * subhead — on all 18 Settings pages. That single component was the largest
 * source of chrome in the app; `/settings/schedules` reached 253px above content
 * while `/settings/model`, which did not use it, started at 44px. Same section,
 * 5× the header.
 *
 * `eyebrow` remains ignored because repeated uppercase route kickers add chrome.
 * Concise outcome descriptions stay in the route canvas so they can explain
 * scope or consequence without repeating the title already owned by ViewBar.
 */
export function PageHeading({
  title,
  description,
  actions,
  actionsKey,
  titleRole = "heading",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Use label when a canvas PageHeader owns the route's single h1. */
  titleRole?: "heading" | "label";
  /**
   * Republish signal for pages whose actions change while the title does not —
   * the notification detail swaps "Mark as seen" for a "Seen" pill without the
   * title moving, so keying only on `title` left a stale button in the bar.
   */
  actionsKey?: string | number | boolean | null;
}) {
  useViewBar(() => ({ title, titleRole, actions }), [title, titleRole, actionsKey]);
  return description ? <p className="settings-page-intro">{description}</p> : null;
}

export function Section({ title, description, children, className = "", layout = "stack" }: { title: string; description?: string; children: ReactNode; className?: string; layout?: "stack" | "split" }) {
  return <PageSection className={`k-settings-section ${className}`.trim()} title={title} description={description} layout={layout}>{children}</PageSection>;
}

export function LoadingState({ label = "Loading settings" }: { label?: string }) {
  return <ContentState state="loading" title={label} announcement="polite" aria-label={label} />;
}

export function ErrorState({ title = "This section couldn’t load.", error, onRetry, retryLabel = "Try again" }: { title?: string; error?: unknown; onRetry?: () => void; retryLabel?: string }) {
  return <ContentState state="error" title={title} body={error instanceof Error ? error.message : "Kora did not return this settings data."} announcement="assertive"
    action={onRetry ? <Button onClick={onRetry}><RotateCcw size={14} aria-hidden="true" />{retryLabel}</Button> : undefined} />;
}

export function StatusPill({ state, children }: { state: "ready" | "attention" | "quiet"; children: ReactNode }) {
  return <span className="settings-status"><Badge tone={state === "ready" ? "success" : state === "attention" ? "warning" : "quiet"} dot>{children}</Badge></span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <ContentState state="empty" title={title} body={body} action={action} />;
}
