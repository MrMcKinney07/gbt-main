import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { withOrgTx, type OrgTxClient } from "../lib/db.js";
import { config } from "../lib/config.js";
import { authenticate } from "../middleware/authenticate.js";
import { getPhotoIntervalProfileById, getShiftById } from "../repositories/core.js";
import {
  countDoorsSince,
  countPhotoVerificationsForShift,
  createPendingPhotoVerification,
  deferPhotoVerification,
  getCurrentTurfForUser,
  getLatestPhotoVerificationForShift,
  getPhotoVerificationById,
  getTurfGeomCheck,
  updatePhotoVerificationSubmit,
} from "../repositories/photo.js";
import { drawDoorInterval } from "../lib/photoSchedule.js";
import { scorePhotoVerification } from "../services/verification/scoring.js";
import { insertAuditLog } from "../lib/audit.js";

const statusQuerySchema = z.object({ shiftId: z.string().uuid() });

const submitSchema = z.object({
  imageBase64: z.string().min(1),
  capturedAt: z.string(),
  captureGeom: z.object({ lat: z.number(), lng: z.number() }),
  captureAccuracyM: z.number().nullable().optional(),
  captureAltitude: z.number().nullable().optional(),
  deviceHeading: z.number().nullable().optional(),
  deviceUptimeMs: z.number().int().nullable().optional(),
  mockLocationFlag: z.boolean().default(false),
  faceDetected: z.boolean().default(false),
});

const TURF_BUFFER_M = 150;

export async function photoVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/photo-verification/status", { preHandler: authenticate }, async (request, reply) => {
    const parsed = statusQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { shiftId } = parsed.data;
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const shift = await getShiftById(client, shiftId);
      if (!shift || shift.user_id !== auth.userId) {
        return reply.code(404).send({ error: "shift_not_found" });
      }
      if (!shift.photo_interval_profile_id || !shift.photo_schedule_seed) {
        return reply.send({ due: false });
      }
      const profile = await getPhotoIntervalProfileById(client, shift.photo_interval_profile_id);
      if (!profile) return reply.send({ due: false });

      const latest = await getLatestPhotoVerificationForShift(client, shiftId);

      // An already-fired prompt that hasn't been resolved yet stays due until the mobile app
      // submits or defers it - don't draw a new one on top of it.
      if (latest && latest.status === "pending") {
        return reply.send({ due: true, verificationId: latest.id });
      }

      const promptCount = await countPhotoVerificationsForShift(client, shiftId);
      const nextSequence = promptCount + 1;
      if (nextSequence > profile.max_prompts_per_shift) {
        return reply.send({ due: false });
      }

      if (latest?.prompted_at) {
        const cooldownMs = profile.min_minutes_between_prompts * 60 * 1000;
        if (Date.now() - new Date(latest.prompted_at).getTime() < cooldownMs) {
          return reply.send({ due: false });
        }
      }

      const since = latest?.prompted_at ?? shift.actual_start;
      const doorsSinceLastPrompt = await countDoorsSince(client, auth.userId, shift.campaign_id, since);

      const drawnDoors = drawDoorInterval({
        photoScheduleSeed: shift.photo_schedule_seed,
        promptSequence: nextSequence,
        minDoors: profile.min_doors,
        maxDoors: profile.max_doors,
        betaAlpha: Number(profile.beta_alpha),
        betaBeta: Number(profile.beta_beta),
      });

      if (doorsSinceLastPrompt < drawnDoors) {
        return reply.send({ due: false });
      }

      const turfId = await getCurrentTurfForUser(client, auth.userId, shift.campaign_id);
      const deviceId = await getShiftDeviceId(client, shiftId);
      const created = await createPendingPhotoVerification(client, {
        shiftId,
        userId: auth.userId,
        campaignId: shift.campaign_id,
        turfId,
        deviceId,
        intervalProfileId: profile.id,
        intervalDrawn: drawnDoors,
        doorsSinceLastPrompt,
        shiftPromptSequence: nextSequence,
      });

      return reply.send({ due: true, verificationId: created.id });
    });
  });

  app.post("/photo-verification/:id/submit", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    let bodyInput: unknown = request.body;
    if (request.isMultipart?.()) {
      // Multipart path: accept an image file part plus the same JSON fields as form fields.
      // The demo/test suite exercises the JSON (imageBase64) path; this is here so a real
      // mobile client can use either per docs/API_CONTRACT.md ("multipart or {imageBase64,...}").
      const parts = request.parts();
      const fields: Record<string, string> = {};
      let imageBuffer: Buffer | null = null;
      for await (const part of parts) {
        if (part.type === "file") {
          imageBuffer = await part.toBuffer();
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
      bodyInput = {
        ...fields,
        captureGeom: fields.captureGeom ? JSON.parse(fields.captureGeom) : undefined,
        mockLocationFlag: fields.mockLocationFlag === "true",
        faceDetected: fields.faceDetected === "true",
        imageBase64: imageBuffer ? imageBuffer.toString("base64") : undefined,
      };
    }

    const parsed = submitSchema.safeParse(bodyInput);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const auth = request.auth!;

    // Defense-in-depth: the mobile app must never submit a frame with a detected face at all.
    // If one somehow reaches the server, reject outright rather than trying to redact it here.
    if (body.faceDetected === true) {
      return reply.code(422).send({ error: "face_detected" });
    }

    return withOrgTx(auth.orgId, async (client) => {
      const verification = await getPhotoVerificationById(client, id);
      if (!verification || verification.user_id !== auth.userId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const imageBuffer = Buffer.from(body.imageBase64, "base64");
      const imageSha256 = createHash("sha256").update(imageBuffer).digest("hex");
      const objectKey = `${verification.id}-${randomUUID()}.jpg`;
      const storageDir = path.resolve(process.cwd(), config.photoStorageDir);
      await mkdir(storageDir, { recursive: true });
      await writeFile(path.join(storageDir, objectKey), imageBuffer);

      let insideTurf: boolean | null = null;
      let distanceToTurfM: number | null = null;
      if (verification.turf_id) {
        const check = await getTurfGeomCheck(client, verification.turf_id, body.captureGeom.lat, body.captureGeom.lng, TURF_BUFFER_M);
        if (check) {
          insideTurf = check.inside;
          distanceToTurfM = Number(check.distance_m);
        }
      }

      const serverReceivedAt = new Date();
      const clockDeltaSeconds = (serverReceivedAt.getTime() - new Date(body.capturedAt).getTime()) / 1000;

      const scored = scorePhotoVerification({
        insideTurf,
        mockLocationFlag: body.mockLocationFlag,
        clockDeltaSeconds,
        captureAccuracyM: body.captureAccuracyM ?? null,
      });

      await updatePhotoVerificationSubmit(client, {
        id: verification.id,
        objectKey,
        imageSha256,
        imageBytes: imageBuffer.byteLength,
        captureLat: body.captureGeom.lat,
        captureLng: body.captureGeom.lng,
        captureAccuracyM: body.captureAccuracyM ?? null,
        captureAltitude: body.captureAltitude ?? null,
        deviceHeading: body.deviceHeading ?? null,
        deviceRecordedAt: body.capturedAt,
        deviceUptimeMs: body.deviceUptimeMs ?? null,
        mockLocationFlag: body.mockLocationFlag,
        clockDeltaSeconds,
        insideTurf,
        distanceToTurfM,
        verificationScore: scored.score,
        flagReasons: scored.flagReasons,
        status: scored.status,
      });

      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "photo_verification.submit",
        entityType: "photo_verification",
        entityId: verification.id,
        before: { status: verification.status },
        after: { status: scored.status, verificationScore: scored.score },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ status: scored.status, insideTurf, verificationScore: scored.score });
    });
  });

  app.post("/photo-verification/:id/defer", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;

    return withOrgTx(auth.orgId, async (client) => {
      const verification = await getPhotoVerificationById(client, id);
      if (!verification || verification.user_id !== auth.userId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const profile = await getPhotoIntervalProfileById(client, verification.interval_profile_id);
      const deferSeconds = profile?.defer_seconds_each ?? 120;

      const result = await deferPhotoVerification(client, id, deferSeconds);
      if (!result) {
        return reply.code(404).send({ error: "not_found" });
      }

      await insertAuditLog(client, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        actorRole: null,
        action: "photo_verification.defer",
        entityType: "photo_verification",
        entityId: id,
        before: { deferralCount: verification.deferral_count },
        after: { deferralCount: result.deferralCount },
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ deferredUntil: result.deferredUntil, deferralCount: result.deferralCount });
    });
  });
}

async function getShiftDeviceId(client: OrgTxClient, shiftId: string): Promise<string> {
  const result = await client.query(`SELECT device_id FROM shifts WHERE id = $1`, [shiftId]);
  return result.rows[0]?.device_id;
}
