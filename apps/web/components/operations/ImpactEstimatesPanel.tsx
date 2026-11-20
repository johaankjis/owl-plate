"use client";

import React, { useState } from "react";
import { Calculator, RotateCcw, Scale, SlidersHorizontal } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  MAX_ASSUMPTION_KG,
  MAX_ASSUMPTION_USD,
  formatCount,
  formatKg,
  formatPercent,
  formatUsd,
  resolveIllustrativeEstimates,
} from "../../lib/operations-helpers";
import type {
  OperationsEstimates,
  OperationsSummary,
} from "../../lib/types/operations";

interface ImpactEstimatesPanelProps {
  summary: OperationsSummary;
  estimates: OperationsEstimates;
  isSimulated: boolean;
}

/**
 * Separates student-only recovery from combined demonstration recovery and
 * displays explicitly illustrative, user-configurable USD meal-equivalent and
 * recovered food weight (kg) estimates alongside backend assumptions.
 */
export function ImpactEstimatesPanel({
  summary,
  estimates,
  isSimulated,
}: ImpactEstimatesPanelProps) {
  const [showAssumptionsEditor, setShowAssumptionsEditor] = useState(false);
  const [customUsd, setCustomUsd] = useState<number | null>(null);
  const [customKg, setCustomKg] = useState<number | null>(null);

  const resolved = resolveIllustrativeEstimates(estimates, summary, {
    usdPerServing: customUsd,
    kgPerServing: customKg,
  });

  const handleUsdChange = (raw: string) => {
    if (raw.trim() === "") {
      setCustomUsd(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setCustomUsd(Math.min(MAX_ASSUMPTION_USD, parsed));
    }
  };

  const handleKgChange = (raw: string) => {
    if (raw.trim() === "") {
      setCustomKg(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setCustomKg(Math.min(MAX_ASSUMPTION_KG, parsed));
    }
  };

  return (
    <section
      aria-labelledby="operations-estimates-heading"
      data-testid="operations-estimates-panel"
      className="consumer-card space-y-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-estimates-heading"
              className="text-lg font-extrabold tracking-tight text-ink"
            >
              Recovery Rates &amp; Illustrative Estimates
            </h2>
            <StatusBadge tone="neutral">Illustrative only</StatusBadge>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-estimates">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Student recovery is kept separate from combined demonstration
            recovery (which adds simulated pantry transfers). Dollar and weight
            figures use configurable assumptions, not measured KSU financials or
            weighed food.
          </p>
        </div>

        <button
          type="button"
          data-testid="operations-estimate-toggle-editor"
          aria-expanded={showAssumptionsEditor}
          onClick={() => setShowAssumptionsEditor((prev) => !prev)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink transition hover:bg-surface-subtle"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>
            {showAssumptionsEditor ? "Hide assumptions" : "Adjust assumptions"}
          </span>
        </button>
      </div>

      {/* 4-column comparison: Student Recovery | Combined Demo Recovery | Est. Meal Value | Est. Food Weight */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface-subtle/60 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Student recovery
          </div>
          <div
            data-testid="operations-student-recovery-rate"
            className="mt-2 text-2xl font-extrabold text-success tabular-nums"
          >
            {formatPercent(summary.student_pickup_rate_percent)}
          </div>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            {formatCount(summary.student_pickups)} of{" "}
            {formatCount(summary.total_servings_offered)} servings shared
          </p>
        </div>

        <div className="rounded-2xl border border-warning/40 bg-warning-tint/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Combined demo recovery
            </span>
            <StatusBadge tone="warning">Includes sim.</StatusBadge>
          </div>
          <div
            data-testid="operations-combined-recovery-rate"
            className="mt-2 text-2xl font-extrabold text-owl-goldText tabular-nums"
          >
            {formatPercent(summary.combined_recovery_rate_percent)}
          </div>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            {formatCount(summary.student_pickups)} student +{" "}
            {formatCount(summary.pantry_transfers)} simulated pantry of{" "}
            {formatCount(summary.total_servings_offered)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface-subtle/60 p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <span>Est. meal value</span>
            <Calculator size={14} aria-hidden="true" />
          </div>
          <div
            data-testid="operations-estimate-usd"
            className="mt-2 text-2xl font-extrabold text-ink tabular-nums"
          >
            {formatUsd(resolved.equivalentMealValue)}
          </div>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            {formatCount(resolved.recoveredServings)} recovered ×{" "}
            {formatUsd(resolved.usdPerServing)}/serving
            {resolved.isCustomized ? " (custom)" : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface-subtle/60 p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <span>Est. food recovered</span>
            <Scale size={14} aria-hidden="true" />
          </div>
          <div
            data-testid="operations-estimate-kg"
            className="mt-2 text-2xl font-extrabold text-ink tabular-nums"
          >
            {formatKg(resolved.recoveredFoodKg)}
          </div>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            {formatCount(resolved.recoveredServings)} recovered ×{" "}
            {resolved.kgPerServing} kg/serving
            {resolved.isCustomized ? " (custom)" : ""}
          </p>
        </div>
      </div>

      {/* Configurable illustrative assumptions drawer */}
      {showAssumptionsEditor && (
        <div
          data-testid="operations-estimate-editor"
          className="rounded-2xl border border-line bg-surface-subtle/50 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Configurable illustrative assumptions (client preview only)
            </h3>
            {resolved.isCustomized && (
              <button
                type="button"
                data-testid="operations-estimate-reset-button"
                onClick={() => {
                  setCustomUsd(null);
                  setCustomKg(null);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-subtle"
              >
                <RotateCcw size={13} aria-hidden="true" />
                Reset to defaults ({formatUsd(
                  estimates.meal_value_per_serving,
                )}{" "}
                / {estimates.food_kg_per_serving} kg)
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-ink">
                Meal-equivalent value (USD per serving)
              </span>
              <input
                type="number"
                min={0}
                max={MAX_ASSUMPTION_USD}
                step={0.5}
                data-testid="operations-estimate-usd-input"
                value={resolved.usdPerServing}
                onChange={(e) => handleUsdChange(e.target.value)}
                className="consumer-input min-h-11 py-2 text-sm tabular-nums"
              />
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-ink">
                Estimated food weight (kg per serving)
              </span>
              <input
                type="number"
                min={0}
                max={MAX_ASSUMPTION_KG}
                step={0.05}
                data-testid="operations-estimate-kg-input"
                value={resolved.kgPerServing}
                onChange={(e) => handleKgChange(e.target.value)}
                className="consumer-input min-h-11 py-2 text-sm tabular-nums"
              />
            </label>
          </div>
        </div>
      )}

      {/* Server-supplied assumptions & methodology disclosures */}
      <div
        data-testid="operations-estimate-assumptions"
        className="rounded-2xl border border-line bg-surface-subtle/40 px-4 py-3 text-xs text-ink-muted"
      >
        <p className="font-semibold text-ink">
          Basis ({formatCount(resolved.studentPickups)} student pickups +{" "}
          {formatCount(resolved.simulatedPantryTransfers)} simulated pantry
          transfers = {formatCount(resolved.recoveredServings)} recovered
          servings):
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {resolved.assumptions.length > 0 ? (
            resolved.assumptions.map((line, idx) => <li key={idx}>{line}</li>)
          ) : (
            <li>
              Illustrative assumptions ({formatUsd(resolved.usdPerServing)}
              /serving and {resolved.kgPerServing} kg/serving) — not measured
              KSU cost savings or weighed physical food.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
