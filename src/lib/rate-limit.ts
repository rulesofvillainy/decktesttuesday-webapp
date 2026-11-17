import { NextRequest } from 'next/server';

interface IpAttemptRecord {
  failures: number[];
  requests: number[];
  lockedUntil: number;
  lastSeen: number;
}

interface AuthRateLimitStore {
  byIp: Map<string, IpAttemptRecord>;
  globalFailures: number[];
  globalLockedUntil: number;
}

interface SubmissionRateLimitStore {
  byIp: Map<string, { submissions: number[]; requests: number[]; lastSeen: number }>;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BURST_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_FAILURES_PER_IP = 5;
const IP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_GLOBAL_FAILURES = 25;
const GLOBAL_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const MAX_TRACKED_IPS = 2000;

declare global {
  var __dttAuthRateLimitStore: AuthRateLimitStore | undefined;
  var __dttSubmissionRateLimitStore: SubmissionRateLimitStore | undefined;
}

function getStore(): AuthRateLimitStore {
  if (!globalThis.__dttAuthRateLimitStore) {
    globalThis.__dttAuthRateLimitStore = {
      byIp: new Map(),
      globalFailures: [],
      globalLockedUntil: 0,
    };
  }
  return globalThis.__dttAuthRateLimitStore;
}

function getSubmissionStore(): SubmissionRateLimitStore {
  if (!globalThis.__dttSubmissionRateLimitStore) {
    globalThis.__dttSubmissionRateLimitStore = {
      byIp: new Map(),
    };
  }
  return globalThis.__dttSubmissionRateLimitStore;
}

/**
 * Extracts the best available client IP address from proxy headers.
 * Prefers proxy-overwritten headers (CF-Connecting-IP, X-Real-IP), then falls back
 * to the rightmost X-Forwarded-For entry appended by the immediate reverse proxy.
 */
export function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return 'unknown';
}

function pruneTimestamps(list: number[], cutoff: number): number[] {
  return list.filter((ts) => ts > cutoff);
}

function evictStaleIps(store: AuthRateLimitStore, now: number): void {
  if (store.byIp.size < MAX_TRACKED_IPS) return;

  const failureCutoff = now - WINDOW_MS;
  const burstCutoff = now - BURST_WINDOW_MS;

  for (const [ip, rec] of store.byIp.entries()) {
    const hasActiveLock = rec.lockedUntil > now;
    const hasRecentFailure = rec.failures.some((t) => t > failureCutoff);
    const hasRecentReq = rec.requests.some((t) => t > burstCutoff);
    if (!hasActiveLock && !hasRecentFailure && !hasRecentReq) {
      store.byIp.delete(ip);
    }
  }

  // If still above capacity under flood, evict oldest entries
  while (store.byIp.size >= MAX_TRACKED_IPS) {
    let oldestIp: string | null = null;
    let oldestTime = Infinity;
    for (const [ip, rec] of store.byIp.entries()) {
      if (rec.lastSeen < oldestTime) {
        oldestTime = rec.lastSeen;
        oldestIp = ip;
      }
    }
    if (!oldestIp) break;
    store.byIp.delete(oldestIp);
  }
}

export function formatRetryWait(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason?: string;
}

/**
 * Checks whether a login request from `ip` is permitted right now,
 * and records the incoming request timestamp against the per-minute burst cap.
 */
export function checkAdminLoginRateLimit(
  ip: string,
  now = Date.now()
): RateLimitCheckResult {
  const store = getStore();

  // 1. Global distributed brute-force circuit breaker
  if (store.globalLockedUntil > now) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((store.globalLockedUntil - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many failed login attempts. Try again in ${formatRetryWait(retryAfterSeconds)}.`,
    };
  }

  // 2. Per-IP lockout check
  let record = store.byIp.get(ip);
  if (record && record.lockedUntil > now) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.lockedUntil - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many failed login attempts. Try again in ${formatRetryWait(retryAfterSeconds)}.`,
    };
  }

  // 3. Per-IP request burst check
  if (!record) {
    evictStaleIps(store, now);
    record = { failures: [], requests: [], lockedUntil: 0, lastSeen: now };
    store.byIp.set(ip, record);
  }

  record.lastSeen = now;
  record.requests = pruneTimestamps(record.requests, now - BURST_WINDOW_MS);
  record.failures = pruneTimestamps(record.failures, now - WINDOW_MS);

  if (record.requests.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestInWindow = record.requests[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestInWindow + BURST_WINDOW_MS - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many login requests. Please wait ${formatRetryWait(retryAfterSeconds)}.`,
    };
  }

  record.requests.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Records a failed password attempt for `ip` and triggers lockout if thresholds are exceeded.
 */
export function recordAdminLoginFailure(
  ip: string,
  now = Date.now()
): { locked: boolean; retryAfterSeconds: number } {
  const store = getStore();

  let record = store.byIp.get(ip);
  if (!record) {
    evictStaleIps(store, now);
    record = { failures: [], requests: [], lockedUntil: 0, lastSeen: now };
    store.byIp.set(ip, record);
  }

  record.lastSeen = now;
  record.failures = pruneTimestamps(record.failures, now - WINDOW_MS);
  record.failures.push(now);

  store.globalFailures = pruneTimestamps(store.globalFailures, now - WINDOW_MS);
  store.globalFailures.push(now);

  let retryAfterSeconds = 0;
  let locked = false;

  if (record.failures.length >= MAX_FAILURES_PER_IP) {
    record.lockedUntil = Math.max(record.lockedUntil, now + IP_LOCKOUT_MS);
    locked = true;
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.ceil((record.lockedUntil - now) / 1000)
    );
  }

  if (store.globalFailures.length >= MAX_GLOBAL_FAILURES) {
    store.globalLockedUntil = Math.max(
      store.globalLockedUntil,
      now + GLOBAL_LOCKOUT_MS
    );
    locked = true;
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.ceil((store.globalLockedUntil - now) / 1000)
    );
  }

  return { locked, retryAfterSeconds };
}

/**
 * Clears failed-attempt state for `ip` after a successful login.
 */
export function clearAdminLoginFailures(ip: string): void {
  const store = getStore();
  store.byIp.delete(ip);
}

/**
 * Rate limits public deck submissions per IP to prevent queue spam and Lorcast API amplification.
 */
export function checkSubmissionRateLimit(
  ip: string,
  now = Date.now()
): RateLimitCheckResult {
  const store = getSubmissionStore();
  const windowCutoff = now - WINDOW_MS;
  const burstCutoff = now - BURST_WINDOW_MS;

  if (store.byIp.size >= MAX_TRACKED_IPS && !store.byIp.has(ip)) {
    for (const [k, rec] of store.byIp.entries()) {
      if (
        !rec.submissions.some((t) => t > windowCutoff) &&
        !rec.requests.some((t) => t > burstCutoff)
      ) {
        store.byIp.delete(k);
      }
    }
    while (store.byIp.size >= MAX_TRACKED_IPS) {
      const oldestKey = store.byIp.keys().next().value;
      if (!oldestKey) break;
      store.byIp.delete(oldestKey);
    }
  }

  let record = store.byIp.get(ip);
  if (!record) {
    record = { submissions: [], requests: [], lastSeen: now };
    store.byIp.set(ip, record);
  }

  record.lastSeen = now;
  record.requests = pruneTimestamps(record.requests, burstCutoff);
  record.submissions = pruneTimestamps(record.submissions, windowCutoff);

  if (record.requests.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldest = record.requests[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + BURST_WINDOW_MS - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Too many requests. Please wait ${formatRetryWait(retryAfterSeconds)}.`,
    };
  }

  if (record.submissions.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    const oldest = record.submissions[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + WINDOW_MS - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `Submission limit reached. Please wait ${formatRetryWait(retryAfterSeconds)} before submitting another deck.`,
    };
  }

  record.requests.push(now);
  record.submissions.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}
