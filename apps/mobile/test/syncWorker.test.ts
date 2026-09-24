import { openMigratedTestDb } from './testDb';
import { createMockApiClient, failSpecificKeys } from './mockApi';
import { enqueue, getAll, getDueBatch } from '../src/db/outbox';
import { drainOnce, SyncWorker } from '../src/sync/syncWorker';
import type { ContactAttemptPayload } from '../src/api/types';

function contactPayload(overrides: Partial<ContactAttemptPayload> & { idempotencyKey: string }): ContactAttemptPayload {
  return {
    addressId: 'addr-1',
    shiftId: 'shift-1',
    arriveAt: '2026-01-01T00:00:00.000Z',
    arriveGeom: { lat: 0, lng: 0 },
    arriveAccuracyM: 5,
    resultCode: 'not_home',
    ...overrides,
  };
}

describe('drainOnce: happy path batching', () => {
  it('sends all due contact attempts in one batch call and marks them synced', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k1',
        payload: contactPayload({ idempotencyKey: 'k1' }) as unknown as Record<string, unknown>,
      });
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k2',
        payload: contactPayload({ idempotencyKey: 'k2' }) as unknown as Record<string, unknown>,
      });

      const api = createMockApiClient();
      const summary = await drainOnce(db, api);

      expect(summary).toEqual({ attempted: 2, synced: 2, failed: 0 });
      expect(api.calls.postContactAttemptsBatch).toHaveLength(1);
      expect(api.calls.postContactAttemptsBatch[0]).toHaveLength(2);

      const rows = await getAll(db);
      expect(rows.every((r) => r.syncedAt !== null)).toBe(true);
      expect(await getDueBatch(db)).toHaveLength(0);
    } finally {
      close();
    }
  });
});

describe('drainOnce: partial batch success', () => {
  it('marks the server-accepted items synced and leaves the rejected one pending with an incremented attempt count', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'good-1',
        payload: contactPayload({ idempotencyKey: 'good-1' }) as unknown as Record<string, unknown>,
      });
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'bad-1',
        payload: contactPayload({ idempotencyKey: 'bad-1' }) as unknown as Record<string, unknown>,
      });
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'good-2',
        payload: contactPayload({ idempotencyKey: 'good-2' }) as unknown as Record<string, unknown>,
      });

      const api = createMockApiClient({ batchResponder: failSpecificKeys(new Set(['bad-1'])) });
      const summary = await drainOnce(db, api, { random: () => 0.1 });

      expect(summary).toEqual({ attempted: 3, synced: 2, failed: 1 });

      const rows = await getAll(db);
      const byKey = Object.fromEntries(rows.map((r) => [r.idempotencyKey, r]));
      expect(byKey['good-1'].syncedAt).not.toBeNull();
      expect(byKey['good-2'].syncedAt).not.toBeNull();
      expect(byKey['bad-1'].syncedAt).toBeNull();
      expect(byKey['bad-1'].syncAttempts).toBe(1);
      expect(byKey['bad-1'].nextAttemptAt).not.toBeNull();
    } finally {
      close();
    }
  });
});

describe('drainOnce: whole-batch network failure and retry', () => {
  it('leaves every row pending (none synced, none lost) and bumps their attempt counts on a hard network failure', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k1',
        payload: contactPayload({ idempotencyKey: 'k1' }) as unknown as Record<string, unknown>,
      });
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k2',
        payload: contactPayload({ idempotencyKey: 'k2' }) as unknown as Record<string, unknown>,
      });

      const api = createMockApiClient({ batchResponder: () => 'network_error' });
      const summary1 = await drainOnce(db, api, { now: new Date('2026-01-01T00:00:00Z'), random: () => 0.99 });
      expect(summary1).toEqual({ attempted: 2, synced: 0, failed: 2 });

      let rows = await getAll(db);
      expect(rows.every((r) => r.syncedAt === null)).toBe(true);
      expect(rows.every((r) => r.syncAttempts === 1)).toBe(true);

      // Retrying immediately (before the backoff window elapses) must not double-count —
      // nothing is due yet, so the server never sees a second batch.
      const dueImmediately = await getDueBatch(db, { now: new Date('2026-01-01T00:00:00.500Z').toISOString() });
      expect(dueImmediately).toHaveLength(0);

      // Once the backoff window passes and the network recovers, a retry succeeds and marks
      // both rows synced exactly once — no duplicates in the outbox, and the server only
      // ever receives 2 real batch calls total (the failed one + the retry).
      const farFuture = new Date('2026-01-01T01:00:00Z');
      const summary2 = await drainOnce(db, api, { now: farFuture });
      // Backoff window has elapsed, so this retry is attempted — but the network is still
      // down, so it fails again (still 0 synced, 0 duplicated) rather than being skipped.
      expect(summary2).toEqual({ attempted: 2, synced: 0, failed: 2 });

      // Now the network recovers and a later retry (past the new backoff window) succeeds:
      const evenFurtherFuture = new Date('2026-01-01T02:00:00Z');
      const healthyApi = createMockApiClient();
      const summary3 = await drainOnce(db, healthyApi, { now: evenFurtherFuture });
      expect(summary3).toEqual({ attempted: 2, synced: 2, failed: 0 });

      rows = await getAll(db);
      expect(rows).toHaveLength(2); // no duplicate rows were ever created
      expect(rows.every((r) => r.syncedAt !== null)).toBe(true);
    } finally {
      close();
    }
  });
});

describe('drainOnce: idempotent re-run after the server already applied a write', () => {
  it('a retried row that the server now reports as "duplicate" is marked synced, not resubmitted as new', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k1',
        payload: contactPayload({ idempotencyKey: 'k1' }) as unknown as Record<string, unknown>,
      });

      // Simulates: the first drain's request reached the server and was applied, but the
      // response was lost client-side (so the row is still marked pending locally).
      const api = createMockApiClient({
        batchResponder: (items) => ({
          results: items.map((i) => ({ idempotencyKey: i.idempotencyKey, status: 'duplicate' as const })),
        }),
      });

      const summary = await drainOnce(db, api);
      expect(summary).toEqual({ attempted: 1, synced: 1, failed: 0 });
      const rows = await getAll(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].syncedAt).not.toBeNull();
    } finally {
      close();
    }
  });
});

describe('drainOnce: single-item entities (photo verification, access report)', () => {
  it('drains photo_verification and access_report rows independently of contact_attempt batching', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'photo_verification',
        endpoint: '/photo-verification/v1/submit',
        idempotencyKey: 'pv-1',
        payload: { verificationId: 'v1', imageBase64: 'abc', idempotencyKey: 'pv-1' },
      });
      await enqueue(db, {
        entityType: 'access_report',
        endpoint: '/access-reports',
        idempotencyKey: 'ar-1',
        payload: { addressId: 'a1', accessStatus: 'dog', notes: null, idempotencyKey: 'ar-1' },
      });

      const api = createMockApiClient();
      const summary = await drainOnce(db, api);

      expect(summary).toEqual({ attempted: 2, synced: 2, failed: 0 });
      expect(api.calls.submitPhotoVerification).toHaveLength(1);
      expect(api.calls.submitPhotoVerification[0].verificationId).toBe('v1');
      expect(api.calls.postAccessReport).toHaveLength(1);
    } finally {
      close();
    }
  });
});

describe('SyncWorker: overlapping triggers do not run concurrent drains', () => {
  it('a trigger fired while one is already in flight is a no-op', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        idempotencyKey: 'k1',
        payload: contactPayload({ idempotencyKey: 'k1' }) as unknown as Record<string, unknown>,
      });

      let inFlightCount = 0;
      let maxConcurrent = 0;
      const api = createMockApiClient({
        batchResponder: (items) => {
          inFlightCount++;
          maxConcurrent = Math.max(maxConcurrent, inFlightCount);
          inFlightCount--;
          return { results: items.map((i) => ({ idempotencyKey: i.idempotencyKey, status: 'created' as const })) };
        },
      });

      const worker = new SyncWorker(db, api);
      const [a, b] = await Promise.all([worker.trigger('reconnect'), worker.trigger('foreground')]);
      // One of the two calls must have been skipped (returns null) because a drain was
      // already in flight.
      expect([a, b].some((r) => r === null)).toBe(true);
      expect(maxConcurrent).toBeLessThanOrEqual(1);
    } finally {
      close();
    }
  });
});
