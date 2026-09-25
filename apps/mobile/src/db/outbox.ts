import type { SQLiteDatabase } from './types';
import { uuidv4 } from '../utils/uuid';

/**
 * The three write shapes that flow through the offline outbox. Every entry maps to one
 * endpoint in docs/API_CONTRACT.md:
 *  - 'contact_attempt'    -> POST /contact-attempts/batch (drained in batches)
 *  - 'photo_verification' -> POST /photo-verification/:id/submit (not batchable per contract)
 *  - 'access_report'      -> a local access-status change the canvasser records on a door;
 *                            not in API_CONTRACT.md as its own endpoint, so per that doc's own
 *                            "make the reasonable call and note it" rule this scaffold syncs
 *                            it to a stub `POST /access-reports` endpoint. See README.
 */
export type OutboxEntityType = 'contact_attempt' | 'photo_verification' | 'access_report';

export interface OutboxRow {
  id: string;
  entityType: OutboxEntityType;
  endpoint: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
  syncedAt: string | null;
  syncAttempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
}

interface OutboxRawRow {
  id: string;
  entity_type: string;
  endpoint: string;
  payload_json: string;
  idempotency_key: string;
  created_at: string;
  synced_at: string | null;
  sync_attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
}

function fromRaw(row: OutboxRawRow): OutboxRow {
  return {
    id: row.id,
    entityType: row.entity_type as OutboxEntityType,
    endpoint: row.endpoint,
    payload: JSON.parse(row.payload_json),
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
  };
}

export interface EnqueueInput {
  entityType: OutboxEntityType;
  endpoint: string;
  payload: Record<string, unknown>;
  /** Injectable for tests; defaults to a fresh uuid. Also doubles as the outbox row id. */
  id?: string;
  /** Injectable for tests; defaults to a fresh uuid. Sent to the server for dedup. */
  idempotencyKey?: string;
  /** Injectable clock for tests; defaults to now. */
  createdAt?: string;
}

/**
 * Writes one entry to the outbox. This is the ONLY way app code should record a pending
 * write — callers insert here first, then update in-memory/UI state immediately. Nothing
 * in this function makes a network call.
 *
 * Idempotent by construction against accidental double-submits: if the same `id` is
 * enqueued twice (e.g. a caller retries after a UI hiccup, or a restart replays a not-yet-
 * acknowledged local action), this is an INSERT OR IGNORE — the second call is a no-op
 * rather than a duplicate row.
 */
export async function enqueue(db: SQLiteDatabase, input: EnqueueInput): Promise<OutboxRow> {
  const id = input.id ?? uuidv4();
  const idempotencyKey = input.idempotencyKey ?? uuidv4();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await db.runAsync(
    `INSERT OR IGNORE INTO outbox
      (id, entity_type, endpoint, payload_json, idempotency_key, created_at, synced_at, sync_attempts, last_error, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`,
    [id, input.entityType, input.endpoint, JSON.stringify(input.payload), idempotencyKey, createdAt]
  );

  const row = await db.getFirstAsync<OutboxRawRow>('SELECT * FROM outbox WHERE id = ?', [id]);
  if (!row) {
    throw new Error(`enqueue: failed to read back outbox row ${id}`);
  }
  return fromRaw(row);
}

/**
 * Rows that are not yet synced and are due for another attempt (never attempted, or their
 * backoff window has elapsed). Ordered oldest-first so a long-offline canvasser's early
 * doors sync before their later ones.
 */
export async function getDueBatch(
  db: SQLiteDatabase,
  opts: { entityType?: OutboxEntityType; limit?: number; now?: string } = {}
): Promise<OutboxRow[]> {
  const now = opts.now ?? new Date().toISOString();
  const limit = opts.limit ?? 25;
  const params: (string | number)[] = [now];
  let sql = `SELECT * FROM outbox
    WHERE synced_at IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`;
  if (opts.entityType) {
    sql += ' AND entity_type = ?';
    params.push(opts.entityType);
  }
  sql += ' ORDER BY created_at ASC LIMIT ?';
  params.push(limit);

  const rows = await db.getAllAsync<OutboxRawRow>(sql, params);
  return rows.map(fromRaw);
}

export async function markSynced(db: SQLiteDatabase, id: string, syncedAt?: string): Promise<void> {
  await db.runAsync('UPDATE outbox SET synced_at = ?, last_error = NULL WHERE id = ?', [
    syncedAt ?? new Date().toISOString(),
    id,
  ]);
}

export async function markAttemptFailed(
  db: SQLiteDatabase,
  id: string,
  opts: { error: string; nextAttemptAt: string }
): Promise<void> {
  await db.runAsync(
    `UPDATE outbox
       SET sync_attempts = sync_attempts + 1, last_error = ?, next_attempt_at = ?
     WHERE id = ?`,
    [opts.error, opts.nextAttemptAt, id]
  );
}

export async function countPending(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM outbox WHERE synced_at IS NULL'
  );
  return row?.n ?? 0;
}

export async function getAll(db: SQLiteDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAllAsync<OutboxRawRow>('SELECT * FROM outbox ORDER BY created_at ASC');
  return rows.map(fromRaw);
}
