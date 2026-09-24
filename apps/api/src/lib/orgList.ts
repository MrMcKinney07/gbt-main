import pg from "pg";

const { Pool } = pg;

// Same narrow, documented exception as src/lib/authBootstrap.ts: the watchdog tick runs across
// every org's active shifts on a timer, not inside a single request's org-scoped transaction,
// so it needs the list of org ids *before* it can open an org-scoped transaction for each one.
// `organizations` carries the same org_isolation RLS policy as everything else, so gbt_app
// sees zero rows without an org_id already set - the same chicken-and-egg problem login has.
// See authBootstrap.ts for the full explanation and the production fix this build can't make
// because db/migrations is frozen for this task.
const orgListUrl = process.env.AUTH_BOOTSTRAP_DATABASE_URL ?? "postgres://gbt:gbt_dev_only@localhost:5432/gbt";
const orgListPool = new Pool({ connectionString: orgListUrl });

export async function lookupAllOrgIds(): Promise<string[]> {
  const result = await orgListPool.query<{ id: string }>(`SELECT id FROM organizations`);
  return result.rows.map((r) => r.id);
}
