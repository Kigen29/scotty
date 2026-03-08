import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const LAST_SEEN_KEY = "scoutagent_last_seen_notifications";
const LAST_SEEN_ACTIVITY_KEY = "scoutagent_last_seen_activity";
const LAST_SEEN_ASSIGNMENTS_KEY = "scoutagent_last_seen_assignments";

export interface NotificationItem {
  id: string;
  type: "activity" | "assignment";
  title: string;
  description: string;
  time: string;
  isNew: boolean;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [newAssignments, setNewAssignments] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    const lastSeenActivity = localStorage.getItem(LAST_SEEN_ACTIVITY_KEY) || new Date(0).toISOString();
    const lastSeenAssignments = localStorage.getItem(LAST_SEEN_ASSIGNMENTS_KEY) || new Date(0).toISOString();
    const lastSeenNotifications = localStorage.getItem(LAST_SEEN_KEY) || new Date(0).toISOString();

    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const items: NotificationItem[] = [];

    if (membership) {
      const { data: teammates } = await supabase
        .from("team_members")
        .select("user_id, profiles(display_name)")
        .eq("team_id", membership.team_id)
        .neq("user_id", user.id);

      if (teammates && teammates.length > 0) {
        const teamIds = teammates.map((t) => t.user_id);
        const nameMap: Record<string, string> = {};
        teammates.forEach((t: any) => {
          nameMap[t.user_id] = t.profiles?.display_name || "Teammate";
        });

        const { count: activityCount } = await supabase
          .from("activity_logs")
          .select("id", { count: "exact", head: true })
          .in("user_id", teamIds)
          .gt("created_at", lastSeenActivity);

        setUnreadActivity(activityCount || 0);

        // Fetch recent team activity for the notification list
        const { data: recentActivity } = await supabase
          .from("activity_logs")
          .select("*")
          .in("user_id", teamIds)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentActivity) {
          recentActivity.forEach((a) => {
            items.push({
              id: `activity-${a.id}`,
              type: "activity",
              title: `${nameMap[a.user_id] || "Teammate"} ${a.action?.replace(/_/g, " ")}`,
              description: (a.details as any)?.business_name || "",
              time: a.created_at,
              isNew: a.created_at > lastSeenNotifications,
            });
          });
        }
      }
    }

    // Fetch recent assignments to me
    const { count: assignCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .gt("updated_at", lastSeenAssignments);

    setNewAssignments(assignCount || 0);

    const { data: recentAssignments } = await supabase
      .from("leads")
      .select("id, business_name, category, location, updated_at")
      .eq("assigned_to", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (recentAssignments) {
      recentAssignments.forEach((lead) => {
        items.push({
          id: `assign-${lead.id}`,
          type: "assignment",
          title: `Lead assigned: ${lead.business_name}`,
          description: [lead.category, lead.location].filter(Boolean).join(" · "),
          time: lead.updated_at,
          isNew: lead.updated_at > lastSeenNotifications,
        });
      });
    }

    // Sort by time descending
    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setNotifications(items.slice(0, 20));
  }, [user]);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const totalUnread = unreadActivity + newAssignments;

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, now);
    localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, now);
    localStorage.setItem(LAST_SEEN_ASSIGNMENTS_KEY, now);
    setUnreadActivity(0);
    setNewAssignments(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isNew: false })));
  }, []);

  const markActivitySeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, new Date().toISOString());
    setUnreadActivity(0);
  }, []);

  const markAssignmentsSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_ASSIGNMENTS_KEY, new Date().toISOString());
    setNewAssignments(0);
  }, []);

  return {
    unreadActivity,
    newAssignments,
    totalUnread,
    notifications,
    markActivitySeen,
    markAssignmentsSeen,
    markAllSeen,
    refetch: fetchCounts,
  };
};
