"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
import { OPS_EYEBROW } from "./styles";

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

const ICON_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink disabled:opacity-60";

/**
 * Analytics page header: title, dataset provenance badge, date range filter
 * and refresh controls, plus the stale-snapshot warning.
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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={OPS_EYEBROW}>KSU Marietta Campus</span>
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
            className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
          >
            Food Rescue Analytics
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div
            role="group"
            aria-label="Analytics time period"
            data-testid="operations-period-group"
            className="inline-flex w-full items-center rounded-full bg-surface p-1 shadow-card ring-1 ring-line/60 sm:w-auto"
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
                  className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-bold transition sm:flex-initial sm:px-4 ${
                    active
                      ? "bg-owl-gold text-owl-goldInk"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-1 sm:justify-end">
            <span
              data-testid="operations-updated-at"
              className="text-xs font-medium text-ink-muted tabular-nums"
            >
              {serverTime
                ? `Updated ${formatEasternClock(serverTime)}`
                : "Waiting for snapshot"}
            </span>
            <span className="flex items-center">
              <button
                type="button"
                data-testid="operations-auto-refresh-toggle"
                aria-pressed={autoRefresh}
                aria-label={
                  autoRefresh
                    ? "Auto refresh on. Pause auto refresh"
                    : "Auto refresh paused. Resume auto refresh"
                }
                title={
                  autoRefresh ? "Pause auto refresh" : "Resume auto refresh"
                }
                onClick={onToggleAutoRefresh}
                className={ICON_BUTTON}
              >
                {autoRefresh ? (
                  <Pause size={16} aria-hidden="true" />
                ) : (
                  <Play size={16} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                data-testid="operations-refresh-button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh analytics"
                title="Refresh analytics"
                className={ICON_BUTTON}
              >
                <RefreshCw
                  size={16}
                  aria-hidden="true"
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </span>
          </div>
        </div>
      </div>

      {isStale && (
        <div
          role="alert"
          data-testid="operations-stale-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-tint px-4 py-2.5 text-sm text-danger"
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
            className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-xs font-bold text-ink transition hover:bg-surface-subtle"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Persistent provenance ribbon shown while the simulated recording dataset is
 * loaded. It stays pinned under the app header so every chart below it is read
 * as demonstration data without repeating the label on each panel.
 */
export function RecordingDatasetBanner({
  dataset,
}: {
  dataset: OperationsDataset | null;
}) {
  if (!isRecordingDataset(dataset)) return null;
  return (
    <div
      role="status"
      data-testid="operations-recording-banner"
      className="sticky top-[76px] z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-warning-tint px-4 py-2 text-warning shadow-card ring-1 ring-warning/40"
    >
      <p className="flex min-w-0 items-start gap-2.5 text-sm">
        <FlaskConical
          size={18}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
        />
        <span>
          <strong className="font-extrabold">
            Recording dataset · Simulated data.
          </strong>{" "}
          Every figure on this page is demonstration data, not measured campus
          activity.
          {dataset?.seed_version ? ` (${dataset.seed_version})` : ""}
        </span>
      </p>
      <Link
        href="/admin"
        data-testid="operations-recording-banner-admin-link"
        className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold underline underline-offset-4"
      >
        Reset in Admin
      </Link>
    </div>
  );
}
