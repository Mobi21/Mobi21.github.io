import { APPLICATION_REGISTRY, type RegisteredApplicationAction, type RegisteredWorkspace, type ShortcutCategory } from "./navigation";

export type KoraShortcut = {
  id: string;
  keys: string;
  label: string;
  description: string;
  category: ShortcutCategory;
};

type RegisteredShortcut = KoraShortcut & {
  action: RegisteredApplicationAction["action"] | "workspace";
  to?: string;
  visible: boolean;
  order: number;
};

const registeredWorkspaces: readonly RegisteredWorkspace[] = APPLICATION_REGISTRY.workspaces;
const registeredActions: readonly RegisteredApplicationAction[] = APPLICATION_REGISTRY.actions;
const registeredShortcuts: readonly RegisteredShortcut[] = [
  ...registeredWorkspaces.map((workspace, index) => ({
    id: workspace.id,
    ...workspace.shortcut,
    action: "workspace" as const,
    to: workspace.to,
    visible: workspace.shortcut.visible !== false,
    order: index + 3,
  })),
  ...registeredActions
    .filter((entry) => entry.shortcut !== undefined)
    .map((entry) => ({
      id: entry.id,
      ...entry.shortcut!,
      action: entry.action,
      visible: entry.shortcut!.visible !== false,
      order: entry.shortcutOrder ?? Number.MAX_SAFE_INTEGER,
    })),
].sort((left, right) => left.order - right.order);

/** Settings and shortcut labels are a projection of the application registry. */
export const KORA_SHORTCUTS: readonly KoraShortcut[] = registeredShortcuts
  .filter((shortcut) => shortcut.visible)
  .map(({ id, keys, label, description, category }) => ({ id, keys, label, description, category }));

export function shortcutKeys(id: string) {
  return KORA_SHORTCUTS.find((shortcut) => shortcut.id === id)?.keys ?? "";
}

function keyboardEventMatches(keys: string, event: KeyboardEvent) {
  const parts = keys.split("+");
  const primary = event.ctrlKey || event.metaKey;
  const expectsPrimary = parts.includes("Ctrl");
  const expectsShift = parts.includes("Shift");
  const expectedKey = parts.at(-1)!;
  const actualKey = event.code === "Space" ? "Space" : event.key;
  return primary === expectsPrimary
    && event.shiftKey === expectsShift
    && !event.altKey
    && actualKey.toLocaleLowerCase() === expectedKey.toLocaleLowerCase();
}

export function globalShortcutForKeyboardEvent(event: KeyboardEvent) {
  return registeredShortcuts.find((shortcut) =>
    shortcut.action !== "context" && keyboardEventMatches(shortcut.keys, event));
}
