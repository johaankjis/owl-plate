"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FlaskConical,
  Info,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  PERIOD_LABELS,
  formatEasternDateTime,
  isRecordingDataset,
} from "../../lib/operations-helpers";
import type {
  OperationsDataset,
  OperationsPeriod,
} from "../../lib/types/operations";

interface RecordingDatasetSectionProps {
  dataset: OperationsDataset;
  recordingAvailable: boolean;
  period: OperationsPeriod;
  windowStart: string | null;
  notes: ReadonlyArray<string>;
  onLoadRecordingDataset: () => Promise<void>;
}

/**
 * Methodology notes, dataset provenance, admin reset link, and explicitly
 * confirmed recording-dataset seed control (enabled only when the server
 * confirms demo fixture vision + simulated log notification capability).
 */
export function RecordingDatasetSection({
  dataset,
  recordingAvailable,
  period,
  windowStart,
  notes,
  onLoadRecordingDataset,
}: RecordingDatasetSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const simulated = isRecordingDataset(dataset);

  const handleConfirmLoad = async () => {
    if (!acknowledged || !recordingAvailable || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      await onLoadRecordingDataset();
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

  return (
    <section
      aria-labelledby="operations-provenance-heading"
      data-testid="operations-recording-section"
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Methodology & server notes */}
      <div
        data-testid="operations-methodology-notes"
        className="consumer-card space-y-3 lg:col-span-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info size={16} aria-hidden="true" className="text-owl-goldText" />
            <h2
              id="operations-provenance-heading"
              className="text-sm font-extrabold uppercase tracking-wider text-ink"
            >
              Data Provenance &amp; Methodology
            </h2>
          </div>
          <span className="text-xs text-ink-muted tabular-nums">
            Window: {PERIOD_LABELS[period]}
            {windowStart ? ` (from ${formatEasternDateTime(windowStart)})` : ""}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-ink-muted">
          Metrics reflect saved campus food listings only (drafts and separate
          rehearsal runs are excluded). Student pickups reflect recorded app
          confirmations, not independently verified physical food collection.
          Pantry transfers are explicitly simulated demonstration records.
        </p>

        {notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-muted">
            {notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Dataset status & explicitly confirmed recording-dataset control */}
      <div className="consumer-card flex flex-col justify-between gap-4 lg:col-span-5">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database
                size={16}
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
              ? `Showing simulated recording data${dataset.seed_version ? ` (${dataset.seed_version})` : ""}${dataset.anchor_time ? ` anchored ${formatEasternDateTime(dataset.anchor_time)}` : ""}. To return to clean live app data, run an ordinary reset in Admin.`
              : "Showing current application records. Prototype records are app states, not independently verified campus impact."}
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
                <Link
                  href="/admin"
                  data-testid="operations-admin-reset-link"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink transition hover:bg-surface-subtle"
                >
                  <span>
                    {simulated ? "Reset to live data in Admin" : "Admin"}
                  </span>
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
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
                      Replace current app data with simulated recording dataset?
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
                    I understand this resets current app data and loads clearly
                    labeled simulated recording data.
                  </span>
                </label>

                {loadError && (
                  <p
                    role="alert"
                    data-testid="operations-recording-error"
                    className="rounded-xl border border-danger/40 bg-danger-tint px-3 py-2 font-semibold text-danger"
                  >
                    {loadError}
                  </p>
                )}

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
              className="space-y-2.5 rounded-2xl border border-line bg-surface-subtle/60 p-3.5 text-xs text-ink-muted"
            >
              <p className="font-semibold text-ink">
                Recording dataset not enabled
              </p>
              <p className="leading-relaxed">
                Manage demo settings and dataset resets in Admin.
              </p>
              <Link
                href="/admin"
                data-testid="operations-admin-reset-link"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition hover:bg-surface-subtle"
              >
                <span>Open Admin</span>
                <ExternalLink size={13} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
