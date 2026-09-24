// eslint-disable-next-line @typescript-eslint/no-var-requires
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteBindValue } from '../src/db/types';
import { runMigrations } from '../src/db/schema';

/**
 * Test-only SQLiteDatabase backed by Node's built-in `node:sqlite` — a REAL SQL engine, not a
 * hand-rolled fake, running the exact same schema.ts DDL the app ships. This is what lets
 * outbox.ts / syncWorker.ts be exercised in Jest with real SQL semantics (constraints,
 * uniqueness, ordering) without a device, emulator, or native build.
 *
 * `path` defaults to ':memory:'. Pass a real file path (see `withTempFileDb`) to simulate an
 * app restart by closing this connection and opening a fresh one against the same file.
 */
export function openTestDb(path = ':memory:'): { db: SQLiteDatabase; close: () => void } {
  const native = new DatabaseSync(path);

  const db: SQLiteDatabase = {
    execAsync: async (sql) => {
      native.exec(sql);
    },
    runAsync: async (sql, params: SQLiteBindValue[] = []) => {
      const stmt = native.prepare(sql);
      const info = stmt.run(...params);
      return { changes: Number(info.changes), lastInsertRowId: Number(info.lastInsertRowid) };
    },
    getAllAsync: async (sql, params: SQLiteBindValue[] = []) => {
      const stmt = native.prepare(sql);
      return stmt.all(...params) as any;
    },
    getFirstAsync: async (sql, params: SQLiteBindValue[] = []) => {
      const stmt = native.prepare(sql);
      const row = stmt.get(...params);
      return (row ?? null) as any;
    },
  };

  return { db, close: () => native.close() };
}

export async function openMigratedTestDb(
  path = ':memory:'
): Promise<{ db: SQLiteDatabase; close: () => void }> {
  const handle = openTestDb(path);
  await runMigrations(handle.db);
  return handle;
}
