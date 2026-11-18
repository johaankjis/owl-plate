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
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:py-14">
        <header className="space-y-3 border-b border-zinc-800 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="fixture-label"
              className="inline-flex items-center gap-2 rounded-full border border-owl-gold/40 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold"
            >
              Demo mode: {visionModeLabel(visionMode)}, simulated notifications
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Owl Plate
          </h1>
          <p className="max-w-xl text-base text-zinc-300">
            One photo from an event host. AI estimates food, servings, and
            allergens, then pings just enough nearby students who can safely eat
            it.
          </p>
        </header>

        <section
          aria-label="Primary actions"
          className="grid gap-4 sm:grid-cols-2"
        >
          <Link
            href="/host"
            data-testid="home-share-food"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-owl-slate p-6 transition hover:border-owl-gold focus:outline-none focus:ring-2 focus:ring-owl-gold"
          >
            <div>
              <span className="rounded bg-owl-gold/20 px-2.5 py-1 text-xs font-bold text-owl-gold">
                Event Host
              </span>
              <h2 className="mt-3 text-2xl font-bold text-white group-hover:text-owl-gold">
                Share food
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Snap one photo of leftover trays, review the AI estimate and
                safety checklist, and publish Wave 1.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center text-sm font-bold text-owl-gold">
              Post leftover food &rarr;
            </span>
          </Link>

          <Link
            href={findFoodHref}
            data-testid="home-find-food"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-owl-slate p-6 transition hover:border-owl-gold focus:outline-none focus:ring-2 focus:ring-owl-gold"
          >
            <div>
              <span className="rounded bg-sky-500/20 px-2.5 py-1 text-xs font-bold text-sky-300">
                Student Visitor
              </span>
              <h2 className="mt-3 text-2xl font-bold text-white group-hover:text-owl-gold">
                Find food
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                {hasActiveSession
                  ? "Return to your active demo session to check invites and hold a serving for 10 minutes."
                  : "Pick a nickname, simulated campus area, and dietary filters to receive nearby food invites."}
              </p>
            </div>
            <span className="mt-6 inline-flex items-center text-sm font-bold text-owl-gold">
              {hasActiveSession
                ? "Resume your session"
                : "Join demo on your phone"}{" "}
              &rarr;
            </span>
          </Link>
        </section>

        <footer className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-800 bg-owl-slate/60 p-4 text-xs text-zinc-400 sm:flex-row sm:items-center">
          <div>
            <strong className="text-zinc-200">Safety &amp; Dignity:</strong>{" "}
            Allergens always say &ldquo;{ALLERGEN_WARNING_TEXT}&rdquo;. Hosts
            see counts only.
          </div>
          <Link
            href="/dispatch"
            data-testid="home-projector-link"
            className="shrink-0 font-semibold text-owl-gold underline-offset-4 hover:underline"
          >
            Open projector dispatch view (/dispatch) &rarr;
          </Link>
        </footer>
      </div>
    </div>
  );
}
