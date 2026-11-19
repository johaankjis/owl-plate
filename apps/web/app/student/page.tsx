"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type Diet,
  type FeedDrop,
  type InviteResponse,
  type SessionStudent,
} from "../../lib/types/api";
import {
  claimInvite,
  declineInvite,
  getMyFeed,
  getMyInvites,
  getMySession,
  INITIAL_DATA_SOURCE,
  leaveDemoSession,
  pickupClaim,
  releaseClaim,
  reserveDrop,
  updateMyPreferences,
  type DataSourceMode,
} from "../../lib/api-client";
import {
  clearSessionToken,
  getSessionToken,
  handleUnauthorizedError,
  parseSeededPersonaParam,
} from "../../lib/session";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";
import { usePushOptIn } from "../../lib/push";
import { PushOptIn } from "../../components/PushOptIn";
import {
  formatDropResponseLocation,
  formatUnavailableReason,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
  resolveStudentCardState,
  resolveStudentFeedView,
  SEEDED_PERSONA_AREA_LABELS,
  summarizeDropFood,
  summarizeDropItems,
} from "./student-helpers";

function StudentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
  const linkedDropId = searchParams.get("drop");
  const linkedInviteId = searchParams.get("invite");
  const seededPersona = parseSeededPersonaParam(personaParam);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionStudent, setSessionStudent] = useState<SessionStudent | null>(
    null,
  );
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);

  // Campus feed state (normal joined students)
  const [feedDrops, setFeedDrops] = useState<FeedDrop[]>([]);
  const [feedLoaded, setFeedLoaded] = useState<boolean>(false);

  // Editable preferences & alert pause for joined visitor
  const [prefAllergens, setPrefAllergens] = useState<Allergen[]>([]);
  const [prefDiets, setPrefDiets] = useState<Diet[]>([]);
  const [alertsPaused, setAlertsPaused] = useState<boolean>(false);
  const [prefsStatus, setPrefsStatus] = useState<string | null>(null);

  // Seeded rehearsal state (?persona=A..E)
  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState<boolean>(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const push = usePushOptIn(authToken, seededPersona !== null);

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

  // Fetch visitor profile
  useEffect(() => {
    if (!authChecked || !authToken || seededPersona) return;
    let active = true;

    getMySession(authToken)
      .then((res) => {
        if (!active) return;
        setSessionStudent(res.data);
        setPrefAllergens([...res.data.allergens]);
        setPrefDiets([...res.data.diets]);
        setSourceMode(res.source);
      })
      .catch((err) => {
        if (!active) return;
        onApiError(err, "Could not load your session");
      });

    return () => {
      active = false;
    };
  }, [authChecked, authToken, onApiError, seededPersona]);

  const loadFeed = useCallback(async () => {
    if (!authToken || seededPersona) return;
    try {
      const res = await getMyFeed(authToken);
      setFeedDrops(res.data.drops);
      setFeedLoaded(true);
      setSourceMode(res.source);
      setNowTick(Date.now());
    } catch (err) {
      onApiError(err, "Could not refresh campus food feed");
    }
  }, [authToken, onApiError, seededPersona]);

  const loadInvites = useCallback(async () => {
    if (!authToken || !seededPersona) return;
    try {
      const res = await getMyInvites(authToken);
      setInvites(res.data.invites);
      setInvitesLoaded(true);
      setSourceMode(res.source);
      setNowTick(Date.now());
    } catch (err) {
      onApiError(err, "Could not refresh rehearsal invites");
    }
  }, [authToken, onApiError, seededPersona]);

  // Poll feed (for normal joined students) or invites (for seeded rehearsal) every 2s
  useEffect(() => {
    if (!authChecked || !authToken) return;
    if (seededPersona) {
      void loadInvites();
      const intervalId = setInterval(() => {
        void loadInvites();
      }, 2000);
      return () => clearInterval(intervalId);
    } else {
      void loadFeed();
      const intervalId = setInterval(() => {
        void loadFeed();
      }, 2000);
      return () => clearInterval(intervalId);
    }
  }, [authChecked, authToken, loadFeed, loadInvites, seededPersona]);

  // 1s tick to keep hold and expiry countdowns responsive
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
    try {
      const res = await reserveDrop(dropId, authToken);
      setSourceMode(res.source);
      await loadFeed();
    } catch (err) {
      onApiError(err, "Could not reserve this spot");
      await loadFeed();
    } finally {
      setBusyId(null);
    }
  };

  const handleClaim = async (inviteId: string) => {
    if (!authToken) return;
    setBusyId(inviteId);
    setErrorMessage(null);
    try {
      const res = await claimInvite(inviteId, authToken);
      setSourceMode(res.source);
      await loadInvites();
    } catch (err) {
      onApiError(err, "Could not reserve this spot");
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    if (!authToken) return;
    setBusyId(inviteId);
    setErrorMessage(null);
    try {
      const res = await declineInvite(inviteId, authToken);
      setSourceMode(res.source);
      await loadInvites();
    } catch (err) {
      onApiError(err, "Could not decline this invite");
    } finally {
      setBusyId(null);
    }
  };

  const handleReleaseClaim = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    try {
      const res = await releaseClaim(claimId, authToken);
      setSourceMode(res.source);
      if (seededPersona) {
        await loadInvites();
      } else {
        await loadFeed();
      }
    } catch (err) {
      onApiError(err, "Could not release your spot");
    } finally {
      setBusyId(null);
    }
  };

  const handlePickupClaim = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    try {
      const res = await pickupClaim(claimId, authToken);
      setSourceMode(res.source);
      if (seededPersona) {
        await loadInvites();
      } else {
        await loadFeed();
      }
    } catch (err) {
      onApiError(err, "Could not confirm pickup");
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
      setSourceMode(res.source);
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
      setPrefsStatus("Preferences saved. Feed updated.");
      await loadFeed();
    } catch (err) {
      onApiError(err, "Could not update preferences");
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

  const handleLeaveDemo = async () => {
    setBusyId("leave");
    setErrorMessage(null);
    try {
      if (authToken && !seededPersona) {
        await leaveDemoSession(authToken);
      }
    } catch {
      // Clear local session even if already removed server-side
    } finally {
      clearSessionToken();
      setBusyId(null);
      router.replace("/join");
    }
  };

  if (!authChecked || !authToken) {
    return (
      <div className="min-h-screen bg-owl-black p-6 text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  const displayNickname = seededPersona
    ? `Persona ${seededPersona.label}`
    : (sessionStudent?.nickname ?? "Student");

  const displaySubtitle = seededPersona
    ? SEEDED_PERSONA_AREA_LABELS[seededPersona.label]
    : "Marietta Campus Feed";

  const nowIso = new Date(nowTick).toISOString();

  // Seeded rehearsal view state (?persona=A..E)
  const cardState = resolveStudentCardState(invites);
  const activeSeededDrop =
    cardState.kind === "invite" ||
    cardState.kind === "pickup" ||
    cardState.kind === "picked_up"
      ? cardState.activeInvite.drop
      : null;
  const activeSeededDropLocation = activeSeededDrop
    ? formatDropResponseLocation(activeSeededDrop)
    : "";
  const activeSeededPickupInstructions = activeSeededDrop
    ? getDropPickupInstructions(activeSeededDrop)
    : null;
  const activeSeededDirectionsUrl = activeSeededDrop
    ? getDropWalkingDirectionsUrl(activeSeededDrop)
    : null;

  // Normal campus feed view state
  const feedView = resolveStudentFeedView(feedDrops, linkedDropId);

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader sourceMode={sourceMode} isDemo={true} />

      <main className="mx-auto flex max-w-md flex-col justify-between space-y-5 px-4 pb-10 pt-5 sm:max-w-lg">
        {/* Compact Student Bar with Menu Toggle (NO location/building controls) */}
        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-owl-slate p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  data-testid="student-nickname"
                  className="truncate text-lg font-extrabold text-white"
                >
                  {displayNickname}
                </h1>
                {seededPersona && (
                  <span
                    data-testid="seeded-persona-banner"
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
                  >
                    Simulated persona
                  </span>
                )}
                {!seededPersona && alertsPaused && (
                  <span
                    data-testid="alerts-paused-badge"
                    className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300"
                  >
                    Alerts paused (browsing active)
                  </span>
                )}
              </div>
              <p
                data-testid="student-subtitle"
                className="truncate text-xs text-zinc-400"
              >
                {displaySubtitle}
              </p>
            </div>

            <button
              type="button"
              data-testid="student-menu-button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-bold text-zinc-200 transition hover:border-owl-gold hover:text-white"
            >
              Menu
            </button>
          </div>

          {menuOpen && (
            <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3">
              {!seededPersona && (
                <div
                  data-testid="student-preferences-panel"
                  className="space-y-3 rounded-xl border border-zinc-800 bg-owl-black/60 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      Dietary preferences &amp; alerts
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        data-testid="student-alerts-paused-toggle"
                        checked={alertsPaused}
                        onChange={(e) => {
                          setAlertsPaused(e.target.checked);
                          setPrefsStatus(null);
                        }}
                        className="h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                      />
                      <span>Pause new drop alerts</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Pausing alerts stops notifications, while browsing and
                    reserving from the campus feed remain active.
                  </p>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-300">
                      Allergens to avoid
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALLERGENS.map((alg) => {
                        const active = prefAllergens.includes(alg);
                        return (
                          <button
                            key={alg}
                            type="button"
                            data-testid={`pref-allergen-${alg}`}
                            aria-pressed={active}
                            onClick={() => togglePrefAllergen(alg)}
                            className={`min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                              active
                                ? "border-amber-400 bg-amber-500/20 text-amber-100"
                                : "border-zinc-700 bg-owl-black text-zinc-300"
                            }`}
                          >
                            {active ? "✓ " : ""}
                            {alg.replace("_", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-300">
                      Dietary requirements
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DIETS.map((diet) => {
                        const active = prefDiets.includes(diet);
                        return (
                          <button
                            key={diet}
                            type="button"
                            data-testid={`pref-diet-${diet}`}
                            aria-pressed={active}
                            onClick={() => togglePrefDiet(diet)}
                            className={`min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                              active
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                                : "border-zinc-700 bg-owl-black text-zinc-300"
                            }`}
                          >
                            {active ? "✓ " : ""}
                            {diet.replace("_", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {prefsStatus && (
                    <p
                      data-testid="student-preferences-status"
                      className="text-xs font-semibold text-emerald-300"
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
                    className="min-h-[40px] w-full rounded-xl bg-owl-gold px-4 py-2 text-xs font-extrabold text-owl-black transition hover:bg-owl-goldDark disabled:opacity-50"
                  >
                    {busyId === "preferences"
                      ? "Saving..."
                      : "Save preferences"}
                  </button>
                </div>
              )}

              <p className="text-xs text-zinc-400">
                Leaving releases any held spot so another student can use it.
              </p>
              <button
                type="button"
                data-testid="leave-demo-button"
                disabled={busyId !== null}
                onClick={() => void handleLeaveDemo()}
                className="min-h-[44px] w-full rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs font-bold text-rose-200 transition hover:bg-rose-900/40 disabled:opacity-50"
              >
                {busyId === "leave" ? "Leaving..." : "Leave demo"}
              </button>
            </div>
          )}
        </section>

        {!seededPersona && (
          <PushOptIn state={push.state} onEnable={() => void push.enable()} />
        )}

        {/* Focused deep-link missing notices */}
        {!seededPersona &&
          linkedDropId &&
          feedLoaded &&
          feedView.focusedDropMissing && (
            <p
              data-testid="drop-link-ended"
              className="rounded-xl border border-zinc-700 bg-owl-slate/80 px-4 py-3 text-sm text-zinc-300"
            >
              That food drop has ended or expired. Active campus drops appear
              below.
            </p>
          )}

        {linkedInviteId &&
          ((seededPersona &&
            invitesLoaded &&
            !invites.some(
              (inv) =>
                inv.id === linkedInviteId &&
                (inv.status === "sent" || inv.status === "claimed"),
            )) ||
            (!seededPersona && feedLoaded)) && (
            <p
              data-testid="invite-link-ended"
              className="rounded-xl border border-zinc-700 bg-owl-slate/80 px-4 py-3 text-sm text-zinc-300"
            >
              That invite has ended. Active food drops will appear here.
            </p>
          )}

        {errorMessage && (
          <div
            role="alert"
            data-testid="student-error-message"
            className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* ============================================================
            NORMAL JOINED STUDENT: CAMPUS-WIDE MULTI-DROP FEED
           ============================================================ */}
        {!seededPersona && (
          <>
            {/* Active hold banner at top if student currently holds a spot */}
            {feedView.activeHold && (
              <article
                data-testid="active-claim-banner"
                className="space-y-4 rounded-2xl border border-emerald-500/50 bg-owl-slate p-5 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase text-emerald-300">
                    Your spot is held
                  </span>
                  <span
                    data-testid={
                      push.realPush
                        ? "push-notification-label"
                        : "simulated-notification-label"
                    }
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300"
                  >
                    {push.realPush
                      ? "Real push (Firebase)"
                      : "Simulated notification"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Where to go
                  </p>
                  <h2
                    data-testid="pickup-drop-location"
                    className="text-2xl font-extrabold text-white"
                  >
                    {formatDropResponseLocation(
                      feedView.activeHold.feedDrop.drop,
                    )}
                  </h2>
                  {getDropPickupInstructions(
                    feedView.activeHold.feedDrop.drop,
                  ) && (
                    <p
                      data-testid="pickup-instructions"
                      className="rounded-lg border border-emerald-500/30 bg-owl-black/70 px-3 py-2 text-xs text-zinc-100"
                    >
                      <strong className="text-emerald-300">Pickup note:</strong>{" "}
                      {getDropPickupInstructions(
                        feedView.activeHold.feedDrop.drop,
                      )}
                    </p>
                  )}
                  <p className="text-xs text-zinc-300">
                    Pickup needs no ID or proof. Just head over before your hold
                    ends.
                  </p>
                  {getDropWalkingDirectionsUrl(
                    feedView.activeHold.feedDrop.drop,
                  ) && (
                    <div className="pt-1">
                      <a
                        data-testid="get-directions-link"
                        href={getDropWalkingDirectionsUrl(
                          feedView.activeHold.feedDrop.drop,
                        )!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-extrabold text-emerald-200 transition hover:bg-emerald-500/25"
                      >
                        Get walking directions
                      </a>
                    </div>
                  )}
                </div>

                {/* Hold countdown */}
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-emerald-200">
                      10-minute hold countdown
                    </div>
                    <div className="text-xs text-emerald-300/80">
                      Until{" "}
                      {formatEasternTime(feedView.activeHold.claim.held_until)}
                    </div>
                  </div>
                  <div
                    data-testid="hold-countdown"
                    className="text-xl font-extrabold text-emerald-300"
                  >
                    {formatRemainingTime(
                      feedView.activeHold.claim.held_until,
                      nowIso,
                    )}
                  </div>
                </div>

                {/* What you reserved */}
                <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    What you reserved
                  </div>
                  <div className="text-sm font-bold text-white">
                    {summarizeDropItems(feedView.activeHold.feedDrop.drop)}
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-300">
                    {feedView.activeHold.feedDrop.drop.vision.items.map(
                      (item, idx) => (
                        <li key={`${item.name}-${idx}`}>
                          • {item.name} (~{item.count_estimate}{" "}
                          {item.portion_unit})
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                <AllergenListDisplay
                  allergens={feedView.activeHold.feedDrop.drop.allergens_final}
                  notice={feedView.activeHold.feedDrop.drop.allergen_notice}
                  title="Allergens"
                  compact={true}
                />

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    data-testid="pickup-confirm-button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void handlePickupClaim(feedView.activeHold!.claim.id)
                    }
                    className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:opacity-50"
                  >
                    {busyId === feedView.activeHold.claim.id
                      ? "Confirming..."
                      : "Confirm picked up (demo)"}
                  </button>

                  <button
                    type="button"
                    data-testid="pickup-release-button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void handleReleaseClaim(feedView.activeHold!.claim.id)
                    }
                    className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-transparent px-4 py-2.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                  >
                    Release hold
                  </button>
                </div>
              </article>
            )}

            {/* Empty campus feed state */}
            {feedView.orderedDrops.length === 0 ? (
              <section
                data-testid="empty-feed-card"
                className="space-y-3 rounded-2xl border border-zinc-800 bg-owl-slate p-6 text-center shadow-lg"
              >
                <div className="flex justify-center">
                  <span
                    data-testid={
                      push.realPush
                        ? "push-notification-label"
                        : "simulated-notification-label"
                    }
                    className="rounded-full border border-owl-gold/35 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
                  >
                    {push.realPush ? "Real push on" : "Simulated notifications"}
                  </span>
                </div>
                <h2
                  data-testid="no-invites-card"
                  className="text-xl font-extrabold text-white"
                >
                  No active food drops on campus right now
                </h2>
                <p className="text-sm leading-relaxed text-zinc-300">
                  When an event host shares leftover trays anywhere on Marietta
                  campus, the drop tile appears right here so you can check the
                  location, dietary tags, and reserve a 10-minute pickup hold.
                </p>
                <p className="text-xs text-zinc-400">
                  Allergens always say:{" "}
                  <strong className="text-amber-300">
                    {ALLERGEN_WARNING_TEXT}
                  </strong>
                  .
                </p>
              </section>
            ) : (
              <section
                data-testid="campus-feed-list"
                aria-label="Active campus food drops"
                className="space-y-4"
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                    Active campus drops ({feedView.orderedDrops.length})
                  </h2>
                  <span
                    data-testid={
                      push.realPush
                        ? "push-notification-label"
                        : "simulated-notification-label"
                    }
                    className="rounded-full border border-owl-gold/30 bg-owl-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-owl-gold"
                  >
                    {push.realPush ? "Real push on" : "Simulated notifications"}
                  </span>
                </div>

                {feedView.orderedDrops.map((item) => {
                  const { drop, can_reserve, unavailable_reason, claim } = item;
                  const isFocused =
                    Boolean(linkedDropId) && drop.id === linkedDropId?.trim();
                  const isOwnHeld = claim?.status === "held";
                  const isOwnPickedUp = claim?.status === "picked_up";
                  const locationText = formatDropResponseLocation(drop);
                  const pickupNote = getDropPickupInstructions(drop);
                  const directionsUrl = getDropWalkingDirectionsUrl(drop);
                  const unavailableExplanation = formatUnavailableReason(
                    unavailable_reason,
                    claim,
                  );

                  return (
                    <article
                      key={drop.id}
                      data-testid={`feed-drop-card-${drop.id}`}
                      data-focused={isFocused ? "true" : "false"}
                      className={`space-y-4 rounded-2xl border bg-owl-slate p-5 shadow-lg ${
                        isFocused
                          ? "border-owl-gold ring-2 ring-owl-gold/50"
                          : isOwnHeld || isOwnPickedUp
                            ? "border-emerald-500/50"
                            : can_reserve
                              ? "border-owl-gold/40"
                              : "border-zinc-800"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isFocused && (
                            <span
                              data-testid={`feed-drop-focused-${drop.id}`}
                              className="rounded-full bg-owl-gold px-2.5 py-0.5 text-[11px] font-extrabold text-owl-black"
                            >
                              Focused drop
                            </span>
                          )}
                          {isOwnHeld ? (
                            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase text-emerald-300">
                              Spot held
                            </span>
                          ) : isOwnPickedUp ? (
                            <span
                              data-testid="picked-up-card"
                              className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase text-emerald-300"
                            >
                              Picked up
                            </span>
                          ) : drop.counts.available <= 0 ? (
                            <span
                              data-testid={`feed-drop-sold-out-${drop.id}`}
                              className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold uppercase text-zinc-300"
                            >
                              All spots held or claimed
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                              {drop.counts.available} of {drop.counts.total}{" "}
                              servings available
                            </span>
                          )}
                        </div>

                        <span
                          data-testid={`feed-drop-deadline-${drop.id}`}
                          className="rounded-full bg-owl-black px-3 py-1 text-xs font-bold text-owl-gold"
                        >
                          Ends {formatEasternTime(drop.expires_at)} (
                          {formatRemainingTime(drop.expires_at, nowIso)})
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h3
                          data-testid={`feed-drop-title-${drop.id}`}
                          className="text-xl font-extrabold text-white"
                        >
                          {summarizeDropItems(drop)}
                        </h3>
                        <p
                          data-testid={`feed-drop-location-${drop.id}`}
                          className="text-sm font-bold text-zinc-100"
                        >
                          {locationText}
                        </p>
                        {pickupNote && (
                          <p
                            data-testid={`feed-drop-instructions-${drop.id}`}
                            className="rounded-lg border border-zinc-800 bg-owl-black/60 px-3 py-2 text-xs text-zinc-200"
                          >
                            <strong className="text-owl-gold">
                              Pickup note:
                            </strong>{" "}
                            {pickupNote}
                          </p>
                        )}
                        <p
                          data-testid={`feed-drop-available-${drop.id}`}
                          className="text-xs text-zinc-400"
                        >
                          {drop.counts.available} available • {drop.counts.held}{" "}
                          held • {drop.counts.picked_up} picked up
                        </p>

                        {directionsUrl && (
                          <div className="pt-1">
                            <a
                              data-testid={`get-directions-link-${drop.id}`}
                              href={directionsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/25"
                            >
                              Get walking directions
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Food breakdown & dietary tags */}
                      <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
                        <ul className="space-y-1 text-sm text-zinc-100">
                          {drop.vision.items.map((foodItem, idx) => (
                            <li
                              key={`${foodItem.name}-${idx}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="font-medium">
                                {foodItem.name}
                              </span>
                              <span className="shrink-0 text-xs text-zinc-400">
                                ~{foodItem.count_estimate}{" "}
                                {foodItem.portion_unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {drop.diet_tags_final.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {drop.diet_tags_final.map((d) => (
                              <span
                                key={d}
                                className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
                              >
                                {d.replace("_", " ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Allergens with mandatory notice */}
                      <AllergenListDisplay
                        allergens={drop.allergens_final}
                        notice={drop.allergen_notice}
                        title="Allergens"
                        compact={true}
                      />

                      {/* Reservation action or explanation */}
                      {isOwnHeld ? (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-2.5 text-xs font-semibold text-emerald-200">
                          Your 10-minute pickup hold is active above. Use
                          &ldquo;Confirm picked up&rdquo; or &ldquo;Release
                          hold&rdquo; on your hold card.
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          {!can_reserve && unavailableExplanation && (
                            <p
                              data-testid={`feed-drop-unavailable-${drop.id}`}
                              data-reason={unavailable_reason ?? ""}
                              className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3.5 py-2.5 text-xs font-semibold text-amber-200"
                            >
                              {unavailableExplanation}
                            </p>
                          )}

                          <button
                            type="button"
                            data-testid={`reserve-drop-button-${drop.id}`}
                            disabled={!can_reserve || busyId !== null}
                            onClick={() => void handleReserveDrop(drop.id)}
                            className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {busyId === drop.id
                              ? "Reserving..."
                              : can_reserve
                                ? "Reserve \u2013 hold 10 min"
                                : "Unavailable to reserve"}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}

        {/* ============================================================
            EXPLICIT SEEDED PERSONA REHEARSAL (?persona=A..E)
           ============================================================ */}
        {seededPersona && (
          <>
            {cardState.kind === "waiting" && (
              <section
                data-testid="no-invites-card"
                className="space-y-3 rounded-2xl border border-zinc-800 bg-owl-slate p-6 text-center shadow-lg"
              >
                <div className="flex justify-center">
                  <span
                    data-testid="simulated-notification-label"
                    className="rounded-full border border-owl-gold/35 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
                  >
                    Simulated notifications
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white">
                  We&apos;ll show rehearsal invites here
                </h2>
                <p className="text-sm leading-relaxed text-zinc-300">
                  When a host shares food in seeded rehearsal mode that matches{" "}
                  <span className="font-semibold text-white">
                    {displayNickname}
                  </span>
                  , an invite card will appear right here.
                </p>
                <p className="text-xs text-zinc-400">
                  Allergens always say:{" "}
                  <strong className="text-amber-300">
                    {ALLERGEN_WARNING_TEXT}
                  </strong>
                  .
                </p>
              </section>
            )}

            {cardState.kind === "invite" && (
              <article
                data-testid={`invite-card-${cardState.activeInvite.id}`}
                className="space-y-5 rounded-2xl border border-owl-gold/50 bg-owl-slate p-5 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    data-testid="simulated-notification-label"
                    className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300"
                  >
                    Simulated notification
                  </span>
                  <span
                    data-testid={`invite-countdown-${cardState.activeInvite.id}`}
                    className="rounded-full bg-owl-black px-3 py-1 text-xs font-extrabold text-owl-gold"
                  >
                    {formatRemainingTime(
                      cardState.activeInvite.expires_at,
                      nowIso,
                    )}{" "}
                    left
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-owl-gold">
                    Seeded rehearsal • {displaySubtitle}
                  </p>
                  <h2 className="text-2xl font-extrabold text-white">
                    {summarizeDropFood(cardState.activeInvite)}
                  </h2>
                  <p
                    data-testid="invite-drop-location"
                    className="text-sm font-bold text-zinc-100"
                  >
                    {activeSeededDropLocation}
                  </p>
                  {activeSeededPickupInstructions && (
                    <p
                      data-testid="invite-pickup-instructions"
                      className="rounded-lg border border-zinc-800 bg-owl-black/60 px-3 py-2 text-xs text-zinc-200"
                    >
                      <strong className="text-owl-gold">Pickup note:</strong>{" "}
                      {activeSeededPickupInstructions}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400">
                    About {cardState.activeInvite.drop.counts.available} of{" "}
                    {cardState.activeInvite.drop.counts.total} servings left
                  </p>
                  {activeSeededDirectionsUrl && (
                    <div className="pt-1">
                      <a
                        data-testid="get-directions-link"
                        href={activeSeededDirectionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/25"
                      >
                        Get directions
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
                  <ul className="space-y-1 text-sm text-zinc-100">
                    {cardState.activeInvite.drop.vision.items.map(
                      (item, idx) => (
                        <li
                          key={`${item.name}-${idx}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="shrink-0 text-xs text-zinc-400">
                            ~{item.count_estimate} {item.portion_unit}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                  {cardState.activeInvite.drop.diet_tags_final.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {cardState.activeInvite.drop.diet_tags_final.map((d) => (
                        <span
                          key={d}
                          className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
                        >
                          {d.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <AllergenListDisplay
                  allergens={cardState.activeInvite.drop.allergens_final}
                  notice={cardState.activeInvite.drop.allergen_notice}
                  title="Allergens"
                  compact={true}
                />

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    data-testid={`claim-invite-button-${cardState.activeInvite.id}`}
                    disabled={busyId !== null}
                    onClick={() => void handleClaim(cardState.activeInvite.id)}
                    className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:opacity-50"
                  >
                    {busyId === cardState.activeInvite.id
                      ? "Reserving..."
                      : "Reserve \u2013 hold 10 min"}
                  </button>

                  <button
                    type="button"
                    data-testid={`decline-invite-button-${cardState.activeInvite.id}`}
                    disabled={busyId !== null}
                    onClick={() =>
                      void handleDecline(cardState.activeInvite.id)
                    }
                    className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-transparent px-4 py-2.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </article>
            )}

            {cardState.kind === "pickup" && (
              <article
                data-testid="active-claim-banner"
                className="space-y-5 rounded-2xl border border-emerald-500/50 bg-owl-slate p-5 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase text-emerald-300">
                    Your spot is held
                  </span>
                  <span
                    data-testid="simulated-notification-label"
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300"
                  >
                    Simulated notification
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Where to go
                  </p>
                  <h2
                    data-testid="pickup-drop-location"
                    className="text-2xl font-extrabold text-white"
                  >
                    {activeSeededDropLocation}
                  </h2>
                  {activeSeededPickupInstructions && (
                    <p
                      data-testid="pickup-instructions"
                      className="rounded-lg border border-emerald-500/30 bg-owl-black/70 px-3 py-2 text-xs text-zinc-100"
                    >
                      <strong className="text-emerald-300">Pickup note:</strong>{" "}
                      {activeSeededPickupInstructions}
                    </p>
                  )}
                  <p className="text-xs text-zinc-300">
                    Pickup needs no ID or proof. Just head over before your hold
                    ends.
                  </p>
                  {activeSeededDirectionsUrl && (
                    <div className="pt-1">
                      <a
                        data-testid="get-directions-link"
                        href={activeSeededDirectionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-extrabold text-emerald-200 transition hover:bg-emerald-500/25"
                      >
                        Get directions
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-emerald-200">
                      10-minute hold countdown
                    </div>
                    <div className="text-xs text-emerald-300/80">
                      Until{" "}
                      {formatEasternTime(cardState.activeClaim.held_until)}
                    </div>
                  </div>
                  <div
                    data-testid="hold-countdown"
                    className="text-xl font-extrabold text-emerald-300"
                  >
                    {formatRemainingTime(
                      cardState.activeClaim.held_until,
                      nowIso,
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    What you reserved
                  </div>
                  <div className="text-sm font-bold text-white">
                    {summarizeDropFood(cardState.activeInvite)}
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-300">
                    {cardState.activeInvite.drop.vision.items.map(
                      (item, idx) => (
                        <li key={`${item.name}-${idx}`}>
                          • {item.name} (~{item.count_estimate}{" "}
                          {item.portion_unit})
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                <AllergenListDisplay
                  allergens={cardState.activeInvite.drop.allergens_final}
                  notice={cardState.activeInvite.drop.allergen_notice}
                  title="Allergens"
                  compact={true}
                />

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    data-testid="pickup-confirm-button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void handlePickupClaim(cardState.activeClaim.id)
                    }
                    className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:opacity-50"
                  >
                    {busyId === cardState.activeClaim.id
                      ? "Confirming..."
                      : "Confirm picked up (demo)"}
                  </button>

                  <button
                    type="button"
                    data-testid="pickup-release-button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void handleReleaseClaim(cardState.activeClaim.id)
                    }
                    className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-transparent px-4 py-2.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                  >
                    Release
                  </button>
                </div>
              </article>
            )}

            {cardState.kind === "picked_up" && (
              <section
                data-testid="picked-up-card"
                className="space-y-4 rounded-2xl border border-emerald-500/40 bg-owl-slate p-6 text-center shadow-lg"
              >
                <div className="flex justify-center gap-2">
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase text-emerald-300">
                    Picked up
                  </span>
                  <span
                    data-testid="simulated-notification-label"
                    className="rounded-full border border-owl-gold/30 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
                  >
                    Simulated notification
                  </span>
                </div>

                <div
                  data-testid="active-claim-banner"
                  className="space-y-1.5 text-center"
                >
                  <h2 className="text-2xl font-extrabold text-white">
                    Enjoy your meal
                  </h2>
                  <p className="text-sm text-zinc-300">
                    Picked up from{" "}
                    <strong className="text-white">
                      {activeSeededDropLocation}
                    </strong>
                    .
                  </p>
                  {activeSeededPickupInstructions && (
                    <p className="text-xs text-zinc-400">
                      Pickup note: {activeSeededPickupInstructions}
                    </p>
                  )}
                </div>

                <p className="text-xs text-zinc-400">
                  Allergens: {ALLERGEN_WARNING_TEXT}.
                </p>
              </section>
            )}

            {cardState.collapsedLines.length > 0 && (
              <section
                aria-label="Past invites"
                className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-owl-slate/50 px-3.5 py-2.5"
              >
                {cardState.collapsedLines.map((line) => (
                  <p
                    key={line.id}
                    data-testid={`collapsed-invite-${line.id}`}
                    className="truncate text-xs text-zinc-400"
                  >
                    {line.summary}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-owl-black p-6 text-sm text-zinc-400">
          Loading...
        </div>
      }
    >
      <StudentContent />
    </Suspense>
  );
}
