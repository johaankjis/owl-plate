"use client";

import React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Package,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  formatCount,
  formatDurationSeconds,
  formatPercent,
} from "../../lib/operations-helpers";
import type { OperationsSummary } from "../../lib/types/operations";

interface KpiGridProps {
  summary: OperationsSummary;
  isSimulated: boolean;
}

/**
 * Primary and secondary Food Rescue Analytics KPI cards plus compact
 * operational context counts and attention callout.
 */
export function KpiGrid({ summary, isSimulated }: KpiGridProps) {
  const hasAttention =
    summary.pending_pickup_reviews > 0 || summary.pending_pantry_requests > 0;

  return (
    <section
      aria-label="Key food rescue metrics"
      className="space-y-4"
      data-testid="operations-kpi-section"
    >
      {/* Primary KPI Row: Shared, Collected, Available, Student recovery */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="consumer-card flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Servings shared
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-owl-goldTint text-owl-goldText">
              <UtensilsCrossed
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
          </div>
          <div>
            <div
              data-testid="operations-kpi-shared"
              className="text-3xl font-extrabold tracking-tight text-ink tabular-nums"
            >
              {formatCount(summary.total_servings_offered)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Across {formatCount(summary.published_listings)} published{" "}
              {summary.published_listings === 1 ? "listing" : "listings"}
              {isSimulated ? " · Simulated data" : ""}
            </p>
          </div>
        </article>

        <article className="consumer-card flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Student pickups
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-success-tint text-success">
              <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
          <div>
            <div
              data-testid="operations-kpi-collected"
              className="text-3xl font-extrabold tracking-tight text-success tabular-nums"
            >
              {formatCount(summary.student_pickups)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Recorded app pickups (excludes simulated pantry)
              {isSimulated ? " · Simulated" : ""}
            </p>
          </div>
        </article>

        <article className="consumer-card flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Available now
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-ink">
              <Package size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
          <div>
            <div
              data-testid="operations-kpi-available"
              className="text-3xl font-extrabold tracking-tight text-ink tabular-nums"
            >
              {formatCount(summary.available_servings)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {formatCount(summary.student_reserved_servings)} held by students
              · {formatCount(summary.active_listings)} active{" "}
              {summary.active_listings === 1 ? "listing" : "listings"}
            </p>
          </div>
        </article>

        <article className="consumer-card flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Student recovery
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-owl-goldTint text-owl-goldText">
              <TrendingUp size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
          <div>
            <div
              data-testid="operations-kpi-student-recovery"
              className="text-3xl font-extrabold tracking-tight text-owl-goldText tabular-nums"
            >
              {formatPercent(summary.student_pickup_rate_percent)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Student pickups ÷ servings shared
              {isSimulated ? " · Simulated data" : ""}
            </p>
          </div>
        </article>
      </div>

      {/* Secondary KPI Row: Distinct students, Avg reservation delay, Distinct hosts, Simulated pantry transfers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
            <span>Participating students</span>
            <Users size={16} aria-hidden="true" />
          </div>
          <div
            data-testid="operations-kpi-participating-students"
            className="mt-2 text-2xl font-extrabold text-ink tabular-nums"
          >
            {formatCount(summary.participating_students)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Distinct student sessions with claims in period (not unique people)
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
            <span>Avg. reservation delay</span>
            <Clock size={16} aria-hidden="true" />
          </div>
          <div
            data-testid="operations-kpi-avg-reservation-delay"
            className="mt-2 text-2xl font-extrabold text-ink tabular-nums"
          >
            {formatDurationSeconds(summary.average_reservation_seconds)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Mean time from publish to created claim (incl. released & expired)
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
            <span>Participating hosts</span>
            <UserCheck size={16} aria-hidden="true" />
          </div>
          <div
            data-testid="operations-kpi-participating-hosts"
            className="mt-2 text-2xl font-extrabold text-ink tabular-nums"
          >
            {formatCount(summary.participating_hosts)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Distinct host accounts publishing in selected period
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
            <span>Simulated pantry transfers</span>
            <HeartHandshake size={16} aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              data-testid="operations-kpi-pantry-transfers"
              className="text-2xl font-extrabold text-ink tabular-nums"
            >
              {formatCount(summary.pantry_transfers)}
            </span>
            <StatusBadge tone="warning">Simulated</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Separate from student pickups ·{" "}
            {formatCount(summary.pantry_reserved_servings)} pantry reserved
          </p>
        </article>
      </div>

      {/* Compact Operational Context Strip */}
      <div
        data-testid="operations-context-strip"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface-subtle/70 px-4 py-3 text-xs text-ink-muted"
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Building2 size={14} aria-hidden="true" />
            <strong
              data-testid="operations-context-buildings"
              className="font-bold text-ink tabular-nums"
            >
              {formatCount(summary.buildings_served)}
            </strong>{" "}
            {summary.buildings_served === 1 ? "building" : "buildings"} served
          </span>
          <span>
            <strong
              data-testid="operations-context-active-listings"
              className="font-bold text-ink tabular-nums"
            >
              {formatCount(summary.active_listings)}
            </strong>{" "}
            active of{" "}
            <strong
              data-testid="operations-context-published-listings"
              className="font-bold text-ink tabular-nums"
            >
              {formatCount(summary.published_listings)}
            </strong>{" "}
            published
          </span>
          <span>
            <strong
              data-testid="operations-context-joined-sessions"
              className="font-bold text-ink tabular-nums"
            >
              {formatCount(summary.joined_sessions)}
            </strong>{" "}
            joined visitor sessions (not unique people)
          </span>
          <span>
            <strong
              data-testid="operations-context-expired"
              className="font-bold text-ink tabular-nums"
            >
              {formatCount(summary.expired_unclaimed_servings)}
            </strong>{" "}
            expired unclaimed
          </span>
        </div>
        {isSimulated && (
          <span
            data-testid="operations-simulated-chip-kpi"
            className="inline-flex items-center gap-1 font-bold text-warning"
          >
            <Sparkles size={13} aria-hidden="true" />
            Simulated data
          </span>
        )}
      </div>

      {/* Attention Needed Callout (pending pickup reviews / pantry requests) */}
      {hasAttention && (
        <div
          data-testid="operations-attention-banner"
          className="flex flex-col gap-3 rounded-2xl border border-owl-gold/50 bg-owl-goldTint/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-owl-goldText"
            />
            <div className="text-sm">
              <span className="font-bold text-ink">Attention needed: </span>
              <span className="text-ink-muted">
                {summary.pending_pickup_reviews > 0 && (
                  <span data-testid="operations-pending-reviews">
                    <strong className="font-bold text-ink tabular-nums">
                      {formatCount(summary.pending_pickup_reviews)}
                    </strong>{" "}
                    de-identified pickup{" "}
                    {summary.pending_pickup_reviews === 1
                      ? "review"
                      : "reviews"}
                  </span>
                )}
                {summary.pending_pickup_reviews > 0 &&
                  summary.pending_pantry_requests > 0 &&
                  " · "}
                {summary.pending_pantry_requests > 0 && (
                  <span data-testid="operations-pending-pantry">
                    <strong className="font-bold text-ink tabular-nums">
                      {formatCount(summary.pending_pantry_requests)}
                    </strong>{" "}
                    simulated pantry{" "}
                    {summary.pending_pantry_requests === 1
                      ? "request"
                      : "requests"}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summary.pending_pickup_reviews > 0 && (
              <Link
                href="/host"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-xs font-bold text-ink transition hover:bg-surface-subtle"
              >
                Host reviews
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
            {summary.pending_pantry_requests > 0 && (
              <Link
                href="/pantry"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-xs font-bold text-ink transition hover:bg-surface-subtle"
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
