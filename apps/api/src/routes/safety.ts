import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withOrgTx } from "../lib/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { campaignIdFromQuery, MANAGER_ROLES, requireCampaignRole } from "../middleware/rbac.js";
import { createSafetyEvent, getSafetyBoard } from "../repositories/safety.js";
import { getShiftById } from "../repositories/core.js";
import { insertAuditLog } from "../lib/audit.js";

const respondSchema = z.object({
  response: z.enum(["ok", "need_help"]),
  responseMode: z.enum(["tap", "biometric", "duress_pin", "out_of_band"]).default("tap"),
});

const sosSchema = z.object({
  shiftId: z.string().uuid(),
  geom: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const duressSchema = z.object({ shiftId: z.string().uuid() });

export async function safetyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/wellness-checks/:id/respond", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = respondSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { response, responseMode } = parsed.data;
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const existing = await client.query(
        `SELECT id, shift_id, user_id, escalation_level, resolved_at FROM wellness_checks WHERE id = $1`,
        [id]
      );
      const wc = existing.rows[0];
      if (!wc || wc.user_id !== auth.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      await client.query(
        `UPDATE wellness_checks SET responded_at = now(), response = $2, response_mode = $3,
           resolved_at = CASE WHEN $2 = 'ok' THEN now() ELSE resolved_at END,
           resolved_by = CASE WHEN $2 = 'ok' THEN $4 ELSE resolved_by END
         WHERE id = $1`,
        [id, response, responseMode, auth.userId]
      );

      // "need_help" always escalates to a real safety event - the ladder in
      // services/safety/watchdog.ts stops managing this check once a human response exists.
      if (response === "need_help") {
        await createSafetyEvent(client, {
          shiftId: wc.shift_id,
          userId: auth.userId,
          type: "no_response",
          severity: "critical",
          notes: "Canvasser responded need_help to a wellness check.",
        });
        await client.query(`UPDATE safety_watchdog_state SET status = 'idle_alert' WHERE shift_id = $1`, [wc.shift_id]);
      }

      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "wellness_check.respond",
        entityType: "wellness_check",
        entityId: id,
        before: { responded: false },
        after: { response },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ ok: true });
    });
  });

  app.post("/safety/sos", { preHandler: authenticate }, async (request, reply) => {
    const parsed = sosSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { shiftId, geom } = parsed.data;
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const shift = await getShiftById(client, shiftId);
      if (!shift || shift.user_id !== auth.userId) {
        return reply.code(404).send({ error: "shift_not_found" });
      }

      const event = await createSafetyEvent(client, {
        shiftId,
        userId: auth.userId,
        type: "manual_sos",
        severity: "critical",
        notes: "Manual SOS triggered by canvasser.",
      });
      if (geom) {
        await client.query(`UPDATE safety_events SET geom = ST_SetSRID(ST_MakePoint($2, $3), 4326) WHERE id = $1`, [
          event.id,
          geom.lng,
          geom.lat,
        ]);
      }
      await client.query(`UPDATE safety_watchdog_state SET status = 'idle_alert' WHERE shift_id = $1`, [shiftId]);

      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "safety.sos",
        entityType: "safety_event",
        entityId: event.id,
        before: null,
        after: { shiftId },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ safetyEventId: event.id });
    });
  });

  // Duress: the mobile app calls this silently in the background when a canvasser enters their
  // duress PIN instead of their real PIN on a wellness-check response. The UI shown to them is
  // identical to the "ok" path (see docs/API_CONTRACT.md) - this endpoint's response is never
  // surfaced, so it stays minimal and fast.
  app.post("/safety/duress", { preHandler: authenticate }, async (request, reply) => {
    const parsed = duressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const { shiftId } = parsed.data;
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const shift = await getShiftById(client, shiftId);
      if (!shift || shift.user_id !== auth.userId) {
        return reply.code(200).send({}); // never reveal shift-lookup failures on this path
      }
      const event = await createSafetyEvent(client, {
        shiftId,
        userId: auth.userId,
        type: "duress",
        severity: "critical",
        notes: "Duress PIN entered on wellness-check response.",
      });
      await client.query(`UPDATE safety_watchdog_state SET status = 'idle_alert' WHERE shift_id = $1`, [shiftId]);
      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "safety.duress",
        entityType: "safety_event",
        entityId: event.id,
        before: null,
        after: null, // never store which PIN path taken beyond the event itself
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return reply.send({});
    });
  });

  app.get(
    "/console/safety-board",
    { preHandler: [authenticate, requireCampaignRole(MANAGER_ROLES, campaignIdFromQuery)] },
    async (request, reply) => {
      const { campaignId } = request.query as { campaignId: string };
      const auth = request.auth!;
      const items = await withOrgTx(auth.orgId, (client) => getSafetyBoard(client, campaignId));
      return reply.send({ items });
    }
  );
}
