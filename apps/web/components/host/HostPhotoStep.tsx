"use client";
/* eslint-disable @next/next/no-img-element -- Local blob previews cannot use the image optimizer. */

import React from "react";
import { Camera, ImagePlus, Loader2, ShieldCheck } from "lucide-react";
import { HOST_PHOTO_PRIVACY_NOTICE } from "../../app/host/host-helpers";
import { useObjectUrl } from "./useObjectUrl";

interface HostPhotoStepProps {
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  hostNote: string;
  onHostNoteChange: (note: string) => void;
  busy: boolean;
  onSubmit: () => void;
}

/** Step 1: pick or capture one tray photo, preview it locally, then ask for an estimate. */
export function HostPhotoStep({
  selectedFile,
  onFileChange,
  hostNote,
  onHostNoteChange,
  busy,
  onSubmit,
}: HostPhotoStepProps) {
  const previewUrl = useObjectUrl(selectedFile);

  return (
    <section data-testid="host-photo-step" className="consumer-card space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-extrabold tracking-tight">
          Add a photo of the food
        </h2>
        <p className="text-sm text-ink-muted">
          We&apos;ll estimate servings and likely allergens for you to review.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-5"
      >
        <label
          htmlFor="food-photo-input"
          className="group relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-line bg-surface-subtle text-center transition hover:border-owl-gold focus-within:border-owl-gold"
        >
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Selected food photo preview"
                data-testid="host-photo-preview"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/95 px-4 py-2 text-xs font-bold text-ink shadow-card">
                <Camera size={14} aria-hidden="true" />
                Change photo
              </span>
            </>
          ) : (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-owl-goldTint text-owl-goldText">
                <ImagePlus size={28} aria-hidden="true" />
              </span>
              <span className="text-base font-bold">
                Take or choose a photo
              </span>
              <span className="text-xs text-ink-muted">
                JPEG or PNG, up to 10 MB
              </span>
            </>
          )}
          <input
            id="food-photo-input"
            data-testid="food-photo-input"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>

        <p
          data-testid="host-photo-privacy-notice"
          className="flex items-start gap-2.5 rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink-muted"
        >
          <ShieldCheck
            size={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-success"
          />
          <span>{HOST_PHOTO_PRIVACY_NOTICE}</span>
        </p>

        <div className="space-y-1.5">
          <label htmlFor="host-note-input" className="text-sm font-bold">
            Note for the estimate{" "}
            <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="host-note-input"
            data-testid="host-note-input"
            type="text"
            maxLength={1000}
            value={hostNote}
            onChange={(e) => onHostNoteChange(e.target.value)}
            placeholder="e.g. one tray is vegetarian"
            className="consumer-input"
          />
        </div>

        <button
          type="submit"
          data-testid="analyze-photo-button"
          disabled={busy || !selectedFile}
          className="consumer-button w-full"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Analyzing photo…
            </>
          ) : (
            "Analyze photo"
          )}
        </button>
      </form>
    </section>
  );
}
