/**
 * ACCOUNTABILITY module network calls. This file (and everything else under
 * src/features/verification/) must never import from src/features/safety/ — see
 * docs/ARCHITECTURE.md's section 8.0 and test/safety-firewall.test.ts.
 */
import type { ApiClient } from '../../api/client';
import type { PhotoVerificationStatusResponse } from '../../api/types';

export async function checkPhotoVerificationDue(
  api: ApiClient,
  shiftId: string
): Promise<PhotoVerificationStatusResponse> {
  return api.getPhotoVerificationStatus(shiftId);
}

export async function deferPhotoVerification(api: ApiClient, verificationId: string) {
  return api.deferPhotoVerification(verificationId);
}
