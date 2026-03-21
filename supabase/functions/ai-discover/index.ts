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
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/you\s+are\s+now/gi, "[filtered]")
    .replace(/disregard\s+(all\s+)?above/gi, "[filtered]")
    .replace(/forget\s+(all\s+)?prior/gi, "[filtered]")
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

    // Accept optional pipeline param from caller (auto-discover)
    let requestedPipeline = "lovable_ai";
    try {
      const body = await req.json();
      if (body?.pipeline) requestedPipeline = body.pipeline;
    } catch { /* no body, default to lovable_ai */ }

    // Determine AI endpoint
    let aiUrl: string;
    let aiKey: string;
    let aiModel: string;

    if (requestedPipeline === "openai") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
      aiUrl = "https://api.openai.com/v1/chat/completions";
      aiKey = OPENAI_API_KEY;
      aiModel = "gpt-4o-mini";
      console.log("ai-discover using OpenAI pipeline");
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");
      aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      aiKey = LOVABLE_API_KEY;
      aiModel = "google/gemini-2.5-flash";
      console.log("ai-discover using Lovable AI pipeline");
    }

    let settingsQuery = supabase.from("settings").select("*").eq("is_autonomous", true);
    if (scopedUserId) settingsQuery = settingsQuery.eq("user_id", scopedUserId);
    const { data: allSettings } = await settingsQuery;

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No autonomous users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDiscovered = 0;

    // Kenyan neighborhood/area lists for variety
    const areasByCity: Record<string, string[]> = {
      "Nairobi": ["Westlands", "Kilimani", "Ngong Road", "Eastleigh", "Gikomba", "Kawangware", "Kibera", "Lang'ata", "Karen", "South B", "South C", "Umoja", "Donholm", "Buruburu", "Pangani", "Parklands", "Lavington", "Hurlingham", "CBD", "River Road", "Tom Mboya St", "Kenyatta Market", "Toi Market", "Githurai", "Kasarani", "Roysambu", "Zimmerman", "Kahawa", "Ruaka", "Rongai", "Kitengela", "Mlolongo", "Athi River", "Embakasi", "Pipeline", "Utawala", "Ruai", "Kangemi", "Mountain View", "Dagoretti"],
      "Mombasa": ["Nyali", "Bamburi", "Kisauni", "Likoni", "Changamwe", "Majengo", "Old Town", "Ganjoni", "Kizingo", "Tudor", "Mikindani", "Jomvu", "Miritini", "Magongo", "Kongowea", "Bombolulu"],
      "Kisumu": ["Milimani", "Kondele", "Nyalenda", "Mamboleo", "Kibos", "Lolwe", "Obunga", "Bandani", "Nyamasaria", "Tom Mboya Estate", "Migosi", "Ogango", "Riat"],
      "Nakuru": ["Milimani", "Section 58", "Shabab", "Kaptembwa", "London", "Freehold", "Lanet", "Bondeni", "Langa Langa", "Whitehouse", "Pipeline", "Flamingo"],
      "Eldoret": ["Langas", "Huruma", "Kapseret", "Kimumu", "Pioneer", "West Indies", "Elgon View", "Kapsoya", "Annex", "Munyaka", "Kipkaren"],
    };

    const subCategories: Record<string, string[]> = {
      "restaurants": ["nyama choma joints", "local cafes", "juice bars", "street food stalls", "fish restaurants", "chapati houses", "roast chicken outlets", "pilau joints", "githeri spots", "fast food kiosks"],
      "salons": ["barbershops", "beauty parlors", "hair braiding shops", "nail studios", "dreadlock salons", "kids haircut shops", "traditional salons", "spa and beauty centers"],
      "hardware stores": ["paint shops", "plumbing suppliers", "electrical shops", "timber yards", "glass shops", "welding workshops", "building material stores", "tool shops"],
      "clinics": ["dental clinics", "pharmacies", "optical shops", "physiotherapy centers", "herbal medicine shops", "veterinary clinics", "lab and diagnostics", "maternity homes"],
      "retail shops": ["electronics shops", "phone repair shops", "clothing boutiques", "shoe shops", "gift shops", "bookshops", "cosmetics shops", "fabric stores", "auto parts dealers", "stationery shops"],
    };

    for (const userSettings of allSettings) {
      const categories = userSettings.target_categories || [];
      const locations = userSettings.target_locations || [];
      if (categories.length === 0 || locations.length === 0) continue;

      const category = categories[Math.floor(Math.random() * categories.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      const subs = subCategories[category] || [];
      const subCategory = subs.length > 0 ? subs[Math.floor(Math.random() * subs.length)] : category;

      const areas = areasByCity[location] || [];
      const area = areas.length > 0 ? areas[Math.floor(Math.random() * areas.length)] : "";

      const portfolioProjects = userSettings.portfolio_projects || [];

      // Fetch existing lead names to avoid duplicates
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("business_name")
        .eq("user_id", userSettings.user_id)
        .eq("category", category)
        .limit(200);
      const existingNames = (existingLeads || []).map((l: any) => l.business_name);

      console.log(`AI discovery for user ${userSettings.user_id}: ${subCategory} (${category}) in ${area ? area + ", " : ""}${location} — ${existingNames.length} existing leads to avoid`);

      const areaInstruction = area
        ? `Focus specifically on the **${area}** area/neighborhood of ${location}.`
        : `Pick a specific neighborhood or commercial street in ${location} to focus on.`;

      const discoveryPrompt = `You are a local business researcher in Kenya. Your job is to identify REAL small businesses in ${location}, Kenya that are "${subCategory}" (broader category: ${category}) and have NO website.

${areaInstruction}

These businesses typically:
- Only have a Google Maps / Google Business Profile listing
- Rely on word-of-mouth, foot traffic, or social media (Facebook page, Instagram)
- Have a phone number painted on their shopfront or listed on Google Maps
- Are small, independently owned shops or service providers
- Do NOT have a .co.ke, .com, or any custom domain website

Think about the specific streets and commercial areas in ${area ? area + ", " + location : location} where ${subCategory} businesses operate.

Generate 5-8 realistic business leads that match this profile. For each business:
- Use realistic Kenyan business naming conventions (e.g., "[Owner's Name] [Business Type]", "[Location] [Business Type]", etc.)
- Use realistic Kenyan phone number formats (+254 7XX XXX XXX)
- Include a plausible physical address or area description
- If you know of actual businesses fitting this profile, include them
- Only include businesses you're reasonably confident do NOT have a website

${existingNames.length > 0 ? `**CRITICAL: The following businesses are ALREADY in our database. Do NOT include any of them or any variation of their names:**
${existingNames.slice(0, 100).join(", ")}

Generate COMPLETELY DIFFERENT businesses that are NOT on this list.` : ""}

**CRITICAL: EMAIL ADDRESSES ARE THE MOST IMPORTANT FIELD.** Try to find or infer email addresses for every business.

Businesses with email addresses are 10x more valuable. Prioritize finding businesses that have publicly listed email addresses.

IMPORTANT: Do NOT invent businesses that are likely to have websites. Skip chains, franchises, and large establishments.`;

      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
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

Business: ${sanitizeForPrompt(biz.business_name)}
Category: ${sanitizeForPrompt(biz.category || category)}
Location: ${sanitizeForPrompt(biz.location || location)}
Address: ${sanitizeForPrompt(biz.address) || "Unknown"}
Phone: ${sanitizeForPrompt(biz.phone) || "None"}
Email: ${sanitizeForPrompt(biz.email) || "None"}

This business has NO website — they rely entirely on word of mouth and foot traffic.

My portfolio projects:
${JSON.stringify(portfolioProjects, null, 2)}

Provide:
1. Pain points from having no website
2. Specific website features they would benefit from
3. Which portfolio projects to reference and why
4. Priority score 1-10`;

          const analysisResponse = await fetch(aiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${aiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiModel,
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
          const emailPrompt = `You are Emmanuel Kigen, a freelance web developer reaching out to ${sanitizeForPrompt(biz.business_name)}, a ${sanitizeForPrompt(biz.category || category)} business in ${sanitizeForPrompt(biz.location || location)}, Kenya.

They have NO website — only word of mouth and foot traffic. Write a compelling, personal cold email:
- Reference their specific business type and location
- Explain how a website would help them get more customers
- Present yourself as a local freelance web developer: ${services}
- Keep it warm, genuine, and concise
- End with a soft CTA — suggest a quick WhatsApp chat or phone call
- Sign off as Emmanuel Kigen
${signature ? `- Signature: ${signature}` : ""}`;

          const emailResponse = await fetch(aiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${aiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiModel,
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
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
