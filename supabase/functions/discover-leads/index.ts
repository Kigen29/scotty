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
    .substring(0, maxLen);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
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

    const { category, location, query } = await req.json();

    // Fetch user's pipeline setting
    const { data: userSettings } = await supabase
      .from("settings")
      .select("discovery_pipeline")
      .eq("user_id", userId)
      .maybeSingle();

    const pipeline = (userSettings as any)?.discovery_pipeline || "firecrawl";
    console.log(`User ${userId} pipeline: ${pipeline}`);

    // Sanitize user inputs before use in prompts
    const safeCategory = sanitizeForPrompt(category);
    const safeLocation = sanitizeForPrompt(location);
    const safeQuery = sanitizeForPrompt(query, 300);

    // Build search terms
    const searchTerms = [];
    if (safeCategory) searchTerms.push(safeCategory);
    if (safeLocation) searchTerms.push(safeLocation);
    if (safeQuery) searchTerms.push(safeQuery);
    searchTerms.push("Kenya small business no website local");
    const searchQuery = searchTerms.join(" ");

    let results: any[] = [];
    let usedFirecrawl = false;

    // ── FIRECRAWL PIPELINE ──
    if (pipeline === "firecrawl") {
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (FIRECRAWL_API_KEY) {
        try {
          console.log("Searching Firecrawl for:", searchQuery);
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
          if (searchResponse.ok) {
            results = searchData.data || [];
            usedFirecrawl = true;
            console.log(`Firecrawl found ${results.length} results`);
          } else {
            console.warn("Firecrawl failed, falling back to AI:", searchData.error);
          }
        } catch (e) {
          console.warn("Firecrawl request failed, falling back to AI:", e);
        }
      } else {
        console.warn("No FIRECRAWL_API_KEY, falling back to AI");
      }
    }

    // Determine AI endpoint + key based on pipeline
    let aiUrl: string;
    let aiKey: string;
    let aiModel: string;

    if (pipeline === "openai") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured. Add it in Settings.");
      aiUrl = "https://api.openai.com/v1/chat/completions";
      aiKey = OPENAI_API_KEY;
      aiModel = "gpt-4o-mini";
      console.log("Using OpenAI pipeline (gpt-4o-mini)");
    } else {
      // lovable_ai or firecrawl (firecrawl uses Lovable AI for extraction)
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
      aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      aiKey = LOVABLE_API_KEY;
      aiModel = "google/gemini-3-flash-preview";
      console.log(`Using Lovable AI pipeline (${pipeline})`);
    }

    // Build extraction prompt
    const extractionPrompt = usedFirecrawl
      ? `You are analyzing web search results to extract Kenyan business leads.

CRITICAL RULES FOR has_website:
- ONLY set has_website to false if the business has ZERO web presence of its own.
- If the result URL is the business's OWN domain, set has_website to TRUE.
- If the business ONLY appears on directories with NO own website, set has_website to false.

CRITICAL RULES FOR email:
- EXTRACT every email address you can find.
- Also extract phone numbers.
- If no email is found, set email to an empty string, do NOT make one up.

CRITICAL RULES FOR quality:
- Skip large chains, franchises, or well-known brands.
- Only include actual businesses, not directory pages themselves.

Search results:
${results.map((r: any, i: number) => `
Result ${i + 1}:
URL: ${r.url}
Title: ${r.title || ""}
Description: ${r.description || ""}
Content: ${(r.markdown || "").substring(0, 800)}
`).join("\n")}

Extract businesses and return them using the extract_businesses function.
Category should be: ${safeCategory || "general"}.
Location should default to: ${safeLocation || "Kenya"}.`
      : `You are a local business researcher specializing in Kenyan small businesses.

Your task: Find REAL small businesses in the category "${category || "general"}" located in "${location || "Kenya"}" that do NOT have their own website.

IMPORTANT RULES:
- Focus on REAL businesses that exist in Kenya.
- Prioritize businesses you'd find on Google Maps listings, Facebook pages, or local directories but that have NO website.
- EVERY business MUST have either a phone number or email. Prefer businesses with email addresses.
- For phone numbers, use Kenyan format (+254...).
- Set has_website to false for all results.
- Include 5-8 realistic businesses.
- Do NOT invent email addresses — only include if you're confident it's real.

Extract businesses and return them using the extract_businesses function.
Category: ${safeCategory || "general"}.
Location: ${safeLocation || "Kenya"}.`;

    const aiResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: "You extract structured business data from search results." },
          { role: "user", content: extractionPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_businesses",
              description: "Extract business leads from search results",
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
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_businesses" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI extraction failed (${pipeline})`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let businesses: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        businesses = parsed.businesses || [];
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    console.log(`AI extracted ${businesses.length} businesses`);

    // Insert leads
    let leadsAdded = 0;
    for (const biz of businesses) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .eq("business_name", biz.business_name)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase.from("leads").insert({
          user_id: userId,
          business_name: biz.business_name,
          category: biz.category || category || null,
          location: biz.location || location || null,
          phone: biz.phone || null,
          email: biz.email || null,
          website_url: biz.website_url || null,
          has_website: biz.has_website ?? false,
          notes: biz.notes || null,
          status: "discovered",
          discovery_source: pipeline === "firecrawl" && usedFirecrawl ? "web" : "ai_search",
        });

        if (!insertError) leadsAdded++;
        else console.error("Insert error:", insertError.message);
      }
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "leads_discovered",
      details: { category, location, pipeline, results_found: results.length, leads_added: leadsAdded },
    });

    return new Response(
      JSON.stringify({ success: true, leads_added: leadsAdded, results_found: results.length, pipeline }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("discover-leads error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
