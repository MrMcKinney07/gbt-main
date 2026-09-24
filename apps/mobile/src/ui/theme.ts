/**
 * Shared color tokens. Two entries matter architecturally, not just aesthetically:
 * `verification` (accountability, purple) and `safety` (welfare, red) are deliberately
 * different hues, never reused for each other, so the two prompts are visually
 * unmistakable at a glance — see docs/ARCHITECTURE.md.
 */
export const colors = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  primary: '#1d4ed8',
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
