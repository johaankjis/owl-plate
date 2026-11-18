"use client";

import React from "react";
import { ALLERGEN_WARNING_TEXT, type Allergen } from "../lib/types/api";

interface AllergenListDisplayProps {
  allergens: Allergen[];
  notice?: string;
  title?: string;
  compact?: boolean;
}

/**
 * Every allergen display MUST carry the warning "may contain, confirm with host"
 * per AGENTS.md, docs/PRIVACY_SAFETY.md, and docs/API_CONTRACT.md.
 */
export function AllergenListDisplay({
  allergens,
  notice = ALLERGEN_WARNING_TEXT,
  title = "Allergens (AI estimate / host reviewed)",
  compact = false,
}: AllergenListDisplayProps) {
  return (
    <div
      data-testid="allergen-display-box"
      className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          {title}
        </span>
        <span
          data-testid="allergen-warning-banner"
          className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-200"
        >
          Warning: {notice || ALLERGEN_WARNING_TEXT}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {allergens.length > 0 ? (
          allergens.map((alg) => (
            <span
              key={alg}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100"
            >
              <span>{alg.replace("_", " ")}</span>
              {!compact && (
                <span className="text-[10px] font-normal text-amber-300/90">
                  ({ALLERGEN_WARNING_TEXT})
                </span>
              )}
            </span>
          ))
        ) : (
          <span className="text-xs text-amber-200/90">
            No specific allergens tagged —{" "}
            <strong className="font-semibold">{ALLERGEN_WARNING_TEXT}</strong>
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-amber-200/80">
        Offered in good faith by the host. Allergens are estimates:{" "}
        <strong className="underline">{ALLERGEN_WARNING_TEXT}</strong>.
      </p>
    </div>
  );
}
