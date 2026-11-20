export function FoodCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading food"
      className="animate-pulse overflow-hidden rounded-3xl border border-line bg-surface p-3"
    >
      <div className="aspect-[16/10] rounded-2xl bg-surface-subtle" />
      <div className="mt-4 h-5 w-2/3 rounded bg-surface-subtle" />
      <div className="mb-3 mt-3 h-4 w-1/2 rounded bg-surface-subtle" />
    </div>
  );
}
export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading details" className="space-y-4">
      <div className="aspect-[2/1] animate-pulse rounded-3xl bg-surface-subtle" />
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
      className="h-20 animate-pulse rounded-2xl bg-surface-subtle"
    />
  );
}
