import React from "react";
import Link from "next/link";
import { ALLERGEN_WARNING_TEXT } from "../lib/types/api";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-8">
        <header className="space-y-3 border-b border-zinc-800 pb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-owl-gold/40 bg-owl-gold/10 px-3 py-1 text-xs font-semibold text-owl-gold">
            KSU AI Club Hackathon 2026 • Demo Mode Enabled
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Owl Plate
          </h1>
          <p className="max-w-2xl text-base text-zinc-300">
            One photo from an event host. AI estimates food, servings, and allergens.
            Smart wave dispatch notifies just enough nearby students who can safely eat it,
            widening H3 rings if spots go unclaimed.
          </p>
        </header>

        <section className="grid gap-5 sm:grid-cols-3">
          <Link
            href="/host"
            data-testid="nav-card-host"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-owl-slate p-6 transition hover:border-owl-gold"
          >
            <div>
              <span className="rounded bg-owl-gold/20 px-2.5 py-1 text-xs font-bold text-owl-gold">
                Bearer demo-host
              </span>
              <h2 className="mt-3 text-xl font-bold text-white group-hover:text-owl-gold">
                /host — Event Organizer
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Upload food tray photo, review AI serving &amp; allergen estimate, complete
                food safety checklist, publish Wave 1, or reset/advance the demo clock.
              </p>
            </div>
            <span className="mt-5 text-xs font-bold text-owl-gold">
              Open Host Flow &rarr;
            </span>
          </Link>

          <Link
            href="/student"
            data-testid="nav-card-student"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-owl-slate p-6 transition hover:border-owl-gold"
          >
            <div>
              <span className="rounded bg-sky-500/20 px-2.5 py-1 text-xs font-bold text-sky-300">
                Bearer demo-student-A..E
              </span>
              <h2 className="mt-3 text-xl font-bold text-white group-hover:text-owl-gold">
                /student — Student Phone PWA
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Switch between simulated personas A–E, view your own invites, hold a
                serving for 10 minutes, decline to free the spot, or configure dietary filters.
              </p>
            </div>
            <span className="mt-5 text-xs font-bold text-owl-gold">
              Open Student Flow &rarr;
            </span>
          </Link>

          <Link
            href="/dispatch"
            data-testid="nav-card-dispatch"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-owl-slate p-6 transition hover:border-owl-gold"
          >
            <div>
              <span className="rounded bg-purple-500/20 px-2.5 py-1 text-xs font-bold text-purple-300">
                Bearer demo-projector
              </span>
              <h2 className="mt-3 text-xl font-bold text-white group-hover:text-owl-gold">
                /dispatch — Big Screen Map
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Live 2-second polling projector view with deck.gl H3HexagonLayer rings,
                distinct simulated persona markers, and generic dispatch reasons.
              </p>
            </div>
            <span className="mt-5 text-xs font-bold text-owl-gold">
              Open Projector View &rarr;
            </span>
          </Link>
        </section>

        <footer className="rounded-xl border border-zinc-800 bg-owl-slate/60 p-4 text-xs text-zinc-400 space-y-1">
          <div>
            <strong className="text-zinc-200">Safety &amp; Dignity Principles:</strong>{" "}
            Every allergen display carries &ldquo;{ALLERGEN_WARNING_TEXT}&rdquo;. Priority
            tiers are never exposed in any UI or client payload. Simulated students are
            explicitly labeled.
          </div>
        </footer>
      </div>
    </div>
  );
}
