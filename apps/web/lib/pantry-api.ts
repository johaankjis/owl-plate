/**
 * Dedicated Demo Pantry Coordinator HTTP client for `/pantry`.
 *
 * Kept strictly separate from projector (`demo-projector`), host (`demo-host`),
 * and student session clients per `docs/PANTRY_FALLBACK_CONTRACT.md`.
 * Always authenticates with the synthetic `demo-pantry-coordinator` role token
 * only; never escalates through projector, host, or student credentials.
 *
 * API is the default. Offline fixtures require explicit build-time opt-in
 * (`NEXT_PUBLIC_UI_FIXTURE_MODE=true`) and failed network/HTTP calls never
 * fall back silently to synthetic successes.
 */

import {
  PANTRY_COORDINATOR_CREDENTIAL,
  type ErrorDetail,
  type PantryDecisionRequest,
  type PantryReferral,
  type PantryReferralsResponse,
} from "./types/api";
import {
  fixtureDecidePantryReferral,
  fixtureGetPantryReferrals,
} from "./fixtures/demo-fixtures";
import type { ApiResult, DataSourceMode } from "./api-client";

export const PANTRY_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8017";

export const PANTRY_UI_FIXTURE_MODE =
  process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true";

export const INITIAL_PANTRY_DATA_SOURCE: DataSourceMode = PANTRY_UI_FIXTURE_MODE
  ? "offline_fixture"
  : "connecting";

export class PantryApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PantryApiError";
    this.status = status;
    this.code = code;
  }
}

async function parsePantryError(res: Response): Promise<PantryApiError> {
  try {
    const body = (await res.json()) as {
      detail?: ErrorDetail | string | Array<{ msg?: string }>;
    };
    if (
      body?.detail &&
      typeof body.detail === "object" &&
      !Array.isArray(body.detail)
    ) {
      return new PantryApiError(
        res.status,
        body.detail.code || "api_error",
        body.detail.message || `HTTP ${res.status}`,
      );
    }
    if (Array.isArray(body?.detail)) {
      const msg = body.detail
        .map((d) => d.msg ?? "Validation error")
        .join("; ");
      return new PantryApiError(res.status, "validation_error", msg);
    }
    if (typeof body?.detail === "string") {
      return new PantryApiError(res.status, "api_error", body.detail);
    }
  } catch {
    // Non-JSON response keeps status line
  }
  return new PantryApiError(
    res.status,
    "http_error",
    `HTTP ${res.status} ${res.statusText}`.trim(),
  );
}

function normalizeFixtureError(err: unknown): PantryApiError {
  if (err instanceof PantryApiError) {
    return err;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "code" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const typed = err as { status: number; code: string; message?: string };
    return new PantryApiError(
      typed.status,
      typed.code,
      typed.message || "Fixture error",
    );
  }
  return new PantryApiError(
    400,
    "fixture_error",
    err instanceof Error ? err.message : "Fixture error",
  );
}

async function coordinatorRequest<T>(
  path: string,
  options: RequestInit,
  fixtureFn: () => T,
  timeoutMs = 15000,
): Promise<ApiResult<T>> {
  if (PANTRY_UI_FIXTURE_MODE) {
    try {
      return { data: fixtureFn(), source: "offline_fixture" };
    } catch (err) {
      throw normalizeFixtureError(err);
    }
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${PANTRY_COORDINATOR_CREDENTIAL}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${PANTRY_API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await parsePantryError(res);
    }
    const data = (await res.json()) as T;
    return { data, source: "live_api" };
  } catch (err) {
    if (err instanceof PantryApiError) {
      throw err;
    }
    throw new PantryApiError(
      0,
      controller.signal.aborted ? "timeout" : "network_error",
      controller.signal.aborted
        ? "Request timed out. Refresh before retrying."
        : "API unavailable. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lists all demo pantry referrals across lifecycle states for the synthetic
 * `demo-pantry-coordinator` role.
 */
export async function getPantryReferrals(): Promise<
  ApiResult<PantryReferralsResponse>
> {
  return coordinatorRequest<PantryReferralsResponse>(
    "/pantry/referrals",
    { method: "GET" },
    () => fixtureGetPantryReferrals(PANTRY_COORDINATOR_CREDENTIAL),
  );
}

/**
 * Records an explicit simulated accept or reject coordinator decision.
 * Reject omits `servings` so no stock is allocated; accept sends chosen servings.
 */
export async function decidePantryReferral(
  referralId: string,
  req: PantryDecisionRequest,
): Promise<ApiResult<PantryReferral>> {
  const payload: PantryDecisionRequest =
    req.decision === "accept"
      ? {
          decision: "accept",
          servings: req.servings,
          demo_policy_acknowledged: req.demo_policy_acknowledged,
        }
      : {
          decision: "reject",
          demo_policy_acknowledged: req.demo_policy_acknowledged,
        };

  return coordinatorRequest<PantryReferral>(
    `/pantry/referrals/${encodeURIComponent(referralId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    () =>
      fixtureDecidePantryReferral(
        referralId,
        payload,
        PANTRY_COORDINATOR_CREDENTIAL,
      ),
  );
}
