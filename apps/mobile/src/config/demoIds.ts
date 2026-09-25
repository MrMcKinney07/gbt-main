/**
 * Fixed demo UUIDs matching db/seed.sql / docs/API_CONTRACT.md's "Demo fixed IDs" section.
 * Centralized here (rather than duplicated per-screen) after finding that a previous
 * duplicate hardcoded a plain string instead of the real UUID, and that the door-screen path
 * had no equivalent constants at all and instead invented its own non-existent local address
 * ids -- every real contact-attempt sync silently failed as a result. See
 * apps/mobile/README.md "Web preview" for the full story.
 *
 * A real (non-demo) build replaces every one of these with values read from the actual
 * logged-in user's assignment, not a constant.
 */
export const DEMO_CAMPAIGN_ID = '00000000-0000-0000-0000-000000000002';
export const DEMO_DEVICE_ID = '00000000-0000-0000-0000-000000000030';
export const DEMO_WALKBOOK_ID = '00000000-0000-0000-0000-0000000000a0';
export const DEMO_ASSIGNMENT_ID = '00000000-0000-0000-0000-0000000000b0';
export const DEMO_TURF_ID = '00000000-0000-0000-0000-000000000050';
