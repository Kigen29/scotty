
-- Fix: Change all RESTRICTIVE policies to PERMISSIVE and remove weak invite code policy

-- ============ email_campaigns ============
DROP POLICY IF EXISTS "Users manage own campaigns" ON public.email_campaigns;
CREATE POLICY "Users manage own campaigns" ON public.email_campaigns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ icp_profiles ============
DROP POLICY IF EXISTS "Users manage own ICP profiles" ON public.icp_profiles;
CREATE POLICY "Users manage own ICP profiles" ON public.icp_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ sequence_templates ============
DROP POLICY IF EXISTS "Users manage own templates" ON public.sequence_templates;
CREATE POLICY "Users manage own templates" ON public.sequence_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ leads ============
DROP POLICY IF EXISTS "Users manage own leads" ON public.leads;
CREATE POLICY "Users manage own leads" ON public.leads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ ab_tests ============
DROP POLICY IF EXISTS "Users manage own ab_tests" ON public.ab_tests;
CREATE POLICY "Users manage own ab_tests" ON public.ab_tests FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ settings ============
DROP POLICY IF EXISTS "Users manage own settings" ON public.settings;
CREATE POLICY "Users manage own settings" ON public.settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ meetings ============
DROP POLICY IF EXISTS "Users manage own meetings" ON public.meetings;
CREATE POLICY "Users manage own meetings" ON public.meetings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ sequences ============
DROP POLICY IF EXISTS "Users manage own sequences" ON public.sequences;
CREATE POLICY "Users manage own sequences" ON public.sequences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ sequence_enrollments ============
DROP POLICY IF EXISTS "Users manage own enrollments" ON public.sequence_enrollments;
CREATE POLICY "Users manage own enrollments" ON public.sequence_enrollments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ conversations ============
DROP POLICY IF EXISTS "Users manage own conversations" ON public.conversations;
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ activity_logs ============
DROP POLICY IF EXISTS "Users manage own logs" ON public.activity_logs;
CREATE POLICY "Users manage own logs" ON public.activity_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ profiles ============
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can view own or teammate profiles" ON public.profiles;
CREATE POLICY "Users can view own or teammate profiles" ON public.profiles FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR is_team_member(auth.uid(), get_user_team_id(id)));

-- ============ teams ============
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Owners can update their team" ON public.teams;
CREATE POLICY "Owners can update their team" ON public.teams FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), id) AND (has_team_role(auth.uid(), id, 'owner'::team_role) OR has_team_role(auth.uid(), id, 'admin'::team_role)));

DROP POLICY IF EXISTS "Team members can view their team" ON public.teams;
CREATE POLICY "Team members can view their team" ON public.teams FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), id));

-- ============ team_members ============
DROP POLICY IF EXISTS "Admins and owners can manage members" ON public.team_members;
CREATE POLICY "Admins and owners can manage members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id) AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role)));

DROP POLICY IF EXISTS "Admins and owners can remove members" ON public.team_members;
CREATE POLICY "Admins and owners can remove members" ON public.team_members FOR DELETE TO authenticated
  USING (is_team_member(auth.uid(), team_id) AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role)));

DROP POLICY IF EXISTS "Admins and owners can update members" ON public.team_members;
CREATE POLICY "Admins and owners can update members" ON public.team_members FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id) AND (has_team_role(auth.uid(), team_id, 'owner'::team_role) OR has_team_role(auth.uid(), team_id, 'admin'::team_role)));

DROP POLICY IF EXISTS "Team members can view teammates" ON public.team_members;
CREATE POLICY "Team members can view teammates" ON public.team_members FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- Remove the weak invite code policy (joins handled by edge function with service role key)
DROP POLICY IF EXISTS "Users can join via invite code" ON public.team_members;
