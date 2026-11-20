"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AllergenListDisplay } from "./AllergenBadge";
import { CampusMapCanvas } from "./CampusMapCanvas";
import { formatBuildingMetaBadge, isVerifiedBuilding } from "../lib/buildings";
import {
  buildStudentCampusMapModel,
  resolveDeepLinkMapSelection,
  resolveSelectedMapBuilding,
  type GeoPoint,
} from "../lib/campus-map";
import { formatEasternTime, formatRemainingTime } from "../lib/time";
import type { Building, FeedDrop } from "../lib/types/api";
import {
  formatDropResponseLocation,
  formatUnavailableReason,
  getDropPickupInstructions,
  getDropWalkingDirectionsUrl,
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
  onReserveDrop,
  onSwitchToFeed,
}: StudentCampusMapProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );
  const [lastSelectedBuildingName, setLastSelectedBuildingName] = useState<
    string | null
  >(null);
  const appliedDeepLinkRef = useRef<string | null>(null);

  const mapModel = useMemo(
    () => buildStudentCampusMapModel(feedDrops, referenceNowMs),
    [feedDrops, referenceNowMs],
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
        className="space-y-3 rounded-2xl border border-zinc-800 bg-owl-slate p-6 text-center shadow-lg"
      >
        <h2 className="text-base font-extrabold text-white">
          Loading Marietta campus food map...
        </h2>
        <p className="text-xs text-zinc-400">
          Checking active campus drops from your live feed.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="student-campus-map-section"
      aria-label="Marietta campus food availability map"
      className="space-y-4"
    >
      {/* Deep-link notice if ?drop= is exhausted or unplottable on the map */}
      {deepLinkResolution.notice && (
        <div
          data-testid="campus-map-deeplink-notice"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-200"
        >
          <span>{deepLinkResolution.notice}</span>
          <button
            type="button"
            onClick={onSwitchToFeed}
            className="min-h-[36px] shrink-0 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 hover:bg-amber-500/30"
          >
            View in Feed
          </button>
        </div>
      )}

      {/* Interactive Campus Map Canvas */}
      <CampusMapCanvas
        testIdPrefix="campus-map"
        viewportTestId="campus-map-viewport"
        heightClassName="h-[360px] sm:h-[420px]"
        fitPoints={fitPoints}
        fitKey={fitKey}
        referenceBuildings={referenceBuildings}
        excludedReferenceIds={activeMarkerIds}
        enableOsmTiles={true}
        topLeftOverlay={
          <div className="rounded-lg border border-zinc-700 bg-owl-black/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 shadow">
            {mapModel.markers.length > 0 ? (
              <>
                <span className="text-emerald-300">
                  {mapModel.totalAvailableServings}{" "}
                  {mapModel.totalAvailableServings === 1
                    ? "serving"
                    : "servings"}
                </span>{" "}
                at {mapModel.markers.length}{" "}
                {mapModel.markers.length === 1 ? "building" : "buildings"}
              </>
            ) : (
              <span className="text-zinc-300">
                KSU Marietta Campus · 0 available pins
              </span>
            )}
          </div>
        }
        bottomOverlay={
          <div className="inline-block rounded-md border border-zinc-800 bg-owl-black/85 px-2 py-1 text-[10px] text-zinc-300">
            Exact verified pickup buildings · no student GPS
          </div>
        }
        emptyOverlay={
          mapModel.markers.length === 0 ? (
            <div
              data-testid="campus-map-empty"
              className="space-y-2.5 rounded-2xl border border-zinc-700 bg-owl-black/95 p-4 text-center shadow-xl"
            >
              <h2 className="text-sm font-extrabold text-white">
                No available campus food markers right now
              </h2>
              <p className="text-xs leading-relaxed text-zinc-300">
                {mapModel.unplottableAvailableDrops.length > 0
                  ? "Active listings right now do not have verified campus map coordinates. Open Feed to browse or reserve them."
                  : mapModel.exhaustedDrops.length > 0
                    ? "All active campus drops currently have 0 servings available. Released holds or new drops appear automatically."
                    : "When a host shares leftover food at a verified Marietta building, its marker appears here automatically."}
              </p>
              {(mapModel.unplottableAvailableDrops.length > 0 ||
                mapModel.exhaustedDrops.length > 0) && (
                <button
                  type="button"
                  data-testid="campus-map-empty-switch-to-feed"
                  onClick={onSwitchToFeed}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-owl-gold px-4 py-2 text-xs font-extrabold text-owl-black hover:bg-owl-goldDark"
                >
                  Open Feed view
                </button>
              )}
            </div>
          ) : undefined
        }
        renderProjectedOverlay={({ project, width, height }) => (
          <>
            {mapModel.markers.map((marker) => {
              const { x, y } = project(marker.latitude, marker.longitude);
              // Keep slightly off-edge markers out of view without clipping active markers
              if (x < -48 || x > width + 48 || y < -48 || y > height + 48) {
                return null;
              }
              const isSelected = selectedBuildingId === marker.building.id;
              const dropCount = marker.drops.length;
              const dropIds = marker.drops.map((d) => d.drop.id).join(",");
              const ariaLabel = `${marker.building.name}: ${marker.availableServings} available ${
                marker.availableServings === 1 ? "serving" : "servings"
              } across ${dropCount} ${dropCount === 1 ? "drop" : "drops"}${
                marker.hasReservableDrop
                  ? ""
                  : " (view details for dietary or hold status)"
              }`;

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
                  className={`pointer-events-auto absolute flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-full border-2 px-2.5 py-1 shadow-lg transition focus:outline-none focus:ring-2 focus:ring-owl-gold ${
                    isSelected
                      ? "z-30 scale-110 border-white bg-owl-gold text-owl-black ring-4 ring-owl-gold/40"
                      : marker.hasReservableDrop
                        ? "z-20 border-white/90 bg-emerald-500 text-owl-black hover:scale-105 hover:bg-emerald-400"
                        : "z-20 border-amber-300 bg-zinc-900/95 text-amber-200 hover:scale-105"
                  }`}
                >
                  <span
                    data-testid={`campus-map-marker-badge-${marker.building.id}`}
                    className="text-sm font-black leading-none"
                  >
                    {marker.availableServings}
                  </span>
                  {dropCount > 1 && (
                    <span className="mt-0.5 text-[9px] font-extrabold uppercase leading-none opacity-90">
                      {dropCount} drops
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
      />

      {/* Selected Building Detail Sheet OR Stale-Selection Notice */}
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
          className="space-y-4 rounded-2xl border border-owl-gold/50 bg-owl-slate p-4 shadow-xl"
        >
          {selectedState.status !== "active" ? (
            <div
              data-testid="campus-map-stale-notice"
              className="space-y-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-300">
                    Listing updated
                  </div>
                  <h3 className="truncate text-base font-extrabold text-white">
                    {selectedState.buildingName}
                  </h3>
                </div>
                <button
                  type="button"
                  data-testid="campus-map-detail-close"
                  aria-label="Close building details"
                  onClick={() => setSelectedBuildingId(null)}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-owl-black px-3 text-xs font-bold text-zinc-200 hover:border-zinc-500"
                >
                  Close
                </button>
              </div>
              <p className="text-xs leading-relaxed text-zinc-200">
                {selectedState.message}
              </p>
              <button
                type="button"
                onClick={onSwitchToFeed}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-zinc-700 bg-owl-black px-4 py-2 text-xs font-bold text-zinc-100 hover:border-owl-gold"
              >
                Switch to Feed view
              </button>
            </div>
          ) : (
            (() => {
              const { marker } = selectedState;
              const metaBadge = formatBuildingMetaBadge(marker.building);

              return (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-300">
                          {marker.availableServings}{" "}
                          {marker.availableServings === 1
                            ? "serving"
                            : "servings"}{" "}
                          available
                        </span>
                        <span className="rounded-full border border-zinc-700 bg-owl-black px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
                          {marker.drops.length}{" "}
                          {marker.drops.length === 1 ? "listing" : "listings"}
                        </span>
                        {metaBadge && (
                          <span className="rounded-full border border-zinc-700 bg-owl-black px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                            {metaBadge}
                          </span>
                        )}
                      </div>
                      <h3
                        data-testid="campus-map-detail-building-name"
                        data-latitude={String(marker.latitude)}
                        data-longitude={String(marker.longitude)}
                        className="text-lg font-extrabold text-white"
                      >
                        {marker.building.name}
                      </h3>
                    </div>

                    <button
                      type="button"
                      data-testid="campus-map-detail-close"
                      aria-label="Close building details"
                      onClick={() => setSelectedBuildingId(null)}
                      className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-owl-black px-3 text-xs font-bold text-zinc-200 hover:border-zinc-500"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-4">
                    {marker.drops.map((item) => {
                      const { drop, can_reserve, unavailable_reason, claim } =
                        item;
                      const isFocused =
                        Boolean(linkedDropId) &&
                        drop.id === linkedDropId?.trim();
                      const isOwnHeld = claim?.status === "held";
                      const locationText = formatDropResponseLocation(drop);
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
                          className={`space-y-3 rounded-xl border bg-owl-black/75 p-4 ${
                            isFocused
                              ? "border-owl-gold ring-2 ring-owl-gold/50"
                              : can_reserve
                                ? "border-emerald-500/40"
                                : "border-zinc-800"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                              {drop.counts.available} of {drop.counts.total}{" "}
                              available
                            </span>
                            <span
                              data-testid={`map-drop-deadline-${drop.id}`}
                              className="rounded-full bg-owl-slate px-2.5 py-1 text-[11px] font-bold text-owl-gold"
                            >
                              Ends {formatEasternTime(drop.expires_at)} (
                              {formatRemainingTime(drop.expires_at, nowIso)})
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h4
                              data-testid={`map-drop-title-${drop.id}`}
                              className="text-base font-extrabold text-white"
                            >
                              {summarizeDropItems(drop)}
                            </h4>
                            <p
                              data-testid={`map-drop-location-${drop.id}`}
                              className="text-xs font-bold text-zinc-200"
                            >
                              {locationText}
                            </p>
                            {pickupNote && (
                              <p
                                data-testid={`map-drop-instructions-${drop.id}`}
                                className="rounded-lg border border-zinc-800 bg-owl-slate/70 px-3 py-2 text-xs text-zinc-200"
                              >
                                <strong className="text-owl-gold">
                                  Pickup note:
                                </strong>{" "}
                                {pickupNote}
                              </p>
                            )}
                            <p
                              data-testid={`map-drop-available-${drop.id}`}
                              className="text-xs text-zinc-400"
                            >
                              {drop.counts.available} available •{" "}
                              {drop.counts.held} held • {drop.counts.picked_up}{" "}
                              picked up
                            </p>
                          </div>

                          {/* Food items + diet tags */}
                          <div className="space-y-1.5 rounded-lg bg-owl-slate/70 p-3">
                            <ul className="space-y-1 text-xs text-zinc-100">
                              {drop.vision.items.map((foodItem, idx) => (
                                <li
                                  key={`${foodItem.name}-${idx}`}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="font-medium">
                                    {foodItem.name}
                                  </span>
                                  <span className="shrink-0 text-zinc-400">
                                    ~{foodItem.count_estimate}{" "}
                                    {foodItem.portion_unit}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {drop.diet_tags_final.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {drop.diet_tags_final.map((d) => (
                                  <span
                                    key={d}
                                    className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
                                  >
                                    {d.replace("_", " ")}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Mandatory allergen notice */}
                          <AllergenListDisplay
                            allergens={drop.allergens_final}
                            notice={drop.allergen_notice}
                            title="Allergens"
                            compact={true}
                          />

                          {directionsUrl && (
                            <a
                              data-testid={`map-directions-link-${drop.id}`}
                              href={directionsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-extrabold text-emerald-200 transition hover:bg-emerald-500/25"
                            >
                              Get walking directions
                            </a>
                          )}

                          {isOwnHeld ? (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs font-semibold text-emerald-200">
                              Your 10-minute hold is active above. Use the hold
                              card to confirm pickup or release.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {!can_reserve && unavailableExplanation && (
                                <p
                                  data-testid={`map-drop-unavailable-${drop.id}`}
                                  data-reason={unavailable_reason ?? ""}
                                  className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-200"
                                >
                                  {unavailableExplanation}
                                </p>
                              )}
                              <button
                                type="button"
                                data-testid={`map-reserve-drop-button-${drop.id}`}
                                disabled={!can_reserve || busyId !== null}
                                onClick={() => void onReserveDrop(drop.id)}
                                className="min-h-[48px] w-full rounded-xl bg-owl-gold px-4 py-3 text-sm font-extrabold text-owl-black shadow-md transition hover:bg-owl-goldDark disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busyId === drop.id
                                  ? "Reserving..."
                                  : can_reserve
                                    ? "Reserve \u2013 hold 10 min"
                                    : "Unavailable to reserve"}
                              </button>
                            </div>
                          )}
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

      {/* Accessible DOM Building List Alternative (keyboard / screen-reader / no-WebGL) */}
      {mapModel.markers.length > 0 && (
        <section
          data-testid="campus-map-accessible-list"
          aria-label="Available pickup buildings list"
          className="space-y-2 rounded-2xl border border-zinc-800 bg-owl-slate p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Available pickup buildings ({mapModel.markers.length})
            </h2>
            <span className="text-[11px] text-zinc-400">
              Tap a pin or building below
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
                    className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                      isSelected
                        ? "border-owl-gold bg-owl-gold/15 text-white"
                        : "border-zinc-800 bg-owl-black/60 text-zinc-100 hover:border-zinc-600"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">
                        {marker.building.name}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {dropCount} {dropCount === 1 ? "drop" : "drops"}
                        {marker.hasReservableDrop
                          ? " · Tap to view & reserve"
                          : " · Tap for dietary/hold details"}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        marker.hasReservableDrop
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {marker.availableServings} left
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Separate honest notice for unplottable / rehearsal listings */}
      {mapModel.unplottableAvailableDrops.length > 0 && (
        <section
          data-testid="campus-map-unplottable-notice"
          className="space-y-2.5 rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4"
        >
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-amber-300">
            Rehearsal / unverified listings not plotted (
            {mapModel.unplottableAvailableDrops.length})
          </h3>
          <p className="text-xs leading-relaxed text-zinc-300">
            Owl Plate never places synthetic or unverified rehearsal locations
            on the real Marietta campus map. Use Feed view to inspect or reserve
            these listings.
          </p>
          <button
            type="button"
            data-testid="campus-map-switch-to-feed"
            onClick={onSwitchToFeed}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-xs font-extrabold text-amber-100 transition hover:bg-amber-500/30"
          >
            Switch to Feed ({mapModel.unplottableAvailableDrops.length}{" "}
            unplottable)
          </button>
        </section>
      )}
    </section>
  );
}
