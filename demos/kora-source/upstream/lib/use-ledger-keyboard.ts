import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one keyboard model for every Kora ledger.
 *
 * DESIGN.md: "Lists are keyboard-navigable — roving focus, arrows, Home/End,
 * Enter to open — and the focused row is visually distinct from the selected
 * row." Before this, no ledger in Brain, Life, Work, or Settings had any of it,
 * and a 50-row ledger was 50 tab stops.
 *
 * Roving tabindex is the load-bearing part. Exactly one row is tabbable at a
 * time, so the ledger is a single stop in the page's tab order and arrows move
 * within it — which is the behaviour every native list has and the reason a web
 * list feels wrong without it.
 *
 * Focused and selected are deliberately separate pieces of state. Arrowing
 * through a ledger moves focus and must NOT open records as it passes over them;
 * Enter commits. Conflating them is why some apps fire a network request per
 * arrow key.
 *
 * Works with or without virtualization: pass `scrollToIndex` (e.g. TanStack
 * Virtual's) and the hook defers focus until the row for that index exists.
 */
/** What a ledger row must accept to participate in roving focus. */
export type LedgerRowProps = {
  ref: (node: HTMLElement | null) => void;
  tabIndex: number;
  "data-focused"?: string;
  onFocus: () => void;
};

export function useLedgerKeyboard({
  count,
  onActivate,
  onEscape,
  scrollToIndex,
}: {
  count: number;
  /** Enter or Space on the focused row. */
  onActivate?: (index: number) => void;
  /** Escape anywhere in the ledger — normally closes the detail pane. */
  onEscape?: () => void;
  /** Required when the ledger is virtualized, so off-screen rows can be reached. */
  scrollToIndex?: (index: number) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rows = useRef(new Map<number, HTMLElement>());
  const pendingFocus = useRef<number | undefined>(undefined);

  const registerRow = useCallback((index: number, node: HTMLElement | null) => {
    if (node) rows.current.set(index, node);
    else rows.current.delete(index);
  }, []);

  // A virtualized row may not exist yet when we ask for it. Claim the focus and
  // take it on the commit after the virtualizer renders the row.
  useEffect(() => {
    const wanted = pendingFocus.current;
    if (wanted === undefined) return;
    const node = rows.current.get(wanted);
    if (node) {
      pendingFocus.current = undefined;
      node.focus();
    }
  });

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      if (clamped === focusedIndex && rows.current.get(clamped) === document.activeElement) return;
      setFocusedIndex(clamped);
      scrollToIndex?.(clamped);
      const node = rows.current.get(clamped);
      if (node) node.focus();
      else pendingFocus.current = clamped;
    },
    [count, focusedIndex, scrollToIndex],
  );

  // Clamp when the list shrinks under a filter, so focus never points past the end.
  useEffect(() => {
    if (count > 0 && focusedIndex > count - 1) setFocusedIndex(count - 1);
  }, [count, focusedIndex]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Never hijack keys the user is typing into the ledger's own search field.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (event.key === "Escape") onEscape?.();
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveTo(focusedIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveTo(focusedIndex - 1);
          break;
        case "Home":
          event.preventDefault();
          moveTo(0);
          break;
        case "End":
          event.preventDefault();
          moveTo(count - 1);
          break;
        case "PageDown":
          event.preventDefault();
          moveTo(focusedIndex + 10);
          break;
        case "PageUp":
          event.preventDefault();
          moveTo(focusedIndex - 10);
          break;
        case "Enter":
        case " ":
          // Links and buttons already activate on Enter/Space. Only intercept
          // when the ledger owns activation itself.
          if (onActivate) {
            event.preventDefault();
            onActivate(focusedIndex);
          }
          break;
        case "Escape":
          onEscape?.();
          break;
        default:
      }
    },
    [count, focusedIndex, moveTo, onActivate, onEscape],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    /** Spread on the scrolling ledger container. */
    ledgerProps: { onKeyDown },
    /** Spread on each row. `index` is the row's position in the flat list. */
    rowProps: (index: number): LedgerRowProps => ({
      ref: (node: HTMLElement | null) => registerRow(index, node),
      tabIndex: index === focusedIndex ? 0 : -1,
      "data-focused": index === focusedIndex ? "" : undefined,
      onFocus: () => setFocusedIndex(index),
    }),
  };
}
