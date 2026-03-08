import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, ArrowUpRight, ArrowDownLeft, Sparkles, Send, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const Conversations = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<(Tables<"conversations"> & { leads?: Tables<"leads"> })[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

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

  const sendReply = async () => {
    if (!user || !selectedLeadId || !replyText.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("conversations").insert({
        user_id: user.id,
        lead_id: selectedLeadId,
        direction: "outbound",
        message: replyText.trim(),
      });
      if (error) throw error;

      // Also send via Resend if lead has email
      const lead = grouped[selectedLeadId]?.lead;
      if (lead?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: lead.email,
            subject: `Re: ${lead.business_name}`,
            body: replyText.trim(),
          },
        });
      }

      toast({ title: "Reply sent" });
      setReplyText("");
      fetchConversations();
    } catch (error: any) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const useSuggestedReply = (text: string) => {
    setReplyText(text);
  };

  // Filter by date
  const filtered = dateRange
    ? conversations.filter((c) => {
        const d = new Date(c.created_at);
        return d >= dateRange.from && d <= dateRange.to;
      })
    : conversations;

  // Group conversations by lead
  const grouped = filtered.reduce((acc, conv) => {
    const leadId = conv.lead_id;
    if (!acc[leadId]) acc[leadId] = { lead: (conv as any).leads, messages: [] };
    acc[leadId].messages.push(conv);
    return acc;
  }, {} as Record<string, { lead: Tables<"leads">; messages: Tables<"conversations">[] }>);

  const leadIds = Object.keys(grouped);
  const activeThread = selectedLeadId ? grouped[selectedLeadId] : null;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Conversations</h1>
        <p className="text-muted-foreground mt-1 text-sm">Track email threads with business owners</p>
      </div>

      <DateFilter defaultPreset="this_week" onChange={setDateRange} />

      {leadIds.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No conversations yet</p>
          <p className="text-sm">Conversations will appear here once emails are sent and replies received</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
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

          <div className="lg:col-span-2">
            {activeThread ? (
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{activeThread.lead?.business_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[400px] overflow-y-auto flex-1">
                  {[...activeThread.messages].reverse().map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 ${
                        msg.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <div className="flex items-center gap-1 mb-1">
                          {msg.direction === "outbound" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
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
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium text-primary">AI Suggested Reply</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => useSuggestedReply(
                            activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_reply || ""
                          )}
                        >
                          Use this
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_reply}
                      </p>
                    </div>
                  )}
                </CardContent>

                {/* Reply composer */}
                <div className="p-4 border-t space-y-3">
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      size="sm"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      Send Reply
                    </Button>
                  </div>
                </div>
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
