/**
 * One-time dev setup: replaces the placeholder password_hash strings db/seed.sql inserts for
 * the three demo users with a real argon2id hash of the literal password "devpassword", via a
 * plain UPDATE - it does not touch or re-run db/seed.sql itself.
 *
 * Run after migrations + seed have been applied:
 *   npm run seed:passwords
 *
 * Uses the migrations superuser connection (DATABASE_URL is gbt_app for the API itself, but
 * updating `users.password_hash` here is a one-time admin/dev-setup action, not a runtime API
 * code path - it never runs inside the request-serving process). Set
 * SEED_DATABASE_URL to override if your local superuser credentials differ from db/README.md's
 * documented defaults.
 */
import pg from "pg";
import argon2 from "argon2";

const DEMO_EMAILS = ["director@demo.local", "lead@demo.local", "canvasser@demo.local"];
const DEMO_PASSWORD = "devpassword";

async function main() {
  const connectionString = process.env.SEED_DATABASE_URL ?? "postgres://gbt:gbt_dev_only@localhost:5432/gbt";
  const pool = new pg.Pool({ connectionString });

  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  for (const email of DEMO_EMAILS) {
    const result = await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [hash, email]);
    console.log(`${email}: ${result.rowCount ? "updated" : "NOT FOUND"}`);
  }

  await pool.end();
  console.log(`\nDone. All three demo users now use password_hash for "${DEMO_PASSWORD}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
