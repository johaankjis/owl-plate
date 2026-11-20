import { Cookie, Pizza, Salad, Sandwich, Utensils } from "lucide-react";
import type { ComponentType } from "react";
import {
  FOOD_ILLUSTRATION_LABELS,
  resolveFoodIllustrationKind,
  type FoodIllustrationKind,
} from "../../lib/food-illustration";

export interface FoodCategoryIllustrationProps {
  /** Category label and/or food name; the first recognizable hint wins. */
  hints: ReadonlyArray<string | null | undefined>;
  /** Thumbnail sizing for list rows; the default suits card-sized frames. */
  size?: "thumb" | "card";
  testId?: string;
}

const ICONS: Record<
  FoodIllustrationKind,
  ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    "aria-hidden"?: boolean | "true";
  }>
> = {
  pizza: Pizza,
  sandwich: Sandwich,
  salad: Salad,
  snack: Cookie,
  other: Utensils,
};

const PALETTES: Record<FoodIllustrationKind, string> = {
  pizza: "from-owl-goldTint to-warning-tint text-owl-goldText",
  sandwich: "from-warning-tint to-owl-goldTint text-warning",
  salad: "from-success-tint to-surface-subtle text-success",
  snack: "from-owl-goldTint to-surface-subtle text-owl-goldText",
  other: "from-surface-subtle to-owl-goldTint text-ink-muted",
};

/**
 * Drawn stand-in for a listing photo that expired, was deleted or was never
 * stored. It is always captioned "Illustration" so it can never be mistaken
 * for a photo of the actual food.
 */
export function FoodCategoryIllustration({
  hints,
  size = "card",
  testId = "food-category-illustration",
}: FoodCategoryIllustrationProps) {
  const kind = resolveFoodIllustrationKind(...hints);
  const Icon = ICONS[kind];
  const thumb = size === "thumb";
  return (
    <div
      role="img"
      aria-label={`Illustration, not a photo of this food: ${FOOD_ILLUSTRATION_LABELS[kind]}`}
      data-testid={testId}
      data-illustration-kind={kind}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${PALETTES[kind]}`}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full bg-surface/50 ${thumb ? "h-12 w-12" : "h-28 w-28"}`}
      />
      <Icon
        size={thumb ? 24 : 52}
        strokeWidth={thumb ? 1.75 : 1.4}
        aria-hidden="true"
        className={`relative ${thumb ? "-translate-y-1.5" : "-translate-y-2"}`}
      />
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 whitespace-nowrap text-center font-semibold text-ink-muted ${
          thumb
            ? "bottom-1 text-[9px]"
            : "bottom-3 text-[11px] uppercase tracking-[0.14em]"
        }`}
      >
        Illustration
      </span>
    </div>
  );
}
