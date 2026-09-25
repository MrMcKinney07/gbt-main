export type CampaignRole =
  | "canvasser"
  | "team_lead"
  | "field_organizer"
  | "field_director"
  | "data_admin"
  | "compliance_officer"
  | "org_owner"
  | "auditor";

export interface AuthContext {
  userId: string;
  orgId: string;
  campaignRoles: { campaignId: string; role: CampaignRole }[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
