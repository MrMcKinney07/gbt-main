import type { OrgTxClient } from "./db.js";

export interface AuditEntry {
  orgId: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The shared audit-log write. Every mutating route calls this once, inside the same
 * transaction as its mutation (via the `withOrgTx` client), so an audit entry can never exist
 * for a mutation that got rolled back, and a committed mutation can never be missing one.
 * `audit_log`'s hash-chain trigger (0010_audit_log_and_rls.sql) computes prev_hash/hash itself
 * on insert - this function only supplies the columns it needs.
 *
 * This is the "audit log middleware" the build asks for: a single reusable helper instead of
 * copy-pasted INSERT statements per route. Routes call it directly rather than going through a
 * generic Fastify onSend hook, because onSend fires after the response (and after the route's
 * transaction has already committed or rolled back) - too late to guarantee atomicity with the
 * mutation it is describing.
 */
export async function insertAuditLog(client: OrgTxClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_log
       (org_id, actor_user_id, actor_role, action, entity_type, entity_id, before, after, ip, user_agent, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.orgId,
      entry.actorUserId,
      entry.actorRole,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      entry.userAgent ?? null,
      entry.requestId ?? null,
    ]
  );
}
