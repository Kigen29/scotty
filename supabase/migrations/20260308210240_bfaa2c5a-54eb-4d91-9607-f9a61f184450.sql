
-- Add email verification columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_verification_status text DEFAULT NULL;

-- Meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_at timestamptz DEFAULT NULL,
  booking_link text DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meetings" ON public.meetings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add booking link to settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS booking_link text DEFAULT NULL;
