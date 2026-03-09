DROP POLICY IF EXISTS "Users can view profiles of teammates" ON public.profiles;
CREATE POLICY "Users can view own or teammate profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_team_member(auth.uid(), public.get_user_team_id(id))
  );