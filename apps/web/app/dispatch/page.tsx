"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { latLngToCell } from "h3-js";
import { DispatchMap, type MapParticipant } from "../../components/DispatchMap";
import { PresenterControls } from "../../components/presenter/PresenterControls";
import {
  TONE_CLASSES,
  describeReasons,
  describeStatus,
  formatEastern,
} from "../../components/presenter/labels";
import {
  getBuildings,
  getDemoAreas,
  getDemoStatus,
  getDispatch,
  getDistribution,
  getDrop,
  type CampusDistributionResponse,
  type DemoStatusResponse,
  type DispatchResponse,
  type DropResponse,
} from "../../lib/presenter-api";
import type { Building } from "../../lib/types/api";
import { isVerifiedBuilding } from "../../lib/buildings";
import {
  computeH3CellForCoords,
  resolveBuildingAvailableDrops,
  resolveCampusAvailableDrops,
} from "../../lib/campus-map";
import { useVisionMode, visionModeLabel } from "../../lib/vision-mode";

const ALLERGEN_NOTICE = "may contain, confirm with host";
const PLACEHOLDER_ORIGIN_CELL = latLngToCell(0.0, 0.0, 11);

interface Row {
  key: string;
  testId: string;
  name: string;
  simulated: boolean;
  where: string;
  status: string;
  reasonCodes: string[];
  wave: number | null;
}

function StatTile({
  label,
  value,
  testId,
  accent = "text-white",
}: {
  label: string;
  value: React.ReactNode;
  testId: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div data-testid={testId} className={`text-4xl font-extrabold ${accent}`}>
        {value}
      </div>
    </div>
  );
}

export default function DispatchProjectorPage() {
  const [status, setStatus] = useState<DemoStatusResponse | null>(null);
  const [distribution, setDistribution] =
    useState<CampusDistributionResponse | null>(null);
  const [dispatch, setDispatch] = useState<DispatchResponse | null>(null);
  const [drop, setDrop] = useState<DropResponse | null>(null);
  const [areaLabels, setAreaLabels] = useState<Record<string, string>>({});
  const [referenceBuildings, setReferenceBuildings] = useState<Building[]>([]);
  const [joinUrl, setJoinUrl] = useState("/join");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const visionMode = useVisionMode();
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const [current, dist] = await Promise.all([
        getDemoStatus(),
        getDistribution(),
      ]);
      setStatus(current);
      setDistribution(dist);
      if (!current.active_drop_id) {
        setDispatch(null);
        setDrop(null);
      } else {
        const [view, details] = await Promise.all([
          getDispatch(current.active_drop_id),
          getDrop(current.active_drop_id),
        ]);
        setDispatch(view);
        setDrop(details);
        setReceivedAt(Date.now());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch unavailable");
    }
  }, []);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join`);
    Promise.allSettled([getDemoAreas(), getBuildings()]).then(
      ([areasRes, buildingsRes]) => {
        const nextLabels: Record<string, string> = {};
        if (areasRes.status === "fulfilled") {
          for (const area of areasRes.value.areas) {
            nextLabels[area.id] = area.label;
          }
        }
        if (buildingsRes.status === "fulfilled") {
          setReferenceBuildings(buildingsRes.value.buildings);
          for (const building of buildingsRes.value.buildings) {
            nextLabels[building.id] = building.name;
          }
        }
        setAreaLabels(nextLabels);
      },
    );
    void poll();
    const pollTimer = setInterval(() => void poll(), 2000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [poll]);

  const rows = useMemo<Row[]>(() => {
    if (!dispatch) return [];
    const visitors = (dispatch.visitors ?? []).map((v) => ({
      key: `visitor-${v.nickname}`,
      testId: `visitor-row-${v.nickname}`,
      name: v.nickname,
      simulated: false,
      where: v.area ? (areaLabels[v.area] ?? v.area) : "Campus-wide feed",
      status: v.status,
      reasonCodes: v.reason_codes,
      wave: v.wave_number ?? null,
    }));
    const personas = dispatch.personas
      .filter((p) => ["A", "B", "C", "D", "E"].includes(p.label))
      .map((p) => ({
        key: `persona-${p.label}`,
        testId: `persona-row-${p.label}`,
        name: `Persona ${p.label}`,
        simulated: true,
        where: `Ring ${p.ring_distance ?? "?"}`,
        status: p.status,
        reasonCodes: p.reason_codes,
        wave: p.wave_number ?? null,
      }));
    return [...visitors, ...personas];
  }, [dispatch, areaLabels]);

  const participants = useMemo<MapParticipant[]>(() => {
    if (!dispatch) return [];
    return [
      ...(dispatch.visitors ?? []).map((v) => ({
        label: v.nickname,
        simulated: false,
        status: v.status,
        reasonCodes: v.reason_codes,
        h3Cell: v.h3_cell,
      })),
      ...dispatch.personas
        .filter((p) => ["A", "B", "C", "D", "E"].includes(p.label))
        .map((p) => ({
          label: p.label,
          simulated: true,
          status: p.status,
          reasonCodes: p.reason_codes,
          h3Cell: p.h3_cell,
        })),
    ];
  }, [dispatch]);

  // Count down from server time so a skewed laptop clock cannot mislead.
  const nextWaveSeconds =
    dispatch?.next_wave_at && receivedAt !== null
      ? Math.max(
          0,
          Math.round(
            (Date.parse(dispatch.next_wave_at) -
              Date.parse(dispatch.server_time) -
              (now - receivedAt)) /
              1000,
          ),
        )
      : null;

  const isSeededMode =
    status?.scenario === "seeded" ||
    (distribution?.distribution_mode === "seeded_waves" &&
      status?.scenario !== "visitors");

  const campusActiveDrops = distribution?.active_drops ?? 0;
  const campusAvailableDrops = resolveCampusAvailableDrops(distribution);
  const campusJoinedStudents =
    distribution?.joined_students ?? status?.visitors ?? 0;
  const campusCounts = distribution?.counts ?? {
    total: 0,
    available: 0,
    held: 0,
    picked_up: 0,
  };
  const campusBuildings = distribution?.buildings ?? [];

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-8 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-3xl font-extrabold text-owl-gold">
            Owl Plate
          </Link>
          <span className="text-2xl font-semibold text-zinc-300">
            {isSeededMode
              ? "Live dispatch (seeded rehearsal)"
              : "Campus distribution"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span
            data-testid="label-fixture-vision"
            className="rounded-full border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-purple-200"
          >
            {visionModeLabel(visionMode)}
          </span>
          <span
            data-testid="label-simulated-notifications"
            className="rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-sky-200"
          >
            Simulated notifications (no real push)
          </span>
          <span className="rounded-full border border-owl-gold/50 bg-owl-gold/10 px-3 py-1 text-owl-gold">
            Demo mode
          </span>
        </div>
      </header>

      <main className="space-y-5 px-8 py-5">
        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-lg text-rose-200">
            {error}
          </div>
        )}
        {notice && (
          <div
            data-testid="presenter-notice"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-lg text-emerald-200"
          >
            {notice}
          </div>
        )}

        {!isSeededMode ? (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="Active drops"
                testId="distribution-active-drops"
                value={campusActiveDrops}
                accent="text-owl-gold"
              />
              <StatTile
                label="Available drops"
                testId="distribution-available-drops"
                value={campusAvailableDrops}
                accent="text-emerald-300"
              />
              <StatTile
                label="Joined students"
                testId="visitor-count"
                value={`${campusJoinedStudents} joined`}
                accent="text-sky-300"
              />
              <StatTile
                label="Available"
                testId="dispatch-count-available"
                value={campusCounts.available}
                accent="text-emerald-400"
              />
              <StatTile
                label="Reserved"
                testId="dispatch-count-held"
                value={campusCounts.held}
                accent="text-owl-gold"
              />
              <StatTile
                label="Collected"
                testId="dispatch-count-picked-up"
                value={campusCounts.picked_up}
                accent="text-zinc-100"
              />
            </section>

            {campusActiveDrops === 0 ? (
              <section
                data-testid="distribution-empty-state"
                className="grid gap-5 lg:grid-cols-2"
              >
                <div className="rounded-xl border border-zinc-800 bg-owl-slate p-8">
                  <h1 className="text-4xl font-extrabold">
                    Waiting for a host to share food
                  </h1>
                  <p className="mt-3 text-xl text-zinc-300">
                    Students join the campus-wide feed, then hosts publish drops
                    at verified campus buildings. Active pickup locations appear
                    here.
                  </p>
                </div>
                <div className="rounded-xl border border-owl-gold/40 bg-owl-gold/5 p-8">
                  <div className="text-lg font-semibold uppercase tracking-wide text-owl-gold">
                    Join the campus feed
                  </div>
                  <div
                    data-testid="join-url"
                    className="mt-2 break-all font-mono text-3xl font-bold"
                  >
                    {joinUrl}
                  </div>
                  <div className="mt-4 text-xl text-zinc-300">
                    No student locations or check-ins collected · direct reserve
                    from mobile feed or map
                  </div>
                </div>
              </section>
            ) : (
              <section className="grid gap-5 xl:grid-cols-12">
                <div className="space-y-4 xl:col-span-7">
                  <DispatchMap
                    originCell={
                      dispatch?.origin_cell ?? PLACEHOLDER_ORIGIN_CELL
                    }
                    ringK={0}
                    participants={[]}
                    campusBuildingName={drop?.building?.name}
                    distributionMode="campus_feed"
                    buildingDistributions={campusBuildings}
                    referenceBuildings={referenceBuildings}
                  />
                  {drop && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4 text-lg">
                      <span className="font-semibold">
                        {drop.vision.items.map((item) => item.name).join(", ")}
                      </span>
                      <span className="text-zinc-400">
                        {drop.servings_final} servings ·{" "}
                        {drop.building?.name ??
                          areaLabels[drop.building_code] ??
                          drop.building_code}
                      </span>
                      <span
                        data-testid="dispatch-vision-source"
                        className="rounded bg-purple-500/20 px-2 py-0.5 text-sm font-semibold text-purple-200"
                      >
                        {drop.vision_source === "openrouter"
                          ? "Live Gemini via OpenRouter"
                          : drop.vision_source === "gemini"
                            ? "Live Gemini"
                            : "Saved demo estimate"}
                      </span>
                      {drop.allergens_final.length > 0 && (
                        <span className="text-amber-200">
                          Allergens: {drop.allergens_final.join(", ")} —{" "}
                          {ALLERGEN_NOTICE}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4 xl:col-span-5">
                  <div className="rounded-xl border border-zinc-800 bg-owl-slate">
                    <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
                      <h2 className="text-xl font-bold">
                        Host pickup buildings
                      </h2>
                      <span className="text-base text-zinc-400">
                        Join:{" "}
                        <span data-testid="join-url" className="font-mono">
                          {joinUrl}
                        </span>
                      </span>
                    </div>
                    {campusBuildings.length === 0 ? (
                      <p className="px-5 py-6 text-lg text-zinc-400">
                        No active pickup buildings right now.
                      </p>
                    ) : (
                      <ul
                        data-testid="distribution-buildings-list"
                        className="divide-y divide-zinc-800"
                      >
                        {campusBuildings.map((b) => {
                          const buildingName =
                            b.building?.name ??
                            areaLabels[b.building_code] ??
                            b.building_code;
                          const availDrops = resolveBuildingAvailableDrops(b);
                          const hasAvailable = b.counts.available > 0;
                          const verified = isVerifiedBuilding(b.building);
                          const h3Cell = verified
                            ? computeH3CellForCoords(
                                b.building!.latitude,
                                b.building!.longitude,
                              )
                            : null;
                          return (
                            <li
                              key={b.building_code}
                              data-testid={`distribution-building-${b.building_code}`}
                              data-latitude={
                                verified ? String(b.building!.latitude) : ""
                              }
                              data-longitude={
                                verified ? String(b.building!.longitude) : ""
                              }
                              data-h3-cell={h3Cell ?? ""}
                              data-available-drops={String(availDrops)}
                              data-active-drops={String(b.active_drops)}
                              data-available={String(b.counts.available)}
                              data-reserved={String(b.counts.held)}
                              data-collected={String(b.counts.picked_up)}
                              data-availability-status={
                                hasAvailable ? "available" : "exhausted"
                              }
                              className="space-y-2 px-5 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-xl font-bold text-white">
                                    {buildingName}
                                  </div>
                                  <div className="text-sm text-zinc-400">
                                    <span
                                      data-testid={`distribution-building-available-drops-${b.building_code}`}
                                    >
                                      {availDrops} available
                                    </span>{" "}
                                    of {b.active_drops}{" "}
                                    {b.active_drops === 1
                                      ? "active drop"
                                      : "active drops"}{" "}
                                    · {b.counts.total} total servings
                                  </div>
                                </div>
                                <span
                                  data-testid={`distribution-building-status-${b.building_code}`}
                                  className={`shrink-0 rounded-full px-3.5 py-1 text-sm font-bold ${
                                    hasAvailable
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-amber-500/20 text-amber-300"
                                  }`}
                                >
                                  {hasAvailable
                                    ? `${b.counts.available} available`
                                    : "Exhausted (reserved / collected)"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
                                <span>
                                  Available:{" "}
                                  <strong className="text-emerald-400">
                                    {b.counts.available}
                                  </strong>
                                </span>
                                <span>
                                  Reserved:{" "}
                                  <strong className="text-owl-gold">
                                    {b.counts.held}
                                  </strong>
                                </span>
                                <span>
                                  Collected:{" "}
                                  <strong className="text-zinc-100">
                                    {b.counts.picked_up}
                                  </strong>
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4 text-sm text-zinc-300">
                    <h2 className="text-base font-bold text-white">
                      Campus-wide feed privacy
                    </h2>
                    <p className="mt-1">
                      Projector displays aggregate host pickup counts
                      (available, reserved, collected) and verified building
                      coordinates only. Student locations, nicknames, and
                      dietary filters are never shown here.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        ) : !dispatch ? (
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-owl-slate p-8">
              <h1 className="text-4xl font-extrabold">
                Waiting for a host to share food
              </h1>
              <p className="mt-3 text-xl text-zinc-300">
                Students join, then a host uploads one photo. Matches appear
                here.
              </p>
            </div>
            <div className="rounded-xl border border-owl-gold/40 bg-owl-gold/5 p-8">
              <div className="text-lg font-semibold uppercase tracking-wide text-owl-gold">
                Join the demo
              </div>
              <div
                data-testid="join-url"
                className="mt-2 break-all font-mono text-3xl font-bold"
              >
                {joinUrl}
              </div>
              <div
                data-testid="visitor-count"
                className="mt-4 text-2xl text-zinc-200"
              >
                {status?.visitors ?? 0} joined
                {status?.scenario === "seeded" &&
                  " · seeded rehearsal (A–E simulated)"}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatTile
                label="Drop"
                testId="dispatch-status"
                value={dispatch.status.toUpperCase()}
                accent="text-owl-gold"
              />
              <StatTile
                label="Search ring"
                testId="dispatch-ring-k"
                value={`k = ${dispatch.ring_k}`}
                accent="text-sky-300"
              />
              <StatTile
                label="Available"
                testId="dispatch-count-available"
                value={dispatch.counts.available}
                accent="text-emerald-400"
              />
              <StatTile
                label="Held"
                testId="dispatch-count-held"
                value={dispatch.counts.held}
                accent="text-owl-gold"
              />
              <StatTile
                label="Next wave check"
                testId="dispatch-next-wave"
                value={nextWaveSeconds === null ? "—" : `${nextWaveSeconds} s`}
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-7">
                <DispatchMap
                  originCell={dispatch.origin_cell}
                  ringK={dispatch.ring_k}
                  participants={participants}
                  campusBuildingName={drop?.building?.name}
                  distributionMode="seeded_waves"
                />
                {drop && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4 text-lg">
                    <span className="font-semibold">
                      {drop.vision.items.map((item) => item.name).join(", ")}
                    </span>
                    <span className="text-zinc-400">
                      {drop.servings_final} servings ·{" "}
                      {drop.building?.name ??
                        areaLabels[drop.building_code] ??
                        drop.building_code}
                    </span>
                    <span
                      data-testid="dispatch-vision-source"
                      className="rounded bg-purple-500/20 px-2 py-0.5 text-sm font-semibold text-purple-200"
                    >
                      {drop.vision_source === "gemini"
                        ? "Live Gemini"
                        : "Saved demo estimate"}
                    </span>
                    {drop.allergens_final.length > 0 && (
                      <span className="text-amber-200">
                        Allergens: {drop.allergens_final.join(", ")} —{" "}
                        {ALLERGEN_NOTICE}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 xl:col-span-5">
                <div className="rounded-xl border border-zinc-800 bg-owl-slate">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
                    <h2 className="text-xl font-bold">Who gets invited</h2>
                    <span className="text-base text-zinc-400">
                      Join: <span className="font-mono">{joinUrl}</span>
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-5 py-6 text-lg text-zinc-400">
                      Nobody has joined yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-800">
                      {rows.map((row) => {
                        const shown = describeStatus(
                          row.status,
                          row.reasonCodes,
                        );
                        return (
                          <li
                            key={row.key}
                            data-testid={row.testId}
                            data-status={row.status}
                            className="flex items-center justify-between gap-3 px-5 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xl font-bold">
                                <span className="truncate">{row.name}</span>
                                {row.simulated && (
                                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-owl-gold">
                                    SIM
                                  </span>
                                )}
                              </div>
                              <div className="text-base text-zinc-400">
                                {row.where} · {describeReasons(row.reasonCodes)}
                                {row.wave !== null && ` · wave ${row.wave}`}
                              </div>
                            </div>
                            <span
                              data-testid={`${row.testId.replace("-row-", "-status-")}`}
                              className={`shrink-0 rounded-full px-4 py-1.5 text-base font-bold ${TONE_CLASSES[shown.tone]}`}
                            >
                              {shown.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4">
                  <h2 className="text-xl font-bold">Waves</h2>
                  <ol className="mt-2 space-y-1 text-lg">
                    {dispatch.waves.map((wave) => (
                      <li
                        key={wave.number}
                        data-testid={`wave-${wave.number}`}
                        className="flex justify-between"
                      >
                        <span>
                          Wave {wave.number} · ring {wave.ring_k} ·{" "}
                          {wave.invite_count} invited
                        </span>
                        <span className="text-zinc-400">
                          {formatEastern(wave.planned_at)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          </>
        )}

        <PresenterControls
          status={status}
          onChanged={(message) => {
            setNotice(message);
            void poll();
          }}
          onError={setError}
        />
      </main>
    </div>
  );
}
