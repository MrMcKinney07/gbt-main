/**
 * Original geometric soaring-eagle mark for the brand header/login. Deliberately NOT a
 * trace or copy of the Great Seal of the United States or any federal/state agency
 * emblem — those are protected/restricted marks. This is an original silhouette: wings
 * fully spread in a soaring pose, three bold primary feathers per wing, fanned tail —
 * kept deliberately chunky (few shapes, thick strokes) rather than finely detailed, so it
 * still reads clearly as an eagle at the small sizes it's actually used at (header badge,
 * favicon-scale), not just in a large hero rendering. See src/ui/EagleMark.tsx in
 * apps/mobile for the duplicate (kept in sync by hand; no shared package between the two).
 */
export function EagleMark({ className, fill = "currentColor" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 200 120" className={className} fill={fill} aria-hidden="true">
      <path
        d="
          M100,42 L175,18 L155,38 L188,42 L158,52 L178,68 L128,58 L100,52 Z
          M100,42 L25,18 L45,38 L12,42 L42,52 L22,68 L72,58 L100,52 Z
          M100,18 L108,33 L104,62 L100,70 L96,62 L92,33 Z
          M100,68 L114,94 L102,86 L100,100 L98,86 L86,94 Z
        "
      />
    </svg>
  );
}
