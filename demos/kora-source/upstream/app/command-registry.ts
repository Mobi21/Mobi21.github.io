import type { LucideIcon } from "lucide-react";
import { APPLICATION_REGISTRY, type RegisteredApplicationAction } from "./navigation";

export type GlobalCommandDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  destinationId: string;
  shortcutId?: string;
  keys?: string;
  keywords: readonly string[];
};

function hasPalette(action: RegisteredApplicationAction): action is RegisteredApplicationAction & {
  palette: NonNullable<RegisteredApplicationAction["palette"]>;
} {
  return action.palette !== undefined;
}

/** Derived compatibility view; APPLICATION_REGISTRY is the sole authoring source. */
const registeredActions: readonly RegisteredApplicationAction[] = APPLICATION_REGISTRY.actions;
export const GLOBAL_COMMANDS: readonly GlobalCommandDefinition[] = registeredActions
  .filter(hasPalette)
  .map(({ id, shortcut, palette }) => ({
    id,
    ...palette,
    ...(shortcut ? { shortcutId: id } : {}),
  }));
