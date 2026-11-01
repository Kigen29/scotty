-- Scotty replies on its own. Each inbound message records what the agent did with it and why;
-- each outbound one records whether a person or the agent sent it.

ALTER TABLE scotty.conversations
  ADD COLUMN sent_by text,
  ADD COLUMN agent_action text,
  ADD COLUMN agent_reason text,
  ADD COLUMN needs_human boolean,
  ADD CONSTRAINT conversations_sent_by_check CHECK (sent_by IS NULL OR sent_by IN ('operator', 'auto')),
  ADD CONSTRAINT conversations_agent_action_check CHECK (agent_action IS NULL OR agent_action IN ('auto_replied', 'held', 'skipped'));

-- Replies the operator sent before this existed were all manual
UPDATE scotty.conversations SET sent_by = 'operator' WHERE direction = 'outbound';

-- The kill switch: on by default, as the operator asked
ALTER TABLE scotty.settings ADD COLUMN auto_reply_enabled boolean NOT NULL DEFAULT true;

-- Everything the agent does on its own, in plain words, for the Agent activity screen
CREATE TABLE scotty.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES scotty.leads (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES scotty.conversations (id) ON DELETE SET NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_events_user_created_idx ON scotty.agent_events (user_id, created_at DESC);
CREATE INDEX agent_events_lead_idx ON scotty.agent_events (lead_id, created_at DESC);
