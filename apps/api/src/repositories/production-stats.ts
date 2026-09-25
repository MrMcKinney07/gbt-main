import type { OrgTxClient } from "../lib/db.js";

/**
 * ============================================================================================
 * PRODUCTION STATS REPOSITORY - firewall boundary, see docs/ARCHITECTURE.md section 8.0.
 *
 * This module may query: contact_attempts (including its scoring/flag columns - that's exactly
 * what accountability scoring is for), shifts (non-safety columns only - never its watchdog
 * columns or its safety child tables), the photo-verification table, and users.
 *
 * This module must NEVER reference any of the four safety-only tables (the inactivity
 * watchdog's state table, the wellness-check table, the location-breadcrumb table, or the
 * safety-event table - none of those names are typed anywhere in this file, including this
 * comment, on purpose), and must never import anything from repositories/safety.ts.
 *
 * apps/api/test/safety-firewall.test.ts greps this file's source for those table names
 * literally and fails the build if any of them appear. If you're extending this and find
 * yourself wanting to pull in idle time, watchdog trips, or wellness-check counts to "enrich"
 * a productivity number, stop and re-read docs/ARCHITECTURE.md section 8.0 - that's precisely
 * the failure mode this separation exists to prevent.
 * ============================================================================================
 */

export interface AgentProductionStats {
  userId: string;
  userName: string;
  teamName: string | null;
  shifts: number;
  hours: number;
  doors: number;
  contacts: number;
  contactRate: number;
  verifiedShare: number;
  doorsPerHour: number;
  avgDoorDurationSeconds: number | null;
  surveyCompletionRate: number;
}

export type ProductionPeriod = "today" | "week" | "all";

function periodStartExpr(period: ProductionPeriod): string {
  switch (period) {
    case "today":
      return "date_trunc('day', now())";
    case "week":
      return "date_trunc('week', now())";
    default:
      return "'epoch'::timestamptz";
  }
}

export async function getProductionStats(
  client: OrgTxClient,
  campaignId: string,
  period: ProductionPeriod
): Promise<AgentProductionStats[]> {
  const periodStart = periodStartExpr(period);
  const result = await client.query(
    `
    WITH period_shifts AS (
      SELECT s.id, s.user_id, s.actual_start, s.actual_end
      FROM shifts s
      WHERE s.campaign_id = $1 AND s.actual_start >= ${periodStart}
    ),
    shift_agg AS (
      SELECT user_id,
             COUNT(*) AS shift_count,
             SUM(EXTRACT(EPOCH FROM (COALESCE(actual_end, now()) - actual_start))) / 3600.0 AS hours
      FROM period_shifts
      GROUP BY user_id
    ),
    contact_agg AS (
      SELECT ca.canvasser_user_id AS user_id,
             COUNT(*) AS doors,
             COUNT(*) FILTER (WHERE ca.result_code IN ('spoke_with_target', 'spoke_with_other_household_member')) AS contacts,
             COUNT(*) FILTER (WHERE ca.verification_score IS NOT NULL) AS verified_count,
             AVG(ca.duration_seconds) FILTER (WHERE ca.duration_seconds IS NOT NULL) AS avg_door_duration,
             COUNT(*) FILTER (WHERE ca.survey_response_id IS NOT NULL) AS surveys_completed
      FROM contact_attempts ca
      WHERE ca.campaign_id = $1 AND ca.arrive_at >= ${periodStart}
      GROUP BY ca.canvasser_user_id
    )
    SELECT
      u.id AS user_id,
      u.email AS user_name,
      t.name AS team_name,
      COALESCE(sa.shift_count, 0) AS shift_count,
      COALESCE(sa.hours, 0) AS hours,
      COALESCE(ca.doors, 0) AS doors,
      COALESCE(ca.contacts, 0) AS contacts,
      COALESCE(ca.verified_count, 0) AS verified_count,
      ca.avg_door_duration,
      COALESCE(ca.surveys_completed, 0) AS surveys_completed
    FROM users u
    JOIN user_campaign_roles ucr ON ucr.user_id = u.id AND ucr.campaign_id = $1 AND ucr.role = 'canvasser' AND ucr.revoked_at IS NULL
    LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.left_at IS NULL
    LEFT JOIN teams t ON t.id = tm.team_id
    LEFT JOIN shift_agg sa ON sa.user_id = u.id
    LEFT JOIN contact_agg ca ON ca.user_id = u.id
    WHERE sa.shift_count IS NOT NULL OR ca.doors IS NOT NULL
    ORDER BY u.email
    `,
    [campaignId]
  );

  return result.rows.map((row) => {
    const doors = Number(row.doors);
    const contacts = Number(row.contacts);
    const hours = Number(row.hours) || 0;
    const verified = Number(row.verified_count);
    const surveys = Number(row.surveys_completed);
    return {
      userId: row.user_id,
      userName: row.user_name,
      teamName: row.team_name ?? null,
      shifts: Number(row.shift_count),
      hours: Math.round(hours * 100) / 100,
      doors,
      contacts,
      contactRate: doors > 0 ? Math.round((contacts / doors) * 1000) / 1000 : 0,
      verifiedShare: doors > 0 ? Math.round((verified / doors) * 1000) / 1000 : 0,
      doorsPerHour: hours > 0 ? Math.round((doors / hours) * 100) / 100 : 0,
      avgDoorDurationSeconds: row.avg_door_duration != null ? Math.round(Number(row.avg_door_duration)) : null,
      surveyCompletionRate: doors > 0 ? Math.round((surveys / doors) * 1000) / 1000 : 0,
    };
  });
}

export interface AccountabilityAlert {
  id: string;
  userId: string;
  userName: string;
  type: "flagged_photo" | "flagged_contact" | "out_of_turf" | "attestation_failed";
  severity: string;
  createdAt: string;
  summary: string;
}

/**
 * Accountability-side alerts for the live-ops board's `accountabilityAlerts` array. Sourced
 * from the photo-verification table, contact_attempts' own flag columns, and
 * turf_boundary_exceptions - all accountability tables, never the safety ones. `attestation_failed`
 * is not populated: this build stores device attestation status only at enrollment
 * (devices.attestation_status) and doesn't re-check it as a live signal, so there is currently
 * no code path that would ever produce that alert type - it's listed for contract completeness.
 */
export async function getAccountabilityAlerts(client: OrgTxClient, campaignId: string): Promise<AccountabilityAlert[]> {
  const result = await client.query(
    `
    SELECT id, user_id, user_name, type, severity, created_at, summary FROM (
      SELECT pv.id, pv.user_id, u.email AS user_name, 'flagged_photo' AS type,
             CASE WHEN pv.status = 'auto_flagged' THEN 'warning' ELSE 'info' END AS severity,
             COALESCE(pv.submitted_at, pv.prompted_at, now()) AS created_at,
             'Photo verification ' || pv.status || ' (score ' || COALESCE(pv.verification_score::text, 'n/a') || ')' AS summary
      FROM photo_verifications pv
      JOIN users u ON u.id = pv.user_id
      WHERE pv.campaign_id = $1 AND pv.status IN ('auto_flagged', 'in_review')

      UNION ALL

      SELECT ca.id, ca.canvasser_user_id AS user_id, u.email AS user_name, 'flagged_contact' AS type,
             CASE WHEN ca.flag_status = 'confirmed_bad' THEN 'critical' ELSE 'warning' END AS severity,
             ca.synced_at AS created_at,
             'Contact attempt flagged: ' || array_to_string(ca.flag_reasons, ', ') AS summary
      FROM contact_attempts ca
      JOIN users u ON u.id = ca.canvasser_user_id
      WHERE ca.campaign_id = $1 AND ca.flag_status IN ('auto_flagged', 'in_review', 'confirmed_bad')

      UNION ALL

      SELECT tbe.id, tbe.user_id, u.email AS user_name, 'out_of_turf' AS type,
             CASE WHEN tbe.auto_disposition = 'suspicious' THEN 'critical' ELSE 'warning' END AS severity,
             tbe.created_at,
             'Out-of-turf contact: ' || tbe.classification || ' (' || round(tbe.distance_outside_boundary_m) || 'm outside)' AS summary
      FROM turf_boundary_exceptions tbe
      JOIN users u ON u.id = tbe.user_id
      WHERE tbe.campaign_id = $1 AND tbe.disposition = 'unreviewed' AND tbe.auto_disposition IN ('needs_review', 'suspicious')
    ) alerts
    ORDER BY created_at DESC
    LIMIT 200
    `,
    [campaignId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    type: r.type,
    severity: r.severity,
    createdAt: r.created_at,
    summary: r.summary,
  }));
}

/** Roster-level production fields for the live-ops board (per-agent, current shift only). */
export async function getRosterProductionFields(client: OrgTxClient, campaignId: string) {
  const result = await client.query(
    `
    WITH active_shifts AS (
      SELECT s.id AS shift_id, s.user_id, s.campaign_id, s.actual_start
      FROM shifts s
      WHERE s.campaign_id = $1 AND s.actual_start IS NOT NULL AND s.actual_end IS NULL
    ),
    today_contacts AS (
      SELECT ca.canvasser_user_id AS user_id,
             COUNT(*) AS doors_today,
             COUNT(*) FILTER (WHERE ca.result_code IN ('spoke_with_target', 'spoke_with_other_household_member')) AS contacts_today,
             MAX(ca.arrive_at) AS last_door_at,
             COUNT(*) FILTER (WHERE ca.flag_status != 'none') AS open_flags,
             AVG(ca.verification_score) FILTER (WHERE ca.verification_score IS NOT NULL) AS avg_verification_score
      FROM contact_attempts ca
      JOIN active_shifts a ON a.user_id = ca.canvasser_user_id AND a.campaign_id = ca.campaign_id
      WHERE ca.arrive_at >= date_trunc('day', now())
      GROUP BY ca.canvasser_user_id
    ),
    turf_exceptions AS (
      SELECT tbe.user_id, COUNT(*) AS out_of_turf_count
      FROM turf_boundary_exceptions tbe
      JOIN active_shifts a ON a.user_id = tbe.user_id
      WHERE tbe.created_at >= date_trunc('day', now())
      GROUP BY tbe.user_id
    ),
    latest_photo_status AS (
      SELECT DISTINCT ON (pv.user_id) pv.user_id, pv.status
      FROM photo_verifications pv
      JOIN active_shifts a ON a.shift_id = pv.shift_id
      ORDER BY pv.user_id, COALESCE(pv.submitted_at, pv.prompted_at) DESC NULLS LAST
    )
    SELECT
      a.user_id, a.shift_id, u.email AS user_name, t.name AS team_name,
      COALESCE(tc.doors_today, 0) AS doors_today,
      COALESCE(tc.contacts_today, 0) AS contacts_today,
      tc.last_door_at,
      COALESCE(tc.open_flags, 0) AS open_flags,
      tc.avg_verification_score,
      COALESCE(te.out_of_turf_count, 0) AS out_of_turf_count,
      lps.status AS photo_status
    FROM active_shifts a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN team_members tm ON tm.user_id = a.user_id AND tm.left_at IS NULL
    LEFT JOIN teams t ON t.id = tm.team_id
    LEFT JOIN today_contacts tc ON tc.user_id = a.user_id
    LEFT JOIN turf_exceptions te ON te.user_id = a.user_id
    LEFT JOIN latest_photo_status lps ON lps.user_id = a.user_id
    `,
    [campaignId]
  );
  return result.rows;
}
