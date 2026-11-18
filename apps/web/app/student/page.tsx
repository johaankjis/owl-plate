"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type DemoCredential,
  type Diet,
  type InviteResponse,
  type Preferences,
} from "../../lib/types/api";
import {
  checkInPresence,
  claimInvite,
  declineInvite,
  getMyInvites,
  pickupClaim,
  registerPushToken,
  releaseClaim,
  updateMyPreferences,
  INITIAL_DATA_SOURCE,
  type DataSourceMode,
} from "../../lib/api-client";
import { getFcmConfigStatus, requestFcmPushToken } from "../../lib/fcm";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";

export default function StudentPage() {
  const [credential, setCredential] =
    useState<DemoCredential>("demo-student-A");
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Own preferences & presence state (never other students')
  const [myAllergens, setMyAllergens] = useState<Allergen[]>([]);
  const [myDiets, setMyDiets] = useState<Diet[]>([]);
  const [alertsPaused, setAlertsPaused] = useState<boolean>(false);
  const [presenceBuilding, setPresenceBuilding] =
    useState<string>("DEMO-ORIGIN");
  const [presenceValidUntil, setPresenceValidUntil] = useState<string | null>(
    null,
  );

  // Opt-in FCM status
  const [fcmStatus] = useState(() => getFcmConfigStatus());
  const [fcmFeedback, setFcmFeedback] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const res = await getMyInvites(credential);
      setInvites(res.data.invites);
      setSourceMode(res.source);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load invites",
      );
    }
  }, [credential]);

  useEffect(() => {
    setStatusMessage(null);
    setErrorMessage(null);
    void loadInvites();
    const timer = setInterval(() => {
      void loadInvites();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadInvites]);

  const handleClaim = async (inviteId: string) => {
    setBusyId(inviteId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await claimInvite(inviteId, credential);
      setSourceMode(res.source);
      setStatusMessage(
        `Your spot is held for 10 minutes (until ${formatEasternTime(res.data.held_until)}). No ID or proof needed at pickup.`,
      );
      await loadInvites();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to claim serving",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    setBusyId(inviteId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await declineInvite(inviteId, credential);
      setSourceMode(res.source);
      setStatusMessage(
        "Invite declined. Your spot was freed for another student.",
      );
      await loadInvites();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to decline invite",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReleaseClaim = async (claimId: string) => {
    setBusyId(claimId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await releaseClaim(claimId, credential);
      setSourceMode(res.source);
      setStatusMessage("Hold released back to available pool.");
      await loadInvites();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to release claim",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handlePickupClaim = async (claimId: string) => {
    setBusyId(claimId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await pickupClaim(claimId, credential);
      setSourceMode(res.source);
      setStatusMessage(
        "Marked as picked up (demo verification mode). Enjoy your meal.",
      );
      await loadInvites();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to mark picked up",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId("prefs");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload: Preferences = {
        allergens: myAllergens,
        diets: myDiets,
        alerts_paused: alertsPaused,
      };
      const res = await updateMyPreferences(payload, credential);
      setSourceMode(res.source);
      setStatusMessage(
        "Your personal dietary and alert preferences were updated.",
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save preferences",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckInPresence = async () => {
    setBusyId("presence");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await checkInPresence(
        { building_code: presenceBuilding },
        credential,
      );
      setSourceMode(res.source);
      setPresenceValidUntil(res.data.valid_until);
      setStatusMessage(
        `Coarse campus check-in active near ${presenceBuilding} until ${formatEasternTime(
          res.data.valid_until,
        )} (expires automatically after 2 hours).`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to check in",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleEnableFcm = async () => {
    setBusyId("fcm");
    setFcmFeedback(null);
    try {
      const tokenRes = await requestFcmPushToken();
      if (!tokenRes.ok || !tokenRes.token) {
        setFcmFeedback(tokenRes.message);
        return;
      }
      const apiRes = await registerPushToken(
        { token: tokenRes.token },
        credential,
      );
      setSourceMode(apiRes.source);
      setFcmFeedback(
        "FCM web push token registered with backend. Lock screen notifications contain minimal drop reference only.",
      );
    } catch (err) {
      setFcmFeedback(
        err instanceof Error ? err.message : "FCM registration failed",
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleMyAllergen = (alg: Allergen) => {
    setMyAllergens((prev) =>
      prev.includes(alg) ? prev.filter((a) => a !== alg) : [...prev, alg],
    );
  };

  const toggleMyDiet = (diet: Diet) => {
    setMyDiets((prev) =>
      prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet],
    );
  };

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader
        credential={credential}
        onCredentialChange={setCredential}
        sourceMode={sourceMode}
        isDemo={true}
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Student Persona Switcher Bar for Quick Demo Testing */}
        <section className="rounded-xl border border-zinc-800 bg-owl-slate p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Student View — Invites &amp; 10-Minute Holds
              </h1>
              <p className="mt-1 text-sm text-zinc-300">
                Viewing exclusively your own invites and claims for{" "}
                <code className="rounded bg-owl-black px-1.5 py-0.5 text-owl-gold">
                  {credential}
                </code>{" "}
                (Simulated Demo Persona). Hosts see serving counts.
              </p>
            </div>
            <button
              type="button"
              data-testid="refresh-invites-button"
              onClick={() => void loadInvites()}
              className="self-start rounded-lg border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 sm:self-auto"
            >
              Refresh Invites
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                "demo-student-A",
                "demo-student-B",
                "demo-student-C",
                "demo-student-D",
                "demo-student-E",
              ] as const
            ).map((token) => (
              <button
                key={token}
                type="button"
                data-testid={`switch-${token}`}
                onClick={() => setCredential(token)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  credential === token
                    ? "border-owl-gold bg-owl-gold text-owl-black"
                    : "border-zinc-700 bg-owl-black text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {token.replace("demo-student-", "Phone ")} (Simulated)
              </button>
            ))}
          </div>
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

        {/* Active Invites List */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-owl-gold">
            Your Invites ({invites.length})
          </h2>

          {invites.length === 0 ? (
            <div
              data-testid="no-invites-card"
              className="rounded-xl border border-zinc-800 bg-owl-slate p-6 text-center"
            >
              <p className="text-sm font-medium text-zinc-200">
                No active food invites for {credential} right now.
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Owl Plate only pings nearby students whose dietary and allergen
                settings match the drop. Allergen estimates always carry:{" "}
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
              const isPickedUp = inv.claim?.status === "picked_up";
              return (
                <article
                  key={inv.id}
                  data-testid={`invite-card-${inv.id}`}
                  className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-owl-gold/20 px-2.5 py-0.5 text-xs font-bold uppercase text-owl-gold">
                          Invite Status: {inv.status}
                        </span>
                        {drop.is_demo && (
                          <span className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                            Simulated Demo Drop ({drop.vision_source})
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        Free food nearby: {drop.building_code}
                        {drop.room ? `, room ${drop.room}` : ""}
                      </h3>
                      <p className="text-xs text-zinc-300">
                        About {drop.counts.available} of {drop.counts.total}{" "}
                        servings available. Invite expires at{" "}
                        {formatEasternTime(inv.expires_at)} (
                        {formatRemainingTime(inv.expires_at)}).
                      </p>
                    </div>

                    <div className="text-right text-xs text-zinc-400">
                      <div>Drop Status: {drop.status}</div>
                      {drop.expires_at && (
                        <div>
                          Drop Ends: {formatEasternTime(drop.expires_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Food Items */}
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

                  {/* Mandatory Allergen Warning Display */}
                  <AllergenListDisplay
                    allergens={drop.allergens_final}
                    notice={drop.allergen_notice}
                    title="Allergens for This Drop"
                  />

                  {/* Claim Details if Held or Picked Up */}
                  {inv.claim && (
                    <div
                      data-testid="active-claim-banner"
                      className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200"
                    >
                      <div className="font-bold uppercase">
                        Claim Status: {inv.claim.status}
                      </div>
                      {isHeld && (
                        <p className="mt-1">
                          Your spot is held until{" "}
                          <strong>
                            {formatEasternTime(inv.claim.held_until)}
                          </strong>
                          . Head to {drop.building_code}{" "}
                          {drop.room && `room ${drop.room}`}.
                        </p>
                      )}
                      {isPickedUp && (
                        <p className="mt-1">
                          Serving marked picked up. Thank you!
                        </p>
                      )}
                    </div>
                  )}

                  {/* Invite Actions: Claim / Decline / Release / Pickup */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {inv.status === "sent" && (
                      <>
                        <button
                          type="button"
                          data-testid={`claim-invite-button-${inv.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleClaim(inv.id)}
                          className="rounded-lg bg-owl-gold px-4 py-2 text-sm font-bold text-owl-black transition hover:bg-owl-goldDark disabled:opacity-50"
                        >
                          {busyId === inv.id
                            ? "Holding spot..."
                            : "I'm coming (Hold 10m)"}
                        </button>
                        <button
                          type="button"
                          data-testid={`decline-invite-button-${inv.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleDecline(inv.id)}
                          className="rounded-lg border border-zinc-700 bg-owl-black px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Can&apos;t make it (Decline)
                        </button>
                      </>
                    )}

                    {inv.claim && isHeld && (
                      <>
                        <button
                          type="button"
                          data-testid={`pickup-claim-button-${inv.claim.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handlePickupClaim(inv.claim!.id)}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-owl-black transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                          Confirm Picked Up (Demo)
                        </button>
                        <button
                          type="button"
                          data-testid={`release-claim-button-${inv.claim.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleReleaseClaim(inv.claim!.id)}
                          className="rounded-lg border border-zinc-700 bg-owl-black px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Release Hold
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* Student Self-Service Settings: Presence, Own Preferences & Opt-In Web Push */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Own Preferences & Coarse Presence */}
          <section className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5">
            <h2 className="text-base font-semibold text-white">
              Your Dietary Filters &amp; Campus Check-In
            </h2>
            <p className="text-xs text-zinc-400">
              Used strictly as a hard safety filter before invites are sent.
              Never visible to hosts or other students.
            </p>

            <form onSubmit={handleSavePreferences} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300">
                  Allergens to Exclude ({ALLERGEN_WARNING_TEXT})
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ALLERGENS.map((alg) => {
                    const active = myAllergens.includes(alg);
                    return (
                      <button
                        key={alg}
                        type="button"
                        onClick={() => toggleMyAllergen(alg)}
                        className={`rounded border px-2 py-1 text-xs font-medium ${
                          active
                            ? "border-amber-400 bg-amber-500/20 text-amber-100"
                            : "border-zinc-700 bg-owl-black text-zinc-400"
                        }`}
                      >
                        {active ? "✓ " : ""}
                        {alg.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300">
                  Required Diets
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DIETS.map((diet) => {
                    const active = myDiets.includes(diet);
                    return (
                      <button
                        key={diet}
                        type="button"
                        onClick={() => toggleMyDiet(diet)}
                        className={`rounded border px-2 py-1 text-xs font-medium ${
                          active
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                            : "border-zinc-700 bg-owl-black text-zinc-400"
                        }`}
                      >
                        {active ? "✓ " : ""}
                        {diet.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={alertsPaused}
                  onChange={(e) => setAlertsPaused(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                />
                <span>Pause food alerts for my account</span>
              </label>

              <button
                type="submit"
                disabled={busyId !== null}
                className="rounded-lg border border-owl-gold/50 bg-owl-gold/15 px-3.5 py-2 text-xs font-semibold text-owl-gold hover:bg-owl-gold/25"
              >
                Save My Preferences
              </button>
            </form>

            <div className="border-t border-zinc-800 pt-3">
              <div className="text-xs font-semibold text-zinc-300">
                Coarse Campus Check-In (2-Hour Window)
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={presenceBuilding}
                  onChange={(e) => setPresenceBuilding(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-owl-black px-3 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleCheckInPresence()}
                  disabled={busyId !== null}
                  className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  Check In
                </button>
              </div>
              {presenceValidUntil && (
                <p className="mt-1 text-[11px] text-emerald-300">
                  Checked in until {formatEasternTime(presenceValidUntil)}.
                </p>
              )}
            </div>
          </section>

          {/* Opt-In FCM Web Push & iOS Home Screen Guide */}
          <section className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">
                Opt-In Web Push Alerts (FCM)
              </h2>
              <span
                data-testid="fcm-config-badge"
                className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                  fcmStatus.enabled
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {fcmStatus.enabled
                  ? "FCM Configured"
                  : "FCM Disabled (Demo Log Mode)"}
              </span>
            </div>

            <p className="text-xs text-zinc-300">{fcmStatus.reason}</p>

            <div className="rounded-lg border border-zinc-800 bg-owl-black/60 p-3 text-xs text-zinc-300 space-y-1.5">
              <div className="font-semibold text-owl-gold">
                iPhone / iOS Safari Setup (iOS 16.4+)
              </div>
              <p>
                On iPhone, web push requires installing Owl Plate to your Home
                Screen first: tap <strong>Share</strong> in Safari, choose{" "}
                <strong>Add to Home Screen</strong>, open the installed app
                icon, and tap Enable Push Alerts below.
              </p>
            </div>

            <button
              type="button"
              data-testid="enable-fcm-button"
              disabled={!fcmStatus.enabled || busyId === "fcm"}
              onClick={() => void handleEnableFcm()}
              className="w-full rounded-lg bg-owl-gold px-4 py-2.5 text-xs font-bold text-owl-black transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fcmStatus.enabled
                ? "Enable Web Push Notifications (Opt-In)"
                : "Real FCM Disabled (No Firebase Config Present)"}
            </button>

            {fcmFeedback && (
              <div
                data-testid="fcm-feedback-box"
                className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-3 text-xs text-sky-200"
              >
                {fcmFeedback}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
