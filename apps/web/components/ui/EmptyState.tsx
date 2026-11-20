import { UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
export function EmptyState({
  title,
  description,
  action,
  icon,
  testId,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-3xl border border-line bg-surface px-6 py-12 text-center"
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-owl-goldTint text-owl-goldText">
        {icon ?? <UtensilsCrossed size={28} />}
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
