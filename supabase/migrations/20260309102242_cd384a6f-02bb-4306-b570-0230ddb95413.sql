-- Drop existing partially-created policies to start clean
DROP POLICY IF EXISTS "Owners can update their team" ON public.teams;
DROP POLICY IF EXISTS "Admins and owners can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Admins and owners can remove members" ON public.team_members;
DROP POLICY IF EXISTS "Admins and owners can update members" ON public.team_members;

-- Ensure 3-arg function exists
CREATE OR REPLACE FUNCTION public.has_team_role(_user_id uuid, _team_id uuid, _role team_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND role = _role
  )
$$;

-- Recreate all policies with team-scoped checks
CREATE POLICY "Owners can update their team" ON public.teams
  FOR UPDATE TO authenticated
  USING (
    is_team_member(auth.uid(), id)
    AND (has_team_role(auth.uid(), id, 'owner'::team_role) OR has_team_role(auth.uid(), id, 'admin'::team_role))
  );

CREATE POLICY "Admins and owners can manage members" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_team_member(auth.uid(), team_id)
    AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role))
  );

CREATE POLICY "Admins and owners can remove members" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    is_team_member(auth.uid(), team_id)
    AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role))
  );

CREATE POLICY "Admins and owners can update members" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    is_team_member(auth.uid(), team_id)
    AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role))
  );