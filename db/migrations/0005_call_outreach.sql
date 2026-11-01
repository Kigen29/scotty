-- Call-assisted outreach: a prepared call sheet and free report per lead, call outcomes, call-backs,
-- and the consent a person gives on the call to receive the report (which then allows emailing them).

ALTER TABLE scotty.leads
  ADD COLUMN report_token text,
  ADD COLUMN report jsonb,
  ADD COLUMN report_viewed_at timestamptz,
  ADD COLUMN consent_at timestamptz,
  ADD COLUMN consent_note text,
  ADD COLUMN last_call_at timestamptz,
  ADD COLUMN last_call_outcome text,
  ADD COLUMN next_call_at timestamptz,
  ADD CONSTRAINT leads_last_call_outcome_check CHECK (last_call_outcome IS NULL OR last_call_outcome IN ('no_answer', 'call_back', 'not_interested', 'interested'));

CREATE UNIQUE INDEX leads_report_token_key ON scotty.leads (report_token);
CREATE INDEX leads_user_next_call_idx ON scotty.leads (user_id, next_call_at) WHERE next_call_at IS NOT NULL;
