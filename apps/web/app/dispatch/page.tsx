"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DispatchMap, type MapParticipant } from "../../components/DispatchMap";
import { PresenterControls } from "../../components/presenter/PresenterControls";
import {
  TONE_CLASSES,
  describeReasons,
  describeStatus,
  formatEastern,
} from "../../components/presenter/labels";
import {
  getDemoAreas,
  getDemoStatus,
  getDispatch,
  getDrop,
  type DemoStatusResponse,
  type DispatchResponse,
  type DropResponse,
} from "../../lib/presenter-api";
import { useVisionMode, visionModeLabel } from "../../lib/vision-mode";

const ALLERGEN_NOTICE = "may contain, confirm with host";

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
  const [dispatch, setDispatch] = useState<DispatchResponse | null>(null);
  const [drop, setDrop] = useState<DropResponse | null>(null);
  const [areaLabels, setAreaLabels] = useState<Record<string, string>>({});
  const [joinUrl, setJoinUrl] = useState("/join");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const visionMode = useVisionMode();
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const current = await getDemoStatus();
      setStatus(current);
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
    getDemoAreas()
      .then((res) =>
        setAreaLabels(
          Object.fromEntries(res.areas.map((area) => [area.id, area.label])),
        ),
      )
      .catch(() => setAreaLabels({}));
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
      where: areaLabels[v.area] ?? v.area,
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

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-8 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-3xl font-extrabold text-owl-gold">
            Owl Plate
          </Link>
          <span className="text-2xl font-semibold text-zinc-300">
            Live dispatch
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

        {!dispatch ? (
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
                />
                {drop && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-owl-slate px-5 py-4 text-lg">
                    <span className="font-semibold">
                      {drop.vision.items.map((item) => item.name).join(", ")}
                    </span>
                    <span className="text-zinc-400">
                      {drop.servings_final} servings · {drop.building_code}
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
