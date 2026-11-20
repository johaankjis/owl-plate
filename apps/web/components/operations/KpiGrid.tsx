"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCount, formatPercent } from "../../lib/operations-helpers";
import type { OperationsSummary } from "../../lib/types/operations";
import { OPS_CARD, OPS_EYEBROW } from "./styles";

interface KpiGridProps {
  summary: OperationsSummary;
}

const VALUE = "text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl";
const CAPTION = "text-xs text-ink-muted";

/**
 * The four headline figures: servings shared, student pickups, servings
 * available now and the student-only recovery rate. Pantry movement is
 * simulated and never contributes to any of them.
 */
export function KpiGrid({ summary }: KpiGridProps) {
  const hasAttention =
    summary.pending_pickup_reviews > 0 || summary.pending_pantry_requests > 0;
  const recoveryWidth = Math.min(
    100,
    Math.max(0, summary.student_pickup_rate_percent),
  );

  return (
    <section
      aria-label="Key food rescue metrics"
      className="space-y-4"
      data-testid="operations-kpi-section"
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-6">
        <article className={`${OPS_CARD} flex flex-col gap-3`}>
          <h2 className={OPS_EYEBROW}>Servings shared</h2>
          <div
            data-testid="operations-kpi-shared"
            className={`${VALUE} text-ink`}
          >
            {formatCount(summary.total_servings_offered)}
          </div>
          <p className={CAPTION}>
            {formatCount(summary.published_listings)}{" "}
            {summary.published_listings === 1 ? "listing" : "listings"}{" "}
            published
          </p>
        </article>

        <article className={`${OPS_CARD} flex flex-col gap-3`}>
          <h2 className={OPS_EYEBROW}>Student pickups</h2>
          <div
            data-testid="operations-kpi-collected"
            className={`${VALUE} text-success`}
          >
            {formatCount(summary.student_pickups)}
          </div>
          <p className={CAPTION}>
            Recorded in the app, excludes simulated pantry
          </p>
        </article>

        <article className={`${OPS_CARD} flex flex-col gap-3`}>
          <h2 className={OPS_EYEBROW}>Available now</h2>
          <div
            data-testid="operations-kpi-available"
            className={`${VALUE} text-ink`}
          >
            {formatCount(summary.available_servings)}
          </div>
          <p className={CAPTION}>
            {formatCount(summary.student_reserved_servings)} held ·{" "}
            {formatCount(summary.active_listings)} active{" "}
            {summary.active_listings === 1 ? "listing" : "listings"}
          </p>
        </article>

        <article className={`${OPS_CARD} flex flex-col gap-3`}>
          <h2 className={OPS_EYEBROW}>Student recovery</h2>
          <div
            data-testid="operations-kpi-student-recovery"
            className={`${VALUE} text-owl-goldText`}
          >
            {formatPercent(summary.student_pickup_rate_percent)}
          </div>
          <div className="space-y-2">
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle"
            >
              <div
                className="h-full rounded-full bg-owl-gold transition-[width] duration-500"
                style={{ width: `${recoveryWidth}%` }}
              />
            </div>
            <p className={CAPTION}>Student pickups ÷ servings shared</p>
          </div>
        </article>
      </div>

      {hasAttention && (
        <div
          data-testid="operations-attention-banner"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-owl-goldTint px-4 py-1.5 text-sm text-ink"
        >
          <p>
            <span className="font-bold">Waiting on review: </span>
            {summary.pending_pickup_reviews > 0 && (
              <span data-testid="operations-pending-reviews">
                <strong className="font-bold tabular-nums">
                  {formatCount(summary.pending_pickup_reviews)}
                </strong>{" "}
                de-identified pickup{" "}
                {summary.pending_pickup_reviews === 1 ? "review" : "reviews"}
              </span>
            )}
            {summary.pending_pickup_reviews > 0 &&
              summary.pending_pantry_requests > 0 &&
              " · "}
            {summary.pending_pantry_requests > 0 && (
              <span data-testid="operations-pending-pantry">
                <strong className="font-bold tabular-nums">
                  {formatCount(summary.pending_pantry_requests)}
                </strong>{" "}
                simulated pantry{" "}
                {summary.pending_pantry_requests === 1 ? "request" : "requests"}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-5">
            {summary.pending_pickup_reviews > 0 && (
              <Link
                href="/host"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-owl-goldText underline-offset-4 hover:underline"
              >
                Host reviews
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
            {summary.pending_pantry_requests > 0 && (
              <Link
                href="/pantry"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-owl-goldText underline-offset-4 hover:underline"
              >
                Pantry queue
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
