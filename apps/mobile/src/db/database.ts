import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from './types';
import { runMigrations } from './schema';

const DB_NAME = 'canvasser.db';

let singleton: Promise<SQLiteDatabase> | null = null;

/**
 * Opens (once) and migrates the on-device SQLite database, wrapping expo-sqlite's handle in
 * our own `SQLiteDatabase` interface (see adaptExpoSqlite below). Callers should always go
 * through this function (not `SQLite.openDatabaseAsync` directly) so the whole app shares one
 * connection and one set of migrations.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!singleton) {
    singleton = (async () => {
      const native = await SQLite.openDatabaseAsync(DB_NAME);
      const adapted = adaptExpoSqlite(native);
      await runMigrations(adapted);
      return adapted;
    })();
  }
  return singleton;
}

/**
 * Explicit adapter (rather than relying on structural typing) because expo-sqlite's
 * `runAsync`/`getAllAsync`/`getFirstAsync` overloads make `params` non-optional in a way
 * that doesn't structurally match our simpler always-optional-params interface, even though
 * the runtime behavior is compatible. Wrapping avoids `as unknown as` casts elsewhere.
 */
function adaptExpoSqlite(native: SQLite.SQLiteDatabase): SQLiteDatabase {
  return {
    execAsync: (sql) => native.execAsync(sql),
    runAsync: (sql, params = []) => native.runAsync(sql, params),
    getAllAsync: (sql, params = []) => native.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => native.getFirstAsync(sql, params),
  };
}

/** Test/dev only: forces the next getDatabase() call to re-open. */
export function _resetDatabaseSingletonForTests(): void {
  singleton = null;
}
