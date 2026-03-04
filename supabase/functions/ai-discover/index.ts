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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const { data: allSettings } = await supabase
      .from("settings")
      .select("*")
      .eq("is_autonomous", true);

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDiscovered = 0;

    for (const userSettings of allSettings) {
      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];
      if (categories.length === 0 || locations.length === 0) continue;

      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      const portfolioProjects = userSettings.portfolio_projects || [];

      console.log(`AI discovery for user ${userSettings.user_id}: ${category} in ${location}`);

      // Use Lovable AI as a research agent to find businesses without websites
      const discoveryPrompt = `You are a local business researcher in Kenya. Your job is to identify REAL small businesses in ${location}, Kenya that operate in the "${category}" category and have NO website.

These businesses typically:
- Only have a Google Maps / Google Business Profile listing
- Rely on word-of-mouth, foot traffic, or social media (Facebook page, Instagram)
- Have a phone number painted on their shopfront or listed on Google Maps
- Are small, independently owned shops or service providers
- Do NOT have a .co.ke, .com, or any custom domain website

Think about the specific streets, neighborhoods, and commercial areas in ${location} where ${category} businesses operate. Consider:
- Main commercial streets and market areas
- Shopping centers and malls
- Residential area commercial strips
- Industrial areas if relevant

Generate 5-8 realistic business leads that match this profile. For each business:
- Use realistic Kenyan business naming conventions (e.g., "[Owner's Name] [Business Type]", "[Location] [Business Type]", etc.)
- Use realistic Kenyan phone number formats (+254 7XX XXX XXX)
- Include a plausible physical address or area description
- If you know of actual businesses fitting this profile, include them
- Only include businesses you're reasonably confident do NOT have a website

**CRITICAL: EMAIL ADDRESSES ARE THE MOST IMPORTANT FIELD.** You MUST try to find or infer email addresses for every business. Check:
- Google Business Profile listings (many have email)
- Facebook business pages (often list contact email)
- Kenya business directories (e.g., Yellow Pages Kenya, Kenya Business Directory)
- Common patterns: info@businessname.com, businessname@gmail.com, ownername@gmail.com
- If the business has a Facebook or Instagram page, the contact info often includes email
- Even if you have to guess a likely Gmail address based on the business name, include it

Businesses with email addresses are 10x more valuable than those without. Prioritize finding businesses that have publicly listed email addresses.

IMPORTANT: Do NOT invent businesses that are likely to have websites. Skip chains, franchises, and large establishments.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are a Kenyan local business researcher. You identify small businesses that have no website and could benefit from one. Return realistic, verifiable business data.",
            },
            { role: "user", content: discoveryPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "report_businesses",
              description: "Report discovered businesses without websites",
              parameters: {
                type: "object",
                properties: {
                  businesses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        business_name: { type: "string", description: "Name of the business" },
                        category: { type: "string", description: "Business category" },
                        location: { type: "string", description: "City/town" },
                        address: { type: "string", description: "Physical address or area" },
                        phone: { type: "string", description: "Phone number in +254 format" },
                        email: { type: "string", description: "Email if known, empty string if not" },
                        has_website: { type: "boolean", description: "Must be false for valid leads" },
                        google_maps_url: { type: "string", description: "Google Maps link if available" },
                        notes: { type: "string", description: "Additional context about the business" },
                      },
                      required: ["business_name", "category", "location", "has_website", "phone"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["businesses"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "report_businesses" } },
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error(`AI discovery error (${aiResponse.status}):`, errText);
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

      // HARD FILTER: no website + must have contact info
      const validLeads = businesses.filter(b => !b.has_website && (b.phone || b.email));
      console.log(`AI returned ${businesses.length} businesses, ${validLeads.length} passed filters`);

      const services = userSettings.services?.join(", ") || "web development, mobile apps, and digital solutions";
      const signature = userSettings.email_signature || "Best regards,\nEmmanuel Kigen";

      for (const biz of validLeads) {
        // Check for duplicates
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userSettings.user_id)
          .eq("business_name", biz.business_name)
          .maybeSingle();

        if (existing) continue;

        const socialLinks: any = {};
        if (biz.google_maps_url) socialLinks.google_maps = biz.google_maps_url;

        const contactChannels: any[] = [];
        if (biz.phone) contactChannels.push({ type: "phone", value: biz.phone });
        if (biz.email) contactChannels.push({ type: "email", value: biz.email });

        const noteParts = [];
        if (biz.address) noteParts.push(`Address: ${biz.address}`);
        if (biz.notes) noteParts.push(biz.notes);
        if (biz.google_maps_url) noteParts.push(`Maps: ${biz.google_maps_url}`);

        const { data: newLead, error: leadError } = await supabase.from("leads").insert({
          user_id: userSettings.user_id,
          business_name: biz.business_name,
          category: biz.category || category,
          location: biz.location || location,
          phone: biz.phone || null,
          email: biz.email || null,
          website_url: null,
          has_website: false,
          notes: noteParts.join(" | ") || null,
          status: "qualified",
          discovery_source: "ai_search",
          contact_channels: contactChannels.length > 0 ? contactChannels : null,
          social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
        }).select("id").single();

        if (leadError || !newLead) continue;
        totalDiscovered++;

        // Inline lead analysis
        try {
          const analysisPrompt = `Analyze this Kenyan business found via AI research with NO website.

Business: ${biz.business_name}
Category: ${biz.category || category}
Location: ${biz.location || location}
Address: ${biz.address || "Unknown"}
Phone: ${biz.phone || "None"}
Email: ${biz.email || "None"}

This business has NO website — they rely entirely on word of mouth and foot traffic.

My portfolio projects:
${JSON.stringify(portfolioProjects, null, 2)}

Provide:
1. Pain points from having no website
2. Specific website features they would benefit from
3. Which portfolio projects to reference and why
4. Priority score 1-10`;

          const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You are a business intelligence analyst helping a freelance web developer identify high-value leads." },
                { role: "user", content: analysisPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "analyze_lead",
                  description: "Provide structured lead analysis",
                  parameters: {
                    type: "object",
                    properties: {
                      pain_points: { type: "array", items: { type: "string" } },
                      recommended_solutions: { type: "array", items: { type: "string" } },
                      matched_portfolio: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { url: { type: "string" }, reason: { type: "string" } },
                          required: ["url", "reason"],
                          additionalProperties: false,
                        },
                      },
                      priority_score: { type: "integer" },
                      summary: { type: "string" },
                    },
                    required: ["pain_points", "recommended_solutions", "matched_portfolio", "priority_score", "summary"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "analyze_lead" } },
            }),
          });

          if (analysisResponse.ok) {
            const analysisData = await analysisResponse.json();
            const analysisToolCall = analysisData.choices?.[0]?.message?.tool_calls?.[0];
            if (analysisToolCall?.function?.arguments) {
              const analysis = JSON.parse(analysisToolCall.function.arguments);
              // Boost priority for leads with email (+2)
              const baseScore = analysis.priority_score || 5;
              const boostedScore = biz.email ? Math.min(10, baseScore + 2) : baseScore;
              await supabase.from("leads").update({
                analysis,
                priority_score: Math.min(10, Math.max(1, boostedScore)),
              }).eq("id", newLead.id);
              console.log(`Analyzed ${biz.business_name}: score ${boostedScore}${biz.email ? " (email boost)" : ""}`);
            }
          }
        } catch (analysisErr) {
          console.error(`Analysis failed for ${biz.business_name}:`, analysisErr);
        }

        // Generate email if lead has email
        if (!biz.email) continue;

        try {
          const emailPrompt = `You are Emmanuel Kigen, a freelance web developer reaching out to ${biz.business_name}, a ${biz.category || category} business in ${biz.location || location}, Kenya.

They have NO website — only word of mouth and foot traffic. Write a compelling, personal cold email:
- Reference their specific business type and location
- Explain how a website would help them get more customers
- Present yourself as a local freelance web developer: ${services}
- Keep it warm, genuine, and concise
- End with a soft CTA — suggest a quick WhatsApp chat or phone call
- Sign off as Emmanuel Kigen
${signature ? `- Signature: ${signature}` : ""}`;

          const emailResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You are writing personalized cold emails on behalf of Emmanuel Kigen, a freelance web developer targeting Kenyan small businesses with no website." },
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

          if (emailResponse.ok) {
            const emailData = await emailResponse.json();
            const emailToolCall = emailData.choices?.[0]?.message?.tool_calls?.[0];
            if (emailToolCall?.function?.arguments) {
              const email = JSON.parse(emailToolCall.function.arguments);
              await supabase.from("email_campaigns").insert({
                user_id: userSettings.user_id,
                lead_id: newLead.id,
                subject: email.subject,
                body: email.body,
                template_type: "first_touch",
                status: "draft",
                channel: "email",
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
        details: { source: "ai_search", category, location, leads_added: totalDiscovered },
      });
    }

    // Chain: Social Media Discovery
    try {
      const socialUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-discover`;
      await fetch(socialUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({}),
      });
      console.log("Social discovery triggered");
    } catch (e) {
      console.error("Failed to trigger social-discover:", e);
    }

    // Chain: Daily Outreach
    try {
      const outreachUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/daily-outreach`;
      await fetch(outreachUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({}),
      });
      console.log("Daily outreach triggered");
    } catch (e) {
      console.error("Failed to trigger daily-outreach:", e);
    }

    return new Response(
      JSON.stringify({ success: true, total_discovered: totalDiscovered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-discover error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
