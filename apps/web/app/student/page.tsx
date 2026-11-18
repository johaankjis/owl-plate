"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGEN_WARNING_TEXT,
  type DemoAreaId,
  type InviteResponse,
  type SeededPersonaLabel,
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
import { FIXTURE_DEMO_AREAS } from "../../lib/fixtures/demo-fixtures";
import {
  clearSessionToken,
  getSessionToken,
  handleUnauthorizedError,
  parseSeededPersonaParam,
} from "../../lib/session";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";

const AREA_LABELS: Record<DemoAreaId, string> = FIXTURE_DEMO_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = area.label;
    return acc;
  },
  {} as Record<DemoAreaId, string>,
);

const PERSONA_AREA_LABELS: Record<SeededPersonaLabel, string> = {
  A: "Event venue (demo)",
  B: "Event venue (demo)",
  C: "Next building over (demo)",
  D: "Across the quad (demo)",
  E: "Event venue (demo)",
};

function StudentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

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

  // Resolve session token or rehearsal persona token on mount
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

  // Fetch visitor profile for active session
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
        onApiError(err, "Failed to verify session");
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
      onApiError(err, "Failed to load invites");
    }
  }, [authToken, onApiError]);

  // Poll GET /students/me/invites every 2s
  useEffect(() => {
    if (!authChecked || !authToken) return;
    void loadInvites();
    const pollInterval = setInterval(() => {
      void loadInvites();
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [authChecked, authToken, loadInvites]);

  // 1s local tick to keep invite countdown responsive between 2s polls
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
    setStatusMessage(null);
    try {
      const res = await claimInvite(inviteId, authToken);
      setSourceMode(res.source);
      setStatusMessage(
        `Your spot is held for 10 minutes (until ${formatEasternTime(res.data.held_until)}). No ID or proof needed at pickup.`,
      );
      await loadInvites();
    } catch (err) {
      onApiError(err, "Failed to claim serving");
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    if (!authToken) return;
    setBusyId(inviteId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await declineInvite(inviteId, authToken);
      setSourceMode(res.source);
      setStatusMessage(
        "Invite declined. Your spot was freed for another student.",
      );
      await loadInvites();
    } catch (err) {
      onApiError(err, "Failed to decline invite");
    } finally {
      setBusyId(null);
    }
  };

  const handleReleaseClaim = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await releaseClaim(claimId, authToken);
      setSourceMode(res.source);
      setStatusMessage("Hold released back to available pool.");
      await loadInvites();
    } catch (err) {
      onApiError(err, "Failed to release claim");
    } finally {
      setBusyId(null);
    }
  };

  const handlePickupClaim = async (claimId: string) => {
    if (!authToken) return;
    setBusyId(claimId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await pickupClaim(claimId, authToken);
      setSourceMode(res.source);
      setStatusMessage("Marked as picked up (demo mode). Enjoy your meal.");
      await loadInvites();
    } catch (err) {
      onApiError(err, "Failed to mark picked up");
    } finally {
      setBusyId(null);
    }
  };

  const handleLeaveDemo = async () => {
    setBusyId("leave");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (authToken && !seededPersona) {
        await leaveDemoSession(authToken);
      }
    } catch {
      // Even if session was already cleared server-side, remove local token and redirect
    } finally {
      clearSessionToken();
      setBusyId(null);
      router.replace("/join");
    }
  };

  if (!authChecked || !authToken) {
    return (
      <div className="min-h-screen bg-owl-black p-6 text-sm text-zinc-400">
        Checking your demo session...
      </div>
    );
  }

  const displayNickname = seededPersona
    ? `Persona ${seededPersona.label}`
    : (sessionStudent?.nickname ?? "Visitor");

  const displayArea = seededPersona
    ? PERSONA_AREA_LABELS[seededPersona.label]
    : sessionStudent
      ? (AREA_LABELS[sessionStudent.area] ?? sessionStudent.area)
      : "Simulated demo area";

  const activeClaimInvite =
    invites.find(
      (inv) =>
        inv.claim?.status === "held" || inv.claim?.status === "picked_up",
    ) ?? null;

  const nowIso = new Date(nowTick).toISOString();

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader sourceMode={sourceMode} isDemo={true} />

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {seededPersona && (
          <div
            role="status"
            data-testid="seeded-persona-banner"
            className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs font-semibold text-amber-200"
          >
            Seeded persona (simulated) — Rehearsal mode using synthetic token{" "}
            <code>{seededPersona.token}</code>.
          </div>
        )}

        {/* Visitor / Persona Identity Header */}
        <section className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-owl-slate p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                data-testid="student-nickname"
                className="text-2xl font-bold text-white"
              >
                {displayNickname}
              </h1>
              <span
                data-testid="fixture-label"
                className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-300"
              >
                {displayArea}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Polling exclusively your own invites every 2s. Hosts see aggregate
              counts only.
            </p>
          </div>

          <button
            type="button"
            data-testid="leave-demo-button"
            disabled={busyId !== null}
            onClick={() => void handleLeaveDemo()}
            className="self-start rounded-lg border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-50 sm:self-auto"
          >
            {busyId === "leave" ? "Leaving..." : "Leave demo"}
          </button>
        </section>

        {statusMessage && (
          <div
            data-testid="student-status-message"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            data-testid="student-error-message"
            className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Section 1: Your Claim */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-owl-gold">Your claim</h2>

          {activeClaimInvite && activeClaimInvite.claim ? (
            <div
              data-testid="active-claim-banner"
              className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-5 text-sm text-emerald-100"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold uppercase text-emerald-300">
                  {activeClaimInvite.claim.status === "held"
                    ? "Spot Held (10 min)"
                    : "Picked Up"}
                </span>
                {activeClaimInvite.claim.status === "held" && (
                  <span className="text-xs font-semibold text-emerald-200">
                    Hold expires at{" "}
                    {formatEasternTime(activeClaimInvite.claim.held_until)} (
                    {formatRemainingTime(
                      activeClaimInvite.claim.held_until,
                      nowIso,
                    )}
                    )
                  </span>
                )}
              </div>

              <div>
                <div className="text-base font-bold text-white">
                  {activeClaimInvite.drop.building_code}
                  {activeClaimInvite.drop.room
                    ? `, room ${activeClaimInvite.drop.room}`
                    : ""}
                </div>
                <p className="mt-1 text-xs text-emerald-200">
                  {activeClaimInvite.claim.status === "held"
                    ? "Your spot is held for 10 minutes. Head over now — pickup needs no ID or proof."
                    : "Serving marked picked up. Enjoy your meal."}
                </p>
              </div>

              {activeClaimInvite.claim.status === "held" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid={`release-claim-button-${activeClaimInvite.claim.id}`}
                    disabled={busyId !== null}
                    onClick={() =>
                      void handleReleaseClaim(activeClaimInvite.claim!.id)
                    }
                    className="rounded-lg border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Release hold
                  </button>
                  <button
                    type="button"
                    data-testid={`pickup-claim-button-${activeClaimInvite.claim.id}`}
                    disabled={busyId !== null}
                    onClick={() =>
                      void handlePickupClaim(activeClaimInvite.claim!.id)
                    }
                    className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-owl-black hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Confirm picked up (demo)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-owl-slate/60 p-4 text-xs text-zinc-400">
              You have no active 10-minute hold right now. Claim an invite below
              when one arrives.
            </div>
          )}
        </section>

        {/* Section 2: Your Invites */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-owl-gold">
            Your invites ({invites.length})
          </h2>

          {invites.length === 0 ? (
            <div
              data-testid="no-invites-card"
              className="rounded-xl border border-zinc-800 bg-owl-slate p-6 text-center"
            >
              <p className="text-sm font-medium text-zinc-200">
                No active food invites for {displayNickname} yet.
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                When a host publishes a compatible drop within your wave ring,
                your invite will appear here automatically. Allergens always
                carry:{" "}
                <strong className="text-amber-300">
                  {ALLERGEN_WARNING_TEXT}
                </strong>
                .
              </p>
            </div>
          ) : (
            invites.map((inv) => {
              const drop = inv.drop;
              const isHeld = inv.claim?.status === "held";
              const countdown = formatRemainingTime(inv.expires_at, nowIso);

              return (
                <article
                  key={inv.id}
                  data-testid={`invite-card-${inv.id}`}
                  className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          data-testid="simulated-notification-label"
                          className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300"
                        >
                          Simulated notification
                        </span>
                        <span className="rounded bg-owl-gold/20 px-2.5 py-0.5 text-xs font-bold uppercase text-owl-gold">
                          Status: {inv.status}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-white">
                        Free food nearby: {drop.building_code}
                        {drop.room ? `, room ${drop.room}` : ""}
                      </h3>
                      <p className="text-xs text-zinc-300">
                        About {drop.counts.available} of {drop.counts.total}{" "}
                        servings available.
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-owl-black px-3 py-1.5 text-right text-xs">
                      <div className="text-zinc-400">Invite countdown</div>
                      <div
                        data-testid={`invite-countdown-${inv.id}`}
                        className="font-bold text-owl-gold"
                      >
                        {countdown}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Until {formatEasternTime(inv.expires_at)}
                      </div>
                    </div>
                  </div>

                  {/* Estimated Food Items */}
                  <div className="rounded-lg bg-owl-black/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Estimated Items
                    </div>
                    <ul className="mt-1.5 space-y-1 text-sm text-zinc-100">
                      {drop.vision.items.map((item, idx) => (
                        <li key={`${item.name}-${idx}`}>
                          • {item.name} (~{item.count_estimate}{" "}
                          {item.portion_unit})
                        </li>
                      ))}
                    </ul>
                    {drop.diet_tags_final.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {drop.diet_tags_final.map((d) => (
                          <span
                            key={d}
                            className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
                          >
                            {d.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mandatory Allergen Notice Display */}
                  <AllergenListDisplay
                    allergens={drop.allergens_final}
                    notice={drop.allergen_notice}
                    title="Allergens for This Drop"
                  />

                  {/* Invite Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {inv.status === "sent" && (
                      <>
                        <button
                          type="button"
                          data-testid={`claim-invite-button-${inv.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleClaim(inv.id)}
                          className="rounded-lg bg-owl-gold px-4 py-2.5 text-sm font-bold text-owl-black transition hover:bg-owl-goldDark disabled:opacity-50"
                        >
                          {busyId === inv.id
                            ? "Holding spot..."
                            : "I'm coming – hold 10 min"}
                        </button>
                        <button
                          type="button"
                          data-testid={`decline-invite-button-${inv.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleDecline(inv.id)}
                          className="rounded-lg border border-zinc-700 bg-owl-black px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {inv.claim && isHeld && (
                      <button
                        type="button"
                        data-testid={`invite-release-button-${inv.claim.id}`}
                        disabled={busyId !== null}
                        onClick={() => void handleReleaseClaim(inv.claim!.id)}
                        className="rounded-lg border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Release hold
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-owl-black p-6 text-sm text-zinc-400">
          Loading student view...
        </div>
      }
    >
      <StudentContent />
    </Suspense>
  );
}
