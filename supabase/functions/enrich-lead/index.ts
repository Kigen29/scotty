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
    .replace(/you\s+are\s+now/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/\bprompt\s*:/gi, "[filtered]")
    .replace(/\bassistant\s*:/gi, "[filtered]")
    .substring(0, maxLen);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { lead_ids } = await req.json();
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return new Response(JSON.stringify({ error: "lead_ids array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = lead_ids.slice(0, 10); // Max 10 per request

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .in("id", ids)
      .eq("user_id", userId);

    if (leadsError || !leads?.length) {
      return new Response(JSON.stringify({ error: "No leads found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const results: any[] = [];

    for (const lead of leads) {
      try {
        const prompt = `Research and enrich this business lead with additional intelligence.

Business: ${sanitizeForPrompt(lead.business_name)}
Category: ${sanitizeForPrompt(lead.category) || "Unknown"}
Location: ${sanitizeForPrompt(lead.location) || "Kenya"}
Phone: ${sanitizeForPrompt(lead.phone) || "None"}
Email: ${sanitizeForPrompt(lead.email) || "None"}
Website: ${sanitizeForPrompt(lead.website_url) || "None"}
Has Website: ${lead.has_website ? "Yes" : "No"}
Notes: ${sanitizeForPrompt(lead.notes, 500) || "None"}

Based on your knowledge of businesses in East Africa, provide enrichment data.
For unknown fields, make reasonable estimates based on the business type and location, but mark them as estimated.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a business intelligence researcher specializing in East African markets. Provide enrichment data for business leads." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "enrich_lead",
                description: "Provide enrichment data for a business lead",
                parameters: {
                  type: "object",
                  properties: {
                    estimated_size: {
                      type: "string",
                      enum: ["micro", "small", "medium", "large"],
                      description: "Estimated business size: micro (1-5 employees), small (6-20), medium (21-100), large (100+)",
                    },
                    estimated_revenue: {
                      type: "string",
                      description: "Estimated annual revenue range (e.g. 'KES 1M-5M')",
                    },
                    decision_maker: {
                      type: "object",
                      properties: {
                        likely_title: { type: "string", description: "Likely title of decision maker (e.g. 'Owner', 'Manager')" },
                        approach_tip: { type: "string", description: "Best way to approach this person" },
                      },
                      required: ["likely_title", "approach_tip"],
                      additionalProperties: false,
                    },
                    tech_stack: {
                      type: "array",
                      items: { type: "string" },
                      description: "Likely tech they use (e.g. 'WhatsApp Business', 'M-Pesa', 'Instagram')",
                    },
                    digital_maturity: {
                      type: "string",
                      enum: ["none", "basic", "moderate", "advanced"],
                      description: "Level of digital presence/adoption",
                    },
                    competitors: {
                      type: "array",
                      items: { type: "string" },
                      description: "Similar businesses in the area that have websites (for comparison in pitch)",
                    },
                    pitch_angles: {
                      type: "array",
                      items: { type: "string" },
                      description: "Specific angles to use in outreach based on enrichment",
                    },
                    confidence: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                      description: "Confidence level of the enrichment data",
                    },
                  },
                  required: ["estimated_size", "estimated_revenue", "decision_maker", "tech_stack", "digital_maturity", "competitors", "pitch_angles", "confidence"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "enrich_lead" } },
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            results.push({ id: lead.id, status: "rate_limited" });
            // Wait a bit before next request
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`AI enrichment failed: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) {
          results.push({ id: lead.id, status: "no_data" });
          continue;
        }

        const enrichment = JSON.parse(toolCall.function.arguments);

        // Merge enrichment into existing analysis
        const existingAnalysis = (lead.analysis as any) || {};
        const updatedAnalysis = {
          ...existingAnalysis,
          enrichment,
          enriched_at: new Date().toISOString(),
        };

        await supabase.from("leads").update({ analysis: updatedAnalysis }).eq("id", lead.id);
        results.push({ id: lead.id, status: "enriched", enrichment });

      } catch (e) {
        console.error(`Enrichment failed for ${lead.id}:`, e);
        results.push({ id: lead.id, status: "error" });
      }
    }

    const enriched = results.filter((r) => r.status === "enriched").length;

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "leads_enriched",
      details: { count: enriched, lead_ids: ids },
    });

    return new Response(
      JSON.stringify({ success: true, enriched, total: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("enrich-lead error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
