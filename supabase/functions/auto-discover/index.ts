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

  // Auth: require cron secret or valid JWT (JWT scoped to calling user only)
  let scopedUserId: string | null = null;
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET || CRON_SECRET.length < 16 || cronSecret !== CRON_SECRET) {
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
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

    let settingsQuery = supabase.from("settings").select("*").eq("is_autonomous", true);
    if (scopedUserId) settingsQuery = settingsQuery.eq("user_id", scopedUserId);
    const { data: allSettings } = await settingsQuery;

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("Missing LOVABLE_API_KEY");
    }

    let totalDiscovered = 0;

    for (const userSettings of allSettings) {
      // Pipeline routing: check if user wants AI discovery instead of Firecrawl
      const pipeline = (userSettings as any).discovery_pipeline || "firecrawl";
      if (pipeline === "lovable_ai" || pipeline === "openai") {
        console.log(`User ${userSettings.user_id} uses ${pipeline} pipeline — delegating to ai-discover`);
        try {
          const aiDiscoverUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-discover`;
          await fetch(aiDiscoverUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ pipeline }),
          });
        } catch (e) {
          console.error("Failed to call ai-discover:", e);
        }
        continue;
      }

      // Firecrawl pipeline requires API key
      if (!FIRECRAWL_API_KEY) {
        console.error("FIRECRAWL_API_KEY not configured, skipping Firecrawl pipeline");
        continue;
      }
      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];

      if (categories.length === 0 || locations.length === 0) continue;

      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      // Rotate through 3 GBP-focused query patterns targeting businesses with NO website
      const queryIndex = Math.floor(Math.random() * 3);
      const searchQueries = [
        `"${category}" "${location}" Kenya "Google Maps" -site:*.co.ke -site:*.com -site:*.org`,
        `"${category} ${location} Kenya" small business phone contact -inurl:.co.ke -inurl:.com`,
        `"${category} near ${location}" Kenya "call us" OR "WhatsApp" OR "visit us" -site:*.co.ke`,
      ];
      const searchQuery = searchQueries[queryIndex];

      console.log(`GBP discovery [query ${queryIndex + 1}] for user ${userSettings.user_id}: ${searchQuery}`);

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
      if (results.length === 0) continue;

      // Strict GBP-focused extraction prompt — no-website businesses ONLY
      const extractionPrompt = `You are extracting Kenyan business leads from Google Maps / Google Business Profile search results.

STRICT RULES — NO EXCEPTIONS:
1. ONLY extract businesses that have NO website of their own
2. If a result shows a business domain (e.g. "businessname.co.ke", "businessname.com", any custom domain), set has_website: true — these will be SKIPPED entirely
3. Acceptable sources for a valid lead: Google Maps listing, Yellow Pages, Facebook page, Yelp, local directory only
4. A business whose only online presence is a Google Maps pin / Google Business Profile is our PERFECT TARGET
5. Extract phone numbers aggressively — this is the primary contact method
6. Extract any email addresses visible in the listing or description
7. Store the Google Maps URL in google_maps_url field (maps.google.com or goo.gl/maps links)
8. Extract the street/physical address into the address field
9. Skip large chains, franchises, and any business with a professional website

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
            { role: "system", content: "You are a lead extraction specialist. Extract ONLY businesses with NO website from Google Business Profile / Google Maps search results." },
            { role: "user", content: extractionPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_businesses",
              description: "Extract no-website business leads from Google Maps results",
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
                        address: { type: "string" },
                        phone: { type: "string" },
                        email: { type: "string" },
                        has_website: { type: "boolean" },
                        google_maps_url: { type: "string" },
                        notes: { type: "string" },
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

        // HARD FILTER — code-level enforcement, no exceptions
        const noWebsiteBusinesses = businesses.filter(b => !b.has_website);
        console.log(`Extracted ${businesses.length} businesses, ${noWebsiteBusinesses.length} passed no-website filter`);

        const services = userSettings.services?.join(", ") || "web development, mobile apps, and digital solutions";
        const portfolio = userSettings.portfolio_links?.join(", ") || "";
        const signature = userSettings.email_signature || "Best regards,\nEmmanuel Kigen";

        for (const biz of noWebsiteBusinesses) {
          // Skip leads with no contact info at all — can't reach them
          if (!biz.phone && !biz.email) {
            console.log(`Skipping ${biz.business_name} — no contact info`);
            continue;
          }
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userSettings.user_id)
          .eq("business_name", biz.business_name)
          .maybeSingle();

        if (existing) continue;

        // Build social_links with google_maps_url
        const socialLinks: any = {};
        if (biz.google_maps_url) socialLinks.google_maps = biz.google_maps_url;

        // Build contact_channels
        const contactChannels: any[] = [];
        if (biz.phone) contactChannels.push({ type: "phone", value: biz.phone });
        if (biz.email) contactChannels.push({ type: "email", value: biz.email });

        // Compose notes with address + any extra info
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
          discovery_source: "google_maps",
          contact_channels: contactChannels.length > 0 ? contactChannels : null,
          social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
        }).select("id").single();

        if (leadError || !newLead) continue;
        totalDiscovered++;

        // Inline lead analysis
        let analysis: any = null;
        try {
          const portfolioProjects = userSettings.portfolio_projects || [];
          const analysisPrompt = `Analyze this Kenyan business found on Google Maps with NO website.

Business: ${sanitizeForPrompt(biz.business_name)}
Category: ${sanitizeForPrompt(biz.category || category)}
Location: ${sanitizeForPrompt(biz.location || location)}
Address: ${sanitizeForPrompt(biz.address) || "Unknown"}
Phone: ${sanitizeForPrompt(biz.phone) || "None"}
Email: ${sanitizeForPrompt(biz.email) || "None"}
Google Maps: ${sanitizeForPrompt(biz.google_maps_url) || "None"}

This business has NO website — they rely entirely on word of mouth and foot traffic.
They are our IDEAL target for web development services.

My portfolio projects:
${JSON.stringify(portfolioProjects, null, 2)}

Provide:
1. Pain points from having no website (lost customers, no online bookings, no credibility, etc.)
2. Specific website features they would benefit from
3. Which portfolio projects to reference and why
4. Priority score 1-10 (no website + phone only = high priority, has email too = higher)`;

          const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
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
              analysis = JSON.parse(analysisToolCall.function.arguments);
              await supabase.from("leads").update({
                analysis,
                priority_score: Math.min(10, Math.max(1, analysis.priority_score || 5)),
              }).eq("id", newLead.id);
              console.log(`Analyzed ${biz.business_name}: score ${analysis.priority_score}`);
            }
          }
        } catch (analysisErr) {
          console.error(`Analysis failed for ${biz.business_name}:`, analysisErr);
        }

        // Only generate email if lead has an email address
        if (!biz.email) continue;

        const painPointsText = analysis?.pain_points?.length
          ? `\nKey pain points identified:\n${analysis.pain_points.map((p: string) => `- ${p}`).join("\n")}`
          : "";
        const solutionsText = analysis?.recommended_solutions?.length
          ? `\nSolutions to propose:\n${analysis.recommended_solutions.map((s: string) => `- ${s}`).join("\n")}`
          : "";
        const portfolioMatchText = analysis?.matched_portfolio?.length
          ? `\nRelevant portfolio examples to mention:\n${analysis.matched_portfolio.map((p: any) => `- ${p.url}: ${p.reason}`).join("\n")}`
          : portfolio ? `- Mention your portfolio: ${portfolio}` : "";

        const emailPrompt = `You are Emmanuel Kigen, a freelance web developer reaching out to ${biz.business_name}, a ${biz.category || category} business in ${biz.location || location}, Kenya.

They have NO website — only a Google Maps listing. This means they're losing customers to competitors online every day.

Write a compelling, personal cold email:
- Reference their specific business type and location
- Explain how a website would help them get more customers and appear professional
- Present yourself as a local freelance web developer: ${services}
${painPointsText}
${solutionsText}
${portfolioMatchText}
- Keep it warm, genuine, and concise (not a template blast)
- End with a soft CTA — suggest a quick WhatsApp chat or phone call
- Sign off as Emmanuel Kigen
${signature ? `- Signature: ${signature}` : ""}`;

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
        details: { source: "google_maps", category, location, leads_added: totalDiscovered, query_pattern: queryIndex + 1 },
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
    console.error("auto-discover error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
