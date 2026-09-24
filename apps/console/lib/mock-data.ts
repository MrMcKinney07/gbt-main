// Mock data matching docs/API_CONTRACT.md response shapes exactly, used only as a fallback
// when the live API at NEXT_PUBLIC_API_URL isn't reachable (see hooks in lib/use-live-data.ts).
// The single real seeded canvasser (Maria's assignment, db/seed.sql) is user
// 00000000-0000-0000-0000-000000000012; the rest of the roster below is invented so the
// board has enough agents to be worth looking at, scattered around the real demo turf's
// bounding box ("Sun Ray Estates A", see lib/constants.ts).

import type {
  AccountabilityAlert,
  HeaderTiles,
  LiveOpsResponse,
  RosterAgent,
  SafetyBoardItem,
  SafetyBoardResponse,
} from "./types";

const now = () => Date.now();
const minutesAgoIso = (m: number) => new Date(now() - m * 60_000).toISOString();

export const mockRoster: RosterAgent[] = [
  {
    userId: "00000000-0000-0000-0000-000000000012",
    userName: "Maria Gonzalez",
    teamName: "Team Alpha",
    shiftStatus: "on_shift",
    doorsToday: 47,
    contactsToday: 18,
    contactRate: 0.383,
    timeSinceLastDoorSeconds: 90,
    photoStatus: "current",
    outOfTurfCount: 0,
    verificationScore: 0.97,
    batteryPct: 71,
    openFlags: 0,
    lat: 38.5789,
    lng: -121.4907,
  },
  {
    userId: "10000000-0000-0000-0000-000000000101",
    userName: "Devon Marsh",
    teamName: "Team Alpha",
    shiftStatus: "on_shift",
    doorsToday: 12,
    contactsToday: 3,
    contactRate: 0.25,
    timeSinceLastDoorSeconds: 1320, // 22 min — stale
    photoStatus: "overdue",
    outOfTurfCount: 2,
    verificationScore: 0.41,
    batteryPct: 18,
    openFlags: 2,
    lat: 38.5762,
    lng: -121.4931,
  },
  {
    userId: "10000000-0000-0000-0000-000000000102",
    userName: "Priya Natarajan",
    teamName: "Team Bravo",
    shiftStatus: "on_shift",
    doorsToday: 33,
    contactsToday: 14,
    contactRate: 0.424,
    timeSinceLastDoorSeconds: 420, // 7 min — aging
    photoStatus: "due",
    outOfTurfCount: 0,
    verificationScore: 0.88,
    batteryPct: 54,
    openFlags: 0,
    lat: 38.5805,
    lng: -121.4872,
  },
  {
    userId: "10000000-0000-0000-0000-000000000103",
    userName: "Jalen Ortiz",
    teamName: "Team Bravo",
    shiftStatus: "on_break",
    doorsToday: 25,
    contactsToday: 9,
    contactRate: 0.36,
    timeSinceLastDoorSeconds: 2700, // 45 min — stale, on break so expected
    photoStatus: "current",
    outOfTurfCount: 0,
    verificationScore: 0.93,
    batteryPct: 62,
    openFlags: 0,
    lat: 38.5778,
    lng: -121.4889,
  },
  {
    userId: "10000000-0000-0000-0000-000000000104",
    userName: "Faith Okonkwo",
    teamName: "Team Alpha",
    shiftStatus: "on_shift",
    doorsToday: 51,
    contactsToday: 22,
    contactRate: 0.431,
    timeSinceLastDoorSeconds: 60,
    photoStatus: "current",
    outOfTurfCount: 0,
    verificationScore: 0.99,
    batteryPct: 88,
    openFlags: 0,
    lat: 38.5815,
    lng: -121.4913,
  },
  {
    userId: "10000000-0000-0000-0000-000000000105",
    userName: "Ben Coultas",
    teamName: "Team Bravo",
    shiftStatus: "on_shift",
    doorsToday: 6,
    contactsToday: 1,
    contactRate: 0.166,
    timeSinceLastDoorSeconds: 4200, // 70 min — the safety-alert agent
    photoStatus: "current",
    outOfTurfCount: 0,
    verificationScore: 0.9,
    batteryPct: 9,
    openFlags: 0,
    lat: 38.5751,
    lng: -121.4863,
  },
];

export const mockHeaderTiles: HeaderTiles = {
  agentsOnShift: 5,
  agentsScheduled: 8,
  doorsToday: 174,
  contactsToday: 67,
  contactRate: 0.385,
  verifiedShare: 0.91,
  turfsComplete: 3,
  turfsTotal: 11,
  openSafetyItems: 1,
  openAccountabilityItems: 2,
};

export const mockSafetyAlerts: SafetyBoardItem[] = [
  {
    id: "sa-1",
    userId: "10000000-0000-0000-0000-000000000105",
    userName: "Ben Coultas",
    teamName: "Team Bravo",
    timeDarkSeconds: 4200,
    watchdogStatus: "dark",
    lastKnownGeom: { lat: 38.5751, lng: -121.4863 },
    lastKnownAccuracyM: 12,
    lastKnownAt: minutesAgoIso(70),
    lastDoorAddress: "588 Fig Ave, Sacramento, CA",
    lastDoorAt: minutesAgoIso(70),
    batteryPct: 9,
    turfName: "Sun Ray Estates A",
    escalationLevel: "team_lead_notified",
    severity: "high",
  },
];

export const mockAccountabilityAlerts: AccountabilityAlert[] = [
  {
    id: "aa-1",
    userId: "10000000-0000-0000-0000-000000000101",
    userName: "Devon Marsh",
    type: "flagged_photo",
    severity: "high",
    createdAt: minutesAgoIso(14),
    summary: "Verification photo scored 0.41 — outside expected geofence radius.",
  },
  {
    id: "aa-2",
    userId: "10000000-0000-0000-0000-000000000101",
    userName: "Devon Marsh",
    type: "out_of_turf",
    severity: "medium",
    createdAt: minutesAgoIso(31),
    summary: "2 contact attempts logged outside assigned turf boundary.",
  },
];

export const mockLiveOps: LiveOpsResponse = {
  headerTiles: mockHeaderTiles,
  roster: mockRoster,
  safetyAlerts: mockSafetyAlerts,
  accountabilityAlerts: mockAccountabilityAlerts,
};

export const mockSafetyBoard: SafetyBoardResponse = {
  items: [
    mockSafetyAlerts[0],
    {
      id: "sb-2",
      userId: "10000000-0000-0000-0000-000000000103",
      userName: "Jalen Ortiz",
      teamName: "Team Bravo",
      timeDarkSeconds: 2700,
      watchdogStatus: "warning",
      lastKnownGeom: { lat: 38.5778, lng: -121.4889 },
      lastKnownAccuracyM: 20,
      lastKnownAt: minutesAgoIso(45),
      lastDoorAddress: "214 Birchwood Ct, Sacramento, CA",
      lastDoorAt: minutesAgoIso(45),
      batteryPct: 62,
      turfName: "Sun Ray Estates A",
      escalationLevel: "nudge_sent",
      severity: "medium",
    },
    {
      id: "sb-3",
      userId: "10000000-0000-0000-0000-000000000106",
      userName: "Casey Whitfield",
      teamName: "Team Alpha",
      timeDarkSeconds: 960,
      watchdogStatus: "warning",
      lastKnownGeom: { lat: 38.5798, lng: -121.4922 },
      lastKnownAccuracyM: 35,
      lastKnownAt: minutesAgoIso(16),
      lastDoorAddress: "77 Larkspur Rd, Sacramento, CA",
      lastDoorAt: minutesAgoIso(16),
      batteryPct: 44,
      turfName: "Sun Ray Estates A",
      escalationLevel: "none",
      severity: "low",
    },
  ],
};
