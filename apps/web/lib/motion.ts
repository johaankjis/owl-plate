/**
 * Shared motion contract for Owl Plate screens (Milestone 6.5).
 *
 * One source of truth for durations, easings, stagger and the CSS class names
 * declared in `apps/web/app/globals.css`, so every screen moves the same way
 * and `prefers-reduced-motion` stays one global guarantee instead of a
 * per-component afterthought. Screens apply `OWL_MOTION_CLASSES` instead of
 * inventing per-screen timing.
 */

export const OWL_MOTION = {
  /** Milliseconds, mirrored as `--owl-dur-*` variables in globals.css. */
  durations: {
    instant: 100,
    fast: 150,
    normal: 220,
    slow: 350,
    counter: 600,
  },
  easings: {
    standard: "cubic-bezier(0.22, 1, 0.36, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
  /** Staggered card entrances: 45 ms per card, capped so long lists settle fast. */
  stagger: { step: 45, max: 6 },
} as const;

/** Class names implemented in globals.css. */
export const OWL_MOTION_CLASSES = {
  entrance: "owl-anim-rise",
  fade: "owl-anim-fade",
  pop: "owl-anim-pop",
  shimmer: "owl-shimmer",
  press: "owl-press",
  tabPanel: "owl-tab-panel",
} as const;

export type OwlMotionDuration = keyof typeof OWL_MOTION.durations;

/** Entrance delay in ms for list index `index`, clamped by `OWL_MOTION.stagger`. */
export function entranceDelayMs(index: number): number {
  const clamped = Math.max(0, Math.min(index, OWL_MOTION.stagger.max - 1));
  return clamped * OWL_MOTION.stagger.step;
}

/** Inline `transition` CSS for the few spots a class cannot reach. */
export function owlTransitionCss(duration: OwlMotionDuration): string {
  const ms = `${OWL_MOTION.durations[duration]}ms`;
  return `transition-duration: ${ms}; transition-timing-function: ${OWL_MOTION.easings.standard};`;
}

/**
 * True only when the visitor asked the OS to calm motion; callers then skip
 * JS-driven motion. CSS classes already stop under the same media query.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
