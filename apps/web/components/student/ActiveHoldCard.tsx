"use client";
/* eslint-disable @next/next/no-img-element -- Temporary local blob preview is revoked immediately after upload. */

import React, { useRef } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  Clock,
  HelpCircle,
  MapPin,
  Navigation,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { AllergenCard } from "../ui/AllergenCard";
import { DropPhoto } from "../ui/DropPhoto";
import { StatusBadge } from "../ui/StatusBadge";
import { OWL_MOTION_CLASSES } from "../../lib/motion";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";
import type {
  ClaimResponse,
  DropResponse,
  PickupVerification,
} from "../../lib/types/api";
import {
  formatConsumerDropLocation,
  formatPickupMatchStatusLabel,
  formatPickupVerificationSourceLabel,
  formatReviewStatusLabel,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
  resolvePickupVerificationActions,
  summarizeDropItems,
} from "../../app/student/student-helpers";

export interface ActiveHoldCardProps {
  drop: DropResponse;
  claim: ClaimResponse;
  authToken: string | null;
  nowIso: string;
  pickupVerification: PickupVerification | null;
  pickupPreviewUrl: string | null;
  pickupError: string | null;
  hasRetryablePhoto: boolean;
  busyId: string | null;
  showPhoto?: boolean;
  showDetailsLink?: boolean;
  onSelectPickupPhoto: (claimId: string, file: File | null | undefined) => void;
  onRetrySamePickupPhoto: (claimId: string) => void | Promise<void>;
  onRequestHostReview: (
    claimId: string,
    verificationId: string,
  ) => void | Promise<void>;
  onConfirmPickup: (
    claimId: string,
    verificationId: string,
  ) => void | Promise<void>;
  onReleaseReservation: (claimId: string) => void | Promise<void>;
  onClearSelectedPhoto: () => void;
}

export function ActiveHoldCard({
  drop,
  claim,
  authToken,
  nowIso,
  pickupVerification,
  pickupPreviewUrl,
  pickupError,
  hasRetryablePhoto,
  busyId,
  showPhoto = true,
  showDetailsLink = true,
  onSelectPickupPhoto,
  onRetrySamePickupPhoto,
  onRequestHostReview,
  onConfirmPickup,
  onReleaseReservation,
  onClearSelectedPhoto,
}: ActiveHoldCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const title = summarizeDropItems(drop);
  const locationText = formatConsumerDropLocation(drop);
  const pickupNote = getDropPickupInstructions(drop);
  const directionsUrl = getDropWalkingDirectionsUrl(drop);

  const holdRemaining = formatRemainingTime(claim.held_until, nowIso);
  const holdIsActive = claim.status === "held" && holdRemaining !== "Expired";
  const msLeft = Date.parse(claim.held_until) - Date.parse(nowIso);
  const isUrgent = Number.isFinite(msLeft) && msLeft > 0 && msLeft < 120_000;

  const actions = resolvePickupVerificationActions(
    pickupVerification,
    holdIsActive,
  );
  const isUploadingPhoto = busyId === `pickup-photo:${claim.id}`;
  const isRequestingReview = busyId === `pickup-review:${claim.id}`;
  const isCompletingPickup = busyId === claim.id;

  const reviewLabel = pickupVerification
    ? formatReviewStatusLabel(pickupVerification.review_status)
    : null;

  const statusBadgeText = !pickupVerification
    ? null
    : pickupVerification.status === "processing"
      ? "Checking photo..."
      : reviewLabel
        ? reviewLabel
        : pickupVerification.status === "failed"
          ? "Couldn't check photo"
          : formatPickupMatchStatusLabel(pickupVerification.match_status);

  const statusBadgeTone: "success" | "warning" | "danger" | "gold" | "neutral" =
    !pickupVerification
      ? "neutral"
      : pickupVerification.status === "processing"
        ? "gold"
        : pickupVerification.review_status === "approved" ||
            (pickupVerification.match_status === "consistent" &&
              actions.canCompletePickup)
          ? "success"
          : pickupVerification.match_status === "inconsistent" ||
              pickupVerification.review_status === "rejected" ||
              pickupVerification.status === "failed"
            ? "danger"
            : "warning";

  const handleOpenCamera = () => {
    onClearSelectedPhoto();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  return (
    <article
      data-testid="active-claim-banner"
      className={`consumer-card space-y-5 border-success/40 ${OWL_MOTION_CLASSES.entrance}`}
    >
      {showPhoto && (
        <DropPhoto
          dropId={drop.id}
          hasPhoto={drop.has_photo}
          photoUrl={drop.photo_url}
          authToken={authToken}
          alt={title}
          aspect="16/10"
          overlayTopLeft={<StatusBadge tone="success">Active hold</StatusBadge>}
        />
      )}

      {/* Title, Location & Countdown */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {!showPhoto && (
              <StatusBadge tone="success">Active hold</StatusBadge>
            )}
            <h2 className="text-xl font-extrabold tracking-tight text-ink">
              {title}
            </h2>
            <p
              data-testid="pickup-drop-location"
              className="flex items-center gap-1.5 text-sm font-medium text-ink-muted"
            >
              <MapPin size={15} className="shrink-0" aria-hidden="true" />
              <span>{locationText}</span>
            </p>
          </div>
          {showDetailsLink && (
            <Link
              href={`/student/drops/${drop.id}`}
              className="inline-flex min-h-[44px] shrink-0 items-center text-xs font-bold text-owl-goldText hover:underline"
            >
              View details
            </Link>
          )}
        </div>

        {pickupNote && (
          <div
            data-testid="pickup-instructions"
            className="rounded-2xl bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-ink"
          >
            <strong className="font-bold">Pickup note:</strong> {pickupNote}
          </div>
        )}

        {/* Live 10-minute reservation countdown */}
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
            !holdIsActive || isUrgent
              ? "border-warning/40 bg-warning-tint"
              : "border-success/30 bg-success-tint"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Clock
              size={18}
              className={
                !holdIsActive || isUrgent ? "text-warning" : "text-success"
              }
              aria-hidden="true"
            />
            <div>
              <div
                className={`text-xs font-bold ${
                  !holdIsActive || isUrgent ? "text-warning" : "text-success"
                }`}
              >
                Reservation hold
              </div>
              <div className="text-xs text-ink-muted">
                Until {formatEasternTime(claim.held_until)}
              </div>
            </div>
          </div>
          <div
            data-testid="hold-countdown"
            className={`text-xl font-extrabold tabular-nums ${
              !holdIsActive || isUrgent ? "text-warning" : "text-success"
            }`}
          >
            {holdRemaining}
          </div>
        </div>

        {/* Destination-only Google Maps walking directions */}
        {directionsUrl && (
          <a
            data-testid="get-directions-link"
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
          >
            <Navigation size={16} aria-hidden="true" />
            <span>Walking directions</span>
          </a>
        )}
      </div>

      {/* Allergen card (mandatory warning) */}
      <AllergenCard
        allergens={drop.allergens_final}
        notice={drop.allergen_notice}
        title="Allergens"
        compact
      />

      {/* Photo-Assisted Pickup Flow */}
      <div
        data-testid="pickup-confirmation-section"
        className="space-y-4 rounded-2xl border border-line bg-surface-subtle p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-ink">
              Photo-assisted pickup
            </h3>
            <p className="text-xs leading-relaxed text-ink-muted">
              Snap a quick photo of the food only (no people), then tap Confirm
              pickup.
            </p>
          </div>
          {pickupVerification?.source && (
            <StatusBadge tone="gold">
              <span data-testid="pickup-verification-source">
                {formatPickupVerificationSourceLabel(pickupVerification.source)}
              </span>
            </StatusBadge>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-ink-muted">
          Your pickup photo is checked temporarily and is never saved or shown
          to the host.
        </p>

        {/* Hidden file/camera input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          data-testid="pickup-photo-input"
          disabled={busyId !== null || !holdIsActive}
          onChange={(e) =>
            onSelectPickupPhoto(claim.id, e.target.files?.[0] ?? null)
          }
          className="sr-only"
        />

        {/* Temporary local preview while uploading */}
        {pickupPreviewUrl && (
          <div
            data-testid="pickup-photo-temp-preview"
            className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-xs ${OWL_MOTION_CLASSES.fade}`}
          >
            <img
              src={pickupPreviewUrl}
              alt="Temporary pickup food preview"
              className="h-12 w-12 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink">Checking your photo...</div>
              <div className="text-[11px] text-ink-muted">
                This temporary preview is cleared right after checking.
              </div>
            </div>
          </div>
        )}

        {/* Pickup error */}
        {pickupError && (
          <div
            role="alert"
            data-testid="pickup-verification-error"
            className={`space-y-2.5 rounded-2xl border border-danger/30 bg-danger-tint px-3.5 py-3 text-xs text-danger ${OWL_MOTION_CLASSES.fade}`}
          >
            <p className="font-medium">{pickupError}</p>
            {hasRetryablePhoto && (
              <button
                type="button"
                data-testid="pickup-retry-same-photo-button"
                disabled={busyId !== null || !holdIsActive}
                onClick={() => void onRetrySamePickupPhoto(claim.id)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-danger/40 bg-surface px-3.5 py-2 text-xs font-bold text-danger transition hover:bg-danger-tint disabled:opacity-50 ${OWL_MOTION_CLASSES.press}`}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>Try uploading again</span>
              </button>
            )}
          </div>
        )}

        {/* Assessment result card */}
        {pickupVerification && (
          <div
            data-testid="pickup-verification-card"
            data-status={pickupVerification.status}
            data-match-status={pickupVerification.match_status ?? ""}
            data-review-status={
              pickupVerification.review_status ?? "not_requested"
            }
            className={`space-y-2 rounded-2xl border border-line bg-surface p-3.5 text-xs ${OWL_MOTION_CLASSES.fade}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge tone={statusBadgeTone}>
                <span data-testid="pickup-verification-status-badge">
                  {statusBadgeText}
                </span>
              </StatusBadge>
            </div>

            {pickupVerification.explanation && (
              <p
                data-testid="pickup-verification-explanation"
                className="leading-relaxed text-ink-muted"
              >
                {pickupVerification.explanation}
              </p>
            )}

            {pickupVerification.review_status === "pending" && (
              <p
                data-testid="pickup-review-pending-note"
                className="rounded-xl bg-warning-tint px-3 py-2 text-[11px] font-medium text-warning"
              >
                Waiting for the host to review. You can also retake a clearer
                photo while you wait.
              </p>
            )}
          </div>
        )}

        {/* Mandatory photo-assisted confirmation notice */}
        <p
          data-testid="pickup-confirmation-notice"
          className="rounded-2xl border border-warning/30 bg-warning-tint px-3.5 py-2.5 text-[11px] font-medium leading-relaxed text-warning"
        >
          {actions.notice}
        </p>

        {/* Action buttons */}
        <div className="space-y-2.5 pt-1">
          {(!pickupVerification || actions.canRetryPhoto) && (
            <button
              type="button"
              data-testid={
                pickupVerification
                  ? "pickup-retry-photo-button"
                  : "pickup-photo-trigger-button"
              }
              disabled={
                busyId !== null ||
                !holdIsActive ||
                actions.phase === "processing"
              }
              onClick={handleOpenCamera}
              className={`${
                actions.canCompletePickup
                  ? "consumer-button-secondary w-full"
                  : "consumer-button w-full"
              } ${OWL_MOTION_CLASSES.press}`}
            >
              <Camera size={17} aria-hidden="true" />
              <span>
                {isUploadingPhoto
                  ? "Checking photo..."
                  : actions.phase === "processing"
                    ? "Checking photo..."
                    : pickupVerification
                      ? "Retake photo"
                      : "Take pickup photo"}
              </span>
            </button>
          )}

          {actions.canRequestHostReview && actions.verificationId && (
            <button
              type="button"
              data-testid="pickup-request-review-button"
              disabled={busyId !== null || !holdIsActive}
              onClick={() =>
                void onRequestHostReview(claim.id, actions.verificationId!)
              }
              className={`consumer-button-secondary w-full border-warning/40 text-warning hover:bg-warning-tint ${OWL_MOTION_CLASSES.press}`}
            >
              <HelpCircle size={17} aria-hidden="true" />
              <span>
                {isRequestingReview
                  ? "Sending request..."
                  : "Ask host to review"}
              </span>
            </button>
          )}

          {/* Explicit separate Confirm pickup button (enabled ONLY when can_confirm === true & consistent >= 0.8) */}
          <button
            type="button"
            data-testid="pickup-confirm-button"
            disabled={
              busyId !== null ||
              !actions.canCompletePickup ||
              !actions.verificationId
            }
            onClick={() =>
              void onConfirmPickup(claim.id, actions.verificationId!)
            }
            className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${OWL_MOTION_CLASSES.press} ${
              actions.canCompletePickup
                ? "bg-success text-white hover:opacity-95"
                : "border border-line bg-surface text-ink-muted"
            }`}
          >
            <CheckCircle2 size={17} aria-hidden="true" />
            <span>
              {isCompletingPickup
                ? "Confirming pickup..."
                : actions.canCompletePickup
                  ? "Confirm pickup"
                  : "Confirm pickup (take food photo first)"}
            </span>
          </button>

          <button
            type="button"
            data-testid="pickup-release-button"
            disabled={busyId !== null}
            onClick={() => void onReleaseReservation(claim.id)}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-ink-muted transition hover:bg-surface hover:text-danger disabled:opacity-50 ${OWL_MOTION_CLASSES.press}`}
          >
            <XCircle size={15} aria-hidden="true" />
            <span>Release reservation</span>
          </button>
        </div>
      </div>
    </article>
  );
}
