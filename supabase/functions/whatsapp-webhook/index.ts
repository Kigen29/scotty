import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle Meta webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    if (!VERIFY_TOKEN) {
      console.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    console.log("WhatsApp webhook:", JSON.stringify(payload).substring(0, 500));

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "messages") continue;
        const value = change.value;

        // Process status updates (sent, delivered, read, failed)
        const statuses = value?.statuses || [];
        for (const status of statuses) {
          const waId = status.recipient_id; // phone number
          const statusType = status.status; // sent, delivered, read, failed

          // Find lead by phone number
          const { data: lead } = await supabase
            .from("leads")
            .select("id, user_id")
            .eq("phone", waId)
            .limit(1)
            .maybeSingle();

          if (!lead) {
            // Try with + prefix
            const { data: lead2 } = await supabase
              .from("leads")
              .select("id, user_id")
              .eq("phone", `+${waId}`)
              .limit(1)
              .maybeSingle();
            if (!lead2) continue;
            
            await processStatus(supabase, lead2, statusType);
            continue;
          }

          await processStatus(supabase, lead, statusType);
        }

        // Process incoming messages (replies from leads)
        const messages = value?.messages || [];
        for (const msg of messages) {
          const from = msg.from; // sender phone
          const text = msg.text?.body || msg.type || "";

          const { data: lead } = await supabase
            .from("leads")
            .select("id, user_id")
            .or(`phone.eq.${from},phone.eq.+${from}`)
            .limit(1)
            .maybeSingle();

          if (lead) {
            // Save as inbound conversation
            await supabase.from("conversations").insert({
              user_id: lead.user_id,
              lead_id: lead.id,
              direction: "inbound",
              message: text,
            });

            // Pause any active sequence
            await supabase.from("sequence_enrollments").update({
              status: "paused",
            }).eq("lead_id", lead.id).eq("status", "active");

            await supabase.from("activity_logs").insert({
              user_id: lead.user_id,
              action: "whatsapp_reply_received",
              details: { lead_id: lead.id, from, message_preview: text.substring(0, 100) },
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processStatus(supabase: any, lead: { id: string; user_id: string }, statusType: string) {
  // Find the most recent WhatsApp campaign for this lead
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign) return;

  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "sent",
    read: "opened",
    failed: "bounced",
  };

  const newStatus = statusMap[statusType];
  if (!newStatus) return;

  const updateData: any = { status: newStatus };
  if (statusType === "read") updateData.opened_at = new Date().toISOString();
  if (statusType === "sent") updateData.sent_at = new Date().toISOString();

  await supabase.from("email_campaigns").update(updateData).eq("id", campaign.id);

  await supabase.from("activity_logs").insert({
    user_id: lead.user_id,
    action: `whatsapp_${statusType}`,
    details: { lead_id: lead.id, campaign_id: campaign.id },
  });
}
