import type { Goal } from "../lib/runtime";

const LARGE_GOAL_AREAS = [
  "Career",
  "Home",
  "Family",
  "Health",
  "Learning",
  "Travel",
  "Finances",
  "Community",
  "Creativity",
  "Relationships",
  "Fitness",
  "Reading",
  "Cooking",
  "Garden",
  "Music",
  "Writing",
  "Volunteering",
  "Planning",
  "Maintenance",
  "Personal",
] as const;

export function createLargeTaskGoals(now: string): Goal[] {
  return Array.from({ length: 50 }, (_, index) => {
    const area = LARGE_GOAL_AREAS[index % LARGE_GOAL_AREAS.length]!;
    return {
      id: `large-goal-${index + 1}`,
      title: `Sustain clear weekly progress in ${area.toLocaleLowerCase()} · Goal ${index + 1}`,
      area,
      purposeMarkdown: "A synthetic personal Goal used only to qualify the large Tasks collection.",
      shape: "finish",
      lifecycle: "active",
      priority: index % 5,
      sensitivity: "private",
      provenance: "synthetic_qualification",
      version: 1,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: now,
    };
  });
}
