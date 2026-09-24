-- 0004_turf_and_assignments.sql
-- Turf, walkbooks, assignments, and the out-of-turf triage tables (section 4.4 / 4.4a).

CREATE TYPE turf_cut_method AS ENUM ('manual', 'ai_balanced', 'precinct', 'imported');
CREATE TYPE turf_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE turfs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name                text NOT NULL,
  geom                geometry(MultiPolygon, 4326) NOT NULL,
  door_count          integer NOT NULL DEFAULT 0,
  voter_count         integer NOT NULL DEFAULT 0,
  target_count        integer NOT NULL DEFAULT 0,
  est_walk_minutes    numeric,
  est_total_minutes   numeric,
  partisan_density    numeric,
  avg_turnout_score   numeric,
  barrier_penalty     numeric,
  cut_method          turf_cut_method NOT NULL DEFAULT 'manual',
  cut_parameters      jsonb NOT NULL DEFAULT '{}'::jsonb,
  cut_run_id          uuid,
  status              turf_status NOT NULL DEFAULT 'draft',
  parent_turf_id      uuid REFERENCES turfs(id),  -- lineage when split/re-cut
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE walkbooks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id               uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  campaign_id           uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  script_id             uuid,
  version               integer NOT NULL DEFAULT 1,
  door_order            jsonb NOT NULL DEFAULT '[]'::jsonb, -- ordered array of address_ids
  route_geom            geometry(LineString, 4326),
  route_engine          text,
  route_computed_at     timestamptz,
  offline_bundle_key    text,
  offline_bundle_bytes  bigint,
  offline_bundle_hash   text,
  parent_walkbook_id    uuid REFERENCES walkbooks(id),  -- re-knock clone lineage
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE assignment_status AS ENUM (
  'assigned', 'downloaded', 'in_progress', 'paused', 'completed',
  'expired', 'revoked', 'reassigned', 'recall_pending'
);
CREATE TYPE reassignment_mode AS ENUM ('transfer', 'split');

CREATE TABLE assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walkbook_id                 uuid NOT NULL REFERENCES walkbooks(id) ON DELETE CASCADE,
  campaign_id                 uuid NOT NULL REFERENCES campaigns(id),  -- denormalized from walkbook->turf for RLS/query simplicity; API keeps it in sync at insert time
  user_id                     uuid NOT NULL REFERENCES users(id),
  assigned_by                 uuid REFERENCES users(id),
  assigned_at                 timestamptz NOT NULL DEFAULT now(),
  accepted_at                 timestamptz,
  started_at                  timestamptz,
  completed_at                timestamptz,
  expires_at                  timestamptz,
  status                      assignment_status NOT NULL DEFAULT 'assigned',
  reassigned_from_assignment_id uuid REFERENCES assignments(id),
  reassignment_mode            reassignment_mode,
  split_at_door_index          integer,
  recall_requested_at          timestamptz,
  recall_acknowledged_at       timestamptz,
  data_loss_acknowledged_by    uuid REFERENCES users(id),
  data_loss_estimated_records  integer
);

CREATE INDEX idx_turfs_campaign ON turfs(campaign_id);
CREATE INDEX idx_turfs_geom ON turfs USING GIST (geom);
CREATE INDEX idx_walkbooks_turf ON walkbooks(turf_id);
CREATE INDEX idx_assignments_walkbook ON assignments(walkbook_id);
CREATE INDEX idx_assignments_campaign ON assignments(campaign_id);
CREATE INDEX idx_assignments_user ON assignments(user_id);
CREATE INDEX idx_assignments_status ON assignments(status);

-- 4.4a: out-of-turf exceptions, populated by the API on contact ingest whenever a
-- contact_attempt's recorded position falls outside its assignment's turf polygon.

CREATE TYPE turf_exception_class AS ENUM (
  'within_tolerance', 'geocode_suspect', 'multi_unit', 'adjacent_turf',
  'boundary_street', 'gps_degraded', 'distant', 'far_distant'
);
CREATE TYPE turf_exception_auto_disposition AS ENUM (
  'auto_dismissed', 'likely_benign', 'needs_review', 'suspicious'
);
CREATE TYPE turf_exception_disposition AS ENUM (
  'unreviewed', 'dismissed_benign', 'flagged', 'escalated',
  'resolved_turf_fixed', 'resolved_geocode_fixed'
);

CREATE TABLE turf_boundary_exceptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_attempt_id          uuid NOT NULL,   -- FK added after contact_attempts exists (0005)
  assignment_id               uuid NOT NULL REFERENCES assignments(id),
  walkbook_id                 uuid NOT NULL REFERENCES walkbooks(id),
  turf_id                     uuid NOT NULL REFERENCES turfs(id),
  user_id                     uuid NOT NULL REFERENCES users(id),
  shift_id                    uuid NOT NULL,   -- FK added after shifts exists (0007)
  campaign_id                 uuid NOT NULL REFERENCES campaigns(id),
  address_id                  uuid NOT NULL REFERENCES addresses(id),
  building_id                 uuid REFERENCES buildings(id),
  recorded_geom                geometry(Point, 4326) NOT NULL,
  gps_accuracy_m               numeric,
  target_address_geom          geometry(Point, 4326),
  distance_outside_boundary_m  numeric,
  distance_from_target_address_m numeric,
  nearest_turf_id               uuid REFERENCES turfs(id),
  nearest_turf_is_adjacent      boolean,
  inside_other_turf_id          uuid REFERENCES turfs(id),
  geocode_confidence            numeric(4,3),
  geocode_source                text,
  within_parcel_polygon         boolean,
  within_building_footprint     boolean,
  near_boundary_street          boolean,
  boundary_street_distance_m    numeric,
  classification                 turf_exception_class NOT NULL,
  classification_rule_version    text NOT NULL,
  auto_disposition               turf_exception_auto_disposition NOT NULL,
  disposition                    turf_exception_disposition NOT NULL DEFAULT 'unreviewed',
  dismiss_reason                  text,
  reviewed_by                     uuid REFERENCES users(id),
  reviewed_at                      timestamptz,
  review_note                      text,
  linked_case_id                   uuid,
  linked_photo_verification_id     uuid,
  created_at                       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE turf_exception_shift_rollups (
  shift_id                       uuid PRIMARY KEY,
  user_id                        uuid NOT NULL REFERENCES users(id),
  campaign_id                    uuid NOT NULL REFERENCES campaigns(id),
  computed_at                    timestamptz NOT NULL DEFAULT now(),
  total_contacts                 integer NOT NULL DEFAULT 0,
  exception_count                integer NOT NULL DEFAULT 0,
  exception_rate                 numeric,
  agent_baseline_rate            numeric,
  campaign_median_rate_for_turf_type numeric,
  spatial_coherence_score        numeric,
  dominant_bearing_degrees       numeric,
  max_distance_outside_m         numeric,
  distinct_exception_clusters    integer,
  largest_cluster_contact_count  integer,
  out_of_turf_contact_rate       numeric,
  in_turf_contact_rate           numeric,
  correlated_photo_exception_count integer,
  repeated_coordinate_count      integer,
  suspicion_score                numeric(4,3),
  suggested_cause                text,
  disposition                    text,
  reviewed_by                    uuid REFERENCES users(id),
  reviewed_at                    timestamptz,
  review_note                    text
);

CREATE INDEX idx_tbe_shift ON turf_boundary_exceptions(shift_id);
CREATE INDEX idx_tbe_disposition ON turf_boundary_exceptions(disposition);
CREATE INDEX idx_tbe_campaign ON turf_boundary_exceptions(campaign_id);
CREATE INDEX idx_tbe_geom ON turf_boundary_exceptions USING GIST (recorded_geom);
