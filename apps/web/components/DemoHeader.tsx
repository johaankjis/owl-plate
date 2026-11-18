"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type DemoCredential, type VisionSource } from "../lib/types/api";
import type { DataSourceMode } from "../lib/api-client";
import { useVisionMode, visionModeLabel } from "../lib/vision-mode";
import {
  getVisionSourceLabel,
  isLiveVisionSource,
} from "../app/host/host-helpers";

interface DemoHeaderProps {
  credential?: DemoCredential;
  onCredentialChange?: (cred: DemoCredential) => void;
  sourceMode?: DataSourceMode;
  visionSource?: VisionSource;
  isDemo?: boolean;
  allowedRoles?: Array<"host" | "projector" | "student">;
  showCredentialSelector?: boolean;
  subtitle?: string;
}

export function DemoHeader({
  visionSource,
  isDemo = true,
  subtitle,
}: DemoHeaderProps) {
  const pathname = usePathname();
  const visionMode = useVisionMode();
  const isStudentScreen =
    pathname?.startsWith("/student") || pathname?.startsWith("/join");

  return (
    <header className="border-b border-zinc-800/80 bg-owl-slate/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5 sm:max-w-3xl">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="flex min-h-[44px] items-center gap-2 font-bold tracking-tight text-owl-gold hover:opacity-90"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-owl-gold text-sm font-extrabold text-owl-black">
              OP
            </span>
            <span className="text-base font-extrabold text-white">
              Owl Plate
            </span>
          </Link>

          {subtitle && (
            <span className="hidden text-xs font-medium text-zinc-400 sm:inline">
              {subtitle}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isDemo && (
            <span
              data-testid={
                isStudentScreen
                  ? "demo-mode-badge"
                  : "simulated-notification-label"
              }
              className="rounded-full border border-owl-gold/30 bg-owl-gold/10 px-2.5 py-1 text-[11px] font-semibold text-owl-gold"
            >
              {isStudentScreen
                ? "Simulated notifications"
                : `Simulated notifications • ${visionModeLabel(visionMode)}`}
            </span>
          )}

          {visionSource && !isStudentScreen && (
            <span
              data-testid="vision-source-badge"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                isLiveVisionSource(visionSource)
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-400/40 bg-amber-500/15 text-amber-300"
              }`}
            >
              {getVisionSourceLabel(visionSource)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
