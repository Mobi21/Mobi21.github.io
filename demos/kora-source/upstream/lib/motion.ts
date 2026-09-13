/**
 * The single source of truth for motion in JS.
 *
 * These mirror the `--dur-*` and `--ease-*` tokens in `styles/tokens.css`.
 * They exist because JS cannot read a CSS custom property without
 * `getComputedStyle`, which is why the settle curve was previously hardcoded
 * as a `[0.22, 1, 0.36, 1]` literal in 33 places across the app.
 *
 * See DESIGN.md — Motion.
 */

/** Seconds, for Motion for React. CSS uses the `--dur-*` tokens directly. */
export const DUR = {
  /** Physical press feedback only. */
  press: 0.09,
  /** Hover, focus, selection, and toggle state. */
  state: 0.14,
  /** Overlay and controlled-object arrival. */
  enter: 0.22,
  /** Decisive exit, exactly 75% of enter. */
  exit: 0.165,
  /** Pane and layout travel. */
  move: 0.32,
  /** Compatibility alias for existing state feedback. */
  instant: 0.14,
  /** Compatibility alias for existing overlay entrances. */
  quick: 0.22,
  /** popover, drawer, panel, list insertion */
  base: 0.25,
  /** dialog, workspace transition, inspector, consequential approval */
  slow: 0.32,
} as const;

export const EASE = {
  /** Anything entering, exiting, or responding. The default. */
  out: [0.16, 1, 0.3, 1],
  /** On-screen movement between two resting positions. */
  inOut: [0.76, 0, 0.24, 1],
  /** Exits only — faster off the mark, so leaving reads as decisive. */
  in: [0.4, 0, 1, 1],
} as const;

export const SPRING = {
  /** Critically damped. Panels, resize, layout. No overshoot. */
  ui: { type: "spring", bounce: 0, duration: 0.4 },
  /** After a flick, where velocity should carry. */
  momentum: { type: "spring", bounce: 0, duration: 0.4 },
  /** Drawers and sheets — a trace of give at the end. */
  drawer: { type: "spring", bounce: 0, duration: 0.3 },
} as const;

/** Drag release: scroll-like deceleration, then settle back inside constraints. */
export const DRAG_TRANSITION = {
  power: 0.28,
  timeConstant: 220,
  bounceStiffness: 340,
  bounceDamping: 38,
} as const;

/** The default enter/exit pair. Exit is ~0.7x enter, along the same path. */
export const enterExit = (distance = 6) => ({
  initial: { opacity: 0, y: distance },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: distance * -0.6 },
  transition: { duration: DUR.base, ease: EASE.out },
});

/** Row insertion in a ledger. Capped stagger — first appearance only. */
export const STAGGER_STEP = 0.025;
export const STAGGER_CAP = 6;
export const staggerDelay = (index: number, hasAppeared: boolean) =>
  hasAppeared ? 0 : Math.min(index, STAGGER_CAP) * STAGGER_STEP;

/* ── Shared transition recipes ──────────────────────────────────────────────
   Named so every surface reaches for the same motion rather than re-deriving
   one, and so the intent is legible at the call site. */

/**
 * A detail pane that enters from the row that opened it, not from the pane edge.
 *
 * Origin matters: a panel sliding in from the right says "a new screen arrived",
 * while a panel growing from the row you clicked says "this is that record". Pass
 * the row's offset from the top of the ledger.
 */
export const detailFromRow = (offsetY = 0) => ({
  initial: { opacity: 0, y: Math.max(-24, Math.min(24, offsetY * 0.12)) },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: SPRING.ui,
});

/**
 * Skeleton to content: opacity only, including under reduced motion. Motion's
 * root reduced-motion policy does not suppress filter animation.
 */
export const skeletonOut = {
  initial: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.quick, ease: EASE.out },
} as const;

export const contentIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: DUR.base, ease: EASE.out },
} as const;

/**
 * Popover and menu: scale from the trigger rather than from the popup's own
 * centre. `transform-origin` is set in CSS from Base UI's --transform-origin, so
 * this only supplies the timing.
 */
export const popIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: DUR.quick, ease: EASE.out },
} as const;

/** Dialogs are not anchored to anything, so they stay centred and crossfade. */
export const dialogIn = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.99 },
  transition: { duration: DUR.base, ease: EASE.out },
} as const;

/**
 * A shared id for a title that MOVES between two places — one mounted at a time.
 *
 * Do not use this for a ledger row and its detail pane. In a ledger+detail layout
 * both are on screen simultaneously, and `layoutId` treats same-id elements as one
 * element: Motion renders a single instance and animates it between the two
 * positions, so the row's own title disappears. The right motion for that layout is
 * `detailFromRow`, which gives the pane an origin without pretending the row went
 * anywhere.
 *
 * This is for genuine either/or transitions — a collapsed summary that becomes an
 * expanded card, a tab indicator, a row that is replaced by its own editor.
 */
export const sharedTitleId = (surface: string, id: string) => `title:${surface}:${id}`;
