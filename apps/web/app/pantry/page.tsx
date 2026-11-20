"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Clock,
  ExternalLink,
  HandHeart,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";
import { AppShell } from "../../components/ui/AppShell";
import { AllergenCard } from "../../components/ui/AllergenCard";
import { DropPhoto } from "../../components/ui/DropPhoto";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListRowSkeleton } from "../../components/ui/Skeleton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { buildWalkingDirectionsUrl } from "../../lib/buildings";
import { decidePantryReferral, getPantryReferrals } from "../../lib/pantry-api";
import {
  buildPantryInventoryTiles,
  clampPantryQuantity,
  computeDefaultCoordinatorAcceptServings,
  describePantryListing,
  formatPantryDestinationLocation,
  formatPantryStatusLabel,
  normalizeCounts,
  PANTRY_POLL_INTERVAL_MS,
  resolveCoordinatorActionGuard,
  resolvePantryDirectionsUrl,
  groupCoordinatorReferrals,
  resolvePantryNotice,
  summarizePantryFood,
  type CoordinatorSection,
  summarizeReviewedSafetyAssertions,
  type PantryInventoryTile,
} from "../../lib/pantry-helpers";
import { formatRemainingTime } from "../../lib/time";
import {
  PANTRY_COORDINATOR_CREDENTIAL,
  type DropResponse,
  type PantryDecision,
  type PantryReferral,
  type PantryReferralsResponse,
} from "../../lib/types/api";
import { formatHostDropLocation } from "../host/host-helpers";

interface CoordinatorCardProps {
  referral: PantryReferral;
  nowIso: string;
  busyKey: string | null;
  cardError: string | null;
  onDecide: (
    referralId: string,
    decision: PantryDecision,
    servings?: number,
  ) => Promise<void>;
}

const TILE_TEST_IDS: Record<PantryInventoryTile["key"], string> = {
  available: "pantry-referral-available",
  held: "pantry-referral-held",
  picked_up: "pantry-referral-picked-up",
  pantry_held: "pantry-referral-pantry-held",
  accepted: "pantry-referral-accepted",
  pantry_transferred: "pantry-referral-transferred",
};

function statusTone(
  status: PantryReferral["status"],
): "neutral" | "success" | "warning" | "gold" {
  if (status === "handoff_confirmed" || status === "accepted") return "success";
  if (status === "requested") return "gold";
  if (status === "suggested") return "warning";
  return "neutral";
}

function readOnlyStateNote(referral: PantryReferral): string {
  const servings = (n: number) => `${n} ${n === 1 ? "serving" : "servings"}`;
  switch (referral.status) {
    case "suggested":
      return "Suggested near the deadline. The host has not sent a request yet.";
    case "accepted":
      return `${servings(referral.accepted_servings)} reserved for the pantry. Waiting for the host to confirm the simulated handoff.`;
    case "handoff_confirmed":
      return `Simulated handoff recorded for ${servings(referral.transferred_servings)}. Student pickups are unchanged.`;
    case "rejected":
      return "Declined. No servings were reserved.";
    case "expired":
      return "The pickup window ended before handoff. Untransferred servings were released and did not return to students.";
    default:
      return "";
  }
}

function formatPickupBy(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function InventoryGroup({
  title,
  tiles,
  referralId,
}: {
  title: string;
  tiles: PantryInventoryTile[];
  referralId: string;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        {title}
      </h4>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-xl bg-surface-subtle px-2 py-2"
          >
            <dd
              data-testid={`${TILE_TEST_IDS[tile.key]}-${referralId}`}
              className="text-lg font-extrabold tabular-nums"
            >
              {tile.value}
            </dd>
            <dt className="text-xs font-semibold text-ink-muted">
              {tile.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The required notice and official links, shown once per card beside its decision. */
function PolicyNotice({ referral }: { referral: PantryReferral }) {
  return (
    <div className="space-y-1 rounded-xl border border-warning/30 bg-warning-tint px-3 py-2 text-sm">
      <p
        data-testid={`pantry-referral-notice-${referral.id}`}
        className="text-warning"
      >
        {resolvePantryNotice(referral.notice)}
      </p>
      <div className="flex flex-wrap gap-x-4 text-xs font-semibold">
        <a
          data-testid={`pantry-referral-care-link-${referral.id}`}
          href={referral.destination.care_source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
        >
          Official KSU CARE Services
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        <a
          data-testid={`pantry-referral-catering-link-${referral.id}`}
          href={referral.destination.catering_policy_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
        >
          KSU Catering Policies
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function CoordinatorReferralCard({
  referral,
  nowIso,
  busyKey,
  cardError,
  onDecide,
}: CoordinatorCardProps) {
  const listing: DropResponse = referral.drop;
  const counts = normalizeCounts(referral.drop.counts);
  const currentEligible = Math.min(
    referral.eligible_servings,
    counts.available,
  );
  const defaultAccept = computeDefaultCoordinatorAcceptServings(
    referral.requested_servings,
    currentEligible,
  );

  const [acceptServings, setAcceptServings] = useState<number>(() =>
    Math.max(1, defaultAccept || 1),
  );
  const [policyAck, setPolicyAck] = useState<boolean>(false);

  // Clamp the chosen quantity down if students reserve servings while this is open.
  useEffect(() => {
    if (referral.status !== "requested") return;
    if (defaultAccept <= 0) {
      setAcceptServings(0);
      return;
    }
    setAcceptServings((prev) => {
      if (prev <= 0) return defaultAccept;
      if (prev > defaultAccept) return defaultAccept;
      return prev;
    });
  }, [defaultAccept, referral.status]);

  // An acknowledgment never carries over once the referral leaves "requested".
  useEffect(() => {
    if (referral.status !== "requested") setPolicyAck(false);
  }, [referral.status]);

  const guard = resolveCoordinatorActionGuard(
    referral,
    acceptServings,
    policyAck,
    nowIso,
  );
  const destDirectionsUrl = resolvePantryDirectionsUrl(referral.destination);
  const pickupDirectionsUrl = buildWalkingDirectionsUrl(referral.drop.building);
  const title = summarizePantryFood(referral.drop);
  const description = describePantryListing(referral.drop);
  const tiles = buildPantryInventoryTiles(
    referral.drop.counts,
    referral.accepted_servings,
  );
  const safetyAssertions = summarizeReviewedSafetyAssertions(
    referral.drop.safety_review,
  );
  const expired = guard.isExpired || referral.status === "expired";
  const isAccepting = busyKey === `${referral.id}:accept`;
  const isRejecting = busyKey === `${referral.id}:reject`;
  const clampedAccept = clampPantryQuantity(
    acceptServings,
    guard.maxAcceptable,
  );
  const quantityLine =
    referral.status === "suggested"
      ? `${currentEligible} unreserved now`
      : `${referral.requested_servings} requested · ${currentEligible} unreserved now`;

  return (
    <article
      data-testid={`pantry-referral-card-${referral.id}`}
      data-status={referral.status}
      data-drop-id={referral.drop_id}
      className="consumer-card space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <DropPhoto
          dropId={referral.drop_id}
          hasPhoto={listing.has_photo}
          photoUrl={listing.photo_url}
          authToken={PANTRY_COORDINATOR_CREDENTIAL}
          alt={title}
          aspect="4/3"
          testId={`pantry-referral-photo-${referral.id}`}
        />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span data-testid={`pantry-referral-status-${referral.id}`}>
              <StatusBadge tone={statusTone(referral.status)}>
                {formatPantryStatusLabel(referral.status)}
              </StatusBadge>
            </span>
            <p
              data-testid={`pantry-referral-deadline-${referral.id}`}
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                expired ? "text-ink-muted" : "text-ink"
              }`}
            >
              <Clock
                size={16}
                aria-hidden="true"
                className="text-owl-goldText"
              />
              {expired
                ? "Pickup window ended"
                : `By ${formatPickupBy(referral.expires_at)} · ${formatRemainingTime(referral.expires_at, nowIso)} left`}
            </p>
          </div>
          <h3
            data-testid={`pantry-referral-food-${referral.id}`}
            className="break-words text-xl font-extrabold tracking-tight"
          >
            {title}
          </h3>
          <p
            data-testid={`pantry-referral-description-${referral.id}`}
            className="break-words text-sm text-ink-muted"
          >
            {description}
          </p>
          <p
            data-testid={`pantry-referral-quantity-${referral.id}`}
            className="text-sm font-semibold"
          >
            <span
              data-testid={`pantry-referral-requested-${referral.id}`}
              data-value={referral.requested_servings}
              className="sr-only"
            >
              {referral.requested_servings}
            </span>
            <span
              data-testid={`pantry-referral-eligible-${referral.id}`}
              data-value={currentEligible}
              className="sr-only"
            >
              {currentEligible}
            </span>
            {quantityLine}
          </p>
          <p
            data-testid={`pantry-referral-pickup-${referral.id}`}
            className="flex items-start gap-1.5 text-sm font-semibold"
          >
            <MapPin
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-owl-goldText"
            />
            <span className="min-w-0 break-words">
              {formatHostDropLocation(referral.drop, [])}
            </span>
          </p>
          {referral.drop.pickup_instructions?.trim() && (
            <p
              data-testid={`pantry-referral-instructions-${referral.id}`}
              className="break-words text-sm text-ink-muted"
            >
              {referral.drop.pickup_instructions.trim()}
            </p>
          )}
          <p
            data-testid={`pantry-referral-destination-${referral.id}`}
            className="flex items-start gap-1.5 text-sm text-ink-muted"
          >
            <HandHeart
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-owl-goldText"
            />
            <span className="min-w-0 break-words">
              To {referral.destination.name},{" "}
              {formatPantryDestinationLocation(referral.destination)}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 text-sm font-semibold">
            {pickupDirectionsUrl && (
              <a
                data-testid={`pantry-referral-pickup-directions-${referral.id}`}
                href={pickupDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-owl-goldText underline-offset-4 hover:underline"
              >
                <Navigation size={14} aria-hidden="true" />
                Directions to pickup
              </a>
            )}
            {destDirectionsUrl && (
              <a
                data-testid={`pantry-referral-directions-${referral.id}`}
                href={destDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-owl-goldText underline-offset-4 hover:underline"
              >
                <Navigation size={14} aria-hidden="true" />
                Directions to pantry
              </a>
            )}
          </div>
        </div>
      </div>

      <div
        data-testid={`pantry-referral-counts-${referral.id}`}
        className="grid gap-3 md:grid-cols-2"
      >
        <InventoryGroup
          title="Students"
          tiles={tiles.filter((t) => t.group === "student")}
          referralId={referral.id}
        />
        <InventoryGroup
          title="Pantry (simulated)"
          tiles={tiles.filter((t) => t.group === "pantry")}
          referralId={referral.id}
        />
      </div>

      <div className="space-y-2">
        <div
          data-testid={`pantry-referral-safety-${referral.id}`}
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span className="font-bold text-ink-muted">
            Host assertions (not certified):
          </span>
          {safetyAssertions.length > 0 ? (
            safetyAssertions.map((item) => (
              <span
                key={item.key}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                  item.confirmed
                    ? "bg-success-tint text-success"
                    : "bg-surface-subtle text-ink-muted"
                }`}
              >
                {item.confirmed && <Check size={12} aria-hidden="true" />}
                {item.label}
              </span>
            ))
          ) : (
            <span className="text-ink-muted">none recorded</span>
          )}
        </div>
        <AllergenCard
          allergens={referral.drop.allergens_final}
          notice={referral.drop.allergen_notice}
          title="Estimated allergens"
          compact={true}
        />
        {referral.drop.diet_tags_final.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {referral.drop.diet_tags_final.map((diet) => (
              <StatusBadge key={diet}>{diet.replaceAll("_", " ")}</StatusBadge>
            ))}
          </div>
        )}
      </div>

      {cardError && (
        <p
          role="alert"
          data-testid={`pantry-referral-error-${referral.id}`}
          className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          {cardError}
        </p>
      )}

      {referral.status === "requested" ? (
        <div className="space-y-3 rounded-2xl border border-line p-4">
          {guard.staleReason && (
            <p
              data-testid={`pantry-referral-guard-${referral.id}`}
              className="rounded-xl bg-warning-tint px-3 py-2 text-sm text-warning"
            >
              {guard.staleReason}
            </p>
          )}
          <PolicyNotice referral={referral} />

          {!guard.isExpired && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label
                  htmlFor={`pantry-accept-servings-${referral.id}`}
                  className="text-sm font-bold"
                >
                  Servings to accept (max {guard.maxAcceptable})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Fewer servings"
                    data-testid={`pantry-accept-decrement-${referral.id}`}
                    disabled={
                      busyKey !== null ||
                      guard.maxAcceptable <= 0 ||
                      clampedAccept <= 1
                    }
                    onClick={() =>
                      setAcceptServings((s) =>
                        clampPantryQuantity(s - 1, guard.maxAcceptable),
                      )
                    }
                    className="consumer-button-secondary h-11 min-h-11 w-11 px-0"
                  >
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <input
                    id={`pantry-accept-servings-${referral.id}`}
                    data-testid={`pantry-accept-servings-${referral.id}`}
                    type="number"
                    inputMode="numeric"
                    min={guard.maxAcceptable > 0 ? 1 : 0}
                    max={guard.maxAcceptable}
                    disabled={busyKey !== null || guard.maxAcceptable <= 0}
                    value={guard.maxAcceptable > 0 ? clampedAccept : 0}
                    onChange={(e) =>
                      setAcceptServings(
                        clampPantryQuantity(
                          Number(e.target.value),
                          guard.maxAcceptable,
                        ),
                      )
                    }
                    className="consumer-input min-h-11 w-20 px-2 text-center font-extrabold"
                  />
                  <button
                    type="button"
                    aria-label="More servings"
                    data-testid={`pantry-accept-increment-${referral.id}`}
                    disabled={
                      busyKey !== null ||
                      guard.maxAcceptable <= 0 ||
                      clampedAccept >= guard.maxAcceptable
                    }
                    onClick={() =>
                      setAcceptServings((s) =>
                        clampPantryQuantity(s + 1, guard.maxAcceptable),
                      )
                    }
                    className="consumer-button-secondary h-11 min-h-11 w-11 px-0"
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  data-testid={`pantry-policy-ack-${referral.id}`}
                  checked={policyAck}
                  onChange={(e) => setPolicyAck(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-owl-gold"
                />
                <span>
                  I understand this is a <strong>demo simulation only</strong>.
                  No real KSU CARE acceptance or authorization occurs, and this
                  does not waive KSU catering policy.
                </span>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid={`pantry-accept-button-${referral.id}`}
                  disabled={busyKey !== null || !guard.canAccept}
                  onClick={() =>
                    void onDecide(referral.id, "accept", clampedAccept)
                  }
                  className="consumer-button w-full"
                >
                  {isAccepting
                    ? "Accepting…"
                    : `Accept ${guard.maxAcceptable > 0 ? clampedAccept : 0} servings`}
                </button>
                <button
                  type="button"
                  data-testid={`pantry-reject-button-${referral.id}`}
                  disabled={busyKey !== null || !guard.canReject}
                  onClick={() => void onDecide(referral.id, "reject")}
                  className="consumer-button-secondary w-full"
                >
                  {isRejecting ? "Declining…" : "Decline"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p
            data-testid={`pantry-referral-state-note-${referral.id}`}
            className="rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink-muted"
          >
            {readOnlyStateNote(referral)}
          </p>
          <PolicyNotice referral={referral} />
        </div>
      )}
    </article>
  );
}

function CoordinatorSectionList({
  section,
  nowIso,
  busyKey,
  cardErrors,
  onDecide,
}: {
  section: CoordinatorSection;
  nowIso: string;
  busyKey: string | null;
  cardErrors: Record<string, string>;
  onDecide: CoordinatorCardProps["onDecide"];
}) {
  const headingId = `pantry-section-${section.key}-heading`;
  return (
    <section
      data-testid={`pantry-section-${section.key}`}
      aria-labelledby={headingId}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg font-extrabold">
          {section.title}{" "}
          <span
            data-testid={`pantry-section-count-${section.key}`}
            className="tabular-nums text-ink-muted"
          >
            ({section.referrals.length})
          </span>
        </h2>
        <p className="text-sm text-ink-muted">{section.description}</p>
      </div>
      {section.referrals.length === 0 ? (
        <p
          data-testid={`pantry-section-empty-${section.key}`}
          className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-muted"
        >
          {section.emptyText}
        </p>
      ) : (
        <div className="space-y-4">
          {section.referrals.map((referral) => (
            <CoordinatorReferralCard
              key={referral.id}
              referral={referral}
              nowIso={nowIso}
              busyKey={busyKey}
              cardError={cardErrors[referral.id] ?? null}
              onDecide={onDecide}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function PantryCoordinatorPage() {
  const [data, setData] = useState<PantryReferralsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const serverOffsetMsRef = useRef<number>(0);

  const loadReferrals = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await getPantryReferrals();
      setData(res.data);
      setPageError(null);
      const parsedServer = Date.parse(res.data.server_time);
      if (Number.isFinite(parsedServer)) {
        serverOffsetMsRef.current = parsedServer - Date.now();
      }
    } catch (err) {
      setPageError(
        err instanceof Error && err.message
          ? err.message
          : "Could not load donation requests.",
      );
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferrals(true);
    const pollTimer = setInterval(
      () => void loadReferrals(false),
      PANTRY_POLL_INTERVAL_MS,
    );
    const clockTimer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [loadReferrals]);

  const handleDecide = async (
    referralId: string,
    decision: PantryDecision,
    servings?: number,
  ) => {
    setBusyKey(`${referralId}:${decision}`);
    setStatusMessage(null);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[referralId];
      return next;
    });
    try {
      await decidePantryReferral(referralId, {
        decision,
        servings: decision === "accept" ? servings : undefined,
        demo_policy_acknowledged: true,
      });
      await loadReferrals(false);
      setStatusMessage(
        decision === "accept"
          ? `Simulated acceptance recorded for ${servings ?? 0} ${
              servings === 1 ? "serving" : "servings"
            }.`
          : "Request declined. No servings were reserved.",
      );
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [referralId]:
          err instanceof Error && err.message
            ? err.message
            : "Could not save your decision.",
      }));
      // Refresh right away so stale stock or an expired deadline shows up.
      await loadReferrals(false);
    } finally {
      setBusyKey(null);
    }
  };

  const referrals = data?.referrals ?? [];
  const sections = groupCoordinatorReferrals(referrals);
  const serverAlignedNowIso = new Date(
    nowMs + serverOffsetMsRef.current,
  ).toISOString();

  return (
    <AppShell variant="pantry" maxWidth="lg">
      <div data-testid="pantry-coordinator-page" className="space-y-6">
        <header
          data-testid="pantry-header"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                Pantry donations
              </h1>
              <StatusBadge tone="warning">Simulated</StatusBadge>
            </div>
            <p className="text-sm text-ink-muted">
              Leftover food hosts have offered to the campus pantry.
            </p>
          </div>
          <button
            type="button"
            data-testid="pantry-refresh-button"
            disabled={busyKey !== null}
            onClick={() => void loadReferrals(false)}
            className="consumer-button-secondary min-h-11 px-4 text-xs"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </header>

        {statusMessage && (
          <p
            role="status"
            data-testid="pantry-status-message"
            className="rounded-2xl bg-success-tint px-4 py-3 text-sm text-success"
          >
            {statusMessage}
          </p>
        )}
        {pageError && (
          <p
            role="alert"
            data-testid="pantry-error"
            className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
          >
            {pageError}
          </p>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <ListRowSkeleton />
            <ListRowSkeleton />
          </div>
        ) : referrals.length === 0 ? (
          <EmptyState
            testId="pantry-empty-state"
            icon={<UtensilsCrossed size={28} aria-hidden="true" />}
            title="No donation requests yet"
            description="When a host offers leftover food to the pantry, it will appear here."
          />
        ) : (
          <div data-testid="pantry-referrals-list" className="space-y-8">
            {sections.map((section) => (
              <CoordinatorSectionList
                key={section.key}
                section={section}
                nowIso={serverAlignedNowIso}
                busyKey={busyKey}
                cardErrors={cardErrors}
                onDecide={handleDecide}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
