import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // argon2.verify throws on a malformed/foreign hash (e.g. the seed.sql placeholder
    // strings) rather than returning false - treat that the same as a failed verification.
    return false;
  }
}
