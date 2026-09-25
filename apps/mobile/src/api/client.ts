import type {
  BatchResponse,
  ContactAttemptPayload,
  ContactAttemptResponse,
  LoginResponse,
  PhotoVerificationDeferResponse,
  PhotoVerificationStatusResponse,
  PhotoVerificationSubmitPayload,
  PhotoVerificationSubmitResponse,
  SafetySosResponse,
  ShiftStartRequest,
  ShiftStartResponse,
  WellnessResponseValue,
  Geom,
  ApiErrorBody,
} from './types';

/**
 * Everything the app needs from the backend, as an interface — this is what makes the
 * offline-first logic testable independently of whether apps/api is reachable. Production
 * code gets `createHttpApiClient()`; tests get `createMockApiClient()` (see test/mockApi.ts)
 * which can simulate network failure, partial batch success, and duplicates without a
 * running server.
 */
export interface ApiClient {
  login(email: string, password: string): Promise<LoginResponse>;
  startShift(input: ShiftStartRequest): Promise<ShiftStartResponse>;
  endShift(shiftId: string): Promise<{ id: string; actualEnd: string }>;
  postContactAttempt(payload: ContactAttemptPayload): Promise<ContactAttemptResponse>;
  postContactAttemptsBatch(items: ContactAttemptPayload[]): Promise<BatchResponse>;
  getPhotoVerificationStatus(shiftId: string): Promise<PhotoVerificationStatusResponse>;
  submitPhotoVerification(
    verificationId: string,
    payload: PhotoVerificationSubmitPayload
  ): Promise<PhotoVerificationSubmitResponse>;
  deferPhotoVerification(verificationId: string): Promise<PhotoVerificationDeferResponse>;
  respondWellnessCheck(
    checkId: string,
    response: WellnessResponseValue,
    responseMode: string
  ): Promise<void>;
  postSafetyDuress(shiftId: string): Promise<void>;
  postSafetySos(shiftId: string, geom: Geom): Promise<SafetySosResponse>;
  /** Stub extension beyond API_CONTRACT.md v0 — see README "access report sync". */
  postAccessReport(payload: {
    addressId: string;
    accessStatus: string;
    notes: string | null;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export interface HttpApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
}

async function request<T>(
  opts: HttpApiClientOptions,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = opts.getAccessToken();
  const res = await fetch(`${opts.baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(res.status, json as ApiErrorBody);
  }
  return json as T;
}

/**
 * Real networking implementation, targeting docs/API_CONTRACT.md's base URL
 * (http://localhost:3001 by default). Every method can fail — by design, since the app is
 * offline-first: callers in src/sync are expected to catch failures and retry with backoff,
 * never to block the UI on this resolving.
 */
export function createHttpApiClient(opts: HttpApiClientOptions): ApiClient {
  return {
    login: (email, password) => request(opts, 'POST', '/auth/login', { email, password }),

    startShift: (input) => request(opts, 'POST', '/shifts/start', input),

    endShift: (shiftId) => request(opts, 'POST', `/shifts/${shiftId}/end`),

    postContactAttempt: (payload) => request(opts, 'POST', '/contact-attempts', payload),

    postContactAttemptsBatch: (items) =>
      request(opts, 'POST', '/contact-attempts/batch', { items }),

    getPhotoVerificationStatus: (shiftId) =>
      request(
        opts,
        'GET',
        `/photo-verification/status?shiftId=${encodeURIComponent(shiftId)}`
      ),

    submitPhotoVerification: (verificationId, payload) =>
      request(opts, 'POST', `/photo-verification/${verificationId}/submit`, payload),

    deferPhotoVerification: (verificationId) =>
      request(opts, 'POST', `/photo-verification/${verificationId}/defer`),

    respondWellnessCheck: (checkId, response, responseMode) =>
      request(opts, 'POST', `/wellness-checks/${checkId}/respond`, { response, responseMode }),

    postSafetyDuress: (shiftId) => request(opts, 'POST', '/safety/duress', { shiftId }),

    postSafetySos: (shiftId, geom) => request(opts, 'POST', '/safety/sos', { shiftId, geom }),

    postAccessReport: (payload) => request(opts, 'POST', '/access-reports', payload),
  };
}

export const DEFAULT_API_BASE_URL = 'http://localhost:3001';
