
-- Update auto_assign_lead to notify via pg_net after assignment
CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _team_id uuid;
  _assigned_user uuid;
  _supabase_url text;
  _service_key text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT team_id INTO _team_id
  FROM public.team_members
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF _team_id IS NULL THEN
    RETURN NEW;
  END IF;

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
    
    -- Fire async notification via pg_net
    BEGIN
      SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
      SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
      
      IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := _supabase_url || '/functions/v1/notify-assignment',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || _service_key
          ),
          body := jsonb_build_object(
            'type', 'INSERT',
            'record', jsonb_build_object(
              'id', NEW.id,
              'business_name', NEW.business_name,
              'category', NEW.category,
              'location', NEW.location,
              'email', NEW.email,
              'assigned_to', _assigned_user::text,
              'user_id', NEW.user_id::text
            )
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail the insert if notification fails
      RAISE WARNING 'notify-assignment call failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
