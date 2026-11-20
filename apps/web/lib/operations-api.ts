import { API_BASE_URL } from "./api-client";
import type { OperationsPeriod, OperationsResponse } from "./types/operations";

export class OperationsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OperationsApiError";
  }
}

/** Keep administrative analytics separate from host and student session credentials. */
async function operationsRequest(
  path: string,
  options: RequestInit,
): Promise<OperationsResponse> {
  const controller = new AbortController();
  const relay = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: "Bearer demo-projector",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      let code = "operations_unavailable";
      let message = "The dashboard could not update. Please try again.";
      try {
        const payload = await response.json();
        if (typeof payload.detail?.code === "string")
          code = payload.detail.code;
        if (typeof payload.detail?.message === "string")
          message = payload.detail.message;
      } catch {}
      throw new OperationsApiError(response.status, code, message);
    }
    return (await response.json()) as OperationsResponse;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", relay);
  }
}

/** Read persisted database metrics; network failures never become sample data. */
export function getOperations(
  period: OperationsPeriod = "7d",
  signal?: AbortSignal,
): Promise<OperationsResponse> {
  return operationsRequest(
    `/analytics/operations?period=${encodeURIComponent(period)}`,
    {
      method: "GET",
      signal,
    },
  );
}

/** This destructive demo action is called only after an explicit UI confirmation. */
export function loadRecordingDataset(): Promise<OperationsResponse> {
  return operationsRequest("/demo/recording-dataset", {
    method: "POST",
    body: JSON.stringify({ confirm_reset: true }),
  });
}
