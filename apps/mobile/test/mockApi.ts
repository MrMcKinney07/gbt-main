import type { ApiClient } from '../src/api/client';
import type {
  BatchItemResult,
  BatchResponse,
  ContactAttemptPayload,
} from '../src/api/types';

/**
 * A configurable fake ApiClient for tests — this is the "mockable API client module" the
 * offline-first logic is built against, so outbox/sync tests never need a running
 * apps/api server. Each method call is recorded in `.calls` for assertions.
 */
export interface MockApiClient extends ApiClient {
  calls: {
    postContactAttemptsBatch: ContactAttemptPayload[][];
    submitPhotoVerification: { verificationId: string; payload: unknown }[];
    postAccessReport: unknown[];
    respondWellnessCheck: { checkId: string; response: string; responseMode: string }[];
    postSafetyDuress: string[];
    postSafetySos: string[];
  };
}

export interface MockApiOptions {
  /** Decide per-batch how the server responds, including simulating a hard failure. */
  batchResponder?: (items: ContactAttemptPayload[]) => BatchResponse | 'network_error';
  singleItemResponder?: (entity: 'photo_verification' | 'access_report') => 'ok' | 'network_error';
}

export function createMockApiClient(opts: MockApiOptions = {}): MockApiClient {
  const calls: MockApiClient['calls'] = {
    postContactAttemptsBatch: [],
    submitPhotoVerification: [],
    postAccessReport: [],
    respondWellnessCheck: [],
    postSafetyDuress: [],
    postSafetySos: [],
  };

  return {
    calls,
    login: async () => {
      throw new Error('not implemented in mock');
    },
    startShift: async () => {
      throw new Error('not implemented in mock');
    },
    endShift: async () => {
      throw new Error('not implemented in mock');
    },
    postContactAttempt: async () => {
      throw new Error('not implemented in mock');
    },
    postContactAttemptsBatch: async (items) => {
      calls.postContactAttemptsBatch.push(items);
      const outcome = opts.batchResponder
        ? opts.batchResponder(items)
        : ({
            results: items.map((i) => ({ idempotencyKey: i.idempotencyKey, status: 'created', id: 'srv-' + i.idempotencyKey })),
          } satisfies BatchResponse);
      if (outcome === 'network_error') {
        throw new Error('simulated network failure');
      }
      return outcome;
    },
    getPhotoVerificationStatus: async () => ({ due: false }),
    submitPhotoVerification: async (verificationId, payload) => {
      calls.submitPhotoVerification.push({ verificationId, payload });
      if (opts.singleItemResponder?.('photo_verification') === 'network_error') {
        throw new Error('simulated network failure');
      }
      return { status: 'accepted', insideTurf: true, verificationScore: 0.9 };
    },
    deferPhotoVerification: async () => ({ deferredUntil: new Date().toISOString(), deferralCount: 1 }),
    respondWellnessCheck: async (checkId, response, responseMode) => {
      calls.respondWellnessCheck.push({ checkId, response, responseMode });
    },
    postSafetyDuress: async (shiftId) => {
      calls.postSafetyDuress.push(shiftId);
    },
    postSafetySos: async (shiftId) => {
      calls.postSafetySos.push(shiftId);
      return { safetyEventId: 'evt-' + shiftId };
    },
    postAccessReport: async (payload) => {
      calls.postAccessReport.push(payload);
      if (opts.singleItemResponder?.('access_report') === 'network_error') {
        throw new Error('simulated network failure');
      }
      return { id: 'ar-' + Date.now() };
    },
  };
}

/** Convenience: a batch responder that marks specific idempotency keys as server errors. */
export function failSpecificKeys(keys: Set<string>): NonNullable<MockApiOptions['batchResponder']> {
  return (items) => {
    const results: BatchItemResult[] = items.map((i) =>
      keys.has(i.idempotencyKey)
        ? { idempotencyKey: i.idempotencyKey, status: 'error', error: 'simulated server error' }
        : { idempotencyKey: i.idempotencyKey, status: 'created', id: 'srv-' + i.idempotencyKey }
    );
    return { results };
  };
}
