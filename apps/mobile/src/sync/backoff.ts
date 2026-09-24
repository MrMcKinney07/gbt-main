/**
 * Exponential backoff with full jitter (AWS-style: `random(0, min(cap, base * 2^attempt))`).
 * Pure and side-effect free so it's trivially unit-testable — `random` is injected instead
 * of calling Math.random() directly.
 */
export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  random?: () => number; // returns [0, 1)
}

const DEFAULT_BASE_MS = 5_000; // 5s
const DEFAULT_CAP_MS = 15 * 60_000; // 15 min

export function computeBackoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? DEFAULT_BASE_MS;
  const cap = opts.capMs ?? DEFAULT_CAP_MS;
  const random = opts.random ?? Math.random;
  const upperBound = Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
  return Math.floor(random() * upperBound);
}

export function nextAttemptAt(
  attempt: number,
  now: Date,
  opts: BackoffOptions = {}
): string {
  const delayMs = computeBackoffMs(attempt, opts);
  return new Date(now.getTime() + delayMs).toISOString();
}
