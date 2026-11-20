"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Clock,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Utensils,
} from "lucide-react";
import { AppShell } from "../components/ui/AppShell";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { FoodCard } from "../components/ui/FoodCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { getMyFeed } from "../lib/api-client";
import { entranceDelayMs, OWL_MOTION_CLASSES } from "../lib/motion";
import {
  clearSessionToken,
  getSessionToken,
  handleUnauthorizedError,
} from "../lib/session";
import { ALLERGEN_WARNING_TEXT, type FeedDrop } from "../lib/types/api";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Snap a photo",
    description:
      "Event hosts share leftover trays and pickup location in seconds.",
    Icon: Camera,
  },
  {
    step: "2",
    title: "Reserve a plate",
    description:
      "Browse what fits your diet and hold a serving for 10 minutes.",
    Icon: Clock,
  },
  {
    step: "3",
    title: "Pick up on campus",
    description: "Walk to the verified Marietta building and grab your food.",
    Icon: ShoppingBag,
  },
] as const;

export default function HomePage() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [previewDrops, setPreviewDrops] = useState<FeedDrop[]>([]);
  const [liveAvailableServings, setLiveAvailableServings] = useState<number>(0);

  useEffect(() => {
    const token = getSessionToken();
    setAuthToken(token);
    if (!token) return;

    let active = true;
    getMyFeed(token)
      .then((res) => {
        if (!active) return;
        const openDrops = res.data.drops.filter(
          (item) =>
            item.drop.status === "live" && item.drop.counts.available > 0,
        );
        const totalServings = openDrops.reduce(
          (sum, item) => sum + Math.max(0, item.drop.counts.available),
          0,
        );
        setLiveAvailableServings(totalServings);
        setPreviewDrops(openDrops.slice(0, 2));
      })
      .catch((err) => {
        if (!active) return;
        const result = handleUnauthorizedError(err);
        if (result.isUnauthorized) {
          clearSessionToken();
          setAuthToken(null);
          setPreviewDrops([]);
          setLiveAvailableServings(0);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const hasActiveSession = authToken !== null;
  const findFoodHref = hasActiveSession ? "/student" : "/join";

  return (
    <AppShell variant="public">
      <div className="space-y-10 pb-4">
        {/* Hero */}
        <section
          className={`space-y-6 pt-2 sm:pt-6 ${OWL_MOTION_CLASSES.fade}`}
        >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-owl-goldTint px-3.5 py-1.5 text-xs font-bold text-owl-goldText">
              <MapPin size={14} aria-hidden="true" />
              <span>KSU Marietta Campus</span>
            </div>

            <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
              Free campus food, shared before it goes to waste
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Event organizers post leftover trays across Marietta Campus.
              Students filter for dietary needs, reserve a serving for 10
              minutes, and pick it up nearby.
            </p>
          </div>

          {/* Primary & Secondary Action Cards */}
          <div
            aria-label="Primary actions"
            className="grid gap-4 sm:grid-cols-2"
          >
            <Link
              href={findFoodHref}
              data-testid="home-find-food"
              style={{ animationDelay: `${entranceDelayMs(0)}ms` }}
              className={`group flex flex-col justify-between rounded-3xl border-2 border-owl-gold/70 bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-owl-gold hover:shadow-lg ${OWL_MOTION_CLASSES.entrance} ${OWL_MOTION_CLASSES.press}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-owl-gold text-owl-goldInk shadow-sm">
                    <Utensils size={22} aria-hidden="true" />
                  </span>
                  <StatusBadge tone="gold">Students</StatusBadge>
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  Find Food
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {hasActiveSession
                    ? "Jump back into active campus listings, check the map, or manage your current reservation."
                    : "Choose a nickname and optional dietary filters to see free food available around campus."}
                </p>
              </div>
              <span className="consumer-button mt-6 w-full justify-between">
                <span>
                  {hasActiveSession ? "Open student app" : "Browse campus food"}
                </span>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </Link>

            <Link
              href="/host"
              data-testid="home-share-food"
              style={{ animationDelay: `${entranceDelayMs(1)}ms` }}
              className={`group flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-owl-gold/60 hover:shadow-lg ${OWL_MOTION_CLASSES.entrance} ${OWL_MOTION_CLASSES.press}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-ink">
                    <Camera size={22} aria-hidden="true" />
                  </span>
                  <StatusBadge tone="neutral">Event Hosts</StatusBadge>
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  Share Leftover Food
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Snap a photo of extra trays, confirm servings, allergens, and
                  safety checks, then share with students on campus.
                </p>
              </div>
              <span className="consumer-button-secondary mt-6 w-full justify-between">
                <span>Share leftover food</span>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </div>
        </section>

        {/* Compact 3-Step Strip */}
        <section aria-label="How Owl Plate works" className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            How it works
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, description, Icon }, idx) => (
              <div
                key={step}
                style={{ animationDelay: `${entranceDelayMs(idx)}ms` }}
                className={`flex items-start gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card ${OWL_MOTION_CLASSES.entrance}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-owl-goldTint text-owl-goldText">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wide text-owl-goldText">
                    Step {step}
                  </div>
                  <h3 className="text-base font-bold text-ink">{title}</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Optional Live Campus Preview (only when already joined/authorized) */}
        {hasActiveSession && previewDrops.length > 0 ? (
          <section
            aria-label="Available on campus right now"
            data-testid="home-live-preview"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-ink">
                    Available on campus right now
                  </h2>
                  <StatusBadge tone="success">
                    <AnimatedNumber value={liveAvailableServings} />{" "}
                    {liveAvailableServings === 1 ? "serving" : "servings"} open
                  </StatusBadge>
                </div>
                <p className="text-xs text-ink-muted">
                  Live listings open for pickup on Marietta Campus.
                </p>
              </div>
              <Link
                href="/student"
                className={`inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-owl-goldText hover:underline ${OWL_MOTION_CLASSES.press}`}
              >
                <span>See all food</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {previewDrops.map((item, idx) => (
                <FoodCard
                  key={item.drop.id}
                  drop={item.drop}
                  authToken={authToken}
                  href={`/student/drops/${item.drop.id}`}
                  index={idx}
                />
              ))}
            </div>
          </section>
        ) : (
          <section
            aria-label="Built for campus privacy and safety"
            className="grid gap-3 sm:grid-cols-3"
          >
            <div className="rounded-3xl border border-line bg-surface p-5">
              <ShieldCheck
                size={20}
                className="mb-2.5 text-success"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-ink">
                Dietary &amp; allergen filters
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Set allergens to avoid and dietary needs once. Incompatible
                listings are clearly marked.
              </p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-5">
              <Sparkles
                size={20}
                className="mb-2.5 text-owl-goldText"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-ink">
                No GPS or account needed
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Join with just a nickname. Hosts see serving counts only, never
                student names.
              </p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-5">
              <Clock
                size={20}
                className="mb-2.5 text-owl-goldText"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-ink">
                10-minute pickup holds
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Reserve your serving before walking across campus so food is
                still there when you arrive.
              </p>
            </div>
          </section>
        )}

        {/* Calm Allergen Note & Pantry Coordinator Link */}
        <section className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-surface p-5 text-xs text-ink-muted sm:flex-row sm:items-center">
          <p className="leading-relaxed">
            Allergens always say:{" "}
            <strong className="font-semibold text-ink">
              {ALLERGEN_WARNING_TEXT}
            </strong>
            . Confirm directly with the event host at pickup.
          </p>
          <Link
            href="/dispatch"
            data-testid="home-analytics-link"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 font-semibold text-ink-muted transition hover:text-ink"
          >
            <span>Analytics</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <Link
            href="/pantry"
            data-testid="home-pantry-link"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 font-semibold text-ink-muted transition hover:text-ink"
          >
            <span>Pantry Coordinator</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
