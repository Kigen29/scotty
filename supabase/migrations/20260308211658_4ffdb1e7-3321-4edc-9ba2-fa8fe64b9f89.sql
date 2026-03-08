
-- A/B tests table to group test variants
CREATE TABLE public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_a_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  campaign_b_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  winner text, -- 'a', 'b', or null
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ab_tests" ON public.ab_tests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add variant tracking to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS ab_test_id uuid REFERENCES public.ab_tests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ab_variant text; -- 'a' or 'b'
