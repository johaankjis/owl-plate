/**
 * Picks which drawn food illustration stands in for a listing photo that has
 * been deleted or was never stored. The result only selects artwork; it is
 * never shown as a claim about what the food contains.
 */

export type FoodIllustrationKind =
  "pizza" | "sandwich" | "salad" | "snack" | "other";

export const FOOD_ILLUSTRATION_LABELS: Record<FoodIllustrationKind, string> = {
  pizza: "Pizza",
  sandwich: "Sandwiches and wraps",
  salad: "Salads and bowls",
  snack: "Snacks and sides",
  other: "Shared food",
};

/** First match wins, mirroring the food category order used across the app. */
const ILLUSTRATION_RULES: ReadonlyArray<[FoodIllustrationKind, RegExp]> = [
  ["pizza", /\b(pizzas?|flatbreads?|calzones?|strombolis?|slices?)\b/i],
  [
    "sandwich",
    /\b(sandwich(?:es)?|wraps?|subs?|paninis?|burgers?|sliders?|hoagies?|quesadillas?|tacos?|burritos?|pitas?)\b/i,
  ],
  [
    "salad",
    /\b(salads?|bowls?|greens|grains?|poke|pasta|rice|soups?|chili)\b/i,
  ],
  [
    "snack",
    /\b(snacks?|chips?|cookies?|brownies?|muffins?|pastr(?:y|ies)|fruit|veggie\s*tray|pretzels?|popcorn|donuts?|cupcakes?|bagels?|breadsticks?|wings?|sides?|dips?|hummus|desserts?|cakes?|bars?)\b/i,
  ],
];

/**
 * Resolves the illustration for a category label or food name. Unknown or
 * empty text falls back to the neutral shared-food artwork.
 */
export function resolveFoodIllustrationKind(
  ...hints: ReadonlyArray<string | null | undefined>
): FoodIllustrationKind {
  for (const hint of hints) {
    const text = typeof hint === "string" ? hint.trim() : "";
    if (!text) continue;
    for (const [kind, pattern] of ILLUSTRATION_RULES) {
      if (pattern.test(text)) return kind;
    }
  }
  return "other";
}
