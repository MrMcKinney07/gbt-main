import { pool } from "./db.js";

// Same chicken-and-egg problem as authBootstrap.ts: the watchdog tick runs across every org's
// active shifts on a timer, not inside a single request's org-scoped transaction, so it needs
// the list of org ids *before* it can open a per-org transaction for each one.
// `list_all_org_ids` (0012_auth_bootstrap_functions.sql) is the same SECURITY DEFINER pattern -
// gbt_app calls it without ever holding superuser credentials.
export async function lookupAllOrgIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>(`SELECT * FROM list_all_org_ids()`);
  return result.rows.map((r) => r.id);
}
