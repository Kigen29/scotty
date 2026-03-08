import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, Mail, MessageSquare, TrendingUp, Flame, Star, Zap, Send } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0, qualified: 0, contacted: 0, responded: 0, interested: 0, notInterested: 0, emailsSent: 0, drafts: 0, responseRate: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [quota, setQuota] = useState({ sent: 0, limit: 50 });

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ data: leads }, { data: emails }, { data: logs }, { data: settingsData }, { count: sentToday }] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user.id),
        supabase.from("email_campaigns").select("*").eq("user_id", user.id),
        supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
        supabase.from("settings").select("daily_send_limit").eq("user_id", user.id).maybeSingle(),
        supabase.from("email_campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("sent_at", todayStart.toISOString()),
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
        setHotLeads(
          leads.filter((l: any) => l.status === "interested" || (l.priority_score && l.priority_score >= 8))
            .sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0))
            .slice(0, 5)
        );

        // Build 7-day chart
        const now = new Date();
        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(now.getTime() - (6 - i) * 86400000);
          const dayStr = d.toISOString().split("T")[0];
          return {
            day: d.toLocaleDateString("en", { weekday: "short" }),
            discovered: leads.filter((l) => l.created_at?.startsWith(dayStr)).length,
            contacted: leads.filter((l) => l.status === "contacted" && l.updated_at?.startsWith(dayStr)).length,
            emails: emails?.filter((e) => e.sent_at?.startsWith(dayStr)).length || 0,
          };
        });
        setChartData(days);
      }
      if (logs) setActivities(logs);
      setQuota({
        sent: sentToday || 0,
        limit: settingsData?.daily_send_limit || 50,
      });
    };
    fetchAll();
  }, [user]);

  const metricCards = [
    { label: "TOTAL LEADS", value: stats.totalLeads, icon: Users, accent: "text-primary" },
    { label: "EMAILS SENT", value: stats.emailsSent, icon: Send, accent: "text-blue-500", sub: `${stats.drafts} drafts` },
    { label: "RESPONSE RATE", value: `${stats.responseRate}%`, icon: MessageSquare, accent: "text-amber-500" },
    { label: "INTERESTED", value: stats.interested, icon: TrendingUp, accent: "text-emerald-500" },
  ];

  // Pipeline data
  const pipeline = [
    { label: "Discovered", count: stats.totalLeads, color: "bg-muted-foreground" },
    { label: "Qualified", count: stats.qualified, color: "bg-blue-500" },
    { label: "Contacted", count: stats.contacted, color: "bg-amber-500" },
    { label: "Responded", count: stats.responded, color: "bg-primary" },
    { label: "Interested", count: stats.interested, color: "bg-emerald-500" },
  ];
  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your lead generation pipeline at a glance</p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.label} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                </div>
                <div className={`p-2 rounded-lg bg-muted ${card.accent}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline funnel */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {pipeline.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-xs w-20 text-muted-foreground text-right">{stage.label}</span>
                <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden">
                  <div
                    className={`h-full ${stage.color} rounded-md flex items-center px-2.5 transition-all duration-500`}
                    style={{ width: `${Math.max((stage.count / maxPipeline) * 100, 3)}%` }}
                  >
                    <span className="text-[11px] font-semibold text-white">{stage.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Area Chart */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">7-Day Activity</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradDiscovered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEmails" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(220 80% 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(220 80% 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Area type="monotone" dataKey="discovered" name="Discovered" stroke="hsl(var(--primary))" fill="url(#gradDiscovered)" strokeWidth={2} />
                <Area type="monotone" dataKey="emails" name="Emails" stroke="hsl(220 80% 55%)" fill="url(#gradEmails)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hot Leads Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" /> Hot Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hotLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hot leads yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Business</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hotLeads.map((lead: any) => (
                    <TableRow key={lead.id}>
                      <TableCell className="text-sm font-medium">{lead.business_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.location}</TableCell>
                      <TableCell>
                        <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {lead.status === "interested" ? "Interested" : "High Priority"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs">{lead.priority_score || 5}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-1.5">
              {activities.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{a.action?.replace(/_/g, " ")}</span>
                    {a.details?.business_name && (
                      <span className="text-xs text-muted-foreground ml-1.5">— {a.details.business_name}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{relativeTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
