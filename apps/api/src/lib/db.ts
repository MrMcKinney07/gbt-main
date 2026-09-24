import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

// The API connects as gbt_app (see db/README.md): full table privileges, no RLS bypass.
// Every campaign-scoped table's row-level-security policy checks
// campaign_id IN (SELECT id FROM campaigns WHERE org_id = app_current_org_id()), and
// app_current_org_id() reads the transaction-local `app.org_id` setting (0010_audit_log_and_rls.sql).
//
// That means RLS only protects a request if `app.org_id` is actually set, inside the same
// transaction, before any query runs. This module is the ONLY place that is allowed to open a
// database transaction for a request handler, specifically so that guarantee can't be
// accidentally skipped by a route author reaching for `pool.query` directly.
export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export type OrgTxClient = pg.PoolClient;

/**
 * Runs `fn` inside a transaction with `app.org_id` set via SET LOCAL (transaction-scoped, so
 * it can never leak into another request on a pooled connection). This is the shared helper
 * required by the build instructions instead of copy-pasting `SET LOCAL app.org_id` into every
 * route. Every mutating or reading route handler that touches campaign-scoped or org-scoped
 * tables must go through this (or `withSystemTx` for the rare unauthenticated path, e.g. login
 * itself, which looks up a user by email before an org_id is known).
 */
export async function withOrgTx<T>(orgId: string, fn: (client: OrgTxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config(..., true) is transaction-local, equivalent to SET LOCAL but parameterized
    // (SET LOCAL itself does not accept bind parameters, and string-interpolating an org_id
    // straight from a JWT claim into SQL text is exactly the kind of thing we don't want to do).
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure, original error is what matters
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * For the small number of code paths that must run before an org_id is known (auth/login looks
 * a user up by email; users has an org_isolation RLS policy too, so login runs its lookup with
 * app.org_id left unset on purpose, which means RLS makes it see rows from every org for that
 * one query). This is intentional and documented at the one call site (auth service) rather than
 * used anywhere else.
 */
export async function withSystemTx<T>(fn: (client: OrgTxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
