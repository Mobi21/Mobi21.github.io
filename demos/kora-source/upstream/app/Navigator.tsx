import { Link, useLocation } from "react-router-dom";
import { shortcutKeys } from "./shortcut-registry";
import {
  NAVIGATION_GROUPS,
  workspaceForPath,
  type Workspace,
} from "./navigation";

function WorkspaceLink({ workspace, onNavigate }: { workspace: Workspace; onNavigate?: () => void }) {
  const location = useLocation();
  const owns = workspaceForPath(location.pathname)?.to === workspace.to;
  const shortcut = shortcutKeys(workspace.shortcutId);
  const Icon = workspace.icon;

  return (
    <Link
      to={workspace.to}
      className="navigator__workspace"
      aria-current={owns ? "page" : undefined}
      aria-keyshortcuts={shortcut}
      data-owns={owns ? "" : undefined}
      data-atmosphere={workspace.atmosphere}
      onClick={onNavigate}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden />
      <span className="navigator__label">{workspace.label}</span>
      <span className="navigator__shortcut" aria-hidden="true">{shortcut.replace("Ctrl+", "Ctrl ")}</span>
    </Link>
  );
}

/**
 * The global workspace switcher shared by the anchored desktop menu and the
 * compact Sheet. Capability-local pages deliberately do not appear here: they
 * are owned by each PageFrame's local navigation and compact local-nav Sheet.
 */
export function Navigator({
  onNavigate,
  presentation = "drawer",
}: {
  onNavigate?: () => void;
  presentation?: "popover" | "drawer";
}) {
  const location = useLocation();
  const active = workspaceForPath(location.pathname);

  return (
    <nav className="navigator" aria-label="Navigate" data-atmosphere={active?.atmosphere ?? "kora"} data-presentation={presentation}>
      {NAVIGATION_GROUPS.map((group) => (
        <section className="navigator__group" aria-labelledby={`navigator-${group.label.toLowerCase()}-title`} key={group.label}>
          <h2 id={`navigator-${group.label.toLowerCase()}-title`} className="navigator__group-label">{group.label}</h2>
          {group.workspaces.map((workspace) => (
            <WorkspaceLink key={workspace.to} workspace={workspace} onNavigate={onNavigate} />
          ))}
        </section>
      ))}
    </nav>
  );
}
