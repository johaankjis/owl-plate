import type { ReactNode } from "react";

interface OpsEmptyStateProps {
  icon: ReactNode;
  title: string;
  testId: string;
  minHeightClass?: string;
}

/** Quiet, borderless placeholder for a panel with nothing recorded yet. */
export function OpsEmptyState({
  icon,
  title,
  testId,
  minHeightClass = "min-h-[180px]",
}: OpsEmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={`flex ${minHeightClass} flex-col items-center justify-center gap-2.5 rounded-2xl bg-surface-subtle/60 px-4 py-8 text-center text-ink-muted`}
    >
      {icon}
      <p className="text-sm font-semibold text-ink">{title}</p>
    </div>
  );
}
