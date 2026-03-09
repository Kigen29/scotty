import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// DNS-based MX record check using public DNS-over-HTTPS
async function checkMXRecord(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    if (!res.ok) return false;
    const data = await res.json();
    return (data.Answer?.length || 0) > 0;
  } catch {
    return false;
  }
}

function validateEmailFormat(email: string): { valid: boolean; reason?: string } {
  const trimmed = email.trim().toLowerCase();
  
  if (!trimmed) return { valid: false, reason: "empty" };
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return { valid: false, reason: "invalid_format" };
  
  // Check for disposable/temporary email domains
  const disposable = [
    "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
    "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
    "dispostable.com", "trashmail.com", "temp-mail.org",
  ];
  const domain = trimmed.split("@")[1];
  if (disposable.includes(domain)) return { valid: false, reason: "disposable" };
  
  // Check for role-based emails (less likely to respond)
  const roleBased = ["info@", "admin@", "support@", "noreply@", "no-reply@", "contact@", "sales@", "help@"];
  const isRole = roleBased.some((prefix) => trimmed.startsWith(prefix));
  
  return { valid: true, reason: isRole ? "role_based" : undefined };
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

    // Cap at 50 per request
    const ids = lead_ids.slice(0, 50);

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email")
      .in("id", ids)
      .eq("user_id", userId);

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ error: "No leads found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; verified: boolean; status: string }[] = [];

    for (const lead of leads) {
      if (!lead.email) {
        await supabase.from("leads").update({
          email_verified: false,
          email_verification_status: "no_email",
        }).eq("id", lead.id);
        results.push({ id: lead.id, verified: false, status: "no_email" });
        continue;
      }

      const formatCheck = validateEmailFormat(lead.email);
      if (!formatCheck.valid) {
        await supabase.from("leads").update({
          email_verified: false,
          email_verification_status: formatCheck.reason || "invalid",
        }).eq("id", lead.id);
        results.push({ id: lead.id, verified: false, status: formatCheck.reason || "invalid" });
        continue;
      }

      // Check MX records for the domain
      const domain = lead.email.split("@")[1];
      const hasMX = await checkMXRecord(domain);

      if (!hasMX) {
        await supabase.from("leads").update({
          email_verified: false,
          email_verification_status: "no_mx_record",
        }).eq("id", lead.id);
        results.push({ id: lead.id, verified: false, status: "no_mx_record" });
        continue;
      }

      // Passed all checks
      const status = formatCheck.reason === "role_based" ? "role_based" : "valid";
      await supabase.from("leads").update({
        email_verified: true,
        email_verification_status: status,
      }).eq("id", lead.id);
      results.push({ id: lead.id, verified: true, status });
    }

    const verified = results.filter((r) => r.verified).length;
    const failed = results.filter((r) => !r.verified).length;

    return new Response(
      JSON.stringify({ success: true, verified, failed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-email error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
