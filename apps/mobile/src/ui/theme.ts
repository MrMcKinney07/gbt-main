/**
 * Shared color tokens. Two entries matter architecturally, not just aesthetically:
 * `verification` (accountability, purple) and `safety` (welfare, red) are deliberately
 * different hues, never reused for each other, so the two prompts are visually
 * unmistakable at a glance — see docs/ARCHITECTURE.md.
 */
export const colors = {
  // Brand palette, matching apps/console (deep navy / cream / hairline borders) — see
  // apps/console/app/globals.css for the shared reasoning.
  bg: '#faf9f6',
  surface: '#ffffff',
  border: '#d8d3c7',
  text: '#0e1a2b',
  textMuted: '#64748b',
  primary: '#0e2148',
  primaryDark: '#081226',
  primaryText: '#ffffff',
  danger: '#b91c1c',

  // Accountability (photo verification) — purple family, never used by safety/.
  verification: '#6d28d9',
  verificationBg: '#f5f3ff',

  // Safety (wellness / SOS / duress) — red family, never used by verification/.
  safety: '#b91c1c',
  safetyBg: '#fef2f2',

  // Access banner (door screen)
  accessNone: '#e2e8f0',
  accessCaution: '#f59e0b',
  accessLocked: '#dc2626',
  accessNoSoliciting: '#64748b',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
