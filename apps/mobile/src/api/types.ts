/**
 * Wire types mirroring docs/API_CONTRACT.md exactly (camelCase field names, same shapes).
 * Do not rename fields here without a matching change to that doc — see its own header note.
 */

export interface CampaignRole {
  campaignId: string;
  campaignName?: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  orgId: string;
  campaignRoles: CampaignRole[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface ShiftStartRequest {
  campaignId: string;
  deviceId: string;
  consentRecordIds: string[];
}

export interface ShiftStartResponse {
  id: string;
  actualStart: string;
  photoIntervalProfileId: string;
}

export interface ShiftStartError {
  error: 'consent_missing' | 'license_missing' | string;
  missing?: string[];
  state?: string;
  message?: string;
}

export interface Geom {
  lat: number;
  lng: number;
}

/**
 * Mirrors contact_attempts columns in camelCase, per API_CONTRACT.md. `id`, `campaignId`,
 * `assignmentId`, `walkbookId`, `turfId`, `deviceId`, and `householdId` are all required by
 * the API's actual validation (apps/api/src/services/verification/contactAttempt.ts) even
 * though they weren't spelled out in the original contract doc -- found by driving a real
 * submission end to end and getting `{"status":"error","error":"invalid_request"}` back for
 * every one of them despite an HTTP 200. `recordContactAttempt` (db/writes.ts) fills in `id`
 * and `recordedAt`; the caller (DoorScreen) supplies the rest from src/config/demoIds.ts.
 */
export interface ContactAttemptPayload {
  id: string;
  campaignId: string;
  assignmentId: string;
  walkbookId: string;
  turfId: string;
  addressId: string;
  householdId: string;
  voterId?: string;
  deviceId: string;
  shiftId: string;
  arriveAt: string;
  arriveGeom: Geom;
  arriveAccuracyM: number;
  recordedAt: string;
  resultCode: ContactResultCode;
  notes?: string;
  idempotencyKey: string;
}

// Must match db/migrations/0005_contact_attempts.sql's contact_result_code enum exactly --
// the API's resultCode validation is a bare z.string() (see
// apps/api/src/services/verification/contactAttempt.ts), so a value that isn't one of these
// passes the API's own validation and only fails at the Postgres INSERT, which the batch
// endpoint reports as a per-item error rather than surfacing loudly. Found live: this
// contained three drifted values (spoke_with_other, inaccessible_dog, vacant).
export type ContactResultCode =
  | 'spoke_with_target'
  | 'spoke_with_other_household_member'
  | 'not_home'
  | 'refused'
  | 'moved'
  | 'deceased'
  | 'language_barrier'
  | 'inaccessible_gate'
  | 'inaccessible_locked_building'
  | 'inaccessible_dog_hazard'
  | 'vacant_construction'
  | 'wrong_address'
  | 'left_literature';

export interface ContactAttemptResponse {
  id: string;
  flagStatus: string;
  outOfTurfException: null | { classification: string; distanceOutsideBoundaryM: number };
}

export interface BatchItemResult {
  idempotencyKey: string;
  status: 'created' | 'duplicate' | 'error';
  id?: string;
  error?: string;
}

export interface BatchResponse {
  results: BatchItemResult[];
}

export interface PhotoVerificationStatusResponse {
  due: boolean;
  verificationId?: string;
}

export interface PhotoVerificationSubmitPayload {
  imageBase64: string;
  capturedAt: string;
  captureGeom: Geom;
  captureAccuracyM: number;
  deviceUptimeMs: number;
  mockLocationFlag: boolean;
  faceDetected: boolean;
}

export interface PhotoVerificationSubmitResponse {
  status: string;
  insideTurf: boolean;
  verificationScore: number;
}

export interface PhotoVerificationDeferResponse {
  deferredUntil: string;
  deferralCount: number;
}

export type WellnessResponseValue = 'ok' | 'need_help';

export interface SafetySosResponse {
  safetyEventId: string;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
  // Endpoint-specific extensions seen in docs/API_CONTRACT.md (e.g. POST /shifts/start's
  // 403 consent_missing/license_missing responses put extra fields alongside `error`).
  missing?: string[];
  state?: string;
}
