"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGEN_WARNING_TEXT,
  type InviteResponse,
  type SessionStudent,
} from "../../lib/types/api";
import {
  claimInvite,
  declineInvite,
  getMyInvites,
  getMySession,
  INITIAL_DATA_SOURCE,
  leaveDemoSession,
  pickupClaim,
  releaseClaim,
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
  DEMO_AREA_LABELS,
  formatDropLocation,
  resolveStudentCardState,
  SEEDED_PERSONA_AREA_LABELS,
  summarizeDropFood,
} from "./student-helpers";

function StudentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
  const linkedInviteId = searchParams.get("invite");
  const seededPersona = parseSeededPersonaParam(personaParam);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionStudent, setSessionStudent] = useState<SessionStudent | null>(
    null,
  );
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [invites, setInvites] = useState<InviteResponse[]>([]);
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

  const loadInvites = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await getMyInvites(authToken);
      setInvites(res.data.invites);
      setSourceMode(res.source);
      setNowTick(Date.now());
    } catch (err) {
      onApiError(err, "Could not refresh nearby invites");
    }
  }, [authToken, onApiError]);

  // Refresh invites every 2s
  useEffect(() => {
    if (!authChecked || !authToken) return;
    void loadInvites();
    const intervalId = setInterval(() => {
      void loadInvites();
    }, 2000);
    return () => clearInterval(intervalId);
  }, [authChecked, authToken, loadInvites]);

  // 1s tick to keep invite and hold countdowns responsive
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      await loadInvites();
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
      await loadInvites();
    } catch (err) {
      onApiError(err, "Could not confirm pickup");
    } finally {
      setBusyId(null);
    }
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

  const displayArea = seededPersona
    ? SEEDED_PERSONA_AREA_LABELS[seededPersona.label]
    : sessionStudent
      ? (DEMO_AREA_LABELS[sessionStudent.area] ?? sessionStudent.area)
      : "Campus area (demo)";

  const cardState = resolveStudentCardState(invites);
  const nowIso = new Date(nowTick).toISOString();

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader sourceMode={sourceMode} isDemo={true} />

      <main className="mx-auto flex max-w-md flex-col justify-between space-y-5 px-4 pb-10 pt-5 sm:max-w-lg">
        {/* Compact Student Bar with Menu Toggle */}
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
              </div>
              <p className="truncate text-xs text-zinc-400">{displayArea}</p>
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
            <div className="flex flex-col gap-2.5 border-t border-zinc-800 pt-3">
              <p className="text-xs text-zinc-400">
                Leaving releases any held spot so another nearby student can use
                it.
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

        {linkedInviteId &&
          invites.length > 0 &&
          !invites.some(
            (inv) =>
              inv.id === linkedInviteId &&
              (inv.status === "sent" || inv.status === "claimed"),
          ) && (
            <p
              data-testid="invite-link-ended"
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300"
            >
              That invite has ended. New ones will appear here.
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

        {/* SINGLE FOCUSED CARD PER STATE */}
        {cardState.kind === "waiting" && (
          <section
            data-testid="no-invites-card"
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
            <h2 className="text-xl font-extrabold text-white">
              We&apos;ll show nearby food here
            </h2>
            <p className="text-sm leading-relaxed text-zinc-300">
              When a host shares leftover event food near{" "}
              <span className="font-semibold text-white">{displayArea}</span>{" "}
              that matches your filters, an invite card will appear right here.
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
                data-testid={
                  push.realPush
                    ? "push-notification-label"
                    : "simulated-notification-label"
                }
                className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300"
              >
                {push.realPush
                  ? "Real push (Firebase)"
                  : "Simulated notification"}
              </span>
              <span
                data-testid={`invite-countdown-${cardState.activeInvite.id}`}
                className="rounded-full bg-owl-black px-3 py-1 text-xs font-extrabold text-owl-gold"
              >
                {formatRemainingTime(cardState.activeInvite.expires_at, nowIso)}{" "}
                left
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-owl-gold">
                Free food nearby • {displayArea}
              </p>
              <h2 className="text-2xl font-extrabold text-white">
                {summarizeDropFood(cardState.activeInvite)}
              </h2>
              <p className="text-sm font-medium text-zinc-200">
                {formatDropLocation(
                  cardState.activeInvite.drop.building_code,
                  cardState.activeInvite.drop.room,
                )}
              </p>
              <p className="text-xs text-zinc-400">
                About {cardState.activeInvite.drop.counts.available} of{" "}
                {cardState.activeInvite.drop.counts.total} servings left
              </p>
            </div>

            {/* Food breakdown & dietary tags */}
            <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
              <ul className="space-y-1 text-sm text-zinc-100">
                {cardState.activeInvite.drop.vision.items.map((item, idx) => (
                  <li
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      ~{item.count_estimate} {item.portion_unit}
                    </span>
                  </li>
                ))}
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

            {/* Allergens with mandatory notice */}
            <AllergenListDisplay
              allergens={cardState.activeInvite.drop.allergens_final}
              notice={cardState.activeInvite.drop.allergen_notice}
              title="Allergens"
              compact={true}
            />

            {/* Primary Reserve button + quiet secondary Decline */}
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
                onClick={() => void handleDecline(cardState.activeInvite.id)}
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

            {/* Where to go */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Where to go
              </p>
              <h2 className="text-2xl font-extrabold text-white">
                {formatDropLocation(
                  cardState.activeInvite.drop.building_code,
                  cardState.activeInvite.drop.room,
                )}
              </h2>
              <p className="text-xs text-zinc-300">
                Pickup needs no ID or proof. Just head over before your hold
                ends.
              </p>
            </div>

            {/* Hold countdown */}
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
              <div>
                <div className="text-xs font-medium text-emerald-200">
                  10-minute hold countdown
                </div>
                <div className="text-xs text-emerald-300/80">
                  Until {formatEasternTime(cardState.activeClaim.held_until)}
                </div>
              </div>
              <div
                data-testid="hold-countdown"
                className="text-xl font-extrabold text-emerald-300"
              >
                {formatRemainingTime(cardState.activeClaim.held_until, nowIso)}
              </div>
            </div>

            {/* What you reserved */}
            <div className="space-y-2 rounded-xl bg-owl-black/70 p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                What you reserved
              </div>
              <div className="text-sm font-bold text-white">
                {summarizeDropFood(cardState.activeInvite)}
              </div>
              <ul className="space-y-1 text-xs text-zinc-300">
                {cardState.activeInvite.drop.vision.items.map((item, idx) => (
                  <li key={`${item.name}-${idx}`}>
                    • {item.name} (~{item.count_estimate} {item.portion_unit})
                  </li>
                ))}
              </ul>
            </div>

            {/* Allergen notice */}
            <AllergenListDisplay
              allergens={cardState.activeInvite.drop.allergens_final}
              notice={cardState.activeInvite.drop.allergen_notice}
              title="Allergens"
              compact={true}
            />

            {/* Primary Confirm Picked Up + secondary Release */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                data-testid="pickup-confirm-button"
                disabled={busyId !== null}
                onClick={() => void handlePickupClaim(cardState.activeClaim.id)}
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
                data-testid={
                  push.realPush
                    ? "push-notification-label"
                    : "simulated-notification-label"
                }
                className="rounded-full border border-owl-gold/30 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
              >
                {push.realPush
                  ? "Real push (Firebase)"
                  : "Simulated notification"}
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
                  {formatDropLocation(
                    cardState.activeInvite.drop.building_code,
                    cardState.activeInvite.drop.room,
                  )}
                </strong>
                .
              </p>
            </div>

            <p className="text-xs text-zinc-400">
              Allergens: {ALLERGEN_WARNING_TEXT}.
            </p>
          </section>
        )}

        {/* Expired or declined invites collapsed to a short single line */}
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
