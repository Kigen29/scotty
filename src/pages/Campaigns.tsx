import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Eye, Clock, AlertCircle, Loader2, Copy, MessageCircle, Instagram, Linkedin } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { DateFilter, type DateRange } from "@/components/DateFilter";

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
  email: <Mail className="h-3 w-3" />,
  whatsapp: <MessageCircle className="h-3 w-3" />,
  instagram_dm: <Instagram className="h-3 w-3" />,
  linkedin: <Linkedin className="h-3 w-3" />,
};

const Campaigns = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<(Tables<"email_campaigns"> & { leads?: Tables<"leads"> })[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Tables<"email_campaigns"> | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  useEffect(() => { if (user) fetchCampaigns(); }, [user]);

  const fetchCampaigns = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("email_campaigns").select("*, leads(*)").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setCampaigns(data as any);
  };

  const sendEmail = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSendingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", { body: { campaign_id: id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Email sent!" });
      fetchCampaigns();
    } catch (error: any) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
    } finally { setSendingId(null); }
  };

  const copyMsg = (e: React.MouseEvent, body: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(body);
    toast({ title: "Copied to clipboard!" });
  };

  const filtered = campaigns.filter((c) => {
    if (channelFilter !== "all" && (c as any).channel !== channelFilter) return false;
    if (dateRange) { const d = new Date(c.created_at); if (d < dateRange.from || d > dateRange.to) return false; }
    return true;
  });

  const templateLabel: Record<string, string> = {
    first_touch: "First Touch", follow_up_1: "Follow-up #1", follow_up_2: "Follow-up #2", final_follow_up: "Final",
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">AI-crafted outreach across all channels</p>
      </div>

      <DateFilter defaultPreset="all" onChange={setDateRange} />

      {/* Channel filter */}
      <div className="flex gap-2">
        {[
          { value: "all", label: "All" },
          { value: "email", label: "Email", icon: <Mail className="h-3 w-3 mr-1" /> },
          { value: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-3 w-3 mr-1" /> },
          { value: "instagram_dm", label: "Instagram", icon: <Instagram className="h-3 w-3 mr-1" /> },
        ].map((ch) => (
          <Button key={ch.value} size="sm" variant={channelFilter === ch.value ? "default" : "outline"}
            onClick={() => setChannelFilter(ch.value)} className="text-xs h-8">
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
          <TabsContent key={tab} value={tab} className="mt-3">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Lead</TableHead>
                    <TableHead className="text-xs">Channel</TableHead>
                    <TableHead className="text-xs">Template</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tab === "all" ? filtered : filtered.filter((c) => c.status === tab)).map((campaign) => {
                    const ch = (campaign as any).channel || "email";
                    const lead = (campaign as any).leads;
                    return (
                      <TableRow key={campaign.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmail(campaign)}>
                        <TableCell className="font-medium text-sm truncate max-w-[220px]">{campaign.subject}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lead?.business_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] gap-1">{channelIcon[ch]}{ch.replace("_", " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{templateLabel[campaign.template_type] || campaign.template_type}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] border-0 ${statusColor[campaign.status]}`}>{campaign.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(campaign.created_at).toLocaleDateString()}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {campaign.status === "draft" && ch === "email" && lead?.email ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => sendEmail(e, campaign.id)} disabled={sendingId === campaign.id}>
                              {sendingId === campaign.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          ) : campaign.status === "draft" ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => copyMsg(e, campaign.body)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No campaigns yet</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Message Preview</DialogTitle></DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">{channelIcon[(selectedEmail as any).channel || "email"]} {((selectedEmail as any).channel || "email").replace("_", " ")}</Badge>
                <Badge className={`border-0 ${statusColor[selectedEmail.status]}`}>{selectedEmail.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="font-medium">{selectedEmail.subject}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Body</p>
                <div className="mt-1 p-4 rounded-lg bg-muted whitespace-pre-wrap text-sm">{selectedEmail.body}</div>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {selectedEmail.sent_at && <span>Sent: {new Date(selectedEmail.sent_at).toLocaleString()}</span>}
                {selectedEmail.opened_at && <span>Opened: {new Date(selectedEmail.opened_at).toLocaleString()}</span>}
              </div>
              {selectedEmail.status === "draft" && (
                ((selectedEmail as any).channel === "email" || !(selectedEmail as any).channel)
                  ? (campaigns.find(c => c.id === selectedEmail.id) as any)?.leads?.email
                    ? <Button onClick={(e) => { sendEmail(e, selectedEmail.id); setSelectedEmail(null); }}><Send className="h-4 w-4 mr-2" /> Send Email</Button>
                    : <p className="text-sm text-muted-foreground">Cannot send — lead has no email.</p>
                  : <Button variant="outline" onClick={(e) => { copyMsg(e, selectedEmail.body); setSelectedEmail(null); }}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Campaigns;
