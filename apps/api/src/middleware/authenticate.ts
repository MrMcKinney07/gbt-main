import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../lib/jwt.js";
import type { AuthContext } from "../types.js";

/**
 * Verifies the `Authorization: Bearer <jwt>` access token and populates `request.auth`.
 * Every route below except /auth/login registers this as a preHandler.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "unauthorized", message: "Missing bearer token" });
    return reply;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    const auth: AuthContext = {
      userId: payload.sub,
      orgId: payload.org_id,
      campaignRoles: payload.campaign_roles.map((r) => ({
        campaignId: r.campaign_id,
        role: r.role as AuthContext["campaignRoles"][number]["role"],
      })),
    };
    request.auth = auth;
  } catch {
    reply.code(401).send({ error: "unauthorized", message: "Invalid or expired token" });
    return reply;
  }
}
