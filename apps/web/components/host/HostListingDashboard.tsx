"use client";

import React from "react";
import {
  Bell,
  Clock,
  ExternalLink,
  LayoutList,
  MapPin,
  Monitor,
  Plus,
} from "lucide-react";
import { DropPhoto } from "../ui/DropPhoto";
import { AllergenCard } from "../ui/AllergenCard";
import { StatusBadge } from "../ui/StatusBadge";
import { PushOptIn } from "../PushOptIn";
import { HostPantryCard } from "../HostPantryCard";
import { HostPickupReviewQueue } from "./HostPickupReviewQueue";
import type { PushState } from "../../lib/push";
import type {
  Building,
  DropResponse,
  HostPantryReferralResponse,
  HostPickupReview,
} from "../../lib/types/api";
import { formatRemainingTime } from "../../lib/time";
import {
  formatHostCounts,
  formatHostDropLocation,
  formatHostStatusLabel,
  hostStatusTone,
  summarizeHostListing,
} from "../../app/host/host-helpers";

interface HostListingDashboardProps {
  drop: DropResponse;
  authToken: string;
  buildings: ReadonlyArray<Building>;
  nowIso: string;
  pickupReviews: ReadonlyArray<HostPickupReview>;
  reviewError: string | null;
  busyAction: string | null;
  onDecideReview: (id: string, decision: "approve" | "reject") => void;
  pantryData: HostPantryReferralResponse | null;
  pantryError: string | null;
  onRequestReferral: (servings: number) => Promise<void>;
  onConfirmHandoff: () => Promise<void>;
  pushState: PushState;
  onEnablePush: () => void;
  onDisablePush: () => void;
  companionUrl: string | null;
  onShareAnother: () => void;
  onOpenListings: () => void;
}

function CountTile({
  testId,
  value,
  label,
  tone,
}: {
  testId: string;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-subtle px-3 py-4 text-center">
      <div
        data-testid={testId}
        className={`text-3xl font-extrabold tabular-nums ${tone}`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-ink-muted">{label}</div>
    </div>
  );
}

/**
 * Step 3: the published listing. Hosts see aggregate counts only; student holds and
 * pickups are kept apart from simulated pantry allocations, and no student is named.
 */
export function HostListingDashboard({
  drop,
  authToken,
  buildings,
  nowIso,
  pickupReviews,
  reviewError,
  busyAction,
  onDecideReview,
  pantryData,
  pantryError,
  onRequestReferral,
  onConfirmHandoff,
  pushState,
  onEnablePush,
  onDisablePush,
  companionUrl,
  onShareAnother,
  onOpenListings,
}: HostListingDashboardProps) {
  const counts = formatHostCounts(drop.counts);
  const title = summarizeHostListing(drop);
  const ended = drop.status === "expired";

  return (
    <section data-testid="host-drop-panel" className="space-y-5">
      <div className="consumer-card space-y-4">
        <DropPhoto
          dropId={drop.id}
          hasPhoto={drop.has_photo}
          photoUrl={drop.photo_url}
          authToken={authToken}
          alt={title}
          aspect="hero"
          testId="host-listing-photo"
          overlayTopLeft={
            <span data-testid="host-drop-status" data-status={drop.status}>
              <StatusBadge tone={hostStatusTone(drop.status)}>
                {formatHostStatusLabel(drop.status)}
              </StatusBadge>
            </span>
          }
        />
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
          <p
            data-testid="host-drop-location"
            className="flex items-center gap-1.5 text-sm text-ink-muted"
          >
            <MapPin size={16} aria-hidden="true" className="shrink-0" />
            {formatHostDropLocation(drop, buildings)}
          </p>
          {drop.pickup_instructions?.trim() && (
            <p
              data-testid="host-pickup-instructions"
              className="text-sm text-ink-muted"
            >
              {drop.pickup_instructions.trim()}
            </p>
          )}
          <p
            data-testid="host-countdown"
            className="flex items-center gap-1.5 text-sm font-semibold"
          >
            <Clock
              size={16}
              aria-hidden="true"
              className="shrink-0 text-owl-goldText"
            />
            {ended
              ? "This listing has ended"
              : `Ends in ${formatRemainingTime(drop.expires_at, nowIso)}`}
          </p>
        </div>
      </div>

      <div className="consumer-card space-y-4">
        <div>
          <h3 className="text-lg font-extrabold">Students</h3>
          <p className="text-sm text-ink-muted">
            Totals only. You never see who reserved.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <CountTile
            testId="host-count-available"
            value={counts.available}
            label="Available"
            tone="text-success"
          />
          <CountTile
            testId="host-count-held"
            value={counts.held}
            label="Reservations"
            tone="text-owl-goldText"
          />
          <CountTile
            testId="host-count-picked-up"
            value={counts.pickedUp}
            label="Completed pickups"
            tone="text-ink"
          />
        </div>
        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-bold">Pantry (simulated)</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <CountTile
              testId="host-count-pantry-held"
              value={counts.pantryHeld}
              label="Pantry reserved"
              tone="text-ink"
            />
            <CountTile
              testId="host-count-pantry-transferred"
              value={counts.pantryTransferred}
              label="Pantry transfers"
              tone="text-ink"
            />
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          <span data-testid="host-count-total">{counts.total}</span> servings
          listed in total.
        </p>
      </div>

      <div
        data-testid="host-pickup-display-card"
        className="consumer-card space-y-3"
      >
        <div className="flex items-center gap-2">
          <Monitor
            size={18}
            aria-hidden="true"
            className="shrink-0 text-owl-goldText"
          />
          <h3 className="text-lg font-extrabold">Pickup display</h3>
        </div>
        <p className="text-sm text-ink-muted">
          {companionUrl
            ? "Shows how many servings are left on a screen at the pickup table."
            : "The pickup display isn't connected yet."}
        </p>
        {companionUrl ? (
          <a
            data-testid="open-pickup-companion"
            href={companionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="consumer-button-secondary w-full"
          >
            <Monitor size={16} aria-hidden="true" />
            Open pickup display
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        ) : (
          <button
            type="button"
            data-testid="open-pickup-companion"
            disabled
            className="consumer-button-secondary w-full"
          >
            <Monitor size={16} aria-hidden="true" />
            Open pickup display
          </button>
        )}
      </div>

      <HostPickupReviewQueue
        reviews={pickupReviews}
        nowIso={nowIso}
        busyAction={busyAction}
        error={reviewError}
        onDecide={onDecideReview}
      />

      <div className="consumer-card space-y-3">
        <div className="flex items-center gap-2">
          <Bell size={18} aria-hidden="true" className="text-owl-goldText" />
          <h3 className="text-lg font-extrabold">Pickup notifications</h3>
        </div>
        <p className="text-sm text-ink-muted">
          Get a quiet update when a serving is collected.
        </p>
        <PushOptIn
          role="host"
          state={pushState}
          onEnable={onEnablePush}
          onDisable={onDisablePush}
        />
      </div>

      <div className="consumer-card space-y-4">
        <h3 className="text-lg font-extrabold">Food details</h3>
        <AllergenCard
          allergens={drop.allergens_final}
          notice={drop.allergen_notice}
          title="Allergens"
          compact={true}
        />
        {drop.diet_tags_final.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {drop.diet_tags_final.map((diet) => (
              <StatusBadge key={diet}>{diet.replaceAll("_", " ")}</StatusBadge>
            ))}
          </div>
        )}
      </div>

      <HostPantryCard
        drop={drop}
        pantryData={pantryData}
        pantryError={pantryError}
        busyAction={busyAction}
        nowIso={nowIso}
        onRequestReferral={onRequestReferral}
        onConfirmHandoff={onConfirmHandoff}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-testid="share-another-drop-button"
          onClick={onShareAnother}
          className="consumer-button w-full"
        >
          <Plus size={18} aria-hidden="true" />
          Share another listing
        </button>
        <button
          type="button"
          data-testid="host-open-listings-button"
          onClick={onOpenListings}
          className="consumer-button-secondary w-full"
        >
          <LayoutList size={18} aria-hidden="true" />
          My listings
        </button>
      </div>
    </section>
  );
}
