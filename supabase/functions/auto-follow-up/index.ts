import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  if (cronSecret !== CRON_SECRET) {
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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!RESEND_API_KEY || !LOVABLE_API_KEY) throw new Error("Missing API keys");

    const resend = new Resend(RESEND_API_KEY);

    // Get autonomous users (scoped to calling user if JWT auth)
    let settingsQuery = supabase.from("settings").select("*").eq("is_autonomous", true);
    if (scopedUserId) settingsQuery = settingsQuery.eq("user_id", scopedUserId);
    const { data: allSettings } = await settingsQuery;

    if (!allSettings?.length) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const settings of allSettings) {
      const userId = settings.user_id;
      const senderEmail = settings.sender_email;
      const senderName = settings.company_name || "Emmanuel Kigen";
      const dailyLimit = settings.daily_send_limit || 50;
      const followUpIntervals = settings.follow_up_intervals || [3, 7, 14];

      if (!senderEmail) continue;

      // Count emails sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from("email_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "sent")
        .gte("sent_at", todayStart.toISOString());

      if ((sentToday || 0) >= dailyLimit) {
        console.log(`User ${userId} hit daily limit`);
        continue;
      }

      const remainingQuota = dailyLimit - (sentToday || 0);

      // 1. Send unsent draft emails for qualified leads
      const { data: draftCampaigns } = await supabase
        .from("email_campaigns")
        .select("*, leads(*)")
        .eq("user_id", userId)
        .eq("status", "draft")
        .order("created_at", { ascending: true })
        .limit(Math.min(remainingQuota, 10));

      for (const campaign of draftCampaigns || []) {
        const lead = (campaign as any).leads;
        if (!lead?.email) continue;
        if (lead?.unsubscribed) continue; // Skip unsubscribed leads

        try {
          const bodyWithFooter = campaign.body + "\n\n---\nReply STOP to unsubscribe.";
          await resend.emails.send({
            from: `${senderName} <${senderEmail}>`,
            to: [lead.email],
            subject: campaign.subject,
            text: bodyWithFooter,
          });

          await supabase.from("email_campaigns").update({
            status: "sent",
            sent_at: new Date().toISOString(),
          }).eq("id", campaign.id);

          await supabase.from("leads").update({ status: "contacted" }).eq("id", campaign.lead_id);

          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: "auto_email_sent",
            details: { campaign_id: campaign.id, business_name: lead.business_name, to: lead.email },
          });

          totalSent++;
        } catch (err) {
          console.error(`Failed to send to ${lead.email}:`, err);
        }
      }

      // 2. Generate and schedule follow-ups for leads that were contacted but haven't responded
      const { data: contactedLeads } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "contacted");

      for (const lead of contactedLeads || []) {
        if ((lead as any).unsubscribed) continue; // Skip unsubscribed leads
        // Get existing campaigns for this lead
        const { data: existingCampaigns } = await supabase
          .from("email_campaigns")
          .select("template_type, sent_at")
          .eq("lead_id", lead.id)
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (!existingCampaigns?.length) continue;

        const lastSent = existingCampaigns[existingCampaigns.length - 1];
        if (!lastSent.sent_at) continue;

        const daysSinceLastEmail = Math.floor(
          (Date.now() - new Date(lastSent.sent_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const templateSequence = ["first_touch", "follow_up_1", "follow_up_2", "final_follow_up"];
        const sentTypes = existingCampaigns.map((c) => c.template_type);
        const nextTemplateIndex = templateSequence.findIndex((t) => !sentTypes.includes(t));

        if (nextTemplateIndex < 0) continue; // All follow-ups sent

        const intervalIndex = Math.min(nextTemplateIndex - 1, followUpIntervals.length - 1);
        const requiredDays = followUpIntervals[intervalIndex] || 7;

        if (daysSinceLastEmail < requiredDays) continue;

        const nextTemplate = templateSequence[nextTemplateIndex];

        // Generate follow-up email via AI
        const safeName = sanitizeForPrompt(lead.business_name);
        const safeCat = sanitizeForPrompt(lead.category);
        const safeLoc = sanitizeForPrompt(lead.location);
        const prompt = nextTemplate === "follow_up_1"
          ? `You are Emmanuel Kigen, a freelance web developer. Write a brief first follow-up email to ${safeName} (${safeCat} in ${safeLoc}). Reference your previous personal email offering to build them a website. Add a new angle. Under 100 words.`
          : nextTemplate === "follow_up_2"
          ? `You are Emmanuel Kigen, a freelance web developer. Write a second follow-up to ${safeName}. Be direct, share a quick win they'd get from having a website. 50-80 words.`
          : `You are Emmanuel Kigen, a freelance web developer. Write a final follow-up to ${safeName}. Be gracious, leave door open. 40-60 words.`;

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
                { role: "system", content: "You are writing emails on behalf of Emmanuel Kigen, a freelance web developer doing personal outreach to East African businesses. Keep it personal, warm, and genuine." },
                { role: "user", content: prompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "compose_email",
                  description: "Compose email",
                  parameters: {
                    type: "object",
                    properties: {
                      subject: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["subject", "body"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "compose_email" } },
            }),
          });

          if (!aiResponse.ok) continue;

          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) continue;

          const email = JSON.parse(toolCall.function.arguments);

          // Insert as draft (will be sent on next cron run)
          await supabase.from("email_campaigns").insert({
            user_id: userId,
            lead_id: lead.id,
            subject: email.subject,
            body: email.body,
            template_type: nextTemplate,
            status: "draft",
          });

          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: "follow_up_generated",
            details: { lead_id: lead.id, business_name: lead.business_name, template: nextTemplate },
          });
        } catch (err) {
          console.error(`Follow-up generation error for ${lead.business_name}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, emails_sent: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-follow-up error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
