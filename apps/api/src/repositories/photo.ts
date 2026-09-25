import type { OrgTxClient } from "../lib/db.js";

export interface PhotoVerificationRow {
  id: string;
  shift_id: string;
  user_id: string;
  campaign_id: string;
  turf_id: string | null;
  status: string;
  interval_profile_id: string;
  interval_drawn: number;
  shift_prompt_sequence: number;
  prompted_at: string | null;
  deferral_count: number;
  deferred_until: string | null;
}

export async function getLatestPhotoVerificationForShift(client: OrgTxClient, shiftId: string): Promise<PhotoVerificationRow | null> {
  const result = await client.query(
    `SELECT id, shift_id, user_id, campaign_id, turf_id, status, interval_profile_id, interval_drawn,
            shift_prompt_sequence, prompted_at, deferral_count, deferred_until
     FROM photo_verifications
     WHERE shift_id = $1
     ORDER BY shift_prompt_sequence DESC
     LIMIT 1`,
    [shiftId]
  );
  return result.rows[0] ?? null;
}

export async function countPhotoVerificationsForShift(client: OrgTxClient, shiftId: string): Promise<number> {
  const result = await client.query(`SELECT COUNT(*) AS n FROM photo_verifications WHERE shift_id = $1`, [shiftId]);
  return Number(result.rows[0].n);
}

/**
 * Counts contact attempts recorded since a given timestamp for a canvasser, used ONLY to
 * determine how many doors have passed since the last photo prompt for the door-count-trigger
 * mechanism itself. This module (accountability) is allowed to read contact_attempts for this
 * purpose - the firewall rule in repositories/safety.ts is about the safety tables never
 * feeding accountability, not about contact_attempts being exclusive to one side.
 */
export async function countDoorsSince(client: OrgTxClient, userId: string, campaignId: string, since: string | null): Promise<number> {
  const result = await client.query(
    `SELECT COUNT(*) AS n FROM contact_attempts
     WHERE canvasser_user_id = $1 AND campaign_id = $2 AND arrive_at > COALESCE($3::timestamptz, '-infinity'::timestamptz)`,
    [userId, campaignId, since]
  );
  return Number(result.rows[0].n);
}

/** Most recent turf a canvasser has been recording contacts against, used to attach a turf_id to a new prompt. */
export async function getCurrentTurfForUser(client: OrgTxClient, userId: string, campaignId: string): Promise<string | null> {
  const result = await client.query(
    `SELECT turf_id FROM contact_attempts WHERE canvasser_user_id = $1 AND campaign_id = $2 ORDER BY arrive_at DESC LIMIT 1`,
    [userId, campaignId]
  );
  return result.rows[0]?.turf_id ?? null;
}

export async function createPendingPhotoVerification(
  client: OrgTxClient,
  params: {
    shiftId: string;
    userId: string;
    campaignId: string;
    turfId: string | null;
    deviceId: string;
    intervalProfileId: string;
    intervalDrawn: number;
    doorsSinceLastPrompt: number;
    shiftPromptSequence: number;
  }
): Promise<{ id: string }> {
  const result = await client.query(
    `INSERT INTO photo_verifications
       (shift_id, user_id, campaign_id, turf_id, device_id, interval_profile_id, interval_drawn,
        doors_since_last_prompt, shift_prompt_sequence, prompted_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), 'pending')
     RETURNING id`,
    [
      params.shiftId,
      params.userId,
      params.campaignId,
      params.turfId,
      params.deviceId,
      params.intervalProfileId,
      params.intervalDrawn,
      params.doorsSinceLastPrompt,
      params.shiftPromptSequence,
    ]
  );
  return result.rows[0];
}

export async function getPhotoVerificationById(client: OrgTxClient, id: string): Promise<PhotoVerificationRow | null> {
  const result = await client.query(
    `SELECT id, shift_id, user_id, campaign_id, turf_id, status, interval_profile_id, interval_drawn,
            shift_prompt_sequence, prompted_at, deferral_count, deferred_until
     FROM photo_verifications WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export interface SubmitPhotoParams {
  id: string;
  objectKey: string;
  imageSha256: string;
  imageBytes: number;
  captureLat: number;
  captureLng: number;
  captureAccuracyM: number | null;
  captureAltitude: number | null;
  deviceHeading: number | null;
  deviceRecordedAt: string;
  deviceUptimeMs: number | null;
  mockLocationFlag: boolean;
  clockDeltaSeconds: number;
  insideTurf: boolean | null;
  distanceToTurfM: number | null;
  verificationScore: number;
  flagReasons: string[];
  status: string;
}

export async function updatePhotoVerificationSubmit(client: OrgTxClient, p: SubmitPhotoParams): Promise<void> {
  await client.query(
    `UPDATE photo_verifications SET
       object_key = $2, image_sha256 = $3, image_bytes = $4,
       capture_geom = ST_SetSRID(ST_MakePoint($5, $6), 4326), capture_accuracy_m = $7, capture_altitude = $8,
       device_heading = $9, device_recorded_at = $10, device_uptime_ms = $11,
       server_received_at = now(), clock_delta_seconds = $12, mock_location_flag = $13,
       inside_turf = $14, distance_to_turf_m = $15, verification_score = $16, flag_reasons = $17,
       captured_at = $10, submitted_at = now(), synced_at = now(),
       retention_expires_at = now() + interval '30 days',
       status = $18
     WHERE id = $1`,
    [
      p.id,
      p.objectKey,
      p.imageSha256,
      p.imageBytes,
      p.captureLng,
      p.captureLat,
      p.captureAccuracyM,
      p.captureAltitude,
      p.deviceHeading,
      p.deviceRecordedAt,
      p.deviceUptimeMs,
      p.clockDeltaSeconds,
      p.mockLocationFlag,
      p.insideTurf,
      p.distanceToTurfM,
      p.verificationScore,
      p.flagReasons,
      p.status,
    ]
  );
}

export async function deferPhotoVerification(
  client: OrgTxClient,
  id: string,
  deferSeconds: number
): Promise<{ deferredUntil: string; deferralCount: number } | null> {
  const result = await client.query(
    `UPDATE photo_verifications SET
       deferral_count = deferral_count + 1,
       total_deferred_seconds = total_deferred_seconds + $2,
       deferred_until = now() + ($2 || ' seconds')::interval,
       status = 'deferred'
     WHERE id = $1
     RETURNING deferred_until, deferral_count`,
    [id, deferSeconds]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { deferredUntil: row.deferred_until, deferralCount: row.deferral_count };
}

export async function getTurfGeomCheck(client: OrgTxClient, turfId: string, lat: number, lng: number, bufferM: number) {
  const result = await client.query(
    `SELECT
       ST_DWithin(geography(geom), geography(ST_SetSRID(ST_MakePoint($2, $3), 4326)), $4) AS inside,
       ST_Distance(geography(geom), geography(ST_SetSRID(ST_MakePoint($2, $3), 4326))) AS distance_m
     FROM turfs WHERE id = $1`,
    [turfId, lng, lat, bufferM]
  );
  return result.rows[0] ?? null;
}
