import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GENERATE_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_sequence",
      description: "Generate a complete email outreach sequence with name and steps.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short descriptive name for the sequence" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string", description: "Email subject line. Use {{business_name}}, {{category}}, {{location}} as variables." },
                body_prompt: { type: "string", description: "AI prompt describing what this email should say. Include personalization instructions." },
                delay_days: { type: "number", description: "Days to wait after previous step (0 for first step)" },
                channel: { type: "string", enum: ["email"], description: "Channel for this step" },
              },
              required: ["subject", "body_prompt", "delay_days", "channel"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "steps"],
        additionalProperties: false,
      },
    },
  },
];

const REFINE_TOOLS = [
  {
    type: "function",
    function: {
      name: "refine_step",
      description: "Return an improved subject line and body prompt for an email step.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Improved email subject line" },
          body_prompt: { type: "string", description: "Improved AI prompt for this email step" },
        },
        required: ["subject", "body_prompt"],
        additionalProperties: false,
      },
    },
  },
];

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { goal, num_steps, existing_step, mode } = await req.json();
    const safeGoal = sanitizeForPrompt(goal, 500);
    const safeSubject = sanitizeForPrompt(existing_step?.subject);
    const safeBodyPrompt = sanitizeForPrompt(existing_step?.body_prompt, 500);

    let messages: any[];
    let tools: any[];
    let tool_choice: any;

    if (mode === "refine") {
      messages = [
        {
          role: "system",
          content:
            "You are an expert cold email copywriter. Improve the given email step to be more compelling, personalized, and likely to get a response. Keep using {{business_name}}, {{category}}, {{location}} variables where appropriate.",
        },
        {
          role: "user",
          content: `Improve this email step:\n\nSubject: ${safeSubject}\nBody prompt: ${safeBodyPrompt}\n\nMake it more engaging, specific, and action-oriented.`,
        },
      ];
      tools = REFINE_TOOLS;
      tool_choice = { type: "function", function: { name: "refine_step" } };
    } else {
      const stepCount = num_steps || 3;
      messages = [
        {
          role: "system",
          content: `You are an expert cold email strategist. Generate a ${stepCount}-step email outreach sequence. Each step should build on the previous one with increasing urgency but remaining professional. Use {{business_name}}, {{category}}, and {{location}} as personalization variables in subjects and prompts. The first step should have delay_days=0, subsequent steps should have realistic delays (2-5 days).`,
        },
        {
          role: "user",
          content: `Create a ${stepCount}-step outreach sequence for: ${safeGoal}`,
        },
      ];
      tools = GENERATE_TOOLS;
      tool_choice = { type: "function", function: { name: "generate_sequence" } };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools,
        tool_choice,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ mode: mode || "generate", result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-sequence-steps error:", e);
    return new Response(JSON.stringify({ error: "Processing failed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
