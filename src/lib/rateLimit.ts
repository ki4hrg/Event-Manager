import { headers } from "next/headers";

// In-memory fixed-window rate limiter for the public endpoints. Prod runs one
// app container, so a process-local map is the whole picture; counters reset
// on a redeploy, which is acceptable. Callers compose the subject (an IP, an
// email, a form token) and pick a named rule below.

export type RateLimitRule = {
  // Key namespace, so the same subject counts separately per rule.
  name: string;
  limit: number;
  windowMs: number;
};

const HOUR = 60 * 60 * 1000;

export const PASSWORD_RESET_PER_IP: RateLimitRule = { name: "pwreset-ip", limit: 10, windowMs: HOUR };
export const PASSWORD_RESET_PER_EMAIL: RateLimitRule = { name: "pwreset-email", limit: 3, windowMs: HOUR };
export const OAUTH_REGISTER_PER_IP: RateLimitRule = { name: "oauth-register-ip", limit: 20, windowMs: HOUR };
// Save, submit and upload share these. One respondent needs a few saves, up
// to 10 uploads and a submit.
export const PUBLIC_FORM_PER_IP: RateLimitRule = { name: "form-ip", limit: 100, windowMs: HOUR };
export const PUBLIC_FORM_PER_TOKEN: RateLimitRule = { name: "form-token", limit: 300, windowMs: HOUR };

// Bounds on memory: entries held, and the stored length of a subject (an
// email field can carry a megabyte).
const MAX_ENTRIES = 10_000;
const MAX_SUBJECT_LENGTH = 200;
const SWEEP_INTERVAL_MS = 60 * 1000;

type Bucket = { count: number; resetAt: number };
type LimiterState = { buckets: Map<string, Bucket>; nextSweepAt: number };

// Survives HMR the way @/lib/prisma does, so dev reloads don't reset counts.
const globalForRateLimit = globalThis as unknown as { rateLimitState: LimiterState | undefined };
const state: LimiterState = (globalForRateLimit.rateLimitState ??= { buckets: new Map(), nextSweepAt: 0 });

// Drops expired buckets; past the cap, evicts the oldest windows (the map
// keeps insertion order, and a bucket is re-inserted when its window resets).
function prune(now: number) {
  state.buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) state.buckets.delete(key);
  });
  // Evict down to 90% so a flood doesn't re-scan the map on every request.
  const overflow = state.buckets.size - Math.floor(MAX_ENTRIES * 0.9);
  if (overflow > 0) {
    Array.from(state.buckets.keys())
      .slice(0, overflow)
      .forEach((key) => state.buckets.delete(key));
  }
  state.nextSweepAt = now + SWEEP_INTERVAL_MS;
}

// Counts one request against `rule` for `subject`. `retryAfterSeconds` is set
// when the request is refused.
export function rateLimit(rule: RateLimitRule, subject: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (now >= state.nextSweepAt || state.buckets.size >= MAX_ENTRIES) prune(now);

  const key = `${rule.name}:${subject.slice(0, MAX_SUBJECT_LENGTH)}`;
  const bucket = state.buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    state.buckets.delete(key);
    state.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= rule.limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// The client IP. Trusts the LAST x-forwarded-for entry: a reverse proxy
// appends the address it saw, so earlier entries are whatever the client
// sent. With no proxy, `next start` fills the header from the socket only
// when the client didn't send one. Unknown callers share one bucket.
export function clientIpFrom(h: Pick<Headers, "get">): string {
  const hops = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}

// clientIpFrom for Server Actions.
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
