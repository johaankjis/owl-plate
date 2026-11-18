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
import {
  formatHostCounts,
  getVisionSourceLabel,
  HOST_POLL_INTERVAL_MS,
  isLiveVisionSource,
  resolveHostStep,
  restoreHostDropState,
  shouldPollHostCounts,
  type HostViewStep,
} from "./host-helpers";

const HOST_CREDENTIAL = "demo-host" as const;

export default function HostPage() {
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [drop, setDrop] = useState<DropResponse | null>(null);
  const [viewStep, setViewStep] = useState<HostViewStep>("upload");
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
  const expiresInMinutes = 45;
  const [safetyReview, setSafetyReview] = useState<SafetyReview>({
    covered_and_temperature_safe: false,
    served_within_two_hours: false,
    untouched: false,
    ingredient_information_checked: false,
    religious_diets_confirmed: false,
  });

  // Editable items and notes display state for review
  const [editableItemsText, setEditableItemsText] = useState<string>("");
  const [editableNotesText, setEditableNotesText] = useState<string>("");

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visionErrorMessage, setVisionErrorMessage] = useState<string | null>(
    null,
  );

  const syncFormFromDrop = useCallback((d: DropResponse) => {
    setServingsFinal(d.servings_final);
    setAllergensFinal([...d.allergens_final]);
    setDietTagsFinal([...d.diet_tags_final]);
    setBuildingCode(d.building_code);
    setRoom(d.room);
    setEditableItemsText(
      d.vision.items
        .map(
          (item) =>
            `${item.name} (~${item.count_estimate} ${item.portion_unit})`,
        )
        .join(", "),
    );
    setEditableNotesText(d.vision.notes ?? "");
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

  // Restore active drop on mount via GET /demo/active-drop then GET /drops/{id}
  useEffect(() => {
    let active = true;
    restoreHostDropState(
      () => getActiveDrop(HOST_CREDENTIAL),
      (dropId) => getDrop(dropId, HOST_CREDENTIAL),
    )
      .then((restored) => {
        if (!active) return;
        setSourceMode(restored.source);
        setDrop(restored.drop);
        setViewStep(restored.step);
        if (restored.drop) {
          syncFormFromDrop(restored.drop);
        }
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

  // Poll GET /drops/{id} (demo-host) every 2 s while the counts panel is open
  const activeDropId = drop?.id ?? null;
  const activeDropStatus = drop?.status ?? null;

  useEffect(() => {
    if (
      !activeDropId ||
      viewStep !== "counts" ||
      (activeDropStatus !== "live" && activeDropStatus !== "claimed_out")
    ) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getDrop(activeDropId, HOST_CREDENTIAL);
        if (cancelled) return;
        setSourceMode(res.source);
        setDrop(res.data);
        setViewStep(resolveHostStep(res.data));
      } catch {
        // Keep current counts displayed on transient poll failure
      }
    };

    const intervalId = setInterval(() => {
      void poll();
    }, HOST_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeDropId, activeDropStatus, viewStep]);

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

  const submitPhotoUpload = async () => {
    setBusyAction("upload");
    setErrorMessage(null);
    setVisionErrorMessage(null);
    setStatusMessage(null);
    try {
      if (!selectedFile)
        throw new Error("Select a JPEG or PNG food photo first.");
      const res = await createDrop(selectedFile, hostNote, HOST_CREDENTIAL);
      setDrop(res.data);
      setViewStep(resolveHostStep(res.data));
      setSourceMode(res.source);
      syncFormFromDrop(res.data);
      setStatusMessage(
        `Estimate ready (${getVisionSourceLabel(res.data.vision_source)}). Confirm details and food safety below.`,
      );
    } catch (err) {
      // Never show or fabricate an estimate when POST /drops fails
      setDrop(null);
      setViewStep("upload");
      const msg = err instanceof Error ? err.message : "Failed to create drop";
      setVisionErrorMessage(msg);
      setErrorMessage(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPhotoUpload();
  };

  const handleShareAnotherDrop = () => {
    setDrop(null);
    setViewStep("upload");
    setStatusMessage(null);
    setErrorMessage(null);
    setVisionErrorMessage(null);
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
      setViewStep(resolveHostStep(published.data));
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

  const currentStep = viewStep === "upload" ? 1 : viewStep === "review" ? 2 : 3;
  const formattedCounts = drop ? formatHostCounts(drop.counts) : null;
  const isPollingCounts = shouldPollHostCounts(drop, viewStep);

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader
        sourceMode={sourceMode}
        visionSource={drop?.vision_source}
        isDemo={drop?.is_demo ?? true}
      />

      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-5 sm:max-w-2xl">
        {/* Step Header */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Share leftover food
            </h1>
            <span className="rounded-full border border-zinc-700 bg-owl-slate px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
              Hosts see counts only
            </span>
          </div>

          <ol
            aria-label="Host posting steps"
            className="grid grid-cols-3 gap-2 text-center text-xs font-bold"
          >
            <li
              className={`rounded-xl border px-2.5 py-2 ${
                currentStep === 1
                  ? "border-owl-gold bg-owl-gold/15 text-owl-gold"
                  : "border-zinc-800 bg-owl-slate text-zinc-400"
              }`}
            >
              1. Photo
            </li>
            <li
              className={`rounded-xl border px-2.5 py-2 ${
                currentStep === 2
                  ? "border-owl-gold bg-owl-gold/15 text-owl-gold"
                  : "border-zinc-800 bg-owl-slate text-zinc-400"
              }`}
            >
              2. Review &amp; publish
            </li>
            <li
              className={`rounded-xl border px-2.5 py-2 ${
                currentStep === 3
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-800 bg-owl-slate text-zinc-400"
              }`}
            >
              3. Pickup counts
            </li>
          </ol>
        </section>

        {statusMessage && (
          <div
            data-testid="host-status-message"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
          >
            {statusMessage}
          </div>
        )}

        {visionErrorMessage && (
          <div
            data-testid="vision-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-100"
          >
            <span>{visionErrorMessage}</span>
            <button
              type="button"
              data-testid="vision-retry-button"
              disabled={busyAction !== null || !selectedFile}
              onClick={() => void submitPhotoUpload()}
              className="min-h-[44px] rounded-xl border border-rose-400/60 bg-rose-900/60 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-800 disabled:opacity-50"
            >
              {busyAction === "upload" ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}

        {errorMessage && !visionErrorMessage && (
          <div
            role="alert"
            data-testid="host-error-message"
            className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* STEP 1: PHOTO */}
        {viewStep === "upload" && (
          <section className="space-y-5 rounded-2xl border border-zinc-800 bg-owl-slate p-5 shadow-lg">
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-white">
                Snap one food photo
              </h2>
              <p className="text-xs text-zinc-400">
                Show the food trays only (no people). Temporary photos are
                removed within 24 hours.
              </p>
            </div>

            <form onSubmit={handleUploadPhoto} className="space-y-5">
              {/* Big photo picker */}
              <div>
                <label
                  htmlFor="food-photo-input"
                  className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-owl-gold/50 bg-owl-black/70 p-5 text-center transition hover:border-owl-gold"
                >
                  <span className="text-sm font-extrabold text-owl-gold">
                    {selectedFile
                      ? `Selected: ${selectedFile.name}`
                      : "Tap to choose or take a food photo"}
                  </span>
                  <span className="mt-1 text-xs text-zinc-400">
                    JPEG or PNG up to 10 MiB
                  </span>
                </label>
                <input
                  id="food-photo-input"
                  data-testid="food-photo-input"
                  type="file"
                  required
                  accept="image/jpeg,image/png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-zinc-300 file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-zinc-800 file:px-3.5 file:py-2 file:text-xs file:font-bold file:text-owl-gold hover:file:bg-zinc-700"
                />
              </div>

              {/* Optional note */}
              <div className="space-y-1.5">
                <label
                  htmlFor="host-note-input"
                  className="block text-sm font-bold text-white"
                >
                  Optional note
                </label>
                <input
                  id="host-note-input"
                  data-testid="host-note-input"
                  type="text"
                  value={hostNote}
                  onChange={(e) => setHostNote(e.target.value)}
                  placeholder='e.g. "one tray is vegetarian"'
                  className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-owl-black px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-owl-gold focus:outline-none"
                />
              </div>

              {/* ONE primary action button: Get estimate */}
              <button
                type="submit"
                data-testid="analyze-photo-button"
                disabled={busyAction !== null}
                className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:opacity-50"
              >
                {busyAction === "upload"
                  ? "Getting estimate..."
                  : "Get estimate"}
              </button>
            </form>
          </section>
        )}

        {/* STEP 2: REVIEW & PUBLISH */}
        {drop && viewStep === "review" && (
          <section className="space-y-6 rounded-2xl border border-zinc-800 bg-owl-slate p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">
                Review &amp; publish
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="vision-source-label"
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    isLiveVisionSource(drop.vision_source)
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-400/40 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {getVisionSourceLabel(drop.vision_source)}
                </span>
                <span
                  data-testid="host-drop-status"
                  className="rounded-full bg-owl-black px-2.5 py-1 text-xs font-bold uppercase text-owl-gold"
                >
                  {drop.status}
                </span>
              </div>
            </div>

            {/* Editable Servings */}
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-owl-black/60 p-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="servings-input"
                  className="text-sm font-bold text-white"
                >
                  Estimated servings
                </label>
                <span className="text-xs text-zinc-400">
                  AI range: {drop.vision.servings_low}–
                  {drop.vision.servings_high}
                </span>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  data-testid="servings-decrement"
                  onClick={() => setServingsFinal((s) => Math.max(1, s - 1))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-700 bg-owl-black text-lg font-bold text-zinc-200 hover:bg-zinc-800"
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
                      Math.min(500, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                  className="min-h-[44px] w-24 rounded-xl border border-zinc-700 bg-owl-black px-3 py-2 text-center text-lg font-extrabold text-white"
                />
                <button
                  type="button"
                  data-testid="servings-increment"
                  onClick={() => setServingsFinal((s) => Math.min(500, s + 1))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-700 bg-owl-black text-lg font-bold text-zinc-200 hover:bg-zinc-800"
                >
                  +
                </button>
              </div>
            </div>

            {/* Editable Items & Notes */}
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-owl-black/60 p-4">
              <div className="space-y-1">
                <label
                  htmlFor="review-items-input"
                  className="block text-xs font-bold uppercase tracking-wide text-zinc-300"
                >
                  Detected items
                </label>
                <input
                  id="review-items-input"
                  type="text"
                  value={editableItemsText}
                  onChange={(e) => setEditableItemsText(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-2 text-sm text-white focus:border-owl-gold focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="review-notes-input"
                  className="block text-xs font-bold uppercase tracking-wide text-zinc-300"
                >
                  Notes
                </label>
                <input
                  id="review-notes-input"
                  type="text"
                  value={editableNotesText}
                  onChange={(e) => setEditableNotesText(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-2 text-sm text-zinc-200 focus:border-owl-gold focus:outline-none"
                />
                {drop.vision.notes && (
                  <p
                    data-testid="vision-notes"
                    className="text-xs italic text-zinc-400"
                  >
                    {editableNotesText || drop.vision.notes}
                  </p>
                )}
              </div>

              {drop.vision.confidence < 0.6 && (
                <p className="rounded-lg bg-amber-500/20 p-2.5 text-xs text-amber-200">
                  Low vision confidence (&lt;60%): all 9 common allergens were
                  flagged for safety.
                </p>
              )}

              {/* Pickup Room & Building */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="building-code-input"
                    className="block text-xs font-semibold text-zinc-300"
                  >
                    Building
                  </label>
                  <input
                    id="building-code-input"
                    type="text"
                    value={buildingCode}
                    onChange={(e) => setBuildingCode(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="room-input"
                    className="block text-xs font-semibold text-zinc-300"
                  >
                    Room
                  </label>
                  <input
                    id="room-input"
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="214"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-owl-black px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            </div>

            {/* Allergen Chips with "may contain, confirm with host" */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-bold text-white">
                  Allergens ({ALLERGEN_WARNING_TEXT})
                </span>
                <span className="text-xs text-amber-300">
                  AI flagged:{" "}
                  {drop.vision.allergens_likely.join(", ") || "none"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
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
                      className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
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

              <AllergenListDisplay
                allergens={allergensFinal}
                notice={drop.allergen_notice}
                title="Active allergen notice"
                compact={true}
              />
            </div>

            {/* Diet Tags Editor */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-bold text-white">
                  Dietary tags
                </span>
                <span className="text-xs text-zinc-400">
                  Halal, Kosher &amp; Pork-Free require host confirmation
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {DIETS.map((diet) => {
                  const checked = dietTagsFinal.includes(diet);
                  return (
                    <button
                      key={diet}
                      type="button"
                      data-testid={`diet-toggle-${diet}`}
                      onClick={() => toggleDiet(diet)}
                      className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                        checked
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                          : "border-zinc-700 bg-owl-black text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {checked ? "✓ " : "+ "}
                      {diet.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Safety Checks Gating ONE Publish Button */}
            <div className="space-y-3 rounded-xl border border-zinc-700 bg-owl-black/80 p-4">
              <h3 className="text-sm font-bold text-owl-gold">
                Required food safety checks
              </h3>

              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-xs text-zinc-200">
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
                  className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  <strong>Covered &amp; temperature safe:</strong> Kept covered
                  at a safe holding temperature.
                </span>
              </label>

              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-xs text-zinc-200">
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
                  className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  <strong>Served within 2 hours:</strong> Food was set out
                  within the last two hours.
                </span>
              </label>

              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-xs text-zinc-200">
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
                  className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  <strong>Untouched trays:</strong> Shared event trays only, not
                  from individual plates.
                </span>
              </label>

              <label
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg p-2 text-xs ${
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
                  className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  <strong>Ingredient label checked:</strong> Required when
                  removing an AI-flagged allergen
                  {requiresIngredientCheck
                    ? ` (removed: ${removedEstimatedAllergens.join(", ")})`
                    : "."}
                </span>
              </label>

              <label
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg p-2 text-xs ${
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
                  className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-owl-gold"
                />
                <span>
                  <strong>Religious diet confirmed:</strong> Required for halal,
                  kosher, or pork_free
                  {requiresReligiousConfirmation
                    ? ` (selected: ${selectedReligiousDiets.join(", ")})`
                    : "."}
                </span>
              </label>
            </div>

            {/* ONE Primary Publish Button + quiet secondary start over */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                data-testid="publish-drop-button"
                disabled={busyAction !== null || !canPublish}
                onClick={() => void handlePublishDrop()}
                className="min-h-[52px] w-full rounded-xl bg-owl-gold px-5 py-3.5 text-base font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busyAction === "publish" ? "Publishing..." : "Publish"}
              </button>

              {!canPublish && (
                <p
                  data-testid="publish-validation-hint"
                  className="text-center text-xs text-amber-300"
                >
                  Confirm the required safety checks above to publish.
                </p>
              )}

              <button
                type="button"
                data-testid="share-another-drop-button"
                onClick={handleShareAnotherDrop}
                className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-transparent px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
              >
                Share another drop
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: PICKUP COUNTS */}
        {drop && viewStep === "counts" && formattedCounts && (
          <section
            data-testid="host-drop-panel"
            className="space-y-6 rounded-2xl border border-zinc-800 bg-owl-slate p-5 shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-extrabold text-white">
                  Pickup counts
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {drop.building_code}
                  {drop.room ? `, Room ${drop.room}` : ""}
                  {isPollingCounts && (
                    <span className="ml-2 text-emerald-400">
                      • Auto-refreshing
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="vision-source-label"
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    isLiveVisionSource(drop.vision_source)
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-400/40 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {getVisionSourceLabel(drop.vision_source)}
                </span>
                <span
                  data-testid="host-drop-status"
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                    drop.status === "claimed_out"
                      ? "bg-sky-500/20 text-sky-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {drop.status}
                </span>
              </div>
            </div>

            {/* Big Available / Held / Picked up (+ Total) with number-only text inside testids */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-owl-black/80 p-4 text-center">
                <div
                  data-testid="host-count-available"
                  className="text-4xl font-extrabold text-emerald-400"
                >
                  {formattedCounts.available}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Available
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-owl-black/80 p-4 text-center">
                <div
                  data-testid="host-count-held"
                  className="text-4xl font-extrabold text-amber-400"
                >
                  {formattedCounts.held}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Held
                </div>
              </div>

              <div className="rounded-2xl border border-sky-500/30 bg-owl-black/80 p-4 text-center">
                <div
                  data-testid="host-count-picked-up"
                  className="text-4xl font-extrabold text-sky-400"
                >
                  {formattedCounts.pickedUp}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Picked up
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-700 bg-owl-black/80 p-4 text-center">
                <div
                  data-testid="host-count-total"
                  className="text-4xl font-extrabold text-white"
                >
                  {formattedCounts.total}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Total
                </div>
              </div>
            </div>

            {/* Summary of shared food & allergen notice */}
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-owl-black/60 p-4">
              <ul className="space-y-1 text-sm text-zinc-100">
                {drop.vision.items.map((item, idx) => (
                  <li
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-zinc-400">
                      ~{item.count_estimate} {item.portion_unit}
                    </span>
                  </li>
                ))}
              </ul>

              <AllergenListDisplay
                allergens={drop.allergens_final}
                notice={drop.allergen_notice}
                title="Allergens"
                compact={true}
              />

              <p className="text-xs text-zinc-400">
                Hosts see aggregate counts only. Student names and individual
                statuses are never shown.
              </p>
            </div>

            {/* Secondary action: Share another drop */}
            <button
              type="button"
              data-testid="share-another-drop-button"
              onClick={handleShareAnotherDrop}
              className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-owl-black px-5 py-3 text-sm font-bold text-owl-gold transition hover:border-owl-gold hover:bg-zinc-900"
            >
              Share another drop
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
