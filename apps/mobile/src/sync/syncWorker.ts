import type { SQLiteDatabase } from '../db/types';
import { getDueBatch, markAttemptFailed, markSynced, type OutboxRow } from '../db/outbox';
import type { ApiClient } from '../api/client';
import type {
  ContactAttemptPayload,
  PhotoVerificationSubmitPayload,
} from '../api/types';
import { nextAttemptAt } from './backoff';

export interface DrainSummary {
  attempted: number;
  synced: number;
  failed: number;
}

export interface DrainOptions {
  now?: Date;
  contactAttemptBatchSize?: number;
  singleItemLimit?: number;
  random?: () => number; // injected for deterministic backoff in tests
}

/**
 * Drains the outbox: one full pass over everything currently due. Safe to call repeatedly
 * (on reconnect, on foreground, on a timer) — it only ever reads rows that are not yet
 * `synced_at` and whose backoff window has elapsed, and it never re-enqueues, so re-running
 * it after a partial failure cannot create duplicate outbox rows. Duplicate SERVER-side
 * writes are additionally prevented by `idempotencyKey`, which is stable across retries of
 * the same row (see docs/API_CONTRACT.md: batch responses report `"duplicate"` rather than
 * creating a second record).
 *
 * Must not be invoked concurrently with itself on the same db — the caller (SyncWorker
 * below) enforces that with a simple in-flight guard.
 */
export async function drainOnce(
  db: SQLiteDatabase,
  api: ApiClient,
  opts: DrainOptions = {}
): Promise<DrainSummary> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const summary: DrainSummary = { attempted: 0, synced: 0, failed: 0 };

  await drainContactAttemptBatch(db, api, nowIso, now, summary, opts);
  await drainSingleItemEntity(
    db,
    api,
    'photo_verification',
    nowIso,
    now,
    summary,
    opts,
    async (row) => {
      const payload = row.payload as unknown as PhotoVerificationSubmitPayload & {
        verificationId: string;
      };
      await api.submitPhotoVerification(payload.verificationId, payload);
    }
  );
  await drainSingleItemEntity(
    db,
    api,
    'access_report',
    nowIso,
    now,
    summary,
    opts,
    async (row) => {
      const payload = row.payload as {
        addressId: string;
        accessStatus: string;
        notes: string | null;
        idempotencyKey: string;
      };
      await api.postAccessReport(payload);
    }
  );

  return summary;
}

async function drainContactAttemptBatch(
  db: SQLiteDatabase,
  api: ApiClient,
  nowIso: string,
  now: Date,
  summary: DrainSummary,
  opts: DrainOptions
): Promise<void> {
  const limit = opts.contactAttemptBatchSize ?? 25;
  const rows = await getDueBatch(db, { entityType: 'contact_attempt', limit, now: nowIso });
  if (rows.length === 0) return;

  summary.attempted += rows.length;
  const byIdempotencyKey = new Map<string, OutboxRow>();
  for (const row of rows) byIdempotencyKey.set(row.idempotencyKey, row);

  try {
    const items = rows.map((r) => r.payload as unknown as ContactAttemptPayload);
    const response = await api.postContactAttemptsBatch(items);

    const seen = new Set<string>();
    for (const result of response.results) {
      seen.add(result.idempotencyKey);
      const row = byIdempotencyKey.get(result.idempotencyKey);
      if (!row) continue; // response referenced a key we didn't send; ignore defensively

      if (result.status === 'created' || result.status === 'duplicate') {
        await markSynced(db, row.id, nowIso);
        summary.synced += 1;
      } else {
        await failRow(db, row, now, opts, result.error ?? 'server rejected item');
        summary.failed += 1;
      }
    }

    // Any row the server didn't mention at all (shouldn't happen per contract, but the
    // contract explicitly warns "never fails the whole batch for one bad item" — so defend
    // against a short results array too) is treated as a retryable failure, not a success.
    for (const row of rows) {
      if (!seen.has(row.idempotencyKey)) {
        await failRow(db, row, now, opts, 'missing from batch response');
        summary.failed += 1;
      }
    }
  } catch (err) {
    // Whole request failed (offline, timeout, 5xx before a body was produced, etc). Every
    // row in this batch stays pending and gets its own backoff bump — none are marked synced,
    // none are duplicated, they just get picked up again on the next drain.
    for (const row of rows) {
      await failRow(db, row, now, opts, errorMessage(err));
      summary.failed += 1;
    }
  }
}

async function drainSingleItemEntity(
  db: SQLiteDatabase,
  api: ApiClient,
  entityType: 'photo_verification' | 'access_report',
  nowIso: string,
  now: Date,
  summary: DrainSummary,
  opts: DrainOptions,
  send: (row: OutboxRow) => Promise<void>
): Promise<void> {
  const limit = opts.singleItemLimit ?? 10;
  const rows = await getDueBatch(db, { entityType, limit, now: nowIso });

  for (const row of rows) {
    summary.attempted += 1;
    try {
      await send(row);
      await markSynced(db, row.id, nowIso);
      summary.synced += 1;
    } catch (err) {
      await failRow(db, row, now, opts, errorMessage(err));
      summary.failed += 1;
    }
  }
}

async function failRow(
  db: SQLiteDatabase,
  row: OutboxRow,
  now: Date,
  opts: DrainOptions,
  error: string
): Promise<void> {
  const attemptNumber = row.syncAttempts; // pre-increment value = number of PRIOR attempts
  await markAttemptFailed(db, row.id, {
    error,
    nextAttemptAt: nextAttemptAt(attemptNumber, now, { random: opts.random }),
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type SyncTrigger = 'reconnect' | 'foreground' | 'timer' | 'manual';

/**
 * Schedules drainOnce() from the three triggers the spec calls for (reconnect, foreground,
 * periodic timer), with a simple in-flight guard so overlapping triggers (e.g. reconnect and
 * the timer firing at once) never run two drains concurrently against the same db connection.
 * The actual OS-level wiring (NetInfo, AppState) lives in sync/triggers.ts, which is
 * intentionally thin and not unit-tested — this class holds all the logic that is.
 */
export class SyncWorker {
  private db: SQLiteDatabase;
  private api: ApiClient;
  private inFlight = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSummary: DrainSummary | null = null;

  constructor(db: SQLiteDatabase, api: ApiClient) {
    this.db = db;
    this.api = api;
  }

  getLastSummary(): DrainSummary | null {
    return this.lastSummary;
  }

  async trigger(_reason: SyncTrigger): Promise<DrainSummary | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    try {
      this.lastSummary = await drainOnce(this.db, this.api);
      return this.lastSummary;
    } finally {
      this.inFlight = false;
    }
  }

  startPeriodicTimer(intervalMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.trigger('timer');
    }, intervalMs);
  }

  stopPeriodicTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
