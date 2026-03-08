

## Plan: Fix Pipeline Routing and Add OpenAI Pipeline Option

### Root Cause

The manual "Discover Leads" button on the Lead Discovery page calls `discover-leads` edge function directly, which **never checks the user's `discovery_pipeline` setting**. It always tries Firecrawl first, regardless of what you chose in Settings. The `auto-discover` function (cron job) does check the setting, but `discover-leads` (manual trigger) does not.

Additionally, `discover-leads/index.ts` has a **duplicate variable declaration** (`FIRECRAWL_API_KEY` on lines 51 and 62) which would cause a runtime error.

---

### Changes

#### 1. Fix `discover-leads` to respect pipeline setting

Rewrite `supabase/functions/discover-leads/index.ts`:
- Remove the duplicate `FIRECRAWL_API_KEY` declaration
- After authenticating the user, fetch their `settings` row and read `discovery_pipeline`
- If `lovable_ai`: skip Firecrawl entirely, use the AI-only prompt (existing fallback path)
- If `openai`: use the OpenAI API key from secrets with the same discovery prompt
- If `firecrawl` (default): use current Firecrawl logic with AI fallback

#### 2. Add OpenAI pipeline option

**Database**: Add no schema changes needed -- `discovery_pipeline` is already a `text` column, so it can store `'openai'` as a value.

**New secret**: Use the `add_secret` tool to request the user's OpenAI API key (`OPENAI_API_KEY`).

**Edge functions** -- Update both `discover-leads` and `auto-discover` to handle `pipeline === 'openai'`:
- Call `https://api.openai.com/v1/chat/completions` directly with the user's OpenAI API key
- Use `gpt-4o-mini` as the default model (cost-effective for extraction)
- Same tool-calling schema and prompts as the Lovable AI path, just different endpoint and auth

#### 3. Update Settings UI

Add a third radio option in the Discovery Pipeline card:
- **Firecrawl** -- Web scraping via Firecrawl API
- **Lovable AI** -- Uses built-in AI gateway (no extra keys needed)
- **OpenAI** -- Uses your own OpenAI API key (GPT-4o-mini)

#### 4. Update `auto-discover` routing

Add `openai` case alongside the existing `lovable_ai` case. For OpenAI, run the same logic as `ai-discover` but swap the API endpoint and key.

---

### Files to Modify

| File | Change |
|---|---|
| `supabase/functions/discover-leads/index.ts` | Fix duplicate var, add pipeline routing (read settings, branch on firecrawl/lovable_ai/openai) |
| `supabase/functions/auto-discover/index.ts` | Add `openai` pipeline routing case |
| `supabase/functions/ai-discover/index.ts` | Add optional OpenAI mode (accept `pipeline` param in body) |
| `src/pages/SettingsPage.tsx` | Add third "OpenAI" radio option with key icon |

