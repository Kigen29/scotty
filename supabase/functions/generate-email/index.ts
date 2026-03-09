import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { lead_id, template_type = "first_touch", ab_test = false } = await req.json();

    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("user_id", userId)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user settings for company info
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const bookingLink = (settings as any)?.booking_link || "";

    const senderName = settings?.company_name || "Emmanuel Kigen";
    const services = settings?.services?.join(", ") || "web development, mobile apps, and digital solutions";
    const portfolio = settings?.portfolio_links?.join(", ") || "";
    const signature = settings?.email_signature || `Best regards,\nEmmanuel Kigen`;

    // Get portfolio projects for industry-matched references
    const portfolioProjects = (settings as any)?.portfolio_projects || [];
    const matchedProjects = portfolioProjects.filter((p: any) =>
      p.industry && lead.category && p.industry.toLowerCase().includes(lead.category.toLowerCase())
    );
    const portfolioContext = matchedProjects.length > 0
      ? `\n- Reference these relevant projects you've built:\n${matchedProjects.map((p: any) => `  * ${p.url} (${p.industry}): ${p.problem_solved}`).join("\n")}`
      : portfolio ? `\n- Mention your portfolio: ${portfolio}` : "";

    // Get lead analysis if available
    const analysisData = (lead as any).analysis;
    const analysisContext = analysisData
      ? `\n- Use these specific pain points: ${(analysisData.pain_points || []).join("; ")}
- Propose these solutions: ${(analysisData.recommended_solutions || []).join("; ")}`
      : "";

    const bookingContext = bookingLink ? `\n- Include a booking link for a free consultation: ${bookingLink}` : "";

    const templatePrompts: Record<string, string> = {
      first_touch: `You are Emmanuel Kigen, a freelance web developer reaching out personally to ${sanitizeForPrompt(lead.business_name)}, a ${sanitizeForPrompt(lead.category) || "business"} in ${sanitizeForPrompt(lead.location) || "Kenya"}.

Write a compelling personal cold email:
- They ${lead.has_website ? "have a basic website" : "don't have a website"}, which means they're missing out on online customers
- Reference their specific industry and how a website/digital presence can help them
- Mention specific pain points for ${sanitizeForPrompt(lead.category) || "their"} businesses (e.g., manual booking, no online ordering, no customer reviews visibility)
- Present yourself as a freelance web developer who personally offers: ${services}${portfolioContext}${analysisContext}
- Keep it personal, warm, and genuine — you're a real person reaching out, not a company
- End with a soft call-to-action (suggest a brief call or WhatsApp chat)${bookingContext}
- Sign off as Emmanuel Kigen
${signature ? `- Use this signature: ${signature}` : ""}

The tone should be friendly, personal, and specifically relevant to their business type in Kenya.`,

      follow_up_1: `You are Emmanuel Kigen, a freelance web developer. Write a friendly follow-up email to ${sanitizeForPrompt(lead.business_name)} (${sanitizeForPrompt(lead.category) || "business"} in ${sanitizeForPrompt(lead.location) || "Kenya"}).
This is your first follow-up after your initial personal email went unanswered.
- Be brief and casual
- Reference your previous email
- Add a new angle or insight specific to their industry
- Keep it under 100 words
- Sign off as Emmanuel`,

      follow_up_2: `You are Emmanuel Kigen, a freelance web developer. Write a second follow-up email to ${sanitizeForPrompt(lead.business_name)} (${sanitizeForPrompt(lead.category) || "business"} in ${sanitizeForPrompt(lead.location) || "Kenya"}).
- Be more direct but still respectful
- Share a quick win (e.g., "businesses like yours see 40% more customers with a simple website")
- Offer something concrete (free consultation, quick demo)
- Very brief — 50-80 words
- Sign off as Emmanuel`,

      final_follow_up: `You are Emmanuel Kigen, a freelance web developer. Write a final follow-up email to ${sanitizeForPrompt(lead.business_name)} (${sanitizeForPrompt(lead.category) || "business"} in ${sanitizeForPrompt(lead.location) || "Kenya"}).
- This is your last email
- Be gracious and brief
- Leave the door open
- "No hard feelings if now isn't the right time"
- 40-60 words max
- Sign off as Emmanuel`,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            content: "You are writing emails on behalf of Emmanuel Kigen, a freelance web developer doing personal outreach to East African businesses. Write emails that feel genuinely personal — like one person reaching out to another, not a company pitch.",
          },
          { role: "user", content: templatePrompts[template_type] || templatePrompts.first_touch },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "compose_email",
              description: "Compose the outreach email. If ab_variant is requested, provide two different subject lines.",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Email subject line, compelling and personalized" },
                  subject_b: { type: "string", description: "Alternative subject line for A/B testing (different angle/tone)" },
                  body: { type: "string", description: "Email body text, well-formatted with line breaks" },
                },
                required: ["subject", "body"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "compose_email" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI email generation failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return email content");
    }

    const email = JSON.parse(toolCall.function.arguments);

    // Save as email campaign (variant A)
    const { data: campaignA, error: campaignError } = await supabase
      .from("email_campaigns")
      .insert({
        user_id: userId,
        lead_id: lead_id,
        subject: email.subject,
        body: email.body,
        template_type,
        status: "draft",
        ab_variant: ab_test ? "a" : null,
      })
      .select()
      .single();

    if (campaignError) throw campaignError;

    let abTestRecord = null;

    // If A/B test requested and we got a variant B subject
    if (ab_test && email.subject_b) {
      const { data: campaignB } = await supabase
        .from("email_campaigns")
        .insert({
          user_id: userId,
          lead_id: lead_id,
          subject: email.subject_b,
          body: email.body,
          template_type,
          status: "draft",
          ab_variant: "b",
        })
        .select()
        .single();

      if (campaignB) {
        const { data: abTest } = await supabase
          .from("ab_tests")
          .insert({
            user_id: userId,
            lead_id: lead_id,
            campaign_a_id: campaignA.id,
            campaign_b_id: campaignB.id,
          })
          .select()
          .single();

        abTestRecord = abTest;

        // Link campaigns back to the ab_test
        await supabase.from("email_campaigns").update({ ab_test_id: abTest?.id }).in("id", [campaignA.id, campaignB.id]);
      }
    }

    // Update lead status if first touch
    if (template_type === "first_touch" && lead.status === "discovered") {
      await supabase.from("leads").update({ status: "qualified" }).eq("id", lead_id);
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: ab_test ? "ab_test_created" : "email_generated",
      details: { lead_id, business_name: lead.business_name, template_type, ab_test: !!ab_test },
    });

    return new Response(JSON.stringify({ success: true, campaign: campaignA, ab_test: abTestRecord }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-email error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
