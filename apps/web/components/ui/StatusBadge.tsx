import type { ReactNode } from "react";
export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
  className?: string;
}) {
  const colors = {
    neutral: "bg-surface-subtle text-ink-muted",
    success: "bg-success-tint text-success",
    warning: "bg-warning-tint text-warning",
    danger: "bg-danger-tint text-danger",
    gold: "bg-owl-goldTint text-owl-goldText",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${colors[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
