/**
 * Photo-verification scoring heuristic.
 *
 * This is deliberately simple and documented as such: a real fraud/verification scoring engine
 * (screen-recapture/moire detection, scene classification, cross-signal correlation with
 * turf_exception_shift_rollups, etc - the columns exist on photo_verifications for this) is out
 * of scope for this build (see docs/SCOPE.md and docs/ARCHITECTURE.md - no ML/LLM component is
 * implemented anywhere in this codebase, matching the "no LLM objection matching" boundary in
 * docs/SCOPE.md applied to verification too). What's real: the three signals combined below
 * (inside-turf, mock-location flag, clock skew) are all computed from real PostGIS/device data,
 * not faked - the combination into a single 0-1 score is the simplified part.
 */
export interface ScoreInput {
  insideTurf: boolean | null;
  mockLocationFlag: boolean;
  clockDeltaSeconds: number;
  captureAccuracyM: number | null;
}

export interface ScoreResult {
  score: number;
  flagReasons: string[];
  status: "captured" | "auto_flagged";
}

export function scorePhotoVerification(input: ScoreInput): ScoreResult {
  let score = 1.0;
  const flagReasons: string[] = [];

  if (input.insideTurf === false) {
    score -= 0.4;
    flagReasons.push("outside_turf_buffer");
  }
  if (input.mockLocationFlag) {
    score -= 0.5;
    flagReasons.push("mock_location_flag");
  }
  if (Math.abs(input.clockDeltaSeconds) > 120) {
    score -= 0.3;
    flagReasons.push("clock_skew");
  }
  if (input.captureAccuracyM != null && input.captureAccuracyM > 100) {
    score -= 0.15;
    flagReasons.push("low_gps_accuracy");
  }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  const status = score < 0.5 || flagReasons.length >= 2 ? "auto_flagged" : "captured";
  return { score, flagReasons, status };
}
