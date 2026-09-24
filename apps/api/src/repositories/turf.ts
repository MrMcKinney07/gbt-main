import type { OrgTxClient } from "../lib/db.js";
import { classifyOutOfTurf, CLASSIFICATION_RULE_VERSION } from "../lib/turfException.js";

export interface AssignmentRow {
  id: string;
  campaign_id: string;
  user_id: string;
  walkbook_id: string;
}

export async function getAssignmentById(client: OrgTxClient, assignmentId: string): Promise<AssignmentRow | null> {
  const result = await client.query(
    `SELECT id, campaign_id, user_id, walkbook_id FROM assignments WHERE id = $1`,
    [assignmentId]
  );
  return result.rows[0] ?? null;
}

export interface ContactAttemptInsert {
  id: string;
  idempotencyKey: string;
  campaignId: string;
  assignmentId: string;
  walkbookId: string;
  turfId: string;
  addressId: string;
  householdId: string;
  voterId: string | null;
  canvasserUserId: string;
  deviceId: string;
  resultCode: string;
  scope: string;
  arriveAt: string;
  arriveLat: number;
  arriveLng: number;
  arriveAccuracyM: number | null;
  arriveAltitude: number | null;
  arriveSpeedMps: number | null;
  departAt: string | null;
  departLat: number | null;
  departLng: number | null;
  departAccuracyM: number | null;
  durationSeconds: number | null;
  distanceToDoorM: number | null;
  recordedAt: string;
  deviceUptimeMs: number | null;
  mockLocationFlag: boolean;
  attestationTokenId: string | null;
  stepCountSinceLast: number | null;
  networkType: string | null;
  carrierMccMnc: string | null;
  observedIpCountry: string | null;
  notesText: string | null;
  notesSource: string | null;
  supersedesContactId: string | null;
}

export interface ContactAttemptRow {
  id: string;
  idempotency_key: string;
  campaign_id: string;
  assignment_id: string;
  walkbook_id: string;
  turf_id: string;
  address_id: string;
  canvasser_user_id: string;
  flag_status: string;
  arrive_lat: number;
  arrive_lng: number;
  arrive_accuracy_m: number | null;
  arrive_at: string;
}

const INSERT_COLUMNS = `
  id, idempotency_key, campaign_id, assignment_id, walkbook_id, turf_id, address_id, household_id,
  voter_id, canvasser_user_id, device_id, result_code, scope, arrive_at, arrive_geom,
  arrive_accuracy_m, arrive_altitude, arrive_speed_mps, depart_at, depart_geom, depart_accuracy_m,
  duration_seconds, distance_to_door_m, recorded_at, device_uptime_ms, mock_location_flag,
  attestation_token_id, step_count_since_last, network_type, carrier_mcc_mnc, observed_ip_country,
  notes_text, notes_source, supersedes_contact_id
`;

/**
 * Inserts a contact attempt, relying on the DB's UNIQUE(idempotency_key) constraint
 * (0005_contact_attempts.sql) for idempotency: ON CONFLICT DO NOTHING plus a re-select tells
 * the caller whether this was a fresh insert or a replay, rather than the API trying to
 * pre-check-then-insert (which would race under concurrent retries).
 */
export async function insertContactAttempt(
  client: OrgTxClient,
  input: ContactAttemptInsert
): Promise<{ row: ContactAttemptRow; created: boolean }> {
  const insertResult = await client.query(
    `INSERT INTO contact_attempts (${INSERT_COLUMNS})
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, ST_SetSRID(ST_MakePoint($15, $16), 4326),
       $17, $18, $19, $20, CASE WHEN $21::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($21, $22), 4326) END, $23,
       $24, $25, $26, $27, $28,
       $29, $30, $31, $32, $33,
       $34, $35, $36
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, idempotency_key, campaign_id, assignment_id, walkbook_id, turf_id, address_id,
               canvasser_user_id, flag_status, ST_Y(arrive_geom) AS arrive_lat, ST_X(arrive_geom) AS arrive_lng,
               arrive_accuracy_m, arrive_at`,
    [
      input.id,
      input.idempotencyKey,
      input.campaignId,
      input.assignmentId,
      input.walkbookId,
      input.turfId,
      input.addressId,
      input.householdId,
      input.voterId,
      input.canvasserUserId,
      input.deviceId,
      input.resultCode,
      input.scope,
      input.arriveAt,
      input.arriveLng, // $15 -> lng (x)
      input.arriveLat, // $16 -> lat (y)
      input.arriveAccuracyM,
      input.arriveAltitude,
      input.arriveSpeedMps,
      input.departAt,
      input.departLng, // $21
      input.departLat, // $22
      input.departAccuracyM,
      input.durationSeconds,
      input.distanceToDoorM,
      input.recordedAt,
      input.deviceUptimeMs,
      input.mockLocationFlag,
      input.attestationTokenId,
      input.stepCountSinceLast,
      input.networkType,
      input.carrierMccMnc,
      input.observedIpCountry,
      input.notesText,
      input.notesSource,
      input.supersedesContactId,
    ]
  );

  if (insertResult.rows[0]) {
    return { row: insertResult.rows[0], created: true };
  }

  const existing = await client.query(
    `SELECT id, idempotency_key, campaign_id, assignment_id, walkbook_id, turf_id, address_id,
            canvasser_user_id, flag_status, ST_Y(arrive_geom) AS arrive_lat, ST_X(arrive_geom) AS arrive_lng,
            arrive_accuracy_m, arrive_at
     FROM contact_attempts WHERE idempotency_key = $1`,
    [input.idempotencyKey]
  );
  return { row: existing.rows[0], created: false };
}

export interface TurfBoundaryCheckResult {
  insideTurf: boolean;
  distanceOutsideBoundaryM: number | null;
  classification: string | null;
}

/** Real PostGIS check: ST_Within for "inside", geography ST_Distance (true geodesic meters) for how far outside. */
export async function checkTurfBoundary(
  client: OrgTxClient,
  turfId: string,
  lat: number,
  lng: number
): Promise<TurfBoundaryCheckResult> {
  const result = await client.query(
    `SELECT
       ST_Within(ST_SetSRID(ST_MakePoint($2, $3), 4326), geom) AS inside,
       ST_Distance(geography(geom), geography(ST_SetSRID(ST_MakePoint($2, $3), 4326))) AS distance_m
     FROM turfs WHERE id = $1`,
    [turfId, lng, lat]
  );
  const row = result.rows[0];
  if (!row) return { insideTurf: false, distanceOutsideBoundaryM: null, classification: null };
  return {
    insideTurf: row.inside,
    distanceOutsideBoundaryM: row.inside ? 0 : Number(row.distance_m),
    classification: null,
  };
}

export async function getExceptionForContactAttempt(
  client: OrgTxClient,
  contactAttemptId: string
): Promise<{ classification: string; distanceOutsideBoundaryM: number } | null> {
  const result = await client.query(
    `SELECT classification, distance_outside_boundary_m FROM turf_boundary_exceptions WHERE contact_attempt_id = $1`,
    [contactAttemptId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { classification: row.classification, distanceOutsideBoundaryM: Number(row.distance_outside_boundary_m) };
}

export interface InsertOutOfTurfExceptionParams {
  contactAttemptId: string;
  assignmentId: string;
  walkbookId: string;
  turfId: string;
  userId: string;
  shiftId: string;
  campaignId: string;
  addressId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  distanceOutsideBoundaryM: number;
}

export async function insertOutOfTurfException(
  client: OrgTxClient,
  params: InsertOutOfTurfExceptionParams
): Promise<{ id: string; classification: string; distanceOutsideBoundaryM: number }> {
  const { classification, autoDisposition } = classifyOutOfTurf({
    distanceOutsideBoundaryM: params.distanceOutsideBoundaryM,
    accuracyM: params.accuracyM,
  });

  const result = await client.query(
    `INSERT INTO turf_boundary_exceptions
       (contact_attempt_id, assignment_id, walkbook_id, turf_id, user_id, shift_id, campaign_id,
        address_id, recorded_geom, gps_accuracy_m, distance_outside_boundary_m,
        classification, classification_rule_version, auto_disposition)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      params.contactAttemptId,
      params.assignmentId,
      params.walkbookId,
      params.turfId,
      params.userId,
      params.shiftId,
      params.campaignId,
      params.addressId,
      params.lng,
      params.lat,
      params.accuracyM,
      params.distanceOutsideBoundaryM,
      classification,
      CLASSIFICATION_RULE_VERSION,
      autoDisposition,
    ]
  );
  return { id: result.rows[0].id, classification, distanceOutsideBoundaryM: params.distanceOutsideBoundaryM };
}
