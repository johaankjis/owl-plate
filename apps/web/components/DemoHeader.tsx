"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_CREDENTIALS, type DemoCredential } from "../lib/types/api";
import type { DataSourceMode } from "../lib/api-client";

interface DemoHeaderProps {
  credential?: DemoCredential;
  onCredentialChange?: (cred: DemoCredential) => void;
  sourceMode: DataSourceMode;
  visionSource?: "fixture" | "gemini";
  isDemo?: boolean;
  allowedRoles?: Array<"host" | "projector" | "student">;
  showCredentialSelector?: boolean;
  subtitle?: string;
}

export function DemoHeader({
  credential = "demo-host",
  onCredentialChange,
  sourceMode,
  visionSource,
  isDemo = true,
  allowedRoles,
  showCredentialSelector = false,
  subtitle,
}: DemoHeaderProps) {
  const pathname = usePathname();
  const filteredCredentials = allowedRoles
    ? DEMO_CREDENTIALS.filter((c) => allowedRoles.includes(c.role))
    : DEMO_CREDENTIALS;

  const activeInfo =
    DEMO_CREDENTIALS.find((c) => c.token === credential) ??
    DEMO_CREDENTIALS[0]!;

  return (
    <header className="border-b border-zinc-800 bg-owl-slate text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-owl-gold hover:opacity-90"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-owl-gold text-sm font-extrabold text-owl-black">
              OP
            </span>
            <span className="text-lg">Owl Plate</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-1 rounded-lg bg-owl-black/60 p-1 text-xs font-medium"
          >
            <Link
              href="/host"
              className={`rounded-md px-2.5 py-1 transition ${
                pathname?.startsWith("/host")
                  ? "bg-owl-gold font-semibold text-owl-black"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Share food
            </Link>
            <Link
              href="/join"
              className={`rounded-md px-2.5 py-1 transition ${
                pathname?.startsWith("/join") ||
                pathname?.startsWith("/student")
                  ? "bg-owl-gold font-semibold text-owl-black"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Find food
            </Link>
            <Link
              href="/dispatch"
              className={`rounded-md px-2.5 py-1 transition ${
                pathname?.startsWith("/dispatch")
                  ? "bg-owl-gold font-semibold text-owl-black"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              Projector
            </Link>
          </nav>

          {subtitle && (
            <span className="text-xs font-medium text-zinc-400">
              {subtitle}
            </span>
          )}
        </div>

        {/* Explicit Simulated / Cached / Source Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {isDemo && (
            <span
              data-testid="demo-mode-badge"
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300"
            >
              Demo mode: fixture vision, simulated notifications
            </span>
          )}
          <span
            data-testid="data-source-badge"
            className={`rounded border px-2 py-0.5 font-medium ${
              sourceMode === "live_api"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300"
            }`}
          >
            {sourceMode === "live_api"
              ? "API Connected"
              : sourceMode === "offline_fixture"
                ? "Offline Fixture"
                : "Connecting"}
          </span>
          {visionSource && (
            <span
              data-testid="vision-source-badge"
              className="rounded border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-medium text-purple-300"
            >
              {visionSource === "fixture"
                ? "Cached fixture estimate (simulated)"
                : "Live Gemini vision"}
            </span>
          )}
        </div>

        {showCredentialSelector && onCredentialChange && (
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="demo-credential-select"
              className="text-xs font-medium text-zinc-400"
            >
              Bearer Credential:
            </label>
            <select
              id="demo-credential-select"
              data-testid="demo-credential-select"
              value={credential}
              onChange={(e) =>
                onCredentialChange(e.target.value as DemoCredential)
              }
              className="rounded-lg border border-zinc-700 bg-owl-black px-2.5 py-1.5 text-xs font-semibold text-owl-gold focus:border-owl-gold focus:outline-none"
            >
              {filteredCredentials.map((cred) => (
                <option key={cred.token} value={cred.token}>
                  {cred.token} — {cred.label}
                </option>
              ))}
            </select>
            <span className="hidden text-[11px] text-zinc-400 lg:inline">
              ({activeInfo.description})
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
