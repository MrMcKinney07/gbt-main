import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withOrgTx } from "../lib/db.js";
import { authenticate } from "../middleware/authenticate.js";
import { contactAttemptSchema, processContactAttempt } from "../services/verification/contactAttempt.js";

const batchSchema = z.object({
  items: z.array(z.unknown()).min(1).max(500),
});

export async function contactAttemptRoutes(app: FastifyInstance): Promise<void> {
  app.post("/contact-attempts", { preHandler: authenticate }, async (request, reply) => {
    const parsed = contactAttemptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const auth = request.auth!;
    const result = await withOrgTx(auth.orgId, (client) =>
      processContactAttempt(client, auth, parsed.data, {
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      })
    );
    return reply.code(result.status).send(result.body);
  });

  app.post("/contact-attempts/batch", { preHandler: authenticate }, async (request, reply) => {
    const parsedBatch = batchSchema.safeParse(request.body);
    if (!parsedBatch.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsedBatch.error.flatten() });
    }
    const auth = request.auth!;
    const results: { idempotencyKey?: string; status: "created" | "duplicate" | "error"; id?: string; error?: string }[] = [];

    // Each item gets its own transaction, so a bad item (bad FK, failed validation, whatever)
    // never rolls back or blocks the items around it - "never fails the whole batch for one bad
    // item" per docs/API_CONTRACT.md.
    for (const rawItem of parsedBatch.data.items) {
      const parsedItem = contactAttemptSchema.safeParse(rawItem);
      if (!parsedItem.success) {
        const idempotencyKey = (rawItem as any)?.idempotencyKey;
        results.push({ idempotencyKey, status: "error", error: "invalid_request" });
        continue;
      }
      try {
        const result = await withOrgTx(auth.orgId, (client) =>
          processContactAttempt(client, auth, parsedItem.data, {
            requestId: request.id,
            ip: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
          })
        );
        results.push({
          idempotencyKey: parsedItem.data.idempotencyKey,
          status: result.status === 201 ? "created" : "duplicate",
          id: result.body.id,
        });
      } catch (err) {
        results.push({
          idempotencyKey: parsedItem.data.idempotencyKey,
          status: "error",
          error: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }

    return reply.code(200).send({ results });
  });
}
