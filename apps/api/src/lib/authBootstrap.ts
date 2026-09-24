import { pool } from "./db.js";

// ---------------------------------------------------------------------------------------------
// `POST /auth/login` receives only {email, password}. To answer it, the API has to find which
// org that email belongs to *before* it can call `SET LOCAL app.org_id`, because that's what
// determines which org's `users` row is even visible under the org_isolation RLS policy from
// 0010_audit_log_and_rls.sql. With app.org_id unset, `app_current_org_id()` is NULL, and
// `org_id = NULL` is never true, so the API's normal `gbt_app` connection sees *zero* rows of
// `users` until an org_id is known - not "all rows".
//
// The fix is `auth_lookup_user_for_login`, a SECURITY DEFINER function added in
// 0012_auth_bootstrap_functions.sql: it runs with the privileges of its owner (gbt, which has
// BYPASSRLS) regardless of the calling role, so gbt_app can call it without the API process
// ever holding superuser credentials. It returns only the four columns login actually needs.
// This is the only place in the codebase that calls it.
// ---------------------------------------------------------------------------------------------

export interface LoginLookupRow {
  id: string;
  org_id: string;
  password_hash: string | null;
  status: string;
}

export async function lookupUserForLogin(email: string): Promise<LoginLookupRow | null> {
  const result = await pool.query<LoginLookupRow>(
    `SELECT * FROM auth_lookup_user_for_login($1)`,
    [email]
  );
  return result.rows[0] ?? null;
}
