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

    const event = await req.json();
    const type = event.type;
    const data = event.data;

    console.log(`Resend webhook: ${type}`, JSON.stringify(data).substring(0, 200));

    if (!data?.email_id && !data?.to) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the campaign by matching the recipient email
    const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find lead by email, then find their most recent campaign
    const { data: lead } = await supabase
      .from("leads")
      .select("id, user_id")
      .eq("email", recipientEmail)
      .limit(1)
      .maybeSingle();

    if (!lead) {
      console.log(`No lead found for email: ${recipientEmail}`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign } = await supabase
      .from("email_campaigns")
      .select("id, ab_test_id, ab_variant")
      .eq("lead_id", lead.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    switch (type) {
      case "email.opened": {
        if (campaign) {
          await supabase.from("email_campaigns").update({
            status: "opened",
            opened_at: new Date().toISOString(),
          }).eq("id", campaign.id);

          // Auto-determine A/B test winner
          if (campaign.ab_test_id) {
            const { data: abTest } = await supabase
              .from("ab_tests")
              .select("*")
              .eq("id", campaign.ab_test_id)
              .maybeSingle();

            if (abTest && !abTest.winner) {
              const winner = campaign.ab_variant || "a";
              await supabase.from("ab_tests").update({
                winner,
                status: "completed",
              }).eq("id", abTest.id);
            }
          }
        }
        await supabase.from("activity_logs").insert({
          user_id: lead.user_id,
          action: "email_opened",
          details: { email: recipientEmail, lead_id: lead.id },
        });
        break;
      }

      case "email.bounced": {
        if (campaign) {
          await supabase.from("email_campaigns").update({
            status: "bounced",
          }).eq("id", campaign.id);
        }
        await supabase.from("activity_logs").insert({
          user_id: lead.user_id,
          action: "email_bounced",
          details: { email: recipientEmail, lead_id: lead.id },
        });
        break;
      }

      case "email.complained": {
        // Mark lead as unsubscribed on spam complaint
        await supabase.from("leads").update({ unsubscribed: true }).eq("id", lead.id);
        await supabase.from("activity_logs").insert({
          user_id: lead.user_id,
          action: "email_spam_complaint",
          details: { email: recipientEmail, lead_id: lead.id },
        });
        break;
      }

      case "email.delivered": {
        await supabase.from("activity_logs").insert({
          user_id: lead.user_id,
          action: "email_delivered",
          details: { email: recipientEmail, lead_id: lead.id },
        });
        break;
      }

      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    return new Response(JSON.stringify({ received: true, type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
