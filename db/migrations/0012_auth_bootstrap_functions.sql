-- 0012_auth_bootstrap_functions.sql
--
-- Fixes the chicken-and-egg problem the API's authBootstrap.ts / orgList.ts document: RLS on
-- `users` and `organizations` requires app.org_id to already be set, but login (given only an
-- email) and the cross-org watchdog tick (which must enumerate every org before it can open a
-- per-org transaction) both need a row *before* an org_id is known. Those two modules worked
-- around it in this build by opening a second connection pool as the migrations superuser --
-- functionally correct, but it means the API process holds superuser credentials at runtime,
-- which is the wrong shape for production.
--
-- SECURITY DEFINER functions are the standard fix: they run with the privileges of their
-- owner (here, `gbt`, which has BYPASSRLS) regardless of the calling role's session state, so
-- gbt_app can call them without ever holding superuser credentials itself. Each function
-- returns only the narrow columns its one caller actually needs -- neither is a general-purpose
-- RLS bypass.

CREATE FUNCTION auth_lookup_user_for_login(p_email citext)
RETURNS TABLE (id uuid, org_id uuid, password_hash text, status user_status)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, org_id, password_hash, status FROM users WHERE email = p_email LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_lookup_user_for_login(citext) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user_for_login(citext) TO gbt_app;

CREATE FUNCTION list_all_org_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM organizations;
$$;

REVOKE ALL ON FUNCTION list_all_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_all_org_ids() TO gbt_app;

-- Ownership: functions created by the migration role (gbt, superuser/BYPASSRLS) already run as
-- that owner by default: no ALTER FUNCTION ... OWNER TO needed here as long as migrations
-- always run as gbt. Documented explicitly so this doesn't quietly break if that ever changes.
