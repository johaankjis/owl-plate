import React from "react";
import { CheckSquare, Monitor } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";

export const PICKUP_DISPLAY_PAGE_PATTERN = "owl-whats-left-{listing id}";

export const PICKUP_DISPLAY_CHECKLIST = [
  "It running on the Mac",
  "Display paired",
  "Claude Code conversation that created the page still open",
  "Owl Plate tunnel up",
] as const;

export interface CompanionOriginStatus {
  configured: boolean;
  valid: boolean;
  origin: string | null;
  label: string;
}

/**
 * Extracts only the HTTP(S) origin from NEXT_PUBLIC_IT_COMPANION_BASE_URL so a
 * pairing code, path, query string, or credential is never displayed in admin UI.
 */
export function resolveCompanionOriginStatus(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_IT_COMPANION_BASE_URL,
): CompanionOriginStatus {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) {
    return {
      configured: false,
      valid: false,
      origin: null,
      label: "Not set",
    };
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return {
        configured: true,
        valid: false,
        origin: null,
        label: "Invalid URL (set http:// or https:// origin only)",
      };
    }
    return {
      configured: true,
      valid: true,
      origin: parsed.origin,
      label: parsed.origin,
    };
  } catch {
    return {
      configured: true,
      valid: false,
      origin: null,
      label: "Invalid URL (set http:// or https:// origin only)",
    };
  }
}

export interface PickupDisplayStatusSectionProps {
  baseUrl?: string;
}

/**
 * Isolates It pickup-display configuration and troubleshooting on the admin page
 * so consumer host screens remain free of setup details.
 */
export function PickupDisplayStatusSection({
  baseUrl = process.env.NEXT_PUBLIC_IT_COMPANION_BASE_URL,
}: PickupDisplayStatusSectionProps) {
  const originStatus = resolveCompanionOriginStatus(baseUrl);
  const badgeTone = originStatus.valid
    ? "success"
    : originStatus.configured
      ? "warning"
      : "neutral";
  const badgeLabel = originStatus.valid
    ? "Configured"
    : originStatus.configured
      ? "Invalid URL"
      : "Not set";

  return (
    <section
      data-testid="admin-pickup-display-section"
      className="consumer-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Monitor
            size={18}
            aria-hidden="true"
            className="shrink-0 text-owl-goldText"
          />
          <h2 className="text-lg font-extrabold">Pickup display (It)</h2>
        </div>
        <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        Configuration and troubleshooting for the table pickup display live only
        on this admin screen.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-subtle p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            NEXT_PUBLIC_IT_COMPANION_BASE_URL (origin only)
          </div>
          <div
            data-testid="admin-pickup-display-origin"
            className="mt-1.5 break-all text-sm font-bold text-ink"
          >
            {originStatus.valid ? (
              <code>{originStatus.origin}</code>
            ) : (
              <span>{originStatus.label}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Origin only (scheme, host, and port) — never a pairing code or path.
          </p>
        </div>

        <div className="rounded-2xl bg-surface-subtle p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Page ID pattern
          </div>
          <div
            data-testid="admin-pickup-display-pattern"
            className="mt-1.5 text-sm font-bold text-ink"
          >
            <code>{PICKUP_DISPLAY_PAGE_PATTERN}</code>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Each published listing binds to its own paired page ID.
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
          <CheckSquare size={14} aria-hidden="true" />
          <span>Before demo checklist</span>
        </div>
        <ul className="mt-2.5 grid gap-2 text-sm text-ink sm:grid-cols-2">
          {PICKUP_DISPLAY_CHECKLIST.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-xl bg-surface-subtle px-3 py-2 text-xs font-medium"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-owl-gold"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Setup and pairing guide:{" "}
        <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-ink">
          prototypes/itcan/README.md
        </code>
      </p>
    </section>
  );
}
