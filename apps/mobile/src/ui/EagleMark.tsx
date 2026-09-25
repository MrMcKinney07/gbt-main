import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Same original soaring-eagle mark as apps/console/components/brand/EagleMark.tsx — kept
 * in sync by hand (small enough, and this app has no shared-package build step with
 * console). Not a trace of the Great Seal or any federal/state emblem — see that file's
 * header comment for the full reasoning. Bold/chunky by design so it still reads as an
 * eagle at small sizes, not just in a large rendering.
 */
export function EagleMark({ size = 40, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 200 120" fill={color}>
      <Path d="M100,42 L175,18 L155,38 L188,42 L158,52 L178,68 L128,58 L100,52 Z M100,42 L25,18 L45,38 L12,42 L42,52 L22,68 L72,58 L100,52 Z M100,18 L108,33 L104,62 L100,70 L96,62 L92,33 Z M100,68 L114,94 L102,86 L100,100 L98,86 L86,94 Z" />
    </Svg>
  );
}
