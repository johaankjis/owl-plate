"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type DemoCredential } from "../lib/types/api";
import type { DataSourceMode } from "../lib/api-client";
import { useVisionMode, visionModeLabel } from "../lib/vision-mode";

interface DemoHeaderProps {
  credential?: DemoCredential;
  onCredentialChange?: (cred: DemoCredential) => void;
  sourceMode?: DataSourceMode;
  isDemo?: boolean;
  allowedRoles?: Array<"host" | "projector" | "student">;
  showCredentialSelector?: boolean;
  subtitle?: string;
}

export function DemoHeader({ isDemo = true, subtitle }: DemoHeaderProps) {
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
            className="flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap font-bold tracking-tight text-owl-gold hover:opacity-90"
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
        </div>
      </div>
    </header>
  );
}
