/**
 * The minimal async SQLite surface our app code needs. `expo-sqlite`'s
 * `openDatabaseAsync()` result already satisfies this shape structurally, so the real
 * runtime adapter (`database.ts`) is a one-line passthrough.
 *
 * Test code implements this same interface on top of Node's built-in `node:sqlite`
 * (see test/testDb.ts), so outbox/sync logic runs against a REAL SQL engine in Jest —
 * not a hand-rolled fake — without needing a device, emulator, or native build.
 */
export type SQLiteBindValue = string | number | null;

export interface SQLiteRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SQLiteBindValue[]): Promise<SQLiteRunResult>;
  getAllAsync<T = Record<string, unknown>>(sql: string, params?: SQLiteBindValue[]): Promise<T[]>;
  getFirstAsync<T = Record<string, unknown>>(
    sql: string,
    params?: SQLiteBindValue[]
  ): Promise<T | null>;
}
