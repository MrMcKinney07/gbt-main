# Architecture and scope

This repo implements a subset of the field-grade canvassing platform spec (the build
prompt). The full spec is a 10-14 week, multi-team V1 effort with real legal review, live
voter-file licenses, and paid infrastructure (Valhalla hosting, geocoding, ASR). This build
is a foundational slice: a correct data model, a working API against it, a manager console
covering the two flagship screens, and a mobile app skeleton with the offline-first and
safety/accountability patterns implemented for real. It is not production-ready and should
not be represented as such without the legal and infra work the spec itself calls out.

## Repo layout

```
db/                  Postgres+PostGIS schema (numbered migrations), docker-compose, seed data
apps/api/            Fastify + TypeScript backend
apps/console/        Next.js manager console
apps/mobile/         Expo React Native canvasser app
docs/                This file, plus SCOPE.md for the section-15 answers and what's stubbed
```

The pre-existing `gbt_project 3/` directory (a trivial Vercel `api/chat.js` stub, unrelated
to this platform) is left untouched.

## The one architectural rule that matters most

Section 8.0 of the build prompt is binding: there are exactly two monitoring/verification
mechanisms, and they are opposites.

| | Photo verification | Inactivity watchdog |
|---|---|---|
| Purpose | Accountability, anti-fraud | Safety, welfare |
| Trigger | Door count reached | Absence of doors + movement |
| Feeds fraud score | Yes | **Never** |
| Appears in productivity reports | Yes | **Never** |

This is implemented as a hard boundary, not a convention:

- **Database**: `safety_watchdog_state`, `wellness_checks`, `location_breadcrumbs`,
  `safety_events` (migration `0007`) have **no foreign keys** into `photo_interval_profiles`
  or `photo_verifications` (migration `0008`), and vice versa. See the header comment in
  `0007_shifts_and_safety.sql`.
- **API**: `apps/api/src/services/safety/*` and `apps/api/src/services/verification/*` are
  separate modules. Neither imports from the other. The fraud-scoring engine's input
  assembly function only reads from `contact_attempts` and `photo_verifications`; a test
  (`apps/api/test/safety-firewall.test.ts`) asserts it cannot reach the safety tables even
  transitively.
- **Console**: the Live Ops board (6.1) renders two alert stacks that are never sorted,
  counted, or displayed together. The Safety board (6.5) is queried from a repository that
  structurally cannot join `contact_attempts` or `photo_verifications`. Production stats
  (6.10) and exports (6.13) are queried from a repository that structurally cannot join the
  safety tables. See `apps/console/README.md`.

If you're extending this code and find yourself wanting to join these two families of
tables, or pass a safety event into the scoring engine, stop and re-read section 8.0 — that
urge is exactly the failure mode the separation exists to prevent.

## `contact_attempts` is append-only

Enforced by a Postgres trigger (`0005_contact_attempts.sql`), not just API discipline:
`DELETE` is always rejected, and `UPDATE` is rejected on every column except the four the
verification pipeline is allowed to attach after insert (`verification_score`,
`verification_signals`, `flag_status`, `flag_reasons`). A correction is a new row with
`supersedes_contact_id` set.

## Compliance seed data is not legal advice

`0009_compliance.sql` seeds `state_data_policies` for six states with defaults drawn
directly from the build prompt's own source citations. `last_reviewed_by` is left `NULL`,
and the API's shift-start endpoint should eventually surface a staleness warning when it is.
Do not ship this to a real canvass without the attorney review section 11.1 requires.

## What's deliberately not built here

Per section 13 "explicitly out of scope" plus the realities of a single build session:

- No real Valhalla/OSRM routing, no AI turf cutter (7.1/7.2) — `turfs`/`walkbooks` support
  manually drawn geometry only.
- No VAN/i360/TargetSmart/Aristotle live integrations — `voters.provider` supports them at
  the schema level; importers are not implemented.
- No ASR/voice-to-survey, no LLM objection retrieval — `objection_library` exists as a
  table; nothing calls a model against it.
- No real object storage / KMS integration for photos and gate secrets — `object_key` /
  `access_secret_encrypted` are placeholders for that integration.
- No push notification channel, no SMS/voice escalation delivery — the watchdog escalation
  ladder's *decisions* are implemented and logged; actual delivery is stubbed.
- Mobile app is Android/iOS-agnostic Expo scaffolding with the door screen, consent gate,
  offline outbox, and photo-prompt architecture real; it has not been run on a device or
  measured against the battery targets in section 5.7/14.

See `docs/SCOPE.md` for the full section-15 question list with the defaults this build
assumes, so a human can override them before this goes anywhere near a real canvass.
