"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type Diet,
} from "../../lib/types/api";
import {
  ApiContractError,
  INITIAL_DATA_SOURCE,
  joinDemoSession,
  type DataSourceMode,
} from "../../lib/api-client";
import { SESSION_ENDED_MESSAGE, setSessionToken } from "../../lib/session";
import { useNotificationMode } from "../../lib/vision-mode";

function JoinDemoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const notificationMode = useNotificationMode();

  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [nickname, setNickname] = useState("");
  const [selectedAllergens, setSelectedAllergens] = useState<Allergen[]>([]);
  const [selectedDiets, setSelectedDiets] = useState<Diet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const toggleAllergen = (alg: Allergen) => {
    setSelectedAllergens((prev) =>
      prev.includes(alg) ? prev.filter((item) => item !== alg) : [...prev, alg],
    );
  };

  const toggleDiet = (diet: Diet) => {
    setSelectedDiets((prev) =>
      prev.includes(diet)
        ? prev.filter((item) => item !== diet)
        : [...prev, diet],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNicknameError(null);
    setGeneralError(null);

    const trimmed = nickname.trim();
    if (!trimmed) {
      setNicknameError("Enter a nickname to join.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await joinDemoSession({
        nickname: trimmed,
        allergens: selectedAllergens,
        diets: selectedDiets,
      });
      setSourceMode(res.source);
      setSessionToken(res.data.token);
      router.push("/student");
    } catch (err) {
      if (err instanceof ApiContractError && err.code === "nickname_taken") {
        setNicknameError(
          err.message ||
            "That nickname is already taken. Pick another nickname.",
        );
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("Could not join the demo session. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const notifyBadgeText =
    notificationMode === "fcm"
      ? "Real push available after join"
      : "Simulated notifications";

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader sourceMode={sourceMode} isDemo={true} />

      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-5 sm:max-w-lg">
        {reason === "session_ended" && (
          <div
            role="alert"
            data-testid="session-ended-banner"
            className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-200"
          >
            {SESSION_ENDED_MESSAGE}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Browse campus food drops
            </h1>
            <span
              data-testid="simulated-notification-label"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300"
            >
              {notifyBadgeText}
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            No account, phone number, location selection, or GPS tracking
            needed. Pick a nickname and any optional dietary filters below to
            browse active Marietta campus food drops.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-zinc-800 bg-owl-slate p-5 shadow-lg"
        >
          {/* 1. Nickname */}
          <div className="space-y-1.5">
            <label
              htmlFor="join-nickname-input"
              className="block text-sm font-bold text-white"
            >
              1. Your nickname
            </label>
            <input
              id="join-nickname-input"
              data-testid="join-nickname-input"
              type="text"
              required
              maxLength={24}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (nicknameError) setNicknameError(null);
              }}
              placeholder="e.g. ScrappyOwl"
              aria-invalid={nicknameError ? "true" : "false"}
              className={`min-h-[48px] w-full rounded-xl border bg-owl-black px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:outline-none ${
                nicknameError
                  ? "border-rose-500 focus:border-rose-400"
                  : "border-zinc-700 focus:border-owl-gold"
              }`}
            />
            {nicknameError && (
              <p
                role="alert"
                data-testid="join-nickname-error"
                className="text-xs font-semibold text-rose-300"
              >
                {nicknameError}
              </p>
            )}
          </div>

          {/* 2. Optional Dietary Restrictions */}
          <div className="space-y-4 border-t border-zinc-800 pt-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-white">
                2. Allergens to avoid{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </legend>
              <p className="text-xs text-zinc-400">
                Checked before reservations and alerts. Allergens always say:{" "}
                <strong className="text-amber-300">
                  {ALLERGEN_WARNING_TEXT}
                </strong>
                .
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {ALLERGENS.map((alg) => {
                  const active = selectedAllergens.includes(alg);
                  return (
                    <button
                      key={alg}
                      type="button"
                      data-testid={`join-allergen-${alg}`}
                      aria-pressed={active}
                      onClick={() => toggleAllergen(alg)}
                      className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-amber-400 bg-amber-500/20 text-amber-100"
                          : "border-zinc-700 bg-owl-black text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {active ? "✓ " : ""}
                      {alg.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-white">
                Dietary requirements{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {DIETS.map((diet) => {
                  const active = selectedDiets.includes(diet);
                  return (
                    <button
                      key={diet}
                      type="button"
                      data-testid={`join-diet-${diet}`}
                      aria-pressed={active}
                      onClick={() => toggleDiet(diet)}
                      className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                          : "border-zinc-700 bg-owl-black text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {active ? "✓ " : ""}
                      {diet.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <p
            data-testid="join-privacy-notice"
            className="text-xs leading-relaxed text-zinc-400"
          >
            Your restrictions are private and used only to protect you from food
            that doesn&apos;t fit your needs. No location or GPS is collected.
          </p>

          {generalError && (
            <div
              role="alert"
              data-testid="join-error-message"
              className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"
            >
              {generalError}
            </div>
          )}

          {/* Big bottom primary button */}
          <button
            type="submit"
            data-testid="join-submit"
            disabled={submitting}
            className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:opacity-50"
          >
            {submitting ? "Joining..." : "Join"}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-owl-black p-6 text-sm text-zinc-400">
          Loading...
        </div>
      }
    >
      <JoinDemoContent />
    </Suspense>
  );
}
