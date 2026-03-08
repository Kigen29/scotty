

## Current State

**✅ Already Working:**
- Resend webhook (`resend-webhook/index.ts`) tracks opens, bounces, complaints, deliveries
- Auto-follow-up function exists but uses hardcoded template logic
- Sequences UI fully built with CRUD, templates, analytics, enrollment management
- Database tables (`sequences`, `sequence_enrollments`) exist
- WhatsApp drafts created by `daily-outreach` but not sent

**❌ Gaps:**
1. No edge function to process sequence enrollments (send scheduled emails)
2. Resend webhook doesn't pause sequences when lead replies
3. WhatsApp messages only drafted, never sent (no API integration)

---

## Implementation Plan

### 1. WhatsApp Business API Integration

**New Secrets Required:**
- `WHATSAPP_BUSINESS_API_TOKEN` - WhatsApp Business Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` - Phone number ID from Meta Business

**Changes:**
- **`daily-outreach/index.ts`**: Add actual WhatsApp sending via Meta's Cloud API when channel = "whatsapp"
- **New function**: `supabase/functions/whatsapp-webhook/index.ts` to handle delivery status updates from Meta

**WhatsApp Flow:**
1. When channel is WhatsApp and contact value exists, send via `https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages`
2. Update campaign status to "sent" on success
3. Webhook receives delivery/read receipts from Meta and updates campaigns

---

### 2. Sequence Automation Engine

**New Edge Function:** `supabase/functions/process-sequences/index.ts`

**Logic:**
1. Get all `sequence_enrollments` where:
   - `status = 'active'`
   - `next_step_at <= now()` OR `next_step_at IS NULL AND current_step = 0`
2. For each enrollment:
   - Fetch sequence steps
   - Get current step definition (subject template, body_prompt)
   - Fetch lead data
   - **Personalize** subject and body_prompt by replacing `{{business_name}}`, `{{category}}`, `{{location}}`
   - **Generate email** via Lovable AI using the personalized prompt
   - **Send email** via Resend
   - Create `email_campaigns` record with `source: 'sequence'`
   - **Advance step**: Increment `current_step`, calculate `next_step_at = now() + delay_days`
   - If all steps completed: Set `status = 'completed'`, `completed_at = now()`

**Cron Job:**
- Every 2 hours (same cadence as auto-follow-up)

**Database Updates:**
- Add `source` column to `email_campaigns` (already done in previous migration)
- Track sequence emails separately with `source = 'sequence'`

---

### 3. Enhanced Resend Webhook - Reply Detection

**Update:** `resend-webhook/index.ts`

**New Logic:**
When `email.opened` or any event fires:
1. Find lead by recipient email
2. **Check for replies:** Query `conversations` table for `direction = 'inbound'` from this lead
3. If reply exists:
   - **Pause sequence enrollment:** `UPDATE sequence_enrollments SET status = 'paused' WHERE lead_id = ? AND status = 'active'`
   - Log activity: `action = 'sequence_paused_by_reply'`

**Why:**
- Prevents sending automated follow-ups after lead has already responded
- User can manually resume sequence if needed via UI

---

## Files to Create/Modify

**Create:**
1. `supabase/functions/process-sequences/index.ts` - Sequence automation engine
2. `supabase/functions/whatsapp-webhook/index.ts` - WhatsApp status updates
3. Database migration: Add cron job for `process-sequences`

**Modify:**
1. `supabase/functions/daily-outreach/index.ts` - Add WhatsApp sending logic
2. `supabase/functions/resend-webhook/index.ts` - Add reply detection and sequence pausing
3. Settings page - Add WhatsApp API credentials fields (optional)

---

## Technical Details

### WhatsApp API Request Format
```javascript
await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    to: recipientPhone, // must include country code, no + or spaces
    type: 'text',
    text: { body: message }
  })
});
```

### Sequence Step Processing
```typescript
// Personalize template
const personalizedSubject = step.subject
  .replace(/\{\{business_name\}\}/g, lead.business_name)
  .replace(/\{\{category\}\}/g, lead.category || '')
  .replace(/\{\{location\}\}/g, lead.location || '');

// Generate email body via AI
const aiPrompt = step.body_prompt
  .replace(/\{\{business_name\}\}/g, lead.business_name)
  .replace(/\{\{category\}\}/g, lead.category || '')
  .replace(/\{\{location\}\}/g, lead.location || '');

// AI generates actual email body from prompt
const body = await generateEmailBody(aiPrompt);
```

### Cron Job SQL
```sql
SELECT cron.schedule(
  'process-sequences-every-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_ID.supabase.co/functions/v1/process-sequences',
    headers := '{"Authorization": "Bearer ANON_KEY"}'::jsonb
  );
  $$
);
```

---

## Testing Checklist

1. **Sequences**: Create test sequence → enroll lead → verify cron sends email at scheduled time
2. **WhatsApp**: Add WhatsApp credentials → trigger outreach → verify message sent via WhatsApp API
3. **Reply Detection**: Send test reply to conversation → verify sequence pauses automatically
4. **Webhook**: Configure Resend webhook URL → send test email → verify opens/bounces tracked

