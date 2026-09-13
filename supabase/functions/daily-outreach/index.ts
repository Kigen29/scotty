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

    let settingsQuery = supabase.from("settings").select("*").eq("is_autonomous", true);
    if (scopedUserId) settingsQuery = settingsQuery.eq("user_id", scopedUserId);
    const { data: allSettings } = await settingsQuery;

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalOutreach = 0;
    let totalSent = 0;
    let totalErrors = 0;
    const errors: string[] = [];

    for (const userSettings of allSettings) {
      const dailyLimit = userSettings.daily_send_limit || 20;
      const senderName = userSettings.company_name || "Emmanuel Kigen";
      const senderEmail = userSettings.sender_email || "";
      const services = userSettings.services?.join(", ") || "web development and digital solutions";
      const signature = userSettings.email_signature || "Best regards,\nEmmanuel Kigen";
      const portfolio = userSettings.portfolio_links?.join(", ") || "";
      // NOTE: settings.portfolio_projects is deliberately not read here — the
      // outreach prompts below only use portfolio_links. Wiring richer portfolio
      // matching into this path is part of Phase 3 (unify scoring/personalisation).

      // Determine sending capability
      const canAutoSend = RESEND_API_KEY && senderEmail && !isFreeEmail(senderEmail);
      const useOnboardingSender = RESEND_API_KEY && senderEmail && isFreeEmail(senderEmail);

      // Get today's leads that haven't been contacted yet, sorted by priority
      const { data: hotLeads } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", userSettings.user_id)
        .in("status", ["qualified", "discovered"])
        .eq("unsubscribed", false)
        // Only contact leads whose details came from a real external source.
        // 'rejected' rows were generated by a model; 'unverified' rows have
        // provenance we could not confirm.
        .eq("verification_state", "verified")
        .order("priority_score", { ascending: false })
        .limit(dailyLimit);

      if (!hotLeads || hotLeads.length === 0) continue;

      // Check how many emails already sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from("email_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userSettings.user_id)
        .gte("created_at", todayStart.toISOString());

      const remaining = dailyLimit - (sentToday || 0);
      if (remaining <= 0) continue;

      const leadsToProcess = hotLeads.slice(0, remaining);

      for (const lead of leadsToProcess) {
        // Check if already has a campaign
        const { data: existingCampaign } = await supabase
          .from("email_campaigns")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("user_id", userSettings.user_id)
          .maybeSingle();
        if (existingCampaign) continue;

        // Email is the only channel this function may initiate on.
        //
        // WhatsApp was removed: Meta only permits free-form messages inside a
        // 24-hour window a customer opened. Business-initiated contact needs
        // opt-in and a pre-approved template, so cold free-form sending is a
        // policy violation that gets the number restricted — the error 133010
        // handling this code used to carry suggests it was already happening.
        //
        // instagram_dm and linkedin were removed because they never sent
        // anything. They generated a draft with an LLM call and stopped; no
        // code path has ever delivered one. That burned tokens and inflated
        // the draft count for messages nobody could receive.
        //
        // A lead reachable only by phone is now a signal to call them
        // yourself, recorded in the activity log rather than silently skipped.
        const channel = "email";

        if (!lead.email) {
          if (lead.phone) {
            await supabase.from("activity_logs").insert({
              user_id: userSettings.user_id,
              action: "lead_requires_manual_contact",
              details: {
                lead_id: lead.id,
                business_name: lead.business_name,
                phone: lead.phone,
                reason: "No email address. Phone contact is manual — Scotty does not initiate WhatsApp.",
              },
            });
          }
          continue;
        }

        // Build analysis context
        const analysis = (lead as any).analysis;
        const painPointsText = analysis?.pain_points?.length
          ? `\nPain points: ${analysis.pain_points.map((p: string) => sanitizeForPrompt(p)).join("; ")}`
          : "";
        const solutionsText = analysis?.recommended_solutions?.length
          ? `\nSolutions: ${analysis.recommended_solutions.map((s: string) => sanitizeForPrompt(s)).join("; ")}`
          : "";

        // Generate message based on channel
        const safeName = sanitizeForPrompt(lead.business_name);
        const safeCat = sanitizeForPrompt(lead.category) || "business";
        const safeLoc = sanitizeForPrompt(lead.location) || "Kenya";

        const outreachPrompt = `Write a compelling personal cold email from ${senderName} to ${safeName} (${safeCat} in ${safeLoc}).
- They ${lead.has_website ? "have a basic website" : "don't have a website"}
- Services offered: ${services}${painPointsText}${solutionsText}
${portfolio ? `- Portfolio: ${portfolio}` : ""}
- End with soft CTA (call or WhatsApp chat)
- Sign off as ${senderName}
${signature ? `- Signature: ${signature}` : ""}
- Include "Reply STOP to unsubscribe" at the bottom`;

        try {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: "You are writing cold emails on behalf of a freelance web developer doing outreach to East African businesses." },
                { role: "user", content: outreachPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "compose_message",
                  description: "Compose the outreach message",
                  parameters: {
                    type: "object",
                    properties: {
                      subject: { type: "string", description: "Subject line (for email) or empty for other channels" },
                      body: { type: "string", description: "Message body" },
                    },
                    required: ["subject", "body"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "compose_message" } },
            }),
          });

          if (!aiResponse.ok) {
            totalErrors++;
            errors.push(`AI failed for ${lead.business_name}: ${aiResponse.status}`);
            continue;
          }

          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) continue;

          const message = JSON.parse(toolCall.function.arguments);

          // Save campaign with source = 'auto_agent'
          const { data: campaign } = await supabase.from("email_campaigns").insert({
            user_id: userSettings.user_id,
            lead_id: lead.id,
            subject: message.subject || `${channel} outreach to ${lead.business_name}`,
            body: message.body,
            template_type: "first_touch",
            status: "draft",
            channel,
            source: "auto_agent",
          }).select("id").single();

          if (!campaign) continue;
          totalOutreach++;

          // Auto-send emails via Resend
          if (channel === "email" && lead.email && RESEND_API_KEY) {
            // Determine the 'from' address
            let fromAddress = "";
            if (canAutoSend) {
              fromAddress = senderEmail;
            } else if (useOnboardingSender) {
              fromAddress = "onboarding@resend.dev";
            } else {
              // No valid sender, keep as draft
              continue;
            }

            try {
              const sendResponse = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: `${senderName} <${fromAddress}>`,
                  to: [lead.email],
                  subject: message.subject,
                  text: message.body,
                }),
              });

              if (sendResponse.ok) {
                await supabase.from("email_campaigns").update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                }).eq("id", campaign.id);

                await supabase.from("leads").update({ status: "contacted" }).eq("id", lead.id);

                await supabase.from("activity_logs").insert({
                  user_id: userSettings.user_id,
                  action: "auto_email_sent",
                  details: { business_name: lead.business_name, to: lead.email, channel, from: fromAddress },
                });
                totalSent++;
              } else {
                const errBody = await sendResponse.text();
                totalErrors++;
                errors.push(`Resend failed for ${lead.business_name}: ${errBody}`);
                // Log the failure
                await supabase.from("activity_logs").insert({
                  user_id: userSettings.user_id,
                  action: "auto_email_failed",
                  details: { business_name: lead.business_name, to: lead.email, error: errBody },
                });
              }
            } catch (sendErr) {
              totalErrors++;
              errors.push(`Send error for ${lead.business_name}: ${sendErr}`);
              console.error(`Send failed for ${lead.business_name}:`, sendErr);
            }
          }

        } catch (err) {
          totalErrors++;
          errors.push(`Outreach error for ${lead.business_name}: ${err}`);
          console.error(`Outreach failed for ${lead.business_name}:`, err);
        }
      }
    }

    // Log the run summary
    if (allSettings.length > 0) {
      await supabase.from("activity_logs").insert({
        user_id: allSettings[0].user_id,
        action: "auto_outreach_run",
        details: { total_drafts: totalOutreach, total_sent: totalSent, total_errors: totalErrors, errors: errors.slice(0, 5) },
      });
    }

    return new Response(
      JSON.stringify({ success: true, total_drafts: totalOutreach, total_sent: totalSent, total_errors: totalErrors, errors: errors.slice(0, 5) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("daily-outreach error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
