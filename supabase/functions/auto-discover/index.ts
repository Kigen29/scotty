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
    // This function is called by cron — use service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all users with autonomous mode enabled
    const { data: allSettings } = await supabase
      .from("settings")
      .select("*")
      .eq("is_autonomous", true);

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY || !LOVABLE_API_KEY) {
      throw new Error("Missing required API keys");
    }

    let totalDiscovered = 0;

    for (const userSettings of allSettings) {
      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];

      if (categories.length === 0 || locations.length === 0) continue;

      // Pick a random category and location for this run
      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      const searchQuery = `${category} ${location} Kenya small business no website local`;

      console.log(`Auto-discovering for user ${userSettings.user_id}: ${searchQuery}`);

      const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 10,
          lang: "en",
          country: "ke",
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      const searchData = await searchResponse.json();
      if (!searchResponse.ok) {
        console.error("Firecrawl error:", searchData);
        continue;
      }

      const results = searchData.data || [];

      // Extract businesses with AI
      const extractionPrompt = `Analyze these search results and extract Kenyan business leads.
We are specifically looking for businesses that do NOT have their own website.

IMPORTANT RULES:
- If a business has its own domain/professional website, set has_website to true. These are LOW priority.
- If a business is only found on directories (Google Maps, Yellow Pages, Facebook, Jumia, etc.), set has_website to false. These are our PRIMARY targets.
- Focus on small/local businesses that would benefit from getting a website built for them.
- Skip large chains or well-known franchises.

Search results:
${results.map((r: any, i: number) => `
Result ${i + 1}:
URL: ${r.url}
Title: ${r.title || ""}
Description: ${r.description || ""}
Content: ${(r.markdown || "").substring(0, 500)}
`).join("\n")}

Extract actual businesses (not directory pages). Category: ${category}. Location: ${location}.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Extract structured business data from search results." },
            { role: "user", content: extractionPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_businesses",
              description: "Extract business leads",
              parameters: {
                type: "object",
                properties: {
                  businesses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        business_name: { type: "string" },
                        category: { type: "string" },
                        location: { type: "string" },
                        phone: { type: "string" },
                        email: { type: "string" },
                        website_url: { type: "string" },
                        has_website: { type: "boolean" },
                        notes: { type: "string" },
                      },
                      required: ["business_name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["businesses"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_businesses" } },
        }),
      });

      if (!aiResponse.ok) {
        console.error("AI error:", await aiResponse.text());
        continue;
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      let businesses: any[] = [];
      if (toolCall?.function?.arguments) {
        try {
          businesses = JSON.parse(toolCall.function.arguments).businesses || [];
        } catch { /* skip */ }
      }

      // Insert new leads, auto-qualify, and generate first-touch emails
      const senderName = userSettings.company_name || "Emmanuel Kigen";
      const services = userSettings.services?.join(", ") || "web development, mobile apps, and digital solutions";
      const portfolio = userSettings.portfolio_links?.join(", ") || "";
      const signature = userSettings.email_signature || "Best regards,\nEmmanuel Kigen";

      for (const biz of businesses) {
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userSettings.user_id)
          .eq("business_name", biz.business_name)
          .maybeSingle();

        if (existing) continue;

        // Insert lead as "qualified" (skip manual approval)
        const { data: newLead, error: leadError } = await supabase.from("leads").insert({
          user_id: userSettings.user_id,
          business_name: biz.business_name,
          category: biz.category || category,
          location: biz.location || location,
          phone: biz.phone || null,
          email: biz.email || null,
          website_url: biz.website_url || null,
          has_website: biz.has_website ?? false,
          notes: biz.notes || null,
          status: "qualified",
        }).select("id").single();

        if (leadError || !newLead) continue;
        totalDiscovered++;

        // Only generate email if lead has an email address
        if (!biz.email) continue;

        // Generate first-touch email via AI
        const emailPrompt = `You are Emmanuel Kigen, a freelance web developer reaching out personally to ${biz.business_name}, a ${biz.category || category} business in ${biz.location || location}.

Write a compelling personal cold email:
- They don't have a website, which means they're missing out on online customers
- Reference their specific industry and how a website can help them
- Present yourself as a freelance web developer who personally offers: ${services}
${portfolio ? `- Mention your portfolio: ${portfolio}` : ""}
- Keep it personal, warm, and genuine
- End with a soft call-to-action (suggest a brief call or WhatsApp chat)
- Sign off as Emmanuel Kigen
${signature ? `- Use this signature: ${signature}` : ""}`;

        try {
          const emailAiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: "You are writing emails on behalf of Emmanuel Kigen, a freelance web developer doing personal outreach to East African businesses." },
                { role: "user", content: emailPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "compose_email",
                  description: "Compose the outreach email",
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

          if (emailAiResponse.ok) {
            const emailAiData = await emailAiResponse.json();
            const emailToolCall = emailAiData.choices?.[0]?.message?.tool_calls?.[0];
            if (emailToolCall?.function?.arguments) {
              const email = JSON.parse(emailToolCall.function.arguments);
              await supabase.from("email_campaigns").insert({
                user_id: userSettings.user_id,
                lead_id: newLead.id,
                subject: email.subject,
                body: email.body,
                template_type: "first_touch",
                status: "draft",
              });
            }
          }
        } catch (emailErr) {
          console.error(`Email generation failed for ${biz.business_name}:`, emailErr);
        }
      }

      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: userSettings.user_id,
        action: "auto_discovery",
        details: { category, location, leads_added: totalDiscovered, autonomous: true },
      });
    }

    return new Response(
      JSON.stringify({ success: true, total_discovered: totalDiscovered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-discover error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
