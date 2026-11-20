"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  HeartHandshake,
  MapPin,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  describeActivityKind,
  formatCount,
  formatEasternDateTime,
  formatSafeBuildingName,
} from "../../lib/operations-helpers";
import type { OperationsActivity } from "../../lib/types/operations";

interface RecentActivityFeedProps {
  activity: ReadonlyArray<OperationsActivity>;
  isSimulated: boolean;
}

function ActivityIcon({ kind }: { kind: OperationsActivity["kind"] }) {
  switch (kind) {
    case "listing_published":
      return <UtensilsCrossed size={15} aria-hidden="true" />;
    case "student_pickup":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "reservation_opened":
      return <Clock size={15} aria-hidden="true" />;
    case "pantry_rejected":
    case "pantry_expired":
      return <XCircle size={15} aria-hidden="true" />;
    default:
      return <HeartHandshake size={15} aria-hidden="true" />;
  }
}

/**
 * Chronological feed of persisted recent food rescue actions with honest
 * America/New_York timestamps and explicit simulation markers.
 */
export function RecentActivityFeed({
  activity,
  isSimulated,
}: RecentActivityFeedProps) {
  return (
    <section
      aria-labelledby="operations-activity-heading"
      data-testid="operations-recent-activity"
      className="consumer-card space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-activity-heading"
              className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
            >
              Recent Activity
            </h2>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-activity">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Latest persisted listing, reservation, student pickup, and simulated
            pantry events in the selected period (up to 20 entries).
          </p>
        </div>
      </div>

      {activity.length === 0 ? (
        <div
          data-testid="operations-activity-empty"
          className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <Activity
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No recent activity in this period
          </p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Persisted listings, student reservations, pickups, and pantry
            actions appear here automatically without page reload.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {activity.map((item, idx) => {
            const meta = describeActivityKind(item.kind);
            const showSimBadge = item.is_simulated || isSimulated;
            return (
              <li
                key={`${item.drop_id}-${item.kind}-${item.occurred_at}-${idx}`}
                data-testid={`operations-activity-item-${idx}`}
                className="flex flex-col gap-2 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
                    <ActivityIcon kind={item.kind} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      {showSimBadge && (
                        <StatusBadge tone="warning">Simulated</StatusBadge>
                      )}
                      <span className="text-xs font-bold text-ink tabular-nums">
                        {formatCount(item.servings)}{" "}
                        {item.servings === 1 ? "serving" : "servings"}
                      </span>
                    </div>
                    <div className="break-words text-sm font-semibold text-ink">
                      {item.food}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} aria-hidden="true" />
                        {formatSafeBuildingName(item.building_name)}
                      </span>
                    </div>
                  </div>
                </div>

                <time
                  dateTime={item.occurred_at}
                  className="shrink-0 pl-11 text-xs font-medium text-ink-muted tabular-nums sm:pl-0 sm:text-right"
                >
                  {formatEasternDateTime(item.occurred_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
