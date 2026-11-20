"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  FlaskConical,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  OPERATIONS_UI_PERIODS,
  formatEasternClock,
  isRecordingDataset,
} from "../../lib/operations-helpers";
import type {
  OperationsDataset,
  OperationsPeriod,
} from "../../lib/types/operations";

interface OperationsHeaderProps {
  period: OperationsPeriod;
  onSelectPeriod: (period: OperationsPeriod) => void;
  serverTime: string | null;
  dataset: OperationsDataset | null;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  isStale: boolean;
  staleMessage: string | null;
}

/**
 * Analytics page header with date range filters (Today / Last 7 days / All time),
 * America/New_York updated timestamp, auto-refresh controls, and persistent
 * simulated-dataset banner when the recording dataset is loaded.
 */
export function OperationsHeader({
  period,
  onSelectPeriod,
  serverTime,
  dataset,
  autoRefresh,
  onToggleAutoRefresh,
  refreshing,
  onRefresh,
  isStale,
  staleMessage,
}: OperationsHeaderProps) {
  const simulated = isRecordingDataset(dataset);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-owl-goldTint px-3 py-1 text-xs font-bold text-owl-goldText">
              <BarChart3 size={14} strokeWidth={2} aria-hidden="true" />
              KSU Marietta Campus
            </span>
            {dataset && (
              <span data-testid="operations-dataset-badge">
                <StatusBadge tone={simulated ? "warning" : "neutral"}>
                  {simulated
                    ? "Recording dataset · Simulated data"
                    : dataset.label || "Current app data"}
                </StatusBadge>
              </span>
            )}
          </div>
          <h1
            data-testid="operations-heading"
            className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
          >
            Food Rescue Analytics
          </h1>
          <p className="max-w-2xl text-sm text-ink-muted">
            Campus food sharing, student pickups, and reconciled serving
            outcomes across verified Marietta buildings.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          {/* Date period selector: Today / Last 7 days / All time */}
          <div
            role="group"
            aria-label="Analytics time period"
            data-testid="operations-period-group"
            className="inline-flex w-full items-center rounded-full border border-line bg-surface p-1 shadow-sm sm:w-auto"
          >
            {OPERATIONS_UI_PERIODS.map((item) => {
              const active = period === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`operations-period-${item.id}`}
                  aria-pressed={active}
                  onClick={() => onSelectPeriod(item.id)}
                  className={`min-h-11 flex-1 rounded-full px-4 py-2 text-xs font-bold transition sm:flex-initial sm:text-sm ${
                    active
                      ? "bg-owl-gold text-owl-goldInk shadow-sm"
                      : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  }`}
                >
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Updated timestamp + refresh controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              data-testid="operations-updated-at"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-medium text-ink-muted tabular-nums"
            >
              <Clock size={14} aria-hidden="true" className="shrink-0" />
              <span>
                {serverTime
                  ? `Updated ${formatEasternClock(serverTime)}`
                  : "Waiting for snapshot"}
              </span>
            </div>

            <button
              type="button"
              data-testid="operations-auto-refresh-toggle"
              aria-pressed={autoRefresh}
              onClick={onToggleAutoRefresh}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition hover:bg-surface-subtle"
            >
              {autoRefresh ? (
                <>
                  <Pause size={13} aria-hidden="true" />
                  <span>Auto</span>
                </>
              ) : (
                <>
                  <Play size={13} aria-hidden="true" />
                  <span>Paused</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="operations-refresh-button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh analytics"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition hover:bg-surface-subtle disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={refreshing ? "animate-spin" : ""}
              />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Persistent prominent banner when the simulated recording dataset is loaded */}
      {simulated && (
        <div
          role="status"
          data-testid="operations-recording-banner"
          className="flex flex-col gap-3 rounded-2xl border-2 border-warning/60 bg-warning-tint px-4 py-3.5 text-warning sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <FlaskConical
              size={20}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="font-extrabold">
                Recording dataset · Simulated data active
              </p>
              <p className="text-xs leading-relaxed opacity-90">
                All KPIs, charts, listings, and estimates on this page come from
                the deterministic demonstration recording dataset — not measured
                campus demand or verified physical impact.
                {dataset?.seed_version ? ` (${dataset.seed_version})` : ""}
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            data-testid="operations-recording-banner-admin-link"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-warning/50 bg-surface px-4 text-xs font-bold text-ink transition hover:bg-surface-subtle"
          >
            Reset in Admin
          </Link>
        </div>
      )}

      {/* Stale data banner when a periodic refresh fails while keeping last good snapshot */}
      {isStale && (
        <div
          role="alert"
          data-testid="operations-stale-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} aria-hidden="true" className="shrink-0" />
            <span className="font-medium">
              Showing last confirmed snapshot — update failed
              {staleMessage ? `: ${staleMessage}` : "."}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 items-center rounded-full border border-danger/40 bg-surface px-4 text-xs font-bold text-ink transition hover:bg-surface-subtle"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
