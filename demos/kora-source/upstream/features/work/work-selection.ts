import type { WorkItem, WorkOutlineNode } from "../../lib/runtime";

export function flattenCurrentWork(nodes: WorkOutlineNode[]): WorkItem[] {
  return nodes.flatMap((node) => [node.item, ...node.children.items]);
}

export function selectGoalNextMove(items: WorkItem[]): WorkItem | undefined {
  return items.find((item) => item.kind !== "milestone" && item.state === "active")
    ?? items.find((item) => item.kind !== "milestone" && item.state === "planned")
    ?? items.find((item) => item.kind !== "milestone" && item.state === "blocked");
}
