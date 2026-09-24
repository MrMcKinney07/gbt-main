// Shapes mirrored from docs/API_CONTRACT.md. Keep field names in sync with that file —
// it is the source of truth shared with apps/api and apps/mobile.

export interface CampaignRole {
  campaignId: string;
  role: string;
  campaignName?: string;
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

// ---- Live Ops (contract section "Manager console — Live Ops") ----

export interface HeaderTiles {
  agentsOnShift: number;
  agentsScheduled: number;
  doorsToday: number;
  contactsToday: number;
  contactRate: number;
  verifiedShare: number;
  turfsComplete: number;
  turfsTotal: number;
  openSafetyItems: number;
  openAccountabilityItems: number;
}

export type ShiftStatus = "on_shift" | "on_break" | "off_shift" | string;
export type PhotoStatus = "current" | "due" | "overdue" | "deferred" | string;

export interface RosterAgent {
  userId: string;
  userName: string;
  teamName: string;
  shiftStatus: ShiftStatus;
  doorsToday: number;
  contactsToday: number;
  contactRate: number;
  timeSinceLastDoorSeconds: number;
  photoStatus: PhotoStatus;
  outOfTurfCount: number;
  verificationScore: number;
  batteryPct: number;
  openFlags: number;
  lat: number;
  lng: number;
}

// ---- Safety (SAFETY family — never carries production/door-count fields) ----

export interface LatLng {
  lat: number;
  lng: number;
}

export type WatchdogStatus = "normal" | "warning" | "dark" | "sos" | string;
export type EscalationLevel =
  | "none"
  | "nudge_sent"
  | "wellness_check_sent"
  | "team_lead_notified"
  | "director_notified"
  | "emergency_contacted"
  | string;

export interface SafetyBoardItem {
  id: string;
  userId: string;
  userName: string;
  teamName: string;
  timeDarkSeconds: number;
  watchdogStatus: WatchdogStatus;
  lastKnownGeom: LatLng | null;
  lastKnownAccuracyM: number | null;
  lastKnownAt: string | null;
  lastDoorAddress: string | null;
  lastDoorAt: string | null;
  batteryPct: number | null;
  turfName: string | null;
  escalationLevel: EscalationLevel;
  severity: "low" | "medium" | "high" | "critical" | string;
}

export interface SafetyBoardResponse {
  items: SafetyBoardItem[];
}

// ---- Accountability alerts (Live Ops only) ----

export type AccountabilityAlertType =
  | "flagged_photo"
  | "flagged_contact"
  | "out_of_turf"
  | "attestation_failed";

export interface AccountabilityAlert {
  id: string;
  userId: string;
  userName: string;
  type: AccountabilityAlertType;
  severity: "low" | "medium" | "high" | "critical" | string;
  createdAt: string;
  summary: string;
}

export interface LiveOpsResponse {
  headerTiles: HeaderTiles;
  roster: RosterAgent[];
  // These two arrays are structurally separate in the API response and must stay that way
  // through every layer of the console. See docs/ARCHITECTURE.md section 8.0.
  safetyAlerts: SafetyBoardItem[];
  accountabilityAlerts: AccountabilityAlert[];
}

// ---- Wellness / row actions (best-effort against the contract; some are stubs) ----

export interface WellnessCheckResponseBody {
  response: "ok" | "need_help";
  responseMode: string;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
}
