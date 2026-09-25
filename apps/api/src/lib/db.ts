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
 * tables must go through this.
 *
 * The rare cases that run before an org_id is known (login's lookup-by-email, and the
 * watchdog's cross-org tick) do NOT use a variant of this helper with RLS left unset - with no
 * app.org_id set, `org_id = app_current_org_id()` evaluates to `org_id = NULL`, which RLS never
 * treats as true, so an ordinary transaction on gbt_app would see zero rows, not every org's
 * rows. Those two call sites instead go through a narrow SECURITY DEFINER database function
 * (0012_auth_bootstrap_functions.sql, called from lib/authBootstrap.ts and lib/orgList.ts) that
 * runs with the migrations role's BYPASSRLS privilege for exactly one query each, so this API
 * process itself never needs superuser credentials at runtime.
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
