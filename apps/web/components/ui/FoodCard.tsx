import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
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
}: FoodCardProps) {
  const title =
    drop.vision.items.map((item) => item.name).join(" & ") || "Food to share";
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
      <div className="space-y-2 px-1 pt-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-extrabold leading-snug tracking-tight">
            {title}
          </h3>
          <span className="shrink-0 text-xs font-semibold text-success">
            {drop.counts.available} left
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <MapPin size={14} className="shrink-0" />
          {drop.building?.name ?? "Pickup details available"}
          {drop.room ? ` · ${drop.room}` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock size={14} />
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
        <div className="flex flex-wrap gap-1.5">
          {drop.diet_tags_final.map((diet) => (
            <StatusBadge key={diet}>{diet.replaceAll("_", " ")}</StatusBadge>
          ))}
        </div>
        <p className="text-[11px] text-ink-muted">
          Allergens: may contain, confirm with host
        </p>
        {disabledReason && (
          <p className="text-xs font-medium text-warning">{disabledReason}</p>
        )}
      </div>
    </>
  );
  return (
    <article
      data-testid={testId ?? `food-card-${drop.id}`}
      className="min-w-0 rounded-3xl border border-line bg-surface p-3 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      {href ? (
        <Link
          href={href}
          className="block rounded-2xl focus-visible:outline-offset-4"
        >
          {contents}
        </Link>
      ) : onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="block w-full rounded-2xl text-left"
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
