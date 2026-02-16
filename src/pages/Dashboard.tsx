import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, Mail, MessageSquare, TrendingUp, Eye, XCircle, CheckCircle2, Search, Send, Zap, RefreshCw, Flame, Star } from "lucide-react";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const activityLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  leads_discovered: { label: "Discovered leads", icon: <Search className="h-3.5 w-3.5" /> },
  auto_discovery: { label: "Auto-discovered leads", icon: <Zap className="h-3.5 w-3.5" /> },
  email_generated: { label: "Email drafted", icon: <Mail className="h-3.5 w-3.5" /> },
  email_sent: { label: "Email sent", icon: <Send className="h-3.5 w-3.5" /> },
  auto_email_sent: { label: "Auto-sent email", icon: <Send className="h-3.5 w-3.5" /> },
  follow_up_generated: { label: "Follow-up drafted", icon: <RefreshCw className="h-3.5 w-3.5" /> },
  response_classified: { label: "Response classified", icon: <MessageSquare className="h-3.5 w-3.5" /> },
};

const formatDetails = (action: string, details: any): string => {
  if (!details || typeof details !== "object") return "";
  switch (action) {
    case "leads_discovered":
    case "auto_discovery":
      return `${details.leads_added || 0} new ${details.category || ""} leads in ${details.location || "Kenya"}`;
    case "email_generated":
    case "follow_up_generated":
      return `${details.business_name || "Business"} — ${details.template || details.template_type || "email"}`;
    case "email_sent":
    case "auto_email_sent":
      return `To ${details.business_name || details.to || "lead"}`;
    case "response_classified":
      return `${details.business_name || "Lead"} — ${details.classification || ""}`;
    default:
      return JSON.stringify(details);
  }
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0, qualified: 0, contacted: 0, responded: 0, interested: 0, notInterested: 0, emailsSent: 0, drafts: 0, responseRate: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [{ data: leads }, { data: emails }, { data: logs }] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user.id),
        supabase.from("email_campaigns").select("status").eq("user_id", user.id),
        supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);

      if (leads) {
        const contacted = leads.filter((l) => l.status === "contacted").length;
        const responded = leads.filter((l) => l.status === "responded").length;
        const interested = leads.filter((l) => l.status === "interested").length;
        setStats({
          totalLeads: leads.length,
          qualified: leads.filter((l) => l.status === "qualified").length,
          contacted, responded, interested,
          notInterested: leads.filter((l) => l.status === "not_interested").length,
          emailsSent: emails?.filter((e) => e.status === "sent").length || 0,
          drafts: emails?.filter((e) => e.status === "draft").length || 0,
          responseRate: contacted > 0 ? Math.round((responded / contacted) * 100) : 0,
        });

        const hot = leads
          .filter((l: any) => l.status === "interested" || (l.priority_score && l.priority_score >= 8))
          .sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0))
          .slice(0, 5);
        setHotLeads(hot);
      }

      if (logs) setActivities(logs);
    };

    fetchStats();
  }, [user]);

  // Filter activities by date
  const filteredActivities = dateRange
    ? activities.filter((a) => {
        const d = new Date(a.created_at);
        return d >= dateRange.from && d <= dateRange.to;
      })
    : activities;

  const metricCards = [
    { label: "Total Leads", value: stats.totalLeads, icon: Users, color: "text-primary" },
    { label: "Emails Sent", value: stats.emailsSent, icon: Mail, color: "text-blue-500 dark:text-blue-400", sub: `${stats.drafts} drafts` },
    { label: "Response Rate", value: `${stats.responseRate}%`, icon: MessageSquare, color: "text-amber-500 dark:text-amber-400" },
    { label: "Interested", value: stats.interested, icon: TrendingUp, color: "text-emerald-500 dark:text-emerald-400" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your lead generation pipeline at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  {"sub" in card && card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                </div>
                <card.icon className={`h-8 w-8 ${card.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Pipeline Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { label: "Discovered", count: stats.totalLeads, icon: Eye },
              { label: "Qualified", count: stats.qualified, icon: CheckCircle2 },
              { label: "Contacted", count: stats.contacted, icon: Mail },
              { label: "Responded", count: stats.responded, icon: MessageSquare },
              { label: "Interested", count: stats.interested, icon: TrendingUp },
              { label: "Not Interested", count: stats.notInterested, icon: XCircle },
            ].map((stage, i, arr) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center p-4 rounded-lg bg-muted min-w-[100px]">
                  <stage.icon className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-2xl font-bold">{stage.count}</span>
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                </div>
                {i < arr.length - 1 && <span className="text-muted-foreground text-lg">→</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {hotLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" /> Hot Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hotLeads.map((lead: any) => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-sm">{lead.business_name}</p>
                      <p className="text-xs text-muted-foreground">{lead.category} • {lead.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs border-0 ${lead.status === "interested" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                      {lead.status === "interested" ? "Interested" : "High Priority"}
                    </Badge>
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-medium">{lead.priority_score || 5}/10</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <DateFilter defaultPreset="all" onChange={setDateRange} />
          {filteredActivities.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No activity yet. Start by discovering leads!</p>
          ) : (
            <div className="space-y-2 mt-4">
              {filteredActivities.map((activity) => {
                const info = activityLabels[activity.action] || { label: activity.action, icon: null };
                return (
                  <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {info.icon}
                      <Badge variant="outline" className="text-xs">{info.label}</Badge>
                    </div>
                    <span className="text-sm flex-1 text-muted-foreground truncate">
                      {formatDetails(activity.action, activity.details)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
