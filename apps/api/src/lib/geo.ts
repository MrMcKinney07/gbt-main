const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters (Haversine). Used for the in-process movement-radius check. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Radius (meters) of a cluster of positions: the max distance from the centroid to any point.
 * Used by the safety watchdog as a cheap proxy for "has this person actually been moving
 * around, or just sitting in one spot" over the idle window - a real implementation might use a
 * convex-hull diameter instead, but for a demo-scale number of breadcrumbs this is equivalent
 * in spirit and much simpler.
 */
export function movementRadiusMeters(points: { lat: number; lng: number }[]): number {
  if (points.length === 0) return 0;
  const centroid = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
  return Math.max(...points.map((p) => haversineMeters(centroid, p)));
}
