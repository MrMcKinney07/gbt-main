import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withOrgTx } from "../lib/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { campaignIdFromBody, requireAnyCampaignRole } from "../middleware/rbac.js";
import {
  getCampaign,
  getDefaultPhotoIntervalProfile,
  hasDataLicense,
  hasLocationTrackingConsent,
  insertShift,
  endShift,
  getShiftById,
} from "../repositories/core.js";
import { insertAuditLog } from "../lib/audit.js";

const startSchema = z.object({
  campaignId: z.string().uuid(),
  deviceId: z.string().uuid().nullable().optional(),
  consentRecordIds: z.array(z.string().uuid()).default([]),
});

export async function shiftRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/shifts/start",
    { preHandler: [authenticate, requireAnyCampaignRole(campaignIdFromBody)] },
    async (request, reply) => {
      const parsed = startSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const { campaignId, deviceId } = parsed.data;
      const auth = request.auth!;

      return withOrgTx(auth.orgId, async (client) => {
        const campaign = await getCampaign(client, campaignId);
        if (!campaign) {
          return reply.code(404).send({ error: "campaign_not_found" });
        }
        const state = campaign.jurisdiction_state;

        // Consent gate (docs/API_CONTRACT.md): a current location_tracking consent record for
        // this user in the campaign's jurisdiction_state. We check authoritatively via the DB
        // rather than trusting the client's consentRecordIds list, which is defense-in-depth
        // evidence of what the client believes it collected, not the source of truth.
        const hasConsent = await hasLocationTrackingConsent(client, auth.userId, state);
        if (!hasConsent) {
          return reply.code(403).send({ error: "consent_missing", missing: ["location_tracking"] });
        }

        const hasLicense = await hasDataLicense(client, campaignId, state);
        if (!hasLicense) {
          return reply.code(403).send({ error: "license_missing", state });
        }

        const profile = await getDefaultPhotoIntervalProfile(client, campaignId);
        const photoScheduleSeed = randomBytes(32);

        const shift = await insertShift(client, {
          userId: auth.userId,
          campaignId,
          deviceId: deviceId ?? null,
          consentRecordId: null,
          photoIntervalProfileId: profile?.id ?? null,
          photoScheduleSeed,
        });

        await insertAuditLog(client, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          actorRole: null,
          action: "shift.start",
          entityType: "shift",
          entityId: shift.id,
          before: null,
          after: { campaignId, deviceId },
          requestId: request.id,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        return reply.code(201).send({
          id: shift.id,
          actualStart: shift.actual_start,
          photoIntervalProfileId: profile?.id ?? null,
        });
      });
    }
  );

  app.post("/shifts/:id/end", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const existing = await getShiftById(client, id);
      if (!existing) {
        return reply.code(404).send({ error: "shift_not_found" });
      }
      const isOwner = existing.user_id === auth.userId;
      const isManager = auth.campaignRoles.some(
        (r) => r.campaignId === existing.campaign_id && r.role !== "canvasser"
      );
      if (!isOwner && !isManager) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const updated = await endShift(client, id);
      if (!updated) {
        return reply.code(409).send({ error: "already_ended" });
      }

      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "shift.end",
        entityType: "shift",
        entityId: id,
        before: { actualEnd: null },
        after: { actualEnd: updated.actual_end },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ id: updated.id, actualEnd: updated.actual_end });
    });
  });
}
