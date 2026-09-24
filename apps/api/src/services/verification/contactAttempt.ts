import { z } from "zod";
import type { OrgTxClient } from "../../lib/db.js";
import type { AuthContext } from "../../types.js";
import {
  checkTurfBoundary,
  getExceptionForContactAttempt,
  insertContactAttempt,
  insertOutOfTurfException,
} from "../../repositories/turf.js";
import { getActiveShiftForUser } from "../../repositories/core.js";
import { insertAuditLog } from "../../lib/audit.js";

const geomSchema = z.object({ lat: z.number(), lng: z.number() });

export const contactAttemptSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  campaignId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  walkbookId: z.string().uuid(),
  turfId: z.string().uuid(),
  addressId: z.string().uuid(),
  householdId: z.string().uuid(),
  voterId: z.string().uuid().nullable().optional(),
  deviceId: z.string().uuid(),
  resultCode: z.string(),
  scope: z.enum(["voter", "household", "building"]).default("voter"),
  arriveAt: z.string(),
  arriveGeom: geomSchema,
  arriveAccuracyM: z.number().nullable().optional(),
  arriveAltitude: z.number().nullable().optional(),
  arriveSpeedMps: z.number().nullable().optional(),
  departAt: z.string().nullable().optional(),
  departGeom: geomSchema.nullable().optional(),
  departAccuracyM: z.number().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  distanceToDoorM: z.number().nullable().optional(),
  recordedAt: z.string(),
  deviceUptimeMs: z.number().int().nullable().optional(),
  mockLocationFlag: z.boolean().default(false),
  attestationTokenId: z.string().nullable().optional(),
  stepCountSinceLast: z.number().int().nullable().optional(),
  networkType: z.string().nullable().optional(),
  carrierMccMnc: z.string().nullable().optional(),
  observedIpCountry: z.string().nullable().optional(),
  notesText: z.string().nullable().optional(),
  notesSource: z.enum(["typed", "voice", "template"]).nullable().optional(),
  supersedesContactId: z.string().uuid().nullable().optional(),
});

export type ContactAttemptBody = z.infer<typeof contactAttemptSchema>;

export interface ContactAttemptResult {
  status: number;
  body: {
    id: string;
    flagStatus: string;
    outOfTurfException: { classification: string; distanceOutsideBoundaryM: number } | null;
  };
}

/**
 * Shared insert path for both POST /contact-attempts and each item of POST
 * /contact-attempts/batch, so the two endpoints can't drift in behavior. Idempotency relies on
 * the DB's UNIQUE(idempotency_key) constraint (insertContactAttempt does the
 * INSERT ... ON CONFLICT DO NOTHING + re-select dance) rather than an API-side pre-check.
 */
export async function processContactAttempt(
  client: OrgTxClient,
  auth: AuthContext,
  body: ContactAttemptBody,
  requestMeta: { requestId?: string; ip?: string | null; userAgent?: string | null }
): Promise<ContactAttemptResult> {
  const activeShift = await getActiveShiftForUser(client, auth.userId, body.campaignId);

  const { row, created } = await insertContactAttempt(client, {
    id: body.id,
    idempotencyKey: body.idempotencyKey,
    campaignId: body.campaignId,
    assignmentId: body.assignmentId,
    walkbookId: body.walkbookId,
    turfId: body.turfId,
    addressId: body.addressId,
    householdId: body.householdId,
    voterId: body.voterId ?? null,
    canvasserUserId: auth.userId,
    deviceId: body.deviceId,
    resultCode: body.resultCode,
    scope: body.scope,
    arriveAt: body.arriveAt,
    arriveLat: body.arriveGeom.lat,
    arriveLng: body.arriveGeom.lng,
    arriveAccuracyM: body.arriveAccuracyM ?? null,
    arriveAltitude: body.arriveAltitude ?? null,
    arriveSpeedMps: body.arriveSpeedMps ?? null,
    departAt: body.departAt ?? null,
    departLat: body.departGeom?.lat ?? null,
    departLng: body.departGeom?.lng ?? null,
    departAccuracyM: body.departAccuracyM ?? null,
    durationSeconds: body.durationSeconds ?? null,
    distanceToDoorM: body.distanceToDoorM ?? null,
    recordedAt: body.recordedAt,
    deviceUptimeMs: body.deviceUptimeMs ?? null,
    mockLocationFlag: body.mockLocationFlag,
    attestationTokenId: body.attestationTokenId ?? null,
    stepCountSinceLast: body.stepCountSinceLast ?? null,
    networkType: body.networkType ?? null,
    carrierMccMnc: body.carrierMccMnc ?? null,
    observedIpCountry: body.observedIpCountry ?? null,
    notesText: body.notesText ?? null,
    notesSource: body.notesSource ?? null,
    supersedesContactId: body.supersedesContactId ?? null,
  });

  let outOfTurfException: ContactAttemptResult["body"]["outOfTurfException"] = null;

  if (created) {
    const boundaryCheck = await checkTurfBoundary(client, body.turfId, body.arriveGeom.lat, body.arriveGeom.lng);
    if (!boundaryCheck.insideTurf && boundaryCheck.distanceOutsideBoundaryM != null) {
      if (activeShift) {
        const exception = await insertOutOfTurfException(client, {
          contactAttemptId: row.id,
          assignmentId: body.assignmentId,
          walkbookId: body.walkbookId,
          turfId: body.turfId,
          userId: auth.userId,
          shiftId: activeShift.id,
          campaignId: body.campaignId,
          addressId: body.addressId,
          lat: body.arriveGeom.lat,
          lng: body.arriveGeom.lng,
          accuracyM: body.arriveAccuracyM ?? null,
          distanceOutsideBoundaryM: boundaryCheck.distanceOutsideBoundaryM,
        });
        outOfTurfException = { classification: exception.classification, distanceOutsideBoundaryM: exception.distanceOutsideBoundaryM };
      }
      // else: no active shift to attribute the exception to (e.g. late offline sync after shift
      // end) - turf_boundary_exceptions.shift_id is NOT NULL so we can't write a row; the
      // contact attempt itself still succeeds. See repositories/turf.ts.
    }

    await insertAuditLog(client, {
      orgId: auth.orgId,
      actorUserId: auth.userId,
      actorRole: null,
      action: "contact_attempt.create",
      entityType: "contact_attempt",
      entityId: row.id,
      before: null,
      after: { resultCode: body.resultCode, addressId: body.addressId },
      requestId: requestMeta.requestId ?? null,
      ip: requestMeta.ip ?? null,
      userAgent: requestMeta.userAgent ?? null,
    });
  } else {
    outOfTurfException = await getExceptionForContactAttempt(client, row.id);
  }

  return {
    status: created ? 201 : 200,
    body: { id: row.id, flagStatus: row.flag_status, outOfTurfException },
  };
}
