"use client";

import React, { useEffect, useRef, useState } from "react";
import { OWL_MOTION, prefersReducedMotion } from "../../lib/motion";

export interface AnimatedNumberProps {
  /** Real numeric metric to display (never invented). */
  value: number;
  /** Override duration in ms; defaults to shared OWL_MOTION.durations.counter. */
  durationMs?: number;
  className?: string;
  testId?: string;
}

/**
 * Smoothly counts between real integer metrics using the shared motion contract.
 * Skips animation immediately when the user prefers reduced motion.
 */
export function AnimatedNumber({
  value,
  durationMs = OWL_MOTION.durations.counter,
  className = "",
  testId,
}: AnimatedNumberProps) {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [displayed, setDisplayed] = useState<number>(target);
  const currentRef = useRef<number>(target);
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    const startFrom = mountedRef.current ? currentRef.current : 0;
    mountedRef.current = true;

    if (
      prefersReducedMotion() ||
      durationMs <= 0 ||
      startFrom === target ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      currentRef.current = target;
      setDisplayed(target);
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;
    const delta = target - startFrom;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out matching the shared deceleration feel.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startFrom + delta * eased);

      if (next !== currentRef.current) {
        currentRef.current = next;
        setDisplayed(next);
      }

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = target;
        setDisplayed(target);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [target, durationMs]);

  return (
    <span
      data-testid={testId}
      data-value={target}
      className={`tabular-nums ${className}`.trim()}
    >
      {displayed}
    </span>
  );
}
