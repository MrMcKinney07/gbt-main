import { createHmac } from "node:crypto";

/**
 * Server-side, HMAC-committed door-count draw for photo verification prompts.
 *
 * The client never learns N (the number of doors until the next prompt): everything here runs
 * server-side, keyed off `shifts.photo_schedule_seed` (random bytes generated once at shift
 * start and never sent to the device - see routes/shifts.ts). Given the same seed and the same
 * prompt sequence number, this always produces the same draw (so a restarted server or a
 * retried request doesn't reshuffle an in-flight schedule), but nothing short of the seed lets
 * the client precompute it.
 *
 * Beta(5,2) sampling: alpha=5, beta=2 are both integers, so we use the exact
 * order-statistics method rather than an approximation - draw (alpha+beta-1) = 6 independent
 * uniform(0,1) values from the HMAC-derived stream, sort them ascending, and the alpha-th
 * smallest (index alpha-1 = 4) is an exact Beta(alpha, beta) sample. This is a standard,
 * textbook-correct method for integer-parameter Beta distributions (it follows directly from
 * the definition of order statistics of a Uniform(0,1) sample), not an approximation.
 */

function uniformStream(seed: Buffer, promptSequence: number, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const mac = createHmac("sha256", seed)
      .update(`prompt:${promptSequence}:draw:${i}`)
      .digest();
    // First 4 bytes as an unsigned 32-bit integer, scaled to [0, 1).
    const uint32 = mac.readUInt32BE(0);
    values.push(uint32 / 0x100000000);
  }
  return values;
}

/** Exact Beta(alpha, beta) sample for integer alpha/beta via uniform order statistics. */
export function sampleBetaIntegerParams(seed: Buffer, promptSequence: number, alpha: number, beta: number): number {
  if (!Number.isInteger(alpha) || !Number.isInteger(beta) || alpha < 1 || beta < 1) {
    throw new Error("sampleBetaIntegerParams requires positive integer alpha/beta");
  }
  const n = alpha + beta - 1;
  const uniforms = uniformStream(seed, promptSequence, n);
  uniforms.sort((a, b) => a - b);
  return uniforms[alpha - 1];
}

export interface DoorDrawInput {
  photoScheduleSeed: Buffer;
  promptSequence: number;
  minDoors: number;
  maxDoors: number;
  betaAlpha: number;
  betaBeta: number;
}

/**
 * Draws the number of doors (in [minDoors, maxDoors]) the canvasser must knock before the next
 * photo prompt fires. betaAlpha/betaBeta are read from `photo_interval_profiles` per campaign
 * (defaulted to 5/2 per db/migrations/0008_photo_verification.sql and docs/SCOPE.md 11).
 * Non-integer alpha/beta values (the schema allows arbitrary numeric here) fall back to
 * rounding to the nearest integer parameters, since the exact order-statistics method requires
 * integers; this is noted rather than hidden.
 */
export function drawDoorInterval(input: DoorDrawInput): number {
  const alpha = Math.max(1, Math.round(input.betaAlpha));
  const beta = Math.max(1, Math.round(input.betaBeta));
  const sample = sampleBetaIntegerParams(input.photoScheduleSeed, input.promptSequence, alpha, beta);
  const span = input.maxDoors - input.minDoors;
  const doors = input.minDoors + Math.round(sample * span);
  return Math.min(input.maxDoors, Math.max(input.minDoors, doors));
}
