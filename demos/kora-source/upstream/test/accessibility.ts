import axe from "axe-core";

export async function assertNoAutomatedAccessibilityViolations(
  container: Element,
  surface: string,
) {
  const result = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  if (result.violations.length > 0) {
    const details = result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
    throw new Error(`${surface} has automated accessibility violations: ${JSON.stringify(details)}`);
  }
}
