# Local dev database

```
docker compose up -d          # postgres+postgis on 5432, redis on 6379
./migrate.sh                  # applies migrations/*.sql in order, then seed.sql
```

If you're running against a bare-metal Postgres instead of the compose file (e.g. this
sandbox, which had no Docker daemon available), you need PostGIS installed and a superuser
role matching `POSTGRES_USER` before `migrate.sh` will succeed, since `0001` runs
`CREATE EXTENSION postgis` and `0011` creates a second role.

## Two roles, on purpose

- **`gbt`** (`DATABASE_URL` default) — superuser. Used by `migrate.sh` and nothing else.
  Superusers bypass row-level security, so never point the API at this role.
- **`gbt_app`** (password `gbt_app_dev_only` locally) — the role `apps/api` connects as.
  Full table privileges, no RLS bypass, so the org-isolation policies in
  `0010_audit_log_and_rls.sql` actually apply. Verified manually (see
  `docs/ARCHITECTURE.md` for the commands): with no `app.org_id` set, or the wrong one set,
  `gbt_app` sees zero rows in any campaign-scoped table; with the right one set, it sees
  exactly that org's rows.

The API must run every request inside a transaction that does
`SET LOCAL app.org_id = '<the authenticated user's org_id>'` before touching the database.
`SET LOCAL` is transaction-scoped, so there's no risk of one request's org leaking into the
next request on a pooled connection.

## Demo data

`seed.sql` creates one org, one campaign (`CA`, licensed), a field director / team lead /
canvasser, a team, a turf with a real (small) polygon, an address/household/voter, a
walkbook, and an assignment — all under fixed UUIDs listed at the top of the file, so
`apps/api`, `apps/console`, and `apps/mobile` can all reference the same demo user/campaign
IDs without a bootstrap round-trip.
