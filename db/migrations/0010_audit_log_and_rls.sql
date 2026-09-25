-- 0010_audit_log_and_rls.sql
-- Append-only, hash-chained audit log, and org-isolation row-level security.
--
-- Note on scope: RLS here enforces the multi-tenant boundary (an org can never see another
-- org's rows). Section 3's field-level PII masking (a canvasser sees name+address but not
-- phone/email unless the campaign enables it) is deliberately NOT implemented as RLS -- the
-- spec calls it out as field-level, not row-level -- and instead lives in the API's
-- serialization layer (apps/api/src/serializers), where it belongs.

CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id),
  actor_user_id  uuid REFERENCES users(id),
  actor_role     text,
  action         text NOT NULL,
  entity_type    text NOT NULL,
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  ip             text,
  user_agent     text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  request_id     text,
  prev_hash      text,
  hash           text NOT NULL
);

CREATE INDEX idx_audit_org ON audit_log(org_id, occurred_at);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);

CREATE FUNCTION audit_log_hash_chain() RETURNS trigger AS $$
DECLARE
  v_prev_hash text;
BEGIN
  SELECT hash INTO v_prev_hash FROM audit_log
    WHERE org_id = NEW.org_id ORDER BY occurred_at DESC, id DESC LIMIT 1;
  NEW.prev_hash := v_prev_hash;
  NEW.hash := encode(
    digest(
      coalesce(v_prev_hash, '') || '|' ||
      NEW.org_id::text || '|' || coalesce(NEW.actor_user_id::text, '') || '|' ||
      NEW.action || '|' || NEW.entity_type || '|' || coalesce(NEW.entity_id::text, '') || '|' ||
      coalesce(NEW.before::text, '') || '|' || coalesce(NEW.after::text, '') || '|' ||
      NEW.occurred_at::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_hash_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_hash_chain();

CREATE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_block_update
  BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
CREATE TRIGGER trg_audit_log_block_delete
  BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

-- Verification helper: recomputes the chain and returns the first row (if any) whose stored
-- hash no longer matches, which is what the console's audit log viewer (6.16) calls to show
-- "hash-chain verification status".
CREATE FUNCTION audit_log_find_tamper(p_org_id uuid) RETURNS uuid AS $$
DECLARE
  r record;
  v_prev text := NULL;
  v_expected text;
BEGIN
  FOR r IN SELECT * FROM audit_log WHERE org_id = p_org_id ORDER BY occurred_at ASC, id ASC LOOP
    IF r.prev_hash IS DISTINCT FROM v_prev THEN
      RETURN r.id;
    END IF;
    v_expected := encode(
      digest(
        coalesce(v_prev, '') || '|' ||
        r.org_id::text || '|' || coalesce(r.actor_user_id::text, '') || '|' ||
        r.action || '|' || r.entity_type || '|' || coalesce(r.entity_id::text, '') || '|' ||
        coalesce(r.before::text, '') || '|' || coalesce(r.after::text, '') || '|' ||
        r.occurred_at::text,
        'sha256'
      ), 'hex'
    );
    IF v_expected IS DISTINCT FROM r.hash THEN
      RETURN r.id;
    END IF;
    v_prev := r.hash;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------------------
-- Row-level security: org isolation
-- ------------------------------------------------------------------------------------------

CREATE FUNCTION app_current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns', 'users', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = app_current_org_id())', t
    );
  END LOOP;
END $$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON organizations USING (id = app_current_org_id());

-- devices carry no org_id of their own; scope through the owning user.
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON devices
  USING (user_id IN (SELECT id FROM users WHERE org_id = app_current_org_id()));

-- Campaign-scoped tables (no org_id column of their own): scope through campaigns.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teams', 'turfs', 'walkbooks', 'assignments', 'contact_attempts', 'scripts',
    'survey_definitions', 'objection_library', 'shifts', 'photo_interval_profiles',
    'photo_verifications', 'campaign_data_licenses', 'turf_boundary_exceptions',
    'turf_exception_shift_rollups'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (campaign_id IN (SELECT id FROM campaigns WHERE org_id = app_current_org_id()))', t
    );
  END LOOP;
END $$;

-- Application connections run as a role that has these policies applied; a migrations/admin
-- role bypasses RLS via BYPASSRLS, configured in db/README.md.
