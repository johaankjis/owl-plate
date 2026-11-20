"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppShell } from "../ui/AppShell";
import { OperationsHeader } from "./OperationsHeader";
import { KpiGrid } from "./KpiGrid";
import { ImpactEstimatesPanel } from "./ImpactEstimatesPanel";
import { TrendChart } from "./TrendChart";
import { OutcomesDonutChart } from "./OutcomesDonutChart";
import { BuildingsBarChart } from "./BuildingsBarChart";
import { CategoriesChart } from "./CategoriesChart";
import { ActiveListingsTable } from "./ActiveListingsTable";
import { RecentActivityFeed } from "./RecentActivityFeed";
import { RecordingDatasetSection } from "./RecordingDatasetSection";
import { getOperations, loadRecordingDataset } from "../../lib/operations-api";
import { isRecordingDataset } from "../../lib/operations-helpers";
import type {
  OperationsPeriod,
  OperationsResponse,
} from "../../lib/types/operations";

const AUTO_REFRESH_INTERVAL_MS = 5000;

function DashboardSkeleton() {
  return (
    <div
      data-testid="operations-loading-skeleton"
      aria-label="Loading analytics"
      className="space-y-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-3xl border border-line bg-surface p-5"
          >
            <div className="h-3 w-24 rounded bg-surface-subtle" />
            <div className="mt-5 h-8 w-20 rounded bg-surface-subtle" />
            <div className="mt-3 h-3 w-36 rounded bg-surface-subtle" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-72 animate-pulse rounded-3xl border border-line bg-surface lg:col-span-7" />
        <div className="h-72 animate-pulse rounded-3xl border border-line bg-surface lg:col-span-5" />
      </div>
      <div className="h-56 animate-pulse rounded-3xl border border-line bg-surface" />
    </div>
  );
}

/**
 * Main Food Rescue Analytics dashboard (mounted at /dispatch and aliased at
 * /impact). Strictly database-driven via GET /analytics/operations with zero
 * fabricated fallback metrics, automatic polling, and explicit confirmation for
 * fixture/log recording-dataset loading.
 */
export function OperationsDashboard() {
  const [period, setPeriod] = useState<OperationsPeriod>("7d");
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const activeRequestRef = useRef<AbortController | null>(null);
  const hasSnapshotRef = useRef(false);

  const fetchSnapshot = useCallback(
    async (targetPeriod: OperationsPeriod, background = false) => {
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;

      if (!background) {
        setRefreshing(true);
      }
      try {
        const snapshot = await getOperations(targetPeriod, controller.signal);
        if (controller.signal.aborted) return;
        hasSnapshotRef.current = true;
        setData(snapshot);
        setError(null);
        setIsStale(false);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error
            ? err.message
            : "The dashboard could not update. Please try again.";
        setError(message);
        if (hasSnapshotRef.current) {
          setIsStale(true);
        }
        setLoading(false);
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
        }
      }
    },
    [],
  );

  // Fetch immediately on mount and whenever the selected date period changes.
  useEffect(() => {
    void fetchSnapshot(period, false);
    return () => {
      activeRequestRef.current?.abort();
    };
  }, [period, fetchSnapshot]);

  // Periodic auto-refresh while enabled and tab is visible.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchSnapshot(period, true);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, period, fetchSnapshot]);

  const handleSelectPeriod = (nextPeriod: OperationsPeriod) => {
    if (nextPeriod === period) return;
    setPeriod(nextPeriod);
  };

  const handleLoadRecordingDataset = async () => {
    const seeded = await loadRecordingDataset();
    hasSnapshotRef.current = true;
    setPeriod(seeded.period);
    setData(seeded);
    setError(null);
    setIsStale(false);
    setLoading(false);
  };

  const isSimulated = isRecordingDataset(data?.dataset);

  return (
    <AppShell variant="public" maxWidth="wide">
      <div
        data-testid="operations-dashboard"
        data-dataset-kind={data?.dataset.kind ?? "loading"}
        data-period={period}
        className="space-y-6"
      >
        <OperationsHeader
          period={period}
          onSelectPeriod={handleSelectPeriod}
          serverTime={data?.server_time ?? null}
          dataset={data?.dataset ?? null}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
          refreshing={refreshing}
          onRefresh={() => void fetchSnapshot(period, false)}
          isStale={isStale}
          staleMessage={error}
        />

        {/* Initial loading skeleton */}
        {loading && !data && <DashboardSkeleton />}

        {/* Hard error state when no snapshot exists (never fabricate sample metrics) */}
        {!loading && !data && error && (
          <section
            role="alert"
            data-testid="operations-error-banner"
            className="consumer-card flex flex-col items-center justify-center gap-3 py-12 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger">
              <AlertTriangle size={24} aria-hidden="true" />
            </span>
            <h2 className="text-lg font-extrabold text-ink">
              Analytics unavailable
            </h2>
            <p className="max-w-md text-sm text-ink-muted">{error}</p>
            <button
              type="button"
              data-testid="operations-retry-button"
              onClick={() => void fetchSnapshot(period, false)}
              className="consumer-button mt-2"
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span>Retry loading analytics</span>
            </button>
          </section>
        )}

        {/* Database-backed analytics content */}
        {data && (
          <>
            <KpiGrid summary={data.summary} isSimulated={isSimulated} />

            <ImpactEstimatesPanel
              summary={data.summary}
              estimates={data.estimates}
              isSimulated={isSimulated}
            />

            {/* Primary Analytics Charts: Actual-date Trend + 6-Bucket Reconciled Outcomes */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <TrendChart series={data.series} isSimulated={isSimulated} />
              </div>
              <div className="min-w-0 xl:col-span-5">
                <OutcomesDonutChart
                  outcomes={data.outcomes}
                  totalOffered={data.summary.total_servings_offered}
                  isSimulated={isSimulated}
                />
              </div>
            </div>

            {/* Secondary Breakdown Charts: Top Campus Buildings + Food Categories */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <BuildingsBarChart
                  buildings={data.buildings}
                  isSimulated={isSimulated}
                />
              </div>
              <div className="min-w-0 xl:col-span-5">
                <CategoriesChart
                  categories={data.categories}
                  isSimulated={isSimulated}
                />
              </div>
            </div>

            {/* Active Listings Table with Scoped Photos */}
            <ActiveListingsTable
              listings={data.active_listings}
              serverTime={data.server_time}
              isSimulated={isSimulated}
            />

            {/* Recent Persisted Activity */}
            <RecentActivityFeed
              activity={data.activity}
              isSimulated={isSimulated}
            />

            {/* Provenance, Methodology Notes & Confirmed Recording Dataset Controls */}
            <RecordingDatasetSection
              dataset={data.dataset}
              recordingAvailable={data.recording_available}
              period={data.period}
              windowStart={data.window_start}
              notes={data.notes}
              onLoadRecordingDataset={handleLoadRecordingDataset}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
