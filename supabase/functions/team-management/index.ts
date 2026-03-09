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

        // Verify caller is in a team
        const { data: callerTeam } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!callerTeam) {
          return new Response(JSON.stringify({ error: "You must be in a team to assign leads" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify the lead belongs to a member of the caller's team
        const { data: leadOwnerTeam } = await supabase
          .from("leads")
          .select("user_id")
          .eq("id", lead_id)
          .maybeSingle();

        if (!leadOwnerTeam) {
          return new Response(JSON.stringify({ error: "Lead not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: leadOwnerMembership } = await supabase
          .from("team_members")
          .select("id")
          .eq("user_id", leadOwnerTeam.user_id)
          .eq("team_id", callerTeam.team_id)
          .limit(1)
          .maybeSingle();

        if (!leadOwnerMembership) {
          return new Response(JSON.stringify({ error: "Lead does not belong to your team" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (assigned_to) {
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
          .eq("id", lead_id)
          .eq("user_id", leadOwnerTeam.user_id);

        // Send email notification to the assignee
        if (assigned_to) {
          try {
            const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
            if (RESEND_API_KEY) {
              // Get assignee profile
              const { data: assigneeProfile } = await supabase
                .from("profiles")
                .select("email, display_name")
                .eq("id", assigned_to)
                .maybeSingle();

              // Get lead details
              const { data: lead } = await supabase
                .from("leads")
                .select("business_name, location, category, email")
                .eq("id", lead_id)
                .maybeSingle();

              // Get assigner profile
              const { data: assignerProfile } = await supabase
                .from("profiles")
                .select("display_name")
                .eq("id", userId)
                .maybeSingle();

              if (assigneeProfile?.email && lead) {
                const resend = new Resend(RESEND_API_KEY);
                const assignerName = assignerProfile?.display_name || "A teammate";
                const assigneeName = assigneeProfile.display_name || "there";

                await resend.emails.send({
                  from: "ScoutAgent <onboarding@resend.dev>",
                  to: [assigneeProfile.email],
                  subject: `🎯 New lead assigned: ${lead.business_name}`,
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                      <h2 style="margin: 0 0 8px;">Hey ${assigneeName} 👋</h2>
                      <p style="color: #555; margin: 0 0 20px;">${assignerName} assigned you a new lead.</p>
                      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 8px;">${lead.business_name}</h3>
                        ${lead.category ? `<p style="margin: 4px 0; color: #666;">📁 ${lead.category}</p>` : ""}
                        ${lead.location ? `<p style="margin: 4px 0; color: #666;">📍 ${lead.location}</p>` : ""}
                        ${lead.email ? `<p style="margin: 4px 0; color: #666;">✉️ ${lead.email}</p>` : ""}
                      </div>
                      <p style="color: #888; font-size: 13px;">Log in to ScoutAgent to take action on this lead.</p>
                    </div>
                  `,
                });
                console.log(`Assignment notification sent to ${assigneeProfile.email}`);
              }
            }
          } catch (emailErr) {
            // Don't fail the assignment if email fails
            console.error("Failed to send assignment notification:", emailErr);
          }
        }

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
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
