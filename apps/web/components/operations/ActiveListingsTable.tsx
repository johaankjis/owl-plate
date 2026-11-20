"use client";

import React from "react";
import { Clock, MapPin, UtensilsCrossed } from "lucide-react";
import { DropPhoto } from "../ui/DropPhoto";
import { StatusBadge } from "../ui/StatusBadge";
import {
  describeListingStatus,
  formatBuildingWithRoom,
  formatCount,
  formatDeadlineCountdown,
  formatEasternDateTime,
} from "../../lib/operations-helpers";
import type { OperationsListing } from "../../lib/types/operations";

interface ActiveListingsTableProps {
  listings: ReadonlyArray<OperationsListing>;
  serverTime: string;
  isSimulated: boolean;
}

const PROJECTOR_PHOTO_TOKEN = "demo-projector";

/**
 * Responsive active-listings view displaying scoped sanitized host listing
 * photos (authenticated via Bearer header inside DropPhoto), verified location,
 * flat serving counts, deadline, and status without duplicating DOM nodes.
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
      className="consumer-card space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-active-listings-heading"
              className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
            >
              Active Listings
            </h2>
            <StatusBadge tone="neutral">
              {formatCount(listings.length)} active
            </StatusBadge>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-listings">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Unexpired campus listings with sanitized host food photos, verified
            building locations, and live serving counts. No host or student
            identities are exposed.
          </p>
        </div>
      </div>

      {listings.length === 0 ? (
        <div
          data-testid="operations-active-listings-empty"
          className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <UtensilsCrossed
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No active listings right now
          </p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Unexpired food drops appear here with live availability, deadlines,
            and pickup counts until they expire.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {/* Desktop column header */}
          <div
            aria-hidden="true"
            className="hidden grid-cols-12 gap-4 border-b border-line bg-surface-subtle/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted lg:grid"
          >
            <div className="col-span-4">Listing</div>
            <div className="col-span-3">Location</div>
            <div className="col-span-3">Serving counts</div>
            <div className="col-span-2 text-right">Deadline &amp; status</div>
          </div>

          <ul className="divide-y divide-line">
            {listings.map((item) => {
              const statusMeta = describeListingStatus(item);
              const countdown = formatDeadlineCountdown(
                item.expires_at,
                serverTime,
              );
              const location = formatBuildingWithRoom(item.building, item.room);
              const hasPantryCounts =
                item.pantry_held > 0 || item.pantry_transferred > 0;

              return (
                <li
                  key={item.drop_id}
                  data-testid={`operations-active-listing-${item.drop_id}`}
                  className="grid grid-cols-1 gap-3 bg-surface p-4 transition hover:bg-surface-subtle/30 lg:grid-cols-12 lg:items-center lg:gap-4"
                >
                  {/* Photo + Food title + Category */}
                  <div className="flex min-w-0 items-center gap-3 lg:col-span-4">
                    <div className="w-20 shrink-0 sm:w-24">
                      <DropPhoto
                        dropId={item.drop_id}
                        hasPhoto={item.has_photo}
                        photoUrl={item.photo_url}
                        authToken={PROJECTOR_PHOTO_TOKEN}
                        alt={item.food}
                        aspect="4/3"
                        testId={`operations-listing-photo-${item.drop_id}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="break-words text-sm font-bold leading-snug text-ink">
                        {item.food}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-surface-subtle px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                          {item.category}
                        </span>
                        <span className="text-[11px] text-ink-muted tabular-nums">
                          {formatCount(item.total_servings)} total
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Verified Location */}
                  <div className="flex min-w-0 items-start gap-1.5 text-xs text-ink-muted lg:col-span-3">
                    <MapPin
                      size={14}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-owl-goldText"
                    />
                    <span className="break-words font-medium text-ink">
                      {location}
                    </span>
                  </div>

                  {/* Flat 6-bucket counts */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums lg:col-span-3">
                    <span className="rounded-lg bg-surface-subtle px-2 py-1 font-semibold text-ink">
                      <strong className="font-extrabold">
                        {formatCount(item.available)}
                      </strong>{" "}
                      avail
                    </span>
                    <span className="rounded-lg bg-owl-goldTint/70 px-2 py-1 font-semibold text-owl-goldText">
                      <strong className="font-extrabold">
                        {formatCount(item.held)}
                      </strong>{" "}
                      held
                    </span>
                    <span className="rounded-lg bg-success-tint px-2 py-1 font-semibold text-success">
                      <strong className="font-extrabold">
                        {formatCount(item.picked_up)}
                      </strong>{" "}
                      picked up
                    </span>
                    {hasPantryCounts && (
                      <>
                        <span className="rounded-lg bg-warning-tint px-2 py-1 font-semibold text-warning">
                          <strong className="font-extrabold">
                            {formatCount(item.pantry_held)}
                          </strong>{" "}
                          pantry res (sim.)
                        </span>
                        <span className="rounded-lg bg-warning-tint px-2 py-1 font-semibold text-warning">
                          <strong className="font-extrabold">
                            {formatCount(item.pantry_transferred)}
                          </strong>{" "}
                          pantry xfer (sim.)
                        </span>
                      </>
                    )}
                  </div>

                  {/* Deadline & Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2 lg:flex-col lg:items-end lg:justify-center">
                    <StatusBadge tone={statusMeta.tone}>
                      {statusMeta.label}
                    </StatusBadge>
                    <div className="text-left text-[11px] text-ink-muted tabular-nums lg:text-right">
                      <div
                        className={`inline-flex items-center gap-1 font-bold ${
                          countdown.isUrgent ? "text-warning" : "text-ink"
                        }`}
                      >
                        <Clock size={11} aria-hidden="true" />
                        <span>{countdown.label}</span>
                      </div>
                      <div>{formatEasternDateTime(item.expires_at)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
