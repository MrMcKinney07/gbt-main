/**
 * Duress PIN checking. In a real build these would be per-canvasser values set at onboarding
 * (stored server-side / in expo-secure-store, never hardcoded), and entry attempts would be
 * rate-limited. For this scaffold they're fixed demo values so the flow can be exercised and
 * tested without a settings screen. See README "What's stubbed".
 */
export const DEMO_NORMAL_PIN = '1234';
export const DEMO_DURESS_PIN = '9999';

export type PinCheckResult = 'normal' | 'duress' | 'invalid';

export function checkPin(pin: string): PinCheckResult {
  if (pin === DEMO_DURESS_PIN) return 'duress';
  if (pin === DEMO_NORMAL_PIN) return 'normal';
  return 'invalid';
}
