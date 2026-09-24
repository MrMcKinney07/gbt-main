import type { OrgTxClient } from "../lib/db.js";

export interface UserRow {
  id: string;
  org_id: string;
  email: string;
  status: string;
}

export async function getUserById(client: OrgTxClient, userId: string): Promise<UserRow | null> {
  const result = await client.query(`SELECT id, org_id, email, status FROM users WHERE id = $1`, [userId]);
  return result.rows[0] ?? null;
}

export interface CampaignRoleRow {
  campaignId: string;
  campaignName: string;
  role: string;
}

export async function getUserCampaignRoles(client: OrgTxClient, userId: string): Promise<CampaignRoleRow[]> {
  const result = await client.query(
    `SELECT ucr.campaign_id, c.name AS campaign_name, ucr.role
     FROM user_campaign_roles ucr
     JOIN campaigns c ON c.id = ucr.campaign_id
     WHERE ucr.user_id = $1 AND ucr.revoked_at IS NULL`,
    [userId]
  );
  return result.rows.map((r) => ({ campaignId: r.campaign_id, campaignName: r.campaign_name, role: r.role }));
}

export interface CampaignRow {
  id: string;
  org_id: string;
  jurisdiction_state: string;
}

export async function getCampaign(client: OrgTxClient, campaignId: string): Promise<CampaignRow | null> {
  const result = await client.query(`SELECT id, org_id, jurisdiction_state FROM campaigns WHERE id = $1`, [campaignId]);
  return result.rows[0] ?? null;
}

export async function hasLocationTrackingConsent(client: OrgTxClient, userId: string, state: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM consent_records
     WHERE user_id = $1 AND consent_type = 'location_tracking' AND jurisdiction_state = $2 AND withdrawn_at IS NULL
     LIMIT 1`,
    [userId, state]
  );
  return result.rowCount! > 0;
}

export async function hasDataLicense(client: OrgTxClient, campaignId: string, state: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM campaign_data_licenses WHERE campaign_id = $1 AND state = $2 LIMIT 1`,
    [campaignId, state]
  );
  return result.rowCount! > 0;
}

export interface PhotoIntervalProfileRow {
  id: string;
  min_doors: number;
  max_doors: number;
  mode_doors: number;
  beta_alpha: string;
  beta_beta: string;
  max_prompts_per_shift: number;
  min_minutes_between_prompts: number;
  defer_count_allowed: number;
  defer_seconds_each: number;
  blocking_after_defers: boolean;
}

export async function getPhotoIntervalProfileById(client: OrgTxClient, id: string): Promise<PhotoIntervalProfileRow | null> {
  const result = await client.query(
    `SELECT id, min_doors, max_doors, mode_doors, beta_alpha, beta_beta, max_prompts_per_shift,
            min_minutes_between_prompts, defer_count_allowed, defer_seconds_each, blocking_after_defers
     FROM photo_interval_profiles WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getDefaultPhotoIntervalProfile(client: OrgTxClient, campaignId: string): Promise<PhotoIntervalProfileRow | null> {
  const result = await client.query(
    `SELECT id, min_doors, max_doors, mode_doors, beta_alpha, beta_beta, max_prompts_per_shift,
            min_minutes_between_prompts, defer_count_allowed, defer_seconds_each, blocking_after_defers
     FROM photo_interval_profiles WHERE campaign_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] ?? null;
}

export interface ShiftRow {
  id: string;
  user_id: string;
  campaign_id: string;
  actual_start: string | null;
  actual_end: string | null;
  photo_interval_profile_id: string | null;
  photo_schedule_seed: Buffer | null;
}

export async function insertShift(
  client: OrgTxClient,
  params: {
    userId: string;
    campaignId: string;
    deviceId: string | null;
    consentRecordId: string | null;
    photoIntervalProfileId: string | null;
    photoScheduleSeed: Buffer;
  }
): Promise<ShiftRow> {
  const result = await client.query(
    `INSERT INTO shifts (user_id, campaign_id, actual_start, device_id, consent_record_id, photo_interval_profile_id, photo_schedule_seed)
     VALUES ($1, $2, now(), $3, $4, $5, $6)
     RETURNING id, user_id, campaign_id, actual_start, actual_end, photo_interval_profile_id, photo_schedule_seed`,
    [params.userId, params.campaignId, params.deviceId, params.consentRecordId, params.photoIntervalProfileId, params.photoScheduleSeed]
  );
  return result.rows[0];
}

export async function endShift(client: OrgTxClient, shiftId: string): Promise<ShiftRow | null> {
  const result = await client.query(
    `UPDATE shifts SET actual_end = now() WHERE id = $1 AND actual_end IS NULL
     RETURNING id, user_id, campaign_id, actual_start, actual_end, photo_interval_profile_id, photo_schedule_seed`,
    [shiftId]
  );
  return result.rows[0] ?? null;
}

export async function getShiftById(client: OrgTxClient, shiftId: string): Promise<ShiftRow | null> {
  const result = await client.query(
    `SELECT id, user_id, campaign_id, actual_start, actual_end, photo_interval_profile_id, photo_schedule_seed
     FROM shifts WHERE id = $1`,
    [shiftId]
  );
  return result.rows[0] ?? null;
}

export async function getActiveShiftForUser(client: OrgTxClient, userId: string, campaignId: string): Promise<ShiftRow | null> {
  const result = await client.query(
    `SELECT id, user_id, campaign_id, actual_start, actual_end, photo_interval_profile_id, photo_schedule_seed
     FROM shifts
     WHERE user_id = $1 AND campaign_id = $2 AND actual_start IS NOT NULL AND actual_end IS NULL
     ORDER BY actual_start DESC LIMIT 1`,
    [userId, campaignId]
  );
  return result.rows[0] ?? null;
}
