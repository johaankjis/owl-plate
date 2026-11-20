"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bell, Check, ShieldAlert } from "lucide-react";
import { AppShell } from "../../components/ui/AppShell";
import { ListRowSkeleton } from "../../components/ui/Skeleton";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  DIETS,
  type Allergen,
  type Diet,
} from "../../lib/types/api";
import { ApiContractError, joinDemoSession } from "../../lib/api-client";
import { SESSION_ENDED_MESSAGE, setSessionToken } from "../../lib/session";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

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
      setNicknameError("Enter a nickname to get started.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await joinDemoSession({
        nickname: trimmed,
        allergens: selectedAllergens,
        diets: selectedDiets,
      });
      setSessionToken(res.data.token);
      router.push("/student");
    } catch (err) {
      if (err instanceof ApiContractError && err.code === "nickname_taken") {
        setNicknameError(
          err.message || "That nickname is already in use. Try another one.",
        );
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("Could not start your session. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell variant="public" maxWidth="md">
      <div className="space-y-6">
        {reason === "session_ended" && (
          <div
            role="alert"
            data-testid="session-ended-banner"
            className="rounded-2xl border border-warning/30 bg-warning-tint px-4 py-3 text-sm font-medium text-warning"
          >
            {SESSION_ENDED_MESSAGE}
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Start finding campus food
          </h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            Pick a nickname and any optional dietary filters. You can change
            your preferences anytime in Profile.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="consumer-card space-y-6">
          {/* Nickname */}
          <div className="space-y-2">
            <label
              htmlFor="join-nickname-input"
              className="block text-sm font-bold text-ink"
            >
              Nickname
            </label>
            <input
              id="join-nickname-input"
              data-testid="join-nickname-input"
              type="text"
              required
              minLength={1}
              maxLength={24}
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (nicknameError) setNicknameError(null);
              }}
              placeholder="e.g. ScrappyOwl"
              aria-invalid={nicknameError ? "true" : "false"}
              className={`consumer-input ${
                nicknameError
                  ? "border-danger focus:border-danger"
                  : "focus:border-owl-gold"
              }`}
            />
            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>1–24 characters</span>
              <span className="tabular-nums">{nickname.trim().length}/24</span>
            </div>
            {nicknameError && (
              <p
                role="alert"
                data-testid="join-nickname-error"
                className="text-xs font-semibold text-danger"
              >
                {nicknameError}
              </p>
            )}
          </div>

          {/* Allergens to avoid */}
          <fieldset className="space-y-2.5 border-t border-line pt-5">
            <legend className="text-sm font-bold text-ink">
              Allergens to avoid{" "}
              <span className="font-normal text-ink-muted">(optional)</span>
            </legend>
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
              <ShieldAlert
                size={14}
                className="mt-0.5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span>
                Listings that may include these are clearly flagged. Allergens
                always say:{" "}
                <strong className="font-semibold text-ink">
                  {ALLERGEN_WARNING_TEXT}
                </strong>
                .
              </span>
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
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition ${
                      active
                        ? "border-warning bg-warning-tint text-warning"
                        : "border-line bg-surface-subtle text-ink hover:border-ink-muted/40"
                    }`}
                  >
                    {active && <Check size={14} aria-hidden="true" />}
                    <span>{alg.replaceAll("_", " ")}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Dietary preferences */}
          <fieldset className="space-y-2.5 border-t border-line pt-5">
            <legend className="text-sm font-bold text-ink">
              Dietary preferences{" "}
              <span className="font-normal text-ink-muted">(optional)</span>
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
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition ${
                      active
                        ? "border-success bg-success-tint text-success"
                        : "border-line bg-surface-subtle text-ink hover:border-ink-muted/40"
                    }`}
                  >
                    {active && <Check size={14} aria-hidden="true" />}
                    <span>{diet.replaceAll("_", " ")}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Non-blocking notification & privacy note */}
          <div
            data-testid="join-privacy-notice"
            className="flex items-start gap-2.5 rounded-2xl bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-ink-muted"
          >
            <Bell
              size={15}
              className="mt-0.5 shrink-0 text-owl-goldText"
              aria-hidden="true"
            />
            <p>
              Turn on food alerts anytime in Profile. Your preferences stay
              private and no location tracking is used.
            </p>
          </div>

          {generalError && (
            <div
              role="alert"
              data-testid="join-error-message"
              className="rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-xs font-medium text-danger"
            >
              {generalError}
            </div>
          )}

          <button
            type="submit"
            data-testid="join-submit"
            disabled={submitting}
            className="consumer-button w-full"
          >
            <span>{submitting ? "Starting..." : "Start browsing food"}</span>
            {!submitting && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <AppShell variant="public" maxWidth="md">
          <div className="space-y-4">
            <ListRowSkeleton />
            <ListRowSkeleton />
          </div>
        </AppShell>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
