import { computeBackoffMs, nextAttemptAt } from '../src/sync/backoff';

describe('computeBackoffMs', () => {
  it('grows exponentially with attempt number, capped', () => {
    const random = () => 0.999999; // pin jitter near the upper bound for a deterministic check
    const d0 = computeBackoffMs(0, { baseMs: 1000, capMs: 60_000, random });
    const d1 = computeBackoffMs(1, { baseMs: 1000, capMs: 60_000, random });
    const d2 = computeBackoffMs(2, { baseMs: 1000, capMs: 60_000, random });
    const d10 = computeBackoffMs(10, { baseMs: 1000, capMs: 60_000, random });

    expect(d0).toBeLessThan(d1);
    expect(d1).toBeLessThan(d2);
    expect(d10).toBeLessThanOrEqual(60_000);
  });

  it('applies jitter: two calls at the same attempt can differ', () => {
    let call = 0;
    const values = [0.1, 0.9];
    const random = () => values[call++ % values.length];
    const a = computeBackoffMs(3, { baseMs: 1000, capMs: 60_000, random });
    const b = computeBackoffMs(3, { baseMs: 1000, capMs: 60_000, random });
    expect(a).not.toBe(b);
  });

  it('never exceeds the cap even at very high attempt numbers', () => {
    const random = () => 1 - Number.EPSILON;
    const d = computeBackoffMs(50, { baseMs: 1000, capMs: 30_000, random });
    expect(d).toBeLessThanOrEqual(30_000);
  });

  it('nextAttemptAt returns an ISO timestamp strictly after now (for positive delay)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const random = () => 0.5;
    const at = nextAttemptAt(2, now, { baseMs: 1000, random });
    expect(new Date(at).getTime()).toBeGreaterThan(now.getTime());
  });
});
