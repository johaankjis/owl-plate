"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FlaskConical,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import { getOperations, loadRecordingDataset } from "../../lib/operations-api";
import {
  PERIOD_LABELS,
  formatEasternDateTime,
  isRecordingDataset,
} from "../../lib/operations-helpers";
import type { OperationsResponse } from "../../lib/types/operations";

/**
 * Admin-only home for the analytics provenance panel and the destructive
 * recording-dataset control. Both moved off /dispatch and /impact so the
 * audience-facing analytics screens stay pure metrics; the discreet dataset
 * badge on the analytics header keeps sample data labeled there.
 */
export function AnalyticsDatasetControls() {
  const [snapshot, setSnapshot] = useState<OperationsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setFetching(true);
    try {
      setSnapshot(await getOperations("7d"));
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load the analytics dataset status.",
      );
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConfirmLoad = async () => {
    if (!acknowledged || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const seeded = await loadRecordingDataset();
      setSnapshot(seeded);
      setConfirmOpen(false);
      setAcknowledged(false);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load the recording dataset.",
      );
    } finally {
      setLoading(false);
    }
  };

  const dataset = snapshot?.dataset ?? null;
  const simulated = dataset !== null && isRecordingDataset(dataset);
  const recordingAvailable = snapshot?.recording_available ?? false;

  return (
    <section
      aria-labelledby="admin-analytics-dataset-heading"
      data-testid="admin-analytics-dataset-section"
      className="consumer-card space-y-4 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database
            size={17}
            aria-hidden="true"
            className="text-owl-goldText"
          />
          <h2
            id="admin-analytics-dataset-heading"
            className="text-lg font-extrabold text-ink"
          >
            Analytics Data &amp; Recording Dataset
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dataset && (
            <span data-testid="admin-dataset-status-badge">
              <StatusBadge tone={simulated ? "warning" : "neutral"}>
                {simulated ? "Recording dataset" : "Current app data"}
              </StatusBadge>
            </span>
          )}
          <Link
            href="/dispatch"
            data-testid="admin-analytics-link"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink transition hover:bg-surface-subtle"
          >
            <span>View analytics</span>
            <ExternalLink size={13} aria-hidden="true" />
          </Link>
          <button
            type="button"
            data-testid="admin-analytics-refresh-button"
            onClick={() => void refresh()}
            disabled={fetching}
            aria-label="Refresh dataset status"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition hover:bg-surface-subtle disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={fetching ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {loadError && (
        <p
          role="alert"
          data-testid="admin-analytics-dataset-error"
          className="rounded-2xl border border-danger/40 bg-danger-tint px-4 py-3 text-xs font-semibold text-danger"
        >
          {loadError}
        </p>
      )}

      {snapshot ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Methodology & server notes */}
          <div
            data-testid="operations-methodology-notes"
            className="space-y-3 rounded-2xl border border-line bg-surface-subtle/40 p-4 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info
                  size={15}
                  aria-hidden="true"
                  className="text-owl-goldText"
                />
                <h3
                  id="operations-provenance-heading"
                  className="text-sm font-extrabold uppercase tracking-wider text-ink"
                >
                  Data Provenance &amp; Methodology
                </h3>
              </div>
              <span className="text-xs text-ink-muted tabular-nums">
                Window: {PERIOD_LABELS[snapshot.period]}
                {snapshot.window_start
                  ? ` (from ${formatEasternDateTime(snapshot.window_start)})`
                  : ""}
              </span>
            </div>

            <p className="text-xs leading-relaxed text-ink-muted">
              Metrics reflect saved campus food listings only (drafts and
              separate rehearsal runs are excluded). Student pickups reflect
              recorded app confirmations, not independently verified physical
              food collection. Pantry transfers are explicitly simulated
              demonstration records.
            </p>

            {snapshot.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-muted">
                {snapshot.notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Dataset status & explicitly confirmed recording-dataset control */}
          <div
            data-testid="operations-recording-section"
            className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface-subtle/40 p-4 lg:col-span-5"
          >
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database
                    size={15}
                    aria-hidden="true"
                    className="text-owl-goldText"
                  />
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-ink">
                    Dataset Controls
                  </h3>
                </div>
                <StatusBadge tone={simulated ? "warning" : "neutral"}>
                  {simulated ? "Recording dataset" : "Current app data"}
                </StatusBadge>
              </div>

              <p className="text-xs leading-relaxed text-ink-muted">
                {simulated
                  ? `Analytics is showing simulated recording data${dataset?.seed_version ? ` (${dataset.seed_version})` : ""}${dataset?.anchor_time ? ` anchored ${formatEasternDateTime(dataset.anchor_time)}` : ""}. An ordinary demo reset above returns the app to clean live data.`
                  : "Analytics is showing current application records. Prototype records are app states, not independently verified campus impact."}
              </p>
            </div>

            <div className="space-y-3">
              {recordingAvailable ? (
                !confirmOpen ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="operations-recording-open-button"
                      onClick={() => {
                        setConfirmOpen(true);
                        setAcknowledged(false);
                        setLoadError(null);
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-warning/50 bg-warning-tint px-4 text-xs font-bold text-warning transition hover:opacity-90"
                    >
                      <FlaskConical size={15} aria-hidden="true" />
                      <span>
                        {simulated
                          ? "Reload recording dataset"
                          : "Load recording dataset"}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid="operations-recording-confirm-panel"
                    className="space-y-3 rounded-2xl border border-warning/60 bg-warning-tint/60 p-3.5 text-xs"
                  >
                    <div className="flex items-start gap-2 text-warning">
                      <AlertTriangle
                        size={16}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0"
                      />
                      <div className="space-y-1">
                        <p className="font-extrabold">
                          Replace current app data with simulated recording
                          dataset?
                        </p>
                        <p className="leading-relaxed">
                          This destructive reset clears current listings,
                          reservations, sessions, and pantry records and loads
                          repeatable simulated rows for demo recording. No real
                          alerts or external messages are sent.
                        </p>
                      </div>
                    </div>

                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-warning/40 bg-surface px-3 py-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        data-testid="operations-recording-confirm-checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[#fdbb30]"
                      />
                      <span>
                        I understand this resets current app data and loads
                        clearly labeled simulated recording data.
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="operations-recording-confirm-button"
                        disabled={!acknowledged || loading}
                        onClick={() => void handleConfirmLoad()}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-owl-gold px-4 text-xs font-bold text-owl-goldInk transition hover:bg-owl-goldDark disabled:opacity-50"
                      >
                        {loading && (
                          <Loader2
                            size={14}
                            aria-hidden="true"
                            className="animate-spin"
                          />
                        )}
                        <span>
                          {loading
                            ? "Loading recording dataset..."
                            : "Confirm reset & load"}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-testid="operations-recording-cancel-button"
                        disabled={loading}
                        onClick={() => {
                          setConfirmOpen(false);
                          setAcknowledged(false);
                          setLoadError(null);
                        }}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink transition hover:bg-surface-subtle disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div
                  data-testid="operations-recording-disabled"
                  className="space-y-1 text-xs text-ink-muted"
                >
                  <p className="font-semibold text-ink">
                    Recording dataset not enabled
                  </p>
                  <p className="leading-relaxed">
                    The server has not confirmed demo fixture vision plus
                    simulated log notifications, so the recording seed stays
                    locked.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          data-testid="admin-analytics-dataset-loading"
          className="h-28 animate-pulse rounded-2xl border border-line bg-surface-subtle/60"
        />
      )}
    </section>
  );
}
