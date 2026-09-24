# Field-grade canvassing platform — foundation build

This repo implements a bounded foundational slice of the full platform spec (see
`docs/ARCHITECTURE.md` and `docs/SCOPE.md` for exactly what's built vs. stubbed, and why —
the full spec is a 10-14 week, multi-team production effort, not a single-session build).

```
db/               Postgres+PostGIS schema, docker-compose, seed data      → db/README.md
apps/api/         Fastify + TypeScript backend                            → apps/api/README.md
apps/console/     Next.js manager console (Live Ops + Safety boards)      → apps/console/README.md
apps/mobile/      Expo React Native canvasser app                         → apps/mobile/README.md
docs/             Architecture, scope decisions, and the shared API contract
```

## Quickstart (local dev)

```bash
cd db && docker compose up -d && ./migrate.sh     # or see db/README.md for a bare-metal Postgres
cd ../apps/api && npm install && cp .env.example .env && npm run seed:passwords && npm run dev
cd ../apps/console && npm install && npm run dev   # http://localhost:3000
cd ../apps/mobile && npm install && npx expo start # needs a device/simulator
```

Demo login (all three): `director@demo.local` / `lead@demo.local` / `canvasser@demo.local`,
password `devpassword` for all.

## Start here

- **`docs/ARCHITECTURE.md`** — the one rule that shapes everything else: photo verification
  (accountability, door-count triggered) and the inactivity watchdog (safety, triggered by
  absence of activity) are structurally separate end to end — separate DB tables with no
  foreign keys between them, separate API repository modules that can't import each other
  (enforced by a grep-based test in both `apps/api` and `apps/mobile`), and separate,
  never-merged UI stacks in the console.
- **`docs/API_CONTRACT.md`** — the contract the three apps were built against concurrently.
- **`docs/SCOPE.md`** — the build prompt's own section-15 pre-flight questions, answered with
  the spec's stated defaults where possible and flagged everywhere else. Read this before
  treating any part of this build as production-ready.

## What's real vs. what's a stub

Real and independently verified in this session (not just claimed by whichever agent built
it): the Postgres schema's append-only and RLS enforcement (tested against a live DB with a
non-superuser role), the API's full auth/shift/contact-attempt/photo-verification/safety
flow (exercised end to end against a live server, not just unit tests), the mobile app's
offline outbox (tested through actual SQLite file close/reopen cycles, not mocks), and the
console's two-screen build. Stubbed: real voter-file importers (VAN/L2/i360/TargetSmart),
Valhalla-based turf cutting and routing, ASR/voice-to-survey, LLM objection retrieval, real
object storage for photos, push/SMS delivery for safety escalations, and on-device face
detection in the mobile photo-verification flow. Each app's own README details its specific
simplifications.
