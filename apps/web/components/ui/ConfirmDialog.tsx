"use client";

import React, { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { OWL_MOTION_CLASSES } from "../../lib/motion";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  testId?: string;
  children: ReactNode;
}

/**
 * Accessible confirmation dialog (bottom sheet on mobile, centered modal on desktop)
 * using shared Owl Plate motion classes.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  onClose,
  closeDisabled = false,
  testId,
  children,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${OWL_MOTION_CLASSES.fade}`}
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${OWL_MOTION_CLASSES.entrance}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3
              id={titleId}
              className="text-lg font-extrabold tracking-tight text-ink"
            >
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={closeDisabled}
            onClick={onClose}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-subtle text-ink transition hover:bg-surface disabled:opacity-50 ${OWL_MOTION_CLASSES.press}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
