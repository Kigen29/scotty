
-- Phase 1: Add portfolio projects to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS portfolio_projects jsonb DEFAULT '[]'::jsonb;

-- Phase 2: Add analysis columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 5;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS analysis jsonb DEFAULT NULL;

-- Phase 5: Add unsubscribe flag to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;
