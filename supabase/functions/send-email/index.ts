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

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign with lead
    const { data: campaign, error: campaignError } = await supabase
      .from("email_campaigns")
      .select("*, leads(*)")
      .eq("id", campaign_id)
      .eq("user_id", userId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (campaign.status === "sent") {
      return new Response(JSON.stringify({ error: "Email already sent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = (campaign as any).leads;
    const recipientEmail = lead?.email;

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "Lead has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block sending to emails that failed verification
    if (lead.email_verified === false) {
      return new Response(JSON.stringify({ error: `Email verification failed: ${lead.email_verification_status || "invalid"}. Verify the email first.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender email from settings
    const { data: settings } = await supabase
      .from("settings")
      .select("sender_email, company_name")
      .eq("user_id", userId)
      .maybeSingle();

    const senderEmail = settings?.sender_email;
    if (!senderEmail) {
      return new Response(JSON.stringify({ error: "Configure your sender email in Settings first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(RESEND_API_KEY);
    const fromName = settings?.company_name || "Emmanuel Kigen";

    console.log(`Sending email to ${recipientEmail} from ${senderEmail}`);

    // Append unsubscribe footer
    const bodyWithFooter = campaign.body + "\n\n---\nReply STOP to unsubscribe.";

    const emailResponse = await resend.emails.send({
      from: `${fromName} <${senderEmail}>`,
      to: [recipientEmail],
      subject: campaign.subject,
      text: bodyWithFooter,
    });

    console.log("Email sent:", emailResponse);

    // Update campaign status
    await supabase
      .from("email_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaign_id);

    // Update lead status
    await supabase
      .from("leads")
      .update({ status: "contacted" })
      .eq("id", campaign.lead_id);

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "email_sent",
      details: {
        campaign_id,
        lead_id: campaign.lead_id,
        business_name: lead?.business_name,
        to: recipientEmail,
      },
    });

    return new Response(
      JSON.stringify({ success: true, email_id: emailResponse?.data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-email error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
