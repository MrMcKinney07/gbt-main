import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app.js";
import { pool } from "../src/lib/db.js";

// Demo fixed IDs from db/seed.sql / docs/API_CONTRACT.md.
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000002";
const ASSIGNMENT_ID = "00000000-0000-0000-0000-0000000000b0";
const WALKBOOK_ID = "00000000-0000-0000-0000-0000000000a0";
const TURF_ID = "00000000-0000-0000-0000-000000000050";
const ADDRESS_ID = "00000000-0000-0000-0000-000000000070";
const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000080";
const DEVICE_ID = "00000000-0000-0000-0000-000000000030";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

const CANVASSER_EMAIL = "canvasser@demo.local";
const TEAM_LEAD_EMAIL = "lead@demo.local"; // has no location_tracking consent record in seed.sql
const DEV_PASSWORD = "devpassword";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function login(email: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: DEV_PASSWORD } });
  expect(res.statusCode, `login for ${email} should succeed: ${res.body}`).toBe(200);
  return res.json();
}

describe("auth", () => {
  it("logs in the seeded demo users with the dev password", async () => {
    const body = await login(CANVASSER_EMAIL);
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.user.email).toBe(CANVASSER_EMAIL);
    expect(body.user.campaignRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ campaign_id: CAMPAIGN_ID, role: "canvasser" })])
    );
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: CANVASSER_EMAIL, password: "nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("GET /me returns the authenticated user's roles", async () => {
    const { accessToken } = await login(CANVASSER_EMAIL);
    const res = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe(CANVASSER_EMAIL);
    expect(body.campaignRoles[0]).toMatchObject({ campaignId: CAMPAIGN_ID, role: "canvasser" });
  });
});

describe("shift consent/license gate", () => {
  it("starts a shift for the canvasser, who has both consent and a data license", async () => {
    const { accessToken } = await login(CANVASSER_EMAIL);
    const res = await app.inject({
      method: "POST",
      url: "/shifts/start",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { campaignId: CAMPAIGN_ID, deviceId: DEVICE_ID, consentRecordIds: ["00000000-0000-0000-0000-000000000040"] },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.actualStart).toBeTypeOf("string");
    // photoIntervalProfileId may be null or a uuid depending on seed state, but the key must exist.
    expect(body).toHaveProperty("photoIntervalProfileId");

    // Clean up so it doesn't leave a dangling active shift for other tests/the watchdog.
    await app.inject({
      method: "POST",
      url: `/shifts/${body.id}/end`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  });

  it("rejects shift start with consent_missing for a user who has no location_tracking consent record", async () => {
    const { accessToken } = await login(TEAM_LEAD_EMAIL);
    const res = await app.inject({
      method: "POST",
      url: "/shifts/start",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { campaignId: CAMPAIGN_ID, deviceId: null, consentRecordIds: [] },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe("consent_missing");
    expect(body.missing).toContain("location_tracking");
  });
});

describe("contact attempts: idempotency and append-only enforcement", () => {
  let canvasserToken: string;
  let activeShiftId: string;

  beforeAll(async () => {
    const { accessToken } = await login(CANVASSER_EMAIL);
    canvasserToken = accessToken;
    // Out-of-turf exceptions can only be attributed to an active shift (turf_boundary_exceptions
    // .shift_id is NOT NULL - see repositories/turf.ts), so keep one open for this whole block.
    const res = await app.inject({
      method: "POST",
      url: "/shifts/start",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { campaignId: CAMPAIGN_ID, deviceId: DEVICE_ID, consentRecordIds: [] },
    });
    expect(res.statusCode, res.body).toBe(201);
    activeShiftId = res.json().id;
  });

  afterAll(async () => {
    await app.inject({
      method: "POST",
      url: `/shifts/${activeShiftId}/end`,
      headers: { authorization: `Bearer ${canvasserToken}` },
    });
  });

  it("is idempotent on idempotencyKey (second POST returns the same row, not an error)", async () => {
    const accessToken = canvasserToken;
    const idempotencyKey = `test-${randomUUID()}`;
    const contactId = randomUUID();
    const payload = {
      id: contactId,
      idempotencyKey,
      campaignId: CAMPAIGN_ID,
      assignmentId: ASSIGNMENT_ID,
      walkbookId: WALKBOOK_ID,
      turfId: TURF_ID,
      addressId: ADDRESS_ID,
      householdId: HOUSEHOLD_ID,
      deviceId: DEVICE_ID,
      resultCode: "not_home",
      scope: "voter",
      arriveAt: new Date().toISOString(),
      arriveGeom: { lat: 38.5786, lng: -121.49 }, // inside the seeded turf polygon
      recordedAt: new Date().toISOString(),
    };

    const first = await app.inject({
      method: "POST",
      url: "/contact-attempts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
    expect(first.statusCode, first.body).toBe(201);
    const firstBody = first.json();
    expect(firstBody.id).toBe(contactId);
    expect(firstBody.outOfTurfException).toBeNull();

    const second = await app.inject({
      method: "POST",
      url: "/contact-attempts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
    expect(second.statusCode, second.body).toBe(200);
    const secondBody = second.json();
    expect(secondBody.id).toBe(firstBody.id);

    // Confirm only one row exists for this idempotency key.
    const count = await pool.query(`SELECT COUNT(*) AS n FROM contact_attempts WHERE idempotency_key = $1`, [idempotencyKey]);
    expect(Number(count.rows[0].n)).toBe(1);
  });

  it("flags a contact recorded well outside the assignment's turf as an out-of-turf exception", async () => {
    const accessToken = canvasserToken;
    const payload = {
      id: randomUUID(),
      idempotencyKey: `test-${randomUUID()}`,
      campaignId: CAMPAIGN_ID,
      assignmentId: ASSIGNMENT_ID,
      walkbookId: WALKBOOK_ID,
      turfId: TURF_ID,
      addressId: ADDRESS_ID,
      householdId: HOUSEHOLD_ID,
      deviceId: DEVICE_ID,
      resultCode: "not_home",
      scope: "voter",
      arriveAt: new Date().toISOString(),
      arriveGeom: { lat: 40.0, lng: -122.0 }, // far outside the seeded turf polygon
      recordedAt: new Date().toISOString(),
    };
    const res = await app.inject({
      method: "POST",
      url: "/contact-attempts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.outOfTurfException).not.toBeNull();
    expect(["distant", "far_distant", "gps_degraded"]).toContain(body.outOfTurfException.classification);
  });

  it("the database itself rejects a direct UPDATE of a non-scoring column (append-only trigger)", async () => {
    // This confirms the DB-layer guarantee the build instructions ask us to re-verify: even a
    // client connected as gbt_app (the same role the API uses) cannot bypass the append-only
    // trigger from 0005_contact_attempts.sql by going around the API.
    const appPool = new pg.Pool({ connectionString: "postgres://gbt_app:gbt_app_dev_only@localhost:5432/gbt" });
    const client = await appPool.connect();
    try {
      // RLS (0010_audit_log_and_rls.sql) hides every row of contact_attempts until app.org_id
      // is set - set it session-wide here (set_config(..., false), not the transaction-local
      // `true` the app's own withOrgTx uses) since this is one dedicated connection, not a
      // request transaction. pool.connect() (not pool.query) guarantees every statement below
      // runs on that same session.
      await client.query(`SELECT set_config('app.org_id', $1, false)`, [ORG_ID]);
      const existing = await client.query(`SELECT id FROM contact_attempts LIMIT 1`);
      const id = existing.rows[0].id;
      await expect(client.query(`UPDATE contact_attempts SET notes_text = 'tampered' WHERE id = $1`, [id])).rejects.toThrow(
        /append-only/i
      );
      await expect(client.query(`DELETE FROM contact_attempts WHERE id = $1`, [id])).rejects.toThrow(/append-only/i);
      // The four scoring columns remain updatable - this is what the API's future review
      // pipeline is allowed to touch.
      await expect(
        client.query(`UPDATE contact_attempts SET flag_status = 'in_review' WHERE id = $1`, [id])
      ).resolves.toBeDefined();
      await client.query(`UPDATE contact_attempts SET flag_status = 'none' WHERE id = $1`, [id]);
    } finally {
      client.release();
      await appPool.end();
    }
  });
});
