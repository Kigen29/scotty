
-- Team roles enum
CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'member');

-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Team',
  invite_code text NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role team_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Security definer function: check if user is in a team
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

-- Security definer function: get user's team id
CREATE OR REPLACE FUNCTION public.get_user_team_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = _user_id LIMIT 1
$$;

-- Security definer function: check if user has role in team
CREATE OR REPLACE FUNCTION public.has_team_role(_user_id uuid, _role team_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for teams: members can see their team
CREATE POLICY "Team members can view their team" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), id));

CREATE POLICY "Owners can update their team" ON public.teams
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), id) AND (public.has_team_role(auth.uid(), 'owner') OR public.has_team_role(auth.uid(), 'admin')));

CREATE POLICY "Authenticated users can create teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- RLS for team_members: members can see teammates
CREATE POLICY "Team members can view teammates" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Admins and owners can manage members" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_member(auth.uid(), team_id)
    AND (public.has_team_role(auth.uid(), 'owner') OR public.has_team_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins and owners can update members" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    public.is_team_member(auth.uid(), team_id)
    AND (public.has_team_role(auth.uid(), 'owner') OR public.has_team_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins and owners can remove members" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    public.is_team_member(auth.uid(), team_id)
    AND (public.has_team_role(auth.uid(), 'owner') OR public.has_team_role(auth.uid(), 'admin'))
  );

-- Self-join via invite code: allow users to insert themselves
CREATE POLICY "Users can join via invite code" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Add assigned_to column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- Profiles table for user display names
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profiles of teammates" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();
