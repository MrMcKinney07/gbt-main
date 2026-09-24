-- 0011_app_role.sql
-- The migration/seed role (gbt, set as POSTGRES_USER in docker-compose) is a superuser and
-- therefore bypasses every RLS policy above -- fine for migrations, wrong for the API.
-- apps/api must connect as gbt_app, which has full table privileges but no RLS bypass, so
-- the org-isolation policies in 0010 actually apply to it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gbt_app') THEN
    CREATE ROLE gbt_app LOGIN PASSWORD 'gbt_app_dev_only';
  END IF;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO gbt_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO gbt_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gbt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gbt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gbt_app;
