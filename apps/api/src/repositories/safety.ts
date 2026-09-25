import type { OrgTxClient } from "../lib/db.js";

/**
 * ============================================================================================
 * SAFETY REPOSITORY - firewall boundary, see docs/ARCHITECTURE.md section 8.0.
 *
 * This module may query: wellness_checks, safety_watchdog_state, safety_events, shifts
 * (including its safety columns), location_breadcrumbs, users, and - for label/location
 * purposes ONLY, never counts or scores - teams/team_members, turfs, contact_attempts (only
 * address_id/turf_id/arrive_at, i.e. "location+time only, never a count", exactly as
 * docs/API_CONTRACT.md specifies for lastDoorAddress/lastDoorAt), and addresses.
 *
 * This module must NEVER:
 *   - import anything from repositories/production-stats.ts, or vice versa.
 *   - reference the accountability/photo-verification table at all (its name is deliberately
 *     not typed anywhere in this file, including this comment - see
 *     test/safety-firewall.test.ts, which greps for it literally).
 *   - reference contact_attempts' scoring/fraud-flag columns, or aggregate/count
 *     contact_attempts for productivity purposes (same reason: those column names are not
 *     typed anywhere in this file either).
 *
 * apps/api/test/safety-firewall.test.ts greps this file's source for violations of both rules.
 * If you're extending this and find yourself wanting to add a doors/contacts count here, or a
 * verification score, stop - that belongs in production-stats.ts, and the two must stay separate.
 * ============================================================================================
 */

export interface SafetyBoardItem {
  id: string; // shift id, used as the queue row id
  userId: string;
  userName: string;
  teamName: string | null;
  timeDarkSeconds: number;
  watchdogStatus: string;
  lastKnownGeom: { lat: number; lng: number } | null;
  lastKnownAccuracyM: number | null;
  lastKnownAt: string | null;
  lastDoorAddress: string | null;
  lastDoorAt: string | null;
  batteryPct: number | null;
  turfName: string | null;
  escalationLevel: number;
  severity: "info" | "warning" | "critical";
}

const SAFETY_BOARD_QUERY = `
  WITH active_shifts AS (
    SELECT s.id AS shift_id, s.user_id, s.campaign_id, s.actual_start
    FROM shifts s
    WHERE s.campaign_id = $1 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL
  ),
  last_breadcrumb AS (
    SELECT DISTINCT ON (lb.shift_id)
      lb.shift_id, lb.geom, lb.accuracy_m, lb.recorded_at, lb.battery_pct
    FROM location_breadcrumbs lb
    JOIN active_shifts a ON a.shift_id = lb.shift_id
    ORDER BY lb.shift_id, lb.recorded_at DESC
  ),
  last_door AS (
    SELECT DISTINCT ON (ca.canvasser_user_id)
      ca.canvasser_user_id AS user_id, ca.arrive_at, ca.address_id, ca.turf_id
    FROM contact_attempts ca
    JOIN active_shifts a ON a.user_id = ca.canvasser_user_id AND a.campaign_id = ca.campaign_id
    ORDER BY ca.canvasser_user_id, ca.arrive_at DESC
  ),
  last_wellness AS (
    SELECT DISTINCT ON (wc.shift_id)
      wc.shift_id, wc.escalation_level, wc.response, wc.resolved_at
    FROM wellness_checks wc
    JOIN active_shifts a ON a.shift_id = wc.shift_id
    ORDER BY wc.shift_id, wc.triggered_at DESC
  ),
  open_safety_event AS (
    SELECT DISTINCT ON (se.shift_id)
      se.shift_id, se.type, se.severity AS event_severity
    FROM safety_events se
    JOIN active_shifts a ON a.shift_id = se.shift_id
    WHERE se.resolution_at IS NULL
    ORDER BY se.shift_id, se.triggered_at DESC
  )
  SELECT
    a.shift_id AS id,
    a.user_id,
    u.email AS user_name,
    t.name AS team_name,
    a.actual_start,
    COALESCE(sw.status, 'normal') AS watchdog_status,
    ST_Y(lb.geom) AS last_lat,
    ST_X(lb.geom) AS last_lng,
    lb.accuracy_m AS last_accuracy_m,
    lb.recorded_at AS last_known_at,
    lb.battery_pct,
    ldr.arrive_at AS last_door_at,
    addr.street_number, addr.street_name, addr.street_type, addr.city,
    trf.name AS turf_name,
    COALESCE(lw.escalation_level, 0) AS escalation_level,
    ose.event_severity,
    ose.type AS event_type
  FROM active_shifts a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN team_members tm ON tm.user_id = a.user_id AND tm.left_at IS NULL
  LEFT JOIN teams t ON t.id = tm.team_id
  LEFT JOIN safety_watchdog_state sw ON sw.shift_id = a.shift_id
  LEFT JOIN last_breadcrumb lb ON lb.shift_id = a.shift_id
  LEFT JOIN last_door ldr ON ldr.user_id = a.user_id
  LEFT JOIN addresses addr ON addr.id = ldr.address_id
  LEFT JOIN turfs trf ON trf.id = ldr.turf_id
  LEFT JOIN last_wellness lw ON lw.shift_id = a.shift_id
  LEFT JOIN open_safety_event ose ON ose.shift_id = a.shift_id
  WHERE COALESCE(sw.status, 'normal') NOT IN ('normal', 'resolved')
     OR ose.shift_id IS NOT NULL
     OR (lw.shift_id IS NOT NULL AND lw.resolved_at IS NULL)
  ORDER BY a.actual_start ASC
`;

function severityFor(watchdogStatus: string, eventSeverity: string | null, escalationLevel: number): SafetyBoardItem["severity"] {
  if (eventSeverity === "critical" || watchdogStatus === "idle_alert" || escalationLevel >= 2) return "critical";
  if (eventSeverity === "high" || watchdogStatus === "idle_warning" || escalationLevel >= 1) return "warning";
  return "info";
}

export async function getSafetyBoard(client: OrgTxClient, campaignId: string): Promise<SafetyBoardItem[]> {
  const result = await client.query(SAFETY_BOARD_QUERY, [campaignId]);
  return result.rows.map((row) => {
    const addressParts = [row.street_number, row.street_name, row.street_type].filter(Boolean).join(" ");
    const lastDoorAddress = addressParts ? `${addressParts}${row.city ? ", " + row.city : ""}` : null;
    const timeDarkSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(row.last_known_at ?? row.actual_start).getTime()) / 1000)
    );
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      teamName: row.team_name ?? null,
      timeDarkSeconds,
      watchdogStatus: row.watchdog_status,
      lastKnownGeom: row.last_lat != null ? { lat: row.last_lat, lng: row.last_lng } : null,
      lastKnownAccuracyM: row.last_accuracy_m,
      lastKnownAt: row.last_known_at,
      lastDoorAddress,
      lastDoorAt: row.last_door_at,
      batteryPct: row.battery_pct,
      turfName: row.turf_name ?? null,
      escalationLevel: row.escalation_level,
      severity: severityFor(row.watchdog_status, row.event_severity, row.escalation_level),
    };
  });
}

// --- Watchdog evaluation support -------------------------------------------------------------

export interface WatchdogShiftRow {
  shiftId: string;
  userId: string;
  campaignId: string;
  actualStart: string;
  windowSeconds: number;
  lastDoorActivityAt: string | null;
  lastMovementAt: string | null;
  movementRadiusM: number | null;
  status: string;
  pausedUntil: string | null;
}

/** Active shifts in this org, with their current watchdog state (creating a default row if missing). */
export async function getActiveShiftsForWatchdog(client: OrgTxClient): Promise<WatchdogShiftRow[]> {
  await client.query(
    `INSERT INTO safety_watchdog_state (shift_id, status, last_evaluated_at)
     SELECT s.id, 'normal', now()
     FROM shifts s
     WHERE s.actual_start IS NOT NULL AND s.actual_end IS NULL
     ON CONFLICT (shift_id) DO NOTHING`
  );
  const result = await client.query(
    `SELECT s.id AS shift_id, s.user_id, s.campaign_id, s.actual_start,
            sw.window_seconds, sw.last_door_activity_at, sw.last_movement_at,
            sw.movement_radius_m, sw.status, sw.paused_until
     FROM shifts s
     JOIN safety_watchdog_state sw ON sw.shift_id = s.id
     WHERE s.actual_start IS NOT NULL AND s.actual_end IS NULL`
  );
  return result.rows.map((r) => ({
    shiftId: r.shift_id,
    userId: r.user_id,
    campaignId: r.campaign_id,
    actualStart: r.actual_start,
    windowSeconds: r.window_seconds,
    lastDoorActivityAt: r.last_door_activity_at,
    lastMovementAt: r.last_movement_at,
    movementRadiusM: r.movement_radius_m,
    status: r.status,
    pausedUntil: r.paused_until,
  }));
}

/**
 * Most recent contact_attempt timestamp for this user/campaign AT OR AFTER `notBefore` (used
 * only as an activity signal, never counted) - callers pass the current shift's actual_start,
 * so a prior shift's last door (possibly hours or days old) never counts as "recent" activity
 * for a shift that just started. Returns null if no door has happened yet in that window, which
 * callers should treat as "not idle yet, anchor the idle clock at the shift start" rather than
 * "infinitely idle".
 */
export async function getLastDoorActivityAt(
  client: OrgTxClient,
  userId: string,
  campaignId: string,
  notBefore: string
): Promise<string | null> {
  const result = await client.query(
    `SELECT MAX(arrive_at) AS last_at FROM contact_attempts
     WHERE canvasser_user_id = $1 AND campaign_id = $2 AND arrive_at >= $3::timestamptz`,
    [userId, campaignId, notBefore]
  );
  return result.rows[0]?.last_at ?? null;
}

/** Recent breadcrumbs for a shift, used to compute movement radius (spread of recent positions). */
export async function getRecentBreadcrumbs(
  client: OrgTxClient,
  shiftId: string,
  sinceSeconds: number
): Promise<{ lat: number; lng: number; recordedAt: string }[]> {
  const result = await client.query(
    `SELECT ST_Y(geom) AS lat, ST_X(geom) AS lng, recorded_at
     FROM location_breadcrumbs
     WHERE shift_id = $1 AND recorded_at > now() - ($2 || ' seconds')::interval
     ORDER BY recorded_at ASC`,
    [shiftId, sinceSeconds]
  );
  return result.rows.map((r) => ({ lat: r.lat, lng: r.lng, recordedAt: r.recorded_at }));
}

export async function updateWatchdogState(
  client: OrgTxClient,
  shiftId: string,
  fields: Partial<{
    lastDoorActivityAt: string | null;
    lastMovementAt: string | null;
    movementRadiusM: number | null;
    idleSeconds: number | null;
    status: string;
  }>
): Promise<void> {
  await client.query(
    `UPDATE safety_watchdog_state SET
       last_door_activity_at = COALESCE($2, last_door_activity_at),
       last_movement_at = COALESCE($3, last_movement_at),
       movement_radius_m = COALESCE($4, movement_radius_m),
       idle_seconds = COALESCE($5, idle_seconds),
       status = COALESCE($6, status),
       last_evaluated_at = now()
     WHERE shift_id = $1`,
    [
      shiftId,
      fields.lastDoorActivityAt ?? null,
      fields.lastMovementAt ?? null,
      fields.movementRadiusM ?? null,
      fields.idleSeconds ?? null,
      fields.status ?? null,
    ]
  );
}

export async function findOpenWellnessCheck(client: OrgTxClient, shiftId: string) {
  const result = await client.query(
    `SELECT * FROM wellness_checks WHERE shift_id = $1 AND resolved_at IS NULL ORDER BY triggered_at DESC LIMIT 1`,
    [shiftId]
  );
  return result.rows[0] ?? null;
}

export async function createWellnessCheck(
  client: OrgTxClient,
  params: { shiftId: string; userId: string; idleSecondsAtTrigger: number; triggeredBy?: string }
): Promise<{ id: string }> {
  const result = await client.query(
    `INSERT INTO wellness_checks (shift_id, user_id, triggered_by, idle_seconds_at_trigger, prompted_at)
     VALUES ($1, $2, $3, $4, now())
     RETURNING id`,
    [params.shiftId, params.userId, params.triggeredBy ?? "inactivity_watchdog", params.idleSecondsAtTrigger]
  );
  return result.rows[0];
}

export async function escalateWellnessCheck(client: OrgTxClient, wellnessCheckId: string, escalationLevel: number): Promise<void> {
  await client.query(
    `UPDATE wellness_checks SET escalation_level = $2 WHERE id = $1`,
    [wellnessCheckId, escalationLevel]
  );
}

/**
 * Latest known lat/lng per active-shift user, for the live-ops roster's `lat`/`lng` fields.
 * This is the ONE piece of safety-table data (a live position) that the live-ops route (NOT
 * production-stats.ts) is allowed to merge alongside production numbers, because a manager
 * needs to see the dot on the map regardless of whether that agent currently has any open
 * safety item. It carries no watchdog/wellness state - just a point - so it does not leak
 * accountability data across the boundary in either direction.
 */
export async function getLastKnownLocations(
  client: OrgTxClient,
  campaignId: string
): Promise<{ userId: string; lat: number; lng: number; batteryPct: number | null }[]> {
  const result = await client.query(
    `SELECT DISTINCT ON (s.user_id) s.user_id, ST_Y(lb.geom) AS lat, ST_X(lb.geom) AS lng, lb.battery_pct
     FROM location_breadcrumbs lb
     JOIN shifts s ON s.id = lb.shift_id
     WHERE s.campaign_id = $1 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL
     ORDER BY s.user_id, lb.recorded_at DESC`,
    [campaignId]
  );
  return result.rows.map((r) => ({ userId: r.user_id, lat: r.lat, lng: r.lng, batteryPct: r.battery_pct }));
}

export async function createSafetyEvent(
  client: OrgTxClient,
  params: { shiftId: string; userId: string; type: string; severity: string; notes?: string | null }
): Promise<{ id: string }> {
  const result = await client.query(
    `INSERT INTO safety_events (shift_id, user_id, type, severity, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.shiftId, params.userId, params.type, params.severity, params.notes ?? null]
  );
  return result.rows[0];
}
