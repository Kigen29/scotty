
CREATE OR REPLACE FUNCTION public.validate_lead_urls()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate website_url: must start with http:// or https://
  IF NEW.website_url IS NOT NULL AND NEW.website_url !~ '^https?://' THEN
    NEW.website_url := NULL;
  END IF;

  -- Validate and clean social_links URLs
  IF NEW.social_links IS NOT NULL AND jsonb_typeof(NEW.social_links) = 'object' THEN
    DECLARE
      key text;
      val text;
      cleaned jsonb := '{}'::jsonb;
    BEGIN
      FOR key, val IN SELECT k, v::text FROM jsonb_each_text(NEW.social_links) AS t(k, v)
      LOOP
        -- Keep the link only if it starts with http:// or https:// and is not a short-link service known to break
        IF val ~ '^https?://' AND val !~ 'maps\.app\.goo\.gl|bit\.ly|tinyurl\.com|t\.co' THEN
          cleaned := cleaned || jsonb_build_object(key, val);
        ELSIF val ~ '^https?://(www\.)?google\.com/maps' THEN
          -- Allow full Google Maps URLs
          cleaned := cleaned || jsonb_build_object(key, val);
        END IF;
      END LOOP;
      NEW.social_links := CASE WHEN cleaned = '{}'::jsonb THEN NULL ELSE cleaned END;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_lead_urls_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lead_urls();
