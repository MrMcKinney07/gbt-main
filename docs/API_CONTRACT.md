# API contract (v0, this build only)

This is the source of truth for `apps/api` (implements it), `apps/console` and
`apps/mobile` (consume it) while they're built concurrently. If you're an agent building
one of the three and something here is ambiguous, make the reasonable call and note it in
your README rather than blocking — but do not change response field names without updating
this file, since the other two apps are being built against it at the same time.

Base URL: `http://localhost:3001` (api), `http://localhost:3000` (console).
Auth: `Authorization: Bearer <jwt>` after login. JWT payload: `{ sub: user_id, org_id, campaign_roles: [{campaign_id, role}] }`.

Demo fixed IDs (from `db/seed.sql`):
- org: `00000000-0000-0000-0000-000000000001`
- campaign: `00000000-0000-0000-0000-000000000002`
- field director user: `00000000-0000-0000-0000-000000000010` / `director@demo.local`
- team lead user: `00000000-0000-0000-0000-000000000011` / `lead@demo.local`
- canvasser user: `00000000-0000-0000-0000-000000000012` / `canvasser@demo.local`
- dev password for all three (set by the API's seed script, see apps/api/README.md): `devpassword`
- team: `...020`, turf: `...050`, walkbook: `...0a0`, assignment: `...0b0`, address: `...070`, voter: `...090`

## Auth

`POST /auth/login` `{email, password}` -> `{accessToken, refreshToken, user: {id, email, orgId, campaignRoles}}`

`GET /me` -> `{id, email, orgId, campaignRoles: [{campaignId, campaignName, role}]}`

## Shifts

`POST /shifts/start` `{campaignId, deviceId, consentRecordIds: string[]}` ->
`201 {id, actualStart, photoIntervalProfileId}` or `403 {error: "consent_missing", missing: [...]}` or `403 {error: "license_missing", state}`.

`POST /shifts/:id/end` -> `200 {id, actualEnd}`.

## Contact attempts (append-only)

`POST /contact-attempts` — single, idempotent on `idempotencyKey`. Body mirrors
`contact_attempts` columns in camelCase (`arriveAt, arriveGeom: {lat,lng}, arriveAccuracyM,
resultCode, ...`). Response `201 {id, flagStatus, outOfTurfException: null | {classification, distanceOutsideBoundaryM}}`.

`POST /contact-attempts/batch` — `{items: [...]}` for offline sync. Response reports
per-item outcome: `{results: [{idempotencyKey, status: "created"|"duplicate"|"error", id?, error?}]}`.
Never fails the whole batch for one bad item.

## Photo verification (ACCOUNTABILITY — never call this from safety code paths)

`GET /photo-verification/status?shiftId=` -> `{due: boolean, verificationId?: string}`.
Call this after every contact-attempt submission. The server holds the drawn interval
server-side (HMAC-committed from `shifts.photo_schedule_seed`); the client never learns N.

`POST /photo-verification/:id/submit` — multipart or `{imageBase64, capturedAt, captureGeom,
captureAccuracyM, deviceUptimeMs, mockLocationFlag, faceDetected}`. Server rejects
(`422 {error:"face_detected"}`) if `faceDetected: true` reaches it at all — the mobile app
must never submit a frame with a detected face; this is a defense-in-depth check.
Response `200 {status, insideTurf, verificationScore}`.

`POST /photo-verification/:id/defer` -> `200 {deferredUntil, deferralCount}`.

## Safety (SAFETY — never call this from verification code paths, never returns fraud/score fields)

`POST /wellness-checks/:id/respond` `{response: "ok"|"need_help", responseMode}` -> `200`.
Duress PIN entry is a *client-side* substitution: the mobile app posts `response: "ok"` to
this same endpoint regardless of which PIN was entered, and separately calls
`POST /safety/duress` `{shiftId}` silently in the background — the UI shown to the canvasser
is identical either way. See apps/mobile's consent/duress screens.

`POST /safety/sos` `{shiftId, geom}` -> `200 {safetyEventId}`.

`GET /console/safety-board?campaignId=` -> queue rows, **no production fields**:
```
{ items: [{
  id, userId, userName, teamName, timeDarkSeconds, watchdogStatus,
  lastKnownGeom, lastKnownAccuracyM, lastKnownAt,
  lastDoorAddress, lastDoorAt,   // location+time only, never a count
  batteryPct, turfName, escalationLevel, severity
}] }
```

## Manager console — Live Ops (the two-stack rule is part of the contract, not just UI)

`GET /console/live-ops?campaignId=` ->
```
{
  headerTiles: { agentsOnShift, agentsScheduled, doorsToday, contactsToday, contactRate,
                 verifiedShare, turfsComplete, turfsTotal, openSafetyItems, openAccountabilityItems },
  roster: [{ userId, userName, teamName, shiftStatus, doorsToday, contactsToday, contactRate,
             timeSinceLastDoorSeconds, photoStatus, outOfTurfCount, verificationScore,
             batteryPct, openFlags, lat, lng }],
  safetyAlerts: [ ... same shape as /console/safety-board items ... ],
  accountabilityAlerts: [{ id, userId, userName, type: "flagged_photo"|"flagged_contact"|"out_of_turf"|"attestation_failed",
                            severity, createdAt, summary }]
}
```
`safetyAlerts` and `accountabilityAlerts` are **separate arrays**. Never merge, interleave,
or jointly-sort them client-side — that defeats the entire point of section 8.0. If you're
an agent reading this and tempted to combine them into one `alerts` list for convenience,
don't; the console's own README should say why not, in one line, right next to where they're
rendered.

## Production stats (must never carry safety fields)

`GET /console/production-stats?campaignId=&period=` ->
```
{ agents: [{ userId, userName, teamName, shifts, hours, doors, contacts, contactRate,
             verifiedShare, doorsPerHour, avgDoorDurationSeconds, surveyCompletionRate }] }
```
No `idleSeconds`, `watchdogTrips`, `wellnessChecks`, or any safety-derived field may ever
appear in this response or in `/console/reports/*`. If you're the API agent, back this
endpoint with a repository function that only queries `contact_attempts`, `shifts`
(non-safety columns), and `photo_verifications` — never `wellness_checks`,
`safety_watchdog_state`, or `safety_events`.

## Errors

`{error: string, message?: string, details?: object}`, standard HTTP status codes.
