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

    // Build search query for Firecrawl
    const searchTerms = [];
    if (category) searchTerms.push(category);
    if (location) searchTerms.push(location);
    if (query) searchTerms.push(query);
    searchTerms.push("Kenya small business no website local");

    const searchQuery = searchTerms.join(" ");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    console.log("Searching with Firecrawl:", searchQuery);

    // Search for businesses using Firecrawl
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
      console.error("Firecrawl search error:", searchData);
      throw new Error(searchData.error || "Firecrawl search failed");
    }

    const results = searchData.data || [];
    console.log(`Found ${results.length} search results`);

    // Use AI to extract business info from search results
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const extractionPrompt = `You are analyzing web search results to extract Kenyan business leads.

CRITICAL RULES FOR has_website:
- ONLY set has_website to false if the business has ZERO web presence of its own (no domain, no website at all).
- If the result URL is the business's OWN domain (e.g. businessname.co.ke, businessname.com), set has_website to TRUE.
- If the business is found on a directory (Google Maps, Yellow Pages, Facebook page, Jumia, etc.) BUT you can see they also have their own website linked or mentioned, set has_website to TRUE.
- If the business ONLY appears on directories with NO own website mentioned anywhere, set has_website to false.
- When in doubt, set has_website to true. We want ACCURACY over volume.

CRITICAL RULES FOR email:
- EXTRACT every email address you can find in the content, title, or description.
- Look carefully in the markdown content for patterns like name@domain.com, info@, contact@, etc.
- Also extract phone numbers — these are very important for leads without email.
- If no email is found, set email to an empty string, do NOT make one up.

CRITICAL RULES FOR quality:
- Skip large chains, franchises, or well-known brands.
- Only include actual businesses, not the directory pages themselves.
- Include the business location as specifically as possible (neighborhood, town).

Search results:
${results.map((r: any, i: number) => `
Result ${i + 1}:
URL: ${r.url}
Title: ${r.title || ""}
Description: ${r.description || ""}
Content: ${(r.markdown || "").substring(0, 800)}
`).join("\n")}

Extract businesses and return them using the extract_businesses function.
Category should be: ${category || "general"}.
Location should default to: ${location || "Kenya"}.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error("AI extraction failed");
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

    // Insert leads into database (skip duplicates by business_name)
    let leadsAdded = 0;
    for (const biz of businesses) {
      // Check for existing lead with same name for this user
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
        });

        if (!insertError) leadsAdded++;
        else console.error("Insert error:", insertError.message);
      }
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "leads_discovered",
      details: { category, location, query: searchQuery, results_found: results.length, leads_added: leadsAdded },
    });

    return new Response(
      JSON.stringify({ success: true, leads_added: leadsAdded, results_found: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("discover-leads error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
