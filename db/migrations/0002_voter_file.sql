-- 0002_voter_file.sql
-- Addresses are separated from voters/households: a gate belongs to a building, not a person.

CREATE TABLE addresses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE CASCADE, -- nullable: addresses are shareable org-wide
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  street_number       text,
  street_predir       text,
  street_name         text,
  street_type         text,
  street_postdir      text,
  unit_designator     text,
  unit_number         text,
  city                text,
  state               text,
  zip5                text,
  zip4                text,
  geom                geometry(Point, 4326),      -- rooftop or parcel centroid
  approach_geom       geometry(Point, 4326),      -- where the canvasser actually stands
  parcel_id           text,
  census_block        text,
  precinct_id         text,
  geocode_source      text,
  geocode_confidence  numeric(4,3),
  building_id         uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE building_type AS ENUM (
  'sfh', 'duplex', 'small_multi', 'large_multi', 'mobile_park',
  'gated_sub', 'condo', 'senior', 'dorm', 'commercial'
);

CREATE TABLE buildings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           text,
  type           building_type NOT NULL DEFAULT 'sfh',
  footprint      geometry(Polygon, 4326),
  entry_points   geometry(MultiPoint, 4326),
  unit_count_est integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE addresses ADD CONSTRAINT fk_addresses_building
  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL;

CREATE TABLE households (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id          uuid NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
  last_seen_in_file_at timestamptz
);

CREATE TYPE voter_provider AS ENUM ('l2', 'van', 'i360', 'targetsmart', 'aristotle', 'state_file', 'manual');

CREATE TABLE voters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  address_id          uuid NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
  provider             voter_provider NOT NULL,
  provider_voter_id    text NOT NULL,       -- LALVOTERID, VANID, voterbase_id, etc.
  state_voter_id       text,
  county_voter_id      text,
  first_name           text,
  middle_name          text,
  last_name            text,
  suffix               text,
  dob_year             integer,
  age                  integer,
  gender               text,
  party_registration   text,
  registration_date    date,
  registration_status  text,
  phone_encrypted       bytea,
  email_encrypted       bytea,
  phone_is_mobile       boolean,
  language_pref         text,
  vote_history          jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores                jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_import_id      uuid,
  do_not_contact        boolean NOT NULL DEFAULT false,
  dnc_reason            text,
  dnc_set_at            timestamptz,
  deceased              boolean NOT NULL DEFAULT false,
  moved                 boolean NOT NULL DEFAULT false,
  is_protected_confidential boolean NOT NULL DEFAULT false, -- state-file confidential voters, suppressed from canvasser view entirely
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_voter_id)
);

CREATE INDEX idx_addresses_geom ON addresses USING GIST (geom);
CREATE INDEX idx_addresses_campaign ON addresses(campaign_id);
CREATE INDEX idx_buildings_footprint ON buildings USING GIST (footprint);
CREATE INDEX idx_households_address ON households(address_id);
CREATE INDEX idx_voters_household ON voters(household_id);
CREATE INDEX idx_voters_address ON voters(address_id);
CREATE INDEX idx_voters_dnc ON voters(do_not_contact) WHERE do_not_contact;
