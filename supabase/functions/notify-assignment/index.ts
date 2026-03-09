import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // This function is called internally by auto_assign_lead trigger via pg_net
  // Verify the caller is using the service role key
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const { type, record, old_record } = payload;

    // Only trigger on INSERT or UPDATE where assigned_to changed
    if (type === "UPDATE") {
      if (record.assigned_to === old_record?.assigned_to) {
        return new Response(JSON.stringify({ skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const assignedTo = record.assigned_to;
    if (!assignedTo) {
      return new Response(JSON.stringify({ skipped: true, reason: "no assignee" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: "no resend key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get assignee profile
    const { data: assigneeProfile } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", assignedTo)
      .maybeSingle();

    if (!assigneeProfile?.email) {
      return new Response(JSON.stringify({ skipped: true, reason: "no assignee email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get assigner name (the lead owner or the person who updated)
    let assignerName = "ScoutAgent";
    if (record.user_id && record.user_id !== assignedTo) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", record.user_id)
        .maybeSingle();
      if (ownerProfile?.display_name) assignerName = ownerProfile.display_name;
    }

    const resend = new Resend(RESEND_API_KEY);
    const assigneeName = assigneeProfile.display_name || "there";
    const isAutoAssigned = type === "INSERT";

    await resend.emails.send({
      from: "ScoutAgent <onboarding@resend.dev>",
      to: [assigneeProfile.email],
      subject: `🎯 ${isAutoAssigned ? "Auto-assigned" : "New"} lead: ${record.business_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 8px;">Hey ${assigneeName} 👋</h2>
          <p style="color: #555; margin: 0 0 20px;">
            ${isAutoAssigned
              ? "A new lead was auto-assigned to you via round-robin."
              : `${assignerName} assigned you a new lead.`}
          </p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px;">${record.business_name}</h3>
            ${record.category ? `<p style="margin: 4px 0; color: #666;">📁 ${record.category}</p>` : ""}
            ${record.location ? `<p style="margin: 4px 0; color: #666;">📍 ${record.location}</p>` : ""}
            ${record.email ? `<p style="margin: 4px 0; color: #666;">✉️ ${record.email}</p>` : ""}
          </div>
          <p style="color: #888; font-size: 13px;">Log in to ScoutAgent to take action on this lead.</p>
        </div>
      `,
    });

    console.log(`Assignment notification sent to ${assigneeProfile.email} for lead ${record.business_name}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-assignment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
