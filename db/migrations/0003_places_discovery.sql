-- Discovery from Google Places. A lead found there keeps Google's place id (which may be stored indefinitely)
-- and when its details were fetched, so untouched leads can be cleared after 30 days as Google's terms expect.

ALTER TABLE scotty.leads
  ADD COLUMN place_id text,
  ADD COLUMN google_maps_url text,
  ADD COLUMN rating numeric(2, 1),
  ADD COLUMN review_count integer,
  ADD COLUMN places_fetched_at timestamptz;

CREATE UNIQUE INDEX leads_user_place_key ON scotty.leads (user_id, place_id) WHERE place_id IS NOT NULL;
CREATE INDEX leads_user_source_status_idx ON scotty.leads (user_id, discovery_source, status);
