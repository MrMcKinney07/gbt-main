# Canvasser mobile app

Expo (React Native + TypeScript) scaffold for the field canvasser app described in
`docs/ARCHITECTURE.md`. This is a bounded skeleton, not the full build-prompt spec: it
implements the offline-first outbox architecture and the safety/accountability separation for
real, plus a handful of core screens, and stubs everything the spec itself marks out of scope
(see `docs/SCOPE.md`).

## Setup

```bash
cd apps/mobile
npm install
```

Dependencies were added with `npx expo install <pkg>` so their versions are the ones Expo SDK
57 expects (`expo-sqlite`, `expo-camera`, `expo-haptics`, `expo-location`,
`@react-native-community/netinfo`, `expo-asset`). `npm install` alone is enough after cloning;
you don't need to re-run `expo install`.

## Running it

```bash
npx expo start
```

then press `a`/`i`/`w`, or scan the QR code with Expo Go, on a real device/simulator.

**No Android/iOS device, emulator, or simulator is available in this sandbox**, so the app
has never been run as an actual mobile build. What was verified at build time instead:

- `npx tsc --noEmit` — clean (see below).
- `npx jest` — 21/21 tests passing (see below).
- `npx expo export --platform android` — Metro successfully bundled the entire app
  (667 modules, no errors), which proves the whole import graph resolves and every file
  parses/transpiles correctly.

### Web preview (added in a later integration pass, demo-only)

`npx expo install react-dom react-native-web && npx expo start --web` now works, driven by
`metro.config.js` (registers `.wasm` as an asset extension and sets the COOP/COEP headers
`expo-sqlite`'s web build needs — this is Expo's own documented fix, not app-specific). This
was added specifically to let a real login → consent → shift start → door-screen →
wellness-prompt flow be driven end to end with a headless browser against the live API and
a live Postgres instance, rather than trusting each layer's own isolated tests. **It is a
demo aid, not a target platform** — camera capture, real GPS, and background location on web
behave differently (or not at all) versus native, and this is not how the app would ship.

That end-to-end run caught two real integration bugs neither this app's own test suite nor
the API's could have caught in isolation, since nothing before this exercised them together:

1. `ShiftStartScreen`'s `DEMO_DEVICE_ID` was the string `"demo-device-001"`, but
   `POST /shifts/start` validates `deviceId` with `z.string().uuid()` — every shift-start
   request failed with `invalid_request`. Fixed to the real seeded device id
   (`00000000-0000-0000-0000-000000000030`, `db/seed.sql`).
2. `ConsentScreen`'s four checklist items had no relationship to any real `consent_records`
   row — it sent its own local item ids (`"location"`, `"photos"`, ...) as `consentRecordIds`,
   which likewise fail the API's UUID validation. Fixed by mapping the two items that
   correspond to a real `consent_type` (`location`, `photos`) to their seeded
   `consent_records` UUIDs; see the comment above `CONSENT_ITEMS` in `ConsentScreen.tsx` for
   why this is a stand-in for a real consent-issuance endpoint that doesn't exist yet in
   `docs/API_CONTRACT.md`.

The API the app talks to (`http://localhost:3001`, per `docs/API_CONTRACT.md`) was not
reachable during the original build (built concurrently by another agent). That's fine by
design — this app is offline-first, and every screen and test below was built and verified
without the API needing to be up — see "Offline-first architecture".

## Tests

```bash
npx jest
```

21 tests across 5 suites, all passing:

- `test/backoff.test.ts` — exponential backoff + jitter math (pure function, deterministic
  via an injected `random`).
- `test/outbox.test.ts` — the outbox itself: enqueue-then-read-back with no "saving…" gap,
  `getDueBatch`'s backoff windowing, and — the acceptance-critical one — a test that opens a
  real on-disk SQLite file, writes 3 outbox rows, closes the connection (simulating a
  force-quit), reopens it (simulating relaunch), asserts all 3 rows and their exact state
  survived, marks some synced and one failed, closes and reopens *again*, and asserts there
  are still exactly 3 rows (no duplication from re-running migrations or from the partial
  sync) with the right ones marked synced/pending.
- `test/syncWorker.test.ts` — `drainOnce()`: full-batch success, partial batch success (some
  items `"created"`, one `"error"`, per `docs/API_CONTRACT.md`'s batch response shape),
  whole-batch network failure + backoff + successful retry with no duplicate rows ever
  created, idempotent re-drain when the server reports `"duplicate"` (simulating a response
  that was lost client-side after the server actually applied the write), single-item
  entities (`photo_verification`, `access_report`) draining independently of the
  contact-attempt batch, and that two overlapping triggers never run two drains concurrently.
- `test/safety-firewall.test.ts` — greps every source file under `src/features/safety/` and
  `src/features/verification/` for an import of the other directory and asserts there are
  none. Mirrors what `apps/api`'s own safety-firewall test does for the backend.
- `test/duress-parity.test.tsx` — renders the wellness "I'm fine" flow twice (once with the
  normal PIN, once with the duress PIN) against a mock API client and asserts the two
  resulting rendered trees are **byte-identical** (`JSON.stringify` equal), that both call
  `respondWellnessCheck(..., 'ok', ...)` identically, and that *only* the duress path also
  calls the silent `postSafetyDuress` endpoint.

`npx jest` and `npx tsc --noEmit` are also available as `npm run test` / `npm run typecheck`.

The outbox/sync tests run against a **real SQL engine**, not a hand-rolled fake: Node's
built-in `node:sqlite` module executes the exact same `src/db/schema.ts` DDL the app ships.
`src/db/types.ts` defines a small `SQLiteDatabase` interface (matching expo-sqlite's async
API); `src/db/database.ts` adapts `expo-sqlite` to it for the app, and `test/testDb.ts` adapts
`node:sqlite` to it for tests. Business logic (`src/db/outbox.ts`, `src/sync/syncWorker.ts`)
only ever depends on the interface, so it's identical code running in both places.

## Offline-first architecture (build prompt section 9)

**Every write goes to SQLite first, synchronously with the UI update, before any network
call.** `src/db/writes.ts` has the three "record a ___" helpers screens call
(`recordContactAttempt`, `recordAccessReport`, `recordPhotoVerificationSubmission`); each one
inserts into the `outbox` table (`src/db/outbox.ts`) with a client-generated UUID id and a
separate idempotency key, then returns immediately. There is no spinner anywhere in this app
waiting on a network response for a write to "save" — `DoorScreen.tsx`'s result-code buttons,
for example, update local state and move to the next door the moment the SQLite insert
resolves.

`src/sync/syncWorker.ts`'s `drainOnce()` does the actual syncing, in the background:

- Contact attempts are batched (`POST /contact-attempts/batch`, per the contract) and the
  per-item `"created" | "duplicate" | "error"` response is handled item-by-item — a single
  bad item never blocks the rest of the batch, matching the contract's own guarantee.
- Photo verification submissions and access reports (not a batch endpoint per the contract)
  are drained one at a time.
- Every failure — a single rejected item or a whole failed request — bumps that row's
  `sync_attempts` and schedules `next_attempt_at` with exponential backoff + full jitter
  (`src/sync/backoff.ts`), capped at 15 minutes.
- **It never re-enqueues.** A retry re-sends the *same* outbox row with the *same*
  idempotency key, so even if a previous attempt's response was lost after the server had
  already applied the write, the retry just gets back `"duplicate"` and is marked synced —
  no double-counted door.

`src/sync/triggers.ts` wires the three real-world triggers the spec asks for: network
reconnect (`@react-native-community/netinfo`), app foreground (`AppState`), and a periodic
timer (30s). `SyncWorker` (in `syncWorker.ts`) guards against two triggers firing a drain
concurrently.

Local mirrors of server data (`src/db/localData.ts`: `walkbooks`, `addresses`, `households`,
`voters`) are a simplified subset of the server schema, just enough to drive the door screen
offline. `docs/API_CONTRACT.md` v0 doesn't specify a pull-sync endpoint for these, so
`seedDemoWalkbookIfEmpty()` stands in for that on first launch (a small 2-door demo walkbook).
A real build would replace this with a real pull-sync against the server's
walkbook/address/household endpoints once those exist.

**access report sync** is a small documented extension: `docs/API_CONTRACT.md` doesn't define
an endpoint for it, so per that doc's own "make the reasonable call and note it" rule, this
build syncs it to a stub `POST /access-reports`.

## Safety / accountability separation (docs/ARCHITECTURE.md section 8.0)

Two mechanisms, kept structurally apart, exactly as `docs/ARCHITECTURE.md` requires:

|  | `src/features/verification/` | `src/features/safety/` |
|---|---|---|
| Purpose | Accountability / anti-fraud | Safety / welfare |
| Trigger | Door-count-based, server-drawn interval | Inactivity watchdog (server-side, not implemented — see below) |
| Prompt copy | "Time to take a photo of the street." | "Haven't seen any activity for a bit. Everything okay?" |
| Color | Purple (`colors.verification`) | Red (`colors.safety`) |
| Component tree | `PhotoVerificationScreen` → `CameraCapture` | `WellnessPromptSheet` → `PinPad` / `WellnessConfirmation`, `SosButton` |

Neither directory imports from the other. `test/safety-firewall.test.ts` asserts this by
grepping every source file in both directories for a cross-import, the same way
`apps/api/test/safety-firewall.test.ts` enforces it on the backend (per
`docs/ARCHITECTURE.md`).

**Duress PIN**: `WellnessPromptSheet.tsx`'s "I'm fine" button leads to a PIN pad
(`PinPad.tsx`). Entering the normal demo PIN (`1234`) or the duress demo PIN (`9999`) —
see `src/features/safety/pins.ts` — takes the **identical** code path to the same
`WellnessConfirmation` screen: both call `respondToWellnessCheck(api, checkId, 'ok', 'pin')`.
The duress PIN *additionally* calls `reportDuress()` (→ `POST /safety/duress`) silently in the
background — no visual, haptic, or audio difference. `test/duress-parity.test.tsx` renders
both paths against a mock API and asserts the resulting component trees are
`JSON.stringify`-identical, and that only the duress path invokes the duress endpoint.

**SOS**: `SosButton.tsx` is a persistent 3-second long-press control (`delayLongPress={3000}`)
on the door screen. Confirmation is haptic-only (`expo-haptics`, `NotificationFeedbackType.Success`)
— no sound, no visible alert — so it stays usable if the phone needs to stay silent or hidden.

## What's stubbed, and why

- **Face detection for photo verification.** `docs/API_CONTRACT.md` requires the mobile app
  to never submit a frame with a detected face (the server's `faceDetected: true` rejection is
  defense-in-depth, not the primary control). This scaffold does **not** run any on-device
  face detection — `expo-face-detector` is deprecated/unavailable on current Expo SDKs, and
  there's no simple maintained replacement bundled with Expo. `CameraCapture.tsx` and
  `PhotoVerificationScreen.tsx` always report `faceDetected: false` rather than fabricating a
  result; this is called out with a `TODO(real build)` comment at both call sites. A real
  build should add a maintained on-device detector — e.g. a `react-native-vision-camera` frame
  processor backed by Google ML Kit (Android) / Apple Vision (iOS), wired in via a config
  plugin — and block capture (or at least block submit) on a positive detection before this
  ships.
- **No image picker / gallery import**, by design — `CameraCapture.tsx` is the only path that
  can produce a photo-verification payload, and it only ever comes from a live
  `CameraView.takePictureAsync()` call. There is no `expo-image-picker` dependency anywhere in
  this app.
- **No map view.** Per `docs/SCOPE.md`, live basemap tiles are out of scope; the door screen
  is a simple list/detail view over the local address mirror, not a map.
- **No live inactivity watchdog.** The real trigger for a wellness check is server-side
  (`docs/API_CONTRACT.md`'s watchdog window, per `docs/SCOPE.md` item 11a — 15 minutes of no
  door activity + movement). This build doesn't implement that server-side timer or a client
  poll for it. Instead, `src/features/debug/DebugScreen.tsx` has a "Simulate wellness check"
  button (reachable from a "Debug menu" link on the door screen) that opens the exact same
  `WellnessPromptSheet` a real trigger would.
- **Photo verification defer** (`POST /photo-verification/:id/defer`) is called directly
  online rather than through the outbox — deferring meaningfully needs the server's
  authoritative deferral count back immediately, so if the device is offline the defer button
  shows an error asking the canvasser to capture the photo instead. Everything else
  (contact attempts, photo submissions, access reports) goes through the outbox.
- **Pull-sync for walkbook/address/household data** doesn't exist yet (not specified in
  `docs/API_CONTRACT.md` v0). `seedDemoWalkbookIfEmpty()` in `src/db/localData.ts` seeds one
  small demo walkbook on first launch so the door screen has something to show.
- **UUIDs** (`src/utils/uuid.ts`) are a dependency-free RFC4122-v4-shaped generator using
  `Math.random()`, not a CSPRNG. Fine for a client-generated, effectively-unguessable-enough
  local id / idempotency key in this scaffold; a production build should swap this for
  `expo-crypto`'s `randomUUID()`.
- **Duress/normal PINs are hardcoded demo values** (`src/features/safety/pins.ts`). A real
  build would set these per-canvasser at onboarding, store them server-side or in
  `expo-secure-store`, and rate-limit entry attempts.
- **Navigation** is a small hand-rolled screen-state switch in `App.tsx`, not
  `@react-navigation`. Reasonable for a bounded scaffold with ~5 screens; a fuller build
  should move to a real navigator once there are enough screens/deep-links to justify it.
- **Consent copy** (`src/features/shift/ConsentScreen.tsx`) is real, specific copy drafted
  from the build prompt's own required disclosures (5.2, 8.6, 11.3, 11.3a) — not lorem ipsum
  — but per `docs/SCOPE.md` item 5 it has **not** had a legal review and needs one before use
  on a real canvass.

## Battery / offline behavior — could not be measured here

This session has no physical device or emulator, so nothing about battery drain, background
location accuracy, or real-world offline/reconnect timing (section 5.7/14 of the build prompt)
was measured. What the code does by design, for when that measurement becomes possible:

- Location is only ever requested in the foreground, on-demand (at a contact-attempt write,
  an SOS press, or a photo capture) — there is no continuous background location tracking
  loop in this build, which is the single biggest lever on battery for an app like this. A
  full build implementing the spec's periodic breadcrumb trail would need a proper background
  task (`expo-task-manager` / `expo-location`'s background updates) and should budget real
  device battery testing before tuning its interval.
- The sync worker's periodic timer (30s) only does work when there's something due to sync
  (`getDueBatch` returns empty otherwise) — an idle canvasser with everything already synced
  costs a cheap SQLite `SELECT` every 30s, not a network request.
- All writes are batched where the contract allows it (contact attempts), so a canvasser who
  goes offline for a stretch and comes back online sends one batch request, not N individual
  ones.
