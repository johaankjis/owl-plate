"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { LayoutList, Plus } from "lucide-react";
import { AppShell } from "../../components/ui/AppShell";
import { DetailSkeleton } from "../../components/ui/Skeleton";
import type { RehearsalOption } from "../../components/BuildingSelector";
import { HostStepIndicator } from "../../components/host/HostStepIndicator";
import { HostPhotoStep } from "../../components/host/HostPhotoStep";
import { HostReviewStep } from "../../components/host/HostReviewStep";
import { HostListingDashboard } from "../../components/host/HostListingDashboard";
import { HostListingsView } from "../../components/host/HostListingsView";
import type {
  Building,
  DropEdit,
  DropResponse,
  HostPantryReferralResponse,
  HostPickupReview,
} from "../../lib/types/api";
import {
  confirmHostPantryHandoff,
  createDrop,
  decideHostPickupReview,
  getBuildings,
  getDrop,
  getHostDrops,
  getHostPantryReferral,
  getHostPickupReviews,
  publishDrop,
  requestHostPantryReferral,
  updateDrop,
} from "../../lib/api-client";
import { filterVerifiedBuildings } from "../../lib/buildings";
import { usePushOptIn } from "../../lib/push";
import {
  buildHostSafetyReview,
  buildPickupCompanionUrl,
  HOST_POLL_INTERVAL_MS,
  HOST_REHEARSAL_CODE,
  HOST_REHEARSAL_LOCATION_LABEL,
  hostWizardStepNumber,
  initialHostReviewForm,
  isHostRehearsalView,
  pickActiveHostDropId,
  resolveDefaultHostBuildingId,
  resolveHostStep,
  resolveHostStepAfterRefresh,
  restoreHostDropState,
  shouldPollHostPantryReferral,
  type HostReviewForm,
  type HostViewStep,
} from "./host-helpers";

const HOST_CREDENTIAL = "demo-host" as const;

const HOST_REHEARSAL_OPTIONS: ReadonlyArray<RehearsalOption> = [
  {
    id: HOST_REHEARSAL_CODE,
    label: HOST_REHEARSAL_LOCATION_LABEL,
    description: "Scripted rehearsal only. Not a real campus building.",
  },
];

type HostView = "share" | "listings";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function isCampusFeed(drop: DropResponse): boolean {
  return (drop.distribution_mode ?? "seeded_waves") === "campus_feed";
}

function HostPageContent() {
  const searchParams = useSearchParams();
  const linkedDropId = searchParams.get("drop");
  const rehearsal = isHostRehearsalView(searchParams.get("rehearsal"));
  const rehearsalOptions = rehearsal ? HOST_REHEARSAL_OPTIONS : [];

  const [view, setView] = useState<HostView>("share");
  const [restoring, setRestoring] = useState<boolean>(true);
  const [drop, setDrop] = useState<DropResponse | null>(null);
  const [viewStep, setViewStep] = useState<HostViewStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hostNote, setHostNote] = useState<string>("");
  const [form, setForm] = useState<HostReviewForm | null>(null);
  const [linkedDropError, setLinkedDropError] = useState<string | null>(null);
  const [pickupReviews, setPickupReviews] = useState<HostPickupReview[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [pantryData, setPantryData] =
    useState<HostPantryReferralResponse | null>(null);
  const [pantryError, setPantryError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [hostDrops, setHostDrops] = useState<DropResponse[] | null>(null);
  const [hostDropsLoading, setHostDropsLoading] = useState<boolean>(false);
  const [hostDropsError, setHostDropsError] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const buildingsRef = useRef<Building[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState<boolean>(true);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visionErrorMessage, setVisionErrorMessage] = useState<string | null>(
    null,
  );

  const hostPush = usePushOptIn(HOST_CREDENTIAL, { role: "host" });

  useEffect(() => {
    if (viewStep !== "counts") return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [viewStep]);

  const loadCampusBuildings = useCallback(async () => {
    setBuildingsLoading(true);
    setBuildingsError(null);
    try {
      const res = await getBuildings();
      const verified = filterVerifiedBuildings(res.data.buildings);
      buildingsRef.current = verified;
      setBuildings(verified);
    } catch (err) {
      setBuildingsError(errorText(err, "Could not load campus buildings."));
    } finally {
      setBuildingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampusBuildings();
  }, [loadCampusBuildings]);

  const loadHostDrops = useCallback(async () => {
    setHostDropsLoading(true);
    setHostDropsError(null);
    try {
      const res = await getHostDrops(HOST_CREDENTIAL);
      setHostDrops(res.data.drops);
    } catch (err) {
      setHostDropsError(errorText(err, "Could not load your listings."));
    } finally {
      setHostDropsLoading(false);
    }
  }, []);

  const loadDropExtras = useCallback(async (d: DropResponse) => {
    const [reviews, pantry] = await Promise.allSettled([
      getHostPickupReviews(d.id, HOST_CREDENTIAL),
      isCampusFeed(d)
        ? getHostPantryReferral(d.id, HOST_CREDENTIAL)
        : Promise.resolve(null),
    ]);
    if (reviews.status === "fulfilled")
      setPickupReviews(reviews.value.data.reviews);
    if (pantry.status === "fulfilled")
      setPantryData(pantry.value?.data ?? null);
  }, []);

  /** Make a drop the one on screen, seeding Review from it when it is a draft. */
  const openDrop = useCallback(
    (d: DropResponse, step: HostViewStep) => {
      setDrop(d);
      setViewStep(step);
      setForm(initialHostReviewForm(d, buildingsRef.current));
      setPickupReviews([]);
      setPantryData(null);
      setPantryError(null);
      setReviewError(null);
      if (step === "counts") void loadDropExtras(d);
    },
    [loadDropExtras],
  );

  // Restore the host's newest open listing (or a /host?drop=<id> deep link) from
  // their own listings, so no presenter endpoint is needed to recover the dashboard.
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setLinkedDropError(null);
    restoreHostDropState(
      async () => {
        const res = await getHostDrops(HOST_CREDENTIAL);
        return {
          data: { drop_id: pickActiveHostDropId(res.data.drops) },
          source: res.source,
        };
      },
      (dropId) => getDrop(dropId, HOST_CREDENTIAL),
      linkedDropId,
    )
      .then((restored) => {
        if (!active) return;
        setLinkedDropError(restored.linkedDropError ?? null);
        if (restored.drop) {
          openDrop(restored.drop, restored.step);
        } else {
          setDrop(null);
          setViewStep("upload");
        }
      })
      .catch((err) => {
        if (active)
          setErrorMessage(errorText(err, "Could not load your listing."));
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [linkedDropId, openDrop]);

  // Once buildings arrive, move a restored draft off the rehearsal placeholder.
  useEffect(() => {
    if (buildings.length === 0) return;
    setForm((prev) =>
      prev
        ? {
            ...prev,
            buildingId: resolveDefaultHostBuildingId(
              prev.buildingId,
              buildings,
            ),
          }
        : prev,
    );
  }, [buildings]);

  useEffect(() => {
    if (view === "listings") void loadHostDrops();
  }, [view, loadHostDrops]);

  // Keep the published listing's counts, review queue and pantry card fresh.
  const activeDropId = drop?.id ?? null;
  const activeDropStatus = drop?.status ?? null;
  const activeDropMode = drop?.distribution_mode ?? null;
  useEffect(() => {
    if (
      view !== "share" ||
      !activeDropId ||
      viewStep !== "counts" ||
      (activeDropStatus !== "live" && activeDropStatus !== "claimed_out")
    ) {
      return;
    }
    const pollPantry = shouldPollHostPantryReferral(
      {
        status: activeDropStatus,
        distribution_mode: activeDropMode ?? "seeded_waves",
      },
      viewStep,
    );
    let cancelled = false;
    const poll = async () => {
      const [dropResult, reviewsResult, pantryResult] =
        await Promise.allSettled([
          getDrop(activeDropId, HOST_CREDENTIAL),
          getHostPickupReviews(activeDropId, HOST_CREDENTIAL),
          pollPantry
            ? getHostPantryReferral(activeDropId, HOST_CREDENTIAL)
            : Promise.resolve(null),
        ]);
      if (cancelled) return;
      if (dropResult.status === "fulfilled") {
        const next = dropResult.value.data;
        setDrop(next);
        setViewStep((prev) => resolveHostStepAfterRefresh(prev, next));
      }
      if (reviewsResult.status === "fulfilled") {
        setPickupReviews(reviewsResult.value.data.reviews);
      }
      if (pantryResult.status === "fulfilled" && pantryResult.value !== null) {
        setPantryData(pantryResult.value.data);
      }
    };
    void poll();
    const intervalId = setInterval(() => void poll(), HOST_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [view, activeDropId, activeDropStatus, activeDropMode, viewStep]);

  const clearMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
    setVisionErrorMessage(null);
  };

  const submitPhotoUpload = async () => {
    setBusyAction("upload");
    clearMessages();
    try {
      if (!selectedFile) throw new Error("Choose a JPEG or PNG photo first.");
      const res = await createDrop(selectedFile, hostNote, HOST_CREDENTIAL);
      openDrop(res.data, resolveHostStep(res.data));
    } catch (err) {
      // Never show or invent an estimate when POST /drops fails.
      setDrop(null);
      setViewStep("upload");
      setVisionErrorMessage(
        errorText(err, "We couldn't analyze that photo. Please try again."),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const startNewListing = () => {
    setView("share");
    setDrop(null);
    setForm(null);
    setViewStep("upload");
    setSelectedFile(null);
    setHostNote("");
    setPickupReviews([]);
    setPantryData(null);
    setPantryError(null);
    setReviewError(null);
    clearMessages();
  };

  const buildDropEditPayload = (
    d: DropResponse,
    f: HostReviewForm,
  ): DropEdit => ({
    servings_final: f.servings,
    allergens_final: f.allergens,
    diet_tags_final: f.diets,
    building_code: f.buildingId.trim() || HOST_REHEARSAL_CODE,
    room: f.room.trim(),
    pickup_instructions: f.pickupInstructions.trim(),
    expires_in_minutes: f.expiresInMinutes,
    safety_review: buildHostSafetyReview(
      f.safety,
      d.vision.allergens_likely,
      f.allergens,
      f.diets,
    ),
  });

  const handlePublishDrop = async () => {
    if (!drop || !form) return;
    setBusyAction("publish");
    clearMessages();
    try {
      const patched = await updateDrop(
        drop.id,
        buildDropEditPayload(drop, form),
        HOST_CREDENTIAL,
      );
      const published = await publishDrop(patched.data.id, HOST_CREDENTIAL);
      openDrop(published.data, resolveHostStep(published.data));
      setSelectedFile(null);
      setStatusMessage(
        `Your listing is live with ${published.data.servings_final} servings.`,
      );
    } catch (err) {
      setErrorMessage(errorText(err, "Could not publish this listing."));
    } finally {
      setBusyAction(null);
    }
  };

  const refreshDropAndPantry = useCallback(async (dropId: string) => {
    const [dropRes, pantryRes] = await Promise.allSettled([
      getDrop(dropId, HOST_CREDENTIAL),
      getHostPantryReferral(dropId, HOST_CREDENTIAL),
    ]);
    if (dropRes.status === "fulfilled") {
      const next = dropRes.value.data;
      setDrop(next);
      setViewStep((prev) => resolveHostStepAfterRefresh(prev, next));
    }
    if (pantryRes.status === "fulfilled") setPantryData(pantryRes.value.data);
  }, []);

  const handleRequestPantryReferral = async (servings: number) => {
    if (!drop) return;
    setBusyAction("pantry:request");
    setPantryError(null);
    clearMessages();
    try {
      await requestHostPantryReferral(
        drop.id,
        { servings, demo_policy_acknowledged: true },
        HOST_CREDENTIAL,
      );
      await refreshDropAndPantry(drop.id);
      setStatusMessage(
        "Demo pantry referral requested. Nothing was sent to KSU CARE.",
      );
    } catch (err) {
      setPantryError(errorText(err, "Could not request the demo referral."));
      await refreshDropAndPantry(drop.id);
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmPantryHandoff = async () => {
    if (!drop) return;
    setBusyAction("pantry:handoff");
    setPantryError(null);
    clearMessages();
    try {
      await confirmHostPantryHandoff(
        drop.id,
        { demo_handoff_confirmed: true },
        HOST_CREDENTIAL,
      );
      await refreshDropAndPantry(drop.id);
      setStatusMessage(
        "Simulated pantry handoff recorded, separately from student pickups.",
      );
    } catch (err) {
      setPantryError(
        errorText(err, "Could not confirm the simulated handoff."),
      );
      await refreshDropAndPantry(drop.id);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshDropAndReviews = async (dropId: string) => {
    const [dropRes, reviewsRes] = await Promise.all([
      getDrop(dropId, HOST_CREDENTIAL),
      getHostPickupReviews(dropId, HOST_CREDENTIAL),
    ]);
    const next = dropRes.data;
    setDrop(next);
    setViewStep((prev) => resolveHostStepAfterRefresh(prev, next));
    setPickupReviews(reviewsRes.data.reviews);
  };

  const handleReviewDecision = async (
    verificationId: string,
    decision: "approve" | "reject",
  ) => {
    if (!drop) return;
    setBusyAction(`review:${verificationId}:${decision}`);
    setReviewError(null);
    clearMessages();
    try {
      await decideHostPickupReview(
        drop.id,
        verificationId,
        decision,
        HOST_CREDENTIAL,
      );
      await refreshDropAndReviews(drop.id);
      setStatusMessage(
        decision === "approve"
          ? "Pickup approved. Counts updated."
          : "We asked the student to retake their photo. Their hold stays active.",
      );
    } catch (err) {
      setReviewError(errorText(err, "Could not save your decision."));
      try {
        await refreshDropAndReviews(drop.id);
      } catch {
        // Keep the current queue on screen if the refresh also fails.
      }
    } finally {
      setBusyAction(null);
    }
  };

  const openListing = (d: DropResponse) => {
    clearMessages();
    setLinkedDropError(null);
    setView("share");
    openDrop(d, resolveHostStep(d));
  };

  const nowIso = new Date(nowTick).toISOString();
  const wizardStep = hostWizardStepNumber(viewStep);

  const viewSwitcher = (
    <div
      role="tablist"
      aria-label="Host views"
      className="grid grid-cols-2 gap-1 rounded-full bg-surface-subtle p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "share"}
        data-testid="host-view-share"
        onClick={() => setView("share")}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition ${
          view === "share"
            ? "bg-surface text-ink shadow-card"
            : "text-ink-muted"
        }`}
      >
        <Plus size={16} aria-hidden="true" />
        Share food
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "listings"}
        data-testid="host-view-listings"
        onClick={() => setView("listings")}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition ${
          view === "listings"
            ? "bg-surface text-ink shadow-card"
            : "text-ink-muted"
        }`}
      >
        <LayoutList size={16} aria-hidden="true" />
        My listings
      </button>
    </div>
  );

  return (
    <AppShell variant="host" maxWidth="md">
      <div data-testid="host-page" className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Share leftover food
          </h1>
          <p className="text-sm text-ink-muted">
            Post your event&apos;s extra food so students nearby can grab it.
          </p>
        </div>
        {viewSwitcher}

        {linkedDropError && (
          <p
            role="alert"
            data-testid="host-deep-link-error"
            className="rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning"
          >
            {linkedDropError}
          </p>
        )}
        {statusMessage && (
          <p
            role="status"
            data-testid="host-status-message"
            className="rounded-2xl bg-success-tint px-4 py-3 text-sm text-success"
          >
            {statusMessage}
          </p>
        )}
        {visionErrorMessage && (
          <div
            role="alert"
            data-testid="vision-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
          >
            <span>{visionErrorMessage}</span>
            <button
              type="button"
              data-testid="vision-retry-button"
              disabled={busyAction !== null || !selectedFile}
              onClick={() => void submitPhotoUpload()}
              className="consumer-button-secondary min-h-11 px-4 text-xs"
            >
              {busyAction === "upload" ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}
        {errorMessage && (
          <p
            role="alert"
            data-testid="host-error-message"
            className="rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger"
          >
            {errorMessage}
          </p>
        )}

        {view === "listings" ? (
          <HostListingsView
            drops={hostDrops}
            loading={hostDropsLoading}
            error={hostDropsError}
            authToken={HOST_CREDENTIAL}
            buildings={buildings}
            onOpen={openListing}
            onNew={startNewListing}
            onRefresh={() => void loadHostDrops()}
          />
        ) : restoring ? (
          <DetailSkeleton />
        ) : (
          <>
            <HostStepIndicator current={wizardStep} />

            {viewStep === "upload" && (
              <HostPhotoStep
                selectedFile={selectedFile}
                onFileChange={setSelectedFile}
                hostNote={hostNote}
                onHostNoteChange={setHostNote}
                busy={busyAction === "upload"}
                onSubmit={() => void submitPhotoUpload()}
              />
            )}

            {drop && form && viewStep === "review" && (
              <HostReviewStep
                drop={drop}
                form={form}
                onChange={(patch) =>
                  setForm((prev) => (prev ? { ...prev, ...patch } : prev))
                }
                authToken={HOST_CREDENTIAL}
                buildings={buildings}
                buildingsLoading={buildingsLoading}
                buildingsError={buildingsError}
                onRetryBuildings={() => void loadCampusBuildings()}
                rehearsalOptions={rehearsalOptions}
                busy={busyAction === "publish"}
                onPublish={() => void handlePublishDrop()}
                onStartOver={startNewListing}
              />
            )}

            {drop && viewStep === "counts" && (
              <HostListingDashboard
                drop={drop}
                authToken={HOST_CREDENTIAL}
                buildings={buildings}
                nowIso={nowIso}
                pickupReviews={pickupReviews}
                reviewError={reviewError}
                busyAction={busyAction}
                onDecideReview={(id, decision) =>
                  void handleReviewDecision(id, decision)
                }
                pantryData={pantryData}
                pantryError={pantryError}
                onRequestReferral={handleRequestPantryReferral}
                onConfirmHandoff={handleConfirmPantryHandoff}
                pushState={hostPush.state}
                onEnablePush={() => void hostPush.enable()}
                onDisablePush={() => void hostPush.disable()}
                companionUrl={buildPickupCompanionUrl(drop.id)}
                onShareAnother={startNewListing}
                onOpenListings={() => setView("listings")}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function HostPage() {
  return (
    <Suspense
      fallback={
        <AppShell variant="host" maxWidth="md">
          <DetailSkeleton />
        </AppShell>
      }
    >
      <HostPageContent />
    </Suspense>
  );
}
