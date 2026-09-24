/**
 * SAFETY module network calls. This file (and everything else under src/features/safety/)
 * must never import from src/features/verification/ — see docs/ARCHITECTURE.md's section
 * 8.0 and test/safety-firewall.test.ts, which asserts this at the source-file level.
 */
import type { ApiClient } from '../../api/client';
import type { Geom, WellnessResponseValue } from '../../api/types';

export async function respondToWellnessCheck(
  api: ApiClient,
  checkId: string,
  response: WellnessResponseValue,
  responseMode: string
): Promise<void> {
  await api.respondWellnessCheck(checkId, response, responseMode);
}

/** Called silently, in the background, only for the duress-PIN path. Never shown in the UI. */
export async function reportDuress(api: ApiClient, shiftId: string): Promise<void> {
  await api.postSafetyDuress(shiftId);
}

export async function sendSos(api: ApiClient, shiftId: string, geom: Geom) {
  return api.postSafetySos(shiftId, geom);
}
