import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openMigratedTestDb, openTestDb } from './testDb';
import {
  countPending,
  enqueue,
  getAll,
  getDueBatch,
  markAttemptFailed,
  markSynced,
} from '../src/db/outbox';
import { runMigrations } from '../src/db/schema';

describe('outbox: enqueue + read back', () => {
  it('writes a row that is immediately readable, before any network call happens', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      const row = await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a1', resultCode: 'not_home' },
      });
      expect(row.id).toBeTruthy();
      expect(row.syncedAt).toBeNull();
      expect(row.syncAttempts).toBe(0);

      const all = await getAll(db);
      expect(all).toHaveLength(1);
      expect(all[0].payload).toEqual({ addressId: 'a1', resultCode: 'not_home' });
    } finally {
      close();
    }
  });

  it('enqueuing the same id twice does not create a duplicate row', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      await enqueue(db, {
        id: 'fixed-id',
        idempotencyKey: 'fixed-key',
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a1' },
      });
      await enqueue(db, {
        id: 'fixed-id',
        idempotencyKey: 'fixed-key',
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a1' },
      });

      const all = await getAll(db);
      expect(all).toHaveLength(1);
    } finally {
      close();
    }
  });
});

describe('outbox: getDueBatch backoff windowing', () => {
  it('excludes rows whose next_attempt_at is in the future, includes ones in the past', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const row = await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: {},
      });
      await markAttemptFailed(db, row.id, {
        error: 'boom',
        nextAttemptAt: new Date(now.getTime() + 60_000).toISOString(), // 1 min in the future
      });

      const dueTooSoon = await getDueBatch(db, { now: now.toISOString() });
      expect(dueTooSoon.map((r) => r.id)).not.toContain(row.id);

      const dueLater = await getDueBatch(db, { now: new Date(now.getTime() + 61_000).toISOString() });
      expect(dueLater.map((r) => r.id)).toContain(row.id);
    } finally {
      close();
    }
  });

  it('never returns a row already marked synced', async () => {
    const { db, close } = await openMigratedTestDb();
    try {
      const row = await enqueue(db, {
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: {},
      });
      await markSynced(db, row.id);
      const due = await getDueBatch(db);
      expect(due).toHaveLength(0);
      expect(await countPending(db)).toBe(0);
    } finally {
      close();
    }
  });
});

describe('outbox: survives an app restart with zero data loss and zero duplication', () => {
  it('rows written before a simulated restart are all present, unchanged, exactly once, after reopening the same on-disk db', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvasser-outbox-'));
    const dbPath = path.join(dir, 'restart-test.db');

    // --- "session 1": app runs, three doors get logged while offline ---
    {
      const { db, close } = openTestDb(dbPath);
      await runMigrations(db);
      await enqueue(db, {
        id: 'door-1',
        idempotencyKey: 'key-1',
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a1', resultCode: 'not_home' },
      });
      await enqueue(db, {
        id: 'door-2',
        idempotencyKey: 'key-2',
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a2', resultCode: 'spoke_with_target' },
      });
      await enqueue(db, {
        id: 'door-3',
        idempotencyKey: 'key-3',
        entityType: 'contact_attempt',
        endpoint: '/contact-attempts/batch',
        payload: { addressId: 'a3', resultCode: 'refused' },
      });
      // Force-quit simulation: no graceful shutdown call, just drop the connection.
      close();
    }

    // --- "session 2": app is relaunched; nothing has synced yet ---
    {
      const { db, close } = openTestDb(dbPath);
      await runMigrations(db); // migrations must be idempotent across restarts too
      const rows = await getAll(db);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.id).sort()).toEqual(['door-1', 'door-2', 'door-3']);
      expect(rows.every((r) => r.syncedAt === null)).toBe(true);

      // Simulate: door-1 and door-2 sync successfully after relaunch, door-3 fails.
      await markSynced(db, 'door-1');
      await markSynced(db, 'door-2');
      await markAttemptFailed(db, 'door-3', {
        error: 'timeout',
        nextAttemptAt: new Date(0).toISOString(),
      });
      close();
    }

    // --- "session 3": app relaunched again (e.g. after another force-quit mid-sync) ---
    {
      const { db, close } = openTestDb(dbPath);
      await runMigrations(db);
      const rows = await getAll(db);
      // Still exactly 3 rows — no duplication from re-running migrations or from the earlier
      // partial sync.
      expect(rows).toHaveLength(3);

      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId['door-1'].syncedAt).not.toBeNull();
      expect(byId['door-2'].syncedAt).not.toBeNull();
      expect(byId['door-3'].syncedAt).toBeNull();
      expect(byId['door-3'].syncAttempts).toBe(1);
      expect(byId['door-3'].lastError).toBe('timeout');

      // Only the still-pending row is due for another attempt.
      const due = await getDueBatch(db);
      expect(due.map((r) => r.id)).toEqual(['door-3']);

      close();
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
