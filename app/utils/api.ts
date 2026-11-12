import { ensureSession } from "./auth-client";

// Nitro's route-typed $fetch is too heavy for a generic path, so call it untyped.
const fetcher = $fetch as unknown as <T>(path: string, options: { method: string; body?: unknown }) => Promise<T>;

export interface ApiError {
  status?: number;
  code?: string;
  message: string;
}

/** Calls the API with the player's session, signing in again once if it has expired. */
export async function api<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  await ensureSession();
  const request = () => fetcher<T>(path, { method: options.method ?? "GET", body: options.body });
  try {
    return await request();
  } catch (error) {
    if (apiError(error).status !== 401) throw error;
    await ensureSession(true);
    return await request();
  }
}

/** An error from the browser backend, shaped like the server's errors. */
export class BackendError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.code = code;
  }
}

export function apiError(error: unknown): ApiError {
  if (error instanceof BackendError) return { status: error.status, code: error.code, message: error.message };
  const e = error as { status?: number; statusCode?: number; data?: { statusMessage?: string; message?: string; data?: { code?: string } } };
  const status = e?.status ?? e?.statusCode;
  const message = e?.data?.statusMessage ?? e?.data?.message ?? (status ? `Something went wrong (${status})` : "Can't reach the server");
  return { status, code: e?.data?.data?.code, message };
}
