import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FREE_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com"];

function isFreeEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return FREE_EMAIL_DOMAINS.includes(domain);
}

function sanitizeForPrompt(text: string | null | undefined, maxLen = 200): string {
  if (!text) return "";
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions?/gi, "[filtered]")
    .replace(/you\s+are\s+now/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/\bprompt\s*:/gi, "[filtered]")
    .replace(/\bassistant\s*:/gi, "[filtered]")
    .substring(0, maxLen);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require cron secret or valid JWT (JWT scoped to calling user only)
  let scopedUserId: string | null = null;
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET || CRON_SECRET.length < 16 || cronSecret !== CRON_SECRET) {
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    scopedUserId = claimsData.claims.sub as string;
  }

  // ── AUTONOMY KILL SWITCH ─────────────────────────────────────────────────
  // Every scheduled path is off unless the project explicitly opts in, so a
  // cron job nobody can find cannot discover or send. Manual, user-triggered
  // functions are unaffected — the app still works by hand.
  //
  // To re-enable, set AUTONOMY_ENABLED=true in the project's edge function
  // secrets. Absence of the secret means disabled, so this is safe by default.
  //
  // Duplicated across the five scheduled functions on purpose: a safety
  // mechanism should not depend on a shared import resolving at deploy time.
  // Phase 1 folds it into _shared/ along with everything else.
  if (Deno.env.get("AUTONOMY_ENABLED") !== "true") {
    console.warn("Autonomy disabled: AUTONOMY_ENABLED is not \"true\". Skipping.");
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: "Autonomy is disabled. Set AUTONOMY_ENABLED=true in edge function secrets to re-enable.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Get active enrollments that are due (scoped to calling user if JWT auth)
    const now = new Date().toISOString();
    let enrollQuery = supabase
      .from("sequence_enrollments")
      .select("*, sequences(*), leads(*)")
      .eq("status", "active")
      .or(`next_step_at.lte.${now},and(next_step_at.is.null,current_step.eq.0)`)
      .limit(50);
    if (scopedUserId) enrollQuery = enrollQuery.eq("user_id", scopedUserId);
    const { data: enrollments, error: enrollErr } = await enrollQuery;

    if (enrollErr) throw enrollErr;
    if (!enrollments || enrollments.length === 0) {
      return new Response(JSON.stringify({ message: "No enrollments due", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let sent = 0;
    let errors = 0;

    for (const enrollment of enrollments) {
      const sequence = enrollment.sequences;
      const lead = enrollment.leads;
      if (!sequence || !lead) continue;

      const steps = (sequence.steps as any[]) || [];
      const currentStepIndex = enrollment.current_step || 0;

      if (currentStepIndex >= steps.length) {
        // All steps completed
        await supabase.from("sequence_enrollments").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", enrollment.id);
        continue;
      }

      // Check if lead replied (pause if so)
      const { data: replies } = await supabase
        .from("conversations")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .limit(1);

      if (replies && replies.length > 0) {
        await supabase.from("sequence_enrollments").update({
          status: "paused",
        }).eq("id", enrollment.id);

        await supabase.from("activity_logs").insert({
          user_id: enrollment.user_id,
          action: "sequence_paused_by_reply",
          details: { lead_id: lead.id, business_name: lead.business_name, sequence_name: sequence.name },
        });
        continue;
      }

      // Never advance a sequence for a lead we cannot vouch for.
      if (lead.verification_state !== "verified") {
        await supabase.from("sequence_enrollments").update({ status: "paused" }).eq("id", enrollment.id);
        console.warn(`Paused enrollment ${enrollment.id}: lead ${lead.id} is ${lead.verification_state}`);
        continue;
      }

      // Check if lead unsubscribed
      if (lead.unsubscribed) {
        await supabase.from("sequence_enrollments").update({ status: "paused" }).eq("id", enrollment.id);
        continue;
      }

      const step = steps[currentStepIndex];
      if (!step) continue;

      // Personalize subject and prompt (sanitize lead fields to prevent prompt injection)
      const safeName = sanitizeForPrompt(lead.business_name);
      const safeCat = sanitizeForPrompt(lead.category);
      const safeLoc = sanitizeForPrompt(lead.location);
      const personalize = (text: string) =>
        text
          .replace(/\{\{business_name\}\}/g, safeName)
          .replace(/\{\{category\}\}/g, safeCat || "")
          .replace(/\{\{location\}\}/g, safeLoc || "");

      const subject = personalize(step.subject || `Follow-up #${currentStepIndex + 1}`);
      const bodyPrompt = personalize(
        step.body_prompt || step.body || `Write a follow-up email to ${safeName}`
      );

      // Get user settings for sender info
      const { data: userSettings } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", enrollment.user_id)
        .maybeSingle();

      const senderName = userSettings?.company_name || "Team";
      const senderEmail = userSettings?.sender_email || "";
      const signature = userSettings?.email_signature || "";

      try {
        // Generate email body via AI
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are writing a follow-up email on behalf of ${senderName}. Keep it concise, professional, and reference previous contact. ${signature ? `Sign off with: ${signature}` : ""}`,
              },
              { role: "user", content: bodyPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "compose_email",
                description: "Compose the follow-up email",
                parameters: {
                  type: "object",
                  properties: {
                    body: { type: "string", description: "Email body text" },
                  },
                  required: ["body"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "compose_email" } },
          }),
        });

        if (!aiResponse.ok) {
          errors++;
          console.error(`AI failed for enrollment ${enrollment.id}: ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) { errors++; continue; }

        const emailContent = JSON.parse(toolCall.function.arguments);

        // Create campaign record
        const { data: campaign } = await supabase.from("email_campaigns").insert({
          user_id: enrollment.user_id,
          lead_id: lead.id,
          subject,
          body: emailContent.body,
          template_type: `sequence_step_${currentStepIndex + 1}`,
          status: "draft",
          source: "sequence",
        }).select("id").single();

        if (!campaign) { errors++; continue; }
        processed++;

        // Send via Resend if possible
        if (RESEND_API_KEY && lead.email) {
          const canAutoSend = senderEmail && !isFreeEmail(senderEmail);
          const fromAddress = canAutoSend ? senderEmail : (senderEmail ? "onboarding@resend.dev" : "");

          if (fromAddress) {
            const sendResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `${senderName} <${fromAddress}>`,
                to: [lead.email],
                subject,
                text: emailContent.body,
              }),
            });

            if (sendResponse.ok) {
              await supabase.from("email_campaigns").update({
                status: "sent",
                sent_at: new Date().toISOString(),
              }).eq("id", campaign.id);
              sent++;
            } else {
              const errBody = await sendResponse.text();
              console.error(`Resend failed for ${lead.business_name}: ${errBody}`);
            }
          }
        }

        // Advance to next step
        const nextStepIndex = currentStepIndex + 1;
        const delayDays = step.delay_days || steps[nextStepIndex]?.delay_days || 3;
        const nextStepAt = new Date();
        nextStepAt.setDate(nextStepAt.getDate() + delayDays);

        if (nextStepIndex >= steps.length) {
          await supabase.from("sequence_enrollments").update({
            current_step: nextStepIndex,
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", enrollment.id);
        } else {
          await supabase.from("sequence_enrollments").update({
            current_step: nextStepIndex,
            next_step_at: nextStepAt.toISOString(),
          }).eq("id", enrollment.id);
        }
      } catch (err) {
        errors++;
        console.error(`Error processing enrollment ${enrollment.id}:`, err);
      }
    }

    // Log summary
    if (enrollments.length > 0) {
      await supabase.from("activity_logs").insert({
        user_id: enrollments[0].user_id,
        action: "sequence_processing_run",
        details: { processed, sent, errors, total_enrollments: enrollments.length },
      });
    }

    return new Response(
      JSON.stringify({ success: true, processed, sent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-sequences error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
