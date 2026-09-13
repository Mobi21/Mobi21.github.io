import "@fontsource-variable/mona-sans";
import "../styles/tokens.css";
import "../components/kora-ui.css";
import "../styles/app.css";
import "../styles/shell.css";
import "./notification-specimen.css";
import { Bell, FileText, MessageCircleMore, Search } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { Button, IconButton, PageFrame, PageHeader, PageSection, PageToolbar, Popover, Pressable, Sheet } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";
import { RuntimeRequestError, runtime, type NativeNotification } from "../lib/runtime";
import { formatNotificationTime, NotificationAvailabilityView, NotificationFeed, NotificationLoading, notificationSource, notificationStateLabel } from "../features/notifications/NotificationFeed";
import { operationalRouteForId } from "../app/navigation";
import { NotificationDetailPage, NotificationInboxPage } from "../features/settings";
import { ViewBar, ViewBarProvider } from "../app/ViewBar";

export const notificationSpecimenFixtures = ["mixed", "one-item", "empty", "filtered-empty", "partial", "long", "loading", "offline", "unavailable", "restricted", "not-found"] as const;
export type NotificationSpecimenFixture = (typeof notificationSpecimenFixtures)[number];
export const notificationSpecimenSurfaces = ["popover", "page", "detail"] as const;
export type NotificationSpecimenSurface = (typeof notificationSpecimenSurfaces)[number];
export const notificationSpecimenFixtureMatrix: Record<NotificationSpecimenSurface, readonly NotificationSpecimenFixture[]> = {
  popover: ["mixed", "one-item", "empty", "partial", "long", "loading", "offline", "unavailable", "restricted"],
  page: ["mixed", "one-item", "empty", "filtered-empty", "partial", "long", "loading", "offline", "unavailable", "restricted"],
  detail: ["mixed", "one-item", "long", "loading", "offline", "unavailable", "restricted", "not-found"],
};

export const notificationUnsupportedAcceptanceClaims = [{
  id: "approval-linked-detail",
  reason: "NativeNotification has schedule, run, session, and artifact references but no typed approval reference.",
}] as const;

export const notificationSupplementalAcceptanceCases: ReadonlyArray<{
  id: string;
  surface: NotificationSpecimenSurface;
  fixture: NotificationSpecimenFixture;
}> = [
  { id: "one-item-popover", surface: "popover", fixture: "one-item" },
  { id: "one-item-page", surface: "page", fixture: "one-item" },
  { id: "one-item-detail", surface: "detail", fixture: "one-item" },
  { id: "filtered-empty", surface: "page", fixture: "filtered-empty" },
  { id: "partial-page", surface: "page", fixture: "partial" },
] as const;

type Fixture = NotificationSpecimenFixture;
type Surface = NotificationSpecimenSurface;
const params = new URLSearchParams(window.location.search);
const fixture = (params.get("fixture") ?? "mixed") as Fixture;
const surface = (params.get("surface") ?? "popover") as Surface;
const notificationsPath = operationalRouteForId("notifications").path;

const notice = (index: number, overrides: Partial<NativeNotification> = {}): NativeNotification => ({
  id: `notice-${index}`,
  sourceAttentionTier: index % 4 === 0 ? "interrupt" : index % 3 === 0 ? "digest" : "silent",
  sourceResultText: index % 2 === 0 ? "The scheduled review completed with three concrete next steps." : null,
  type: index % 5 === 0 ? "run_stopped" : index % 2 === 0 ? "run_finished" : "custom",
  title: index % 5 === 0 ? "Morning review stopped before completion" : index % 2 === 0 ? "Weekly review is ready" : "A planned update needs your review",
  message: index % 5 === 0 ? "The local runtime stopped safely. Existing work is intact and the run can be inspected." : "Kora finished the requested work and recorded the result without changing anything else.",
  scheduleId: index % 3 === 0 ? `schedule-${index}` : null,
  runId: index % 3 === 0 ? `run-${index}` : null,
  terminalRunId: index % 3 === 0 ? `run-${index}` : null,
  sessionId: index % 3 === 0 ? null : `session-${index}`,
  artifactId: null,
  createdAt: new Date(Date.UTC(2026, 7, 27, 13, 30 - Math.min(index, 29))).toISOString(),
  seenAt: index < 3 ? null : new Date(Date.UTC(2026, 7, 27, 14, 0)).toISOString(),
  idempotencyKey: `fixture-${index}`,
  ...overrides,
});

const mixed = Array.from({ length: 7 }, (_, index) => notice(index + 1));
const one = [notice(1)];
const filtered = [notice(1, { seenAt: "2026-08-27T14:00:00.000Z" })];
const partial = [notice(1), notice(2)];
const partialOlder = [notice(3, { seenAt: "2026-08-27T14:00:00.000Z" })];
const long = Array.from({ length: 105 }, (_, index) => notice(index + 1));

export function notificationFixturePage(selected: Fixture, unseen = false, cursor?: string) {
  if (selected === "empty") return { notifications: [], cursor: undefined, complete: true, unseenCount: 0 };
  if (selected === "filtered-empty") {
    const notifications = unseen ? [] : filtered;
    return { notifications, cursor: undefined, complete: true, unseenCount: 0 };
  }
  if (selected === "partial") {
    const notifications = cursor ? partialOlder : partial;
    return { notifications, cursor: cursor ? undefined : "older", complete: Boolean(cursor), unseenCount: partial.filter(item => !item.seenAt).length };
  }
  const notifications = selected === "one-item" ? one : selected === "long" ? long : mixed;
  return { notifications, cursor: undefined, complete: true, unseenCount: notifications.filter((item) => !item.seenAt).length };
}

function fixtureError() {
  if (fixture === "offline") return new RuntimeRequestError("The local runtime is offline.", { code: "runtime_disconnected", status: 503 });
  if (fixture === "restricted") return new RuntimeRequestError("This notification is restricted.", { code: "notification_restricted", status: 403 });
  if (fixture === "not-found") return new RuntimeRequestError("This notification is no longer available.", { code: "notification_not_found", status: 404 });
  return new RuntimeRequestError("Notifications could not be read.", { code: "notification_unavailable", status: 503 });
}

runtime.notifications = async (unseen = false, cursor?: string) => {
  if (fixture === "loading") return new Promise(() => undefined);
  if (["offline", "unavailable", "restricted", "not-found"].includes(fixture)) throw fixtureError();
  return notificationFixturePage(fixture, unseen, cursor);
};
runtime.notification = async (id) => {
  if (fixture === "loading") return new Promise(() => undefined);
  if (["offline", "unavailable", "restricted", "not-found"].includes(fixture)) throw fixtureError();
  const notification = (fixture === "one-item" ? one : fixture === "filtered-empty" ? filtered : fixture === "partial" ? [...partial, ...partialOlder] : fixture === "long" ? long : mixed).find((item) => item.id === id);
  if (!notification) throw new RuntimeRequestError("This notification is no longer available.", { code: "notification_not_found", status: 404 });
  return { notification };
};
runtime.markNotificationSeen = async (id) => ({ notification: { ...(mixed.find((item) => item.id === id) ?? mixed[0]), seenAt: new Date().toISOString() } });
runtime.markNotificationsSeenThrough = async () => ({ changed: mixed.length, unseenCount: 0 });

function StateFixture({ headingLevel }: { headingLevel?: 1 | 2 } = {}) {
  if (fixture === "loading") return <>{headingLevel === 1 ? <PageHeader title="Notification" /> : null}<NotificationLoading rows={surface === "popover" ? 5 : 8} /></>;
  if (fixture === "offline") return <NotificationAvailabilityView state="offline" headingLevel={headingLevel} />;
  if (fixture === "unavailable") return <NotificationAvailabilityView state="unavailable" headingLevel={headingLevel} />;
  if (fixture === "restricted") return <NotificationAvailabilityView state="restricted" headingLevel={headingLevel} />;
  if (fixture === "not-found") return <NotificationAvailabilityView state="not-found" headingLevel={headingLevel} actions={<Link className="button button--secondary" to={notificationsPath}>Back to notifications</Link>} />;
  if (fixture === "empty") return <NotificationAvailabilityView state="empty" headingLevel={headingLevel} />;
  return null;
}

function NotificationSpecimen() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("No notification selected.");
  const composedSurface: Surface = surface;
  const compact = useMediaQuery("(max-width: 899px)");
  const notificationTrigger = useRef<HTMLButtonElement>(null);
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }), []);
  const notifications = fixture === "one-item" ? one : fixture === "filtered-empty" ? filtered : fixture === "partial" ? partial : fixture === "long" ? long : mixed;
  const stateOnly = ["loading", "offline", "unavailable", "restricted", "not-found", "empty"].includes(fixture);
  const content = stateOnly ? <StateFixture /> : <NotificationFeed density={surface === "popover" ? "popover" : "page"} notifications={notifications} onOpen={(item) => { setStatus(`Opened ${item.title}`); if (surface === "popover") setOpen(false); }} />;

  useEffect(() => {
    if (fixture !== "filtered-empty" || surface !== "page") return;
    const timer = window.setTimeout(() => {
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Unseen")?.click();
    }, 160);
    return () => window.clearTimeout(timer);
  }, []);

  if (surface === "page" || surface === "detail") {
    const initialPath = surface === "page" ? notificationsPath : `${notificationsPath}/${fixture === "not-found" ? "missing" : "notice-1"}`;
    return <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}><ViewBarProvider>
        <div className="notification-specimen app-shell">
          <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="notification-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
          <ViewBar />
          <main className="notification-specimen__main"><Routes>
            <Route path={notificationsPath} element={<NotificationInboxPage />} />
            <Route path={`${notificationsPath}/:notificationId`} element={<NotificationDetailPage />} />
          </Routes></main>
        </div>
      </ViewBarProvider></QueryClientProvider>
    </MemoryRouter>;
  }

  return <MemoryRouter>
    <div className="notification-specimen app-shell">
      <header className="window-bar"><div className="window-bar__brand"><KoraMark width={16} height={16} /><strong>Kora</strong></div><div className="notification-specimen__drag" /><div className="window-bar__actions"><IconButton label="Search pages and commands"><Search size={16} /></IconButton><IconButton label="Notifications"><Bell size={16} /></IconButton><IconButton label="Open Kora panel"><MessageCircleMore size={17} /></IconButton></div></header>
      <main className="notification-specimen__main">
        <PageFrame width="standard" className={composedSurface === "detail" ? "notification-detail" : composedSurface === "page" ? "notification-center" : undefined}>
          {composedSurface !== "detail" ? <><PageHeader title="Notification foundation" description="One typed collection model serves the shell, durable inbox, and record transition." /><p role="status" className="notification-specimen__status">{status}</p></> : null}
          {composedSurface === "page" ? <>
            <PageToolbar controls={<div className="notification-specimen__segments"><Pressable aria-pressed="true">All</Pressable><Pressable aria-pressed="false">Unseen</Pressable></div>} compactControls={<div className="notification-specimen__segments"><Pressable aria-pressed="true">All</Pressable><Pressable aria-pressed="false">Unseen</Pressable></div>} primaryAction={<Button disabled={stateOnly}>Mark visible as seen</Button>} />
            <div className="notification-center__content">{content}</div>
          </> : composedSurface === "detail" ? stateOnly ? <>
            <Link className="notification-detail__back" to={notificationsPath}>Notifications</Link>
            <StateFixture headingLevel={1} />
          </> : <>
            <PageHeader
              breadcrumb={<Link to={notificationsPath}>Notifications</Link>}
              title={mixed[0].title}
              description={mixed[0].message}
              status={<div className="notification-detail__meta"><span>Kora update</span><span>{notificationSource(mixed[0])}</span><span>{notificationStateLabel(mixed[0])}</span><time dateTime={mixed[0].createdAt}>{formatNotificationTime(mixed[0].createdAt)}</time></div>}
              actions={<Button>Mark as seen</Button>}
            />
            <PageSection title="Recorded result" description="The exact result text stored with this notification.">
              <div className="notification-detail__result">
                <span className="notification-detail__result-label"><FileText size={15} aria-hidden="true" />Recorded with this notification</span>
                <p>The weekly review completed with three concrete next steps and did not modify any connected system.</p>
              </div>
            </PageSection>
            <PageSection title="Related records" description="Open the recorded source without changing this notification."><div className="notification-specimen__related"><Pressable><strong>Open run</strong><span>Inspect the exact recorded result</span></Pressable><Pressable><strong>Open schedule</strong><span>Review the source automation</span></Pressable></div></PageSection>
          </> : <div className="notification-specimen__anchor">
            {compact ? <>
              <IconButton ref={notificationTrigger} className="notification-trigger" label="Notifications, 3 unseen" onClick={() => setOpen(true)}><Bell size={18} /><span className="notification-trigger__badge">3</span></IconButton>
              <Sheet
                purpose="notifications"
                title="Notifications"
                description="Finished work, stopped runs, and updates that need your attention."
                open={open}
                onOpenChange={setOpen}
                finalFocus={notificationTrigger}
                closeLabel="Close notifications"
                className="notification-sheet"
                actions={<><span className="notification-popover__count">3 new</span><Button tone="ghost">Open notification center</Button></>}
              >
                <div className="notification-list" aria-live="polite">{content}</div>
              </Sheet>
            </> : <Popover
              purpose="notifications"
              title="Notifications"
              description="Finished work, stopped runs, and updates that need your attention."
              trigger={<IconButton className="notification-trigger" label="Notifications, 3 unseen"><Bell size={18} /><span className="notification-trigger__badge">3</span></IconButton>}
              open={open}
              onOpenChange={setOpen}
              align="end"
              sideOffset={8}
              initialFocus={false}
              className="notification-popover"
              actions={<><span className="notification-popover__count">3 new</span><Button tone="ghost">Open notification center</Button></>}
            >
              <div className="notification-list" aria-live="polite">{content}</div>
            </Popover>}
            {!open ? <Button onClick={() => setOpen(true)}>Reopen notifications</Button> : null}
          </div>}
        </PageFrame>
      </main>
    </div>
  </MemoryRouter>;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<NotificationSpecimen />);
