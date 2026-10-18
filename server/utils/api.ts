import { createError, defineEventHandler, type EventHandlerRequest, type H3Event, setResponseHeader } from "h3";
import { ServiceError } from "../services/errors";

/** An API route whose ServiceErrors become proper HTTP errors, with the error code in `data.code`. */
export function defineApiHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof ServiceError) {
        throw createError({ statusCode: error.status, statusMessage: error.message, data: { code: error.code } });
      }
      throw error;
    }
  });
}

interface Window {
  start: number;
  count: number;
}

const windows = new Map<string, Window>();

/**
 * A fixed-window rate limit, kept in memory. That's enough for one server
 * process; several instances would need a shared store such as Redis.
 */
export function checkRateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
  }
  let window = windows.get(key);
  if (!window || now - window.start >= windowMs) {
    window = { start: now, count: 0 };
    windows.set(key, window);
  }
  window.count++;
  return { ok: window.count <= max, retryAfterMs: window.start + windowMs - now };
}

export function enforceRateLimit(event: H3Event, key: string, max: number, windowMs: number): void {
  const { ok, retryAfterMs } = checkRateLimit(key, max, windowMs);
  if (ok) return;
  setResponseHeader(event, "Retry-After", Math.ceil(retryAfterMs / 1000));
  throw createError({ statusCode: 429, statusMessage: "Too many moves. Take a breath.", data: { code: "rate-limited" } });
}
