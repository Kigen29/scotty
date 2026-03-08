import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TeamMemberInfo {
  user_id: string;
  role: string;
  display_name: string;
  email: string;
}

export const useTeam = () => {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeam = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      setTeamId(membership.team_id);
      setMyRole(membership.role);

      const { data: membersData } = await supabase
        .from("team_members")
        .select("user_id, role, profiles(display_name, email)")
        .eq("team_id", membership.team_id);

      if (membersData) {
        setMembers(
          membersData.map((m: any) => ({
            user_id: m.user_id,
            role: m.role,
            display_name: m.profiles?.display_name || "Unknown",
            email: m.profiles?.email || "",
          }))
        );
      }
    } else {
      setTeamId(null);
      setMyRole(null);
      setMembers([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const assignLead = async (leadId: string, assignedTo: string | null) => {
    const { data, error } = await supabase.functions.invoke("team-management", {
      body: { action: "assign_lead", lead_id: leadId, assigned_to: assignedTo },
    });
    return { data, error };
  };

  return { teamId, myRole, members, loading, refetch: fetchTeam, assignLead };
};
