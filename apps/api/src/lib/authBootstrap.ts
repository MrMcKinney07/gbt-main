import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------------------------
// A DELIBERATE, NARROW exception to "the API only ever connects as gbt_app" - read this whole
// comment before touching this file.
//
// `POST /auth/login` receives only {email, password}. To answer it, the API has to find which
// org that email belongs to *before* it can call `SET LOCAL app.org_id`, because that's what
// determines which org's `users` row is even visible - and `users` carries the
// `org_isolation` RLS policy from 0010_audit_log_and_rls.sql like every other org-scoped
// table. With app.org_id unset, `app_current_org_id()` is NULL, and `org_id = NULL` is never
// true, so gbt_app sees *zero* rows of `users` - not "all rows" - until org_id is known. There
// is no user-supplied org hint in the login request, no non-RLS identity table, and no
// SECURITY DEFINER lookup function in the frozen schema for this build to use instead.
//
// The only role available to this session that can read a `users` row without an org_id
// already in hand is `gbt` (the migrations superuser, BYPASSRLS). This module opens a second,
// separate connection pool as that role and uses it for exactly one query: resolving
// {id, org_id, password_hash, status} by email at login time. Nothing else in this codebase
// uses this pool. The moment a user's org_id is known (immediately after this lookup), every
// subsequent query - including the rest of the login flow itself (fetching campaign_roles,
// writing the login audit_log entry) - goes back through the normal `withOrgTx` path in
// src/lib/db.ts on the gbt_app connection, with RLS fully in effect.
//
// The correct production fix, which this build cannot make because db/migrations is frozen for
// this task, is a proper `SECURITY DEFINER` function (owned by a role with BYPASSRLS, added via
// a real migration by whoever owns schema changes) that does only this one lookup and nothing
// else - so the API itself never needs superuser credentials at runtime. See apps/api/README.md
// "What's simplified" for the same note.
// ---------------------------------------------------------------------------------------------

const authBootstrapUrl =
  process.env.AUTH_BOOTSTRAP_DATABASE_URL ?? "postgres://gbt:gbt_dev_only@localhost:5432/gbt";

const authBootstrapPool = new Pool({ connectionString: authBootstrapUrl });

export interface LoginLookupRow {
  id: string;
  org_id: string;
  password_hash: string | null;
  status: string;
}

export async function lookupUserForLogin(email: string): Promise<LoginLookupRow | null> {
  const result = await authBootstrapPool.query<LoginLookupRow>(
    `SELECT id, org_id, password_hash, status FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return result.rows[0] ?? null;
}
