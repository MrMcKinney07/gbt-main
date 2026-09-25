import type { SQLiteDatabase } from './types';

/**
 * Local SQLite schema. Two families of tables:
 *
 *  1. `outbox` — the offline write queue. Every user-initiated write (contact attempt,
 *     photo verification submission, access report) is inserted here FIRST, synchronously
 *     with the UI update, before any network call is attempted. See src/sync/syncWorker.ts
 *     for the drain logic and docs/API_CONTRACT.md for the shapes each entity_type targets.
 *
 *  2. Local mirrors (`walkbooks`, `addresses`, `households`, `voters`, `shift_state`) — a
 *     simplified, denormalized subset of the server schema, just enough to drive the door
 *     screen while offline. These are populated by a (stubbed) pull-sync and are read-mostly
 *     from the UI's perspective; `addresses.access_status` is the one field the canvasser can
 *     write locally (the access banner), and that write also goes through the outbox as an
 *     'access_report' entity so it reaches the server.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    synced_at TEXT,
    sync_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox (synced_at, next_attempt_at)`,

  `CREATE TABLE IF NOT EXISTS walkbooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    turf_name TEXT,
    door_count INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    walkbook_id TEXT NOT NULL,
    line1 TEXT NOT NULL,
    unit TEXT,
    lat REAL,
    lng REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    access_status TEXT NOT NULL DEFAULT 'none',
    access_notes TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    address_id TEXT NOT NULL,
    display_name TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS voters (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_target INTEGER NOT NULL DEFAULT 0
  )`,

  // Single-row table holding the active shift, if any. `id` is always 1.
  `CREATE TABLE IF NOT EXISTS shift_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shift_id TEXT,
    campaign_id TEXT,
    device_id TEXT,
    actual_start TEXT,
    photo_interval_profile_id TEXT,
    doors_since_shift_start INTEGER NOT NULL DEFAULT 0
  )`,
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = OFF');
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execAsync(statement);
  }
}
