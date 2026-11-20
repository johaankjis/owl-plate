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
  formatPantryDestinationLocation,
  formatPantryStatusLabel,
  normalizeCounts,
  PANTRY_POLL_INTERVAL_MS,
  resolveCoordinatorActionGuard,
  resolvePantryDirectionsUrl,
  resolvePantryNotice,
  resolvePantryOfficialLinks,
  summarizePantryFood,
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
  switch (referral.status) {
    case "suggested":
      return "Suggested near the deadline. Waiting for the host to request a demo referral.";
    case "accepted":
      return `Reserved ${referral.accepted_servings} ${
        referral.accepted_servings === 1 ? "serving" : "servings"
      } for the pantry, separate from student pickups. Waiting for the host to confirm the simulated handoff before the deadline.`;
    case "handoff_confirmed":
      return `Simulated handoff confirmed for ${referral.transferred_servings} ${
        referral.transferred_servings === 1 ? "serving" : "servings"
      }. Recorded as pantry transfers without affecting student pickups.`;
    case "rejected":
      return "Declined. No servings were reserved for the pantry.";
    case "expired":
      return "The pickup deadline passed before handoff. Any untransferred pantry servings were released and did not return to students.";
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
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        {title}
      </h4>
      <div className="grid grid-cols-3 gap-2 text-center">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-2xl bg-surface-subtle px-2 py-3"
          >
            <div
              data-testid={`${TILE_TEST_IDS[tile.key]}-${referralId}`}
              className="text-xl font-extrabold tabular-nums"
            >
              {tile.value}
            </div>
            <div className="text-xs font-semibold text-ink-muted">
              {tile.label}
            </div>
          </div>
        ))}
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
  // Additive photo fields arrive on the regenerated contract; read them via the shared type.
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
  const notice = resolvePantryNotice(referral.notice);
  const destDirectionsUrl = resolvePantryDirectionsUrl(referral.destination);
  const pickupDirectionsUrl = buildWalkingDirectionsUrl(referral.drop.building);
  const title = summarizePantryFood(referral.drop);
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

  return (
    <article
      data-testid={`pantry-referral-card-${referral.id}`}
      data-status={referral.status}
      data-drop-id={referral.drop_id}
      className="consumer-card space-y-5"
    >
      <DropPhoto
        dropId={referral.drop_id}
        hasPhoto={listing.has_photo}
        photoUrl={listing.photo_url}
        authToken={PANTRY_COORDINATOR_CREDENTIAL}
        alt={title}
        aspect="16/10"
        testId={`pantry-referral-photo-${referral.id}`}
        overlayTopLeft={
          <span data-testid={`pantry-referral-status-${referral.id}`}>
            <StatusBadge tone={statusTone(referral.status)}>
              {formatPantryStatusLabel(referral.status)}
            </StatusBadge>
          </span>
        }
      />

      <div className="space-y-2">
        <h3
          data-testid={`pantry-referral-food-${referral.id}`}
          className="text-xl font-extrabold tracking-tight"
        >
          {title}
        </h3>
        <p className="text-sm text-ink-muted">
          <strong
            data-testid={`pantry-referral-requested-${referral.id}`}
            className="text-ink"
          >
            {referral.requested_servings}
          </strong>{" "}
          servings requested · up to{" "}
          <strong
            data-testid={`pantry-referral-eligible-${referral.id}`}
            className="text-ink"
          >
            {currentEligible}
          </strong>{" "}
          unreserved right now
        </p>
        <p
          data-testid={`pantry-referral-deadline-${referral.id}`}
          className={`flex items-center gap-1.5 text-sm font-semibold ${
            expired ? "text-ink-muted" : "text-ink"
          }`}
        >
          <Clock size={16} aria-hidden="true" className="text-owl-goldText" />
          {expired
            ? "Pickup window ended"
            : `Pick up by ${formatPickupBy(referral.expires_at)} · ${formatRemainingTime(referral.expires_at, nowIso)} left`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-2xl bg-surface-subtle p-4 text-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Pick up from host
          </div>
          <p
            data-testid={`pantry-referral-pickup-${referral.id}`}
            className="flex items-start gap-1.5 font-semibold"
          >
            <MapPin
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-owl-goldText"
            />
            {formatHostDropLocation(referral.drop, [])}
          </p>
          <p
            data-testid={`pantry-referral-instructions-${referral.id}`}
            className="text-ink-muted"
          >
            {referral.drop.pickup_instructions?.trim() ||
              "No extra pickup instructions."}
          </p>
          {pickupDirectionsUrl && (
            <a
              data-testid={`pantry-referral-pickup-directions-${referral.id}`}
              href={pickupDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-owl-goldText underline-offset-4 hover:underline"
            >
              <Navigation size={14} aria-hidden="true" />
              Walking directions to pickup
            </a>
          )}
        </div>

        <div className="space-y-1.5 rounded-2xl bg-surface-subtle p-4 text-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Deliver to (demo destination)
          </div>
          <p
            data-testid={`pantry-referral-destination-${referral.id}`}
            className="flex items-start gap-1.5 font-semibold"
          >
            <HandHeart
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-owl-goldText"
            />
            {referral.destination.name} —{" "}
            {formatPantryDestinationLocation(referral.destination)}
          </p>
          {destDirectionsUrl && (
            <a
              data-testid={`pantry-referral-directions-${referral.id}`}
              href={destDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-owl-goldText underline-offset-4 hover:underline"
            >
              <Navigation size={14} aria-hidden="true" />
              Walking directions to the pantry
            </a>
          )}
        </div>
      </div>

      <div
        data-testid={`pantry-referral-counts-${referral.id}`}
        className="space-y-4"
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

      <div className="space-y-3">
        <div
          data-testid={`pantry-referral-safety-${referral.id}`}
          className="space-y-2"
        >
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Host safety checklist (host assertions, not certified)
          </h4>
          {safetyAssertions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {safetyAssertions.map((item) => (
                <li
                  key={item.key}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${
                    item.confirmed
                      ? "bg-success-tint text-success"
                      : "bg-surface-subtle text-ink-muted"
                  }`}
                >
                  {item.confirmed && <Check size={12} aria-hidden="true" />}
                  {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              No host checklist was recorded.
            </p>
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

      <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning-tint px-4 py-3 text-sm">
        <p
          data-testid={`pantry-referral-notice-${referral.id}`}
          className="text-warning"
        >
          {notice}
        </p>
        <div className="flex flex-wrap gap-x-4 text-xs font-semibold">
          <a
            href={referral.destination.care_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
          >
            Official KSU CARE Services
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a
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
        <div className="space-y-4 rounded-2xl border border-line p-4">
          {guard.staleReason && (
            <p
              data-testid={`pantry-referral-guard-${referral.id}`}
              className="rounded-xl bg-warning-tint px-3 py-2 text-sm text-warning"
            >
              {guard.staleReason}
            </p>
          )}

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
        <p
          data-testid={`pantry-referral-state-note-${referral.id}`}
          className="rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink-muted"
        >
          {readOnlyStateNote(referral)}
        </p>
      )}
    </article>
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
            }. The host can now confirm the simulated handoff.`
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
  const firstReferral = referrals[0] ?? null;
  const pageNotice = resolvePantryNotice(firstReferral?.notice);
  const officialLinks = resolvePantryOfficialLinks(
    firstReferral?.destination ?? null,
  );
  const serverAlignedNowIso = new Date(
    nowMs + serverOffsetMsRef.current,
  ).toISOString();

  return (
    <AppShell variant="pantry" maxWidth="lg">
      <div data-testid="pantry-coordinator-page" className="space-y-5">
        <section
          data-testid="pantry-demo-banner"
          className="consumer-card space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                Pantry donations
              </h1>
              <StatusBadge tone="warning">Simulation only</StatusBadge>
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
          </div>
          <p className="text-sm text-ink-muted">
            Review leftover food hosts have offered to the campus pantry.
          </p>
          <p
            data-testid="pantry-page-notice"
            className="rounded-2xl border border-warning/30 bg-warning-tint px-4 py-3 text-sm text-warning"
          >
            {pageNotice}
          </p>
          <div className="flex flex-wrap gap-x-4 text-xs font-semibold">
            <a
              data-testid="pantry-page-care-link"
              href={officialLinks.careSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
            >
              Official KSU CARE Services
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <a
              data-testid="pantry-page-catering-link"
              href={officialLinks.cateringPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
            >
              KSU Catering Policies
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </section>

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

        <section className="space-y-4" aria-label="Donation requests">
          <h2 className="text-lg font-extrabold">
            Requests ({referrals.length})
          </h2>
          {loading ? (
            <div className="space-y-3">
              <ListRowSkeleton />
              <ListRowSkeleton />
            </div>
          ) : referrals.length === 0 ? (
            <EmptyState
              testId="pantry-empty-state"
              icon={<HandHeart size={28} aria-hidden="true" />}
              title="No donation requests yet"
              description="When a host offers leftover food to the pantry, it will appear here."
            />
          ) : (
            <div data-testid="pantry-referrals-list" className="space-y-5">
              {referrals.map((referral) => (
                <CoordinatorReferralCard
                  key={referral.id}
                  referral={referral}
                  nowIso={serverAlignedNowIso}
                  busyKey={busyKey}
                  cardError={cardErrors[referral.id] ?? null}
                  onDecide={handleDecide}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
