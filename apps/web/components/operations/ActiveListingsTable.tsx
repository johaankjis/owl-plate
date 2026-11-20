"use client";

import React from "react";
import { UtensilsCrossed } from "lucide-react";
import { DropPhoto } from "../ui/DropPhoto";
import { FoodCategoryIllustration } from "../ui/FoodCategoryIllustration";
import { StatusBadge } from "../ui/StatusBadge";
import {
  describeListingStatus,
  formatBuildingWithRoom,
  formatCount,
  formatDeadlineCountdown,
  formatEasternDateTime,
} from "../../lib/operations-helpers";
import type { OperationsListing } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_HEADING } from "./styles";

interface ActiveListingsTableProps {
  listings: ReadonlyArray<OperationsListing>;
  serverTime: string;
  isSimulated: boolean;
}

const PROJECTOR_PHOTO_TOKEN = "demo-projector";

/**
 * Unexpired listings with the scoped host food photo (fetched with a Bearer
 * header inside DropPhoto), verified location, serving counts and deadline.
 * Listings without a stored photo show a labelled illustration instead.
 */
export function ActiveListingsTable({
  listings,
  serverTime,
  isSimulated,
}: ActiveListingsTableProps) {
  return (
    <section
      aria-labelledby="operations-active-listings-heading"
      data-testid="operations-active-listings"
      className={`${OPS_CARD} flex h-full flex-col gap-4`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="operations-active-listings-heading" className={OPS_HEADING}>
          Active listings
        </h2>
        <span className="text-xs font-semibold text-ink-muted tabular-nums">
          {formatCount(listings.length)} active
        </span>
      </div>

      {listings.length === 0 ? (
        <OpsEmptyState
          testId="operations-active-listings-empty"
          minHeightClass="min-h-[160px] flex-1"
          icon={
            <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden="true" />
          }
          title="No active listings right now"
        />
      ) : (
        <ul className="divide-y divide-line/70">
          {listings.map((item) => {
            const statusMeta = describeListingStatus(item);
            const countdown = formatDeadlineCountdown(
              item.expires_at,
              serverTime,
            );
            const hasPantryCounts =
              item.pantry_held > 0 || item.pantry_transferred > 0;

            return (
              <li
                key={item.drop_id}
                data-testid={`operations-active-listing-${item.drop_id}`}
                className="flex gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="w-[4.5rem] shrink-0">
                  <DropPhoto
                    dropId={item.drop_id}
                    hasPhoto={item.has_photo}
                    photoUrl={item.photo_url}
                    authToken={PROJECTOR_PHOTO_TOKEN}
                    alt={item.food}
                    aspect="square"
                    testId={`operations-listing-photo-${item.drop_id}`}
                    fallback={
                      <FoodCategoryIllustration
                        hints={[item.category, item.food]}
                        size="thumb"
                        testId={`operations-listing-illustration-${item.drop_id}`}
                      />
                    }
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-ink">
                      {item.food}
                    </h3>
                    <StatusBadge tone={statusMeta.tone}>
                      {statusMeta.label}
                    </StatusBadge>
                  </div>
                  <p className="break-words text-xs text-ink-muted">
                    {formatBuildingWithRoom(item.building, item.room)} ·{" "}
                    {item.category}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    <strong className="font-bold text-ink">
                      {formatCount(item.available)}
                    </strong>{" "}
                    available ·{" "}
                    <strong className="font-bold text-ink">
                      {formatCount(item.held)}
                    </strong>{" "}
                    held ·{" "}
                    <strong className="font-bold text-success">
                      {formatCount(item.picked_up)}
                    </strong>{" "}
                    picked up of {formatCount(item.total_servings)}
                  </p>
                  {hasPantryCounts && (
                    <p className="text-xs text-ink-muted tabular-nums">
                      Pantry (simulated):{" "}
                      <strong className="font-bold text-ink">
                        {formatCount(item.pantry_held)}
                      </strong>{" "}
                      reserved ·{" "}
                      <strong className="font-bold text-ink">
                        {formatCount(item.pantry_transferred)}
                      </strong>{" "}
                      transferred
                    </p>
                  )}
                  <p className="text-xs text-ink-muted tabular-nums">
                    <span
                      className={`font-bold ${
                        countdown.isUrgent ? "text-warning" : "text-ink"
                      }`}
                    >
                      {countdown.label}
                    </span>{" "}
                    · until {formatEasternDateTime(item.expires_at)}
                    {isSimulated ? " · Simulated data" : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
