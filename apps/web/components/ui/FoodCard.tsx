import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import { entranceDelayMs, OWL_MOTION_CLASSES } from "../../lib/motion";
import type { DropResponse } from "../../lib/types/api";
import { DropPhoto } from "./DropPhoto";
import { StatusBadge } from "./StatusBadge";

export interface FoodCardProps {
  drop: DropResponse;
  authToken?: string | null;
  variant?: "feed" | "compact" | "host" | "pantry";
  badge?: ReactNode;
  footer?: ReactNode;
  disabledReason?: string | null;
  nowIso?: string;
  href?: string;
  onSelect?: () => void;
  testId?: string;
  /** Optional list index used to compute staggered entrance delay via OWL_MOTION. */
  index?: number;
}
/** Present real availability and a listing photo without claiming food safety or popularity. */
export function FoodCard({
  drop,
  authToken,
  badge,
  footer,
  disabledReason,
  href,
  onSelect,
  testId,
  index,
}: FoodCardProps) {
  const title =
    drop.vision.items.map((item) => item.name).join(" & ") || "Food to share";
  const delayMs = typeof index === "number" ? entranceDelayMs(index) : 0;
  const contents = (
    <>
      <DropPhoto
        dropId={drop.id}
        hasPhoto={drop.has_photo}
        photoUrl={drop.photo_url}
        authToken={authToken}
        alt={title}
        overlayTopLeft={badge ?? <StatusBadge tone="gold">FREE</StatusBadge>}
      />
      <div className="space-y-2 px-1.5 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-extrabold leading-snug tracking-tight text-ink sm:text-lg">
            {title}
          </h3>
          <span className="shrink-0 rounded-full bg-success-tint px-2.5 py-0.5 text-xs font-bold tabular-nums text-success">
            {drop.counts.available} left
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <MapPin size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">
            {drop.building?.name ?? "Pickup details available"}
            {drop.room ? ` · ${drop.room}` : ""}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock size={13} className="shrink-0" aria-hidden="true" />
          Collect by{" "}
          {new Date(drop.expires_at ?? drop.created_at).toLocaleTimeString(
            "en-US",
            {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/New_York",
            },
          )}
        </p>
        {drop.diet_tags_final.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {drop.diet_tags_final.map((diet) => (
              <StatusBadge key={diet}>{diet.replaceAll("_", " ")}</StatusBadge>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-muted">
          Allergens: may contain, confirm with host
        </p>
        {disabledReason && (
          <p className="rounded-xl bg-warning-tint px-2.5 py-1.5 text-xs font-medium text-warning">
            {disabledReason}
          </p>
        )}
      </div>
    </>
  );
  return (
    <article
      data-testid={testId ?? `food-card-${drop.id}`}
      style={delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
      className={`group flex min-w-0 flex-col justify-between rounded-3xl border border-line bg-surface p-3 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-owl-gold/50 hover:shadow-lg ${OWL_MOTION_CLASSES.entrance}`}
    >
      {href ? (
        <Link
          href={href}
          className={`block rounded-2xl focus-visible:outline-offset-4 ${OWL_MOTION_CLASSES.press}`}
        >
          {contents}
        </Link>
      ) : onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className={`block w-full rounded-2xl text-left ${OWL_MOTION_CLASSES.press}`}
        >
          {contents}
        </button>
      ) : (
        contents
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </article>
  );
}
