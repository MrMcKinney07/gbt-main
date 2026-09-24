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

/** Mirrors contact_attempts columns in camelCase, per API_CONTRACT.md. */
export interface ContactAttemptPayload {
  addressId: string;
  householdId?: string;
  voterId?: string;
  shiftId: string;
  arriveAt: string;
  arriveGeom: Geom;
  arriveAccuracyM: number;
  resultCode: ContactResultCode;
  notes?: string;
  idempotencyKey: string;
}

export type ContactResultCode =
  | 'spoke_with_target'
  | 'spoke_with_other'
  | 'not_home'
  | 'refused'
  | 'moved'
  | 'deceased'
  | 'language_barrier'
  | 'inaccessible_gate'
  | 'inaccessible_locked_building'
  | 'inaccessible_dog'
  | 'vacant'
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
