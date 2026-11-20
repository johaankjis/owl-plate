"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { hasSessionToken } from "../lib/session";
import { useVisionMode, visionModeLabel } from "../lib/vision-mode";
import { ALLERGEN_WARNING_TEXT } from "../lib/types/api";

export default function HomePage() {
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const visionMode = useVisionMode();

  useEffect(() => {
    setHasActiveSession(hasSessionToken());
  }, []);

  const findFoodHref = hasActiveSession ? "/student" : "/join";

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between px-4 py-8 sm:max-w-2xl sm:py-12">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-owl-gold text-sm font-extrabold text-owl-black">
              OP
            </span>
            <span
              data-testid="simulated-notification-label"
              className="inline-flex items-center rounded-full border border-owl-gold/35 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
            >
              Simulated notifications • {visionModeLabel(visionMode)}
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Owl Plate
            </h1>
            <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
              One photo from an event host. AI estimates the food, servings, and
              allergens, then quietly pings just enough nearby KSU students who
              can safely eat it.
            </p>
          </div>
        </header>

        <main
          aria-label="Primary actions"
          className="my-8 grid gap-4 sm:grid-cols-2"
        >
          <Link
            href={findFoodHref}
            data-testid="home-find-food"
            className="group flex flex-col justify-between rounded-2xl border border-owl-gold/50 bg-owl-slate p-5 shadow-lg transition hover:border-owl-gold focus:outline-none focus:ring-2 focus:ring-owl-gold"
          >
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-owl-gold/20 px-2.5 py-0.5 text-xs font-bold text-owl-gold">
                Student
              </span>
              <h2 className="text-2xl font-extrabold text-white">Find food</h2>
              <p className="text-sm text-zinc-300">
                {hasActiveSession
                  ? "Return to your active demo session to browse campus food drops or check your 10-minute pickup hold."
                  : "Pick a nickname and optional dietary filters to browse active Marietta campus food drops."}
              </p>
            </div>
            <span className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-owl-gold px-4 py-3 text-sm font-extrabold text-owl-black transition group-hover:bg-owl-goldDark">
              {hasActiveSession ? "Resume student view" : "Browse campus food"}
            </span>
          </Link>

          <Link
            href="/host"
            data-testid="home-share-food"
            className="group flex flex-col justify-between rounded-2xl border border-zinc-800 bg-owl-slate p-5 transition hover:border-owl-gold focus:outline-none focus:ring-2 focus:ring-owl-gold"
          >
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold text-zinc-200">
                Event Host
              </span>
              <h2 className="text-2xl font-extrabold text-white">Share food</h2>
              <p className="text-sm text-zinc-300">
                Snap one photo of leftover trays, review the AI estimate and
                safety checks, and publish.
              </p>
            </div>
            <span className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-owl-gold/50 bg-owl-black px-4 py-3 text-sm font-bold text-owl-gold transition group-hover:bg-owl-gold/15">
              Share leftover food
            </span>
          </Link>
        </main>

        <footer className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-owl-slate/60 p-4 text-xs text-zinc-400 sm:flex-row sm:items-center">
          <div>
            Allergens always say{" "}
            <strong className="text-zinc-200">{ALLERGEN_WARNING_TEXT}</strong>.
            Hosts see counts only.
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/pantry"
              data-testid="home-pantry-link"
              className="inline-flex min-h-[44px] shrink-0 items-center font-semibold text-purple-300 underline-offset-4 hover:underline"
            >
              Demo pantry (/pantry) &rarr;
            </Link>
            <Link
              href="/dispatch"
              data-testid="home-projector-link"
              className="inline-flex min-h-[44px] shrink-0 items-center font-semibold text-owl-gold underline-offset-4 hover:underline"
            >
              Projector view (/dispatch) &rarr;
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
