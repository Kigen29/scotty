import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const LAST_SEEN_ACTIVITY_KEY = "scoutagent_last_seen_activity";
const LAST_SEEN_ASSIGNMENTS_KEY = "scoutagent_last_seen_assignments";

export const useNotifications = () => {
  const { user } = useAuth();
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [newAssignments, setNewAssignments] = useState(0);

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    const lastSeenActivity = localStorage.getItem(LAST_SEEN_ACTIVITY_KEY) || new Date(0).toISOString();
    const lastSeenAssignments = localStorage.getItem(LAST_SEEN_ASSIGNMENTS_KEY) || new Date(0).toISOString();

    // Get team member IDs
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      const { data: teammates } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", membership.team_id)
        .neq("user_id", user.id);

      if (teammates && teammates.length > 0) {
        const teamIds = teammates.map((t) => t.user_id);

        // Count unread team activity (from other members)
        const { count: activityCount } = await supabase
          .from("activity_logs")
          .select("id", { count: "exact", head: true })
          .in("user_id", teamIds)
          .gt("created_at", lastSeenActivity);

        setUnreadActivity(activityCount || 0);
      }
    }

    // Count new lead assignments to me
    const { count: assignCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .gt("updated_at", lastSeenAssignments);

    setNewAssignments(assignCount || 0);
  }, [user]);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const markActivitySeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, new Date().toISOString());
    setUnreadActivity(0);
  }, []);

  const markAssignmentsSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_ASSIGNMENTS_KEY, new Date().toISOString());
    setNewAssignments(0);
  }, []);

  return { unreadActivity, newAssignments, markActivitySeen, markAssignmentsSeen, refetch: fetchCounts };
};
