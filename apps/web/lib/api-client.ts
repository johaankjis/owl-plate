/**
 * HTTP Client for Owl Plate frozen milestone contract v1 + Revamp contract v2.
 *
 * Uses NEXT_PUBLIC_API_URL (defaults to http://localhost:8017).
 * Sends explicit synthetic Bearer credential or visitor session token in demo mode:
 *   Authorization: Bearer demo-host | demo-projector | demo-student-A..E | demo-session-...
 *
 * API is the default. Standalone UI fixtures require explicit build-time opt-in.
 * Network errors and failed mutations never become synthetic successes.
 */

import type {
  AuthToken,
  BuildingsResponse,
  CampusDistributionResponse,
  ClaimResponse,
  DemoActiveDropResponse,
  DemoAreasResponse,
  DemoCredential,
  DemoResetRequest,
  DemoResetResponse,
  DemoStatusResponse,
  DemoTick,
  DemoTickResponse,
  DispatchResponse,
  DropEdit,
  DropResponse,
  ErrorDetail,
  FeedResponse,
  InviteResponse,
  InvitesResponse,
  JoinRequest,
  JoinResponse,
  Preferences,
  PresenceRequest,
  PresenceResponse,
  PushTokenRequest,
  PushTokenResponse,
  SessionLeftResponse,
  SessionStudent,
} from "./types/api";
import {
  fixtureClaimInvite,
  fixtureCreateDrop,
  fixtureDeclineInvite,
  fixtureDemoReset,
  fixtureDemoTick,
  fixtureGetBuildings,
  fixtureGetDemoAreas,
  fixtureGetDemoStatus,
  fixtureGetDispatch,
  fixtureGetDistribution,
  fixtureGetDrop,
  fixtureGetMyFeed,
  fixtureGetMyInvites,
  fixtureGetMySession,
  fixtureJoinSession,
  fixtureLeaveSession,
  fixturePickupClaim,
  fixturePublishDrop,
  fixtureRegisterPushToken,
  fixtureReleaseClaim,
  fixtureReserveDrop,
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

function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
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

function normalizeFixtureError(err: unknown): ApiContractError {
  if (err instanceof ApiContractError) {
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
    return new ApiContractError(
      typed.status,
      typed.code,
      typed.message || "Fixture error",
    );
  }
  return new ApiContractError(
    400,
    "fixture_error",
    err instanceof Error ? err.message : "Fixture error",
  );
}

async function request<T>(
  path: string,
  options: RequestInit,
  credential: AuthToken | null,
  fixtureFn: () => T,
  timeoutMs = 15000,
): Promise<ApiResult<T>> {
  if (UI_FIXTURE_MODE) {
    try {
      return { data: fixtureFn(), source: "offline_fixture" };
    } catch (err) {
      throw normalizeFixtureError(err);
    }
  }
  const headers = new Headers(options.headers);
  if (credential) {
    headers.set("Authorization", `Bearer ${credential}`);
  }
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
    const res = await fetch(buildApiUrl(path), {
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

export async function getBuildings(): Promise<ApiResult<BuildingsResponse>> {
  return request<BuildingsResponse>("/buildings", { method: "GET" }, null, () =>
    fixtureGetBuildings(),
  );
}

export async function getDemoAreas(): Promise<ApiResult<DemoAreasResponse>> {
  return request<DemoAreasResponse>(
    "/demo/areas",
    { method: "GET" },
    null,
    () => fixtureGetDemoAreas(),
  );
}

export async function joinDemoSession(
  req: JoinRequest,
): Promise<ApiResult<JoinResponse>> {
  return request<JoinResponse>(
    "/sessions",
    { method: "POST", body: JSON.stringify(req) },
    null,
    () => fixtureJoinSession(req),
  );
}

export async function getMySession(
  credential: AuthToken,
): Promise<ApiResult<SessionStudent>> {
  return request<SessionStudent>(
    "/sessions/me",
    { method: "GET" },
    credential,
    () => fixtureGetMySession(credential),
  );
}

export async function leaveDemoSession(
  credential: AuthToken,
): Promise<ApiResult<SessionLeftResponse>> {
  return request<SessionLeftResponse>(
    "/sessions/me",
    { method: "DELETE" },
    credential,
    () => fixtureLeaveSession(credential),
  );
}

export async function getDemoStatus(
  credential: DemoCredential = "demo-projector",
): Promise<ApiResult<DemoStatusResponse>> {
  return request<DemoStatusResponse>(
    "/demo/status",
    { method: "GET" },
    credential,
    () => fixtureGetDemoStatus(),
  );
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

  return request<DropResponse>(
    "/drops",
    { method: "POST", body: form },
    credential,
    () => fixtureCreateDrop(hostNote),
    65000,
  );
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
  return request<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}/publish`,
    { method: "POST" },
    credential,
    () => fixturePublishDrop(dropId),
  );
}

export async function getDrop(
  dropId: string,
  credential: AuthToken,
): Promise<ApiResult<DropResponse>> {
  return request<DropResponse>(
    `/drops/${encodeURIComponent(dropId)}`,
    { method: "GET" },
    credential,
    () => fixtureGetDrop(dropId),
  );
}

export async function getMyInvites(
  credential: AuthToken,
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
  credential: AuthToken,
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
  credential: AuthToken,
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
  credential: AuthToken,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/release`,
    { method: "POST" },
    credential,
    () => fixtureReleaseClaim(claimId, credential),
  );
}

export async function pickupClaim(
  claimId: string,
  credential: AuthToken,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/claims/${encodeURIComponent(claimId)}/pickup`,
    { method: "POST" },
    credential,
    () => fixturePickupClaim(claimId, credential),
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
  credential: AuthToken,
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
  credential: AuthToken,
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
  credential: AuthToken,
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
  req?: DemoResetRequest,
): Promise<ApiResult<DemoResetResponse>> {
  return request<DemoResetResponse>(
    "/demo/reset",
    {
      method: "POST",
      ...(req ? { body: JSON.stringify(req) } : {}),
    },
    credential,
    () => fixtureDemoReset(req),
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

export async function getMyFeed(
  credential: AuthToken,
): Promise<ApiResult<FeedResponse>> {
  return request<FeedResponse>(
    "/students/me/feed",
    { method: "GET" },
    credential,
    () => fixtureGetMyFeed(credential),
  );
}

export async function reserveDrop(
  dropId: string,
  credential: AuthToken,
): Promise<ApiResult<ClaimResponse>> {
  return request<ClaimResponse>(
    `/drops/${encodeURIComponent(dropId)}/reserve`,
    { method: "POST" },
    credential,
    () => fixtureReserveDrop(dropId, credential),
  );
}

export async function getDistribution(
  credential: DemoCredential = "demo-projector",
): Promise<ApiResult<CampusDistributionResponse>> {
  return request<CampusDistributionResponse>(
    "/distribution",
    { method: "GET" },
    credential,
    () => fixtureGetDistribution(),
  );
}
