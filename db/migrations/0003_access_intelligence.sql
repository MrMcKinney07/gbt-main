-- 0003_access_intelligence.sql
-- Gate/callbox/dog knowledge as a first-class, confidence-scored object (section 7.3 / 4.3).

CREATE TYPE access_scope_type AS ENUM ('address', 'building', 'subdivision', 'complex');

CREATE TYPE access_type AS ENUM (
  'open', 'gate_code', 'callbox', 'guard', 'key_fob', 'locked_lobby',
  'fence', 'private_road', 'permit_required', 'no_soliciting_posted',
  'hostile_resident', 'dog', 'construction', 'vacant', 'seasonal_vacant', 'unsafe'
);

CREATE TYPE access_directive AS ENUM (
  'enter', 'enter_with_code', 'request_at_callbox', 'check_in_with_guard',
  'do_not_enter', 'approach_with_caution', 'skip'
);

CREATE TYPE access_source AS ENUM (
  'canvasser_report', 'osm_import', 'parcel_inference', 'manager_entry',
  'behavioral_inference', 'partner_org'
);

CREATE TYPE access_status AS ENUM ('unverified', 'verified', 'disputed', 'expired', 'retired');

CREATE TABLE access_points (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type               access_scope_type NOT NULL,
  scope_id                 uuid NOT NULL,      -- polymorphic: addresses.id or buildings.id
  geom                     geometry(Point, 4326),
  access_type              access_type NOT NULL,
  directive                access_directive NOT NULL,
  access_secret_encrypted  bytea,              -- gate code; opt-in per campaign, see state_data_policies
  access_secret_retention_until timestamptz,
  hours_allowed            jsonb,              -- {"mon": ["09:00","19:00"], ...}
  notes_text               text,
  photo_object_key         text,               -- exterior only, never a person; enforced app-side
  confidence                numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  confidence_half_life_days integer NOT NULL DEFAULT 180,
  first_reported_by         uuid REFERENCES users(id),
  first_reported_at         timestamptz NOT NULL DEFAULT now(),
  last_confirmed_by         uuid REFERENCES users(id),
  last_confirmed_at         timestamptz,
  confirm_count             integer NOT NULL DEFAULT 0,
  deny_count                integer NOT NULL DEFAULT 0,
  status                    access_status NOT NULL DEFAULT 'unverified',
  source                    access_source NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE access_report_action AS ENUM ('confirm', 'deny', 'amend', 'new');

CREATE TABLE access_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_point_id  uuid NOT NULL REFERENCES access_points(id) ON DELETE CASCADE,
  reported_by_user_id uuid NOT NULL REFERENCES users(id),
  campaign_id      uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reported_at      timestamptz NOT NULL DEFAULT now(),
  action           access_report_action NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom             geometry(Point, 4326),
  gps_accuracy_m   numeric
);

CREATE INDEX idx_access_points_geom ON access_points USING GIST (geom);
CREATE INDEX idx_access_points_scope ON access_points(scope_type, scope_id);
CREATE INDEX idx_access_reports_point ON access_reports(access_point_id);

-- Gate secrets are opt-in and short-lived: nightly job (application-scheduled) purges anything
-- past access_secret_retention_until. This view is what that job selects from.
CREATE VIEW access_secrets_due_for_purge AS
  SELECT id FROM access_points
  WHERE access_secret_encrypted IS NOT NULL
    AND access_secret_retention_until IS NOT NULL
    AND access_secret_retention_until < now();
