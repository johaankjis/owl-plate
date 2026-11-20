/** Shared surface and type styles so every analytics panel reads as one system. */
export const OPS_CARD =
  "rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-line/60 sm:p-7";

export const OPS_HEADING =
  "text-base font-extrabold tracking-tight text-ink sm:text-lg";

export const OPS_EYEBROW =
  "text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted";

/** Series colors, each with a dark-theme step for contrast on dark surfaces. */
export const OPS_SWATCH = {
  shared: "bg-owl-gold",
  pickups: "bg-success",
  pantry: "bg-[#9333ea] dark:bg-[#c084fc]",
} as const;

export const OPS_FILL = {
  pantry: "fill-[#9333ea] dark:fill-[#c084fc]",
} as const;
