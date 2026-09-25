# apps/api

Fastify + TypeScript backend for the canvassing platform, implementing
[`docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md) against the schema in
[`db/migrations`](../../db/migrations). See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
and [`docs/SCOPE.md`](../../docs/SCOPE.md) for what this build is (and isn't).

## Setup

Requires the local Postgres 16 + PostGIS instance described in
[`db/README.md`](../../db/README.md), already migrated and seeded.

```bash
cd apps/api
npm install
cp .env.example .env          # defaults match db/README.md's local setup
npm run seed:passwords         # one-time: see below
npm run dev                    # http://localhost:3001
```

`npm run build` compiles to `dist/`; `npm start` runs the compiled build.

### One-time dev setup: demo passwords

`db/seed.sql` inserts placeholder `password_hash` strings for the three demo users (it says so
in its own comment) because seed SQL can't compute an argon2id hash. Run this once after
migrations + seed are applied:

```bash
npm run seed:passwords
```

This runs `scripts/seed-passwords.ts`, which hashes the literal password `devpassword` with
argon2id (the `argon2` package) and `UPDATE`s the three demo users' `password_hash` directly —
it does not touch or re-run `db/seed.sql`. After this, `director@demo.local`,
`lead@demo.local`, and `canvasser@demo.local` all log in with password `devpassword`.

## Running tests

```bash
npm test
```

Runs against the same local Postgres instance (`vitest run`, no mocking of the DB — the tests
are integration tests). `test/safety-firewall.test.ts` is a pure source-grep and needs no DB.
See "Test results" below for the last run's output.

## Environment variables

See `.env.example` for the full list and defaults: `DATABASE_URL` (the `gbt_app` role — never
point this at the `gbt` superuser), JWT secrets/TTLs, and the watchdog's tunable windows.

## Architecture notes

- **RLS org-scoping**: every request handler that touches the DB goes through
  `withOrgTx(orgId, fn)` (`src/lib/db.ts`), which opens a transaction, runs
  `SELECT set_config('app.org_id', $1, true)` (the parameterized equivalent of
  `SET LOCAL app.org_id = ...`), then calls `fn`. This is the one and only place a DB
  transaction gets opened for a request — no route queries the pool directly — so the
  org-isolation guarantee in `db/migrations/0010_audit_log_and_rls.sql` can't be silently
  skipped by a route author reaching for `pool.query`.
- **Safety/accountability firewall** (`docs/ARCHITECTURE.md` section 8.0): `src/repositories/safety.ts`
  and `src/repositories/production-stats.ts` never import each other and are grepped by
  `test/safety-firewall.test.ts` for any mention of the other side's tables/columns. This is
  the single most load-bearing test in this build — read the header comment in both files
  before touching either.
- **Audit log**: `src/lib/audit.ts`'s `insertAuditLog(client, entry)` is called directly inside
  each mutating route's own transaction (not via a generic Fastify `onSend` hook), so an audit
  row can never exist for a rolled-back mutation, and a committed mutation can never be missing
  one. Every mutating route in this build calls it.
- **RBAC**: `src/middleware/rbac.ts`'s `requireCampaignRole`/`requireAnyCampaignRole` check the
  JWT's `campaign_roles` claim against the campaign resolved from the request. Not exhaustive
  over the full role matrix the spec describes — covers the routes this build implements.

## What's simplified (read this before extending anything)

This build is honest about what's real vs approximated. Each item below says which.

- **Out-of-turf classification** (`src/lib/turfException.ts`): `within_tolerance`,
  `gps_degraded`, `distant`, `far_distant` are computed from a **real** PostGIS geography
  distance (`ST_Distance`, true geodesic meters) with documented thresholds. `geocode_suspect`,
  `multi_unit`, `adjacent_turf`, and `boundary_street` are real classes the schema supports but
  this build does not distinguish — they'd need per-address geocode-confidence history, parcel/
  unit data, an adjacent-turf lookup, and street-centerline data respectively, none of which
  exist in the seed data. Anything that would fall into one of those is classified `distant`
  instead, with `classification_rule_version` set to a value that says so.
- **Photo verification scoring** (`src/services/verification/scoring.ts`): the door-count draw
  itself is real (see below); the 0–1 score combining inside-turf/mock-location/clock-skew/GPS-
  accuracy into one number is a simple, documented heuristic, not the ML/rules engine section
  8A of the build prompt describes. No LLM or ML model is used anywhere in this codebase,
  consistent with `docs/SCOPE.md`'s "no LLM objection matching" boundary applied to
  verification too.
- **Photo door-count draw** (`src/lib/photoSchedule.ts`) **is real**: an HMAC-SHA256 stream
  keyed on `shifts.photo_schedule_seed` drives an exact Beta(5,2) sample via the
  uniform-order-statistics method (draw 6 uniforms, sort, take the 5th smallest — exact for
  integer alpha/beta, not an approximation), scaled into `[min_doors, max_doors]`. Same seed +
  prompt sequence always reproduces the same draw; the client is never told N.
- **Safety watchdog** (`src/services/safety/watchdog.ts`): the escalation ladder's *decisions*
  are real and tested end-to-end (idle_warning → wellness_check → idle_alert + safety_event,
  each firing once per crossing, not spammed every poll — see the code comment on that exact
  bug and its fix). What's stubbed: it runs on an in-process `setInterval`
  (`WATCHDOG_POLL_INTERVAL_SECONDS`, default 10s) inside the API process, not a dedicated
  scheduled worker — an API restart drops in-flight timers, and it wouldn't horizontally scale
  (two API processes would double-evaluate every shift). Delivery (actual push/SMS to the
  canvasser) is stubbed, per `docs/ARCHITECTURE.md`. Windows are configurable via env for demo
  speed; production should use the real 10–45 min bounds from
  `safety_watchdog_state.window_seconds`.
- **No real object storage**: photo bytes are written to local disk under the gitignored
  `apps/api/.data/photos/` directory (create it automatically); `photo_verifications.object_key`
  stores the filename. No KMS/encryption-at-rest — see `docs/ARCHITECTURE.md`.
- **Login's RLS bootstrap problem** (`src/lib/authBootstrap.ts`, `src/lib/orgList.ts`): `POST
  /auth/login` only receives `{email, password}`, but `users` carries the same org-isolation RLS
  policy as everything else — with no `app.org_id` set yet, `gbt_app` sees **zero** rows, not
  "all rows", so there's no way to look up which org an email belongs to via the normal
  org-scoped path. The same problem hits the safety watchdog, which evaluates active shifts
  across every org on a timer, not inside one request's org context. **Resolved**: both now call
  a `SECURITY DEFINER` database function (`auth_lookup_user_for_login`, `list_all_org_ids`,
  added in `db/migrations/0012_auth_bootstrap_functions.sql`) that runs with the migrations
  role's `BYPASSRLS` privilege for exactly one narrow query each — the API process itself never
  holds superuser credentials at runtime. (This build's original pass reached for a second
  `gbt`-superuser connection pool as a stopgap because `db/migrations` was frozen for the
  concurrent agent builds; that constraint didn't apply to the integration pass, so the real fix
  landed instead.)
- **Contact-attempt idempotency status codes**: `docs/API_CONTRACT.md` doesn't specify different
  status codes for a fresh insert vs. an idempotent replay of `POST /contact-attempts`. This
  build returns `201` for a fresh insert and `200` for a replay (same response body shape
  either way) — noted here since it's a place this build made a call the contract left open.
- **`POST /shifts/:id/breadcrumb`**: **not** part of `docs/API_CONTRACT.md` (that document has
  no breadcrumb-ingestion endpoint at all). Added as a minimal, clearly-documented addition so
  the safety watchdog and safety board have real `location_breadcrumbs` data to evaluate/display
  — without it, `lastKnownGeom`/`batteryPct` and the movement-radius check would never receive
  data in this build. Doesn't change or conflict with anything in the frozen contract; a real
  build should add this to the contract deliberately, with device-side batching.
- **Live-ops roster** (`src/routes/console.ts`) assumes at most one active shift per canvasser.
  Nothing in the schema enforces that; if a client somehow starts overlapping shifts for the
  same user (normal flow never does), they'd appear as duplicate roster rows.
- **`accountabilityAlerts` type `attestation_failed`**: listed in the contract's alert types but
  never produced by this build — device attestation status is stored once at enrollment
  (`devices.attestation_status`) and never re-checked as a live signal, so there is no code path
  that would fire it.
- **Compliance/consent data**: as `docs/ARCHITECTURE.md` says, `state_data_policies` is not
  attorney-reviewed. Not this layer's concern beyond enforcing the shift-start gate against it.

## Test results (last local run)

```
 ✓ test/safety-firewall.test.ts (5 tests)
 ✓ test/integration.test.ts (9 tests)

 Test Files  2 passed (2)
      Tests  14 passed (14)
```

Manually verified against the live local Postgres instance beyond what the automated tests
cover: login for all three demo users; `GET /me`; shift start happy path and the
`consent_missing` rejection (`lead@demo.local` has no `location_tracking` consent record in
`db/seed.sql`); a contact-attempt with a far-away `arriveGeom` correctly producing a
`turf_boundary_exceptions` row classified `far_distant`; the photo-verification door-count draw
firing `due: true` at a real (HMAC-derived, non-obvious) door count and firing consistently;
`faceDetected: true` rejected with `422`; a real image round-tripped to
`.data/photos/`; `/safety/sos`; the full watchdog ladder end-to-end with compressed windows
(`idle_warning` → one `wellness_checks` row → one `idle_alert` + one `safety_events` row, not a
flood — this caught and fixed two real bugs, see git history); door activity resetting the
watchdog to `normal`; `/console/live-ops`, `/console/production-stats`, and
`/console/safety-board` all returning contract-shaped data; a canvasser correctly getting `403`
from the console endpoints (manager-only RBAC).
