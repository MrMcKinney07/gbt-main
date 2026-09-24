// Thin fetch wrapper against docs/API_CONTRACT.md. Every call here targets the real,
// documented endpoint and shape — nothing is routed through a fake local backend. When the
// API at NEXT_PUBLIC_API_URL isn't reachable, callers fall back to lib/mock-data.ts
// themselves (see useLiveOps / useSafetyBoard) so the UI still renders; this module never
// silently substitutes mock data on its own.

import type { ApiErrorBody } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;
  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("gbt_console_token");
  } catch {
    return null;
  }
}

export interface ApiFetchOptions extends RequestInit {
  auth?: boolean; // default true — attach Authorization: Bearer <jwt>
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: finalHeaders });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  }

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, body?.message || body?.error || `Request failed (${res.status})`, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
