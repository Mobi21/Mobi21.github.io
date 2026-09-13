import "@testing-library/jest-dom/vitest";

// jsdom models the native renderer for the default GUI test suite. Individual
// preview-selection behavior is covered through the pure environment helper.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: () => undefined },
  });
}
