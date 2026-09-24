import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withOrgTx } from "../lib/db.js";
import { lookupUserForLogin } from "../lib/authBootstrap.js";
import { verifyPassword } from "../lib/password.js";
import { signAccessToken, signRefreshToken } from "../lib/jwt.js";
import { getUserCampaignRoles, getUserById } from "../repositories/core.js";
import { insertAuditLog } from "../lib/audit.js";
import { authenticate } from "../middleware/authenticate.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    // See src/lib/authBootstrap.ts for why this one lookup uses a separate, narrowly-scoped
    // connection instead of the normal org-scoped path - it's the only query in this codebase
    // that has to run before an org_id is known.
    const found = await lookupUserForLogin(email);
    if (!found || found.status !== "active" || !found.password_hash) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const ok = await verifyPassword(found.password_hash, password);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const result = await withOrgTx(found.org_id, async (client) => {
      const roles = await getUserCampaignRoles(client, found.id);
      const user = await getUserById(client, found.id);
      await insertAuditLog(client, {
        orgId: found.org_id,
        actorUserId: found.id,
        actorRole: null,
        action: "auth.login",
        entityType: "user",
        entityId: found.id,
        before: null,
        after: { email },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return { roles, user };
    });

    const campaignRoleClaims = result.roles.map((r) => ({ campaign_id: r.campaignId, role: r.role }));
    const accessToken = signAccessToken(found.id, found.org_id, campaignRoleClaims);
    const refreshToken = signRefreshToken(found.id, found.org_id);

    return reply.code(200).send({
      accessToken,
      refreshToken,
      user: {
        id: found.id,
        email: result.user?.email ?? email,
        orgId: found.org_id,
        campaignRoles: campaignRoleClaims,
      },
    });
  });

  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const result = await withOrgTx(auth.orgId, async (client) => {
      const user = await getUserById(client, auth.userId);
      const roles = await getUserCampaignRoles(client, auth.userId);
      return { user, roles };
    });
    if (!result.user) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.send({
      id: result.user.id,
      email: result.user.email,
      orgId: result.user.org_id,
      campaignRoles: result.roles.map((r) => ({ campaignId: r.campaignId, campaignName: r.campaignName, role: r.role })),
    });
  });
}
