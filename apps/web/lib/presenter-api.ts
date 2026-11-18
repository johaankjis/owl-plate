/**
 * Presenter and projector calls for the dispatch screen.
 *
 * Kept separate from the student/host client so the projector never handles
 * visitor tokens, and so presenter controls can evolve without touching
 * student flows. Uses the synthetic `demo-projector` credential only.
 */

import type { components } from "./api.generated";

type Schemas = components["schemas"];
export type DispatchResponse = Schemas["DispatchResponse"];
export type DropResponse = Schemas["DropResponse"];
export type DemoStatusResponse = Schemas["DemoStatusResponse"];
export type DemoArea = Schemas["DemoArea"];
export type PersonaDecision = Schemas["PersonaDecision"];
export type VisitorDecision = Schemas["VisitorDecision"];
export type Scenario = Schemas["DemoResetRequest"]["scenario"];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8017";

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
): Promise<T> {
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

export const getDemoStatus = () => call<DemoStatusResponse>("/demo/status");

export const getDemoAreas = () =>
  call<Schemas["DemoAreasResponse"]>("/demo/areas", {}, false);

export const getDispatch = (dropId: string) =>
  call<DispatchResponse>(`/drops/${dropId}/dispatch`);

export const getDrop = (dropId: string) =>
  call<DropResponse>(`/drops/${dropId}`);

export const resetDemo = (scenario: Scenario) =>
  call<Schemas["DemoResetResponse"]>("/demo/reset", {
    method: "POST",
    body: JSON.stringify({ scenario }),
  });

export const advanceClock = (seconds: number) =>
  call<Schemas["DemoTickResponse"]>("/demo/tick", {
    method: "POST",
    body: JSON.stringify({ advance_seconds: seconds }),
  });
