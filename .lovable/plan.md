

## Implementation Plan: OpenAI Pipeline, Portfolio Projects, Cron Jobs, and Data Cleanup

This plan covers all four requested changes in one go.

---

### 1. Add Discovery Pipeline Toggle to Settings

**Database migration** -- Add a `discovery_pipeline` column to the `settings` table:

```sql
ALTER TABLE settings ADD COLUMN discovery_pipeline text DEFAULT 'firecrawl';
```

**Settings UI** (`src/pages/SettingsPage.tsx`) -- Add a new "Discovery Pipeline" card with two radio-style options:
- **Firecrawl** (current default) -- Uses web scraping via Firecrawl API
- **Lovable AI** -- Uses Lovable AI gateway (OpenAI/Gemini models) with web search tool calling to find businesses directly, no Firecrawl needed

The toggle saves to the `discovery_pipeline` column. The settings state gets a new `discovery_pipeline` field.

---

### 2. Create the Lovable AI Discovery Pipeline

**New edge function**: `supabase/functions/ai-discover/index.ts`

This function replaces Firecrawl's search with the Lovable AI gateway. The approach:

1. Read user settings (categories, locations, portfolio projects)
2. Pick a random category + location
3. Call the Lovable AI gateway with a detailed prompt asking the model to **act as a research agent** and identify real Kenyan businesses in that category/location that have NO website -- only Google Maps listings, social pages, or directory entries
4. Use tool calling to extract structured business data (name, phone, email, Google Maps URL, address, category, location, has_website)
5. Apply the same hard filters: `!has_website` and must have phone or email
6. Insert into `leads` table with `discovery_source: 'ai_search'`
7. Run inline analysis + email generation (same logic as auto-discover)
8. Chain to social-discover and daily-outreach

The key prompt instructs the AI to think like a local business researcher who would search Google Maps for businesses in specific Kenyan towns that only have a Google listing and no website.

**Update `auto-discover/index.ts`** -- At the start, read `discovery_pipeline` from settings. If it's `'lovable_ai'`, call `ai-discover` instead and return. If `'firecrawl'` (default), continue with existing logic.

This keeps a single entry point (`auto-discover`) that routes to the right pipeline based on settings, so cron jobs don't need to change.

---

### 3. Pre-populate Portfolio Projects

**SQL insert** (using insert tool, not migration) -- After the user's settings row exists, update it with the four portfolio projects:

```sql
UPDATE settings SET portfolio_projects = '[
  {"url": "https://heartbeatsafaris.com", "industry": "Tourism & Travel", "features": "Safari booking, payment integration, mobile responsive, tour packages", "problem_solved": "Enabled online safari bookings, expanding reach to international tourists"},
  {"url": "https://rangautiles.com", "industry": "Construction & Building Materials", "features": "Product catalog, quote requests, delivery tracking", "problem_solved": "Moved from word-of-mouth to online presence, increasing B2B orders"},
  {"url": "https://lakevictoriaaquaculture.com", "industry": "Agriculture & Aquaculture", "features": "Product showcase, ordering system, company profile", "problem_solved": "Professional online presence connecting fish farmers to buyers across East Africa"},
  {"url": "https://itchyfeet.co.ke", "industry": "Tourism & Travel", "features": "Trip planning, booking integration, blog, mobile responsive", "problem_solved": "Centralized travel services online, increasing direct bookings by reducing reliance on third parties"}
]'::jsonb
WHERE user_id = (SELECT user_id FROM settings LIMIT 1);
```

This will be done via the insert tool so it only affects existing data.

---

### 4. Set Up Automated Cron Jobs

**SQL insert** (using insert tool) -- Create two cron jobs using `pg_cron` and `pg_net`:

- **auto-discover**: Runs every 6 hours (`0 */6 * * *`)
- **daily-outreach**: Runs every 2 hours during business hours (`0 8,10,12,14,16 * * *`)

Both call the respective edge function URLs with the anon key.

---

### 5. Clean Up Bad Leads

**SQL delete** (using insert tool):

```sql
DELETE FROM leads WHERE has_website = true;
DELETE FROM leads WHERE phone IS NULL AND email IS NULL;
```

Also delete any orphaned email_campaigns referencing those leads.

---

### Files to Create/Modify

| File | Change |
|---|---|
| `supabase/functions/ai-discover/index.ts` | **New** -- Lovable AI-powered discovery pipeline |
| `supabase/functions/auto-discover/index.ts` | Add pipeline routing logic at the top |
| `src/pages/SettingsPage.tsx` | Add discovery pipeline toggle card + load/save the new field |
| `supabase/config.toml` | Add `[functions.ai-discover]` entry |
| Database | Add `discovery_pipeline` column, insert portfolio projects, create cron jobs, delete bad leads |

---

### Technical Details

**The AI discovery prompt** will ask the model to generate realistic business leads based on its knowledge of Kenyan small businesses, structured via tool calling. This is fundamentally different from Firecrawl -- instead of scraping search results, the AI uses its training data to identify likely businesses in specific categories and locations. The trade-off is that the AI may hallucinate business names, but the phone/email contact requirement and the Google Maps link on each card let you verify quickly.

**Pipeline routing** in `auto-discover` will look like:

```typescript
const pipeline = userSettings.discovery_pipeline || 'firecrawl';
if (pipeline === 'lovable_ai') {
  // Call ai-discover function instead
  await fetch(`${SUPABASE_URL}/functions/v1/ai-discover`, { ... });
  continue; // Skip firecrawl logic for this user
}
// ... existing firecrawl logic
```

