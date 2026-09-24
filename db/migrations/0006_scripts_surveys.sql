-- 0006_scripts_surveys.sql
-- Scripts, survey definitions with branching, responses, and the retrieval-based objection library.

CREATE TYPE script_status AS ENUM ('draft', 'approved', 'retired');

CREATE TABLE scripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          text NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  status        script_status NOT NULL DEFAULT 'draft',
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  locale        text NOT NULL DEFAULT 'en',
  body_blocks   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE walkbooks ADD CONSTRAINT fk_walkbooks_script FOREIGN KEY (script_id) REFERENCES scripts(id);

CREATE TABLE survey_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          text NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  status        script_status NOT NULL DEFAULT 'draft',
  -- questions: array of {id, type, prompt, options, required, skippable_reason_required,
  --   van_survey_question_id, van_response_ids, activist_code_id, maps_to_field, branch_on}
  -- validated at save time (app layer) to be an acyclic DAG on branch_on references.
  questions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE survey_entry_mode AS ENUM ('tap', 'voice', 'mixed');

CREATE TABLE survey_responses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_attempt_id      uuid NOT NULL REFERENCES contact_attempts(id),
  survey_definition_id    uuid NOT NULL REFERENCES survey_definitions(id),
  answers                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed               boolean NOT NULL DEFAULT false,
  partial_reason          text,
  entry_mode              survey_entry_mode NOT NULL DEFAULT 'tap',
  time_per_question        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_attempts ADD CONSTRAINT fk_ca_survey_response
  FOREIGN KEY (survey_response_id) REFERENCES survey_responses(id);

-- Objection library: retrieval, not generation (section 7.5). The LLM only does semantic
-- matching against these campaign-approved, human-authored responses.
CREATE TABLE objection_library (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  objection_key            text NOT NULL,
  trigger_phrases            text[] NOT NULL DEFAULT '{}',
  approved_response_text      text NOT NULL,
  approved_by                   uuid REFERENCES users(id),
  approved_at                    timestamptz,
  locale                          text NOT NULL DEFAULT 'en',
  version                          integer NOT NULL DEFAULT 1,
  status                            script_status NOT NULL DEFAULT 'draft'
);

CREATE INDEX idx_survey_responses_contact ON survey_responses(contact_attempt_id);
CREATE INDEX idx_objection_campaign ON objection_library(campaign_id);
