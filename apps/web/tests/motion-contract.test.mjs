import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OWL_MOTION,
  OWL_MOTION_CLASSES,
  entranceDelayMs,
  owlTransitionCss,
} from "../lib/motion.ts";

function readAppSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("globals.css defines the shared motion utilities the contract exports", () => {
  const css = readAppSource("../app/globals.css");

  for (const className of Object.values(OWL_MOTION_CLASSES)) {
    assert.ok(
      css.includes(`.${className}`),
      `globals.css must define .${className}`,
    );
  }
  for (const keyframe of ["owl-rise", "owl-fade", "owl-pop", "owl-shimmer"]) {
    assert.ok(
      css.includes(`@keyframes ${keyframe}`),
      `globals.css must define @keyframes ${keyframe}`,
    );
  }
  for (const variable of [
    "--owl-dur-fast",
    "--owl-dur-normal",
    "--owl-dur-slow",
    "--owl-dur-counter",
    "--owl-ease",
    "--owl-shimmer",
  ]) {
    assert.ok(css.includes(variable), `globals.css must define ${variable}`);
  }
});

test("motion utilities stop entirely under prefers-reduced-motion", () => {
  const css = readAppSource("../app/globals.css");
  const reduced = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(reduced !== -1, "globals.css keeps a reduced-motion guard");
  const guard = css.slice(reduced);
  assert.ok(guard.includes("animation-duration: 0.01ms"));
  assert.ok(guard.includes("transition-duration: 0.01ms"));
  // Infinite shimmer loops must collapse to a single frame, not spin forever.
  assert.ok(guard.includes("animation-iteration-count: 1"));
});

test("motion presets stay small, staggered and clamped", () => {
  assert.equal(OWL_MOTION.durations.instant, 100);
  assert.equal(OWL_MOTION.durations.fast, 150);
  assert.equal(OWL_MOTION.durations.normal, 220);
  assert.equal(OWL_MOTION.durations.slow, 350);
  assert.equal(OWL_MOTION.durations.counter, 600);
  assert.equal(OWL_MOTION.stagger.step, 45);
  assert.equal(OWL_MOTION.stagger.max, 6);

  assert.equal(entranceDelayMs(0), 0);
  assert.equal(entranceDelayMs(1), 45);
  assert.equal(entranceDelayMs(5), 225);
  // Beyond the cap the delay never grows: long lists settle together.
  assert.equal(entranceDelayMs(6), 225);
  assert.equal(entranceDelayMs(60), 225);
  assert.equal(entranceDelayMs(-3), 0);

  assert.equal(
    owlTransitionCss("normal"),
    "transition-duration: 220ms; transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);",
  );
});

test("CSS duration variables mirror the TypeScript presets", () => {
  const css = readAppSource("../app/globals.css");
  assert.ok(css.includes("var(--owl-dur-normal)"));
  assert.ok(css.includes("var(--owl-ease)"));
  const ease = OWL_MOTION.easings.standard;
  assert.ok(css.includes(ease), "globals.css uses the shared easing curve");
});
