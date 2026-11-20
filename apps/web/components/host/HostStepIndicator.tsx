import { Check } from "lucide-react";
import { HOST_WIZARD_STEPS } from "../../app/host/host-helpers";

/** Three-step progress for Photo → Review → Publish. */
export function HostStepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="Share food steps"
      data-testid="host-step-indicator"
      data-current-step={current}
      className="grid grid-cols-3 gap-2"
    >
      {HOST_WIZARD_STEPS.map(({ step, label }) => {
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition-colors duration-200 ${
              active
                ? "bg-owl-gold text-owl-goldInk shadow-sm"
                : done
                  ? "bg-success-tint text-success"
                  : "bg-surface-subtle text-ink-muted"
            }`}
          >
            {done ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{step}</span>
            )}
            {label}
          </li>
        );
      })}
    </ol>
  );
}
