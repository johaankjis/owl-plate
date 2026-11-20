import { OWL_MOTION_CLASSES } from "../../lib/motion";

export function FoodCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading food"
      className="overflow-hidden rounded-3xl border border-line bg-surface p-3 shadow-card"
    >
      <div
        className={`aspect-[16/10] rounded-2xl bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
      />
      <div
        className={`mt-4 h-5 w-2/3 rounded-lg bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
      />
      <div
        className={`mt-2.5 h-4 w-1/2 rounded-lg bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
      />
      <div className="mb-1 mt-4 grid grid-cols-2 gap-2">
        <div
          className={`h-11 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
        <div
          className={`h-11 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
      </div>
    </div>
  );
}
export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading details" className="space-y-4">
      <div
        className={`aspect-[16/10] rounded-3xl bg-surface-subtle sm:aspect-[2/1] ${OWL_MOTION_CLASSES.shimmer}`}
      />
      <ListRowSkeleton />
      <ListRowSkeleton />
    </div>
  );
}
export function ListRowSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`h-24 rounded-3xl border border-line bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
    />
  );
}
export function HostEstimateSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Estimating food items, servings, and allergens"
      data-testid="host-estimate-loading"
      className={`space-y-3 rounded-2xl border border-line bg-surface-subtle/60 p-4 ${OWL_MOTION_CLASSES.fade}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink">
          Estimating items, servings &amp; allergens…
        </span>
        <span
          className={`h-5 w-20 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
      </div>
      <div className="space-y-2">
        <div
          className={`h-4 w-3/4 rounded-lg bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
        <div
          className={`h-4 w-1/2 rounded-lg bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <div
          className={`h-7 w-16 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
        <div
          className={`h-7 w-20 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
        <div
          className={`h-7 w-14 rounded-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
      </div>
    </div>
  );
}
