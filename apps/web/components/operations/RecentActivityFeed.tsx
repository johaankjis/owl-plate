"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  HeartHandshake,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import {
  describeActivityKind,
  formatCount,
  formatEasternDateTime,
  formatSafeBuildingName,
  type ActivityMeta,
} from "../../lib/operations-helpers";
import type { OperationsActivity } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_HEADING } from "./styles";

interface RecentActivityFeedProps {
  activity: ReadonlyArray<OperationsActivity>;
}

const TONE_CLASSES: Record<ActivityMeta["tone"], string> = {
  gold: "bg-owl-goldTint text-owl-goldText",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-surface-subtle text-ink-muted",
};

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
 * Newest-first feed of persisted listing, reservation, pickup and pantry
 * events. Pantry events carry one "simulated" qualifier each.
 */
export function RecentActivityFeed({ activity }: RecentActivityFeedProps) {
  return (
    <section
      aria-labelledby="operations-activity-heading"
      data-testid="operations-recent-activity"
      className={`${OPS_CARD} flex h-full flex-col gap-4`}
    >
      <h2 id="operations-activity-heading" className={OPS_HEADING}>
        Recent activity
      </h2>

      {activity.length === 0 ? (
        <OpsEmptyState
          testId="operations-activity-empty"
          minHeightClass="min-h-[160px] flex-1"
          icon={<Activity size={28} strokeWidth={1.5} aria-hidden="true" />}
          title="No recent activity in this period"
        />
      ) : (
        <ol
          tabIndex={0}
          aria-labelledby="operations-activity-heading"
          className="-mr-2 max-h-[30rem] space-y-4 overflow-y-auto pr-2"
        >
          {activity.map((item, idx) => {
            const meta = describeActivityKind(item.kind);
            const needsQualifier =
              meta.isPantryEvent && !/simulated/i.test(meta.label);
            return (
              <li
                key={`${item.drop_id}-${item.kind}-${item.occurred_at}-${idx}`}
                data-testid={`operations-activity-item-${idx}`}
                className="flex items-start gap-3"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[meta.tone]}`}
                >
                  <ActivityIcon kind={item.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-bold text-ink">
                      {meta.label}
                      {needsQualifier ? " (simulated)" : ""}
                    </p>
                    <time
                      dateTime={item.occurred_at}
                      className="shrink-0 text-xs text-ink-muted tabular-nums"
                    >
                      {formatEasternDateTime(item.occurred_at)}
                    </time>
                  </div>
                  <p className="break-words text-xs text-ink-muted">
                    <span className="font-semibold tabular-nums">
                      {formatCount(item.servings)}{" "}
                      {item.servings === 1 ? "serving" : "servings"}
                    </span>{" "}
                    · {item.food} · {formatSafeBuildingName(item.building_name)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
