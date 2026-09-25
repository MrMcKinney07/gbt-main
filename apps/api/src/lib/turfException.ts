/**
 * Out-of-turf exception classification (build prompt section 4.4a, `turf_exception_class`
 * enum in db/migrations/0004_turf_and_assignments.sql).
 *
 * Honesty about what's real vs stubbed here, per the build instructions:
 *
 *   - `within_tolerance`, `gps_degraded`, `distant`, `far_distant` are computed from a real
 *     PostGIS distance (ST_Distance on geography, i.e. true geodesic meters) between the
 *     recorded arrival point and the assignment's turf polygon, with real, documented
 *     thresholds.
 *   - `geocode_suspect` (would need per-address geocode-confidence history to compare against),
 *     `multi_unit` (would need parcel/building unit data - buildings.unit_count_est exists but
 *     isn't populated in seed data), `adjacent_turf` (would need a real adjacent-turf lookup:
 *     walk the campaign's other turfs and test ST_Touches/ST_DWithin against the recorded
 *     point, then rank by distance - not implemented) and `boundary_street` (would need street
 *     centerline data to test proximity to a shared boundary street) are all real classes this
 *     build does NOT distinguish. Anything that would fall into one of those is instead
 *     classified as `distant`, with `classification_rule_version` set to a value that says so,
 *     so a later pass can find and reclassify these rows instead of silently pretending they
 *     were evaluated.
 */

export type TurfExceptionClass =
  | "within_tolerance"
  | "gps_degraded"
  | "distant"
  | "far_distant";

export type TurfExceptionAutoDisposition =
  | "auto_dismissed"
  | "likely_benign"
  | "needs_review"
  | "suspicious";

export const CLASSIFICATION_RULE_VERSION = "v0-simplified-2026-09";

export interface ClassifyInput {
  /** Distance in meters from the recorded point to the turf polygon boundary (point is outside). */
  distanceOutsideBoundaryM: number;
  /** GPS accuracy reported alongside the point, in meters (may be null/undefined). */
  accuracyM: number | null | undefined;
}

export function classifyOutOfTurf(input: ClassifyInput): {
  classification: TurfExceptionClass;
  autoDisposition: TurfExceptionAutoDisposition;
} {
  const accuracy = input.accuracyM ?? 0;
  const tolerance = Math.max(25, 2 * accuracy);

  if (input.distanceOutsideBoundaryM <= tolerance) {
    return { classification: "within_tolerance", autoDisposition: "auto_dismissed" };
  }
  if (accuracy > 50) {
    return { classification: "gps_degraded", autoDisposition: "likely_benign" };
  }
  if (input.distanceOutsideBoundaryM > 1000) {
    return { classification: "far_distant", autoDisposition: "suspicious" };
  }
  // Covers both the "distant" (250m-1000m) case and, per the header comment above, everything
  // that a fuller implementation would instead split into geocode_suspect / multi_unit /
  // adjacent_turf / boundary_street.
  return { classification: "distant", autoDisposition: "needs_review" };
}
