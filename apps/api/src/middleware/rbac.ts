import type { FastifyReply, FastifyRequest } from "fastify";
import type { CampaignRole } from "../types.js";

type CampaignIdSource = (request: FastifyRequest) => string | undefined;

export const campaignIdFromBody: CampaignIdSource = (request) => (request.body as any)?.campaignId;
export const campaignIdFromQuery: CampaignIdSource = (request) => (request.query as any)?.campaignId;

/**
 * RBAC middleware: requires the authenticated user to hold one of `allowedRoles` on the
 * campaign resolved by `getCampaignId`. Not exhaustive over every route in the full spec (the
 * build instructions only ask for coverage of the routes this build implements), but every
 * mutating and console route below goes through this rather than checking roles ad hoc.
 */
export function requireCampaignRole(allowedRoles: CampaignRole[], getCampaignId: CampaignIdSource) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.auth) {
      reply.code(401).send({ error: "unauthorized" });
      return reply;
    }
    const campaignId = getCampaignId(request);
    if (!campaignId) {
      reply.code(400).send({ error: "campaign_id_required" });
      return reply;
    }
    const hasRole = request.auth.campaignRoles.some(
      (r) => r.campaignId === campaignId && allowedRoles.includes(r.role)
    );
    if (!hasRole) {
      reply.code(403).send({ error: "forbidden", message: `Requires one of: ${allowedRoles.join(", ")}` });
      return reply;
    }
  };
}

/** Any authenticated user holding ANY role at all on the given campaign. */
export function requireAnyCampaignRole(getCampaignId: CampaignIdSource) {
  return requireCampaignRole(
    [
      "canvasser",
      "team_lead",
      "field_organizer",
      "field_director",
      "data_admin",
      "compliance_officer",
      "org_owner",
      "auditor",
    ],
    getCampaignId
  );
}

export const MANAGER_ROLES: CampaignRole[] = [
  "team_lead",
  "field_organizer",
  "field_director",
  "data_admin",
  "compliance_officer",
  "org_owner",
  "auditor",
];
