
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS discovery_source text DEFAULT 'web';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_channels jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS social_discovery_enabled boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_number text;
