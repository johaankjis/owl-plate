"use client";

import React from "react";
import { Inbox, Timer } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import { entranceDelayMs, OWL_MOTION_CLASSES } from "../../lib/motion";
import {
  PICKUP_CONFIRMATION_NOTICE,
  type HostPickupReview,
} from "../../lib/types/api";
import { formatRemainingTime } from "../../lib/time";
import {
  formatHostReviewConfidence,
  formatHostReviewMatchLabel,
  formatHostReviewSourceLabel,
  resolveHostReviewActionGuard,
} from "../../app/host/host-helpers";

interface HostPickupReviewQueueProps {
  reviews: ReadonlyArray<HostPickupReview>;
  nowIso: string;
  busyAction: string | null;
  error: string | null;
  onDecide: (verificationId: string, decision: "approve" | "reject") => void;
}

/**
 * De-identified pickup checks a student asked the host to review. Only the
 * assessment metadata is shown: never a name, ID, or the pickup photo itself.
 */
export function HostPickupReviewQueue({
  reviews,
  nowIso,
  busyAction,
  error,
  onDecide,
}: HostPickupReviewQueueProps) {
  return (
    <section
      data-testid="host-pickup-reviews-panel"
      aria-label="Pickup checks to review"
      className={
        reviews.length > 0
          ? `consumer-card space-y-4 ${OWL_MOTION_CLASSES.entrance}`
          : ""
      }
    >
      {reviews.length === 0 ? (
        <p
          data-testid="host-pickup-reviews-empty"
          className="flex items-center gap-2 px-1 text-sm text-ink-muted"
        >
          <Inbox size={16} aria-hidden="true" />
          No pickup checks need your review.
        </p>
      ) : (
        <>
          <div>
            <h3 className="text-lg font-extrabold">
              Pickup checks to review ({reviews.length})
            </h3>
            <p className="text-sm text-ink-muted">
              A student asked you to look at an unclear pickup check. Their
              identity and photo are never shared with you.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              data-testid="host-review-error"
              className={`rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger ${OWL_MOTION_CLASSES.fade}`}
            >
              {error}
            </p>
          )}
          <div className="space-y-3">
            {reviews.map((rev, idx) => {
              const guard = resolveHostReviewActionGuard(rev, nowIso);
              const approving = busyAction === `review:${rev.id}:approve`;
              const rejecting = busyAction === `review:${rev.id}:reject`;
              return (
                <article
                  key={rev.id}
                  data-testid={`host-review-card-${rev.id}`}
                  data-match-status={rev.match_status}
                  style={{ animationDelay: `${entranceDelayMs(idx)}ms` }}
                  className={`space-y-3 rounded-2xl border border-line bg-surface-subtle p-4 ${OWL_MOTION_CLASSES.entrance}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span data-testid={`host-review-match-${rev.id}`}>
                        <StatusBadge
                          tone={
                            rev.match_status === "inconsistent"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {formatHostReviewMatchLabel(rev.match_status)} match ·{" "}
                          {formatHostReviewConfidence(rev.confidence)}
                        </StatusBadge>
                      </span>
                      <span data-testid={`host-review-source-${rev.id}`}>
                        <StatusBadge>
                          {formatHostReviewSourceLabel(rev.source)}
                        </StatusBadge>
                      </span>
                    </div>
                    <span
                      data-testid={`host-review-hold-left-${rev.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-owl-goldText"
                    >
                      <Timer size={14} aria-hidden="true" />
                      Hold: {formatRemainingTime(rev.held_until, nowIso)}
                    </span>
                  </div>
                  {rev.explanation && (
                    <p
                      data-testid={`host-review-explanation-${rev.id}`}
                      className="text-sm text-ink"
                    >
                      {rev.explanation}
                    </p>
                  )}
                  <p
                    data-testid={`host-review-notice-${rev.id}`}
                    className="text-xs text-ink-muted"
                  >
                    {rev.notice || PICKUP_CONFIRMATION_NOTICE}
                  </p>
                  {guard.staleReason && (
                    <p
                      data-testid={`host-review-guard-${rev.id}`}
                      className="rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger"
                    >
                      {guard.staleReason}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid={`host-review-approve-${rev.id}`}
                      disabled={busyAction !== null || !guard.canAct}
                      onClick={() => onDecide(rev.id, "approve")}
                      className={`consumer-button px-3 ${OWL_MOTION_CLASSES.press}`}
                    >
                      {approving ? "Approving…" : "Approve pickup"}
                    </button>
                    <button
                      type="button"
                      data-testid={`host-review-reject-${rev.id}`}
                      disabled={busyAction !== null || !guard.canAct}
                      onClick={() => onDecide(rev.id, "reject")}
                      className={`consumer-button-secondary px-3 ${OWL_MOTION_CLASSES.press}`}
                    >
                      {rejecting ? "Sending…" : "Ask to retake"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
