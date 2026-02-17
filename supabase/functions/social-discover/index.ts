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

    let usersToProcess: any[] = [];
    try {
      const body = await req.json();
      if (body.user_id) {
        const { data } = await supabase.from("settings").select("*").eq("user_id", body.user_id).single();
        if (data) usersToProcess = [data];
      }
    } catch {
      // No body — cron mode
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
      const socialEnabled = (userSettings as any).social_discovery_enabled !== false;
      if (!socialEnabled) continue;

      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];
      if (categories.length === 0 || locations.length === 0) continue;

      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      // Search for Instagram/TikTok pages of businesses with NO separate website
      const platforms = [
        {
          name: "instagram",
          // Target IG pages where the bio has NO website link — phone/WhatsApp only businesses
          query: `site:instagram.com "${category}" "${location}" Kenya -".co.ke" -".com" phone OR WhatsApp OR "contact us"`,
        },
        {
          name: "tiktok",
          query: `site:tiktok.com "${category}" "${location}" Kenya business "no website" OR phone OR WhatsApp`,
        },
      ];

      for (const platform of platforms) {
        console.log(`Social discovery [${platform.name}] no-website filter: ${platform.query}`);

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

        // Strict no-website extraction prompt for social media
        const extractionPrompt = `You are extracting Kenyan business leads from ${platform.name} pages.

STRICT RULES — NO EXCEPTIONS:
1. ONLY extract businesses that have NO separate website of their own
2. If the bio, description, or any content shows a custom domain (e.g. "businessname.co.ke", "businessname.com", any website URL that is NOT instagram/tiktok/facebook/linktr.ee), set has_website: true — these will be SKIPPED
3. A business whose ENTIRE online presence is just this ${platform.name} page is our PERFECT TARGET
4. A linktree that only links to social pages (not a website domain) is acceptable
5. Extract phone numbers aggressively — WhatsApp numbers in bios are gold
6. Extract any emails visible in the bio or description
7. The ${platform.name} handle/username is the primary social identifier

Search results:
${results.map((r: any, i: number) => `
Result ${i + 1}:
URL: ${r.url}
Title: ${r.title || ""}
Description: ${r.description || ""}
Content: ${(r.markdown || "").substring(0, 600)}
`).join("\n")}

Target category: ${category}. Target location: ${location}, Kenya.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: `Extract ONLY businesses with NO website from ${platform.name} search results. Businesses relying solely on social media are ideal leads for web development services.` },
              { role: "user", content: extractionPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_social_businesses",
                description: "Extract no-website business leads from social media",
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
                          has_website: { type: "boolean" },
                          profile_url: { type: "string" },
                          bio_summary: { type: "string" },
                        },
                        required: ["business_name", "has_website"],
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

        // HARD FILTER — drop any business the AI flagged as having a website
        const noWebsiteBusinesses = businesses.filter(b => !b.has_website);
        console.log(`[${platform.name}] Extracted ${businesses.length}, ${noWebsiteBusinesses.length} passed no-website filter`);

        for (const biz of noWebsiteBusinesses) {
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

          // Build social_links
          const socialLinks: any = {};
          if (biz.profile_url) socialLinks[platform.name] = biz.profile_url;
          if (biz.handle) socialLinks[`${platform.name}_handle`] = biz.handle;

          const { data: newLead, error: leadError } = await supabase.from("leads").insert({
            user_id: userSettings.user_id,
            business_name: biz.business_name,
            category: biz.category || category,
            location: biz.location || location,
            phone: biz.phone || biz.whatsapp || null,
            email: biz.email || null,
            website_url: null,
            has_website: false,
            notes: biz.bio_summary || null,
            status: "qualified",
            discovery_source: platform.name,
            contact_channels: contactChannels.length > 0 ? contactChannels : null,
            social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
          }).select("id").single();

          if (leadError || !newLead) continue;
          totalDiscovered++;

          // Inline analysis
          try {
            const portfolioProjects = userSettings.portfolio_projects || [];
            const analysisPrompt = `Analyze this Kenyan business found on ${platform.name} with NO website.

Business: ${biz.business_name}
Category: ${biz.category || category}
Location: ${biz.location || location}
${platform.name} Handle: @${biz.handle || "unknown"}
Contact: phone=${biz.phone || "none"}, whatsapp=${biz.whatsapp || "none"}, email=${biz.email || "none"}
Bio: ${biz.bio_summary || "N/A"}

Their entire online presence is just a ${platform.name} page — no website at all.
This makes them an ideal target for web development services.

My portfolio: ${JSON.stringify(portfolioProjects)}

Priority score 1-10, pain points, solutions, matched portfolio.`;

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
          details: { source: "social_media", leads_added: totalDiscovered, platforms: ["instagram", "tiktok"], filter: "no_website_only" },
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
