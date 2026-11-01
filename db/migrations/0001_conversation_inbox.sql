-- Conversations become the shared inbox: website enquiries now, email replies and WhatsApp next.
-- Each inbound message carries Claude's triage; each outbound one carries the provider's message id.

ALTER TABLE scotty.conversations
  ADD COLUMN channel text NOT NULL DEFAULT 'email',
  ADD COLUMN subject text,
  ADD COLUMN category text,
  ADD COLUMN urgency text,
  ADD COLUMN summary text,
  ADD COLUMN ai_suggested_subject text,
  -- Resend email id for outbound mail; the website enquiry id for inbound, so retries don't duplicate
  ADD COLUMN external_id text,
  ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('email', 'website', 'whatsapp')),
  ADD CONSTRAINT conversations_urgency_check CHECK (urgency IS NULL OR urgency IN ('high', 'normal', 'low'));

CREATE UNIQUE INDEX conversations_external_id_key ON scotty.conversations (external_id);
CREATE INDEX conversations_user_created_idx ON scotty.conversations (user_id, created_at DESC);
CREATE INDEX conversations_lead_idx ON scotty.conversations (lead_id, created_at);

-- Finding a lead by email is how an enquiry joins an existing thread
CREATE INDEX leads_user_email_idx ON scotty.leads (user_id, lower(email));
