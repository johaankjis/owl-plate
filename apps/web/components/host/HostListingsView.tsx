"use client";

import React from "react";
import { ChevronRight, MapPin, Plus, RefreshCw } from "lucide-react";
import { DropPhoto } from "../ui/DropPhoto";
import { EmptyState } from "../ui/EmptyState";
import { ListRowSkeleton } from "../ui/Skeleton";
import { StatusBadge } from "../ui/StatusBadge";
import type { Building, DropResponse } from "../../lib/types/api";
import {
  formatHostDropLocation,
  formatHostStatusLabel,
  hostStatusTone,
  partitionHostDrops,
  resolveHostListingAction,
  summarizeHostListing,
} from "../../app/host/host-helpers";

interface HostListingsViewProps {
  drops: ReadonlyArray<DropResponse> | null;
  loading: boolean;
  error: string | null;
  authToken: string;
  buildings: ReadonlyArray<Building>;
  onOpen: (drop: DropResponse) => void;
  onNew: () => void;
  onRefresh: () => void;
}

function formatWhen(drop: DropResponse): string {
  return new Date(drop.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function ListingRow({
  drop,
  authToken,
  buildings,
  onOpen,
}: {
  drop: DropResponse;
  authToken: string;
  buildings: ReadonlyArray<Building>;
  onOpen: (drop: DropResponse) => void;
}) {
  const title = summarizeHostListing(drop);
  const action = resolveHostListingAction(drop);
  const pantryTotal =
    (drop.counts.pantry_held ?? 0) + (drop.counts.pantry_transferred ?? 0);
  const body = (
    <div className="flex items-start gap-3">
      <DropPhoto
        dropId={drop.id}
        hasPhoto={drop.has_photo}
        photoUrl={drop.photo_url}
        authToken={authToken}
        alt={title}
        aspect="square"
        className="w-20 shrink-0 sm:w-24"
        testId={`host-listing-photo-${drop.id}`}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={hostStatusTone(drop.status)}>
            {formatHostStatusLabel(drop.status)}
          </StatusBadge>
          <span className="text-xs text-ink-muted">{formatWhen(drop)}</span>
        </div>
        <h3 className="truncate text-base font-extrabold">{title}</h3>
        <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
          <MapPin size={12} aria-hidden="true" className="shrink-0" />
          {formatHostDropLocation(drop, buildings)}
        </p>
        {drop.status !== "draft" && (
          <dl
            data-testid={`host-listing-counts-${drop.id}`}
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          >
            <div className="flex gap-1">
              <dt className="text-ink-muted">Servings</dt>
              <dd className="font-bold">{drop.counts.total}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-ink-muted">Reservations</dt>
              <dd className="font-bold">{drop.counts.held}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-ink-muted">Pickups</dt>
              <dd className="font-bold">{drop.counts.picked_up}</dd>
            </div>
            {pantryTotal > 0 && (
              <div className="flex gap-1">
                <dt className="text-ink-muted">Pantry donations</dt>
                <dd className="font-bold">{pantryTotal}</dd>
              </div>
            )}
          </dl>
        )}
        {action && (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-owl-goldText">
            {action === "resume" ? "Resume draft" : "Manage listing"}
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
  return (
    <li
      data-testid={`host-listing-${drop.id}`}
      data-status={drop.status}
      className="rounded-3xl border border-line bg-surface p-3 shadow-card"
    >
      {action ? (
        <button
          type="button"
          data-testid={`host-listing-open-${drop.id}`}
          onClick={() => onOpen(drop)}
          className="block w-full rounded-2xl text-left"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

/** The host's own listings in every status, recoverable without any presenter tools. */
export function HostListingsView({
  drops,
  loading,
  error,
  authToken,
  buildings,
  onOpen,
  onNew,
  onRefresh,
}: HostListingsViewProps) {
  const { active, past } = partitionHostDrops(drops ?? []);

  return (
    <section data-testid="host-listings-view" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">My listings</h2>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="host-listings-refresh"
            onClick={onRefresh}
            aria-label="Refresh listings"
            className="consumer-button-secondary h-12 w-12 px-0"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="host-new-drop-button"
            onClick={onNew}
            className="consumer-button"
          >
            <Plus size={18} aria-hidden="true" />
            New food drop
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="host-listings-error"
          className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {loading && !drops ? (
        <div className="space-y-3">
          <ListRowSkeleton />
          <ListRowSkeleton />
        </div>
      ) : active.length === 0 && past.length === 0 ? (
        <EmptyState
          testId="host-listings-empty"
          title="No listings yet"
          description="Share leftover food from your event and it will show up here."
          action={
            <button type="button" onClick={onNew} className="consumer-button">
              Share food
            </button>
          }
        />
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                Active
              </h3>
              <ul className="space-y-3">
                {active.map((drop) => (
                  <ListingRow
                    key={drop.id}
                    drop={drop}
                    authToken={authToken}
                    buildings={buildings}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                Past
              </h3>
              <ul className="space-y-3">
                {past.map((drop) => (
                  <ListingRow
                    key={drop.id}
                    drop={drop}
                    authToken={authToken}
                    buildings={buildings}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
