-- 0008_photo_verification.sql
--
-- ACCOUNTABILITY ONLY. Door-count triggered. No safety role. See the header comment in
-- 0007_shifts_and_safety.sql for why this file has no foreign keys into the safety tables.

CREATE TABLE photo_interval_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id                 uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name                         text NOT NULL,
  min_doors                    integer NOT NULL DEFAULT 5  CHECK (min_doors >= 3),
  max_doors                     integer NOT NULL DEFAULT 30 CHECK (max_doors <= 60),
  mode_doors                     integer NOT NULL DEFAULT 22,
  distribution                    text NOT NULL DEFAULT 'beta' CHECK (distribution IN ('triangular', 'beta', 'discretized_normal')),
  beta_alpha                       numeric NOT NULL DEFAULT 5.0,
  beta_beta                         numeric NOT NULL DEFAULT 2.0,
  max_prompts_per_shift               integer NOT NULL DEFAULT 4,
  min_minutes_between_prompts           integer NOT NULL DEFAULT 20,
  defer_count_allowed                     integer NOT NULL DEFAULT 2,
  defer_seconds_each                       integer NOT NULL DEFAULT 120,
  blocking_after_defers                      boolean NOT NULL DEFAULT true,
  created_by                                  uuid REFERENCES users(id),
  updated_at                                   timestamptz NOT NULL DEFAULT now(),
  CHECK (min_doors + 5 <= max_doors)
);

ALTER TABLE shifts ADD CONSTRAINT fk_shifts_photo_profile
  FOREIGN KEY (photo_interval_profile_id) REFERENCES photo_interval_profiles(id);

CREATE TYPE photo_capture_source AS ENUM ('live_camera'); -- the only allowed value, by design
CREATE TYPE camera_facing AS ENUM ('rear', 'front');
CREATE TYPE photo_verification_status AS ENUM (
  'pending', 'deferred', 'captured', 'missed', 'refused',
  'auto_flagged', 'in_review', 'cleared', 'confirmed_bad'
);

CREATE TABLE photo_verifications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                    uuid NOT NULL REFERENCES shifts(id),
  user_id                     uuid NOT NULL REFERENCES users(id),
  campaign_id                 uuid NOT NULL REFERENCES campaigns(id),
  turf_id                     uuid REFERENCES turfs(id),
  device_id                   uuid NOT NULL REFERENCES devices(id),

  -- door-count trigger provenance
  interval_profile_id          uuid NOT NULL REFERENCES photo_interval_profiles(id),
  interval_drawn                integer NOT NULL,              -- N doors sampled for this cycle
  doors_since_last_prompt        integer,                      -- actual count at fire time
  trigger_contact_attempt_id      uuid REFERENCES contact_attempts(id),
  shift_prompt_sequence            integer NOT NULL,           -- 1st, 2nd, 3rd prompt of the shift
  prompted_at                       timestamptz,
  held_for_open_door_seconds          integer,

  captured_at                          timestamptz,
  submitted_at                          timestamptz,
  synced_at                              timestamptz,

  deferral_count                          integer NOT NULL DEFAULT 0,
  deferred_until                           timestamptz,
  total_deferred_seconds                    integer NOT NULL DEFAULT 0,

  status                                     photo_verification_status NOT NULL DEFAULT 'pending',

  -- capture evidence
  object_key                                  text,           -- encrypted blob in object storage
  image_sha256                                 text,
  image_bytes                                   bigint,
  image_width                                    integer,
  image_height                                    integer,
  capture_source                                   photo_capture_source NOT NULL DEFAULT 'live_camera',
  camera_facing                                     camera_facing NOT NULL DEFAULT 'rear',
  capture_geom                                       geometry(Point, 4326),
  capture_accuracy_m                                  numeric,
  capture_altitude                                     numeric,
  device_heading                                        numeric,
  device_recorded_at                                     timestamptz,
  device_uptime_ms                                        bigint,
  server_received_at                                       timestamptz,
  clock_delta_seconds                                       numeric,
  mock_location_flag                                         boolean NOT NULL DEFAULT false,
  attestation_token_id                                        text,

  -- derived checks
  inside_turf                    boolean,
  distance_to_turf_m             numeric,
  distance_to_last_contact_m     numeric,
  seconds_since_last_contact     integer,
  screen_recapture_score         numeric(4,3),   -- moire / rebroadcast detection
  face_detected                  boolean,
  face_count                     integer,
  face_redaction_applied         boolean,
  exif_intact                    boolean,
  exif_stripped_fields           text[],
  scene_classification           jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_score             numeric(4,3),
  flag_reasons                   text[] NOT NULL DEFAULT '{}',

  reviewed_by                    uuid REFERENCES users(id),
  reviewed_at                    timestamptz,
  review_decision                text,
  review_note                    text,

  retention_expires_at           timestamptz,   -- 30 days default, 90 day hard max (section 8A.6)
  deleted_at                     timestamptz
);

CREATE INDEX idx_photo_verif_shift ON photo_verifications(shift_id);
CREATE INDEX idx_photo_verif_user ON photo_verifications(user_id);
CREATE INDEX idx_photo_verif_status ON photo_verifications(status);
CREATE INDEX idx_photo_verif_retention ON photo_verifications(retention_expires_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_verif_capture_geom ON photo_verifications USING GIST (capture_geom);

ALTER TABLE turf_boundary_exceptions
  ADD CONSTRAINT fk_tbe_photo_verification
  FOREIGN KEY (linked_photo_verification_id) REFERENCES photo_verifications(id);

-- No gallery, file-picker, or share-sheet path is permitted into this table (section 8A.3);
-- capture_source is a single-value enum enforcing that at the schema level as a defense in
-- depth measure, with the real enforcement being the absence of any such code path in
-- apps/mobile (see docs/ARCHITECTURE.md and the CI static-analysis check referenced there).
