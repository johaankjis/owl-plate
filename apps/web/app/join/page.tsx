"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import { BuildingSelector } from "../../components/BuildingSelector";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type Building,
  type DemoArea,
  type Diet,
} from "../../lib/types/api";
import {
  ApiContractError,
  getBuildings,
  getDemoAreas,
  INITIAL_DATA_SOURCE,
  joinDemoSession,
  type DataSourceMode,
} from "../../lib/api-client";
import { filterVerifiedBuildings } from "../../lib/buildings";
import { FIXTURE_DEMO_AREAS } from "../../lib/fixtures/demo-fixtures";
import { SESSION_ENDED_MESSAGE, setSessionToken } from "../../lib/session";

function JoinDemoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState<boolean>(true);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [areas, setAreas] = useState<DemoArea[]>([...FIXTURE_DEMO_AREAS]);
  const [nickname, setNickname] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("demo-venue");
  const [selectedAllergens, setSelectedAllergens] = useState<Allergen[]>([]);
  const [selectedDiets, setSelectedDiets] = useState<Diet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setBuildingsLoading(true);
    setBuildingsError(null);

    const [buildingsRes, areasRes] = await Promise.allSettled([
      getBuildings(),
      getDemoAreas(),
    ]);

    if (areasRes.status === "fulfilled") {
      setSourceMode(areasRes.value.source);
      if (areasRes.value.data.areas.length > 0) {
        setAreas(areasRes.value.data.areas);
      }
    }

    if (buildingsRes.status === "fulfilled") {
      setSourceMode(buildingsRes.value.source);
      const verified = filterVerifiedBuildings(
        buildingsRes.value.data.buildings,
      );
      setBuildings(verified);
      if (verified.length > 0) {
        setSelectedArea((prev) =>
          prev === "demo-venue" ? verified[0]!.id : prev,
        );
      }
    } else {
      const err = buildingsRes.reason;
      setBuildingsError(
        err instanceof Error
          ? err.message
          : "Could not load Marietta campus buildings.",
      );
    }

    setBuildingsLoading(false);
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

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
        area: selectedArea,
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
              Find nearby food
            </h1>
            <span
              data-testid="simulated-notification-label"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300"
            >
              Simulated notifications
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            No account, phone number, or GPS tracking needed. Choose your
            Marietta campus building and any dietary filters below.
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

          {/* 2. Campus Building Selector (Verified Marietta Campus + Explicit Rehearsal Areas) */}
          <fieldset className="space-y-2">
            <BuildingSelector
              buildings={buildings}
              value={selectedArea}
              onChange={setSelectedArea}
              loading={buildingsLoading}
              error={buildingsError}
              onRetry={() => void loadLocations()}
              testIdPrefix="join"
              rehearsalOptions={areas}
              getRehearsalOptionTestId={(id) => `join-area-${id}`}
              label="2. Where are you on campus?"
              helperText="Pick a verified Marietta building (no GPS permission required), or choose an explicit synthetic rehearsal area below."
            />
          </fieldset>

          {/* 3. Optional Dietary Restrictions */}
          <div className="space-y-4 border-t border-zinc-800 pt-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-white">
                3. Allergens to avoid{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </legend>
              <p className="text-xs text-zinc-400">
                Filtered before invites are sent. Allergens always say:{" "}
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
            Your restrictions are private and used only to filter out food that
            doesn&apos;t fit you.
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
