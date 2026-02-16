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

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!FIRECRAWL_API_KEY || !LOVABLE_API_KEY) {
      throw new Error("Missing required API keys");
    }

    // Can be called with specific params or as cron (processes all autonomous users)
    let usersToProcess: any[] = [];
    try {
      const body = await req.json();
      if (body.user_id) {
        const { data } = await supabase.from("settings").select("*").eq("user_id", body.user_id).single();
        if (data) usersToProcess = [data];
      }
    } catch {
      // No body — cron mode, get all autonomous users
    }

    if (usersToProcess.length === 0) {
      const { data: allSettings } = await supabase
        .from("settings")
        .select("*")
        .eq("is_autonomous", true);
      usersToProcess = allSettings || [];
    }

    let totalDiscovered = 0;

    for (const userSettings of usersToProcess) {
      // Check if social discovery is enabled (default true for backwards compat)
      const socialEnabled = (userSettings as any).social_discovery_enabled !== false;
      if (!socialEnabled) continue;

      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];
      if (categories.length === 0 || locations.length === 0) continue;

      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      // Search Instagram and TikTok
      const platforms = [
        { name: "instagram", query: `site:instagram.com ${category} ${location} Kenya business` },
        { name: "tiktok", query: `site:tiktok.com ${category} ${location} Kenya business` },
      ];

      for (const platform of platforms) {
        console.log(`Social discovery [${platform.name}]: ${platform.query}`);

        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: platform.query,
            limit: 8,
            lang: "en",
            country: "ke",
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        const searchData = await searchResponse.json();
        if (!searchResponse.ok) {
          console.error(`Firecrawl error [${platform.name}]:`, searchData);
          continue;
        }

        const results = searchData.data || [];
        if (results.length === 0) continue;

        // AI extraction for social media leads
        const extractionPrompt = `Analyze these ${platform.name} search results and extract Kenyan business leads.

These are ${platform.name} profiles/pages of businesses. Extract:
- Business name
- ${platform.name} handle/username
- Any contact info visible (email in bio, phone, WhatsApp link)
- Business category and location
- Whether they have a separate website mentioned

Search results:
${results.map((r: any, i: number) => `
Result ${i + 1}:
URL: ${r.url}
Title: ${r.title || ""}
Description: ${r.description || ""}
Content: ${(r.markdown || "").substring(0, 600)}
`).join("\n")}

Category: ${category}. Location: ${location}.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Extract structured business data from social media search results." },
              { role: "user", content: extractionPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_social_businesses",
                description: "Extract business leads from social media",
                parameters: {
                  type: "object",
                  properties: {
                    businesses: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          business_name: { type: "string" },
                          handle: { type: "string" },
                          category: { type: "string" },
                          location: { type: "string" },
                          phone: { type: "string" },
                          email: { type: "string" },
                          whatsapp: { type: "string" },
                          website_url: { type: "string" },
                          has_website: { type: "boolean" },
                          profile_url: { type: "string" },
                          bio_summary: { type: "string" },
                          linkedin_url: { type: "string" },
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
            tool_choice: { type: "function", function: { name: "extract_social_businesses" } },
          }),
        });

        if (!aiResponse.ok) {
          console.error(`AI error [${platform.name}]:`, await aiResponse.text());
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

        for (const biz of businesses) {
          const { data: existing } = await supabase
            .from("leads")
            .select("id")
            .eq("user_id", userSettings.user_id)
            .eq("business_name", biz.business_name)
            .maybeSingle();
          if (existing) continue;

          // Build contact_channels
          const contactChannels: any[] = [];
          if (biz.email) contactChannels.push({ type: "email", value: biz.email });
          if (biz.phone) contactChannels.push({ type: "phone", value: biz.phone });
          if (biz.whatsapp) contactChannels.push({ type: "whatsapp", value: biz.whatsapp });
          if (biz.handle) contactChannels.push({ type: `${platform.name}_dm`, handle: biz.handle });
          if (biz.linkedin_url) contactChannels.push({ type: "linkedin", url: biz.linkedin_url });

          // Build social_links
          const socialLinks: any = {};
          if (biz.profile_url) socialLinks[platform.name] = biz.profile_url;
          if (biz.linkedin_url) socialLinks.linkedin = biz.linkedin_url;

          const { data: newLead, error: leadError } = await supabase.from("leads").insert({
            user_id: userSettings.user_id,
            business_name: biz.business_name,
            category: biz.category || category,
            location: biz.location || location,
            phone: biz.phone || null,
            email: biz.email || null,
            website_url: biz.website_url || null,
            has_website: biz.has_website ?? false,
            notes: biz.bio_summary || null,
            status: "qualified",
            discovery_source: platform.name,
            contact_channels: contactChannels,
            social_links: socialLinks,
          }).select("id").single();

          if (leadError || !newLead) continue;
          totalDiscovered++;

          // Inline analysis
          try {
            const portfolioProjects = userSettings.portfolio_projects || [];
            const analysisPrompt = `Analyze this business lead found on ${platform.name}.

Business: ${biz.business_name}
Category: ${biz.category || category}
Location: ${biz.location || location}
Has Website: ${biz.has_website ? "Yes" : "No"}
Social Handle: @${biz.handle || "unknown"}
Contact channels: ${JSON.stringify(contactChannels)}
Bio: ${biz.bio_summary || "N/A"}

My portfolio: ${JSON.stringify(portfolioProjects)}

Provide priority score 1-10, pain points, solutions, and matched portfolio.`;

            const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: "You are a business intelligence analyst." },
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
                await supabase.from("leads").update({
                  analysis,
                  priority_score: Math.min(10, Math.max(1, analysis.priority_score || 5)),
                }).eq("id", newLead.id);
              }
            }
          } catch (err) {
            console.error(`Analysis failed for ${biz.business_name}:`, err);
          }
        }
      }

      // Log activity
      if (totalDiscovered > 0) {
        await supabase.from("activity_logs").insert({
          user_id: userSettings.user_id,
          action: "auto_discovery",
          details: { source: "social_media", leads_added: totalDiscovered, platforms: ["instagram", "tiktok"] },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total_discovered: totalDiscovered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("social-discover error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
