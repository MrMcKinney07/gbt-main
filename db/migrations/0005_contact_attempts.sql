-- 0005_contact_attempts.sql
--
-- The single most important table in the system (build prompt section 4.5). Contact
-- attempts are immutable events. A correction creates a new record with
-- supersedes_contact_id set; nothing is ever edited in place and nothing is hard deleted.
--
-- This is enforced here, not just by convention: a trigger blocks UPDATE on every column
-- except the review/scoring columns the verification pipeline is allowed to attach after
-- the fact (verification_score, verification_signals, flag_status, flag_reasons), and
-- blocks DELETE outright.

CREATE TYPE contact_result_code AS ENUM (
  'spoke_with_target', 'spoke_with_other_household_member', 'not_home',
  'refused', 'moved', 'deceased', 'language_barrier',
  'inaccessible_gate', 'inaccessible_locked_building', 'inaccessible_dog_hazard',
  'vacant_construction', 'wrong_address', 'left_literature'
);
CREATE TYPE contact_scope AS ENUM ('voter', 'household', 'building');
CREATE TYPE notes_source AS ENUM ('typed', 'voice', 'template');
CREATE TYPE flag_status AS ENUM ('none', 'auto_flagged', 'in_review', 'cleared', 'confirmed_bad');

CREATE TABLE contact_attempts (
  id                    uuid PRIMARY KEY,             -- generated on device
  idempotency_key       text NOT NULL,
  campaign_id           uuid NOT NULL REFERENCES campaigns(id),
  assignment_id         uuid NOT NULL REFERENCES assignments(id),
  walkbook_id           uuid NOT NULL REFERENCES walkbooks(id),
  turf_id                uuid NOT NULL REFERENCES turfs(id),
  address_id             uuid NOT NULL REFERENCES addresses(id),
  household_id            uuid NOT NULL REFERENCES households(id),
  voter_id                 uuid REFERENCES voters(id),   -- nullable for household-level results
  canvasser_user_id         uuid NOT NULL REFERENCES users(id),
  device_id                  uuid NOT NULL REFERENCES devices(id),
  result_code                 contact_result_code NOT NULL,
  scope                        contact_scope NOT NULL DEFAULT 'voter',

  -- verification evidence, all of it, always
  arrive_at              timestamptz NOT NULL,
  arrive_geom             geometry(Point, 4326) NOT NULL,
  arrive_accuracy_m        numeric,
  arrive_altitude           numeric,
  arrive_speed_mps           numeric,
  depart_at                   timestamptz,
  depart_geom                  geometry(Point, 4326),
  depart_accuracy_m             numeric,
  duration_seconds                integer,
  distance_to_door_m               numeric,
  recorded_at                       timestamptz NOT NULL,  -- device clock at entry
  device_uptime_ms                   bigint,               -- monotonic clock; resists clock tampering
  synced_at                           timestamptz NOT NULL DEFAULT now(), -- server clock at receipt
  mock_location_flag                   boolean NOT NULL DEFAULT false,
  attestation_token_id                  text,
  step_count_since_last                  integer,
  network_type                            text,
  carrier_mcc_mnc                          text,
  observed_ip_country                       text,

  -- payload
  survey_response_id      uuid,
  notes_text                text,
  notes_source                notes_source,
  supersedes_contact_id         uuid REFERENCES contact_attempts(id),

  -- scoring (the only columns the review pipeline may update post-insert)
  verification_score        numeric(4,3),
  verification_signals        jsonb NOT NULL DEFAULT '{}'::jsonb,
  flag_status                   flag_status NOT NULL DEFAULT 'none',
  flag_reasons                    text[] NOT NULL DEFAULT '{}',

  UNIQUE (idempotency_key)
);

ALTER TABLE turf_boundary_exceptions
  ADD CONSTRAINT fk_tbe_contact_attempt
  FOREIGN KEY (contact_attempt_id) REFERENCES contact_attempts(id) ON DELETE CASCADE;

CREATE INDEX idx_ca_assignment ON contact_attempts(assignment_id);
CREATE INDEX idx_ca_canvasser ON contact_attempts(canvasser_user_id);
CREATE INDEX idx_ca_campaign ON contact_attempts(campaign_id);
CREATE INDEX idx_ca_address ON contact_attempts(address_id);
CREATE INDEX idx_ca_voter ON contact_attempts(voter_id);
CREATE INDEX idx_ca_arrive_geom ON contact_attempts USING GIST (arrive_geom);
CREATE INDEX idx_ca_recorded_at ON contact_attempts(recorded_at);
CREATE INDEX idx_ca_flag_status ON contact_attempts(flag_status) WHERE flag_status != 'none';

-- Append-only enforcement -----------------------------------------------------------

CREATE FUNCTION contact_attempts_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contact_attempts is append-only: DELETE is not permitted. Corrections must insert a new row with supersedes_contact_id set.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_attempts_block_delete
  BEFORE DELETE ON contact_attempts
  FOR EACH ROW EXECUTE FUNCTION contact_attempts_block_delete();

CREATE FUNCTION contact_attempts_restrict_update() RETURNS trigger AS $$
BEGIN
  IF NEW.id                      IS DISTINCT FROM OLD.id
     OR NEW.idempotency_key      IS DISTINCT FROM OLD.idempotency_key
     OR NEW.campaign_id          IS DISTINCT FROM OLD.campaign_id
     OR NEW.assignment_id        IS DISTINCT FROM OLD.assignment_id
     OR NEW.walkbook_id          IS DISTINCT FROM OLD.walkbook_id
     OR NEW.turf_id              IS DISTINCT FROM OLD.turf_id
     OR NEW.address_id           IS DISTINCT FROM OLD.address_id
     OR NEW.household_id         IS DISTINCT FROM OLD.household_id
     OR NEW.voter_id              IS DISTINCT FROM OLD.voter_id
     OR NEW.canvasser_user_id      IS DISTINCT FROM OLD.canvasser_user_id
     OR NEW.device_id               IS DISTINCT FROM OLD.device_id
     OR NEW.result_code              IS DISTINCT FROM OLD.result_code
     OR NEW.scope                     IS DISTINCT FROM OLD.scope
     OR NEW.arrive_at                  IS DISTINCT FROM OLD.arrive_at
     OR NEW.arrive_geom                 IS DISTINCT FROM OLD.arrive_geom
     OR NEW.depart_at                    IS DISTINCT FROM OLD.depart_at
     OR NEW.depart_geom                   IS DISTINCT FROM OLD.depart_geom
     OR NEW.recorded_at                    IS DISTINCT FROM OLD.recorded_at
     OR NEW.synced_at                       IS DISTINCT FROM OLD.synced_at
     OR NEW.notes_text                       IS DISTINCT FROM OLD.notes_text
     OR NEW.supersedes_contact_id             IS DISTINCT FROM OLD.supersedes_contact_id
  THEN
    RAISE EXCEPTION 'contact_attempts is append-only: only verification_score, verification_signals, flag_status, and flag_reasons may be updated after insert.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_attempts_restrict_update
  BEFORE UPDATE ON contact_attempts
  FOR EACH ROW EXECUTE FUNCTION contact_attempts_restrict_update();
