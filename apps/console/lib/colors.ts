// Reserved color language for the two monitoring families. See docs/ARCHITECTURE.md
// ("the one architectural rule that matters most") and apps/console/README.md.
//
// SAFETY (welfare / inactivity watchdog) = red family.
// ACCOUNTABILITY (photo verification / anti-fraud) = violet family.
//
// These two palettes are used ONLY for their respective family, everywhere in the console
// (header tiles, alert rail, map markers, badges, the Safety board). Do not reuse the safety
// red for anything accountability-related or vice versa, and do not introduce a third color
// that reads as "in between" the two — the whole point is that a manager can tell which
// family an item belongs to at a glance, without reading the label.

export const safetyColor = {
  DEFAULT: "#dc2626", // red-600 — safety alert stack, watchdog map markers, safety tile
  strong: "#991b1b", // red-800 — critical / SOS severity
  soft: "#fee2e2", // red-100 — row/badge backgrounds
  border: "#fca5a5", // red-300
  text: "#7f1d1d", // red-900 — text on soft background
} as const;

export const accountabilityColor = {
  DEFAULT: "#7c3aed", // violet-600 — accountability alert stack, photo-verification map markers, accountability tile
  strong: "#5b21b6", // violet-800 — critical/high severity
  soft: "#ede9fe", // violet-100
  border: "#c4b5fd", // violet-300
  text: "#4c1d95", // violet-900
} as const;

// Agent-dot activity recency (Live Ops map). Independent of the safety/accountability
// palette on purpose — this encodes "how fresh is this agent's last ping", not which
// monitoring family is involved.
export const activityColor = {
  fresh: "#16a34a", // green-600, < 5 min
  aging: "#d97706", // amber-600, 5-15 min
  // A deliberately different red shade (red-700, not safetyColor's red-600) so a stale
  // agent dot never reads as visually identical to a safety alert at a glance.
  stale: "#b91c1c",
} as const;

export function activityBucket(secondsSinceLastDoor: number): "fresh" | "aging" | "stale" {
  if (secondsSinceLastDoor < 5 * 60) return "fresh";
  if (secondsSinceLastDoor < 15 * 60) return "aging";
  return "stale";
}
