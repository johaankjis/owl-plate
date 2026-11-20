"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { AppShell } from "../../components/ui/AppShell";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { PresenterControls } from "../../components/presenter/PresenterControls";
import {
  getDemoStatus,
  getDrop,
  type DemoStatusResponse,
  type DropResponse,
} from "../../lib/presenter-api";
import { API_BASE_URL, UI_FIXTURE_MODE } from "../../lib/api-client";
import { DEMO_CREDENTIALS } from "../../lib/types/api";
import {
  useNotificationMode,
  useVisionMode,
  visionModeLabel,
} from "../../lib/vision-mode";

const PERSONAS = ["A", "B", "C", "D", "E"] as const;

export default function AdminDiagnosticsPage() {
  const [status, setStatus] = useState<DemoStatusResponse | null>(null);
  const [activeDrop, setActiveDrop] = useState<DropResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visionMode = useVisionMode();
  const notificationMode = useNotificationMode();

  const refresh = useCallback(async () => {
    try {
      const current = await getDemoStatus();
      setStatus(current);
      if (current.active_drop_id) {
        const drop = await getDrop(current.active_drop_id);
        setActiveDrop(drop);
      } else {
        setActiveDrop(null);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load admin status",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <AppShell
      variant="admin"
      title="Technical Admin & Demo Diagnostics"
      headerAction={
        <div className="flex items-center gap-2">
          <Link
            href="/dispatch"
            className="consumer-button-secondary px-3 py-2 text-xs"
          >
            Projector View
          </Link>
          <button
            type="button"
            data-testid="admin-refresh-btn"
            onClick={() => void refresh()}
            className="consumer-button-secondary px-3 py-2 text-xs"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      }
    >
      <div data-testid="admin-diagnostics-page" className="space-y-6">
        <p className="text-sm text-ink-muted">
          Developer diagnostics, provider configuration, synthetic rehearsal
          personas, and demo scenario controls are isolated on this admin screen
          so consumer routes remain clean.
        </p>

        {notice && (
          <div
            role="status"
            data-testid="admin-notice-banner"
            className="rounded-2xl border border-success/40 bg-success-tint px-4 py-3 text-sm font-medium text-success"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            data-testid="admin-error-banner"
            className="rounded-2xl border border-danger/40 bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
          >
            {error}
          </div>
        )}

        {/* System & Provider Telemetry */}
        <section
          data-testid="admin-telemetry-section"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="consumer-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <span>API Connection</span>
              <Server size={15} />
            </div>
            <div
              data-testid="admin-api-status"
              className="mt-2 text-lg font-extrabold"
            >
              {UI_FIXTURE_MODE
                ? "Offline Fixture Mode"
                : status
                  ? "Connected (Live API)"
                  : error
                    ? "Unavailable"
                    : "Connecting..."}
            </div>
            <p className="mt-1 truncate text-xs text-ink-muted">
              Endpoint: {API_BASE_URL}
            </p>
          </div>

          <div className="consumer-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <span>Vision Provider</span>
              <Activity size={15} />
            </div>
            <div
              data-testid="admin-vision-mode"
              className="mt-2 text-lg font-extrabold"
            >
              {visionModeLabel(visionMode)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Mode ID: {visionMode ?? "loading"}
            </p>
          </div>

          <div className="consumer-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <span>Push Notifications</span>
              <Shield size={15} />
            </div>
            <div
              data-testid="admin-notification-mode"
              className="mt-2 text-lg font-extrabold"
            >
              {notificationMode === "fcm"
                ? "Firebase Cloud Messaging"
                : notificationMode === "simulated"
                  ? "Simulated Transport"
                  : "Checking..."}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Transport: {notificationMode ?? "loading"}
            </p>
          </div>

          <div className="consumer-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <span>Scenario & Clock</span>
              <Clock size={15} />
            </div>
            <div
              data-testid="admin-scenario-mode"
              className="mt-2 text-lg font-extrabold"
            >
              {status?.scenario === "seeded"
                ? "Seeded Rehearsal (A–E)"
                : "Live Visitors"}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Clock offset: +{status?.clock_offset_seconds ?? 0}s · Visitors:{" "}
              {status?.visitors ?? 0}
            </p>
          </div>
        </section>

        {/* Presenter & Scenario Controls */}
        <PresenterControls
          status={status}
          onChanged={(msg) => {
            setNotice(msg);
            setError(null);
            void refresh();
          }}
          onError={(msg) => setError(msg)}
        />

        {/* Quick Workspace & Rehearsal Links */}
        <section
          data-testid="admin-workspaces-section"
          className="consumer-card p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold">
                Workspaces & Rehearsal Entry Points
              </h2>
              <p className="text-xs text-ink-muted">
                Launch consumer roles, rehearsal host mode (with DEMO-ORIGIN),
                or simulated student personas A–E.
              </p>
            </div>
            <StatusBadge tone="gold">
              {status ? "Demo Mode Enabled" : "Connecting"}
            </StatusBadge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/student"
              data-testid="admin-link-student"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Student App (/student)</span>
              <ExternalLink size={15} />
            </Link>
            <Link
              href="/join"
              data-testid="admin-link-join"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Student Onboarding (/join)</span>
              <ExternalLink size={15} />
            </Link>
            <Link
              href="/host"
              data-testid="admin-link-host"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Host Workspace (/host)</span>
              <ExternalLink size={15} />
            </Link>
            <Link
              href="/host?rehearsal=1"
              data-testid="admin-link-host-rehearsal"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Host Rehearsal (DEMO-ORIGIN)</span>
              <RotateCcw size={15} />
            </Link>
            <Link
              href="/pantry"
              data-testid="admin-link-pantry"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Pantry Coordinator (/pantry)</span>
              <ExternalLink size={15} />
            </Link>
            <Link
              href="/dispatch"
              data-testid="admin-link-dispatch"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Projector Dispatch (/dispatch)</span>
              <ExternalLink size={15} />
            </Link>
            <Link
              href="/survey"
              data-testid="admin-link-survey"
              className="consumer-button-secondary justify-between text-sm"
            >
              <span>Feedback Survey (/survey)</span>
              <ExternalLink size={15} />
            </Link>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              <Users size={14} />
              <span>Seeded Rehearsal Personas (Simulated Students A–E)</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERSONAS.map((label) => (
                <Link
                  key={label}
                  href={`/student?persona=${label}`}
                  data-testid={`admin-persona-link-${label}`}
                  className="consumer-button-secondary px-4 py-2 text-xs"
                >
                  Open Persona {label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Active Drop & Synthetic Credentials Reference */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section
            data-testid="admin-active-drop-card"
            className="consumer-card p-5"
          >
            <h2 className="text-lg font-extrabold">Active Listing Snapshot</h2>
            {activeDrop ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {activeDrop.vision.items.map((i) => i.name).join(" & ") ||
                      "Listing"}
                  </span>
                  <StatusBadge tone="gold">{activeDrop.status}</StatusBadge>
                </div>
                <p className="text-xs text-ink-muted">
                  ID: <code>{activeDrop.id}</code> · Mode:{" "}
                  <code>{activeDrop.distribution_mode}</code> · Vision source:{" "}
                  <code>{activeDrop.vision_source}</code>
                </p>
                <p className="text-xs text-ink-muted">
                  Location: {activeDrop.building?.name ?? "Campus"} ·{" "}
                  {activeDrop.room}
                </p>
                <div className="grid grid-cols-5 gap-2 pt-2 text-center text-xs">
                  <div className="rounded-xl bg-surface-subtle p-2">
                    <div className="font-extrabold">
                      {activeDrop.counts.available}
                    </div>
                    <div className="text-ink-muted">Avail</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-2">
                    <div className="font-extrabold">
                      {activeDrop.counts.held}
                    </div>
                    <div className="text-ink-muted">Held</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-2">
                    <div className="font-extrabold">
                      {activeDrop.counts.picked_up}
                    </div>
                    <div className="text-ink-muted">Picked</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-2">
                    <div className="font-extrabold">
                      {activeDrop.counts.pantry_held ?? 0}
                    </div>
                    <div className="text-ink-muted">Pantry Held</div>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-2">
                    <div className="font-extrabold">
                      {activeDrop.counts.pantry_transferred ?? 0}
                    </div>
                    <div className="text-ink-muted">Pantry Xfer</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                No active listing is currently selected in the demo runtime.
              </p>
            )}
          </section>

          <section
            data-testid="admin-credentials-card"
            className="consumer-card p-5"
          >
            <h2 className="text-lg font-extrabold">
              Synthetic Role Credentials
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Used automatically by role routes in demo mode (`IS_DEMO=true`).
            </p>
            <ul className="mt-3 divide-y divide-line text-xs">
              {DEMO_CREDENTIALS.map((cred) => (
                <li
                  key={cred.token}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <span className="font-bold text-ink">{cred.label}</span>
                    <p className="text-ink-muted">{cred.description}</p>
                  </div>
                  <code className="shrink-0 rounded bg-surface-subtle px-2 py-1 text-[11px]">
                    {cred.token}
                  </code>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
