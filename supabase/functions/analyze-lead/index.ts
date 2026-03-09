import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function computeICPScore(lead: any, icp: any): number {
  let score = 0;
  let maxScore = 0;

  // Industry match
  const wIndustry = icp.weight_industry || 3;
  maxScore += wIndustry;
  if (icp.industries?.length && lead.category) {
    const cat = lead.category.toLowerCase();
    if (icp.industries.some((ind: string) => cat.includes(ind.toLowerCase()) || ind.toLowerCase().includes(cat))) {
      score += wIndustry;
    }
  } else if (!icp.industries?.length) {
    score += wIndustry; // no preference = full score
  }

  // Location match
  const wLocation = icp.weight_location || 2;
  maxScore += wLocation;
  if (icp.locations?.length && lead.location) {
    const loc = lead.location.toLowerCase();
    if (icp.locations.some((l: string) => loc.includes(l.toLowerCase()) || l.toLowerCase().includes(loc))) {
      score += wLocation;
    }
  } else if (!icp.locations?.length) {
    score += wLocation;
  }

  // No website
  const wNoWebsite = icp.weight_no_website || 4;
  maxScore += wNoWebsite;
  const pref = icp.has_website_preference || "no_website";
  if (pref === "no_website" && !lead.has_website) {
    score += wNoWebsite;
  } else if (pref === "poor_website") {
    score += lead.has_website ? Math.floor(wNoWebsite * 0.7) : wNoWebsite;
  } else if (pref === "any") {
    score += wNoWebsite;
  }

  // Has email
  const wEmail = icp.weight_has_email || 3;
  maxScore += wEmail;
  if (lead.email) score += wEmail;

  // Normalize to 1-10
  return maxScore > 0 ? Math.max(1, Math.round((score / maxScore) * 10)) : 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user_id = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user settings and active ICP in parallel
    const [settingsRes, icpRes] = await Promise.all([
      supabase.from("settings").select("portfolio_projects").eq("user_id", user_id).maybeSingle(),
      supabase.from("icp_profiles").select("*").eq("user_id", user_id).eq("is_active", true).maybeSingle(),
    ]);

    const portfolioProjects = settingsRes.data?.portfolio_projects || [];
    const icpProfile = icpRes.data;

    // Compute ICP score if profile exists
    let icpScore: number | null = null;
    if (icpProfile) {
      icpScore = computeICPScore(lead, icpProfile);
    }

    // Optionally scrape the lead's URL for more context
    let scrapedContent = "";
    if (FIRECRAWL_API_KEY && lead.website_url) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: lead.website_url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          scrapedContent = (scrapeData.data?.markdown || scrapeData.markdown || "").substring(0, 1500);
        }
      } catch (e) {
        console.error("Scrape failed:", e);
      }
    }

    // Use AI to analyze the lead
    const analysisPrompt = `Analyze this business lead and provide intelligence for a web developer doing outreach.

Business: ${lead.business_name}
Category: ${lead.category || "Unknown"}
Location: ${lead.location || "Kenya"}
Has Website: ${lead.has_website ? "Yes" : "No"}
Website URL: ${lead.website_url || "None"}
Email: ${lead.email || "None"}
Phone: ${lead.phone || "None"}
Notes: ${lead.notes || "None"}
${icpScore !== null ? `ICP Match Score: ${icpScore}/10` : ""}

${scrapedContent ? `Scraped website content:\n${scrapedContent}` : ""}

My portfolio projects for reference:
${JSON.stringify(portfolioProjects, null, 2)}

Provide:
1. Specific pain points this business likely has (related to not having / having a poor website)
2. Recommended solutions you'd propose
3. Which of my portfolio projects are most relevant and why
4. A priority score from 1-10 based on: no website (high priority), has email (can contact), business size signals, industry fit for web dev services`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                pain_points: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific pain points for this business",
                },
                recommended_solutions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Solutions to propose",
                },
                matched_portfolio: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["url", "reason"],
                    additionalProperties: false,
                  },
                  description: "Portfolio projects that are relevant",
                },
                priority_score: {
                  type: "integer",
                  description: "1-10 priority score",
                },
                summary: {
                  type: "string",
                  description: "Brief summary of the analysis",
                },
              },
              required: ["pain_points", "recommended_solutions", "matched_portfolio", "priority_score", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_lead" } },
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return analysis");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Update lead with analysis + ICP score
    const updatePayload: any = {
      analysis,
      priority_score: Math.min(10, Math.max(1, analysis.priority_score || 5)),
    };
    if (icpScore !== null) {
      updatePayload.icp_score = icpScore;
    }

    await supabase.from("leads").update(updatePayload).eq("id", lead_id);

    return new Response(
      JSON.stringify({ success: true, analysis, icp_score: icpScore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-lead error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
