"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type {
  DropResponse,
  HostPantryReferralResponse,
  PantryReferral,
} from "../lib/types/api";
import {
  clampPantryQuantity,
  formatPantryDestinationLocation,
  formatPantryStatusLabel,
  resolveHostPantryActionState,
  resolvePantryDirectionsUrl,
  resolvePantryNotice,
  resolvePantryOfficialLinks,
} from "../lib/pantry-helpers";

interface HostPantryCardProps {
  drop: DropResponse;
  pantryData: HostPantryReferralResponse | null;
  pantryError: string | null;
  busyAction: string | null;
  nowIso: string;
  onRequestReferral: (servings: number) => Promise<void>;
  onConfirmHandoff: () => Promise<void>;
}

export function HostPantryCard({
  drop,
  pantryData,
  pantryError,
  busyAction,
  nowIso,
  onRequestReferral,
  onConfirmHandoff,
}: HostPantryCardProps) {
  const referral: PantryReferral | null = pantryData?.referral ?? null;
  const destination = referral?.destination ?? pantryData?.destination ?? null;
  const notice = resolvePantryNotice(referral?.notice ?? pantryData?.notice);
  const officialLinks = resolvePantryOfficialLinks(destination);
  const directionsUrl = resolvePantryDirectionsUrl(destination);

  const actionState = resolveHostPantryActionState(drop, referral, nowIso);
  const [servings, setServings] = useState<number>(() =>
    Math.max(1, actionState.eligibleServings || 1),
  );
  const [policyAcknowledged, setPolicyAcknowledged] = useState<boolean>(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState<boolean>(false);

  // Reset form acknowledgments when switching to a different drop
  useEffect(() => {
    setPolicyAcknowledged(false);
    setHandoffConfirmed(false);
    setServings(Math.max(1, drop.counts.available || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop.id]);

  // Keep selected quantity within current eligible stock as students reserve/release
  useEffect(() => {
    if (actionState.eligibleServings <= 0) return;
    setServings((prev) => {
      if (prev < 1) return 1;
      if (prev > actionState.eligibleServings) {
        return actionState.eligibleServings;
      }
      return prev;
    });
  }, [actionState.eligibleServings]);

  // Clear handoff checkbox once referral is no longer accepted
  useEffect(() => {
    if (referral?.status !== "accepted") {
      setHandoffConfirmed(false);
    }
  }, [referral?.status]);

  const statusTone =
    actionState.status === "handoff_confirmed"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
      : actionState.status === "accepted"
        ? "border-purple-400/50 bg-purple-500/20 text-purple-200"
        : actionState.status === "requested"
          ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
          : actionState.status === "suggested"
            ? "border-owl-gold/50 bg-owl-gold/15 text-owl-gold"
            : actionState.status === "rejected" ||
                actionState.status === "expired"
              ? "border-zinc-700 bg-zinc-900 text-zinc-300"
              : "border-zinc-700 bg-owl-black text-zinc-300";

  const clampedServings = clampPantryQuantity(
    servings,
    actionState.eligibleServings,
  );
  const isRequesting = busyAction === "pantry:request";
  const isConfirmingHandoff = busyAction === "pantry:handoff";

  if (!actionState.isCampusFeed) {
    return null;
  }

  return (
    <section
      data-testid="host-pantry-card"
      data-status={actionState.status ?? "none"}
      className="space-y-4 rounded-2xl border border-purple-400/35 bg-owl-black/75 p-4 shadow-md"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold text-white">
              Donate remaining food
            </h3>
            <span
              data-testid="host-pantry-demo-badge"
              className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-200"
            >
              Simulation only
            </span>
          </div>
          <p
            data-testid="host-pantry-eligible"
            data-eligible-servings={String(actionState.eligibleServings)}
            className="text-xs text-zinc-300"
          >
            Eligible unallocated servings now:{" "}
            <strong className="text-emerald-300">
              {actionState.eligibleServings}
            </strong>{" "}
            of {drop.counts.total} total
          </p>
        </div>

        <span
          data-testid="host-pantry-status"
          data-status={actionState.status ?? "none"}
          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone}`}
        >
          {formatPantryStatusLabel(actionState.status)}
        </span>
      </div>

      {/* Referral quantities when a referral exists */}
      {referral && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-owl-slate/70 p-2.5 text-center text-xs">
          <div>
            <div
              data-testid="host-pantry-requested-servings"
              className="text-lg font-extrabold text-sky-300"
            >
              {referral.requested_servings}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Requested
            </div>
          </div>
          <div>
            <div
              data-testid="host-pantry-accepted-servings"
              className="text-lg font-extrabold text-purple-300"
            >
              {referral.accepted_servings}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Accepted
            </div>
          </div>
          <div>
            <div
              data-testid="host-pantry-transferred-servings"
              className="text-lg font-extrabold text-emerald-300"
            >
              {referral.transferred_servings}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Transferred
            </div>
          </div>
        </div>
      )}

      {/* Demo destination block */}
      <div
        data-testid="host-pantry-destination"
        className="space-y-2 rounded-xl border border-zinc-800 bg-owl-slate/60 p-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold text-white">
              {destination?.name ?? "KSU CARE Pantry"} (demo destination)
            </div>
            <div className="text-zinc-300">
              {destination
                ? formatPantryDestinationLocation(destination)
                : "Joe Mack Wilson Student Center, Room 184"}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Verified Marietta campus building point (not a room entrance; no
              GPS).
            </div>
          </div>
          {directionsUrl && (
            <a
              data-testid="host-pantry-directions-link"
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/25"
            >
              Walking directions
            </a>
          )}
        </div>
      </div>

      {/* Required verbatim policy notice + official KSU source links */}
      <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs">
        <p
          data-testid="host-pantry-notice"
          className="leading-relaxed text-amber-100"
        >
          {notice}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px] font-semibold">
          <a
            data-testid="host-pantry-care-link"
            href={officialLinks.careSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-owl-gold underline underline-offset-2 hover:text-amber-300"
          >
            Official KSU CARE Services &rarr;
          </a>
          <a
            data-testid="host-pantry-catering-link"
            href={officialLinks.cateringPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-owl-gold underline underline-offset-2 hover:text-amber-300"
          >
            Official KSU Catering Policies &rarr;
          </a>
        </div>
      </div>

      {actionState.stateNote && (
        <p
          data-testid="host-pantry-state-note"
          className="rounded-xl border border-zinc-800 bg-owl-slate/70 px-3 py-2 text-xs leading-relaxed text-zinc-200"
        >
          {actionState.stateNote}
        </p>
      )}

      {pantryError && (
        <div
          role="alert"
          data-testid="host-pantry-error"
          className="rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-xs text-rose-200"
        >
          {pantryError}
        </div>
      )}

      {/* Request demo referral controls (none or suggested, unexpired, eligible > 0) */}
      {actionState.canRequest && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-owl-slate/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="host-pantry-servings-input"
              className="text-xs font-bold text-white"
            >
              Demo referral quantity (max {actionState.eligibleServings})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="host-pantry-servings-decrement"
                disabled={busyAction !== null || clampedServings <= 1}
                onClick={() =>
                  setServings((prev) =>
                    clampPantryQuantity(prev - 1, actionState.eligibleServings),
                  )
                }
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-zinc-700 bg-owl-black text-base font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                −
              </button>
              <input
                id="host-pantry-servings-input"
                data-testid="host-pantry-servings-input"
                type="number"
                min={1}
                max={actionState.eligibleServings}
                value={clampedServings}
                onChange={(e) =>
                  setServings(
                    clampPantryQuantity(
                      Number(e.target.value),
                      actionState.eligibleServings,
                    ),
                  )
                }
                className="min-h-[40px] w-20 rounded-lg border border-zinc-700 bg-owl-black px-2 py-1 text-center text-sm font-extrabold text-white"
              />
              <button
                type="button"
                data-testid="host-pantry-servings-increment"
                disabled={
                  busyAction !== null ||
                  clampedServings >= actionState.eligibleServings
                }
                onClick={() =>
                  setServings((prev) =>
                    clampPantryQuantity(prev + 1, actionState.eligibleServings),
                  )
                }
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-zinc-700 bg-owl-black text-base font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-xs text-zinc-200">
            <input
              type="checkbox"
              data-testid="host-pantry-policy-checkbox"
              checked={policyAcknowledged}
              onChange={(e) => setPolicyAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
            />
            <span>
              I understand this is a <strong>simulation only</strong>: no
              message is sent to KSU CARE, and acknowledging does{" "}
              <strong>not</strong> waive KSU catering policy or establish food
              safety.
            </span>
          </label>

          <button
            type="button"
            data-testid="host-pantry-request-button"
            disabled={
              busyAction !== null ||
              !policyAcknowledged ||
              clampedServings < 1 ||
              clampedServings > actionState.eligibleServings
            }
            onClick={() => void onRequestReferral(clampedServings)}
            className="min-h-[48px] w-full rounded-xl bg-owl-gold px-4 py-3 text-sm font-extrabold text-owl-black transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRequesting ? "Requesting..." : "Request demo referral"}
          </button>
        </div>
      )}

      {/* Explicit simulated handoff confirmation (only for accepted, unexpired referrals) */}
      {actionState.canConfirmHandoff && referral && (
        <div className="space-y-3 rounded-xl border border-purple-400/40 bg-purple-950/25 p-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-xs text-zinc-100">
            <input
              type="checkbox"
              data-testid="host-pantry-handoff-checkbox"
              checked={handoffConfirmed}
              onChange={(e) => setHandoffConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-600 accent-emerald-400"
            />
            <span>
              Confirm <strong>simulated handoff</strong> of{" "}
              <strong>{referral.accepted_servings}</strong> accepted{" "}
              {referral.accepted_servings === 1 ? "serving" : "servings"} (demo
              count update only; not an independently verified physical transfer
              or KSU approval).
            </span>
          </label>

          <button
            type="button"
            data-testid="host-pantry-handoff-button"
            disabled={busyAction !== null || !handoffConfirmed}
            onClick={() => void onConfirmHandoff()}
            className="min-h-[48px] w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-extrabold text-owl-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isConfirmingHandoff
              ? "Confirming handoff..."
              : "Confirm simulated handoff"}
          </button>
        </div>
      )}

      {/* Link to separate demo pantry coordinator screen */}
      <div className="pt-1">
        <Link
          href="/pantry"
          data-testid="open-demo-pantry-coordinator"
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-purple-400/45 bg-purple-500/15 px-4 py-2.5 text-xs font-extrabold text-purple-200 transition hover:bg-purple-500/25"
        >
          Open demo pantry coordinator (/pantry) &rarr;
        </Link>
      </div>
    </section>
  );
}
