"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  Navigation,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  User,
  X,
} from "lucide-react";
import { AppShell } from "../../components/ui/AppShell";
import { AllergenCard } from "../../components/ui/AllergenCard";
import { AnimatedNumber } from "../../components/ui/AnimatedNumber";
import { BottomNav, type StudentTabId } from "../../components/ui/BottomNav";
import { DropPhoto } from "../../components/ui/DropPhoto";
import { EmptyState } from "../../components/ui/EmptyState";
import { FoodCard } from "../../components/ui/FoodCard";
import {
  FoodCardSkeleton,
  ListRowSkeleton,
} from "../../components/ui/Skeleton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { PushOptIn } from "../../components/PushOptIn";
import { StudentCampusMap } from "../../components/StudentCampusMap";
import { ActiveHoldCard } from "../../components/student/ActiveHoldCard";
import { entranceDelayMs, OWL_MOTION_CLASSES } from "../../lib/motion";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type Building,
  type Diet,
  type DropResponse,
  type FeedDrop,
  type InviteResponse,
  type PickupVerification,
  type SessionStudent,
  type StudentReservationItem,
} from "../../lib/types/api";
import {
  claimInvite,
  declineInvite,
  getBuildings,
  getMyFeed,
  getMyInvites,
  getMyReservations,
  getMySession,
  getPickupVerification,
  leaveDemoSession,
  pickupClaim,
  releaseClaim,
  requestPickupReview,
  reserveDrop,
  submitPickupPhoto,
  updateMyPreferences,
} from "../../lib/api-client";
import {
  clearSessionToken,
  getSessionToken,
  handleUnauthorizedError,
  parseSeededPersonaParam,
} from "../../lib/session";
import { usePushOptIn } from "../../lib/push";
import { useTheme, type ThemePreference } from "../../lib/theme";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";
import {
  filterStudentFeedDrops,
  formatConsumerDropLocation,
  formatDietarySummary,
  formatEasternDateTime,
  formatGreeting,
  formatReservationStatusMeta,
  formatUnavailableReason,
  generatePickupRequestId,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
  parseStudentTabParam,
  partitionReservations,
  resolveStudentCardState,
  resolveStudentFeedView,
  revokePreviewObjectUrl,
  STUDENT_FILTER_CHIPS,
  summarizeDropFood,
  summarizeDropItems,
  validatePickupPhotoFile,
  type StudentFilterChipId,
} from "./student-helpers";

const THEME_OPTIONS: ReadonlyArray<{
  id: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

function StudentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
  const tabParam = searchParams.get("tab");
  const linkedDropId = searchParams.get("drop");
  const linkedInviteId = searchParams.get("invite");
  const seededPersona = parseSeededPersonaParam(personaParam);
  const activeTab: StudentTabId = parseStudentTabParam(tabParam);

  const { preference: themePreference, setPreference: setThemePreference } =
    useTheme();

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionStudent, setSessionStudent] = useState<SessionStudent | null>(
    null,
  );

  // Feed, map reference buildings, and reservations state
  const [feedDrops, setFeedDrops] = useState<FeedDrop[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [feedServerTime, setFeedServerTime] = useState<string | null>(null);
  const [feedReceivedAt, setFeedReceivedAt] = useState<number | null>(null);
  const [referenceBuildings, setReferenceBuildings] = useState<Building[]>([]);
  const [reservations, setReservations] = useState<StudentReservationItem[]>(
    [],
  );
  const [reservationsLoaded, setReservationsLoaded] = useState(false);

  // Home search & category chips
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<StudentFilterChipId>("all");

  // Photo-assisted pickup state for active held reservation
  const [pickupVerification, setPickupVerification] =
    useState<PickupVerification | null>(null);
  const [pickupPhotoFile, setPickupPhotoFile] = useState<File | null>(null);
  const [pickupRequestId, setPickupRequestId] = useState<string | null>(null);
  const [pickupPreviewUrl, setPickupPreviewUrl] = useState<string | null>(null);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const pickupPreviewUrlRef = useRef<string | null>(null);

  // Editable preferences & alert pause (Profile tab)
  const [prefAllergens, setPrefAllergens] = useState<Allergen[]>([]);
  const [prefDiets, setPrefDiets] = useState<Diet[]>([]);
  const [alertsPaused, setAlertsPaused] = useState<boolean>(false);
  const [prefsStatus, setPrefsStatus] = useState<string | null>(null);

  // Seeded rehearsal state (?persona=A..E)
  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState<boolean>(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const push = usePushOptIn(authToken, seededPersona !== null);

  const handleSelectTab = useCallback(
    (nextTab: StudentTabId) => {
      setErrorMessage(null);
      const params = new URLSearchParams();
      params.set("tab", nextTab);
      if (nextTab === "map" && linkedDropId) {
        params.set("drop", linkedDropId);
      }
      router.replace(`/student?${params.toString()}`, { scroll: false });
    },
    [linkedDropId, router],
  );

  // Deep-link compatibility: /student?drop=<id> (without tab=map) navigates to /student/drops/<id>
  useEffect(() => {
    if (seededPersona) return;
    const cleanDrop = linkedDropId?.trim();
    if (cleanDrop && activeTab !== "map") {
      router.replace(`/student/drops/${encodeURIComponent(cleanDrop)}`);
    }
  }, [activeTab, linkedDropId, router, seededPersona]);

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
      if (!seededPersona) {
        const authResult = handleUnauthorizedError(err);
        if (authResult.isUnauthorized) {
          router.replace(authResult.redirectTo);
          return;
        }
      }
      setErrorMessage(err instanceof Error ? err.message : fallbackMessage);
    },
    [router, seededPersona],
  );

  // Resolve session token or rehearsal persona on mount
  useEffect(() => {
    if (seededPersona) {
      setAuthToken(seededPersona.token);
      setSessionStudent(null);
      setAuthChecked(true);
      return;
    }

    const storedToken = getSessionToken();
    if (!storedToken) {
      router.replace("/join");
      return;
    }

    setAuthToken(storedToken);
    setAuthChecked(true);
  }, [router, seededPersona]);

  // Fetch visitor profile & verified building directory
  useEffect(() => {
    if (!authChecked || !authToken || seededPersona) return;
    let active = true;

    getMySession(authToken)
      .then((res) => {
        if (!active) return;
        setSessionStudent(res.data);
        setPrefAllergens([...res.data.allergens]);
        setPrefDiets([...res.data.diets]);
      })
      .catch((err) => {
        if (!active) return;
        onApiError(err, "Could not load your profile.");
      });

    getBuildings()
      .then((res) => {
        if (!active) return;
        setReferenceBuildings(res.data.buildings);
      })
      .catch(() => {
        // Campus map gracefully falls back to active listing coordinates.
      });

    return () => {
      active = false;
    };
  }, [authChecked, authToken, onApiError, seededPersona]);

  const loadFeed = useCallback(async () => {
    if (!authToken || seededPersona) return;
    try {
      const res = await getMyFeed(authToken);
      const received = Date.now();
      setFeedDrops(res.data.drops);
      setFeedServerTime(res.data.server_time ?? null);
      setFeedReceivedAt(received);
      setFeedLoaded(true);
      setNowTick(received);
    } catch (err) {
      onApiError(err, "Could not refresh available food.");
    }
  }, [authToken, onApiError, seededPersona]);

  const loadReservations = useCallback(async () => {
    if (!authToken || seededPersona) return;
    try {
      const res = await getMyReservations(authToken);
      setReservations(res.data.reservations);
      setReservationsLoaded(true);
    } catch (err) {
      const authResult = handleUnauthorizedError(err);
      if (authResult.isUnauthorized) {
        router.replace(authResult.redirectTo);
        return;
      }
      setReservationsLoaded(true);
    }
  }, [authToken, router, seededPersona]);

  const loadInvites = useCallback(async () => {
    if (!authToken || !seededPersona) return;
    try {
      const res = await getMyInvites(authToken);
      setInvites(res.data.invites);
      setInvitesLoaded(true);
      setNowTick(Date.now());
    } catch (err) {
      onApiError(err, "Could not refresh invites.");
    }
  }, [authToken, onApiError, seededPersona]);

  // Poll feed / invites every 2s
  useEffect(() => {
    if (!authChecked || !authToken) return;
    if (seededPersona) {
      void loadInvites();
      const intervalId = setInterval(() => {
        void loadInvites();
      }, 2000);
      return () => clearInterval(intervalId);
    }
    void loadFeed();
    void loadReservations();
    const intervalId = setInterval(() => {
      void loadFeed();
    }, 2000);
    return () => clearInterval(intervalId);
  }, [
    authChecked,
    authToken,
    loadFeed,
    loadInvites,
    loadReservations,
    seededPersona,
  ]);

  // Refresh reservation history when opening Reservations tab and every 4s while viewing it
  useEffect(() => {
    if (
      !authChecked ||
      !authToken ||
      seededPersona ||
      activeTab !== "reservations"
    ) {
      return;
    }
    void loadReservations();
    const intervalId = setInterval(() => {
      void loadReservations();
    }, 4000);
    return () => clearInterval(intervalId);
  }, [activeTab, authChecked, authToken, loadReservations, seededPersona]);

  // Identify active held claim and poll pickup verification status
  const activeFeedHoldClaimId = !seededPersona
    ? (feedDrops.find((fd) => fd.claim?.status === "held")?.claim?.id ??
      reservations.find((r) => r.claim.status === "held")?.claim.id ??
      null)
    : null;

  const loadPickupVerification = useCallback(
    async (claimId: string) => {
      if (!authToken || seededPersona) return;
      try {
        const res = await getPickupVerification(claimId, authToken);
        setPickupVerification(res.data.verification);
      } catch (err) {
        const status =
          typeof err === "object" && err !== null && "status" in err
            ? (err as { status?: unknown }).status
            : undefined;
        if (status === 404) {
          setPickupVerification(null);
          return;
        }
        onApiError(err, "Could not load pickup check status.");
      }
    },
    [authToken, onApiError, seededPersona],
  );

  useEffect(() => {
    if (!authChecked || !authToken || seededPersona || !activeFeedHoldClaimId) {
      setPickupVerification(null);
      clearSelectedPickupPhoto();
      setPickupError(null);
      return;
    }

    void loadPickupVerification(activeFeedHoldClaimId);
    const intervalId = setInterval(() => {
      void loadPickupVerification(activeFeedHoldClaimId);
    }, 2000);
    return () => clearInterval(intervalId);
  }, [
    activeFeedHoldClaimId,
    authChecked,
    authToken,
    clearSelectedPickupPhoto,
    loadPickupVerification,
    seededPersona,
  ]);

  // 1s tick for live countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleReserveDrop = async (dropId: string) => {
    if (!authToken) return;
    setBusyId(dropId);
    setErrorMessage(null);
    setPickupError(null);
    try {
      await reserveDrop(dropId, authToken);
      await Promise.all([loadFeed(), loadReservations()]);
      handleSelectTab("reservations");
    } catch (err) {
      onApiError(err, "Could not reserve this serving.");
      await Promise.all([loadFeed(), loadReservations()]);
    } finally {
      setBusyId(null);
    }
  };

  const handleClaimInvite = async (inviteId: string) => {
    if (!authToken) return;
    setBusyId(inviteId);
    setErrorMessage(null);
    try {
      await claimInvite(inviteId, authToken);
      await loadInvites();
    } catch (err) {
      onApiError(err, "Could not reserve this serving.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    if (!authToken) return;
    setBusyId(inviteId);
    setErrorMessage(null);
    try {
      await declineInvite(inviteId, authToken);
      await loadInvites();
    } catch (err) {
      onApiError(err, "Could not decline this invite.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReleaseClaim = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    setPickupError(null);
    try {
      await releaseClaim(claimId, authToken);
      clearSelectedPickupPhoto();
      setPickupVerification(null);
      if (seededPersona) {
        await loadInvites();
      } else {
        await Promise.all([loadFeed(), loadReservations()]);
      }
    } catch (err) {
      onApiError(err, "Could not release your reservation.");
    } finally {
      setBusyId(null);
    }
  };

  const uploadSelectedPickupPhoto = async (
    claimId: string,
    file: File,
    requestId: string,
  ) => {
    if (!authToken) return;
    setBusyId(`pickup-photo:${claimId}`);
    setErrorMessage(null);
    setPickupError(null);
    try {
      const res = await submitPickupPhoto(claimId, file, requestId, authToken);
      setPickupVerification(res.data);
      clearSelectedPickupPhoto();
      await Promise.all([loadFeed(), loadReservations()]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not check your pickup photo. Please try again.";
      setPickupError(msg);
      if (!seededPersona) {
        const authResult = handleUnauthorizedError(err);
        if (authResult.isUnauthorized) {
          router.replace(authResult.redirectTo);
          return;
        }
      }
      await Promise.all([
        loadFeed(),
        loadReservations(),
        loadPickupVerification(claimId),
      ]);
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectPickupPhoto = (
    claimId: string,
    file: File | null | undefined,
  ) => {
    setErrorMessage(null);
    setPickupError(null);
    if (!file) return;

    const validation = validatePickupPhotoFile(file);
    if (!validation.valid) {
      clearSelectedPickupPhoto();
      setPickupError(validation.error);
      return;
    }

    if (pickupPreviewUrlRef.current) {
      revokePreviewObjectUrl(pickupPreviewUrlRef.current);
      pickupPreviewUrlRef.current = null;
    }

    const freshRequestId = generatePickupRequestId();
    setPickupPhotoFile(file);
    setPickupRequestId(freshRequestId);

    if (
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      try {
        const objUrl = URL.createObjectURL(file);
        pickupPreviewUrlRef.current = objUrl;
        setPickupPreviewUrl(objUrl);
      } catch {
        setPickupPreviewUrl(null);
      }
    }

    void uploadSelectedPickupPhoto(claimId, file, freshRequestId);
  };

  const handleRetrySamePickupPhoto = async (claimId: string) => {
    if (!pickupPhotoFile || !pickupRequestId) return;
    await uploadSelectedPickupPhoto(claimId, pickupPhotoFile, pickupRequestId);
  };

  const handleRequestHostReview = async (
    claimId: string,
    verificationId: string,
  ) => {
    if (!authToken) return;
    setBusyId(`pickup-review:${claimId}`);
    setErrorMessage(null);
    setPickupError(null);
    try {
      const res = await requestPickupReview(claimId, verificationId, authToken);
      setPickupVerification(res.data);
      await Promise.all([loadFeed(), loadReservations()]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not request host review.";
      setPickupError(msg);
      onApiError(err, "Could not request host review.");
      await Promise.all([
        loadFeed(),
        loadReservations(),
        loadPickupVerification(claimId),
      ]);
    } finally {
      setBusyId(null);
    }
  };

  const handlePickupClaim = async (
    claimId: string,
    verificationId?: string | null,
  ) => {
    if (!authToken) return;
    if (!seededPersona && !verificationId) {
      setPickupError("Take a pickup food photo first to confirm pickup.");
      return;
    }
    setBusyId(claimId);
    setErrorMessage(null);
    setPickupError(null);
    try {
      await pickupClaim(
        claimId,
        authToken,
        verificationId ? { verification_id: verificationId } : undefined,
      );
      clearSelectedPickupPhoto();
      setPickupVerification(null);
      if (seededPersona) {
        await loadInvites();
      } else {
        await Promise.all([loadFeed(), loadReservations()]);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not confirm pickup.";
      setPickupError(msg);
      onApiError(err, "Could not confirm pickup.");
      if (!seededPersona) {
        await Promise.all([
          loadFeed(),
          loadReservations(),
          loadPickupVerification(claimId),
        ]);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePreferences = async (
    nextAllergens: Allergen[],
    nextDiets: Diet[],
    nextAlertsPaused: boolean,
  ) => {
    if (!authToken || seededPersona) return;
    setBusyId("preferences");
    setErrorMessage(null);
    setPrefsStatus(null);
    try {
      const res = await updateMyPreferences(
        {
          allergens: nextAllergens,
          diets: nextDiets,
          alerts_paused: nextAlertsPaused,
        },
        authToken,
      );
      setPrefAllergens([...res.data.allergens]);
      setPrefDiets([...res.data.diets]);
      setAlertsPaused(res.data.alerts_paused);
      setSessionStudent((prev) =>
        prev
          ? {
              ...prev,
              allergens: [...res.data.allergens],
              diets: [...res.data.diets],
            }
          : prev,
      );
      setPrefsStatus("Preferences saved.");
      await loadFeed();
    } catch (err) {
      onApiError(err, "Could not save preferences.");
    } finally {
      setBusyId(null);
    }
  };

  const togglePrefAllergen = (alg: Allergen) => {
    setPrefAllergens((prev) =>
      prev.includes(alg) ? prev.filter((a) => a !== alg) : [...prev, alg],
    );
    setPrefsStatus(null);
  };

  const togglePrefDiet = (diet: Diet) => {
    setPrefDiets((prev) =>
      prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet],
    );
    setPrefsStatus(null);
  };

  const handleSignOut = async () => {
    setBusyId("leave");
    setErrorMessage(null);
    try {
      if (authToken && !seededPersona) {
        await leaveDemoSession(authToken);
      }
    } catch {
      // Clear local session even if already expired server-side
    } finally {
      clearSessionToken();
      setBusyId(null);
      router.replace("/join");
    }
  };

  const serverClockMs =
    !seededPersona && feedServerTime && feedReceivedAt !== null
      ? Date.parse(feedServerTime) + Math.max(0, nowTick - feedReceivedAt)
      : nowTick;
  const effectiveNowMs = Number.isFinite(serverClockMs)
    ? serverClockMs
    : nowTick;
  const nowIso = new Date(effectiveNowMs).toISOString();

  const feedView = useMemo(
    () => resolveStudentFeedView(feedDrops, linkedDropId),
    [feedDrops, linkedDropId],
  );

  const filteredHomeDrops = useMemo(
    () =>
      filterStudentFeedDrops(feedView.orderedDrops, {
        query: searchQuery,
        category: activeCategory,
      }),
    [feedView.orderedDrops, searchQuery, activeCategory],
  );

  const partitionedReservations = useMemo(
    () => partitionReservations(reservations),
    [reservations],
  );

  const activeHoldEntry = useMemo(() => {
    if (feedView.activeHold) {
      return {
        drop: feedView.activeHold.feedDrop.drop,
        claim: feedView.activeHold.claim,
      };
    }
    if (partitionedReservations.active) {
      return {
        drop: partitionedReservations.active.drop,
        claim: partitionedReservations.active.claim,
      };
    }
    return null;
  }, [feedView.activeHold, partitionedReservations.active]);

  const campusMetrics = useMemo(() => {
    let availableServings = 0;
    let liveListings = 0;
    let compatibleListings = 0;
    for (const item of feedDrops) {
      if (item.drop.counts.available > 0) {
        availableServings += item.drop.counts.available;
        liveListings += 1;
        if (item.can_reserve || item.claim?.status === "held") {
          compatibleListings += 1;
        }
      }
    }
    return { availableServings, liveListings, compatibleListings };
  }, [feedDrops]);

  // Seeded rehearsal state (?persona=A..E)
  const cardState = useMemo(() => resolveStudentCardState(invites), [invites]);

  if (!authChecked || !authToken) {
    return (
      <AppShell variant="student">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FoodCardSkeleton />
          <FoodCardSkeleton />
          <FoodCardSkeleton />
        </div>
      </AppShell>
    );
  }

  const displayNickname = seededPersona
    ? `Persona ${seededPersona.label}`
    : (sessionStudent?.nickname ?? "Student");

  const dietarySummaryText = formatDietarySummary(prefAllergens, prefDiets);

  // ============================================================
  // SEEDED PERSONA REHEARSAL MODE (?persona=A..E)
  // ============================================================
  if (seededPersona) {
    const activeSeededDrop =
      cardState.kind === "invite" ||
      cardState.kind === "pickup" ||
      cardState.kind === "picked_up"
        ? cardState.activeInvite.drop
        : null;
    const activeSeededDropLocation = activeSeededDrop
      ? formatConsumerDropLocation(activeSeededDrop)
      : "";
    const activeSeededPickupInstructions = activeSeededDrop
      ? getDropPickupInstructions(activeSeededDrop)
      : null;
    const activeSeededDirectionsUrl = activeSeededDrop
      ? getDropWalkingDirectionsUrl(activeSeededDrop)
      : null;

    return (
      <AppShell variant="student" maxWidth="md">
        <div className={`space-y-5 ${OWL_MOTION_CLASSES.fade}`}>
          <section className="consumer-card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  data-testid="student-nickname"
                  className="truncate text-lg font-extrabold text-ink"
                >
                  {displayNickname}
                </h1>
                <StatusBadge tone="gold">
                  <span data-testid="seeded-persona-banner">Rehearsal</span>
                </StatusBadge>
              </div>
              <p className="text-xs text-ink-muted">Marietta Campus</p>
            </div>
            <Link
              href="/join"
              className={`consumer-button-secondary min-h-[44px] px-4 py-2 text-xs ${OWL_MOTION_CLASSES.press}`}
            >
              Join screen
            </Link>
          </section>

          {linkedInviteId &&
            invitesLoaded &&
            !invites.some(
              (inv) =>
                inv.id === linkedInviteId &&
                (inv.status === "sent" || inv.status === "claimed"),
            ) && (
              <p
                data-testid="invite-link-ended"
                className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted"
              >
                That invite has ended. Active food offers will appear here.
              </p>
            )}

          {errorMessage && (
            <div
              role="alert"
              data-testid="student-error-message"
              className={`rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger ${OWL_MOTION_CLASSES.fade}`}
            >
              {errorMessage}
            </div>
          )}

          {cardState.kind === "waiting" && (
            <EmptyState
              testId="no-invites-card"
              title="Waiting for a campus food offer"
              description={`When food matching ${displayNickname} becomes available, an offer will appear here. Allergens always say: ${ALLERGEN_WARNING_TEXT}.`}
            />
          )}

          {cardState.kind === "invite" && (
            <article
              data-testid={`invite-card-${cardState.activeInvite.id}`}
              className={`consumer-card space-y-5 border-owl-gold/60 ${OWL_MOTION_CLASSES.entrance}`}
            >
              <DropPhoto
                dropId={cardState.activeInvite.drop.id}
                hasPhoto={
                  (cardState.activeInvite.drop as DropResponse).has_photo
                }
                photoUrl={
                  (cardState.activeInvite.drop as DropResponse).photo_url
                }
                authToken={authToken}
                alt={summarizeDropFood(cardState.activeInvite)}
                overlayTopLeft={<StatusBadge tone="gold">FREE</StatusBadge>}
                overlayTopRight={
                  <StatusBadge tone="neutral">
                    <span
                      data-testid={`invite-countdown-${cardState.activeInvite.id}`}
                      className="tabular-nums"
                    >
                      {formatRemainingTime(
                        cardState.activeInvite.expires_at,
                        nowIso,
                      )}{" "}
                      left
                    </span>
                  </StatusBadge>
                }
              />

              <div className="space-y-1.5">
                <h2 className="text-xl font-extrabold text-ink">
                  {summarizeDropFood(cardState.activeInvite)}
                </h2>
                <p
                  data-testid="invite-drop-location"
                  className="flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                >
                  <MapPin size={15} aria-hidden="true" />
                  <span>{activeSeededDropLocation}</span>
                </p>
                {activeSeededPickupInstructions && (
                  <p
                    data-testid="invite-pickup-instructions"
                    className="rounded-2xl bg-surface-subtle px-3.5 py-2.5 text-xs text-ink"
                  >
                    <strong>Pickup note:</strong>{" "}
                    {activeSeededPickupInstructions}
                  </p>
                )}
                <p className="text-xs text-ink-muted">
                  <AnimatedNumber
                    value={cardState.activeInvite.drop.counts.available}
                  />{" "}
                  of{" "}
                  <AnimatedNumber
                    value={cardState.activeInvite.drop.counts.total}
                  />{" "}
                  servings left
                </p>
              </div>

              {activeSeededDirectionsUrl && (
                <a
                  data-testid="get-directions-link"
                  href={activeSeededDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  <Navigation size={15} aria-hidden="true" />
                  <span>Walking directions</span>
                </a>
              )}

              <AllergenCard
                allergens={cardState.activeInvite.drop.allergens_final}
                notice={cardState.activeInvite.drop.allergen_notice}
                title="Allergens"
                compact
              />

              <div className="space-y-2.5">
                <button
                  type="button"
                  data-testid={`claim-invite-button-${cardState.activeInvite.id}`}
                  disabled={busyId !== null}
                  onClick={() =>
                    void handleClaimInvite(cardState.activeInvite.id)
                  }
                  className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  {busyId === cardState.activeInvite.id
                    ? "Reserving..."
                    : "Reserve — hold 10 min"}
                </button>
                <button
                  type="button"
                  data-testid={`decline-invite-button-${cardState.activeInvite.id}`}
                  disabled={busyId !== null}
                  onClick={() =>
                    void handleDeclineInvite(cardState.activeInvite.id)
                  }
                  className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  Decline
                </button>
              </div>
            </article>
          )}

          {cardState.kind === "pickup" && (
            <article
              data-testid="active-claim-banner"
              className={`consumer-card space-y-5 border-success/40 ${OWL_MOTION_CLASSES.entrance}`}
            >
              <div className="space-y-1.5">
                <StatusBadge tone="success">Active hold</StatusBadge>
                <h2 className="text-xl font-extrabold text-ink">
                  {summarizeDropFood(cardState.activeInvite)}
                </h2>
                <p
                  data-testid="pickup-drop-location"
                  className="flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                >
                  <MapPin size={15} aria-hidden="true" />
                  <span>{activeSeededDropLocation}</span>
                </p>
                {activeSeededPickupInstructions && (
                  <p
                    data-testid="pickup-instructions"
                    className="rounded-2xl bg-surface-subtle px-3.5 py-2.5 text-xs text-ink"
                  >
                    <strong>Pickup note:</strong>{" "}
                    {activeSeededPickupInstructions}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-success/30 bg-success-tint px-4 py-3">
                <div>
                  <div className="text-xs font-bold text-success">
                    10-minute hold countdown
                  </div>
                  <div className="text-xs text-ink-muted">
                    Until {formatEasternTime(cardState.activeClaim.held_until)}
                  </div>
                </div>
                <div
                  data-testid="hold-countdown"
                  className="text-xl font-extrabold tabular-nums text-success"
                >
                  {formatRemainingTime(
                    cardState.activeClaim.held_until,
                    nowIso,
                  )}
                </div>
              </div>

              {activeSeededDirectionsUrl && (
                <a
                  data-testid="get-directions-link"
                  href={activeSeededDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  <Navigation size={15} aria-hidden="true" />
                  <span>Walking directions</span>
                </a>
              )}

              <AllergenCard
                allergens={cardState.activeInvite.drop.allergens_final}
                notice={cardState.activeInvite.drop.allergen_notice}
                title="Allergens"
                compact
              />

              <div className="space-y-2.5">
                <button
                  type="button"
                  data-testid="pickup-confirm-button"
                  disabled={busyId !== null}
                  onClick={() =>
                    void handlePickupClaim(cardState.activeClaim.id)
                  }
                  className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  {busyId === cardState.activeClaim.id
                    ? "Confirming..."
                    : "Confirm pickup"}
                </button>
                <button
                  type="button"
                  data-testid="pickup-release-button"
                  disabled={busyId !== null}
                  onClick={() =>
                    void handleReleaseClaim(cardState.activeClaim.id)
                  }
                  className={`consumer-button-secondary w-full ${OWL_MOTION_CLASSES.press}`}
                >
                  Release reservation
                </button>
              </div>
            </article>
          )}

          {cardState.kind === "picked_up" && (
            <section
              data-testid="picked-up-card"
              className={`consumer-card space-y-4 border-success/40 text-center ${OWL_MOTION_CLASSES.pop}`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-tint text-success">
                <CheckCircle2 size={28} aria-hidden="true" />
              </div>
              <div data-testid="active-claim-banner" className="space-y-1">
                <h2 className="text-2xl font-extrabold text-ink">
                  Enjoy your meal
                </h2>
                <p className="text-sm text-ink-muted">
                  Picked up from{" "}
                  <strong className="text-ink">
                    {activeSeededDropLocation}
                  </strong>
                  .
                </p>
              </div>
              <p className="text-xs text-ink-muted">
                Allergens: {ALLERGEN_WARNING_TEXT}.
              </p>
            </section>
          )}

          {cardState.collapsedLines.length > 0 && (
            <section
              aria-label="Past offers"
              className="space-y-1.5 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              {cardState.collapsedLines.map((line) => (
                <p
                  key={line.id}
                  data-testid={`collapsed-invite-${line.id}`}
                  className="truncate text-xs text-ink-muted"
                >
                  {line.summary}
                </p>
              ))}
            </section>
          )}
        </div>
      </AppShell>
    );
  }

  // ============================================================
  // NORMAL JOINED STUDENT: 4-TAB CONSUMER EXPERIENCE
  // ============================================================
  return (
    <AppShell
      variant="student"
      bottomNav={
        <BottomNav
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          activeHoldCount={activeHoldEntry ? 1 : 0}
        />
      }
    >
      <div className="space-y-6">
        {errorMessage && (
          <div
            role="alert"
            data-testid="student-error-message"
            className={`flex items-start justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger ${OWL_MOTION_CLASSES.fade}`}
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setErrorMessage(null)}
              className="shrink-0 rounded-full p-1 hover:bg-surface/40"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ==================== TAB 1: HOME ==================== */}
        {activeTab === "home" && (
          <div
            key="tab-home"
            className={`space-y-6 ${OWL_MOTION_CLASSES.tabPanel}`}
          >
            {/* Greeting + Active Dietary Summary Pill */}
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h1
                  data-testid="student-nickname"
                  className="truncate text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
                >
                  {formatGreeting(displayNickname)}
                </h1>
                <p className="text-sm text-ink-muted">
                  Free campus food available around Marietta Campus
                </p>
              </div>
              <button
                type="button"
                data-testid="home-dietary-summary-pill"
                onClick={() => handleSelectTab("profile")}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink transition hover:border-owl-gold ${OWL_MOTION_CLASSES.press}`}
              >
                <SlidersHorizontal
                  size={14}
                  className="text-owl-goldText"
                  aria-hidden="true"
                />
                <span>{dietarySummaryText}</span>
              </button>
            </header>

            {/* Real-data animated campus availability summary */}
            {feedLoaded && feedDrops.length > 0 && (
              <section
                data-testid="student-campus-metrics"
                aria-label="Live campus food counts"
                className={`grid grid-cols-3 gap-2.5 sm:gap-3 ${OWL_MOTION_CLASSES.fade}`}
              >
                <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Servings open
                  </div>
                  <div
                    data-testid="student-metric-servings"
                    className="mt-0.5 text-xl font-extrabold tracking-tight text-success sm:text-2xl"
                  >
                    <AnimatedNumber value={campusMetrics.availableServings} />
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Active listings
                  </div>
                  <div
                    data-testid="student-metric-listings"
                    className="mt-0.5 text-xl font-extrabold tracking-tight text-ink sm:text-2xl"
                  >
                    <AnimatedNumber value={campusMetrics.liveListings} />
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Match your filters
                  </div>
                  <div
                    data-testid="student-metric-compatible"
                    className="mt-0.5 text-xl font-extrabold tracking-tight text-owl-goldText sm:text-2xl"
                  >
                    <AnimatedNumber value={campusMetrics.compatibleListings} />
                  </div>
                </div>
              </section>
            )}

            {/* Floating / Prominent Active Hold Banner */}
            {activeHoldEntry && (
              <section
                data-testid="home-active-hold-banner"
                aria-label="Active reservation"
                className={`flex flex-col justify-between gap-4 rounded-3xl border-2 border-success/50 bg-success-tint p-5 sm:flex-row sm:items-center ${OWL_MOTION_CLASSES.pop}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="success">Active hold</StatusBadge>
                    <span
                      data-testid="home-hold-countdown"
                      className="inline-flex items-center gap-1 text-xs font-extrabold tabular-nums text-success"
                    >
                      <Clock size={13} aria-hidden="true" />
                      <span>
                        {formatRemainingTime(
                          activeHoldEntry.claim.held_until,
                          nowIso,
                        )}{" "}
                        left
                      </span>
                    </span>
                  </div>
                  <h2 className="truncate text-base font-extrabold text-ink">
                    {summarizeDropItems(activeHoldEntry.drop)}
                  </h2>
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <MapPin size={13} aria-hidden="true" />
                    <span className="truncate">
                      {formatConsumerDropLocation(activeHoldEntry.drop)}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {getDropWalkingDirectionsUrl(activeHoldEntry.drop) && (
                    <a
                      href={getDropWalkingDirectionsUrl(activeHoldEntry.drop)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`consumer-button-secondary px-4 text-xs ${OWL_MOTION_CLASSES.press}`}
                    >
                      <Navigation size={14} aria-hidden="true" />
                      <span>Directions</span>
                    </a>
                  )}
                  <button
                    type="button"
                    data-testid="home-manage-hold-button"
                    onClick={() => handleSelectTab("reservations")}
                    className={`consumer-button px-5 text-xs ${OWL_MOTION_CLASSES.press}`}
                  >
                    <span>Manage pickup</span>
                  </button>
                </div>
              </section>
            )}

            {/* Instant Search Bar */}
            <div className="relative">
              <Search
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="search"
                data-testid="student-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food, buildings, or notes..."
                aria-label="Search campus food"
                className="consumer-input pl-11 pr-11"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Horizontal Scrollable Category & Dietary Chips (zero page overflow) */}
            <div
              role="region"
              aria-label="Food categories and dietary filters"
              className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
            >
              <div className="flex w-max items-center gap-2">
                {STUDENT_FILTER_CHIPS.map((chip) => {
                  const selected = activeCategory === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      data-testid={`category-chip-${chip.id}`}
                      aria-pressed={selected}
                      onClick={() => setActiveCategory(chip.id)}
                      className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-xs font-bold transition ${OWL_MOTION_CLASSES.press} ${
                        selected
                          ? "border-owl-gold bg-owl-gold text-owl-goldInk"
                          : "border-line bg-surface text-ink-muted hover:border-ink-muted/40 hover:text-ink"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feed Listings Grid */}
            {!feedLoaded ? (
              <div
                data-testid="home-feed-skeleton"
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                <FoodCardSkeleton />
                <FoodCardSkeleton />
                <FoodCardSkeleton />
              </div>
            ) : filteredHomeDrops.length === 0 ? (
              <EmptyState
                testId="empty-feed-card"
                title={
                  feedDrops.length === 0
                    ? "No food on campus right now"
                    : "No listings match your filter"
                }
                description={
                  feedDrops.length === 0
                    ? `When an event host shares leftover food on Marietta Campus, it will show up right here. Allergens always say: ${ALLERGEN_WARNING_TEXT}.`
                    : "Try switching categories or clearing your search to see other available food."
                }
                action={
                  feedDrops.length > 0 ? (
                    <button
                      type="button"
                      data-testid="clear-home-filters-button"
                      onClick={() => {
                        setSearchQuery("");
                        setActiveCategory("all");
                      }}
                      className={`consumer-button-secondary ${OWL_MOTION_CLASSES.press}`}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <section
                data-testid="campus-feed-list"
                aria-label="Available campus food"
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filteredHomeDrops.map((item, idx) => {
                  const { drop, can_reserve, unavailable_reason, claim } = item;
                  const isOwnHeld = claim?.status === "held";
                  const isOwnPickedUp = claim?.status === "picked_up";
                  const disabledReason = !can_reserve
                    ? formatUnavailableReason(unavailable_reason, claim)
                    : null;

                  const badge = isOwnHeld ? (
                    <StatusBadge tone="success">Held by you</StatusBadge>
                  ) : isOwnPickedUp ? (
                    <StatusBadge tone="success">Picked up</StatusBadge>
                  ) : drop.counts.available <= 0 ? (
                    <StatusBadge tone="neutral">Claimed out</StatusBadge>
                  ) : (
                    <StatusBadge tone="gold">FREE</StatusBadge>
                  );

                  return (
                    <FoodCard
                      key={drop.id}
                      index={idx}
                      drop={drop}
                      authToken={authToken}
                      href={`/student/drops/${drop.id}`}
                      badge={badge}
                      disabledReason={
                        !isOwnHeld && !isOwnPickedUp ? disabledReason : null
                      }
                      nowIso={nowIso}
                      testId={`feed-drop-card-${drop.id}`}
                      footer={
                        <div className="grid grid-cols-2 gap-2">
                          <Link
                            href={`/student/drops/${drop.id}`}
                            data-testid={`view-details-button-${drop.id}`}
                            className={`consumer-button-secondary px-3 text-xs ${OWL_MOTION_CLASSES.press}`}
                          >
                            View details
                          </Link>
                          {isOwnHeld ? (
                            <button
                              type="button"
                              onClick={() => handleSelectTab("reservations")}
                              className={`consumer-button px-3 text-xs ${OWL_MOTION_CLASSES.press}`}
                            >
                              View hold
                            </button>
                          ) : isOwnPickedUp ? (
                            <button
                              type="button"
                              disabled
                              className="consumer-button-secondary px-3 text-xs opacity-60"
                            >
                              Picked up
                            </button>
                          ) : (
                            <button
                              type="button"
                              data-testid={`reserve-drop-button-${drop.id}`}
                              disabled={!can_reserve || busyId !== null}
                              onClick={() => void handleReserveDrop(drop.id)}
                              className={`consumer-button px-3 text-xs ${OWL_MOTION_CLASSES.press}`}
                            >
                              {busyId === drop.id
                                ? "Reserving..."
                                : can_reserve
                                  ? "Reserve"
                                  : "Unavailable"}
                            </button>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </section>
            )}
          </div>
        )}

        {/* ==================== TAB 2: MAP ==================== */}
        {activeTab === "map" && (
          <div
            key="tab-map"
            className={`space-y-4 ${OWL_MOTION_CLASSES.tabPanel}`}
          >
            <header className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                Campus Map
              </h1>
              <p className="text-sm text-ink-muted">
                Tap a Marietta Campus building pin to preview food and get
                walking directions.
              </p>
            </header>

            <StudentCampusMap
              feedDrops={feedDrops}
              feedLoaded={feedLoaded}
              referenceBuildings={referenceBuildings}
              linkedDropId={linkedDropId}
              nowIso={nowIso}
              referenceNowMs={effectiveNowMs}
              busyId={busyId}
              authToken={authToken}
              onReserveDrop={handleReserveDrop}
              onSwitchToFeed={() => handleSelectTab("home")}
            />
          </div>
        )}

        {/* ==================== TAB 3: RESERVATIONS ==================== */}
        {activeTab === "reservations" && (
          <div
            key="tab-reservations"
            className={`mx-auto max-w-2xl space-y-6 ${OWL_MOTION_CLASSES.tabPanel}`}
          >
            <header className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                Reservations
              </h1>
              <p className="text-sm text-ink-muted">
                Manage your active pickup hold and view past pickups.
              </p>
            </header>

            {!feedLoaded && !reservationsLoaded ? (
              <div className="space-y-4">
                <ListRowSkeleton />
                <ListRowSkeleton />
              </div>
            ) : !activeHoldEntry &&
              partitionedReservations.history.length === 0 ? (
              <EmptyState
                testId="reservations-empty-state"
                icon={<ShoppingBag size={28} aria-hidden="true" />}
                title="No reservations yet"
                description="Reserve a serving from the Home feed or Campus Map to hold it for 10 minutes while you walk over."
                action={
                  <button
                    type="button"
                    onClick={() => handleSelectTab("home")}
                    className={`consumer-button ${OWL_MOTION_CLASSES.press}`}
                  >
                    Browse campus food
                  </button>
                }
              />
            ) : (
              <>
                {/* Active Hold */}
                {activeHoldEntry && (
                  <section
                    aria-label="Active reservation"
                    className="space-y-3"
                  >
                    <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">
                      Active reservation
                    </h2>
                    <ActiveHoldCard
                      drop={activeHoldEntry.drop}
                      claim={activeHoldEntry.claim}
                      authToken={authToken}
                      nowIso={nowIso}
                      pickupVerification={pickupVerification}
                      pickupPreviewUrl={pickupPreviewUrl}
                      pickupError={pickupError}
                      hasRetryablePhoto={Boolean(
                        pickupPhotoFile && pickupRequestId,
                      )}
                      busyId={busyId}
                      onSelectPickupPhoto={handleSelectPickupPhoto}
                      onRetrySamePickupPhoto={handleRetrySamePickupPhoto}
                      onRequestHostReview={handleRequestHostReview}
                      onConfirmPickup={handlePickupClaim}
                      onReleaseReservation={handleReleaseClaim}
                      onClearSelectedPhoto={clearSelectedPickupPhoto}
                    />
                  </section>
                )}

                {/* Past & Completed Reservations History */}
                {partitionedReservations.history.length > 0 && (
                  <section
                    data-testid="reservation-history-list"
                    aria-label="Past reservations"
                    className="space-y-3"
                  >
                    <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">
                      Past reservations (
                      <AnimatedNumber
                        value={partitionedReservations.history.length}
                      />
                      )
                    </h2>
                    <div className="space-y-3">
                      {partitionedReservations.history.map((item, idx) => {
                        const statusMeta = formatReservationStatusMeta(
                          item.claim.status,
                        );
                        const title = summarizeDropItems(item.drop);
                        const locationText = formatConsumerDropLocation(
                          item.drop,
                        );
                        return (
                          <article
                            key={item.claim.id}
                            data-testid={`reservation-history-item-${item.claim.id}`}
                            data-status={item.claim.status}
                            style={{
                              animationDelay: `${entranceDelayMs(idx)}ms`,
                            }}
                            className={`flex items-center gap-4 rounded-3xl border border-line bg-surface p-3.5 shadow-card ${OWL_MOTION_CLASSES.entrance}`}
                          >
                            <DropPhoto
                              dropId={item.drop.id}
                              hasPhoto={item.drop.has_photo}
                              photoUrl={item.drop.photo_url}
                              authToken={authToken}
                              alt={title}
                              aspect="square"
                              className="h-16 w-16 shrink-0 rounded-2xl"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="truncate text-sm font-extrabold text-ink">
                                  {title}
                                </h3>
                                <StatusBadge tone={statusMeta.tone}>
                                  {statusMeta.label}
                                </StatusBadge>
                              </div>
                              <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                                <MapPin
                                  size={12}
                                  className="shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{locationText}</span>
                              </p>
                              <p className="text-[11px] text-ink-muted">
                                {formatEasternDateTime(item.claim.held_until)}
                              </p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 4: PROFILE ==================== */}
        {activeTab === "profile" && (
          <div
            key="tab-profile"
            className={`mx-auto max-w-2xl space-y-6 ${OWL_MOTION_CLASSES.tabPanel}`}
          >
            {/* Student Identity Card */}
            <section className="consumer-card flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-owl-goldTint text-owl-goldText">
                <User size={26} aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    data-testid="student-nickname"
                    className="truncate text-xl font-extrabold tracking-tight text-ink"
                  >
                    {displayNickname}
                  </h1>
                  <StatusBadge tone="gold">Marietta Campus</StatusBadge>
                </div>
                <p className="text-xs text-ink-muted">{dietarySummaryText}</p>
              </div>
            </section>

            {/* Dietary & Allergen Preferences */}
            <section
              data-testid="student-preferences-panel"
              className="consumer-card space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-base font-bold text-ink">
                  Dietary &amp; allergen filters
                </h2>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Allergens always say:{" "}
                  <strong className="font-semibold text-ink">
                    {ALLERGEN_WARNING_TEXT}
                  </strong>
                  . Confirm ingredients directly with the host.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-ink">
                  Allergens to avoid
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALLERGENS.map((alg) => {
                    const active = prefAllergens.includes(alg);
                    return (
                      <button
                        key={alg}
                        type="button"
                        data-testid={`pref-allergen-${alg}`}
                        aria-pressed={active}
                        onClick={() => togglePrefAllergen(alg)}
                        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold capitalize transition ${OWL_MOTION_CLASSES.press} ${
                          active
                            ? "border-warning bg-warning-tint text-warning"
                            : "border-line bg-surface-subtle text-ink hover:border-ink-muted/40"
                        }`}
                      >
                        {active && <Check size={14} aria-hidden="true" />}
                        <span>{alg.replaceAll("_", " ")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-4">
                <div className="text-xs font-bold text-ink">
                  Dietary preferences
                </div>
                <div className="flex flex-wrap gap-2">
                  {DIETS.map((diet) => {
                    const active = prefDiets.includes(diet);
                    return (
                      <button
                        key={diet}
                        type="button"
                        data-testid={`pref-diet-${diet}`}
                        aria-pressed={active}
                        onClick={() => togglePrefDiet(diet)}
                        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold capitalize transition ${OWL_MOTION_CLASSES.press} ${
                          active
                            ? "border-success bg-success-tint text-success"
                            : "border-line bg-surface-subtle text-ink hover:border-ink-muted/40"
                        }`}
                      >
                        {active && <Check size={14} aria-hidden="true" />}
                        <span>{diet.replaceAll("_", " ")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {prefsStatus && (
                <p
                  data-testid="student-preferences-status"
                  className={`text-xs font-semibold text-success ${OWL_MOTION_CLASSES.pop}`}
                >
                  {prefsStatus}
                </p>
              )}

              <button
                type="button"
                data-testid="save-preferences-button"
                disabled={busyId !== null}
                onClick={() =>
                  void handleSavePreferences(
                    prefAllergens,
                    prefDiets,
                    alertsPaused,
                  )
                }
                className={`consumer-button w-full ${OWL_MOTION_CLASSES.press}`}
              >
                {busyId === "preferences" ? "Saving..." : "Save preferences"}
              </button>
            </section>

            {/* Notifications Card */}
            <section className="consumer-card space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-ink">
                    Food notifications
                  </h2>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Get notified when free food matching your dietary settings
                    is posted on campus.
                  </p>
                </div>
                {alertsPaused ? (
                  <BellOff
                    size={20}
                    className="shrink-0 text-ink-muted"
                    aria-hidden="true"
                  />
                ) : (
                  <Bell
                    size={20}
                    className="shrink-0 text-owl-goldText"
                    aria-hidden="true"
                  />
                )}
              </div>

              <PushOptIn
                role="student"
                state={push.state}
                onEnable={() => void push.enable()}
              />

              <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-surface-subtle px-4 py-3">
                <div className="space-y-0.5">
                  <span className="block text-sm font-semibold text-ink">
                    Pause food alerts
                  </span>
                  <span className="block text-xs text-ink-muted">
                    You can still browse and reserve food anytime.
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="student-alerts-paused-toggle"
                  checked={alertsPaused}
                  disabled={busyId === "preferences"}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAlertsPaused(checked);
                    void handleSavePreferences(
                      prefAllergens,
                      prefDiets,
                      checked,
                    );
                  }}
                  className="h-5 w-5 shrink-0 rounded accent-owl-gold"
                />
              </label>
            </section>

            {/* Appearance Selector */}
            <section className="consumer-card space-y-3">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-ink">Appearance</h2>
                <p className="text-xs text-ink-muted">
                  Choose light, dark, or match your device settings.
                </p>
              </div>
              <div
                role="group"
                aria-label="Theme preference"
                className="grid grid-cols-3 gap-2"
              >
                {THEME_OPTIONS.map(({ id, label, Icon }) => {
                  const selected = themePreference === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`profile-theme-${id}`}
                      aria-pressed={selected}
                      onClick={() => setThemePreference(id)}
                      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${OWL_MOTION_CLASSES.press} ${
                        selected
                          ? "border-owl-gold bg-owl-goldTint text-owl-goldText"
                          : "border-line bg-surface-subtle text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Sign Out */}
            <section className="consumer-card space-y-3">
              <p className="text-xs leading-relaxed text-ink-muted">
                Signing out releases any active reservation hold so another
                student on campus can reserve it.
              </p>
              <button
                type="button"
                data-testid="leave-demo-button"
                disabled={busyId !== null}
                onClick={() => void handleSignOut()}
                className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-danger/40 bg-danger-tint px-5 py-3 text-sm font-bold text-danger transition hover:opacity-90 disabled:opacity-50 ${OWL_MOTION_CLASSES.press}`}
              >
                <LogOut size={16} aria-hidden="true" />
                <span>
                  {busyId === "leave" ? "Signing out..." : "Sign out"}
                </span>
              </button>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <AppShell variant="student">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FoodCardSkeleton />
            <FoodCardSkeleton />
            <FoodCardSkeleton />
          </div>
        </AppShell>
      }
    >
      <StudentContent />
    </Suspense>
  );
}
