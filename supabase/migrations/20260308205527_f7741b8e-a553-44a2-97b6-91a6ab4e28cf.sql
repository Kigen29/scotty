
-- ICP Profiles table
CREATE TABLE public.icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Default ICP',
  is_active boolean NOT NULL DEFAULT true,
  industries text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',
  size_range text DEFAULT NULL,
  has_website_preference text DEFAULT 'no_website',
  pain_points text[] NOT NULL DEFAULT '{}',
  weight_industry integer NOT NULL DEFAULT 3,
  weight_location integer NOT NULL DEFAULT 2,
  weight_no_website integer NOT NULL DEFAULT 4,
  weight_has_email integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ICP profiles" ON public.icp_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sequences table
CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sequences" ON public.sequences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sequence enrollments table
CREATE TABLE public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  next_step_at timestamptz DEFAULT NULL,
  completed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, lead_id)
);

ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own enrollments" ON public.sequence_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add ICP match score to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS icp_score integer DEFAULT NULL;

-- Updated_at triggers
CREATE TRIGGER update_icp_profiles_updated_at BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sequence_enrollments_updated_at BEFORE UPDATE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
