/**
 * Plain-language projector wording. Reason codes are mapped through an
 * allow-list so an unexpected value can never leak priority or scoring.
 */

const MATCHED = new Set(["nearby", "diet_match", "fair_share"]);

const REASONS: Record<string, string> = {
  dietary_filter: "Skipped: dietary filter",
  allergen_conflict: "Skipped: dietary filter",
  diet_mismatch: "Skipped: dietary filter",
  out_of_range: "Outside current ring",
  not_selected: "Not needed this wave",
  active_claim: "Already holding food",
  already_invited: "Already invited",
  alerts_paused: "Alerts paused",
  not_published: "Waiting for food",
};

export function describeReasons(codes: string[]): string {
  if (codes.length > 0 && codes.every((code) => MATCHED.has(code))) {
    return "Matched: nearby, diet OK";
  }
  for (const code of codes) {
    const label = REASONS[code];
    if (label) return label;
  }
  return "Not selected";
}

export type Tone = "invited" | "claimed" | "skipped" | "ended" | "idle";

export function describeStatus(
  status: string,
  codes: string[],
): { label: string; tone: Tone } {
  switch (status) {
    case "sent":
      return { label: "Invited", tone: "invited" };
    case "claimed":
      return { label: "Claimed", tone: "claimed" };
    case "expired":
      return { label: "Invite expired", tone: "ended" };
    case "declined":
      return { label: "Declined", tone: "ended" };
    case "waiting":
      return { label: "Waiting", tone: "idle" };
    default: {
      const dietary = codes.some((code) =>
        ["dietary_filter", "allergen_conflict", "diet_mismatch"].includes(code),
      );
      if (dietary) return { label: "Skipped", tone: "skipped" };
      return { label: "Not invited yet", tone: "idle" };
    }
  }
}

export const TONE_CLASSES: Record<Tone, string> = {
  invited: "bg-owl-gold text-owl-black",
  claimed: "bg-emerald-500 text-owl-black",
  skipped: "bg-rose-500/90 text-white",
  ended: "bg-zinc-600 text-white",
  idle: "bg-zinc-800 text-zinc-200",
};

export const TONE_RGBA: Record<Tone, [number, number, number, number]> = {
  invited: [253, 187, 48, 245],
  claimed: [16, 185, 129, 240],
  skipped: [244, 63, 94, 230],
  ended: [113, 113, 122, 230],
  idle: [148, 163, 184, 200],
};

export function formatEastern(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
