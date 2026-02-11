import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare, ArrowUpRight, ArrowDownLeft, Sparkles } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const Conversations = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<(Tables<"conversations"> & { leads?: Tables<"leads"> })[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, leads(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setConversations(data as any);
  };

  // Group conversations by lead
  const grouped = conversations.reduce((acc, conv) => {
    const leadId = conv.lead_id;
    if (!acc[leadId]) acc[leadId] = { lead: (conv as any).leads, messages: [] };
    acc[leadId].messages.push(conv);
    return acc;
  }, {} as Record<string, { lead: Tables<"leads">; messages: Tables<"conversations">[] }>);

  const leadIds = Object.keys(grouped);
  const activeThread = selectedLeadId ? grouped[selectedLeadId] : null;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Conversations</h1>
        <p className="text-muted-foreground mt-1">Track email threads with business owners</p>
      </div>

      {leadIds.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No conversations yet</p>
          <p className="text-sm">Conversations will appear here once emails are sent and replies received</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Thread List */}
          <div className="space-y-2">
            {leadIds.map((leadId) => {
              const thread = grouped[leadId];
              const lastMsg = thread.messages[0];
              return (
                <Card
                  key={leadId}
                  className={`cursor-pointer transition-colors ${selectedLeadId === leadId ? "border-primary" : "hover:border-primary/50"}`}
                  onClick={() => setSelectedLeadId(leadId)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">{thread.lead?.business_name}</h3>
                      <Badge variant="secondary" className="text-xs">{thread.messages.length}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lastMsg.message}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Message Thread */}
          <div className="lg:col-span-2">
            {activeThread ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{activeThread.lead?.business_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
                  {[...activeThread.messages].reverse().map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 ${
                        msg.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <div className="flex items-center gap-1 mb-1">
                          {msg.direction === "outbound" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3" />
                          )}
                          <span className="text-xs opacity-75">
                            {msg.direction === "outbound" ? "You" : activeThread.lead?.business_name}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p className="text-xs opacity-50 mt-2">{new Date(msg.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {activeThread.messages.some((m) => m.ai_suggested_reply) && (
                    <div className="p-3 border border-dashed border-primary/40 rounded-lg bg-primary/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">AI Suggested Reply</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_reply}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Select a conversation to view the thread
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversations;
