"use client";

import React from "react";
import Link from "next/link";
import { type DemoCredential } from "../lib/types/api";
import type { DataSourceMode } from "../lib/api-client";

interface DemoHeaderProps {
  credential?: DemoCredential;
  onCredentialChange?: (cred: DemoCredential) => void;
  sourceMode?: DataSourceMode;
  isDemo?: boolean;
  allowedRoles?: Array<"host" | "projector" | "student" | "pantry_coordinator">;
  showCredentialSelector?: boolean;
  subtitle?: string;
}

export function DemoHeader({ subtitle }: DemoHeaderProps) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 font-extrabold text-ink"
        >
          <span className="rounded-xl bg-owl-gold px-2.5 py-2 text-owl-goldInk">
            OP
          </span>
          Owl Plate
        </Link>
        {subtitle && <span className="text-xs text-ink-muted">{subtitle}</span>}
      </div>
    </header>
  );
}
