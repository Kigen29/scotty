import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TableName = "leads" | "email_campaigns" | "conversations" | "activity_logs";

const tableLabels: Record<TableName, Record<string, string>> = {
  leads: { INSERT: "New lead discovered", UPDATE: "Lead updated", DELETE: "Lead removed" },
  email_campaigns: { INSERT: "New campaign created", UPDATE: "Campaign updated", DELETE: "Campaign removed" },
  conversations: { INSERT: "New message received", UPDATE: "Conversation updated", DELETE: "Message removed" },
  activity_logs: { INSERT: "New activity logged", UPDATE: "Activity updated", DELETE: "Activity removed" },
};

/**
 * Subscribe to realtime changes on a table filtered by user_id.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE occurs.
 * Shows a toast notification for the change.
 */
export function useRealtimeSubscription(
  tableName: TableName,
  userId: string | undefined,
  onUpdate: () => void,
  showToast: boolean = false
) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`${tableName}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onUpdate();
          if (showToast) {
            const label = tableLabels[tableName]?.[payload.eventType] || "Data updated";
            toast({ title: label, duration: 3000 });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, userId, onUpdate, showToast]);
}
