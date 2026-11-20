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
  title = "Allergen information",
  compact = false,
}: AllergenListDisplayProps) {
  return (
    <div
      data-testid="allergen-display-box"
      className="rounded-lg border border-warning/30 bg-warning-tint p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-warning">
          {title}
        </span>
        <span
          data-testid="allergen-warning-banner"
          className="rounded bg-warning-tint px-2 py-0.5 text-xs font-bold text-warning"
        >
          Warning: {notice || ALLERGEN_WARNING_TEXT}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {allergens.length > 0 ? (
          allergens.map((alg) => (
            <span
              key={alg}
              className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning-tint px-2.5 py-1 text-xs font-semibold text-warning"
            >
              <span>{alg.replace("_", " ")}</span>
              {!compact && (
                <span className="text-[10px] font-normal text-warning">
                  ({ALLERGEN_WARNING_TEXT})
                </span>
              )}
            </span>
          ))
        ) : (
          <span className="text-xs text-warning">
            No specific allergens tagged —{" "}
            <strong className="font-semibold">{ALLERGEN_WARNING_TEXT}</strong>
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-warning">
        Offered in good faith by the host. Allergens are estimates:{" "}
        <strong className="underline">{ALLERGEN_WARNING_TEXT}</strong>.
      </p>
    </div>
  );
}
