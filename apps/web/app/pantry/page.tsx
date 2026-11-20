"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import type { DataSourceMode } from "../../lib/api-client";
import { buildWalkingDirectionsUrl } from "../../lib/buildings";
import {
  decidePantryReferral,
  getPantryReferrals,
  INITIAL_PANTRY_DATA_SOURCE,
} from "../../lib/pantry-api";
import {
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
  summarizeReviewedSafetyAssertions,
} from "../../lib/pantry-helpers";
import { formatRemainingTime } from "../../lib/time";
import type {
  PantryDecision,
  PantryReferral,
  PantryReferralsResponse,
} from "../../lib/types/api";
import {
  formatHostDropLocation,
  getVisionSourceLabel,
} from "../host/host-helpers";

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

function statusPillClasses(status: PantryReferral["status"]): string {
  switch (status) {
    case "handoff_confirmed":
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
    case "accepted":
      return "border-purple-400/50 bg-purple-500/20 text-purple-200";
    case "requested":
      return "border-sky-400/40 bg-sky-500/15 text-sky-200";
    case "suggested":
      return "border-owl-gold/50 bg-owl-gold/15 text-owl-gold";
    case "rejected":
    case "expired":
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
}

function readOnlyStateNote(referral: PantryReferral): string {
  switch (referral.status) {
    case "suggested":
      return "Suggested for host review (within 10 minutes of deadline). Waiting for the host to explicitly submit a demo referral request.";
    case "accepted":
      return `Reserved ${referral.accepted_servings} ${
        referral.accepted_servings === 1 ? "serving" : "servings"
      } in Pantry reserved (separate from student pickups). Waiting for the host to confirm simulated handoff before the drop deadline.`;
    case "handoff_confirmed":
      return `Simulated handoff confirmed for ${referral.transferred_servings} ${
        referral.transferred_servings === 1 ? "serving" : "servings"
      }. Recorded in Pantry transfers without affecting student pickups.`;
    case "rejected":
      return "Rejected by demo coordinator. No servings were reserved for the pantry.";
    case "expired":
      return "Drop deadline passed before transfer. Any untransferred pantry allocation was released on the expired drop and did not reenter the student feed.";
    default:
      return "";
  }
}

function CoordinatorReferralCard({
  referral,
  nowIso,
  busyKey,
  cardError,
  onDecide,
}: CoordinatorCardProps) {
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

  // Auto-clamp selected accept quantity downward if eligible stock decreases during polling
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

  // Clear acknowledgment when card leaves requested state
  useEffect(() => {
    if (referral.status !== "requested") {
      setPolicyAck(false);
    }
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
  const pickupLocation = formatHostDropLocation(referral.drop, []);
  const remainingText = formatRemainingTime(referral.expires_at, nowIso);
  const safetyAssertions = summarizeReviewedSafetyAssertions(
    referral.drop.safety_review,
  );
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
      className="space-y-4 rounded-2xl border border-zinc-800 bg-owl-slate p-5 shadow-lg"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid={`pantry-referral-status-${referral.id}`}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase ${statusPillClasses(
                referral.status,
              )}`}
            >
              {formatPantryStatusLabel(referral.status)}
            </span>
            <span className="rounded-full border border-zinc-700 bg-owl-black px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
              {getVisionSourceLabel(referral.drop.vision_source)}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Referral ID:{" "}
            <span className="font-mono text-zinc-300">
              {referral.id.slice(0, 8)}
            </span>
            {" · "}Drop status:{" "}
            <span className="font-semibold uppercase text-zinc-200">
              {referral.drop.status}
            </span>
          </p>
        </div>

        <span
          data-testid={`pantry-referral-deadline-${referral.id}`}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            guard.isExpired || referral.status === "expired"
              ? "border border-zinc-700 bg-zinc-900 text-zinc-400"
              : "border border-owl-gold/40 bg-owl-black text-owl-gold"
          }`}
        >
          Deadline: {remainingText}
        </span>
      </div>

      {/* Food Items */}
      <div
        data-testid={`pantry-referral-food-${referral.id}`}
        className="space-y-1.5 rounded-xl border border-zinc-800 bg-owl-black/60 p-3.5"
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
          Estimated food items
        </div>
        <ul className="space-y-1 text-sm text-white">
          {referral.drop.vision.items.map((item, idx) => (
            <li
              key={`${item.name}-${idx}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-semibold">{item.name}</span>
              <span className="text-xs text-zinc-400">
                ~{item.count_estimate} {item.portion_unit}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Quantities & Distinct Drop Counts */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-owl-black/60 px-2.5 py-2">
            <div
              data-testid={`pantry-referral-requested-${referral.id}`}
              className="text-lg font-extrabold text-sky-300"
            >
              {referral.requested_servings}
            </div>
            <div className="text-[11px] font-semibold text-zinc-400">
              Requested
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-owl-black/60 px-2.5 py-2">
            <div
              data-testid={`pantry-referral-eligible-${referral.id}`}
              className="text-lg font-extrabold text-emerald-400"
            >
              {currentEligible}
            </div>
            <div className="text-[11px] font-semibold text-zinc-400">
              Current eligible
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-owl-black/60 px-2.5 py-2">
            <div
              data-testid={`pantry-referral-accepted-${referral.id}`}
              className="text-lg font-extrabold text-purple-300"
            >
              {referral.accepted_servings}
            </div>
            <div className="text-[11px] font-semibold text-zinc-400">
              Pantry reserved
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-owl-black/60 px-2.5 py-2">
            <div
              data-testid={`pantry-referral-transferred-${referral.id}`}
              className="text-lg font-extrabold text-fuchsia-300"
            >
              {referral.transferred_servings}
            </div>
            <div className="text-[11px] font-semibold text-zinc-400">
              Pantry transfers
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">
          Drop counts (student vs pantry kept separate):{" "}
          <strong className="text-emerald-300">{counts.available}</strong>{" "}
          available · <strong className="text-amber-300">{counts.held}</strong>{" "}
          student held ·{" "}
          <strong className="text-sky-300">{counts.picked_up}</strong> student
          pickups ·{" "}
          <strong className="text-purple-300">{counts.pantry_held}</strong>{" "}
          pantry reserved ·{" "}
          <strong className="text-fuchsia-300">
            {counts.pantry_transferred}
          </strong>{" "}
          pantry transfers ·{" "}
          <strong className="text-white">{counts.total}</strong> total
        </p>
      </div>

      {/* Pickup Location & Pantry Destination */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-owl-black/60 p-3 text-xs">
          <div className="font-bold uppercase tracking-wide text-zinc-400">
            Host pickup location
          </div>
          <div
            data-testid={`pantry-referral-pickup-${referral.id}`}
            className="font-semibold text-white"
          >
            {pickupLocation}
          </div>
          {referral.drop.pickup_instructions?.trim() ? (
            <p
              data-testid={`pantry-referral-instructions-${referral.id}`}
              className="text-zinc-300"
            >
              Instructions: {referral.drop.pickup_instructions.trim()}
            </p>
          ) : (
            <p
              data-testid={`pantry-referral-instructions-${referral.id}`}
              className="text-zinc-500"
            >
              No extra pickup instructions provided.
            </p>
          )}
          {pickupDirectionsUrl && (
            <a
              href={pickupDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center font-semibold text-owl-gold underline-offset-4 hover:underline"
            >
              Walking directions to pickup &rarr;
            </a>
          )}
        </div>

        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-owl-black/60 p-3 text-xs">
          <div className="font-bold uppercase tracking-wide text-zinc-400">
            Demo destination
          </div>
          <div
            data-testid={`pantry-referral-destination-${referral.id}`}
            className="font-semibold text-white"
          >
            {referral.destination.name} —{" "}
            {formatPantryDestinationLocation(referral.destination)}
          </div>
          {destDirectionsUrl && (
            <a
              data-testid={`pantry-referral-directions-${referral.id}`}
              href={destDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center font-semibold text-owl-gold underline-offset-4 hover:underline"
            >
              Walking directions to JMW Room 184 &rarr;
            </a>
          )}
        </div>
      </div>

      {/* Host-Reviewed Safety Assertions & Allergen Estimates */}
      <div className="space-y-3 rounded-xl border border-zinc-800 bg-owl-black/60 p-3.5">
        <div
          data-testid={`pantry-referral-safety-${referral.id}`}
          className="space-y-1.5"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Host-reviewed safety checklist (assertions only — not certified)
          </div>
          {safetyAssertions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 text-[11px]">
              {safetyAssertions.map((item) => (
                <li
                  key={item.key}
                  className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                    item.confirmed
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {item.confirmed ? "✓ " : "○ "}
                  {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-400">
              No host safety checklist assertions recorded.
            </p>
          )}
        </div>

        <AllergenListDisplay
          allergens={referral.drop.allergens_final}
          notice={referral.drop.allergen_notice}
          title="Estimated allergens"
          compact={true}
        />

        {referral.drop.diet_tags_final.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-zinc-400">Host diet tags:</span>
            {referral.drop.diet_tags_final.map((diet) => (
              <span
                key={diet}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200"
              >
                {diet.replace("_", " ")}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Verbatim Server Policy Notice */}
      <p
        data-testid={`pantry-referral-notice-${referral.id}`}
        className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 text-xs leading-relaxed text-amber-100"
      >
        {notice}
      </p>

      <div className="flex flex-wrap gap-4 text-xs">
        <a
          href={referral.destination.care_source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-owl-gold underline underline-offset-4"
        >
          Official KSU CARE Services
        </a>
        <a
          href={referral.destination.catering_policy_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-owl-gold underline underline-offset-4"
        >
          KSU Catering Policies
        </a>
      </div>

      {/* Card Error Alert */}
      {cardError && (
        <div
          role="alert"
          data-testid={`pantry-referral-error-${referral.id}`}
          className="rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2.5 text-xs text-rose-200"
        >
          {cardError}
        </div>
      )}

      {/* Decision Controls (requested state only) */}
      {referral.status === "requested" ? (
        <div className="space-y-3 rounded-xl border border-sky-400/35 bg-owl-black/80 p-3.5">
          {guard.staleReason && (
            <p
              data-testid={`pantry-referral-guard-${referral.id}`}
              className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
            >
              {guard.staleReason}
            </p>
          )}

          {!guard.isExpired && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`pantry-accept-servings-${referral.id}`}
                  className="text-xs font-bold text-white"
                >
                  Simulated servings to accept (max {guard.maxAcceptable})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
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
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-zinc-700 bg-owl-slate text-base font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    id={`pantry-accept-servings-${referral.id}`}
                    data-testid={`pantry-accept-servings-${referral.id}`}
                    type="number"
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
                    className="min-h-[40px] w-20 rounded-xl border border-zinc-700 bg-owl-slate px-2.5 py-1.5 text-center text-sm font-extrabold text-white disabled:opacity-50"
                  />
                  <button
                    type="button"
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
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-zinc-700 bg-owl-slate text-base font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>

              <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-xs text-zinc-200">
                <input
                  type="checkbox"
                  data-testid={`pantry-policy-ack-${referral.id}`}
                  checked={policyAck}
                  onChange={(e) => setPolicyAck(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  I understand this is a <strong>demo simulation only</strong>.
                  No real KSU CARE acceptance or authorization occurs, and this
                  does not waive KSU catering policy.
                </span>
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid={`pantry-accept-button-${referral.id}`}
                  disabled={busyKey !== null || !guard.canAccept}
                  onClick={() =>
                    void onDecide(referral.id, "accept", clampedAccept)
                  }
                  className="min-h-[46px] rounded-xl bg-owl-gold px-4 py-2.5 text-sm font-extrabold text-owl-black transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isAccepting
                    ? "Accepting..."
                    : `Accept simulated referral (${
                        guard.maxAcceptable > 0 ? clampedAccept : 0
                      })`}
                </button>
                <button
                  type="button"
                  data-testid={`pantry-reject-button-${referral.id}`}
                  disabled={busyKey !== null || !guard.canReject}
                  onClick={() => void onDecide(referral.id, "reject")}
                  className="min-h-[46px] rounded-xl border border-zinc-700 bg-owl-slate px-4 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isRejecting ? "Rejecting..." : "Reject referral"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p
          data-testid={`pantry-referral-state-note-${referral.id}`}
          className="rounded-xl border border-zinc-800 bg-owl-black/60 px-3 py-2.5 text-xs text-zinc-300"
        >
          {readOnlyStateNote(referral)}
        </p>
      )}
    </article>
  );
}

export default function PantryCoordinatorPage() {
  const [sourceMode, setSourceMode] = useState<DataSourceMode>(
    INITIAL_PANTRY_DATA_SOURCE,
  );
  const [data, setData] = useState<PantryReferralsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const serverOffsetMsRef = useRef<number>(0);

  const loadReferrals = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    try {
      const res = await getPantryReferrals();
      setSourceMode(res.source);
      setData(res.data);
      setPageError(null);
      const parsedServer = Date.parse(res.data.server_time);
      if (Number.isFinite(parsedServer)) {
        serverOffsetMsRef.current = parsedServer - Date.now();
      }
    } catch (err) {
      setPageError(
        err instanceof Error
          ? err.message
          : "Could not load demo pantry referrals.",
      );
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadReferrals(true);
    const pollTimer = setInterval(() => {
      void loadReferrals(false);
    }, PANTRY_POLL_INTERVAL_MS);
    const clockTimer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
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
          ? `Simulated pantry acceptance recorded for ${servings ?? 0} ${
              servings === 1 ? "serving" : "servings"
            }. Host can now confirm simulated handoff.`
          : "Demo pantry referral rejected. No servings were reserved.",
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not record demo coordinator decision.";
      setCardErrors((prev) => ({ ...prev, [referralId]: msg }));
      // Always refresh immediately on 409 / stale / expired error so updated stock & status appear
      await loadReferrals(false);
    } finally {
      setBusyKey(null);
    }
  };

  const referrals = data?.referrals ?? [];
  const firstReferral = referrals[0] ?? null;
  const firstDestination = firstReferral?.destination ?? null;
  const pageNotice = resolvePantryNotice(firstReferral?.notice);
  const officialLinks = resolvePantryOfficialLinks(firstDestination);
  const serverAlignedNowIso = new Date(
    nowMs + serverOffsetMsRef.current,
  ).toISOString();

  return (
    <div
      data-testid="pantry-coordinator-page"
      className="min-h-screen bg-owl-black text-zinc-100"
    >
      <DemoHeader
        sourceMode={sourceMode}
        isDemo={true}
        allowedRoles={["pantry_coordinator"]}
        subtitle="Demo pantry coordinator"
      />

      <main className="mx-auto max-w-md space-y-5 px-4 pb-12 pt-5 sm:max-w-3xl">
        {/* Simulation-only Banner */}
        <section
          data-testid="pantry-demo-banner"
          className="space-y-3 rounded-2xl border border-amber-500/45 bg-amber-950/30 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Demo Pantry Coordinator
              </h1>
              <span className="rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase text-amber-200">
                Simulation only
              </span>
            </div>
            <span className="rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-200">
              Role: demo-pantry-coordinator
            </span>
          </div>

          <p
            data-testid="pantry-page-notice"
            className="text-sm leading-relaxed text-amber-100"
          >
            {pageNotice}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <a
                data-testid="pantry-page-care-link"
                href={officialLinks.careSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-200 underline underline-offset-4 hover:text-white"
              >
                Official KSU CARE Services
              </a>
              <a
                data-testid="pantry-page-catering-link"
                href={officialLinks.cateringPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-200 underline underline-offset-4 hover:text-white"
              >
                KSU Catering Policies
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="pantry-refresh-button"
                disabled={busyKey !== null}
                onClick={() => void loadReferrals(false)}
                className="min-h-[40px] rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-owl-gold hover:text-owl-gold disabled:opacity-40"
              >
                Refresh now
              </button>
              <Link
                href="/host"
                className="inline-flex min-h-[40px] items-center rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Host view &rarr;
              </Link>
              <Link
                href="/dispatch"
                className="inline-flex min-h-[40px] items-center rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Projector &rarr;
              </Link>
            </div>
          </div>
        </section>

        {statusMessage && (
          <div
            data-testid="pantry-status-message"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
          >
            {statusMessage}
          </div>
        )}

        {pageError && (
          <div
            role="alert"
            data-testid="pantry-error"
            className="rounded-xl border border-rose-500/40 bg-rose-950/35 px-4 py-3 text-sm text-rose-200"
          >
            {pageError}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-white">
              Simulated referrals ({referrals.length})
            </h2>
            <span className="text-xs font-semibold text-emerald-400">
              • Polling every 2s (no student identities shown)
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-zinc-800 bg-owl-slate p-6 text-sm text-zinc-400">
              Loading simulated pantry referrals...
            </div>
          ) : referrals.length === 0 ? (
            <div
              data-testid="pantry-empty-state"
              className="space-y-2 rounded-2xl border border-zinc-800 bg-owl-slate p-6 text-sm text-zinc-300"
            >
              <p className="font-bold text-white">
                No simulated pantry referrals yet.
              </p>
              <p className="text-xs text-zinc-400">
                When a host requests a demo CARE pantry referral from a live
                campus-feed drop (or a drop enters the 10-minute demo suggestion
                window), it will appear here automatically.
              </p>
            </div>
          ) : (
            <div data-testid="pantry-referrals-list" className="space-y-4">
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
      </main>
    </div>
  );
}
