import { WorkspaceLocalNav } from "../components/primitives";
import { ALL_WORKSPACES } from "./navigation";

/**
 * Wide capability navigation backed by the same registry as the top switcher.
 * Feature layouts choose the owning workspace; they do not duplicate labels,
 * paths, groups, active-route rules, or counts.
 */
export function WorkspaceNavigation({
  workspacePath,
  onNavigate,
}: {
  workspacePath: string;
  onNavigate?: () => void;
}) {
  const workspace = ALL_WORKSPACES.find((candidate) => candidate.to === workspacePath);
  if (!workspace?.sections?.length) return null;

  return (
    <WorkspaceLocalNav
      label={`${workspace.label} navigation`}
      title={workspace.sectionLabel ?? workspace.label}
      items={workspace.sections.map((section) => ({
        to: section.to,
        label: section.label,
        end: section.end,
        group: section.group,
        icon: section.icon ? <section.icon size={16} aria-hidden="true" /> : undefined,
        activePrefixes: section.activePrefixes,
        activeSearch: section.activeSearch,
        excludeSearchKeys: section.excludeSearchKeys,
      }))}
      persistenceKey={workspace.atmosphere}
      onNavigate={onNavigate}
    />
  );
}
