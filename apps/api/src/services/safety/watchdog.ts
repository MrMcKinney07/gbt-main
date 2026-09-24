import { withOrgTx, type OrgTxClient } from "../../lib/db.js";
import { config } from "../../lib/config.js";
import { movementRadiusMeters } from "../../lib/geo.js";
import {
  createSafetyEvent,
  createWellnessCheck,
  escalateWellnessCheck,
  findOpenWellnessCheck,
  getActiveShiftsForWatchdog,
  getLastDoorActivityAt,
  getRecentBreadcrumbs,
  updateWatchdogState,
} from "../../repositories/safety.js";
import { lookupAllOrgIds } from "../../lib/orgList.js";

/**
 * SAFETY watchdog evaluation - build prompt section 8.3's escalation ladder, implemented for
 * real (not stubbed), run on an in-process `setInterval` for this demo build. See
 * apps/api/README.md "What's simplified": a production deployment would run this as a
 * dedicated scheduled worker process, not inline in the API process - an API restart currently
 * drops in-flight timers, and this doesn't horizontally scale (two API processes would both
 * evaluate the same shifts). The *decisions* it makes (when to warn, when to create a wellness
 * check, when to escalate) are real; only the delivery mechanism (push/SMS to the canvasser) is
 * stubbed, per docs/ARCHITECTURE.md "what's deliberately not built here".
 *
 * Ladder (demo-friendly windows, configurable via env - see .env.example):
 *   1. No door activity for `idleWarningSeconds` AND movement radius below threshold -> idle_warning.
 *   2. Still idle `wellnessCheckDelaySeconds` later -> create a wellness_check (safety-only; this
 *      never touches photo_verifications or any scoring table).
 *   3. Still idle/unresponded `escalationDelaySeconds` after that -> idle_alert + a safety_event.
 *   4. Door activity or movement resumes at any point -> reset to normal (and auto-resolve an
 *      open, not-yet-escalated wellness check as a benign resume; an already-escalated one still
 *      needs a human to resolve it, consistent with docs/SCOPE.md answer 10: no auto-resolution
 *      of anything that reached a human-visible safety event).
 */

let intervalHandle: NodeJS.Timeout | null = null;

export function startWatchdog(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runWatchdogTick().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[watchdog] tick failed", err);
    });
  }, config.watchdog.pollIntervalSeconds * 1000);
  intervalHandle.unref?.();
}

export function stopWatchdog(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export async function runWatchdogTick(): Promise<void> {
  const orgIds = await lookupAllOrgIds();
  for (const orgId of orgIds) {
    await withOrgTx(orgId, evaluateOrgWatchdog);
  }
}

async function evaluateOrgWatchdog(client: OrgTxClient): Promise<void> {
  const shifts = await getActiveShiftsForWatchdog(client);
  const now = Date.now();
  const T1 = config.watchdog.idleWarningSeconds;
  const T2 = T1 + config.watchdog.wellnessCheckDelaySeconds;
  const T3 = T2 + config.watchdog.escalationDelaySeconds;

  for (const shift of shifts) {
    if (shift.status === "paused_break" || shift.status === "suppressed") continue;

    const lastDoorAt = (await getLastDoorActivityAt(client, shift.userId, shift.campaignId)) ?? null;
    const anchorTime = lastDoorAt ? new Date(lastDoorAt).getTime() : now; // no doors yet: treat "now" as not-yet-idle
    const doorGapSeconds = Math.max(0, Math.floor((now - anchorTime) / 1000));

    const breadcrumbs = await getRecentBreadcrumbs(client, shift.shiftId, shift.windowSeconds);
    const movementRadiusM = movementRadiusMeters(breadcrumbs);

    const isIdleCandidate = doorGapSeconds >= T1 && movementRadiusM < config.watchdog.movementRadiusThresholdM;

    if (!isIdleCandidate) {
      if (shift.status !== "normal") {
        const open = await findOpenWellnessCheck(client, shift.shiftId);
        if (open && open.escalation_level === 0) {
          // Benign resume before anything reached a human - safe to auto-resolve.
          await client.query(
            `UPDATE wellness_checks SET resolved_at = now(), resolution_note = 'auto-resolved: activity resumed' WHERE id = $1`,
            [open.id]
          );
        }
      }
      await updateWatchdogState(client, shift.shiftId, {
        lastDoorActivityAt: lastDoorAt,
        movementRadiusM,
        idleSeconds: doorGapSeconds,
        status: "normal",
      });
      continue;
    }

    if (doorGapSeconds < T2) {
      await updateWatchdogState(client, shift.shiftId, {
        lastDoorActivityAt: lastDoorAt,
        movementRadiusM,
        idleSeconds: doorGapSeconds,
        status: "idle_warning",
      });
      continue;
    }

    const openCheck = await findOpenWellnessCheck(client, shift.shiftId);

    if (doorGapSeconds < T3) {
      if (!openCheck) {
        await createWellnessCheck(client, {
          shiftId: shift.shiftId,
          userId: shift.userId,
          idleSecondsAtTrigger: doorGapSeconds,
        });
      }
      await updateWatchdogState(client, shift.shiftId, {
        lastDoorActivityAt: lastDoorAt,
        movementRadiusM,
        idleSeconds: doorGapSeconds,
        status: "idle_warning",
      });
      continue;
    }

    // T3+ elapsed: escalate if the wellness check is still unresponded.
    if (openCheck && !openCheck.responded_at) {
      await escalateWellnessCheck(client, openCheck.id, (openCheck.escalation_level ?? 0) + 1);
      await createSafetyEvent(client, {
        shiftId: shift.shiftId,
        userId: shift.userId,
        type: "no_response",
        severity: "high",
        notes: `Inactivity watchdog: no door activity or movement for ${doorGapSeconds}s, wellness check unresponded.`,
      });
    } else if (!openCheck) {
      // Edge case: check got resolved between ticks but idle continues - open a fresh one.
      await createWellnessCheck(client, {
        shiftId: shift.shiftId,
        userId: shift.userId,
        idleSecondsAtTrigger: doorGapSeconds,
      });
    }
    await updateWatchdogState(client, shift.shiftId, {
      lastDoorActivityAt: lastDoorAt,
      movementRadiusM,
      idleSeconds: doorGapSeconds,
      status: "idle_alert",
    });
  }
}
