import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { authRoutes } from "./routes/auth.js";
import { shiftRoutes } from "./routes/shifts.js";
import { contactAttemptRoutes } from "./routes/contactAttempts.js";
import { photoVerificationRoutes } from "./routes/photoVerification.js";
import { safetyRoutes } from "./routes/safety.js";
import { consoleRoutes } from "./routes/console.js";
import "./types.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV === "test" ? undefined : { target: "pino-pretty" },
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(shiftRoutes);
  await app.register(contactAttemptRoutes);
  await app.register(photoVerificationRoutes);
  await app.register(safetyRoutes);
  await app.register(consoleRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status = (error as any).statusCode ?? 500;
    reply.code(status).send({
      error: status === 500 ? "internal_error" : error.name,
      message: error.message,
    });
  });

  return app;
}
