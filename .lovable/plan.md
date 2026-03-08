

# AI-Assisted Sequence Step Generation

## Overview
Add an "AI Generate" button to the Sequences builder that lets users describe their outreach goal in plain text and have AI generate a complete multi-step sequence (name, subjects, prompts, delays) automatically. Also add per-step AI assist to refine or rewrite individual step prompts.

## Changes

### 1. Create edge function `generate-sequence-steps`
**New file: `supabase/functions/generate-sequence-steps/index.ts`**

- Accepts `{ goal, num_steps?, existing_steps? }` in the request body
- Uses Lovable AI gateway (`google/gemini-3-flash-preview`) with tool calling to return structured output
- Two modes:
  - **Full generation**: User provides a goal like "Cold outreach to restaurants without websites" and number of steps (default 3). AI returns sequence name + all steps with subjects, body prompts, and delay days.
  - **Single step refine**: User provides an existing step's body_prompt and asks AI to improve/rewrite it. Returns updated subject + body_prompt.
- Tool calling schema returns `{ name, steps: [{ subject, body_prompt, delay_days, channel }] }` for full generation, or `{ subject, body_prompt }` for single-step refine.
- Standard CORS, auth via Authorization header, rate limit error handling (429/402).

### 2. Register function in `supabase/config.toml`
Add `[functions.generate-sequence-steps]` with `verify_jwt = false`.

### 3. Update `src/pages/Sequences.tsx`
Add two AI features to the builder view:

**a) "Generate with AI" button** — shown at the top of the builder when creating a new sequence:
- Opens a small inline form with a text input for the goal and a number selector for step count (2-5)
- Calls the edge function, then populates `editing` state with the returned name and steps
- Shows a loading spinner with "AI is generating your sequence..." text

**b) Per-step "AI Improve" button** — shown inside each expanded step:
- Small sparkle icon button next to the "AI Prompt / Template" label
- Sends the current step's body_prompt to the edge function in refine mode
- Replaces the step's subject and body_prompt with the AI-improved versions

Both features use `supabase.functions.invoke()` for the call.

## Files

| File | Change |
|---|---|
| `supabase/functions/generate-sequence-steps/index.ts` | New edge function |
| `supabase/config.toml` | Add function entry |
| `src/pages/Sequences.tsx` | Add AI generate button, per-step AI improve button, loading states |

