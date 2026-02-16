import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Eye, Clock, AlertCircle, Loader2, Phone, Instagram, Linkedin, MessageCircle, Copy } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const Campaigns = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<(Tables<"email_campaigns"> & { leads?: Tables<"leads"> })[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Tables<"email_campaigns"> | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  useEffect(() => {
    if (user) fetchCampaigns();
  }, [user]);

  const fetchCampaigns = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("email_campaigns")
      .select("*, leads(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setCampaigns(data as any);
  };

  const sendEmail = async (e: React.MouseEvent, campaignId: string) => {
    e.stopPropagation();
    setSendingId(campaignId);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Email sent successfully!" });
      fetchCampaigns();
    } catch (error: any) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const copyMessage = (e: React.MouseEvent, body: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(body);
    toast({ title: "Message copied to clipboard!" });
  };

  const statusIcon: Record<string, React.ReactNode> = {
    draft: <Clock className="h-3.5 w-3.5" />,
    sent: <Send className="h-3.5 w-3.5" />,
    opened: <Eye className="h-3.5 w-3.5" />,
    replied: <Mail className="h-3.5 w-3.5" />,
    bounced: <AlertCircle className="h-3.5 w-3.5" />,
  };

  const statusColor: Record<string, string> = {
    draft: "bg-secondary text-secondary-foreground",
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    sent: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    opened: "bg-primary/15 text-primary",
    replied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };

  const channelIcon: Record<string, React.ReactNode> = {
    email: <Mail className="h-3.5 w-3.5" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
    instagram_dm: <Instagram className="h-3.5 w-3.5" />,
    linkedin: <Linkedin className="h-3.5 w-3.5" />,
  };

  const channelColor: Record<string, string> = {
    email: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    whatsapp: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    instagram_dm: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };

  const templateLabel: Record<string, string> = {
    first_touch: "First Touch",
    follow_up_1: "Follow-up #1",
    follow_up_2: "Follow-up #2",
    final_follow_up: "Final",
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (channelFilter !== "all" && (c as any).channel !== channelFilter) return false;
    if (dateRange) {
      const d = new Date(c.created_at);
      if (d < dateRange.from || d > dateRange.to) return false;
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground mt-1">AI-crafted outreach across all channels</p>
      </div>

      {/* Date Filter */}
      <DateFilter defaultPreset="today" onChange={setDateRange} />

      {/* Channel Filter */}
      <div className="flex items-center gap-2">
        {[
          { value: "all", label: "All Channels" },
          { value: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5 mr-1" /> },
          { value: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5 mr-1" /> },
          { value: "instagram_dm", label: "Instagram", icon: <Instagram className="h-3.5 w-3.5 mr-1" /> },
          { value: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-3.5 w-3.5 mr-1" /> },
        ].map((ch) => (
          <Button
            key={ch.value}
            size="sm"
            variant={channelFilter === ch.value ? "default" : "outline"}
            onClick={() => setChannelFilter(ch.value)}
            className="text-xs h-8"
          >
            {ch.icon}{ch.label}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="replied">Replied</TabsTrigger>
        </TabsList>

        {["all", "draft", "sent", "replied"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="space-y-3">
              {(tab === "all" ? filteredCampaigns : filteredCampaigns.filter((c) => c.status === tab)).map((campaign) => {
                const channel = (campaign as any).channel || "email";
                return (
                  <Card key={campaign.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedEmail(campaign)}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{campaign.subject}</p>
                          <Badge className={`text-xs border-0 ${statusColor[campaign.status] || ""}`}>
                            <span className="flex items-center gap-1">
                              {statusIcon[campaign.status]}
                              {campaign.status}
                            </span>
                          </Badge>
                          <Badge className={`text-xs border-0 gap-1 ${channelColor[channel] || channelColor.email}`}>
                            {channelIcon[channel]} {channel.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          To: {(campaign as any).leads?.business_name || "Unknown"} • {templateLabel[campaign.template_type] || campaign.template_type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {campaign.status === "draft" && channel === "email" && (campaign as any).leads?.email ? (
                          <Button size="sm" onClick={(e) => sendEmail(e, campaign.id)} disabled={sendingId === campaign.id}>
                            {sendingId === campaign.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                            Send
                          </Button>
                        ) : campaign.status === "draft" && channel !== "email" ? (
                          <Button size="sm" variant="outline" onClick={(e) => copyMessage(e, campaign.body)}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                          </Button>
                        ) : campaign.status === "draft" ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">No email</Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {new Date(campaign.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs border-0 gap-1 ${channelColor[(selectedEmail as any).channel || "email"]}`}>
                  {channelIcon[(selectedEmail as any).channel || "email"]} {((selectedEmail as any).channel || "email").replace("_", " ")}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subject</p>
                <p className="font-medium">{selectedEmail.subject}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Body</p>
                <div className="mt-2 p-4 rounded-lg bg-muted whitespace-pre-wrap text-sm">{selectedEmail.body}</div>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                {selectedEmail.sent_at && <span>Sent: {new Date(selectedEmail.sent_at).toLocaleString()}</span>}
                {selectedEmail.opened_at && <span>Opened: {new Date(selectedEmail.opened_at).toLocaleString()}</span>}
              </div>
              {selectedEmail.status === "draft" && (
                (selectedEmail as any).channel === "email" || !(selectedEmail as any).channel ? (
                  (campaigns.find(c => c.id === selectedEmail.id) as any)?.leads?.email ? (
                    <Button onClick={(e) => { sendEmail(e, selectedEmail.id); setSelectedEmail(null); }} disabled={sendingId === selectedEmail.id}>
                      <Send className="h-4 w-4 mr-2" /> Send Email
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">Cannot send — lead has no email address.</p>
                  )
                ) : (
                  <Button variant="outline" onClick={(e) => { copyMessage(e, selectedEmail.body); setSelectedEmail(null); }}>
                    <Copy className="h-4 w-4 mr-2" /> Copy Message
                  </Button>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {campaigns.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No campaigns yet</p>
          <p className="text-sm">Campaigns will be created when leads are approved and emails are generated</p>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
