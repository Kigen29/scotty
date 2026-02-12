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

    const { lead_id, message } = await req.json();
    if (!lead_id || !message) {
      return new Response(JSON.stringify({ error: "lead_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("user_id", userId)
      .single();

    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get previous conversation context
    const { data: prevMessages } = await supabase
      .from("conversations")
      .select("direction, message")
      .eq("lead_id", lead_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(10);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const classifyPrompt = `Classify this business reply and draft an appropriate response.

Business: ${lead.business_name} (${lead.category || "business"} in ${lead.location || "Kenya"})

Previous conversation:
${(prevMessages || []).map((m) => `${m.direction === "outbound" ? "You" : "Them"}: ${m.message}`).join("\n")}

New reply from them: "${message}"

Classify the response and generate a reply as Emmanuel Kigen, freelance web developer.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You classify business responses and draft appropriate replies for Emmanuel Kigen, a freelance web developer." },
          { role: "user", content: classifyPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_and_reply",
            description: "Classify the response and draft a reply",
            parameters: {
              type: "object",
              properties: {
                classification: {
                  type: "string",
                  enum: ["interested", "questions", "not_now", "not_interested", "objection"],
                  description: "Classification of the response",
                },
                suggested_reply: {
                  type: "string",
                  description: "Draft reply to send",
                },
                lead_status: {
                  type: "string",
                  enum: ["responded", "interested", "not_interested"],
                  description: "New status for the lead",
                },
              },
              required: ["classification", "suggested_reply", "lead_status"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_and_reply" } },
      }),
    });

    if (!aiResponse.ok) throw new Error("AI classification failed");

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No classification returned");

    const result = JSON.parse(toolCall.function.arguments);

    // Save inbound conversation with AI suggested reply
    await supabase.from("conversations").insert({
      user_id: userId,
      lead_id,
      direction: "inbound",
      message,
      ai_suggested_reply: result.suggested_reply,
    });

    // Update lead status
    await supabase.from("leads").update({ status: result.lead_status }).eq("id", lead_id);

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "response_classified",
      details: {
        lead_id,
        business_name: lead.business_name,
        classification: result.classification,
        new_status: result.lead_status,
      },
    });

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("classify-response error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
