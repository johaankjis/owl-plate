"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DemoHeader } from "../../components/DemoHeader";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  RELIGIOUS_DIETS,
  type Allergen,
  type Diet,
  type DropEdit,
  type DropResponse,
  type SafetyReview,
} from "../../lib/types/api";
import {
  createDrop,
  getDrop,
  getActiveDrop,
  publishDrop,
  updateDrop,
  INITIAL_DATA_SOURCE,
  type DataSourceMode,
} from "../../lib/api-client";

const HOST_CREDENTIAL = "demo-host" as const;

export default function HostPage() {
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [drop, setDrop] = useState<DropResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hostNote, setHostNote] = useState<string>("");

  // Host review form state
  const [servingsFinal, setServingsFinal] = useState<number>(2);
  const [allergensFinal, setAllergensFinal] = useState<Allergen[]>([
    "dairy",
    "gluten",
  ]);
  const [dietTagsFinal, setDietTagsFinal] = useState<Diet[]>([]);
  const [buildingCode, setBuildingCode] = useState<string>("DEMO-ORIGIN");
  const [room, setRoom] = useState<string>("214");
  const [expiresInMinutes, setExpiresInMinutes] = useState<number>(45);
  const [safetyReview, setSafetyReview] = useState<SafetyReview>({
    covered_and_temperature_safe: false,
    served_within_two_hours: false,
    untouched: false,
    ingredient_information_checked: false,
    religious_diets_confirmed: false,
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncFormFromDrop = useCallback((d: DropResponse) => {
    setServingsFinal(d.servings_final);
    setAllergensFinal([...d.allergens_final]);
    setDietTagsFinal([...d.diet_tags_final]);
    setBuildingCode(d.building_code);
    setRoom(d.room);
    if (d.safety_review) {
      setSafetyReview({ ...d.safety_review });
    } else {
      setSafetyReview({
        covered_and_temperature_safe: false,
        served_within_two_hours: false,
        untouched: false,
        ingredient_information_checked: false,
        religious_diets_confirmed: false,
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    getActiveDrop(HOST_CREDENTIAL)
      .then((activeDrop) => {
        if (!active) return null;
        setSourceMode(activeDrop.source);
        return activeDrop.data.drop_id
          ? getDrop(activeDrop.data.drop_id, HOST_CREDENTIAL)
          : null;
      })
      .then((res) => {
        if (!active || !res) return;
        setDrop(res.data);
        setSourceMode(res.source);
        syncFormFromDrop(res.data);
      })
      .catch((err) => {
        if (active)
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to load current drop",
          );
      });
    return () => {
      active = false;
    };
  }, [syncFormFromDrop]);

  const removedEstimatedAllergens = drop
    ? drop.vision.allergens_likely.filter(
        (alg) => !allergensFinal.includes(alg),
      )
    : [];
  const requiresIngredientCheck = removedEstimatedAllergens.length > 0;

  const selectedReligiousDiets = dietTagsFinal.filter((d) =>
    RELIGIOUS_DIETS.includes(d),
  );
  const requiresReligiousConfirmation = selectedReligiousDiets.length > 0;

  const firstThreeSafetyChecked =
    safetyReview.covered_and_temperature_safe &&
    safetyReview.served_within_two_hours &&
    safetyReview.untouched;

  const canPublish =
    firstThreeSafetyChecked &&
    (!requiresIngredientCheck || safetyReview.ingredient_information_checked) &&
    (!requiresReligiousConfirmation || safetyReview.religious_diets_confirmed);

  const toggleAllergen = (alg: Allergen) => {
    setAllergensFinal((prev) =>
      prev.includes(alg) ? prev.filter((item) => item !== alg) : [...prev, alg],
    );
  };

  const toggleDiet = (diet: Diet) => {
    setDietTagsFinal((prev) =>
      prev.includes(diet)
        ? prev.filter((item) => item !== diet)
        : [...prev, diet],
    );
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("upload");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (!selectedFile)
        throw new Error("Select a JPEG or PNG food photo first.");
      const res = await createDrop(selectedFile, hostNote, HOST_CREDENTIAL);
      setDrop(res.data);
      setSourceMode(res.source);
      syncFormFromDrop(res.data);
      setStatusMessage(
        `Photo processed (${
          res.data.vision_source === "fixture"
            ? "Cached fixture estimate (simulated)"
            : "Live Gemini Vision"
        }). Review servings, allergens, and safety checklist below.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create drop",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const buildDropEditPayload = (): DropEdit => ({
    servings_final: servingsFinal,
    allergens_final: allergensFinal,
    diet_tags_final: dietTagsFinal,
    building_code: buildingCode.trim() || "DEMO-ORIGIN",
    room: room.trim(),
    expires_in_minutes: expiresInMinutes,
    safety_review: safetyReview,
  });

  const handleSaveReview = async () => {
    if (!drop) return;
    setBusyAction("patch");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await updateDrop(
        drop.id,
        buildDropEditPayload(),
        HOST_CREDENTIAL,
      );
      setDrop(res.data);
      setSourceMode(res.source);
      setStatusMessage("Host review saved.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update drop",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublishDrop = async () => {
    if (!drop) return;
    setBusyAction("publish");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const patched = await updateDrop(
        drop.id,
        buildDropEditPayload(),
        HOST_CREDENTIAL,
      );
      const published = await publishDrop(patched.data.id, HOST_CREDENTIAL);
      setDrop(published.data);
      setSourceMode(published.source);
      setStatusMessage(
        `Got it. About ${published.data.servings_final} servings. We'll send it to the right people.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to publish drop",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const currentStep = !drop ? 1 : drop.status === "draft" ? 2 : 3;

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader
        sourceMode={sourceMode}
        visionSource={drop?.vision_source}
        isDemo={drop?.is_demo ?? true}
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Header & 3-Step Indicator */}
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Share Leftover Event Food
            </h1>
            <p className="mt-1 text-sm text-zinc-300">
              Three quick steps: upload a food photo, review the AI estimate,
              confirm food safety and publish. Hosts see serving counts only.
            </p>
          </div>

          <ol
            aria-label="Host posting steps"
            className="grid grid-cols-3 gap-2 text-xs font-semibold"
          >
            <li
              className={`rounded-lg border px-3 py-2 ${
                currentStep === 1
                  ? "border-owl-gold bg-owl-gold/15 text-owl-gold"
                  : "border-zinc-800 bg-owl-black/60 text-zinc-300"
              }`}
            >
              1. Upload
            </li>
            <li
              className={`rounded-lg border px-3 py-2 ${
                currentStep === 2
                  ? "border-owl-gold bg-owl-gold/15 text-owl-gold"
                  : "border-zinc-800 bg-owl-black/60 text-zinc-300"
              }`}
            >
              2. Review
            </li>
            <li
              className={`rounded-lg border px-3 py-2 ${
                currentStep === 3
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-800 bg-owl-black/60 text-zinc-300"
              }`}
            >
              3. Publish
            </li>
          </ol>
        </section>

        {statusMessage && (
          <div
            data-testid="host-status-message"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            data-testid="host-error-message"
            className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Step 1: Upload Photo */}
        <section className="rounded-xl border border-zinc-800 bg-owl-slate p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-owl-gold">
              Step 1: Upload Food Photo
            </h2>
            <span className="text-xs text-zinc-400">
              Photos must show food only. Processed without permanent storage.
            </span>
          </div>

          <form
            onSubmit={handleUploadPhoto}
            className="mt-4 grid gap-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-1">
              <label
                htmlFor="food-photo-input"
                className="block text-xs font-medium text-zinc-300"
              >
                Food Photo (JPEG/PNG, max 10 MiB)
              </label>
              <input
                id="food-photo-input"
                data-testid="food-photo-input"
                type="file"
                required
                accept="image/jpeg,image/png"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-700 bg-owl-black px-3 py-2 text-xs text-zinc-200 file:mr-3 file:rounded file:border-0 file:bg-owl-gold file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-owl-black"
              />
            </div>

            <div className="sm:col-span-1">
              <label
                htmlFor="host-note-input"
                className="block text-xs font-medium text-zinc-300"
              >
                Optional Host Note
              </label>
              <input
                id="host-note-input"
                data-testid="host-note-input"
                type="text"
                value={hostNote}
                onChange={(e) => setHostNote(e.target.value)}
                placeholder='e.g. "one tray is vegetarian"'
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-zinc-100 focus:border-owl-gold focus:outline-none"
              />
            </div>

            <div className="flex items-end sm:col-span-1">
              <button
                type="submit"
                data-testid="analyze-photo-button"
                disabled={busyAction !== null}
                className="w-full rounded-lg bg-owl-gold px-4 py-2.5 text-sm font-bold text-owl-black transition hover:bg-owl-goldDark disabled:opacity-50"
              >
                {busyAction === "upload"
                  ? "Estimating with Vision..."
                  : "Upload & Estimate Food"}
              </button>
            </div>
          </form>
        </section>

        {/* Step 2 & Step 3: Review Vision Estimate and Publish */}
        {drop && (
          <div className="space-y-6">
            {/* Step 2: Review AI Estimate & Details */}
            <section className="space-y-5 rounded-xl border border-zinc-800 bg-owl-slate p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-owl-gold">
                  Step 2: Review AI Estimate
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {drop.vision_source === "fixture" ? (
                    <span
                      data-testid="fixture-label"
                      className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300"
                    >
                      Cached fixture estimate (simulated)
                    </span>
                  ) : (
                    <span
                      data-testid="drop-vision-source-pill"
                      className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300"
                    >
                      Live Gemini Vision
                    </span>
                  )}
                  <span
                    data-testid="host-drop-status"
                    className="rounded bg-owl-black px-2.5 py-1 text-xs font-bold uppercase text-owl-gold"
                  >
                    Status: {drop.status}
                  </span>
                </div>
              </div>

              {/* Detected items & confidence */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-owl-black/60 p-3.5 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Detected Food:</span>
                    <span className="font-semibold text-zinc-200">
                      Confidence {Math.round(drop.vision.confidence * 100)}% (
                      {drop.vision.servings_low}–{drop.vision.servings_high}{" "}
                      servings)
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {drop.vision.items.map((item, idx) => (
                      <li
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between rounded bg-owl-black/70 px-2.5 py-1.5"
                      >
                        <span className="font-medium text-zinc-100">
                          {item.name}
                        </span>
                        <span className="text-xs text-zinc-400">
                          ~{item.count_estimate} {item.portion_unit}(s)
                        </span>
                      </li>
                    ))}
                  </ul>
                  {drop.vision.confidence < 0.6 && (
                    <p className="rounded bg-amber-500/20 p-2 text-amber-200">
                      Low vision confidence (&lt;60%): all 9 common allergens
                      were automatically flagged.
                    </p>
                  )}
                </div>

                {/* Anonymous serving counts */}
                <div className="rounded-lg border border-zinc-800 bg-owl-black/60 p-3.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Serving Counts (Anonymous)
                  </h3>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded bg-zinc-900 p-2">
                      <div className="text-lg font-bold text-white">
                        {drop.counts.total}
                      </div>
                      <div className="text-[11px] text-zinc-400">Total</div>
                    </div>
                    <div className="rounded bg-zinc-900 p-2">
                      <div
                        data-testid="host-count-available"
                        className="text-lg font-bold text-emerald-400"
                      >
                        {drop.counts.available}
                      </div>
                      <div className="text-[11px] text-zinc-400">Available</div>
                    </div>
                    <div className="rounded bg-zinc-900 p-2">
                      <div
                        data-testid="host-count-held"
                        className="text-lg font-bold text-amber-400"
                      >
                        {drop.counts.held}
                      </div>
                      <div className="text-[11px] text-zinc-400">Held</div>
                    </div>
                    <div className="rounded bg-zinc-900 p-2">
                      <div className="text-lg font-bold text-sky-400">
                        {drop.counts.picked_up}
                      </div>
                      <div className="text-[11px] text-zinc-400">Picked Up</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Servings & Location Inputs */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="servings-input"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Final Servings
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="servings-decrement"
                      onClick={() =>
                        setServingsFinal((s) => Math.max(1, s - 1))
                      }
                      className="h-9 w-9 rounded-lg border border-zinc-700 bg-owl-black text-base font-bold text-zinc-200 hover:bg-zinc-800"
                    >
                      −
                    </button>
                    <input
                      id="servings-input"
                      type="number"
                      data-testid="servings-input"
                      min={1}
                      max={500}
                      value={servingsFinal}
                      onChange={(e) =>
                        setServingsFinal(
                          Math.min(
                            500,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        )
                      }
                      className="w-20 rounded-lg border border-zinc-700 bg-owl-black px-2 py-1.5 text-center text-sm font-bold text-white"
                    />
                    <button
                      type="button"
                      data-testid="servings-increment"
                      onClick={() =>
                        setServingsFinal((s) => Math.min(500, s + 1))
                      }
                      className="h-9 w-9 rounded-lg border border-zinc-700 bg-owl-black text-base font-bold text-zinc-200 hover:bg-zinc-800"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="building-code-input"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Building Code
                  </label>
                  <input
                    id="building-code-input"
                    type="text"
                    value={buildingCode}
                    onChange={(e) => setBuildingCode(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="room-input"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Room &amp; Expiry (min)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="room-input"
                      type="text"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      placeholder="Room 214"
                      className="w-1/2 rounded-lg border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-white"
                    />
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={expiresInMinutes}
                      onChange={(e) =>
                        setExpiresInMinutes(
                          Math.min(
                            120,
                            Math.max(1, Number(e.target.value) || 45),
                          ),
                        )
                      }
                      className="w-1/2 rounded-lg border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-white"
                      title="Drop expiry in minutes (default 45, max 120)"
                    />
                  </div>
                </div>
              </div>

              {/* Allergens Editor */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Allergens ({ALLERGEN_WARNING_TEXT})
                  </span>
                  <span className="text-[11px] text-amber-300">
                    AI flagged:{" "}
                    {drop.vision.allergens_likely.join(", ") || "none"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALLERGENS.map((alg) => {
                    const checked = allergensFinal.includes(alg);
                    const wasEstimated =
                      drop.vision.allergens_likely.includes(alg);
                    return (
                      <button
                        key={alg}
                        type="button"
                        data-testid={`allergen-toggle-${alg}`}
                        onClick={() => toggleAllergen(alg)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          checked
                            ? "border-amber-400 bg-amber-500/20 text-amber-100"
                            : "border-zinc-700 bg-owl-black text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {checked ? "✓ " : "+ "}
                        {alg.replace("_", " ")}
                        {wasEstimated ? " (AI)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mandatory Allergen Display Box */}
              <AllergenListDisplay
                allergens={allergensFinal}
                notice={drop.allergen_notice}
                title="Active Drop Allergens"
              />

              {/* Diet Tags Editor */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Dietary Tags
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Halal, Kosher, and Pork-Free require explicit host
                    confirmation.
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DIETS.map((diet) => {
                    const checked = dietTagsFinal.includes(diet);
                    const isReligious = RELIGIOUS_DIETS.includes(diet);
                    return (
                      <button
                        key={diet}
                        type="button"
                        data-testid={`diet-toggle-${diet}`}
                        onClick={() => toggleDiet(diet)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          checked
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                            : "border-zinc-700 bg-owl-black text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {checked ? "✓ " : "+ "}
                        {diet.replace("_", " ")}
                        {isReligious ? " (Host confirm)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Step 3: Safety Checklist & Publish */}
            <section className="space-y-4 rounded-xl border border-zinc-800 bg-owl-slate p-5">
              <h2 className="text-lg font-semibold text-owl-gold">
                Step 3: Confirm Food Safety &amp; Publish
              </h2>

              <div className="space-y-2.5 rounded-xl border border-zinc-700 bg-owl-black/80 p-4">
                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    data-testid="safety-check-covered"
                    checked={safetyReview.covered_and_temperature_safe}
                    onChange={(e) =>
                      setSafetyReview((s) => ({
                        ...s,
                        covered_and_temperature_safe: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                  />
                  <span>
                    <strong>Covered &amp; temperature safe:</strong> Food has
                    been kept covered and at a safe holding temperature.
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    data-testid="safety-check-two-hours"
                    checked={safetyReview.served_within_two_hours}
                    onChange={(e) =>
                      setSafetyReview((s) => ({
                        ...s,
                        served_within_two_hours: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                  />
                  <span>
                    <strong>Served within 2 hours:</strong> Food was set out
                    within the last two hours.
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    data-testid="safety-check-untouched"
                    checked={safetyReview.untouched}
                    onChange={(e) =>
                      setSafetyReview((s) => ({
                        ...s,
                        untouched: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                  />
                  <span>
                    <strong>Untouched serving trays:</strong> Food comes from
                    shared catering/event trays, never individual plates.
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-xs ${
                    requiresIngredientCheck
                      ? "border border-amber-500/50 bg-amber-950/30 text-amber-100"
                      : "text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid="safety-check-ingredients"
                    checked={safetyReview.ingredient_information_checked}
                    onChange={(e) =>
                      setSafetyReview((s) => ({
                        ...s,
                        ingredient_information_checked: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                  />
                  <span>
                    <strong>Ingredient information checked:</strong> Required if
                    removing any AI-estimated allergen
                    {requiresIngredientCheck
                      ? ` (You removed: ${removedEstimatedAllergens.join(", ")})`
                      : "."}
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-xs ${
                    requiresReligiousConfirmation
                      ? "border border-emerald-500/50 bg-emerald-950/30 text-emerald-100"
                      : "text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid="safety-check-religious"
                    checked={safetyReview.religious_diets_confirmed}
                    onChange={(e) =>
                      setSafetyReview((s) => ({
                        ...s,
                        religious_diets_confirmed: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-owl-gold"
                  />
                  <span>
                    <strong>Religious diet compliance confirmed:</strong>{" "}
                    Required when tagging food as halal, kosher, or pork_free
                    {requiresReligiousConfirmation
                      ? ` (Selected: ${selectedReligiousDiets.join(", ")})`
                      : "."}
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  data-testid="save-review-button"
                  disabled={busyAction !== null}
                  onClick={handleSaveReview}
                  className="rounded-lg border border-zinc-700 bg-owl-black px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {busyAction === "patch" ? "Saving..." : "Save Review"}
                </button>

                <button
                  type="button"
                  data-testid="publish-drop-button"
                  disabled={busyAction !== null || !canPublish}
                  onClick={handlePublishDrop}
                  className="rounded-lg bg-owl-gold px-5 py-2.5 text-sm font-bold text-owl-black transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === "publish"
                    ? "Publishing Wave 1..."
                    : "Confirm Safety & Publish Wave 1"}
                </button>
              </div>
              {!canPublish && (
                <p
                  data-testid="publish-validation-hint"
                  className="text-right text-xs text-amber-300"
                >
                  Check all required safety confirmations above to enable
                  publishing.
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
