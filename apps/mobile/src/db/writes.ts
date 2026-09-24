import type { SQLiteDatabase } from './types';
import { enqueue } from './outbox';
import { setAccessStatus, type AccessStatus } from './localData';
import { uuidv4 } from '../utils/uuid';
import type { ContactAttemptPayload, PhotoVerificationSubmitPayload } from '../api/types';

/**
 * Domain-level "record a X" helpers. Each one does the local write FIRST — SQLite insert
 * (and, for a contact attempt / access report, an immediate local-state update) completes
 * before any network call is even attempted. Screens call these instead of touching
 * src/db/outbox.ts or src/api/client.ts directly, so "write local first, sync later" is
 * structural rather than a convention every screen has to remember.
 */

export async function recordContactAttempt(
  db: SQLiteDatabase,
  input: Omit<ContactAttemptPayload, 'idempotencyKey' | 'id' | 'recordedAt'>
): Promise<{ outboxId: string }> {
  const idempotencyKey = uuidv4();
  // `id` is client-generated per build-prompt section 4.5 ("id (uuid, generated on device)").
  // `recordedAt` (device clock at entry) is set alongside `arriveAt` here rather than asking
  // every caller to pass a near-duplicate timestamp.
  const payload: ContactAttemptPayload = {
    ...input,
    id: uuidv4(),
    recordedAt: input.arriveAt,
    idempotencyKey,
  };
  const row = await enqueue(db, {
    entityType: 'contact_attempt',
    endpoint: '/contact-attempts/batch',
    payload: payload as unknown as Record<string, unknown>,
    idempotencyKey,
  });
  return { outboxId: row.id };
}

export async function recordAccessReport(
  db: SQLiteDatabase,
  input: { addressId: string; accessStatus: AccessStatus; notes: string | null }
): Promise<{ outboxId: string }> {
  // Update the local mirror immediately so the door screen's banner reflects the change
  // without waiting on sync.
  await setAccessStatus(db, input.addressId, input.accessStatus, input.notes);

  const idempotencyKey = uuidv4();
  const row = await enqueue(db, {
    entityType: 'access_report',
    endpoint: '/access-reports',
    payload: { ...input, idempotencyKey },
    idempotencyKey,
  });
  return { outboxId: row.id };
}

export async function recordPhotoVerificationSubmission(
  db: SQLiteDatabase,
  verificationId: string,
  input: PhotoVerificationSubmitPayload
): Promise<{ outboxId: string }> {
  const idempotencyKey = uuidv4();
  const row = await enqueue(db, {
    entityType: 'photo_verification',
    endpoint: `/photo-verification/${verificationId}/submit`,
    payload: { verificationId, ...input, idempotencyKey },
    idempotencyKey,
  });
  return { outboxId: row.id };
}
