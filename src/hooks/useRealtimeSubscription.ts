import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName = "leads" | "email_campaigns" | "conversations" | "activity_logs";

/**
 * Subscribe to realtime changes on a table filtered by user_id.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE occurs.
 */
export function useRealtimeSubscription(
  tableName: TableName,
  userId: string | undefined,
  onUpdate: () => void
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
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, userId, onUpdate]);
}
