-- 0007_shifts_and_safety.sql
--
-- ============================================================================================
-- READ THIS BEFORE TOUCHING THIS FILE OR 0008_photo_verification.sql.
--
-- Build prompt section 8.0 is binding: there are exactly two verification/monitoring
-- mechanisms in this product and they are OPPOSITES.
--
--   * SAFETY (this file): the inactivity watchdog, wellness checks, breadcrumbs, and
--     duress/SOS events. Triggered by the ABSENCE of door activity and movement.
--     Produces NO verification signal. Must NEVER appear in a fraud score, a productivity
--     report, or an export.
--
--   * ACCOUNTABILITY (0008_photo_verification.sql): door-count-triggered photo capture.
--     Produces the primary anti-fraud evidence signal. Has NO safety role and must never
--     gate or substitute for a wellness check.
--
-- These are deliberately modeled as separate tables with no foreign keys between them, and
-- the API layer (apps/api) implements them as separate services (safety-service vs
-- verification-service) precisely so that merging them requires deleting code, not adding it.
-- Do not add a column here that references photo_verifications, and do not add a column
-- there that references safety_watchdog_state or wellness_checks. See docs/ARCHITECTURE.md.
-- ============================================================================================

CREATE TYPE pay_type AS ENUM ('hourly', 'per_door', 'volunteer');

CREATE TABLE shifts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id),
  campaign_id            uuid NOT NULL REFERENCES campaigns(id),
  scheduled_start        timestamptz,
  scheduled_end          timestamptz,
  actual_start           timestamptz,
  actual_end             timestamptz,
  start_geom             geometry(Point, 4326),
  end_geom               geometry(Point, 4326),
  consent_record_id      uuid,   -- FK added in 0009 after consent_records exists
  tracking_enabled       boolean NOT NULL DEFAULT true,
  pay_type               pay_type NOT NULL DEFAULT 'volunteer',
  device_id              uuid REFERENCES devices(id),
  photo_interval_profile_id uuid,  -- FK added in 0008
  photo_schedule_seed    bytea,    -- server-generated; roots the HMAC draw chain, never sent to device in plaintext
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE turf_boundary_exceptions
  ADD CONSTRAINT fk_tbe_shift FOREIGN KEY (shift_id) REFERENCES shifts(id);

-- SAFETY ONLY. No verification value. Never surfaced in a productivity report (enforced at
-- the query layer in apps/api — see docs/ARCHITECTURE.md "Safety/accountability firewall").

CREATE TYPE watchdog_status AS ENUM (
  'normal', 'paused_break', 'idle_warning', 'idle_alert', 'resolved', 'suppressed'
);

CREATE TABLE safety_watchdog_state (
  shift_id                uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  last_door_activity_at   timestamptz,
  last_movement_at        timestamptz,
  movement_radius_m       numeric,        -- radius of positions in the idle window
  idle_seconds            integer,
  last_evaluated_at       timestamptz NOT NULL DEFAULT now(),
  status                  watchdog_status NOT NULL DEFAULT 'normal',
  paused_reason           text,
  paused_until            timestamptz,
  window_seconds          integer NOT NULL DEFAULT 900   -- 15 min default, 10-45 min hard bounds (section 8.2)
);

CREATE TYPE wellness_trigger AS ENUM (
  'inactivity_watchdog', 'manager_initiated', 'hostile_turf', 'weather', 'after_dark'
);
CREATE TYPE wellness_response AS ENUM ('ok', 'need_help', 'no_response', 'duress');
CREATE TYPE wellness_response_mode AS ENUM ('tap', 'biometric', 'duress_pin', 'out_of_band');

CREATE TABLE wellness_checks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                 uuid NOT NULL REFERENCES shifts(id),
  user_id                  uuid NOT NULL REFERENCES users(id),
  triggered_by             wellness_trigger NOT NULL,
  triggered_at              timestamptz NOT NULL DEFAULT now(),
  idle_seconds_at_trigger    integer,
  last_known_geom             geometry(Point, 4326),
  last_known_accuracy_m         numeric,
  last_known_battery_pct          numeric,
  last_contact_attempt_id           uuid REFERENCES contact_attempts(id),
  prompted_at                        timestamptz,
  responded_at                        timestamptz,
  response                             wellness_response,
  response_mode                         wellness_response_mode,
  escalation_level                       integer NOT NULL DEFAULT 0,
  escalated_to                            jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_by                              uuid REFERENCES users(id),
  resolved_at                               timestamptz,
  resolution_note                            text
);

CREATE TABLE location_breadcrumbs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id          uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id),
  recorded_at       timestamptz NOT NULL,
  geom              geometry(Point, 4326) NOT NULL,
  accuracy_m        numeric,
  speed_mps         numeric,
  heading           numeric,
  battery_pct       numeric,
  activity_type     text,
  mock_location_flag boolean NOT NULL DEFAULT false,
  retention_expires_at timestamptz NOT NULL  -- set at write time; nightly job hard-deletes past this (section 11)
);

CREATE TYPE safety_event_type AS ENUM (
  'duress', 'no_response', 'manual_sos', 'hostile_report', 'injury', 'weather', 'other'
);

CREATE TABLE safety_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        uuid NOT NULL REFERENCES shifts(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  type            safety_event_type NOT NULL,
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  geom            geometry(Point, 4326),
  severity        text,
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolution      text,
  resolution_at   timestamptz,
  notes           text
);

CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_campaign ON shifts(campaign_id);
CREATE INDEX idx_shifts_active ON shifts(actual_start, actual_end);
CREATE INDEX idx_wellness_shift ON wellness_checks(shift_id);
CREATE INDEX idx_wellness_unresolved ON wellness_checks(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_breadcrumbs_shift ON location_breadcrumbs(shift_id, recorded_at);
CREATE INDEX idx_breadcrumbs_retention ON location_breadcrumbs(retention_expires_at);
CREATE INDEX idx_safety_events_shift ON safety_events(shift_id);
CREATE INDEX idx_safety_events_unresolved ON safety_events(resolution_at) WHERE resolution_at IS NULL;

-- Breadcrumbs must never exist outside an active shift window. This is a defense-in-depth
-- check (the API is the primary enforcement point, see apps/api/src/services/safety) that
-- rejects a breadcrumb whose recorded_at falls outside [actual_start, actual_end] once the
-- shift has ended. It intentionally allows writes while actual_end IS NULL (shift in progress).
CREATE FUNCTION breadcrumbs_require_active_shift() RETURNS trigger AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  SELECT actual_start, actual_end INTO v_start, v_end FROM shifts WHERE id = NEW.shift_id;
  IF v_start IS NULL OR NEW.recorded_at < v_start THEN
    RAISE EXCEPTION 'location_breadcrumbs: shift % has not started', NEW.shift_id;
  END IF;
  IF v_end IS NOT NULL AND NEW.recorded_at > v_end THEN
    RAISE EXCEPTION 'location_breadcrumbs: shift % has ended, no breadcrumbs permitted after actual_end', NEW.shift_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_breadcrumbs_require_active_shift
  BEFORE INSERT ON location_breadcrumbs
  FOR EACH ROW EXECUTE FUNCTION breadcrumbs_require_active_shift();
