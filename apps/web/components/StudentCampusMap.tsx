"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Clock,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { AllergenCard } from "./ui/AllergenCard";
import { DropPhoto } from "./ui/DropPhoto";
import { EmptyState } from "./ui/EmptyState";
import { ListRowSkeleton } from "./ui/Skeleton";
import { StatusBadge } from "./ui/StatusBadge";
import { CampusMapCanvas } from "./CampusMapCanvas";
import {
  buildWalkingDirectionsUrl,
  isVerifiedBuilding,
} from "../lib/buildings";
import {
  buildStudentCampusMapModel,
  resolveDeepLinkMapSelection,
  resolveSelectedMapBuilding,
  type GeoPoint,
} from "../lib/campus-map";
import { formatEasternTime, formatRemainingTime } from "../lib/time";
import type { Building, DropResponse, FeedDrop } from "../lib/types/api";
import {
  formatConsumerDropLocation,
  formatUnavailableReason,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
  matchesDropSearch,
  summarizeDropItems,
} from "../app/student/student-helpers";

interface StudentCampusMapProps {
  feedDrops: ReadonlyArray<FeedDrop>;
  feedLoaded: boolean;
  referenceBuildings: ReadonlyArray<Building>;
  linkedDropId: string | null;
  nowIso: string;
  referenceNowMs: number;
  busyId: string | null;
  authToken?: string | null;
  onReserveDrop: (dropId: string) => void | Promise<void>;
  onSwitchToFeed: () => void;
}

export function StudentCampusMap({
  feedDrops,
  feedLoaded,
  referenceBuildings,
  linkedDropId,
  nowIso,
  referenceNowMs,
  busyId,
  authToken = null,
  onReserveDrop,
  onSwitchToFeed,
}: StudentCampusMapProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );
  const [lastSelectedBuildingName, setLastSelectedBuildingName] = useState<
    string | null
  >(null);
  const [mapQuery, setMapQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<"map" | "list">("map");
  const appliedDeepLinkRef = useRef<string | null>(null);

  const filteredFeedDrops = useMemo(() => {
    if (!mapQuery.trim()) return feedDrops;
    return feedDrops.filter((fd) => matchesDropSearch(fd, mapQuery));
  }, [feedDrops, mapQuery]);

  const mapModel = useMemo(
    () => buildStudentCampusMapModel(filteredFeedDrops, referenceNowMs),
    [filteredFeedDrops, referenceNowMs],
  );

  const deepLinkResolution = useMemo(
    () =>
      resolveDeepLinkMapSelection(
        linkedDropId,
        mapModel,
        feedDrops,
        referenceNowMs,
      ),
    [linkedDropId, mapModel, feedDrops, referenceNowMs],
  );

  // Auto-select building for ?drop=<UUID> deep link once when plotted
  useEffect(() => {
    const cleanId = linkedDropId?.trim() || null;
    if (!cleanId) {
      appliedDeepLinkRef.current = null;
      return;
    }
    if (
      deepLinkResolution.status === "plotted" &&
      deepLinkResolution.buildingId &&
      appliedDeepLinkRef.current !== cleanId
    ) {
      const marker = mapModel.markers.find(
        (m) => m.building.id === deepLinkResolution.buildingId,
      );
      setSelectedBuildingId(deepLinkResolution.buildingId);
      setLastSelectedBuildingName(marker?.building.name ?? null);
      appliedDeepLinkRef.current = cleanId;
    }
  }, [linkedDropId, deepLinkResolution, mapModel.markers]);

  const selectedState = useMemo(
    () =>
      resolveSelectedMapBuilding(
        selectedBuildingId,
        lastSelectedBuildingName,
        mapModel,
        feedDrops,
        referenceNowMs,
      ),
    [
      selectedBuildingId,
      lastSelectedBuildingName,
      mapModel,
      feedDrops,
      referenceNowMs,
    ],
  );

  const verifiedReferencePoints = useMemo<GeoPoint[]>(
    () =>
      referenceBuildings
        .filter((b) => isVerifiedBuilding(b))
        .map((b) => ({ latitude: b.latitude, longitude: b.longitude })),
    [referenceBuildings],
  );

  const fitPoints = useMemo<GeoPoint[]>(() => {
    if (mapModel.markers.length > 0) {
      return mapModel.markers.map((m) => ({
        latitude: m.latitude,
        longitude: m.longitude,
      }));
    }
    return verifiedReferencePoints;
  }, [mapModel.markers, verifiedReferencePoints]);

  const fitKey = useMemo(() => {
    if (mapModel.markers.length > 0) {
      return `markers:${mapModel.markers.map((m) => m.building.id).join("|")}`;
    }
    return `campus:${verifiedReferencePoints.length}`;
  }, [mapModel.markers, verifiedReferencePoints.length]);

  const activeMarkerIds = useMemo(
    () => new Set(mapModel.markers.map((m) => m.building.id)),
    [mapModel.markers],
  );

  const handleSelectBuilding = (buildingId: string, buildingName: string) => {
    setSelectedBuildingId((prev) => (prev === buildingId ? null : buildingId));
    setLastSelectedBuildingName(buildingName);
  };

  if (!feedLoaded) {
    return (
      <section
        data-testid="campus-map-loading"
        aria-live="polite"
        className="space-y-4"
      >
        <div className="h-[360px] animate-pulse rounded-3xl border border-line bg-surface-subtle" />
        <ListRowSkeleton />
      </section>
    );
  }

  return (
    <section
      data-testid="student-campus-map-section"
      aria-label="Marietta campus food availability map"
      className="space-y-4"
    >
      {/* Search + Map / List Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            data-testid="campus-map-search-input"
            value={mapQuery}
            onChange={(e) => setMapQuery(e.target.value)}
            placeholder="Search buildings or foods on campus..."
            aria-label="Search buildings or foods on campus"
            className="consumer-input pl-11 pr-10"
          />
          {mapQuery && (
            <button
              type="button"
              aria-label="Clear map search"
              onClick={() => setMapQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Map or list display"
          className="inline-grid shrink-0 grid-cols-2 rounded-full border border-line bg-surface p-1 shadow-sm"
        >
          <button
            type="button"
            data-testid="campus-map-mode-map"
            aria-pressed={displayMode === "map"}
            onClick={() => setDisplayMode("map")}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition ${
              displayMode === "map"
                ? "bg-owl-gold text-owl-goldInk"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <MapIcon size={15} aria-hidden="true" />
            <span>Map</span>
          </button>
          <button
            type="button"
            data-testid="campus-map-mode-list"
            aria-pressed={displayMode === "list"}
            onClick={() => setDisplayMode("list")}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition ${
              displayMode === "list"
                ? "bg-owl-gold text-owl-goldInk"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <List size={15} aria-hidden="true" />
            <span>List ({mapModel.markers.length})</span>
          </button>
        </div>
      </div>

      {/* Deep-link notice if ?drop= is exhausted or has no pin */}
      {deepLinkResolution.notice && (
        <div
          data-testid="campus-map-deeplink-notice"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-warning-tint px-4 py-3 text-xs text-warning"
        >
          <span className="font-medium">{deepLinkResolution.notice}</span>
          <button
            type="button"
            onClick={onSwitchToFeed}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-warning/40 bg-surface px-3.5 text-xs font-bold text-warning hover:bg-warning-tint"
          >
            Browse Home
          </button>
        </div>
      )}

      {/* Map + Desktop Side Preview Sheet Layout */}
      <div
        className={
          displayMode === "map" && selectedState.status !== "none"
            ? "grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)] lg:items-start"
            : "space-y-4"
        }
      >
        {displayMode === "map" && (
          <CampusMapCanvas
            testIdPrefix="campus-map"
            viewportTestId="campus-map-viewport"
            heightClassName="h-[380px] sm:h-[440px]"
            fitPoints={fitPoints}
            fitKey={fitKey}
            referenceBuildings={referenceBuildings}
            excludedReferenceIds={activeMarkerIds}
            enableOsmTiles={true}
            topLeftOverlay={
              <div className="rounded-full border border-line bg-surface/95 px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur">
                {mapModel.markers.length > 0 ? (
                  <>
                    <span className="tabular-nums text-success">
                      {mapModel.totalAvailableServings}{" "}
                      {mapModel.totalAvailableServings === 1
                        ? "serving"
                        : "servings"}
                    </span>{" "}
                    at {mapModel.markers.length}{" "}
                    {mapModel.markers.length === 1 ? "building" : "buildings"}
                  </>
                ) : (
                  <span className="text-ink-muted">
                    Marietta Campus · 0 active pins
                  </span>
                )}
              </div>
            }
            bottomOverlay={
              <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1 text-[11px] font-medium text-ink-muted backdrop-blur">
                <MapPin size={12} aria-hidden="true" />
                <span>Verified Marietta Campus buildings</span>
              </div>
            }
            emptyOverlay={
              mapModel.markers.length === 0 ? (
                <div
                  data-testid="campus-map-empty"
                  className="space-y-3 rounded-3xl border border-line bg-surface/95 p-5 text-center shadow-lg backdrop-blur"
                >
                  <h2 className="text-sm font-extrabold text-ink">
                    {mapQuery.trim()
                      ? "No buildings match your search"
                      : "No food pins on the map right now"}
                  </h2>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {mapQuery.trim()
                      ? "Try clearing your search to view all active pickup spots."
                      : mapModel.unplottableAvailableDrops.length > 0
                        ? "Active food listings right now don't have a map pin. Open Home to browse them."
                        : mapModel.exhaustedDrops.length > 0
                          ? "All servings are currently claimed. New or released spots show up automatically."
                          : "When an event host shares food on Marietta Campus, a pin will appear right here."}
                  </p>
                  {mapQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setMapQuery("")}
                      className="consumer-button-secondary w-full"
                    >
                      Clear search
                    </button>
                  ) : (
                    (mapModel.unplottableAvailableDrops.length > 0 ||
                      mapModel.exhaustedDrops.length > 0) && (
                      <button
                        type="button"
                        data-testid="campus-map-empty-switch-to-feed"
                        onClick={onSwitchToFeed}
                        className="consumer-button w-full"
                      >
                        Browse Home
                      </button>
                    )
                  )}
                </div>
              ) : undefined
            }
            renderProjectedOverlay={({ project, width, height }) => (
              <>
                {mapModel.markers.map((marker) => {
                  const { x, y } = project(marker.latitude, marker.longitude);
                  if (x < -48 || x > width + 48 || y < -48 || y > height + 48) {
                    return null;
                  }
                  const isSelected = selectedBuildingId === marker.building.id;
                  const dropCount = marker.drops.length;
                  const dropIds = marker.drops.map((d) => d.drop.id).join(",");
                  const ariaLabel = `${marker.building.name}: ${marker.availableServings} available ${
                    marker.availableServings === 1 ? "serving" : "servings"
                  } across ${dropCount} ${dropCount === 1 ? "listing" : "listings"}`;

                  return (
                    <button
                      key={marker.building.id}
                      type="button"
                      data-testid={`campus-map-marker-${marker.building.id}`}
                      data-building-id={marker.building.id}
                      data-building-name={marker.building.name}
                      data-latitude={String(marker.latitude)}
                      data-longitude={String(marker.longitude)}
                      data-h3-cell={marker.h3Cell ?? ""}
                      data-available-servings={String(marker.availableServings)}
                      data-drop-count={String(dropCount)}
                      data-drop-ids={dropIds}
                      data-selected={isSelected ? "true" : "false"}
                      aria-pressed={isSelected}
                      aria-label={ariaLabel}
                      onClick={() =>
                        handleSelectBuilding(
                          marker.building.id,
                          marker.building.name,
                        )
                      }
                      style={{
                        left: `${x.toFixed(1)}px`,
                        top: `${y.toFixed(1)}px`,
                        transform: "translate(-50%, -50%)",
                      }}
                      className={`pointer-events-auto absolute flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-full border-2 px-3 py-1 shadow-lg transition ${
                        isSelected
                          ? "z-30 scale-110 border-owl-goldInk bg-owl-gold text-owl-goldInk ring-4 ring-owl-gold/35"
                          : marker.hasReservableDrop
                            ? "z-20 border-white bg-success text-white hover:scale-105"
                            : "z-20 border-warning bg-surface text-warning hover:scale-105"
                      }`}
                    >
                      <span
                        data-testid={`campus-map-marker-badge-${marker.building.id}`}
                        className="text-sm font-black tabular-nums leading-none"
                      >
                        {marker.availableServings}
                      </span>
                      {dropCount > 1 && (
                        <span className="mt-0.5 text-[9px] font-bold uppercase leading-none opacity-90">
                          {dropCount} spots
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          />
        )}

        {/* Uber Eats-style Building Preview Sheet */}
        {selectedState.status !== "none" && (
          <section
            data-testid="campus-map-detail-panel"
            data-building-id={
              selectedState.status === "active"
                ? selectedState.marker.building.id
                : selectedState.buildingId
            }
            data-status={selectedState.status}
            aria-live="polite"
            className="consumer-card space-y-4 border-owl-gold/60"
          >
            {selectedState.status !== "active" ? (
              <div
                data-testid="campus-map-stale-notice"
                className="space-y-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <StatusBadge tone="warning">Updated</StatusBadge>
                    <h3 className="mt-1.5 truncate text-base font-extrabold text-ink">
                      {selectedState.buildingName}
                    </h3>
                  </div>
                  <button
                    type="button"
                    data-testid="campus-map-detail-close"
                    aria-label="Close building details"
                    onClick={() => setSelectedBuildingId(null)}
                    className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-line bg-surface-subtle text-ink hover:bg-surface"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">
                  {selectedState.message}
                </p>
                <button
                  type="button"
                  onClick={onSwitchToFeed}
                  className="consumer-button-secondary w-full"
                >
                  Browse Home
                </button>
              </div>
            ) : (
              (() => {
                const { marker } = selectedState;
                const buildingDirectionsUrl = buildWalkingDirectionsUrl(
                  marker.building,
                );

                return (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b border-line pb-3.5">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone="success">
                            <span className="tabular-nums">
                              {marker.availableServings}{" "}
                              {marker.availableServings === 1
                                ? "serving"
                                : "servings"}{" "}
                              left
                            </span>
                          </StatusBadge>
                          <StatusBadge tone="neutral">
                            {marker.drops.length}{" "}
                            {marker.drops.length === 1 ? "listing" : "listings"}
                          </StatusBadge>
                        </div>
                        <h3
                          data-testid="campus-map-detail-building-name"
                          data-latitude={String(marker.latitude)}
                          data-longitude={String(marker.longitude)}
                          className="text-lg font-extrabold tracking-tight text-ink"
                        >
                          {marker.building.name}
                        </h3>
                      </div>

                      <button
                        type="button"
                        data-testid="campus-map-detail-close"
                        aria-label="Close building details"
                        onClick={() => setSelectedBuildingId(null)}
                        className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-line bg-surface-subtle text-ink hover:bg-surface"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>

                    {buildingDirectionsUrl && (
                      <a
                        data-testid="campus-map-building-directions"
                        href={buildingDirectionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="consumer-button-secondary w-full"
                      >
                        <Navigation size={16} aria-hidden="true" />
                        <span>Walking directions</span>
                      </a>
                    )}

                    <div className="space-y-4">
                      {marker.drops.map((item) => {
                        const { drop, can_reserve, unavailable_reason, claim } =
                          item;
                        const isFocused =
                          Boolean(linkedDropId) &&
                          drop.id === linkedDropId?.trim();
                        const isOwnHeld = claim?.status === "held";
                        const title = summarizeDropItems(drop);
                        const locationText = formatConsumerDropLocation(drop);
                        const pickupNote = getDropPickupInstructions(drop);
                        const directionsUrl = getDropWalkingDirectionsUrl(drop);
                        const unavailableExplanation = formatUnavailableReason(
                          unavailable_reason,
                          claim,
                        );

                        return (
                          <article
                            key={drop.id}
                            data-testid={`map-drop-card-${drop.id}`}
                            data-drop-id={drop.id}
                            data-building-id={marker.building.id}
                            data-latitude={String(marker.latitude)}
                            data-longitude={String(marker.longitude)}
                            data-focused={isFocused ? "true" : "false"}
                            className={`space-y-3 rounded-2xl border bg-surface-subtle p-3.5 ${
                              isFocused
                                ? "border-owl-gold ring-2 ring-owl-gold/40"
                                : "border-line"
                            }`}
                          >
                            <DropPhoto
                              dropId={drop.id}
                              hasPhoto={(drop as DropResponse).has_photo}
                              photoUrl={(drop as DropResponse).photo_url}
                              authToken={authToken}
                              alt={title}
                              aspect="16/10"
                              overlayTopLeft={
                                <StatusBadge tone="gold">FREE</StatusBadge>
                              }
                              overlayTopRight={
                                <StatusBadge tone="success">
                                  <span className="tabular-nums">
                                    {drop.counts.available} left
                                  </span>
                                </StatusBadge>
                              }
                            />

                            <div className="space-y-1">
                              <h4
                                data-testid={`map-drop-title-${drop.id}`}
                                className="text-base font-extrabold text-ink"
                              >
                                {title}
                              </h4>
                              <p
                                data-testid={`map-drop-location-${drop.id}`}
                                className="flex items-center gap-1.5 text-xs font-medium text-ink-muted"
                              >
                                <MapPin size={13} aria-hidden="true" />
                                <span>{locationText}</span>
                              </p>
                              <p
                                data-testid={`map-drop-deadline-${drop.id}`}
                                className="flex items-center gap-1.5 text-xs text-ink-muted"
                              >
                                <Clock size={13} aria-hidden="true" />
                                <span>
                                  Collect by{" "}
                                  {formatEasternTime(drop.expires_at)} (
                                  {formatRemainingTime(drop.expires_at, nowIso)}
                                  )
                                </span>
                              </p>
                              {pickupNote && (
                                <p
                                  data-testid={`map-drop-instructions-${drop.id}`}
                                  className="rounded-xl bg-surface px-3 py-2 text-xs text-ink"
                                >
                                  <strong className="font-semibold">
                                    Pickup note:
                                  </strong>{" "}
                                  {pickupNote}
                                </p>
                              )}
                            </div>

                            {drop.diet_tags_final.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {drop.diet_tags_final.map((d) => (
                                  <StatusBadge key={d}>
                                    {d.replaceAll("_", " ")}
                                  </StatusBadge>
                                ))}
                              </div>
                            )}

                            <AllergenCard
                              allergens={drop.allergens_final}
                              notice={drop.allergen_notice}
                              title="Allergens"
                              compact
                            />

                            {directionsUrl && (
                              <a
                                data-testid={`map-directions-link-${drop.id}`}
                                href={directionsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 text-xs font-bold text-ink transition hover:bg-surface-subtle"
                              >
                                <Navigation size={14} aria-hidden="true" />
                                <span>Walking directions</span>
                              </a>
                            )}

                            {!can_reserve && unavailableExplanation && (
                              <p
                                data-testid={`map-drop-unavailable-${drop.id}`}
                                data-reason={unavailable_reason ?? ""}
                                className="rounded-xl bg-warning-tint px-3 py-2 text-xs font-semibold text-warning"
                              >
                                {unavailableExplanation}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <Link
                                href={`/student/drops/${drop.id}`}
                                data-testid={`map-view-details-${drop.id}`}
                                className="consumer-button-secondary px-3 text-xs"
                              >
                                View details
                              </Link>
                              {isOwnHeld ? (
                                <Link
                                  href="/student?tab=reservations"
                                  className="consumer-button px-3 text-xs"
                                >
                                  View hold
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  data-testid={`map-reserve-drop-button-${drop.id}`}
                                  disabled={!can_reserve || busyId !== null}
                                  onClick={() => void onReserveDrop(drop.id)}
                                  className="consumer-button px-3 text-xs"
                                >
                                  {busyId === drop.id
                                    ? "Reserving..."
                                    : can_reserve
                                      ? "Reserve"
                                      : "Unavailable"}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )}
          </section>
        )}
      </div>

      {/* Accessible Building List (always shown in List mode, and below Map when pins exist) */}
      {mapModel.markers.length > 0 ? (
        <section
          data-testid="campus-map-accessible-list"
          aria-label="Available pickup buildings list"
          className="consumer-card space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              Campus pickup spots ({mapModel.markers.length})
            </h2>
            <span className="text-xs text-ink-muted">
              Select a building to preview food
            </span>
          </div>
          <ul className="space-y-2">
            {mapModel.markers.map((marker) => {
              const isSelected = selectedBuildingId === marker.building.id;
              const dropCount = marker.drops.length;
              const dropIds = marker.drops.map((d) => d.drop.id).join(",");
              return (
                <li key={`list-${marker.building.id}`}>
                  <button
                    type="button"
                    data-testid={`campus-map-list-button-${marker.building.id}`}
                    data-building-id={marker.building.id}
                    data-latitude={String(marker.latitude)}
                    data-longitude={String(marker.longitude)}
                    data-h3-cell={marker.h3Cell ?? ""}
                    data-available-servings={String(marker.availableServings)}
                    data-drop-count={String(dropCount)}
                    data-drop-ids={dropIds}
                    data-selected={isSelected ? "true" : "false"}
                    aria-pressed={isSelected}
                    onClick={() =>
                      handleSelectBuilding(
                        marker.building.id,
                        marker.building.name,
                      )
                    }
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-owl-gold bg-owl-goldTint text-ink"
                        : "border-line bg-surface-subtle text-ink hover:border-ink-muted/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-ink">
                        {marker.building.name}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {dropCount} {dropCount === 1 ? "listing" : "listings"}
                        {marker.hasReservableDrop
                          ? " · Tap to preview & reserve"
                          : " · Tap for dietary details"}
                      </div>
                    </div>
                    <StatusBadge
                      tone={marker.hasReservableDrop ? "success" : "warning"}
                    >
                      <span className="tabular-nums">
                        {marker.availableServings} left
                      </span>
                    </StatusBadge>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        displayMode === "list" && (
          <EmptyState
            title="No pickup spots available right now"
            description="Check back soon or clear your search to see active food listings across campus."
            action={
              mapQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setMapQuery("")}
                  className="consumer-button-secondary"
                >
                  Clear search
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSwitchToFeed}
                  className="consumer-button"
                >
                  Browse Home
                </button>
              )
            }
          />
        )
      )}

      {/* Calm notice for listings without a map pin */}
      {mapModel.unplottableAvailableDrops.length > 0 && (
        <section
          data-testid="campus-map-unplottable-notice"
          className="consumer-card space-y-3 border-warning/30 bg-warning-tint/40"
        >
          <h3 className="text-xs font-bold uppercase tracking-wide text-warning">
            Additional campus listings (
            {mapModel.unplottableAvailableDrops.length})
          </h3>
          <p className="text-xs leading-relaxed text-ink-muted">
            Some active food listings don&apos;t have a verified map pin yet.
            Switch to Home to view and reserve them.
          </p>
          <button
            type="button"
            data-testid="campus-map-switch-to-feed"
            onClick={onSwitchToFeed}
            className="consumer-button-secondary w-full"
          >
            Open Home ({mapModel.unplottableAvailableDrops.length})
          </button>
        </section>
      )}
    </section>
  );
}
