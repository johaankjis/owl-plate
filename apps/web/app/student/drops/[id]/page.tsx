"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  Navigation,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { AppShell } from "../../../../components/ui/AppShell";
import { AllergenCard } from "../../../../components/ui/AllergenCard";
import {
  BottomNav,
  type StudentTabId,
} from "../../../../components/ui/BottomNav";
import { DropPhoto } from "../../../../components/ui/DropPhoto";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { DetailSkeleton } from "../../../../components/ui/Skeleton";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { ActiveHoldCard } from "../../../../components/student/ActiveHoldCard";
import {
  PICKUP_CONFIRMATION_NOTICE,
  type Building,
  type ClaimResponse,
  type DropResponse,
  type FeedDrop,
  type PickupVerification,
  type StudentReservationItem,
} from "../../../../lib/types/api";
import {
  ApiContractError,
  getBuildings,
  getDrop,
  getMyFeed,
  getMyReservations,
  getPickupVerification,
  pickupClaim,
  releaseClaim,
  requestPickupReview,
  reserveDrop,
  submitPickupPhoto,
} from "../../../../lib/api-client";
import {
  getSessionToken,
  handleUnauthorizedError,
} from "../../../../lib/session";
import { formatEasternTime, formatRemainingTime } from "../../../../lib/time";
import {
  formatConsumerDropLocation,
  formatConsumerHostNote,
  formatUnavailableReason,
  generatePickupRequestId,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
  revokePreviewObjectUrl,
  summarizeDropItems,
  validatePickupPhotoFile,
} from "../../student-helpers";

function formatDietLabel(tag: string): string {
  const clean = tag.replaceAll("_", " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

export default function StudentDropDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const rawId = params?.id;
  const dropId = Array.isArray(rawId) ? (rawId[0] ?? "") : (rawId ?? "");

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [feedDrop, setFeedDrop] = useState<FeedDrop | null>(null);
  const [fallbackDrop, setFallbackDrop] = useState<DropResponse | null>(null);
  const [reservations, setReservations] = useState<StudentReservationItem[]>(
    [],
  );
  const [hasAnyActiveHold, setHasAnyActiveHold] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Photo-assisted pickup state for active hold on this drop
  const [pickupVerification, setPickupVerification] =
    useState<PickupVerification | null>(null);
  const [pickupPhotoFile, setPickupPhotoFile] = useState<File | null>(null);
  const [pickupRequestId, setPickupRequestId] = useState<string | null>(null);
  const [pickupPreviewUrl, setPickupPreviewUrl] = useState<string | null>(null);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const pickupPreviewUrlRef = useRef<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const clearSelectedPickupPhoto = useCallback(() => {
    if (pickupPreviewUrlRef.current) {
      revokePreviewObjectUrl(pickupPreviewUrlRef.current);
      pickupPreviewUrlRef.current = null;
    }
    setPickupPreviewUrl(null);
    setPickupPhotoFile(null);
    setPickupRequestId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pickupPreviewUrlRef.current) {
        revokePreviewObjectUrl(pickupPreviewUrlRef.current);
        pickupPreviewUrlRef.current = null;
      }
    };
  }, []);

  const onApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const authResult = handleUnauthorizedError(err);
      if (authResult.isUnauthorized) {
        router.replace(authResult.redirectTo);
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : fallbackMessage);
    },
    [router],
  );

  // Check student session on mount
  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.replace("/join");
      return;
    }
    setAuthToken(token);
    setAuthChecked(true);
  }, [router]);

  // Load verified building directory once
  useEffect(() => {
    if (!authChecked || !authToken) return;
    let active = true;
    getBuildings()
      .then((res) => {
        if (active) setBuildings(res.data.buildings);
      })
      .catch(() => {
        // Non-blocking fallback
      });
    return () => {
      active = false;
    };
  }, [authChecked, authToken]);

  const loadDropDetail = useCallback(async () => {
    if (!authToken || !dropId) return;
    try {
      const [feedRes, reservationsRes] = await Promise.all([
        getMyFeed(authToken),
        getMyReservations(authToken).catch(() => null),
      ]);

      setServerTime(feedRes.data.server_time);
      setReceivedAt(Date.now());

      const allReservations = reservationsRes?.data.reservations ?? [];
      setReservations(allReservations);

      const activeFromFeed = feedRes.data.drops.some(
        (fd) => fd.claim?.status === "held",
      );
      const activeFromReservations = allReservations.some(
        (r) => r.claim.status === "held",
      );
      setHasAnyActiveHold(activeFromFeed || activeFromReservations);

      const matchedFeed =
        feedRes.data.drops.find((fd) => fd.drop.id === dropId) ?? null;

      if (matchedFeed) {
        setFeedDrop(matchedFeed);
        setFallbackDrop(null);
        setNotFound(false);
        setErrorMessage(null);
        setLoaded(true);
        return;
      }

      setFeedDrop(null);

      // Check reservation history first for ended/completed listings
      const matchedReservation = allReservations.find(
        (r) => r.drop.id === dropId,
      );
      if (matchedReservation) {
        setFallbackDrop(matchedReservation.drop);
        setNotFound(false);
        setErrorMessage(null);
        setLoaded(true);
        return;
      }

      // Fall back to direct drop fetch (e.g. recently claimed-out or expired listing)
      try {
        const dropRes = await getDrop(dropId, authToken);
        setFallbackDrop(dropRes.data);
        setNotFound(false);
        setErrorMessage(null);
      } catch (err) {
        if (err instanceof ApiContractError && err.status === 404) {
          setFallbackDrop(null);
          setNotFound(true);
        } else {
          onApiError(err, "Unable to load food details right now.");
        }
      } finally {
        setLoaded(true);
      }
    } catch (err) {
      onApiError(err, "Unable to load food details right now.");
      setLoaded(true);
    }
  }, [authToken, dropId, onApiError]);

  useEffect(() => {
    if (!authChecked || !authToken || !dropId) return;
    loadDropDetail();
    const poll = setInterval(loadDropDetail, 2000);
    return () => clearInterval(poll);
  }, [authChecked, authToken, dropId, loadDropDetail]);

  // 1-second timer for live countdowns
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nowIso = useMemo(() => {
    if (serverTime && receivedAt !== null) {
      const baseMs = Date.parse(serverTime);
      if (Number.isFinite(baseMs)) {
        return new Date(
          baseMs + Math.max(0, nowTick - receivedAt),
        ).toISOString();
      }
    }
    return new Date(nowTick).toISOString();
  }, [nowTick, receivedAt, serverTime]);

  const drop: DropResponse | null = feedDrop?.drop ?? fallbackDrop;

  const reservationForThisDrop = useMemo(() => {
    const held = reservations.find(
      (r) => r.drop.id === dropId && r.claim.status === "held",
    );
    if (held) return held;
    return reservations.find((r) => r.drop.id === dropId) ?? null;
  }, [dropId, reservations]);

  const claimForThisDrop: ClaimResponse | null =
    feedDrop?.claim ?? reservationForThisDrop?.claim ?? null;

  const activeClaimId =
    claimForThisDrop?.status === "held" ? claimForThisDrop.id : null;

  // Poll pickup verification when student holds a reservation on this drop
  useEffect(() => {
    if (!authToken || !activeClaimId) {
      setPickupVerification(null);
      setPickupError(null);
      clearSelectedPickupPhoto();
      return;
    }

    let cancelled = false;
    const pollVerification = async () => {
      try {
        const res = await getPickupVerification(activeClaimId, authToken);
        if (!cancelled) {
          setPickupVerification(res.data.verification);
        }
      } catch (err) {
        if (
          !cancelled &&
          err instanceof ApiContractError &&
          err.status === 401
        ) {
          onApiError(err, "Session expired.");
        }
      }
    };

    pollVerification();
    const timer = setInterval(pollVerification, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeClaimId, authToken, clearSelectedPickupPhoto, onApiError]);

  const handleSelectNavTab = useCallback(
    (tab: StudentTabId) => {
      router.push(`/student?tab=${tab}`);
    },
    [router],
  );

  const handleReserve = async () => {
    if (!authToken || !drop) return;
    setBusyId(`reserve:${drop.id}`);
    setErrorMessage(null);
    try {
      await reserveDrop(drop.id, authToken);
      await loadDropDetail();
    } catch (err) {
      onApiError(err, "Could not reserve this serving.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReleaseReservation = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    try {
      await releaseClaim(claimId, authToken);
      clearSelectedPickupPhoto();
      setPickupVerification(null);
      setPickupError(null);
      await loadDropDetail();
    } catch (err) {
      onApiError(err, "Could not release your reservation.");
    } finally {
      setBusyId(null);
    }
  };

  const runPickupPhotoUpload = async (
    claimId: string,
    file: File,
    requestId: string,
  ) => {
    if (!authToken) return;
    setBusyId(`pickup-photo:${claimId}`);
    setPickupError(null);
    setErrorMessage(null);
    try {
      const res = await submitPickupPhoto(claimId, file, requestId, authToken);
      setPickupVerification(res.data);
      await loadDropDetail();
    } catch (err) {
      const authResult = handleUnauthorizedError(err);
      if (authResult.isUnauthorized) {
        router.replace(authResult.redirectTo);
        return;
      }
      setPickupError(
        err instanceof Error
          ? err.message
          : "Couldn't check your pickup photo. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectPickupPhoto = (
    claimId: string,
    file: File | null | undefined,
  ) => {
    if (!file) return;
    const validation = validatePickupPhotoFile(file);
    if (!validation.valid) {
      setPickupError(validation.error);
      return;
    }

    if (pickupPreviewUrlRef.current) {
      revokePreviewObjectUrl(pickupPreviewUrlRef.current);
      pickupPreviewUrlRef.current = null;
    }

    let nextPreview: string | null = null;
    if (
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      nextPreview = URL.createObjectURL(file);
      pickupPreviewUrlRef.current = nextPreview;
    }

    const reqId = generatePickupRequestId();
    setPickupPhotoFile(file);
    setPickupRequestId(reqId);
    setPickupPreviewUrl(nextPreview);
    setPickupError(null);
    void runPickupPhotoUpload(claimId, file, reqId);
  };

  const handleRetrySamePickupPhoto = async (claimId: string) => {
    if (!pickupPhotoFile || !pickupRequestId) return;
    await runPickupPhotoUpload(claimId, pickupPhotoFile, pickupRequestId);
  };

  const handleRequestHostReview = async (
    claimId: string,
    verificationId: string,
  ) => {
    if (!authToken) return;
    setBusyId(`pickup-review:${claimId}`);
    setPickupError(null);
    setErrorMessage(null);
    try {
      const res = await requestPickupReview(claimId, verificationId, authToken);
      setPickupVerification(res.data);
      await loadDropDetail();
    } catch (err) {
      const authResult = handleUnauthorizedError(err);
      if (authResult.isUnauthorized) {
        router.replace(authResult.redirectTo);
        return;
      }
      setPickupError(
        err instanceof Error
          ? err.message
          : "Couldn't send your photo to the host.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmPickup = async (
    claimId: string,
    verificationId: string,
  ) => {
    if (!authToken) return;
    setBusyId(claimId);
    setPickupError(null);
    setErrorMessage(null);
    try {
      await pickupClaim(claimId, authToken, {
        verification_id: verificationId,
      });
      clearSelectedPickupPhoto();
      setPickupVerification(null);
      await loadDropDetail();
    } catch (err) {
      onApiError(err, "Couldn't confirm pickup.");
    } finally {
      setBusyId(null);
    }
  };

  const bottomNav = (
    <BottomNav
      activeTab="home"
      onSelectTab={handleSelectNavTab}
      activeHoldCount={hasAnyActiveHold ? 1 : 0}
    />
  );

  if (!authChecked || !loaded) {
    return (
      <AppShell variant="student" maxWidth="lg" bottomNav={bottomNav}>
        <div className="space-y-4">
          <Link
            href="/student"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to campus food</span>
          </Link>
          <DetailSkeleton />
        </div>
      </AppShell>
    );
  }

  if (notFound || !drop) {
    return (
      <AppShell variant="student" maxWidth="lg" bottomNav={bottomNav}>
        <div className="space-y-4">
          <Link
            href="/student"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to campus food</span>
          </Link>
          <EmptyState
            icon={<Utensils size={24} aria-hidden="true" />}
            title="This food listing is no longer available"
            description="It may have expired or been completely claimed. Check the campus feed for fresh listings."
            action={
              <Link href="/student" className="consumer-button">
                Browse campus food
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const title = summarizeDropItems(drop);
  const hostNote = formatConsumerHostNote(drop.vision?.notes);
  const locationText = formatConsumerDropLocation(drop, buildings);
  const pickupNote = getDropPickupInstructions(drop);
  const directionsUrl = getDropWalkingDirectionsUrl(drop);
  const remainingWindow = formatRemainingTime(drop.expires_at, nowIso);
  const isExpired = drop.status === "expired" || remainingWindow === "Expired";
  const isAvailable =
    drop.status === "live" && drop.counts.available > 0 && !isExpired;

  const canReserve = Boolean(feedDrop?.can_reserve && isAvailable);
  const unavailableText =
    formatUnavailableReason(feedDrop?.unavailable_reason, claimForThisDrop) ??
    (isExpired
      ? "This pickup window has ended."
      : drop.counts.available <= 0
        ? "All servings have been reserved or picked up."
        : "This listing is currently unavailable to reserve.");

  const servingsLabel = isExpired
    ? "Ended"
    : drop.counts.available > 0
      ? `${drop.counts.available} of ${drop.counts.total} left`
      : "All reserved";

  const servingsTone: "gold" | "success" | "warning" | "neutral" = isExpired
    ? "neutral"
    : drop.counts.available <= 0
      ? "warning"
      : drop.counts.available <= 2
        ? "warning"
        : "success";

  return (
    <AppShell variant="student" maxWidth="lg" bottomNav={bottomNav}>
      <div className="space-y-6">
        {/* Back link */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/student"
            data-testid="detail-back-link"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to campus food</span>
          </Link>
          {drop.building && (
            <Link
              href={`/student?tab=map&drop=${encodeURIComponent(drop.id)}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-owl-goldText hover:underline"
            >
              <MapPin size={14} aria-hidden="true" />
              <span>View on map</span>
            </Link>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
          >
            {errorMessage}
          </div>
        )}

        {/* Hero Photo */}
        <DropPhoto
          dropId={drop.id}
          hasPhoto={drop.has_photo}
          photoUrl={drop.photo_url}
          authToken={authToken}
          alt={title}
          aspect="hero"
          testId="detail-hero-photo"
          overlayTopLeft={<StatusBadge tone="gold">FREE</StatusBadge>}
          overlayTopRight={
            <StatusBadge tone={servingsTone}>{servingsLabel}</StatusBadge>
          }
        />

        {/* Title, Host Note & Timing Summary */}
        <section className="space-y-3">
          <div className="space-y-1.5">
            <h1
              data-testid="detail-food-title"
              className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
            >
              {title}
            </h1>
            {hostNote && (
              <p className="text-sm leading-relaxed text-ink-muted">
                {hostNote}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-ink">
              <Utensils
                size={13}
                className="text-owl-goldText"
                aria-hidden="true"
              />
              <span className="tabular-nums">
                {drop.counts.available} of {drop.counts.total} servings left
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-ink">
              <Clock
                size={13}
                className="text-owl-goldText"
                aria-hidden="true"
              />
              <span className="tabular-nums">
                {isExpired
                  ? "Pickup window ended"
                  : `Pickup until ${formatEasternTime(drop.expires_at)} (${remainingWindow} left)`}
              </span>
            </span>
          </div>
        </section>

        {/* Active Hold Card OR Primary Action */}
        {claimForThisDrop?.status === "held" ? (
          <div className="space-y-3">
            <ActiveHoldCard
              drop={drop}
              claim={claimForThisDrop}
              authToken={authToken}
              nowIso={nowIso}
              pickupVerification={pickupVerification}
              pickupPreviewUrl={pickupPreviewUrl}
              pickupError={pickupError}
              hasRetryablePhoto={Boolean(pickupPhotoFile && pickupRequestId)}
              busyId={busyId}
              showPhoto={false}
              showDetailsLink={false}
              onSelectPickupPhoto={handleSelectPickupPhoto}
              onRetrySamePickupPhoto={handleRetrySamePickupPhoto}
              onRequestHostReview={handleRequestHostReview}
              onConfirmPickup={handleConfirmPickup}
              onReleaseReservation={handleReleaseReservation}
              onClearSelectedPhoto={clearSelectedPickupPhoto}
            />
            <div className="text-center">
              <Link
                href="/student?tab=reservations"
                className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-owl-goldText hover:underline"
              >
                <ShoppingBag size={14} aria-hidden="true" />
                <span>Manage in Reservations</span>
              </Link>
            </div>
          </div>
        ) : claimForThisDrop?.status === "picked_up" ? (
          <section
            data-testid="detail-picked-up-banner"
            className="consumer-card space-y-3 border-success/40 bg-success-tint"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={22}
                className="mt-0.5 shrink-0 text-success"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="text-base font-extrabold text-ink">
                  Pickup confirmed
                </h2>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Thanks for helping keep campus food out of the landfill.
                </p>
              </div>
            </div>
            <p className="rounded-xl bg-surface/80 px-3 py-2 text-xs text-ink-muted">
              {PICKUP_CONFIRMATION_NOTICE}
            </p>
            <Link
              href="/student?tab=reservations"
              className="consumer-button-secondary w-full"
            >
              View reservation history
            </Link>
          </section>
        ) : (
          <section className="consumer-card space-y-3">
            {canReserve ? (
              <>
                <button
                  type="button"
                  data-testid="detail-reserve-btn"
                  disabled={busyId !== null}
                  onClick={handleReserve}
                  className="consumer-button w-full text-base"
                >
                  {busyId === `reserve:${drop.id}`
                    ? "Reserving your serving..."
                    : "Reserve 1 serving"}
                </button>
                <p className="text-center text-xs text-ink-muted">
                  Reserves 1 serving for 10 minutes while you walk to pickup.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink">
                  <Info
                    size={16}
                    className="mt-0.5 shrink-0 text-ink-muted"
                    aria-hidden="true"
                  />
                  <span>{unavailableText}</span>
                </div>
                {feedDrop?.unavailable_reason === "active_claim" && (
                  <Link
                    href="/student?tab=reservations"
                    className="consumer-button w-full"
                  >
                    <ShoppingBag size={16} aria-hidden="true" />
                    <span>View your active reservation</span>
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        {/* Itemized Food List */}
        {drop.vision?.items && drop.vision.items.length > 0 && (
          <section className="consumer-card space-y-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">
              What&apos;s available
            </h2>
            <ul className="divide-y divide-line">
              {drop.vision.items.map((item, idx) => (
                <li
                  key={`${item.name}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold tabular-nums text-ink-muted">
                    ~{item.count_estimate} {item.portion_unit}
                    {item.count_estimate === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pickup Location Card */}
        <section className="consumer-card space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">
            Pickup location
          </h2>
          <div className="space-y-2">
            <div
              data-testid="detail-location"
              className="flex items-start gap-2.5 text-sm font-bold text-ink"
            >
              <MapPin
                size={16}
                className="mt-0.5 shrink-0 text-owl-goldText"
                aria-hidden="true"
              />
              <span>{locationText}</span>
            </div>
            {pickupNote && (
              <div
                data-testid="detail-pickup-instructions"
                className="rounded-2xl bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-ink"
              >
                <strong className="font-bold">Pickup note:</strong> {pickupNote}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Clock size={14} className="shrink-0" aria-hidden="true" />
              <span>Available until {formatEasternTime(drop.expires_at)}</span>
            </div>
          </div>

          {directionsUrl && (
            <a
              data-testid="detail-directions-link"
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="consumer-button-secondary w-full"
            >
              <Navigation size={16} aria-hidden="true" />
              <span>Walking directions</span>
            </a>
          )}
        </section>

        {/* Dietary Tags & Allergen Card */}
        <section className="space-y-3">
          {drop.diet_tags_final.length > 0 && (
            <div className="consumer-card space-y-2.5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">
                Dietary labels
              </h2>
              <div className="flex flex-wrap gap-2">
                {drop.diet_tags_final.map((tag) => (
                  <StatusBadge key={tag} tone="success">
                    {formatDietLabel(tag)}
                  </StatusBadge>
                ))}
              </div>
            </div>
          )}

          <AllergenCard
            allergens={drop.allergens_final}
            notice={drop.allergen_notice}
            title="Allergens"
          />
        </section>
      </div>
    </AppShell>
  );
}
