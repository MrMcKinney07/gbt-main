"use client";

// Data hooks for the two boards. Each hits the real, documented endpoint first
// (docs/API_CONTRACT.md); if the API isn't reachable (it may not be running while this
// console is developed concurrently with apps/api), it falls back to lib/mock-data.ts so the
// screen still renders instead of showing a dead loading spinner forever. `isMock` is
// surfaced in the UI so nobody mistakes demo data for a live board.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "./api-client";
import { DEMO_CAMPAIGN_ID } from "./constants";
import { mockLiveOps, mockSafetyBoard } from "./mock-data";
import type { LiveOpsResponse, SafetyBoardResponse } from "./types";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isMock: boolean;
  lastUpdated: number | null;
}

function useLivePolling<T>(path: string, mock: T, pollMs: number) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
    isMock: false,
    lastUpdated: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<T>(path);
      if (!mounted.current) return;
      setState({ data, loading: false, error: null, isMock: false, lastUpdated: Date.now() });
    } catch (err) {
      if (!mounted.current) return;
      const message =
        err instanceof ApiError
          ? err.status === 0
            ? "API unreachable — showing demo data"
            : err.message
          : "Unknown error — showing demo data";
      setState({ data: mock, loading: false, error: message, isMock: true, lastUpdated: Date.now() });
    }
  }, [path, mock]);

  useEffect(() => {
    mounted.current = true;
    // Kicks off the first fetch (and its poll interval) on mount — this is the effect's
    // whole job, so the resulting setState inside `load` is expected here, not a symptom
    // of state that belongs in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, pollMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load, pollMs]);

  return { ...state, refresh: load };
}

export function useLiveOps(pollMs = 15000) {
  return useLivePolling<LiveOpsResponse>(
    `/console/live-ops?campaignId=${DEMO_CAMPAIGN_ID}`,
    mockLiveOps,
    pollMs
  );
}

export function useSafetyBoard(pollMs = 10000) {
  return useLivePolling<SafetyBoardResponse>(
    `/console/safety-board?campaignId=${DEMO_CAMPAIGN_ID}`,
    mockSafetyBoard,
    pollMs
  );
}
