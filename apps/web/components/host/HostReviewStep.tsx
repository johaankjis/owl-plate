"use client";

import React from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { DropPhoto } from "../ui/DropPhoto";
import { AllergenCard } from "../ui/AllergenCard";
import { StatusBadge } from "../ui/StatusBadge";
import { BuildingSelector, type RehearsalOption } from "../BuildingSelector";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Building,
  type DropResponse,
  type SafetyReview,
} from "../../lib/types/api";
import {
  HOST_EXPIRY_OPTIONS,
  HOST_MAX_SERVINGS,
  HOST_MIN_SERVINGS,
  canPublishHostReview,
  clampHostServings,
  getVisionSourceLabel,
  isLiveVisionSource,
  removedEstimatedAllergens,
  selectedReligiousDiets,
  summarizeHostListing,
  toggleTag,
  type HostReviewForm,
} from "../../app/host/host-helpers";

interface HostReviewStepProps {
  drop: DropResponse;
  form: HostReviewForm;
  onChange: (patch: Partial<HostReviewForm>) => void;
  authToken: string;
  buildings: ReadonlyArray<Building>;
  buildingsLoading: boolean;
  buildingsError: string | null;
  onRetryBuildings: () => void;
  rehearsalOptions: ReadonlyArray<RehearsalOption>;
  busy: boolean;
  onPublish: () => void;
  onStartOver: () => void;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function Chip({
  selected,
  onClick,
  testId,
  children,
  tone,
}: {
  selected: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
  tone: "warning" | "success";
}) {
  const on =
    tone === "warning"
      ? "border-warning bg-warning-tint text-warning"
      : "border-success bg-success-tint text-success";
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold capitalize transition ${
        selected ? on : "border-line bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      {selected ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Plus size={14} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function CheckRow({
  testId,
  checked,
  onChange,
  title,
  detail,
  highlight = false,
}: {
  testId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-sm ${
        highlight ? "bg-warning-tint" : "bg-surface-subtle"
      }`}
    >
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-owl-gold"
      />
      <span>
        <strong className="block font-bold text-ink">{title}</strong>
        <span className="text-ink-muted">{detail}</span>
      </span>
    </label>
  );
}

/** Step 2: confirm the estimate, location, window and food-safety checklist. */
export function HostReviewStep({
  drop,
  form,
  onChange,
  authToken,
  buildings,
  buildingsLoading,
  buildingsError,
  onRetryBuildings,
  rehearsalOptions,
  busy,
  onPublish,
  onStartOver,
}: HostReviewStepProps) {
  const removed = removedEstimatedAllergens(
    drop.vision.allergens_likely,
    form.allergens,
  );
  const religious = selectedReligiousDiets(form.diets);
  const canPublish = canPublishHostReview(
    form.safety,
    drop.vision.allergens_likely,
    form.allergens,
    form.diets,
  );
  const setSafety = (patch: Partial<SafetyReview>) =>
    onChange({ safety: { ...form.safety, ...patch } });
  const title = summarizeHostListing(drop);

  return (
    <section data-testid="host-review-step" className="space-y-5">
      <div className="consumer-card space-y-4">
        <DropPhoto
          dropId={drop.id}
          hasPhoto={drop.has_photo}
          photoUrl={drop.photo_url}
          authToken={authToken}
          alt={title}
          aspect="16/10"
          testId="host-review-photo"
        />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
            <p className="text-sm text-ink-muted">
              Review the estimate before publishing.
            </p>
          </div>
          <span data-testid="vision-source-label">
            <StatusBadge
              tone={isLiveVisionSource(drop.vision_source) ? "gold" : "warning"}
            >
              {getVisionSourceLabel(drop.vision_source)}
            </StatusBadge>
          </span>
        </div>

        <ul
          data-testid="host-detected-items"
          className="divide-y divide-line rounded-2xl bg-surface-subtle px-4"
        >
          {drop.vision.items.map((item, idx) => (
            <li
              key={`${item.name}-${idx}`}
              className="flex items-center justify-between gap-2 py-3 text-sm"
            >
              <span className="font-semibold">{item.name}</span>
              <span className="text-ink-muted">
                about {item.count_estimate} {item.portion_unit}
              </span>
            </li>
          ))}
        </ul>
        {drop.vision.notes && (
          <p data-testid="vision-notes" className="text-xs text-ink-muted">
            {drop.vision.notes}
          </p>
        )}
        {drop.vision.confidence < 0.6 && (
          <p className="flex items-start gap-2 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning">
            <AlertTriangle
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            The estimate was unsure, so every common allergen is flagged. Remove
            only what you&apos;ve checked against ingredients.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="servings-input" className="text-sm font-bold">
              Servings
            </label>
            <span className="text-xs text-ink-muted">
              Estimate: {drop.vision.servings_low}–{drop.vision.servings_high}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="servings-decrement"
              aria-label="Fewer servings"
              disabled={form.servings <= HOST_MIN_SERVINGS}
              onClick={() =>
                onChange({ servings: clampHostServings(form.servings - 1) })
              }
              className="consumer-button-secondary h-12 w-12 px-0"
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <input
              id="servings-input"
              data-testid="servings-input"
              type="number"
              inputMode="numeric"
              min={HOST_MIN_SERVINGS}
              max={HOST_MAX_SERVINGS}
              value={form.servings}
              onChange={(e) =>
                onChange({
                  servings: clampHostServings(Number(e.target.value)),
                })
              }
              className="consumer-input w-28 text-center text-lg font-extrabold"
            />
            <button
              type="button"
              data-testid="servings-increment"
              aria-label="More servings"
              disabled={form.servings >= HOST_MAX_SERVINGS}
              onClick={() =>
                onChange({ servings: clampHostServings(form.servings + 1) })
              }
              className="consumer-button-secondary h-12 w-12 px-0"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="consumer-card space-y-4">
        <div>
          <h3 className="text-lg font-extrabold">Allergens &amp; diet</h3>
          <p className="text-sm text-ink-muted">
            Allergens are estimates: {ALLERGEN_WARNING_TEXT}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((alg) => (
            <Chip
              key={alg}
              tone="warning"
              selected={form.allergens.includes(alg)}
              testId={`allergen-toggle-${alg}`}
              onClick={() =>
                onChange({ allergens: toggleTag(form.allergens, alg) })
              }
            >
              {label(alg)}
            </Chip>
          ))}
        </div>
        <AllergenCard
          allergens={form.allergens}
          notice={drop.allergen_notice}
          title="Listed allergens"
          compact={true}
        />
        <div className="space-y-2">
          <span className="text-sm font-bold">Dietary tags</span>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((diet) => (
              <Chip
                key={diet}
                tone="success"
                selected={form.diets.includes(diet)}
                testId={`diet-toggle-${diet}`}
                onClick={() => onChange({ diets: toggleTag(form.diets, diet) })}
              >
                {label(diet)}
              </Chip>
            ))}
          </div>
        </div>
        {removed.length > 0 && (
          <CheckRow
            testId="safety-check-ingredients"
            highlight
            checked={Boolean(form.safety.ingredient_information_checked)}
            onChange={(checked) =>
              setSafety({ ingredient_information_checked: checked })
            }
            title="I checked the ingredient information"
            detail={`Required to remove a flagged allergen (${removed.map(label).join(", ")}).`}
          />
        )}
        {religious.length > 0 && (
          <CheckRow
            testId="safety-check-religious"
            highlight
            checked={Boolean(form.safety.religious_diets_confirmed)}
            onChange={(checked) =>
              setSafety({ religious_diets_confirmed: checked })
            }
            title="I confirmed the religious diet details"
            detail={`Required for ${religious.map(label).join(", ")}. Confirm with the caterer, not the photo.`}
          />
        )}
      </div>

      <div className="consumer-card space-y-4">
        <h3 className="text-lg font-extrabold">Pickup details</h3>
        <BuildingSelector
          buildings={buildings}
          value={form.buildingId}
          onChange={(buildingId) => onChange({ buildingId })}
          loading={buildingsLoading}
          error={buildingsError}
          onRetry={onRetryBuildings}
          testIdPrefix="host"
          rehearsalOptions={rehearsalOptions}
          label="Building"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="room-input" className="text-sm font-bold">
              Room
            </label>
            <input
              id="room-input"
              data-testid="room-input"
              type="text"
              maxLength={80}
              value={form.room}
              onChange={(e) => onChange({ room: e.target.value })}
              placeholder="e.g. 214"
              className="consumer-input"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="expiry-select" className="text-sm font-bold">
              Available for
            </label>
            <select
              id="expiry-select"
              data-testid="expiry-select"
              value={form.expiresInMinutes}
              onChange={(e) =>
                onChange({ expiresInMinutes: Number(e.target.value) })
              }
              className="consumer-input"
            >
              {HOST_EXPIRY_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60
                    ? `${minutes} minutes`
                    : minutes === 60
                      ? "1 hour"
                      : `${minutes / 60} hours`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="pickup-instructions-input"
            className="text-sm font-bold"
          >
            Pickup instructions{" "}
            <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="pickup-instructions-input"
            data-testid="pickup-instructions-input"
            type="text"
            maxLength={500}
            value={form.pickupInstructions}
            onChange={(e) => onChange({ pickupInstructions: e.target.value })}
            placeholder="e.g. table by the east stairs"
            className="consumer-input"
          />
        </div>
      </div>

      <div className="consumer-card space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck
            size={20}
            aria-hidden="true"
            className="text-owl-goldText"
          />
          <h3 className="text-lg font-extrabold">Food safety checklist</h3>
        </div>
        <p className="text-sm text-ink-muted">
          You confirm these yourself. The photo estimate can&apos;t check food
          safety.
        </p>
        <CheckRow
          testId="safety-check-covered"
          checked={form.safety.covered_and_temperature_safe}
          onChange={(checked) =>
            setSafety({ covered_and_temperature_safe: checked })
          }
          title="Covered and temperature safe"
          detail="Kept covered at a safe holding temperature."
        />
        <CheckRow
          testId="safety-check-two-hours"
          checked={form.safety.served_within_two_hours}
          onChange={(checked) =>
            setSafety({ served_within_two_hours: checked })
          }
          title="Set out within the last 2 hours"
          detail="Food has not been sitting out longer than two hours."
        />
        <CheckRow
          testId="safety-check-untouched"
          checked={form.safety.untouched}
          onChange={(checked) => setSafety({ untouched: checked })}
          title="Untouched shared trays"
          detail="From serving trays only, never from individual plates."
        />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          data-testid="publish-drop-button"
          disabled={busy || !canPublish}
          onClick={onPublish}
          className="consumer-button w-full"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Publishing…
            </>
          ) : (
            "Publish listing"
          )}
        </button>
        {!canPublish && (
          <p
            data-testid="publish-validation-hint"
            className="text-center text-sm text-warning"
          >
            Complete the checklist above to publish.
          </p>
        )}
        <button
          type="button"
          data-testid="share-another-drop-button"
          onClick={onStartOver}
          className="consumer-button-secondary w-full"
        >
          Start over with a new photo
        </button>
      </div>
    </section>
  );
}
