-- 0001_core_identity.sql
-- Organizations, campaigns, users, roles, teams, devices.
-- See docs/ARCHITECTURE.md for the full data-model rationale (build prompt section 4).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  legal_entity_name  text,
  ein                text,
  settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE campaign_type AS ENUM ('candidate', 'ballot', 'advocacy', 'registration', 'petition');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'closed');

CREATE TABLE campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name               text NOT NULL,
  type               campaign_type NOT NULL,
  jurisdiction_state text NOT NULL,          -- USPS 2-letter
  jurisdiction_geo   geometry(MultiPolygon, 4326),
  timezone           text NOT NULL DEFAULT 'America/New_York',
  start_date         date,
  end_date           date,
  status             campaign_status NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE employment_type AS ENUM ('w2', '1099', 'volunteer');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'inactive', 'suspended', 'offboarded');

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email              citext UNIQUE,
  phone              text,
  password_hash      text,                  -- Argon2id
  auth_provider_id   text,
  status             user_status NOT NULL DEFAULT 'invited',
  employment_type    employment_type NOT NULL DEFAULT 'volunteer',
  hire_date          date,
  termination_date   date,
  duress_pin_hash    text,                  -- separate from password_hash, never logged together
  emergency_contact_encrypted bytea,         -- field-level encrypted, see docs/SECURITY.md
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE campaign_role AS ENUM (
  'canvasser', 'team_lead', 'field_organizer', 'field_director',
  'data_admin', 'compliance_officer', 'org_owner', 'auditor'
);

CREATE TABLE user_campaign_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  role         campaign_role NOT NULL,
  granted_by   uuid REFERENCES users(id),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (user_id, campaign_id, role)
);

CREATE TABLE teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL,
  lead_user_id uuid REFERENCES users(id),
  region_geom  geometry(MultiPolygon, 4326),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at   timestamptz,
  PRIMARY KEY (team_id, user_id)
);

CREATE TYPE attestation_status AS ENUM ('unknown', 'pending', 'passed', 'failed');

CREATE TABLE devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform           text NOT NULL,          -- ios | android
  os_version         text,
  app_version        text,
  device_fingerprint text,
  push_token         text,
  attestation_status attestation_status NOT NULL DEFAULT 'unknown',
  data_key_id        text,                   -- KMS reference for remote-wipe-by-key-revocation
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  last_seen_at       timestamptz,
  wipe_requested_at  timestamptz,
  wipe_confirmed_at  timestamptz
);

CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_ucr_user ON user_campaign_roles(user_id);
CREATE INDEX idx_ucr_campaign ON user_campaign_roles(campaign_id);
CREATE INDEX idx_devices_user ON devices(user_id);
