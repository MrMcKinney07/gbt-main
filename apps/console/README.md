# GBT Field Console

Manager console for the canvassing platform. This build covers exactly two screens from the
build prompt, done well rather than the whole console: **Login** and the **Live Operations
board** (6.1), plus the **Safety board** (6.5) since it's load-bearing for the platform's
central safety/accountability separation. See `/home/user/gbt-main/docs/ARCHITECTURE.md`,
`docs/API_CONTRACT.md`, and `docs/SCOPE.md` for the platform-wide context this app was built
against.

## Setup

```bash
cd apps/console
npm install
cp .env.example .env.local   # optional — defaults to http://localhost:3001 if you skip this
npm run dev
```

Open http://localhost:3000. It redirects to `/login`. Demo credentials are shown on that page
(`director@demo.local` / `lead@demo.local` / `canvasser@demo.local`, password `devpassword`
for all three — see `docs/API_CONTRACT.md`).

`npm run build` produces a production build; `npm run lint` runs ESLint. Both pass clean as
of this commit.

### Env vars

- `NEXT_PUBLIC_API_URL` — base URL of `apps/api`. Defaults to `http://localhost:3001` (see
  `lib/api-client.ts`) if unset.

## What's mocked vs. live

Every fetch call targets the real, documented endpoint and shape from `docs/API_CONTRACT.md`
(`POST /auth/login`, `GET /console/live-ops`, `GET /console/safety-board`) — nothing is routed
through a fake local backend. `apps/api` was still being built concurrently with this console
and wasn't reachable at any point during this build (confirmed: `apps/api/src/routes/`
currently only has `auth.ts` and `shifts.ts`; no `/console/*` routes yet). So in practice:

- **Live**, once the API is up: login, and both boards' data fetching (they poll on an
  interval — 15s for Live Ops, 10s for Safety — and will pick up the real API the moment it
  starts answering).
- **Mocked as a fallback, not a substitute**: `lib/use-live-data.ts`'s hooks try the real
  endpoint first; only on a network error do they fall back to `lib/mock-data.ts`, and the UI
  shows a visible "Demo data — API unreachable" badge whenever that happens, so nobody mistakes
  it for live data. The mock roster/alerts are invented (beyond the one real seeded canvasser,
  `db/seed.sql`'s `...012` / Maria Gonzalez) so the boards have enough agents to be worth
  looking at.
- **Turf geometry**: the API contract's `/console/live-ops` and `/console/safety-board`
  responses don't carry turf polygon geometry (only `turfName`). The demo turf's rough
  bounding box is hardcoded in `lib/constants.ts`, hand-copied from `db/seed.sql`'s
  `ST_GeomFromText` WKT literal for "Sun Ray Estates A". Swap it for a real `GET /turfs/:id`
  response (or an expanded contract) once one exists.
- **Row actions on the Safety board** (call, text, send wellness prompt, acknowledge, ask
  nearby agent, escalate) are UI stubs — the contract doesn't yet define manager-initiated
  endpoints for these. They show visible intent (a small inline confirmation) rather than
  silently doing nothing. **Resolve** is the one action with real client-side behavior worth
  noting: it opens a modal and requires selecting an outcome reason before it can be
  submitted, per the spec, even though it's not wired to a real endpoint yet either.

## Auth storage tradeoff

The JWT from `POST /auth/login` is kept in `localStorage` (see `lib/auth-context.tsx`), not an
httpOnly cookie. The contract is a stateless `Authorization: Bearer <jwt>` scheme served from a
different origin (`localhost:3001`) than the console (`localhost:3000`), with no cookie/session
support documented — an httpOnly cookie set by the console couldn't be attached to those
cross-origin API calls without an additional same-origin proxy route that isn't part of the
contract. localStorage is simpler and matches the contract as given. The real tradeoff is XSS
exposure: a production build should put a same-origin BFF (e.g. Next.js route handlers) in
front of the API and switch to httpOnly cookies instead.

## The safety/accountability color language — please don't "fix" this

This is the single most important visual rule in the app (see `docs/ARCHITECTURE.md`, "the one
architectural rule that matters most"). There are two monitoring mechanisms in this product and
they are opposites:

- **Safety** (the inactivity watchdog) — welfare/wellbeing, triggered by *absence* of activity.
- **Accountability** (photo verification) — anti-fraud, triggered by door count.

They are colored differently everywhere, on purpose, using two reserved palettes defined once
in `lib/colors.ts` and mirrored as CSS variables in `app/globals.css`:

| | Color family | Hex (`DEFAULT`) | Used for |
|---|---|---|---|
| Safety | red | `#dc2626` | Safety alert stack, watchdog map markers (pulsing), Safety board, "open safety items" tile |
| Accountability | violet | `#7c3aed` | Accountability alert stack, photo-status badges, "open accountability items" tile |

Icons differ too (a life-ring for safety, a camera for accountability — `components/icons.tsx`)
so the distinction survives grayscale printing or color-blindness, not just hue.

A third, *unrelated* color scale — green/amber/red for agent-dot activity recency on the Live
Ops map (`lib/colors.ts`'s `activityColor`) — deliberately uses a different red shade
(`#b91c1c`, not the safety red `#dc2626`) so a stale agent dot never reads as a safety alert at
a glance. If you're tempted to unify these palettes, or to combine the safety and
accountability alert stacks into one list for convenience, don't — that's the exact failure
mode `docs/ARCHITECTURE.md` calls out. Every place the two arrays render, there's a one-line
comment explaining why they stay separate (`components/AlertRail.tsx`,
`app/(console)/safety/page.tsx`).

## Map

Uses MapLibre GL JS with the free, keyless `https://demotiles.maplibre.org/style.json` style —
no Mapbox/Maptiler token needed or available in this environment. Map components
(`components/LiveOpsMap.tsx`, `components/SafetyMap.tsx`) are loaded via `next/dynamic` with
`ssr: false` since MapLibre needs `window`.

**Note on verifying this locally in a sandboxed/proxied environment**: if your container
intercepts outbound HTTPS with a custom CA (like the one this was built in), a headless
browser that doesn't trust that CA will fail to fetch the demotiles style
(`ERR_CERT_AUTHORITY_INVALID`) even though the endpoint is reachable and returns `200` for any
client that does trust it (verified with `curl --cacert`). This isn't an app bug — a normal
browser on a normal network loads the style fine.

## Structure

```
app/
  login/page.tsx              Screen 1
  (console)/layout.tsx        Nav + client-side auth guard (redirects to /login)
  (console)/live-ops/page.tsx Screen 2 — Live Operations board
  (console)/safety/page.tsx   Screen 3 — Safety board
components/                   HeaderTiles, RosterTable, AlertRail, LiveOpsMap, SafetyQueue,
                               SafetyMap, SafetyRowActions, SafetyBanner, icons
lib/
  types.ts                    Mirrors docs/API_CONTRACT.md response shapes
  api-client.ts                Fetch wrapper (Authorization: Bearer <jwt>, NEXT_PUBLIC_API_URL)
  auth-context.tsx            Client auth context (localStorage-backed)
  use-live-data.ts            Polling hooks with mock-data fallback + isMock flag
  mock-data.ts                Contract-shaped demo data
  colors.ts / constants.ts / format.ts
```
