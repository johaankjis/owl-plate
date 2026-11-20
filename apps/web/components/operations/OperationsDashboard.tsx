"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppShell } from "../ui/AppShell";
import { OperationsHeader, RecordingDatasetBanner } from "./OperationsHeader";
import { KpiGrid } from "./KpiGrid";
import { SecondaryMetrics } from "./SecondaryMetrics";
import { TrendChart } from "./TrendChart";
import { OutcomesBreakdown } from "./OutcomesBreakdown";
import { CampusActivity } from "./CampusActivity";
import { CategoriesChart } from "./CategoriesChart";
import { ActiveListingsTable } from "./ActiveListingsTable";
import { RecentActivityFeed } from "./RecentActivityFeed";
import { OPS_CARD } from "./styles";
import { getOperations } from "../../lib/operations-api";
import { isRecordingDataset } from "../../lib/operations-helpers";
import type {
  OperationsPeriod,
  OperationsResponse,
} from "../../lib/types/operations";

const AUTO_REFRESH_INTERVAL_MS = 5000;

function DashboardSkeleton() {
  const block = `${OPS_CARD} animate-pulse`;
  return (
    <div
      data-testid="operations-loading-skeleton"
      aria-label="Loading analytics"
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${block} h-40`}>
            <div className="h-3 w-24 rounded bg-surface-subtle" />
            <div className="mt-5 h-10 w-20 rounded bg-surface-subtle" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className={`${block} h-96 xl:col-span-7`} />
        <div className={`${block} h-96 xl:col-span-5`} />
      </div>
      <div className={`${block} h-48`} />
    </div>
  );
}

/**
 * Main Food Rescue Analytics dashboard (mounted at /dispatch and aliased at
 * /impact). Strictly database-driven via GET /analytics/operations with zero
 * fabricated fallback metrics and automatic polling. Layout: four headline
 * figures, the daily trend beside the campus view, a compact reconciled
 * breakdown, consolidated secondary metrics, then recent activity and active
 * listings.
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

  const isSimulated = isRecordingDataset(data?.dataset);

  return (
    <AppShell variant="public" maxWidth="wide">
      <div
        data-testid="operations-dashboard"
        data-dataset-kind={data?.dataset.kind ?? "loading"}
        data-period={period}
        className="space-y-6 pb-4 xl:space-y-8"
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

        <RecordingDatasetBanner dataset={data?.dataset ?? null} />

        {/* Initial loading skeleton */}
        {loading && !data && <DashboardSkeleton />}

        {/* Hard error state when no snapshot exists (never fabricate sample metrics) */}
        {!loading && !data && error && (
          <section
            role="alert"
            data-testid="operations-error-banner"
            className={`${OPS_CARD} flex flex-col items-center justify-center gap-3 py-12 text-center`}
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

        {data && (
          <>
            <KpiGrid summary={data.summary} />

            {/* Centre stage: daily trend beside the campus view. */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <TrendChart series={data.series} isSimulated={isSimulated} />
              </div>
              <div className="min-w-0 xl:col-span-5">
                <CampusActivity
                  buildings={data.buildings}
                  isSimulated={isSimulated}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-7">
                <OutcomesBreakdown
                  outcomes={data.outcomes}
                  totalOffered={data.summary.total_servings_offered}
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

            <SecondaryMetrics
              summary={data.summary}
              estimates={data.estimates}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5">
                <RecentActivityFeed activity={data.activity} />
              </div>
              <div className="min-w-0 xl:col-span-7">
                <ActiveListingsTable
                  listings={data.active_listings}
                  serverTime={data.server_time}
                  isSimulated={isSimulated}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
