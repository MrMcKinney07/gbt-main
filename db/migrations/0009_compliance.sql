-- 0009_compliance.sql
-- Consent, per-state data policy engine, and campaign data licenses (section 11).
-- A campaign cannot start a tracked shift or create turf from a state's voter file without
-- the corresponding rows here. Enforced in apps/api, not just by convention.

CREATE TYPE consent_type AS ENUM (
  'location_tracking', 'voice_capture', 'background_check', 'photo_capture', 'data_processing'
);
CREATE TYPE consent_method AS ENUM ('clickwrap', 'esign', 'wet');

CREATE TABLE consent_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  consent_type        consent_type NOT NULL,
  policy_version       text NOT NULL,
  policy_text_hash      text NOT NULL,
  jurisdiction_state     text NOT NULL,
  granted_at               timestamptz NOT NULL DEFAULT now(),
  granted_ip                text,
  granted_device_id           uuid REFERENCES devices(id),
  signature_image_key           text,
  method                          consent_method NOT NULL DEFAULT 'clickwrap',
  withdrawn_at                     timestamptz,
  withdrawal_reason                  text
);

ALTER TABLE shifts ADD CONSTRAINT fk_shifts_consent
  FOREIGN KEY (consent_record_id) REFERENCES consent_records(id);

CREATE TABLE state_data_policies (
  state                              text PRIMARY KEY,   -- USPS 2-letter
  voter_file_use_restrictions          jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_use_prohibited              boolean NOT NULL DEFAULT true,
  attestation_required                     boolean NOT NULL DEFAULT true,
  attestation_form_url                       text,
  redistribution_prohibited                    boolean NOT NULL DEFAULT true,
  tracking_notice_required                       boolean NOT NULL DEFAULT true,
  tracking_consent_required                        boolean NOT NULL DEFAULT true,
  photo_verification_permitted                       boolean NOT NULL DEFAULT true,
  photo_consent_required                               boolean NOT NULL DEFAULT true,
  front_camera_permitted                                 boolean NOT NULL DEFAULT false,
  biometric_consent_required                               boolean NOT NULL DEFAULT true,
  paid_canvasser_registration_required                       boolean NOT NULL DEFAULT false,
  badge_required                                               boolean NOT NULL DEFAULT false,
  badge_fields                                                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                                                          text,
  last_reviewed_at                                                timestamptz,
  last_reviewed_by                                                 text  -- attorney of record; not a users FK, this is external legal review
);

CREATE TABLE campaign_data_licenses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  state                    text NOT NULL REFERENCES state_data_policies(state),
  provider                 voter_provider NOT NULL,
  license_reference        text,
  attestation_document_key text,
  executed_at              timestamptz,
  expires_at                timestamptz,
  permitted_uses             text[] NOT NULL DEFAULT '{}',
  verified_by                 uuid REFERENCES users(id),
  UNIQUE (campaign_id, state, provider)
);

CREATE INDEX idx_consent_user ON consent_records(user_id);
CREATE INDEX idx_consent_type ON consent_records(consent_type);
CREATE INDEX idx_licenses_campaign ON campaign_data_licenses(campaign_id);

-- Seed a couple of launch states with defaults taken directly from the build prompt's own
-- citations (section 11.1, 11.3, 11.3a). These are NOT a substitute for the attorney review
-- the prompt requires (see docs/ARCHITECTURE.md "Compliance seed data is not legal advice").
INSERT INTO state_data_policies
  (state, commercial_use_prohibited, attestation_required, redistribution_prohibited,
   tracking_notice_required, tracking_consent_required, photo_verification_permitted,
   photo_consent_required, front_camera_permitted, biometric_consent_required,
   paid_canvasser_registration_required, badge_required, badge_fields, notes)
VALUES
  ('CA', true,  true, true, true, true, true, true, false, true,  false, false, '[]',
   'Penal Code 637.7 (tracking devices); commercial use of voter file is a misdemeanor; CCPA/CPRA gives users full access/deletion rights over their own data.'),
  ('IL', true,  true, true, true, true, true, true, false, true,  false, false, '[]',
   'BIPA (740 ILCS 14) governs face geometry / voiceprints: written informed consent + published retention schedule required; front camera and voiceprints are effectively disqualifying without a dedicated biometric consent flow. 720 ILCS 5/21-2.5 restricts tracking devices on personal (non-employer-vehicle) devices.'),
  ('TX', true,  true, true, false, true, true, true, false, true,  false, false, '[]',
   'Penal Code 16.06 covers vehicle tracking devices; Bus. & Com. Code 503.001 (CUBI) covers face geometry, requires notice+consent before capture.'),
  ('CO', false, true, false, true, true, true, true, false, true,  true,  true,
   '["PAID CIRCULATOR (bold)", "employing entity name", "employing entity phone"]',
   'Paid petition circulators must wear a badge with this content.'),
  ('CT', false, true, false, true, true, true, true, false, true,  false, false, '[]',
   'Requires notice to employees before electronic monitoring begins.'),
  ('NY', false, true, false, true, true, true, true, false, true,  false, false, '[]',
   'Requires written notice or consent before monitoring begins.')
ON CONFLICT (state) DO NOTHING;
