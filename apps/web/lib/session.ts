import { SEEDED_PERSONA_TOKENS, type SeededPersonaLabel } from "./types/api";

/**
 * Visitor session token persistence and 401 session-expiry helpers.
 * Per docs/API_CONTRACT.md (Revamp contract v2):
 * - Visitor tokens are stored in localStorage under `owl-plate.session`.
 * - Unknown, revoked, or pre-reset tokens return 401 unauthorized ("Session ended. Join again.").
 * - Clients clear the stored token and return to Join on any 401.
 * - Seeded tokens `demo-student-A`..`E` still work via `/student?persona=A`..`E` for presenter rehearsal.
 */

export const SESSION_STORAGE_KEY = "owl-plate.session";
export const SESSION_ENDED_MESSAGE = "Session ended. Join again.";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(explicitStorage?: StorageLike | null): StorageLike | null {
  if (explicitStorage !== undefined) {
    return explicitStorage;
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Read the current visitor session token from localStorage, or null if absent.
 */
export function getSessionToken(storage?: StorageLike | null): string | null {
  const s = getStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Save a newly issued visitor session token to localStorage `owl-plate.session`.
 */
export function setSessionToken(
  token: string,
  storage?: StorageLike | null,
): void {
  const s = getStorage(storage);
  if (!s) return;
  try {
    const trimmed = token.trim();
    if (!trimmed) {
      s.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    s.setItem(SESSION_STORAGE_KEY, trimmed);
  } catch {
    // Ignore storage quota or private-browsing failures
  }
}

/**
 * Remove the visitor session token from localStorage.
 */
export function clearSessionToken(storage?: StorageLike | null): void {
  const s = getStorage(storage);
  if (!s) return;
  try {
    s.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

/**
 * Return true when a non-empty visitor session token exists in localStorage.
 */
export function hasSessionToken(storage?: StorageLike | null): boolean {
  return getSessionToken(storage) !== null;
}

/**
 * Resolve a rehearsal query parameter (`?persona=A`..`E`) into its synthetic credential.
 */
export function parseSeededPersonaParam(
  param: string | null | undefined,
): { label: SeededPersonaLabel; token: string } | null {
  if (!param) return null;
  const normalized = param.trim().toUpperCase();
  if (
    normalized === "A" ||
    normalized === "B" ||
    normalized === "C" ||
    normalized === "D" ||
    normalized === "E"
  ) {
    return {
      label: normalized,
      token: SEEDED_PERSONA_TOKENS[normalized],
    };
  }
  return null;
}

/**
 * Determine whether an error represents a 401 unauthorized response, and if so,
 * clear the stored visitor session token and return the contract redirect path.
 */
export function handleUnauthorizedError(
  err: unknown,
  storage?: StorageLike | null,
): { isUnauthorized: boolean; redirectTo: string; message: string } {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (status === 401 || code === "unauthorized") {
    clearSessionToken(storage);
    return {
      isUnauthorized: true,
      redirectTo: `/join?reason=session_ended`,
      message: SESSION_ENDED_MESSAGE,
    };
  }

  return {
    isUnauthorized: false,
    redirectTo: "/join",
    message:
      err instanceof Error && err.message ? err.message : "Request failed.",
  };
}
