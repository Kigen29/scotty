import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
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
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sorting, setSorting] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, leads(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setConversations(data as any);
  }, [user]);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user, fetchConversations]);

  useRealtimeSubscription("conversations", user?.id, fetchConversations, true);

  // The server sends first and records the message only if the email went out,
  // and refuses anyone who hasn't written to us first. See api/_lib/inbox.ts.
  const sendReply = async () => {
    if (!user || !selectedLeadId || !replyText.trim()) return;
    setSending(true);
    const { error } = await supabase.functions.invoke("send-reply", {
      body: { lead_id: selectedLeadId, message: replyText.trim(), subject: replySubject.trim() || undefined },
    });
    setSending(false);
    if (error) {
      toast({ title: "Not sent", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reply sent", description: `Emailed to ${grouped[selectedLeadId]?.lead?.email}` });
    setReplyText("");
    setReplySubject("");
    fetchConversations();
  };

  const sortWithClaude = async (conversationId: string) => {
    setSorting(conversationId);
    const { error } = await supabase.functions.invoke("sort-conversation", { body: { conversation_id: conversationId } });
    setSorting(null);
    if (error) toast({ title: "Couldn't sort it", description: error.message, variant: "destructive" });
    else fetchConversations();
  };

  const applySuggestedReply = (msg: Tables<"conversations">) => {
    setReplyText(msg.ai_suggested_reply ?? "");
    setReplySubject(msg.ai_suggested_subject ?? "");
  };

  const urgencyVariant = (u: string | null) => (u === "high" ? "destructive" : u === "low" ? "outline" : "secondary");

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

      <DateFilter defaultPreset="all" onChange={setDateRange} />

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
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm">{thread.lead?.business_name}</h3>
                      <div className="flex items-center gap-1">
                        {lastMsg.direction === "inbound" && lastMsg.urgency ? (
                          <Badge variant={urgencyVariant(lastMsg.urgency)} className="text-xs">{lastMsg.urgency}</Badge>
                        ) : null}
                        <Badge variant="secondary" className="text-xs">{thread.messages.length}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lastMsg.summary ?? lastMsg.message}</p>
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
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          {msg.direction === "outbound" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                          <span className="text-xs opacity-75">
                            {msg.direction === "outbound" ? "You" : activeThread.lead?.business_name} · {msg.channel}
                          </span>
                          {msg.urgency ? <Badge variant={urgencyVariant(msg.urgency)} className="text-[10px] h-4 px-1">{msg.urgency}</Badge> : null}
                          {msg.category ? <span className="text-[10px] opacity-60">{msg.category.replace(/_/g, " ")}</span> : null}
                        </div>
                        {msg.summary ? <p className="text-xs italic opacity-75 mb-1">{msg.summary}</p> : null}
                        {msg.subject ? <p className="text-xs font-medium mb-1">{msg.subject}</p> : null}
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p className="text-xs opacity-50 mt-2">{new Date(msg.created_at).toLocaleString()}</p>
                        {msg.direction === "inbound" && !msg.summary ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs mt-2" disabled={sorting === msg.id} onClick={() => sortWithClaude(msg.id)}>
                            {sorting === msg.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                            {sorting === msg.id ? "Sorting… (up to 30s)" : "Sort with Claude"}
                          </Button>
                        ) : null}
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
                          onClick={() => applySuggestedReply(activeThread.messages.find((m) => m.ai_suggested_reply)!)}
                        >
                          Use this
                        </Button>
                      </div>
                      {activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_subject ? (
                        <p className="text-xs font-medium mb-1">
                          {activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_subject}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {activeThread.messages.find((m) => m.ai_suggested_reply)?.ai_suggested_reply}
                      </p>
                    </div>
                  )}
                </CardContent>

                {/* Reply composer */}
                <div className="p-4 border-t space-y-3">
                  <Input
                    placeholder="Subject (optional)"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    className="text-sm"
                  />
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={6}
                    className="text-sm"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {activeThread.lead?.email ? `Emails ${activeThread.lead.email}. Only people who wrote to you can be replied to.` : "This lead has no email address."}
                    </p>
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
