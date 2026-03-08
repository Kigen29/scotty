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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { action, ...params } = await req.json();

    switch (action) {
      case "create_team": {
        const { name } = params;
        // Check if user already has a team
        const { data: existing } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ error: "You already belong to a team" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: team, error: teamErr } = await supabase
          .from("teams")
          .insert({ name: name || "My Team", created_by: userId })
          .select()
          .single();

        if (teamErr) throw teamErr;

        // Add creator as owner
        await supabase.from("team_members").insert({
          team_id: team.id,
          user_id: userId,
          role: "owner",
        });

        return new Response(JSON.stringify({ success: true, team }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "join_team": {
        const { invite_code } = params;
        if (!invite_code) {
          return new Response(JSON.stringify({ error: "Invite code is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if already in a team
        const { data: existingMember } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (existingMember) {
          return new Response(JSON.stringify({ error: "You already belong to a team" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find team by invite code
        const { data: team } = await supabase
          .from("teams")
          .select("id, name")
          .eq("invite_code", invite_code.trim())
          .maybeSingle();

        if (!team) {
          return new Response(JSON.stringify({ error: "Invalid invite code" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: joinErr } = await supabase.from("team_members").insert({
          team_id: team.id,
          user_id: userId,
          role: "member",
        });

        if (joinErr) throw joinErr;

        // Log
        await supabase.from("activity_logs").insert({
          user_id: userId,
          action: "team_joined",
          details: { team_name: team.name },
        });

        return new Response(JSON.stringify({ success: true, team }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_role": {
        const { member_id, role } = params;
        if (!["admin", "member"].includes(role)) {
          return new Response(JSON.stringify({ error: "Invalid role" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify caller is owner/admin
        const { data: callerMember } = await supabase
          .from("team_members")
          .select("role, team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
          return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: upErr } = await supabase
          .from("team_members")
          .update({ role })
          .eq("id", member_id)
          .eq("team_id", callerMember.team_id);

        if (upErr) throw upErr;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "remove_member": {
        const { member_id } = params;

        const { data: callerMember } = await supabase
          .from("team_members")
          .select("role, team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
          return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase
          .from("team_members")
          .delete()
          .eq("id", member_id)
          .eq("team_id", callerMember.team_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "assign_lead": {
        const { lead_id, assigned_to } = params;

        // Verify both users are on the same team
        const { data: callerTeam } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (assigned_to && callerTeam) {
          const { data: targetMember } = await supabase
            .from("team_members")
            .select("id")
            .eq("user_id", assigned_to)
            .eq("team_id", callerTeam.team_id)
            .limit(1)
            .maybeSingle();

          if (!targetMember) {
            return new Response(JSON.stringify({ error: "Target user is not on your team" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        await supabase
          .from("leads")
          .update({ assigned_to: assigned_to || null })
          .eq("id", lead_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "regenerate_invite": {
        const { data: callerMember } = await supabase
          .from("team_members")
          .select("role, team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
          return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate new random code
        const newCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        await supabase
          .from("teams")
          .update({ invite_code: newCode })
          .eq("id", callerMember.team_id);

        return new Response(JSON.stringify({ success: true, invite_code: newCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Team management error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
