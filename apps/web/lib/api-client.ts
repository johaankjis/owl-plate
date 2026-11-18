/**
 * HTTP Client for Owl Plate frozen milestone contract v1.
 *
 * Uses NEXT_PUBLIC_API_URL (defaults to http://localhost:8017).
 * Sends explicit synthetic Bearer credential in demo mode:
 *   Authorization: Bearer demo-host | demo-projector | demo-student-A..E
 *
 * API is the default. Standalone UI fixtures require explicit build-time opt-in.
 * Network errors and failed mutations never become synthetic successes.
 */

import type {
  ClaimResponse,
  DemoCredential,
  DemoActiveDropResponse,
  DemoResetResponse,
  DemoTick,
  DemoTickResponse,
  DispatchResponse,
  DropEdit,
  DropResponse,
  ErrorDetail,
  InviteResponse,
  InvitesResponse,
  Preferences,
  PresenceRequest,
  PresenceResponse,
  PushTokenRequest,
  PushTokenResponse,
} from "./types/api";
import {
  fixtureClaimInvite,
  fixtureCreateDrop,
  fixtureDeclineInvite,
  fixtureDemoReset,
  fixtureDemoTick,
  fixtureGetDispatch,
  fixtureGetDrop,
  fixtureGetMyInvites,
  fixturePickupClaim,
  fixturePublishDrop,
  fixtureRegisterPushToken,
  fixtureReleaseClaim,
  fixtureUpdateDrop,
  fixtureUpdatePreferences,
  fixtureUpdatePresence,
  getActiveFixtureDropId,
} from "./fixtures/demo-fixtures";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8017";

export const UI_FIXTURE_MODE =
  process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true";

export type DataSourceMode = "connecting" | "live_api" | "offline_fixture";
export const INITIAL_DATA_SOURCE: DataSourceMode = UI_FIXTURE_MODE
  ? "offline_fixture"
  : "connecting";

export interface ApiResult<T> {
  data: T;
  source: DataSourceMode;
}

export class ApiContractError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiContractError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorResponse(res: Response): Promise<ApiContractError> {
  try {
    const body = (await res.json()) as {
      detail?: ErrorDetail | string | Array<{ msg?: string }>;
    };
    if (
      body?.detail &&
      typeof body.detail === "object" &&
      !Array.isArray(body.detail)
    ) {
      return new ApiContractError(
        res.status,
        body.detail.code || "api_error",
        body.detail.message || `HTTP ${res.status}`,
      );
    }
    if (Array.isArray(body?.detail)) {
      const msg = body.detail
        .map((d) => d.msg ?? "Validation error")
        .join("; ");
      return new ApiContractError(res.status, "validation_error", msg);
    }
    if (typeof body?.detail === "string") {
      return new ApiContractError(res.status, "api_error", body.detail);
    }
  } catch {
    // non-JSON response
  }
  return new ApiContractError(
    res.status,
    "http_error",
    `HTTP ${res.status} ${res.statusText}`,
  );
}

async function request<T>(
  path: string,
  options: RequestInit,
  credential: DemoCredential,
  fixtureFn: () => T,
  timeoutMs = 15000,
): Promise<ApiResult<T>> {
  if (UI_FIXTURE_MODE) {
    return { data: fixtureFn(), source: "offline_fixture" };
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${credential}`);
  if (
    !(options.body instanceof FormData) &&
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    const data = (await res.json()) as T;
    return { data, source: "live_api" };
  } catch (err) {
    if (err instanceof ApiContractError) {
      throw err;
    }
    throw new ApiContractError(
      0,
      controller.signal.aborted ? "timeout" : "network_error",
      controller.signal.aborted
        ? "Request timed out. Check current state before retrying."
        : "API unavailable. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function createDrop(
  photo: File,
  hostNote: string | undefined,
  credential: DemoCredential = "demo-host",
): Promise<ApiResult<DropResponse>> {
  const form = new FormData();
  form.append("photo", photo);
  if (hostNote && hostNote.trim().length > 0) {
    form.append("host_note", hostNote.trim());
  }

  const result = await request<DropResponse>(
    "/drops",
    { method: "POST", body: form },
    credential,
    () => fixtureCreateDrop(hostNote),
    65000,
  );
  return result;
}

export async function updateDrop(
  dropId: string,
  edit: DropEdit,
  credential: DemoCredential = "demo-host",
): Promise<ApiResult<DropResponse>> {
  return request<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}`,
    { method: "PATCH", body: JSON.stringify(edit) },
    credential,
    () => fixtureUpdateDrop(dropId, edit),
  );
}

export async function publishDrop(
  dropId: string,
  credential: DemoCredential = "demo-host",
): Promise<ApiResult<DropResponse>> {
  const result = await request<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}/publish`,
    { method: "POST" },
    credential,
    () => fixturePublishDrop(dropId),
  );
  return result;
}

export async function getDrop(
  dropId: string,
  credential: DemoCredential,
): Promise<ApiResult<DropResponse>> {
  return request<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}`,
    { method: "GET" },
    credential,
    () => fixtureGetDrop(dropId),
  );
}

export async function getMyInvites(
  credential: DemoCredential,
): Promise<ApiResult<InvitesResponse>> {
  return request<InvitesResponse>(
    "/students/me/invites",
    { method: "GET" },
    credential,
    () => fixtureGetMyInvites(credential),
  );
}

export async function claimInvite(
  inviteId: string,
  credential: DemoCredential,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/invites/${encodeURIComponent(inviteId)}/claim`,
    { method: "POST" },
    credential,
    () => fixtureClaimInvite(inviteId, credential),
  );
}

export async function declineInvite(
  inviteId: string,
  credential: DemoCredential,
): Promise<ApiResult<InviteResponse>> {
  return request<InviteResponse>(
    `/invites/${encodeURIComponent(inviteId)}/decline`,
    { method: "POST" },
    credential,
    () => fixtureDeclineInvite(inviteId, credential),
  );
}

export async function releaseClaim(
  claimId: string,
  credential: DemoCredential,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/release`,
    { method: "POST" },
    credential,
    () => fixtureReleaseClaim(claimId),
  );
}

export async function pickupClaim(
  claimId: string,
  credential: DemoCredential,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/pickup`,
    { method: "POST" },
    credential,
    () => fixturePickupClaim(claimId),
  );
}

export async function getDispatchView(
  dropId: string,
  credential: DemoCredential = "demo-projector",
): Promise<ApiResult<DispatchResponse>> {
  return request<DispatchResponse>(
    `/drops/${encodeURIComponent(dropId)}/dispatch`,
    { method: "GET" },
    credential,
    () => fixtureGetDispatch(dropId),
  );
}

export async function updateMyPreferences(
  prefs: Preferences,
  credential: DemoCredential,
): Promise<ApiResult<Preferences>> {
  return request<Preferences>(
    "/students/me/preferences",
    { method: "PUT", body: JSON.stringify(prefs) },
    credential,
    () => fixtureUpdatePreferences(credential, prefs),
  );
}

export async function checkInPresence(
  req: PresenceRequest,
  credential: DemoCredential,
): Promise<ApiResult<PresenceResponse>> {
  return request<PresenceResponse>(
    "/students/me/presence",
    { method: "POST", body: JSON.stringify(req) },
    credential,
    () => fixtureUpdatePresence(credential, req),
  );
}

export async function registerPushToken(
  req: PushTokenRequest,
  credential: DemoCredential,
): Promise<ApiResult<PushTokenResponse>> {
  return request<PushTokenResponse>(
    "/students/me/push-token",
    { method: "POST", body: JSON.stringify(req) },
    credential,
    () => fixtureRegisterPushToken(credential, req),
  );
}

export async function resetDemoState(
  credential: DemoCredential = "demo-host",
): Promise<ApiResult<DemoResetResponse>> {
  return request<DemoResetResponse>(
    "/demo/reset",
    { method: "POST" },
    credential,
    () => fixtureDemoReset(),
  );
}

export async function advanceDemoClock(
  advanceSeconds = 60,
  credential: DemoCredential = "demo-host",
): Promise<ApiResult<DemoTickResponse>> {
  const payload: DemoTick = { advance_seconds: advanceSeconds };
  return request<DemoTickResponse>(
    "/demo/tick",
    { method: "POST", body: JSON.stringify(payload) },
    credential,
    () => fixtureDemoTick(payload),
  );
}

export async function getActiveDrop(
  credential: DemoCredential = "demo-projector",
): Promise<ApiResult<DemoActiveDropResponse>> {
  return request<DemoActiveDropResponse>(
    "/demo/active-drop",
    { method: "GET" },
    credential,
    () => ({ drop_id: getActiveFixtureDropId() || null }),
  );
}
