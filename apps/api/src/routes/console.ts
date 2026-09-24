import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withOrgTx } from "../lib/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { campaignIdFromQuery, MANAGER_ROLES, requireCampaignRole } from "../middleware/rbac.js";
import { getSafetyBoard, getLastKnownLocations } from "../repositories/safety.js";
import { getAccountabilityAlerts, getProductionStats, getRosterProductionFields } from "../repositories/production-stats.js";
import type { ProductionPeriod } from "../repositories/production-stats.js";

const periodSchema = z.enum(["today", "week", "all"]).default("today");

/**
 * The two-stack rule (docs/API_CONTRACT.md "Manager console - Live Ops"): safetyAlerts and
 * accountabilityAlerts are separate arrays in the response, built from repositories/safety.ts
 * and repositories/production-stats.ts respectively, which do not import each other (see the
 * header comments in both, and test/safety-firewall.test.ts). This route file is the one place
 * allowed to see both, because assembling one JSON response is not the same as merging the two
 * domains into one alert list - do NOT combine them into a single `alerts` array here or
 * anywhere downstream; the console's own README repeats this same one-liner next to where it
 * renders them.
 */
export async function consoleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/console/live-ops",
    { preHandler: [authenticate, requireCampaignRole(MANAGER_ROLES, campaignIdFromQuery)] },
    async (request, reply) => {
      const { campaignId } = request.query as { campaignId: string };
      const auth = request.auth!;

      const result = await withOrgTx(auth.orgId, async (client) => {
        const [rosterRows, locations, safetyAlerts, accountabilityAlerts, turfCounts, scheduledCount] = await Promise.all([
          getRosterProductionFields(client, campaignId),
          getLastKnownLocations(client, campaignId),
          getSafetyBoard(client, campaignId),
          getAccountabilityAlerts(client, campaignId),
          client.query(
            `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'archived') AS complete
             FROM turfs WHERE campaign_id = $1`,
            [campaignId]
          ),
          client.query(
            `SELECT COUNT(*) AS n FROM user_campaign_roles WHERE campaign_id = $1 AND role = 'canvasser' AND revoked_at IS NULL`,
            [campaignId]
          ),
        ]);

        const locationsByUser = new Map(locations.map((l) => [l.userId, l]));
        const roster = rosterRows.map((r) => {
          const loc = locationsByUser.get(r.user_id);
          const doorsToday = Number(r.doors_today);
          const contactsToday = Number(r.contacts_today);
          return {
            userId: r.user_id,
            userName: r.user_name,
            teamName: r.team_name ?? null,
            shiftStatus: "active",
            doorsToday,
            contactsToday,
            contactRate: doorsToday > 0 ? Math.round((contactsToday / doorsToday) * 1000) / 1000 : 0,
            timeSinceLastDoorSeconds: r.last_door_at
              ? Math.max(0, Math.floor((Date.now() - new Date(r.last_door_at).getTime()) / 1000))
              : null,
            photoStatus: r.photo_status ?? null,
            outOfTurfCount: Number(r.out_of_turf_count),
            verificationScore: r.avg_verification_score != null ? Math.round(Number(r.avg_verification_score) * 1000) / 1000 : null,
            batteryPct: loc?.batteryPct ?? null,
            openFlags: Number(r.open_flags),
            lat: loc?.lat ?? null,
            lng: loc?.lng ?? null,
          };
        });

        const doorsTotal = roster.reduce((s, r) => s + r.doorsToday, 0);
        const contactsTotal = roster.reduce((s, r) => s + r.contactsToday, 0);
        const scoredRoster = roster.filter((r) => r.verificationScore != null);
        const verifiedShare =
          scoredRoster.length > 0 ? scoredRoster.reduce((s, r) => s + (r.verificationScore ?? 0), 0) / scoredRoster.length : 0;

        return {
          headerTiles: {
            agentsOnShift: roster.length,
            agentsScheduled: Number(scheduledCount.rows[0].n),
            doorsToday: doorsTotal,
            contactsToday: contactsTotal,
            contactRate: doorsTotal > 0 ? Math.round((contactsTotal / doorsTotal) * 1000) / 1000 : 0,
            verifiedShare: Math.round(verifiedShare * 1000) / 1000,
            turfsComplete: Number(turfCounts.rows[0].complete),
            turfsTotal: Number(turfCounts.rows[0].total),
            openSafetyItems: safetyAlerts.length,
            openAccountabilityItems: accountabilityAlerts.length,
          },
          roster,
          safetyAlerts,
          accountabilityAlerts,
        };
      });

      return reply.send(result);
    }
  );

  app.get(
    "/console/production-stats",
    { preHandler: [authenticate, requireCampaignRole(MANAGER_ROLES, campaignIdFromQuery)] },
    async (request, reply) => {
      const query = request.query as { campaignId: string; period?: string };
      const period = periodSchema.parse(query.period) as ProductionPeriod;
      const auth = request.auth!;
      const agents = await withOrgTx(auth.orgId, (client) => getProductionStats(client, query.campaignId, period));
      return reply.send({ agents });
    }
  );
}
