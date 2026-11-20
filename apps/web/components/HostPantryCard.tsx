"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  HandHeart,
  MapPin,
  Minus,
  Navigation,
  Plus,
} from "lucide-react";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { StatusBadge } from "./ui/StatusBadge";
import { OWL_MOTION_CLASSES } from "../lib/motion";
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
  const [requestDialogOpen, setRequestDialogOpen] = useState<boolean>(false);
  const [handoffDialogOpen, setHandoffDialogOpen] = useState<boolean>(false);

  // Reset form acknowledgments and dialogs when switching to a different drop
  useEffect(() => {
    setPolicyAcknowledged(false);
    setHandoffConfirmed(false);
    setRequestDialogOpen(false);
    setHandoffDialogOpen(false);
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

  // Close request dialog once the listing can no longer be requested
  useEffect(() => {
    if (!actionState.canRequest) {
      setRequestDialogOpen(false);
      setPolicyAcknowledged(false);
    }
  }, [actionState.canRequest]);

  // Clear handoff dialog and checkbox once referral is no longer accepted
  useEffect(() => {
    if (referral?.status !== "accepted") {
      setHandoffDialogOpen(false);
      setHandoffConfirmed(false);
    }
  }, [referral?.status]);

  const statusTone =
    actionState.status === "handoff_confirmed" ||
    actionState.status === "accepted"
      ? "success"
      : actionState.status === "requested" || actionState.status === "suggested"
        ? "gold"
        : "neutral";

  const clampedServings = clampPantryQuantity(
    servings,
    actionState.eligibleServings,
  );
  const isRequesting = busyAction === "pantry:request";
  const isConfirmingHandoff = busyAction === "pantry:handoff";

  // One required notice and official links definition, shown inside the
  // request or handoff confirmation dialog at the point of action.
  const policyNotice = (
    <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning-tint px-3.5 py-2.5 text-sm">
      <p data-testid="host-pantry-notice" className="text-warning">
        {notice}
      </p>
      <div className="flex flex-wrap gap-x-4 text-xs font-semibold">
        <a
          data-testid="host-pantry-care-link"
          href={officialLinks.careSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
        >
          Official KSU CARE Services
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        <a
          data-testid="host-pantry-catering-link"
          href={officialLinks.cateringPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-owl-goldText underline underline-offset-2"
        >
          Official KSU Catering Policies
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );

  if (!actionState.isCampusFeed) {
    return null;
  }

  return (
    <section
      data-testid="host-pantry-card"
      data-status={actionState.status ?? "none"}
      className="consumer-card space-y-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <HandHeart
              size={20}
              aria-hidden="true"
              className="text-owl-goldText"
            />
            <h3 className="text-lg font-extrabold">Donate remaining food</h3>
          </div>
          <p
            data-testid="host-pantry-eligible"
            data-eligible-servings={String(actionState.eligibleServings)}
            className="text-sm text-ink-muted"
          >
            <strong className="text-ink">
              <AnimatedNumber value={actionState.eligibleServings} />
            </strong>{" "}
            of {drop.counts.total} servings unreserved
          </p>
        </div>
        <span
          data-testid="host-pantry-status"
          data-status={actionState.status ?? "none"}
        >
          <StatusBadge tone={statusTone}>
            {formatPantryStatusLabel(actionState.status)}
          </StatusBadge>
        </span>
      </div>

      {referral && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {[
            {
              id: "host-pantry-requested-servings",
              value: referral.requested_servings,
              label: "Requested",
            },
            {
              id: "host-pantry-accepted-servings",
              value: referral.accepted_servings,
              label: "Accepted (total)",
            },
            {
              id: "host-pantry-reserved-servings",
              value: drop.counts.pantry_held ?? 0,
              label: "Pantry reserved now",
            },
            {
              id: "host-pantry-transferred-servings",
              value: referral.transferred_servings,
              label: "Pantry transfers (simulated)",
            },
          ].map((tile) => (
            <div key={tile.id} className="flex flex-col-reverse">
              <dt className="text-xs font-medium text-ink-muted">
                {tile.label}
              </dt>
              <dd
                data-testid={tile.id}
                className="text-xl font-extrabold tabular-nums"
              >
                <AnimatedNumber value={tile.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div
        data-testid="host-pantry-destination"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
      >
        <div className="flex items-start gap-2">
          <MapPin
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-owl-goldText"
          />
          <div>
            <div className="font-bold">
              {destination?.name ?? "KSU CARE Pantry"}
            </div>
            <div className="text-ink-muted">
              {destination
                ? formatPantryDestinationLocation(destination)
                : "Joe Mack Wilson Student Center, Room 184"}
            </div>
          </div>
        </div>
        {directionsUrl && (
          <a
            data-testid="host-pantry-directions-link"
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-owl-goldText underline-offset-4 hover:underline"
          >
            <Navigation size={14} aria-hidden="true" />
            Directions
          </a>
        )}
      </div>

      {actionState.stateNote && (
        <p
          data-testid="host-pantry-state-note"
          className="rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink-muted"
        >
          {actionState.stateNote}
        </p>
      )}

      {pantryError && !requestDialogOpen && !handoffDialogOpen && (
        <p
          role="alert"
          data-testid="host-pantry-error"
          className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          {pantryError}
        </p>
      )}

      {actionState.canRequest && (
        <div className="space-y-3 border-t border-line pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="host-pantry-servings-input"
              className="text-sm font-bold"
            >
              Servings to offer (max {actionState.eligibleServings})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="host-pantry-servings-decrement"
                aria-label="Fewer servings"
                disabled={busyAction !== null || clampedServings <= 1}
                onClick={() =>
                  setServings((prev) =>
                    clampPantryQuantity(prev - 1, actionState.eligibleServings),
                  )
                }
                className={`consumer-button-secondary h-11 min-h-11 w-11 px-0 ${OWL_MOTION_CLASSES.press}`}
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <input
                id="host-pantry-servings-input"
                data-testid="host-pantry-servings-input"
                type="number"
                inputMode="numeric"
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
                className="consumer-input min-h-11 w-20 px-2 text-center font-extrabold"
              />
              <button
                type="button"
                data-testid="host-pantry-servings-increment"
                aria-label="More servings"
                disabled={
                  busyAction !== null ||
                  clampedServings >= actionState.eligibleServings
                }
                onClick={() =>
                  setServings((prev) =>
                    clampPantryQuantity(prev + 1, actionState.eligibleServings),
                  )
                }
                className={`consumer-button-secondary h-11 min-h-11 w-11 px-0 ${OWL_MOTION_CLASSES.press}`}
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="host-pantry-open-request-dialog"
            disabled={
              busyAction !== null ||
              clampedServings < 1 ||
              clampedServings > actionState.eligibleServings
            }
            onClick={() => {
              setPolicyAcknowledged(false);
              setRequestDialogOpen(true);
            }}
            className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
          >
            {`Offer ${clampedServings} ${clampedServings === 1 ? "serving" : "servings"} to pantry`}
          </button>

          <ConfirmDialog
            open={requestDialogOpen}
            testId="host-pantry-request-dialog"
            title="Confirm demo pantry referral"
            description={`Offer ${clampedServings} unreserved ${clampedServings === 1 ? "serving" : "servings"} to ${destination?.name ?? "KSU CARE Pantry"}.`}
            onClose={() => {
              setRequestDialogOpen(false);
              setPolicyAcknowledged(false);
            }}
            closeDisabled={busyAction !== null}
          >
            {policyNotice}

            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                data-testid="host-pantry-policy-checkbox"
                checked={policyAcknowledged}
                onChange={(e) => setPolicyAcknowledged(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-owl-gold"
              />
              <span>
                I understand this is a <strong>simulation only</strong>: no
                message is sent to KSU CARE, and acknowledging does{" "}
                <strong>not</strong> waive KSU catering policy or establish food
                safety.
              </span>
            </label>

            {pantryError && (
              <p
                role="alert"
                data-testid="host-pantry-error"
                className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
              >
                {pantryError}
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  setRequestDialogOpen(false);
                  setPolicyAcknowledged(false);
                }}
                className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
              >
                Cancel
              </button>
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
                className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
              >
                {isRequesting ? "Requesting…" : "Request demo referral"}
              </button>
            </div>
          </ConfirmDialog>
        </div>
      )}

      {actionState.canConfirmHandoff && referral && (
        <div>
          <button
            type="button"
            data-testid="host-pantry-open-handoff-dialog"
            disabled={busyAction !== null}
            onClick={() => {
              setHandoffConfirmed(false);
              setHandoffDialogOpen(true);
            }}
            className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
          >
            Confirm simulated handoff
          </button>

          <ConfirmDialog
            open={handoffDialogOpen}
            testId="host-pantry-handoff-dialog"
            title="Confirm simulated handoff"
            description={`Record transfer of ${referral.accepted_servings} accepted ${referral.accepted_servings === 1 ? "serving" : "servings"} to ${destination?.name ?? "KSU CARE Pantry"}.`}
            onClose={() => {
              setHandoffDialogOpen(false);
              setHandoffConfirmed(false);
            }}
            closeDisabled={busyAction !== null}
          >
            {policyNotice}

            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                data-testid="host-pantry-handoff-checkbox"
                checked={handoffConfirmed}
                onChange={(e) => setHandoffConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-owl-gold"
              />
              <span>
                Confirm <strong>simulated handoff</strong> of{" "}
                <strong>{referral.accepted_servings}</strong> accepted{" "}
                {referral.accepted_servings === 1 ? "serving" : "servings"}{" "}
                (demo count update only; not an independently verified physical
                transfer or KSU approval).
              </span>
            </label>

            {pantryError && (
              <p
                role="alert"
                data-testid="host-pantry-error"
                className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
              >
                {pantryError}
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  setHandoffDialogOpen(false);
                  setHandoffConfirmed(false);
                }}
                className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="host-pantry-handoff-button"
                disabled={busyAction !== null || !handoffConfirmed}
                onClick={() => void onConfirmHandoff()}
                className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
              >
                {isConfirmingHandoff
                  ? "Confirming handoff…"
                  : "Confirm simulated handoff"}
              </button>
            </div>
          </ConfirmDialog>
        </div>
      )}

      <Link
        href="/pantry"
        data-testid="open-demo-pantry-coordinator"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-owl-goldText underline-offset-4 hover:underline"
      >
        View pantry
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
