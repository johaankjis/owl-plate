"use client";

import React, { useMemo } from "react";
import { CheckCircle2, PieChart } from "lucide-react";
import {
  buildOutcomesBreakdown,
  formatCount,
  formatPercent,
} from "../../lib/operations-helpers";
import type { OperationsOutcomes } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_HEADING } from "./styles";

interface OutcomesBreakdownProps {
  outcomes: OperationsOutcomes;
  totalOffered: number;
  isSimulated: boolean;
}

/**
 * Compact reconciliation of every offered serving into exactly one of six
 * outcomes. Each outcome keeps its own segment; student and pantry outcomes
 * are never merged.
 */
export function OutcomesBreakdown({
  outcomes,
  totalOffered,
  isSimulated,
}: OutcomesBreakdownProps) {
  const model = useMemo(
    () => buildOutcomesBreakdown(outcomes, totalOffered, isSimulated),
    [outcomes, totalOffered, isSimulated],
  );

  return (
    <section
      aria-labelledby="operations-outcomes-heading"
      data-testid="operations-outcomes-chart"
      className={`${OPS_CARD} flex h-full flex-col gap-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="operations-outcomes-heading" className={OPS_HEADING}>
          Where every serving went
        </h2>
        <span
          data-testid="operations-outcomes-reconciliation"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted tabular-nums"
        >
          <CheckCircle2
            size={14}
            aria-hidden="true"
            className={model.isReconciled ? "text-success" : "text-warning"}
          />
          <span data-testid="operations-outcomes-total">
            {formatCount(model.bucketSum)}
          </span>{" "}
          of {formatCount(model.totalOffered)} reconciled
        </span>
      </div>

      {model.isEmpty ? (
        <OpsEmptyState
          testId="operations-outcomes-empty"
          minHeightClass="min-h-[140px] flex-1"
          icon={<PieChart size={28} strokeWidth={1.5} aria-hidden="true" />}
          title="No servings offered in this period"
        />
      ) : (
        <>
          <div
            role="img"
            aria-label={model.accessibleSummary}
            data-testid="operations-outcomes-bar"
            className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full"
          >
            {model.buckets
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => (
                <div
                  key={bucket.key}
                  className={`h-full min-w-[4px] transition-[flex-grow] duration-500 ${bucket.swatchClass}`}
                  style={{ flexGrow: bucket.count, flexBasis: 0 }}
                />
              ))}
          </div>

          <ul className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            {model.buckets.map((bucket) => (
              <li
                key={bucket.key}
                data-testid={`operations-outcomes-bucket-${bucket.key}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-baseline gap-2 text-ink-muted">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 translate-y-px rounded-full ${bucket.swatchClass}`}
                  />
                  {bucket.label}
                </span>
                <span className="shrink-0 font-bold text-ink tabular-nums">
                  {formatCount(bucket.count)}
                  <span className="ml-1.5 text-xs font-medium text-ink-muted">
                    {formatPercent(bucket.percent)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
