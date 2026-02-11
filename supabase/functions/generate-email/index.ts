import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
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

    const { lead_id, template_type = "first_touch" } = await req.json();

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

    const companyName = settings?.company_name || "our company";
    const services = settings?.services?.join(", ") || "web development, mobile apps, and digital solutions";
    const portfolio = settings?.portfolio_links?.join(", ") || "";
    const signature = settings?.email_signature || "";

    const templatePrompts: Record<string, string> = {
      first_touch: `Write a compelling cold email to ${lead.business_name}, a ${lead.category || "business"} in ${lead.location || "Kenya"}.

Key points to address:
- They ${lead.has_website ? "have a basic website" : "don't have a website"}, which means they're missing out on online customers
- Reference their specific industry and how technology can help them
- Mention specific pain points for ${lead.category || "their"} businesses (e.g., manual booking, no online ordering, no customer reviews visibility)
- Briefly mention ${companyName} and our services: ${services}
${portfolio ? `- Reference our portfolio: ${portfolio}` : ""}
- Keep it personal, warm, and not salesy — like a neighbor offering help
- End with a soft call-to-action (suggest a brief call or WhatsApp chat)
${signature ? `- Use this signature: ${signature}` : ""}

The tone should be friendly, professional, and specifically relevant to their business type in Kenya.`,

      follow_up_1: `Write a friendly follow-up email to ${lead.business_name} (${lead.category || "business"} in ${lead.location || "Kenya"}).
This is the first follow-up after our initial email went unanswered.
- Be brief and casual
- Reference the previous email
- Add a new angle or insight specific to their industry
- Maybe mention a success story or stat about businesses like theirs going digital
- Keep it under 100 words`,

      follow_up_2: `Write a second follow-up email to ${lead.business_name} (${lead.category || "business"} in ${lead.location || "Kenya"}).
- This is the second follow-up, be more direct but still respectful
- Share a quick win or specific benefit (e.g., "businesses like yours see 40% more customers with a simple website")
- Offer something concrete (free consultation, quick demo)
- Very brief — 50-80 words`,

      final_follow_up: `Write a final follow-up email to ${lead.business_name} (${lead.category || "business"} in ${lead.location || "Kenya"}).
- This is the last email in the sequence
- Be gracious and brief
- Leave the door open
- "No hard feelings if now isn't the right time"
- 40-60 words max`,
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
            content: "You are an expert cold email copywriter specializing in B2B outreach for East African markets. You write emails that feel personal and genuine, not templated.",
          },
          { role: "user", content: templatePrompts[template_type] || templatePrompts.first_touch },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "compose_email",
              description: "Compose the outreach email",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Email subject line, compelling and personalized" },
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

    // Save as email campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .insert({
        user_id: userId,
        lead_id: lead_id,
        subject: email.subject,
        body: email.body,
        template_type,
        status: "draft",
      })
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Update lead status if first touch
    if (template_type === "first_touch" && lead.status === "discovered") {
      await supabase.from("leads").update({ status: "qualified" }).eq("id", lead_id);
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "email_generated",
      details: { lead_id, business_name: lead.business_name, template_type },
    });

    return new Response(JSON.stringify({ success: true, campaign }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
