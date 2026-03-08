
-- Round-robin auto-assignment trigger
-- Assigns new leads to the team member with the fewest leads
CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _team_id uuid;
  _assigned_user uuid;
BEGIN
  -- Only auto-assign if not already assigned
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the team the lead owner belongs to
  SELECT team_id INTO _team_id
  FROM public.team_members
  WHERE user_id = NEW.user_id
  LIMIT 1;

  -- If not in a team, skip
  IF _team_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find team member with fewest leads (round-robin by count)
  SELECT tm.user_id INTO _assigned_user
  FROM public.team_members tm
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) as lead_count
    FROM public.leads
    WHERE assigned_to IS NOT NULL
    GROUP BY assigned_to
  ) lc ON lc.assigned_to = tm.user_id
  WHERE tm.team_id = _team_id
  ORDER BY COALESCE(lc.lead_count, 0) ASC, tm.joined_at ASC
  LIMIT 1;

  IF _assigned_user IS NOT NULL THEN
    NEW.assigned_to := _assigned_user;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_assign_lead_on_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_lead();
