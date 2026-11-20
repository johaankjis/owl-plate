"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated, short-lived blob URLs cannot use the image optimizer. */
import { useEffect, useState, type ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react";
import { getDropPhotoBlob } from "../../lib/api-client";
import { OWL_MOTION_CLASSES } from "../../lib/motion";

export interface DropPhotoProps {
  dropId: string;
  hasPhoto?: boolean;
  photoUrl?: string | null;
  authToken?: string | null;
  alt: string;
  aspect?: "16/10" | "4/3" | "square" | "hero";
  className?: string;
  overlayTopLeft?: ReactNode;
  overlayTopRight?: ReactNode;
  testId?: string;
  /**
   * Replaces the default "No photo" placeholder when no image can be shown
   * (never stored, expired, deleted or failed to load). Must not imitate a
   * real photo of the food.
   */
  fallback?: ReactNode;
}
/** Only authenticated host-listing images reach this component; pickup evidence never does. */
export function DropPhoto({
  dropId,
  hasPhoto,
  photoUrl,
  authToken,
  alt,
  aspect = "16/10",
  className = "",
  overlayTopLeft,
  overlayTopRight,
  testId = "drop-photo",
  fallback,
}: DropPhotoProps) {
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = `${dropId}:${authToken}:${hasPhoto}:${photoUrl}`;
  const eligible = Boolean((hasPhoto || photoUrl) && authToken);
  useEffect(() => {
    if (!eligible || !authToken) return;
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    getDropPhotoBlob(dropId, authToken, controller.signal)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ key, url: objectUrl });
      })
      .catch(() => {
        if (active) setFailedKey(key);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dropId, authToken, eligible, key]);
  const url = image?.key === key ? image.url : null;
  const state = url
    ? "loaded"
    : eligible && failedKey !== key
      ? "loading"
      : "fallback";
  const ratio = {
    "16/10": "aspect-[16/10]",
    "4/3": "aspect-[4/3]",
    square: "aspect-square",
    hero: "aspect-[16/10] sm:aspect-[2/1]",
  };
  return (
    <div
      data-testid={testId}
      data-photo-state={state}
      className={`relative overflow-hidden rounded-2xl bg-surface-subtle ${ratio[aspect]} ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${OWL_MOTION_CLASSES.fade}`}
          onError={() => {
            setFailedKey(key);
            setImage(null);
          }}
        />
      ) : state === "loading" ? (
        <div
          role="status"
          aria-label="Loading food photo"
          className={`h-full w-full bg-surface-subtle ${OWL_MOTION_CLASSES.shimmer}`}
        />
      ) : fallback ? (
        fallback
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface-subtle text-ink-muted/70">
          <UtensilsCrossed size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="text-[11px] font-medium">No photo</span>
        </div>
      )}
      {overlayTopLeft && (
        <div className="absolute left-3 top-3">{overlayTopLeft}</div>
      )}
      {overlayTopRight && (
        <div className="absolute right-3 top-3">{overlayTopRight}</div>
      )}
    </div>
  );
}
