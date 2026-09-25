/**
 * RFC4122 v4-shaped UUID generator that has zero native/runtime dependencies, so the exact
 * same code path runs under Expo/Hermes on a device and under Jest on the CI/build machine.
 *
 * This is used for two different things that must NOT be confused:
 *  - outbox row ids (local primary key, never sent to the server)
 *  - idempotency keys (sent to the server so retried/duplicated sync attempts collapse to one
 *    write server-side — see docs/API_CONTRACT.md's `idempotencyKey` fields)
 *
 * NOTE: Math.random() is not cryptographically strong. That's fine for a locally-generated,
 * effectively-unguessable-enough client id in this scaffold, but a production build should
 * swap this for `expo-crypto`'s `randomUUID()` (CSPRNG-backed) — see README "What's stubbed".
 */
export function uuidv4(): string {
  let seed = Date.now() + Math.random() * 1_000_000;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (seed + Math.random() * 16) % 16 | 0;
    seed = Math.floor(seed / 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
