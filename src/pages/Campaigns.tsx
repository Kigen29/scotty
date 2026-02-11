import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Send, Eye, Clock, AlertCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const Campaigns = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<(Tables<"email_campaigns"> & { leads?: Tables<"leads"> })[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Tables<"email_campaigns"> | null>(null);

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

  const statusIcon: Record<string, React.ReactNode> = {
    draft: <Clock className="h-3.5 w-3.5" />,
    sent: <Send className="h-3.5 w-3.5" />,
    opened: <Eye className="h-3.5 w-3.5" />,
    replied: <Mail className="h-3.5 w-3.5" />,
    bounced: <AlertCircle className="h-3.5 w-3.5" />,
  };

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
    sent: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    opened: "bg-primary/10 text-primary",
    replied: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    bounced: "bg-destructive/10 text-destructive",
    failed: "bg-destructive/10 text-destructive",
  };

  const templateLabel: Record<string, string> = {
    first_touch: "First Touch",
    follow_up_1: "Follow-up #1",
    follow_up_2: "Follow-up #2",
    final_follow_up: "Final",
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Email Campaigns</h1>
        <p className="text-muted-foreground mt-1">AI-crafted outreach emails and follow-ups</p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="replied">Replied</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <CampaignList
            campaigns={campaigns}
            statusColor={statusColor}
            statusIcon={statusIcon}
            templateLabel={templateLabel}
            onPreview={setSelectedEmail}
          />
        </TabsContent>
        <TabsContent value="draft" className="mt-4">
          <CampaignList
            campaigns={campaigns.filter((c) => c.status === "draft")}
            statusColor={statusColor}
            statusIcon={statusIcon}
            templateLabel={templateLabel}
            onPreview={setSelectedEmail}
          />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <CampaignList
            campaigns={campaigns.filter((c) => c.status === "sent")}
            statusColor={statusColor}
            statusIcon={statusIcon}
            templateLabel={templateLabel}
            onPreview={setSelectedEmail}
          />
        </TabsContent>
        <TabsContent value="replied" className="mt-4">
          <CampaignList
            campaigns={campaigns.filter((c) => c.status === "replied")}
            statusColor={statusColor}
            statusIcon={statusIcon}
            templateLabel={templateLabel}
            onPreview={setSelectedEmail}
          />
        </TabsContent>
      </Tabs>

      {/* Email Preview Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Subject</p>
                <p className="font-medium">{selectedEmail.subject}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Body</p>
                <div className="mt-2 p-4 rounded-lg bg-muted whitespace-pre-wrap text-sm">
                  {selectedEmail.body}
                </div>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                {selectedEmail.sent_at && <span>Sent: {new Date(selectedEmail.sent_at).toLocaleString()}</span>}
                {selectedEmail.opened_at && <span>Opened: {new Date(selectedEmail.opened_at).toLocaleString()}</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {campaigns.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No campaigns yet</p>
          <p className="text-sm">Campaigns will be created automatically when leads are approved for outreach</p>
        </div>
      )}
    </div>
  );
};

const CampaignList = ({
  campaigns,
  statusColor,
  statusIcon,
  templateLabel,
  onPreview,
}: {
  campaigns: any[];
  statusColor: Record<string, string>;
  statusIcon: Record<string, React.ReactNode>;
  templateLabel: Record<string, string>;
  onPreview: (c: any) => void;
}) => (
  <div className="space-y-3">
    {campaigns.map((campaign) => (
      <Card key={campaign.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onPreview(campaign)}>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{campaign.subject}</p>
              <Badge className={`text-xs ${statusColor[campaign.status] || ""}`}>
                <span className="flex items-center gap-1">
                  {statusIcon[campaign.status]}
                  {campaign.status}
                </span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              To: {campaign.leads?.business_name || "Unknown"} • {templateLabel[campaign.template_type] || campaign.template_type}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(campaign.created_at).toLocaleDateString()}
          </span>
        </CardContent>
      </Card>
    ))}
  </div>
);

export default Campaigns;
