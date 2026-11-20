/**
 * Presenter and projector calls for the dispatch screen.
 *
 * Kept separate from the student/host client so the projector never handles
 * visitor tokens, and so presenter controls can evolve without touching
 * student flows. Uses the synthetic `demo-projector` credential only.
 */

import type { components } from "./api.generated";
import type {
  BuildingDistribution,
  BuildingsResponse,
  CampusDistributionResponse,
  DispatchResponse,
  DropResponse,
  VisitorDecision,
} from "./types/api";
import {
  fixtureDemoReset,
  fixtureDemoTick,
  fixtureGetBuildings,
  fixtureGetDemoAreas,
  fixtureGetDemoStatus,
  fixtureGetDispatch,
  fixtureGetDistribution,
  fixtureGetDrop,
} from "./fixtures/demo-fixtures";

type Schemas = components["schemas"];
export type {
  BuildingDistribution,
  BuildingsResponse,
  CampusDistributionResponse,
  DispatchResponse,
  DropResponse,
  VisitorDecision,
};
export type DemoStatusResponse = Schemas["DemoStatusResponse"];
export type DemoArea = Schemas["DemoArea"];
export type PersonaDecision = Schemas["PersonaDecision"];
export type Scenario = Schemas["DemoResetRequest"]["scenario"];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8017";

const UI_FIXTURE_MODE = process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true";

export class PresenterApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PresenterApiError";
  }
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  authorized = true,
  fixtureFn?: () => T,
): Promise<T> {
  if (UI_FIXTURE_MODE && fixtureFn) {
    try {
      return fixtureFn();
    } catch (err) {
      const status =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : 400;
      throw new PresenterApiError(
        status,
        err instanceof Error ? err.message : "Fixture error",
      );
    }
  }
  const headers = new Headers(init.headers);
  if (authorized) headers.set("Authorization", "Bearer demo-projector");
  if (init.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new PresenterApiError(0, "API unavailable. Is the demo running?");
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: { message?: string } };
      message = body.detail?.message ?? message;
    } catch {
      // Non-JSON error bodies keep the status message.
    }
    throw new PresenterApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const getDemoStatus = () =>
  call<DemoStatusResponse>("/demo/status", {}, true, () =>
    fixtureGetDemoStatus(),
  );

export const getDemoAreas = () =>
  call<Schemas["DemoAreasResponse"]>("/demo/areas", {}, false, () =>
    fixtureGetDemoAreas(),
  );

export const getBuildings = () =>
  call<BuildingsResponse>("/buildings", {}, false, () => fixtureGetBuildings());

export const getDistribution = () =>
  call<CampusDistributionResponse>("/distribution", {}, true, () =>
    fixtureGetDistribution(),
  );

export const getDispatch = (dropId: string) =>
  call<DispatchResponse>(`/drops/${dropId}/dispatch`, {}, true, () =>
    fixtureGetDispatch(dropId),
  );

export const getDrop = (dropId: string) =>
  call<DropResponse>(`/drops/${dropId}`, {}, true, () =>
    fixtureGetDrop(dropId),
  );

export const resetDemo = (scenario: Scenario) =>
  call<Schemas["DemoResetResponse"]>(
    "/demo/reset",
    {
      method: "POST",
      body: JSON.stringify({ scenario }),
    },
    true,
    () => fixtureDemoReset({ scenario }),
  );

export const advanceClock = (seconds: number) =>
  call<Schemas["DemoTickResponse"]>(
    "/demo/tick",
    {
      method: "POST",
      body: JSON.stringify({ advance_seconds: seconds }),
    },
    true,
    () => fixtureDemoTick({ advance_seconds: seconds }),
  );
