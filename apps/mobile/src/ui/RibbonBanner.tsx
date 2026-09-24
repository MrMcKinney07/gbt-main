import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

/**
 * Same ribbon shape/stripe logic as apps/console's `.ribbon-banner` (globals.css) — a
 * double-pointed banner in flat navy/white/red bands. Built as an SVG (not a styled View)
 * because React Native has no clip-path; the hard-stop LinearGradient trick mirrors the
 * CSS one exactly (two <Stop> entries at the same offset = a hard color edge, not a blend).
 */
export function RibbonBanner({ label, width = 220 }: { label: string; width?: number }) {
  const height = width * (50 / 300);
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 300 50">
        <Defs>
          <LinearGradient id="ribbonStripes" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0e2148" />
            <Stop offset="0.333" stopColor="#0e2148" />
            <Stop offset="0.333" stopColor="#ffffff" />
            <Stop offset="0.667" stopColor="#ffffff" />
            <Stop offset="0.667" stopColor="#8a2432" />
            <Stop offset="1" stopColor="#8a2432" />
          </LinearGradient>
        </Defs>
        <Path
          d="M0,25 L27,0 L273,0 L300,25 L273,50 L27,50 Z"
          fill="url(#ribbonStripes)"
        />
        <SvgText
          x="150"
          y="29"
          fontSize="13"
          fontWeight="bold"
          fill="#0e2148"
          textAnchor="middle"
          letterSpacing="1.5"
        >
          {label.toUpperCase()}
        </SvgText>
      </Svg>
    </View>
  );
}
