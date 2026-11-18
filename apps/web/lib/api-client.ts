/**
 * HTTP Client for Owl Plate frozen milestone contract v1.
 *
 * Uses NEXT_PUBLIC_API_URL (defaults to http://localhost:8000).
 * Sends explicit synthetic Bearer credential in demo mode:
 *   Authorization: Bearer demo-host | demo-projector | demo-student-A..E
 *
 * When the backend is unreachable or when offline fixture fallback is enabled,
 * calls resolve against the local deterministic fixture state and return
 * `source: "offline_fixture"` so the UI always labels cached/simulated output clearly.
 */

import type {
  ClaimResponse,
  DemoCredential,
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
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:8000";

const ACTIVE_DROP_STORAGE_KEY = "owl_plate_active_drop_id";

export type DataSourceMode = "live_api" | "offline_fixture";

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

export function getStoredActiveDropId(): string {
  if (typeof window === "undefined") {
    return getActiveFixtureDropId();
  }
  return window.localStorage.getItem(ACTIVE_DROP_STORAGE_KEY) || getActiveFixtureDropId();
}

export function setStoredActiveDropId(dropId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_DROP_STORAGE_KEY, dropId);
  } catch {
    // ignore storage quota errors
  }
}

async function parseErrorResponse(res: Response): Promise<ApiContractError> {
  try {
    const body = (await res.json()) as {
      detail?: ErrorDetail | string | Array<{ msg?: string }>;
    };
    if (body?.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
      return new ApiContractError(
        res.status,
        body.detail.code || "api_error",
        body.detail.message || `HTTP ${res.status}`
      );
    }
    if (Array.isArray(body?.detail)) {
      const msg = body.detail.map((d) => d.msg ?? "Validation error").join("; ");
      return new ApiContractError(res.status, "validation_error", msg);
    }
    if (typeof body?.detail === "string") {
      return new ApiContractError(res.status, "api_error", body.detail);
    }
  } catch {
    // non-JSON response
  }
  return new ApiContractError(res.status, "http_error", `HTTP ${res.status} ${res.statusText}`);
}

async function requestWithFallback<T>(
  path: string,
  options: RequestInit,
  credential: DemoCredential,
  fallbackFn: () => T
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${credential}`);
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    const data = (await res.json()) as T;
    return { data, source: "live_api" };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof ApiContractError) {
      throw err;
    }
    // Network error / backend not running yet -> use deterministic local fixture
    const fallbackData = fallbackFn();
    return { data: fallbackData, source: "offline_fixture" };
  }
}

export async function createDrop(
  photo: File,
  hostNote: string | undefined,
  credential: DemoCredential = "demo-host"
): Promise<ApiResult<DropResponse>> {
  const form = new FormData();
  form.append("photo", photo);
  if (hostNote && hostNote.trim().length > 0) {
    form.append("host_note", hostNote.trim());
  }

  const result = await requestWithFallback<DropResponse>(
    "/drops",
    { method: "POST", body: form },
    credential,
    () => fixtureCreateDrop(hostNote)
  );
  setStoredActiveDropId(result.data.id);
  return result;
}

export async function updateDrop(
  dropId: string,
  edit: DropEdit,
  credential: DemoCredential = "demo-host"
): Promise<ApiResult<DropResponse>> {
  return requestWithFallback<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}`,
    { method: "PATCH", body: JSON.stringify(edit) },
    credential,
    () => fixtureUpdateDrop(dropId, edit)
  );
}

export async function publishDrop(
  dropId: string,
  credential: DemoCredential = "demo-host"
): Promise<ApiResult<DropResponse>> {
  const result = await requestWithFallback<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}/publish`,
    { method: "POST" },
    credential,
    () => fixturePublishDrop(dropId)
  );
  setStoredActiveDropId(result.data.id);
  return result;
}

export async function getDrop(
  dropId: string,
  credential: DemoCredential
): Promise<ApiResult<DropResponse>> {
  return requestWithFallback<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}`,
    { method: "GET" },
    credential,
    () => fixtureGetDrop(dropId)
  );
}

export async function getMyInvites(
  credential: DemoCredential
): Promise<ApiResult<InvitesResponse>> {
  return requestWithFallback<InvitesResponse>(
    "/students/me/invites",
    { method: "GET" },
    credential,
    () => fixtureGetMyInvites(credential)
  );
}

export async function claimInvite(
  inviteId: string,
  credential: DemoCredential
): Promise<ApiResult<ClaimResponse>> {
  return requestWithFallback<ClaimResponse>(
    `/invites/${encodeURIComponent(inviteId)}/claim`,
    { method: "POST" },
    credential,
    () => fixtureClaimInvite(inviteId, credential)
  );
}

export async function declineInvite(
  inviteId: string,
  credential: DemoCredential
): Promise<ApiResult<InviteResponse>> {
  return requestWithFallback<InviteResponse>(
    `/invites/${encodeURIComponent(inviteId)}/decline`,
    { method: "POST" },
    credential,
    () => fixtureDeclineInvite(inviteId, credential)
  );
}

export async function releaseClaim(
  claimId: string,
  credential: DemoCredential
): Promise<ApiResult<ClaimResponse>> {
  return requestWithFallback<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/release`,
    { method: "POST" },
    credential,
    () => fixtureReleaseClaim(claimId)
  );
}

export async function pickupClaim(
  claimId: string,
  credential: DemoCredential
): Promise<ApiResult<ClaimResponse>> {
  return requestWithFallback<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/pickup`,
    { method: "POST" },
    credential,
    () => fixturePickupClaim(claimId)
  );
}

export async function getDispatchView(
  dropId: string,
  credential: DemoCredential = "demo-projector"
): Promise<ApiResult<DispatchResponse>> {
  return requestWithFallback<DispatchResponse>(
    `/drops/${encodeURIComponent(dropId)}/dispatch`,
    { method: "GET" },
    credential,
    () => fixtureGetDispatch(dropId)
  );
}

export async function updateMyPreferences(
  prefs: Preferences,
  credential: DemoCredential
): Promise<ApiResult<Preferences>> {
  return requestWithFallback<Preferences>(
    "/students/me/preferences",
    { method: "PUT", body: JSON.stringify(prefs) },
    credential,
    () => fixtureUpdatePreferences(credential, prefs)
  );
}

export async function checkInPresence(
  req: PresenceRequest,
  credential: DemoCredential
): Promise<ApiResult<PresenceResponse>> {
  return requestWithFallback<PresenceResponse>(
    "/students/me/presence",
    { method: "POST", body: JSON.stringify(req) },
    credential,
    () => fixtureUpdatePresence(credential, req)
  );
}

export async function registerPushToken(
  req: PushTokenRequest,
  credential: DemoCredential
): Promise<ApiResult<PushTokenResponse>> {
  return requestWithFallback<PushTokenResponse>(
    "/students/me/push-token",
    { method: "POST", body: JSON.stringify(req) },
    credential,
    () => fixtureRegisterPushToken(credential, req)
  );
}

export async function resetDemoState(
  credential: DemoCredential = "demo-host"
): Promise<ApiResult<DemoResetResponse>> {
  return requestWithFallback<DemoResetResponse>(
    "/demo/reset",
    { method: "POST" },
    credential,
    () => fixtureDemoReset()
  );
}

export async function advanceDemoClock(
  advanceSeconds = 60,
  credential: DemoCredential = "demo-host"
): Promise<ApiResult<DemoTickResponse>> {
  const payload: DemoTick = { advance_seconds: advanceSeconds };
  return requestWithFallback<DemoTickResponse>(
    "/demo/tick",
    { method: "POST", body: JSON.stringify(payload) },
    credential,
    () => fixtureDemoTick(payload)
  );
}
