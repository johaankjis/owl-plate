"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoHeader } from "../../components/DemoHeader";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type DemoArea,
  type DemoAreaId,
  type Diet,
} from "../../lib/types/api";
import {
  ApiContractError,
  getDemoAreas,
  INITIAL_DATA_SOURCE,
  joinDemoSession,
  type DataSourceMode,
} from "../../lib/api-client";
import { FIXTURE_DEMO_AREAS } from "../../lib/fixtures/demo-fixtures";
import { SESSION_ENDED_MESSAGE, setSessionToken } from "../../lib/session";

function JoinDemoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [areas, setAreas] = useState<DemoArea[]>([...FIXTURE_DEMO_AREAS]);
  const [nickname, setNickname] = useState("");
  const [selectedArea, setSelectedArea] = useState<DemoAreaId>("demo-venue");
  const [selectedAllergens, setSelectedAllergens] = useState<Allergen[]>([]);
  const [selectedDiets, setSelectedDiets] = useState<Diet[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDemoAreas()
      .then((res) => {
        if (!active) return;
        setSourceMode(res.source);
        if (res.data.areas.length > 0) {
          setAreas(res.data.areas);
          setSelectedArea(res.data.areas[0]!.id);
        }
      })
      .catch(() => {
        // Keep fallback areas if API is starting up
      });
    return () => {
      active = false;
    };
  }, []);

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
      setNicknameError("Enter a nickname to join the demo.");
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

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        {reason === "session_ended" && (
          <div
            role="alert"
            data-testid="session-ended-banner"
            className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-200"
          >
            {SESSION_ENDED_MESSAGE}
          </div>
        )}

        <section className="space-y-2 rounded-xl border border-zinc-800 bg-owl-slate p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-white">
              Join Owl Plate Demo
            </h1>
            <span
              data-testid="fixture-label"
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300"
            >
              Simulated locations &amp; notifications
            </span>
          </div>
          <p className="text-sm text-zinc-300">
            Receive nearby food invites on your phone during the live demo. No
            account, email, or phone number required.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-zinc-800 bg-owl-slate p-5"
        >
          {/* Nickname */}
          <div>
            <label
              htmlFor="join-nickname-input"
              className="block text-sm font-semibold text-white"
            >
              Nickname
            </label>
            <p className="mt-0.5 text-xs text-zinc-400">
              Shown on the demo projector screen so you can spot your wave.
            </p>
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
              className={`mt-2 w-full rounded-lg border bg-owl-black px-3.5 py-2.5 text-sm text-white focus:outline-none ${
                nicknameError
                  ? "border-rose-500 focus:border-rose-400"
                  : "border-zinc-700 focus:border-owl-gold"
              }`}
            />
            {nicknameError && (
              <p
                role="alert"
                data-testid="join-nickname-error"
                className="mt-1.5 text-xs font-semibold text-rose-300"
              >
                {nicknameError}
              </p>
            )}
          </div>

          {/* Demo Area (Simulated Locations) */}
          <fieldset className="space-y-2.5">
            <legend className="text-sm font-semibold text-white">
              Simulated Demo Area
            </legend>
            <p className="text-xs text-zinc-400">
              All demo locations are simulated H3 rings around the event origin
              (not real GPS tracking).
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {areas.map((area) => {
                const selected = selectedArea === area.id;
                return (
                  <button
                    key={area.id}
                    type="button"
                    data-testid={`join-area-${area.id}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedArea(area.id)}
                    className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? "border-owl-gold bg-owl-gold/15 text-white"
                        : "border-zinc-700 bg-owl-black text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">
                        {area.label}
                      </span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-owl-gold">
                        Ring {area.ring_distance}
                      </span>
                    </div>
                    <span className="mt-1 text-xs text-zinc-300">
                      {area.description}
                    </span>
                    <span className="mt-1 text-[11px] text-amber-300/90">
                      Simulated location
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Optional Allergens to Exclude */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-white">
              Allergens to Avoid (Optional)
            </legend>
            <p className="text-xs text-zinc-400">
              Hard filter before invites are sent. Every allergen estimate
              carries:{" "}
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
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
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

          {/* Optional Required Diets */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-white">
              Dietary Requirements (Optional)
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
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
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

          {/* Required Privacy Notice */}
          <div
            data-testid="join-privacy-notice"
            className="rounded-lg border border-zinc-700 bg-owl-black/80 p-3.5 text-xs text-zinc-200"
          >
            The demo screen shows your nickname and whether you were matched or
            skipped. Your specific restrictions are never shown.
          </div>

          {generalError && (
            <div
              role="alert"
              data-testid="join-error-message"
              className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"
            >
              {generalError}
            </div>
          )}

          <button
            type="submit"
            data-testid="join-submit"
            disabled={submitting}
            className="w-full rounded-lg bg-owl-gold px-4 py-3 text-sm font-bold text-owl-black transition hover:bg-owl-goldDark disabled:opacity-50"
          >
            {submitting ? "Joining demo..." : "Join Demo & Watch for Food"}
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
          Loading demo join screen...
        </div>
      }
    >
      <JoinDemoContent />
    </Suspense>
  );
}
