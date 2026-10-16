/**
 * Simple in-memory rate limiter for Mini's API routes.
 * 60 requests per minute per IP. Resets automatically.
 * Note: In serverless, each instance has its own counter.
 * For production, use Redis or Vercel KV for shared limits.
 */

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic cleanup
    if (store.size > 1000) {
      for (const [k, v] of store) {
        if (now >= v.resetAt) store.delete(k);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
