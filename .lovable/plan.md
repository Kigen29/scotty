

## Fix Broken Google Maps Link

**Lead found:** "Naomi's Locks & Cuts" (ID: `9785949c-...-bf568d2dcdc7`)
**Broken field:** `social_links.google_maps` = `https://maps.app.goo.gl/MNopQrStUvWxYzAb1`

### Plan

1. **Run a database migration** to update the `social_links` for this lead, replacing the broken short URL with a proper Google Maps search link based on the business name and location:

```sql
UPDATE leads
SET social_links = jsonb_set(
  social_links,
  '{google_maps}',
  '"https://www.google.com/maps/search/?api=1&query=Naomi%27s+Locks+%26+Cuts"'
)
WHERE id = '9785949c-d797-414b-89d3-bf568d2dcdc7';
```

This replaces the dead short link with a working Google Maps search URL. No frontend code changes needed.

