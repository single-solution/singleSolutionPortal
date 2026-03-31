interface RateBucket { count: number; resetAt: number }

const resetAttempts = new Map<string, RateBucket>();
const loginAttempts = new Map<string, RateBucket>();

const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX = 5;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function getKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

function isBlocked(store: Map<string, RateBucket>, key: string, max: number): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) { store.delete(key); return false; }
  return entry.count >= max;
}

function record(store: Map<string, RateBucket>, key: string, windowMs: number): void {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    store.set(key, { count: 1, resetAt: Date.now() + windowMs });
  } else {
    entry.count++;
  }
}

export function isResetBlocked(headers: Headers): boolean {
  return isBlocked(resetAttempts, getKey(headers), RESET_MAX);
}

export function recordResetAttempt(headers: Headers): void {
  record(resetAttempts, getKey(headers), RESET_WINDOW_MS);
}

export function isLoginBlocked(ip: string): boolean {
  return isBlocked(loginAttempts, ip, LOGIN_MAX);
}

export function recordLoginAttempt(ip: string): void {
  record(loginAttempts, ip, LOGIN_WINDOW_MS);
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}
