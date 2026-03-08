import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useTeam } from "@/hooks/useTeam";
import { Users, Mail, MessageSquare, TrendingUp, Flame, Star, Zap, Send, Gauge, CalendarDays, UserCircle } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExportableChart from "@/components/ExportableChart";

const PIPELINE_COLORS = [
  "hsl(var(--muted-foreground))",
  "hsl(220 80% 55%)",
  "hsl(38 92% 50%)",
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
];

const Dashboard = () => {
  const { user } = useAuth();
  const { members, teamId } = useTeam();
  const [stats, setStats] = useState({
    totalLeads: 0, qualified: 0, contacted: 0, responded: 0, interested: 0, notInterested: 0, emailsSent: 0, drafts: 0, responseRate: 0, meetingsBooked: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [teamActivities, setTeamActivities] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [quota, setQuota] = useState({ sent: 0, limit: 50 });

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ data: leads }, { data: emails }, { data: logs }, { data: settingsData }, { count: sentToday }, { count: meetingsCount }] = await Promise.all([
      supabase.from("leads").select("*").eq("user_id", user.id),
      supabase.from("email_campaigns").select("*").eq("user_id", user.id),
      supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
      supabase.from("settings").select("daily_send_limit").eq("user_id", user.id).maybeSingle(),
      supabase.from("email_campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("sent_at", todayStart.toISOString()),
      supabase.from("meetings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
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
        meetingsBooked: meetingsCount || 0,
      });
      setHotLeads(
        leads.filter((l: any) => l.status === "interested" || (l.priority_score && l.priority_score >= 8))
          .sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0))
          .slice(0, 5)
      );

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
  }, [user]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  useEffect(() => {
    if (!teamId || members.length === 0) {
      setTeamActivities([]);
      return;
    }
    const fetchTeamActivity = async () => {
      const memberIds = members.map((m) => m.user_id);
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .in("user_id", memberIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setTeamActivities(data);
    };
    fetchTeamActivity();
  }, [teamId, members]);

  useRealtimeSubscription("leads", user?.id, fetchAll);
  useRealtimeSubscription("email_campaigns", user?.id, fetchAll);
  useRealtimeSubscription("activity_logs", user?.id, fetchAll);

  const metricCards = [
    { label: "TOTAL LEADS", value: stats.totalLeads, icon: Users, accent: "text-primary" },
    { label: "EMAILS SENT", value: stats.emailsSent, icon: Send, accent: "text-blue-500", sub: `${stats.drafts} drafts` },
    { label: "RESPONSE RATE", value: `${stats.responseRate}%`, icon: MessageSquare, accent: "text-amber-500" },
    { label: "INTERESTED", value: stats.interested, icon: TrendingUp, accent: "text-emerald-500" },
    { label: "MEETINGS", value: stats.meetingsBooked, icon: CalendarDays, accent: "text-violet-500" },
  ];

  // Pipeline data for vertical bar chart
  const pipelineData = [
    { label: "Discovered", count: stats.totalLeads },
    { label: "Qualified", count: stats.qualified },
    { label: "Contacted", count: stats.contacted },
    { label: "Responded", count: stats.responded },
    { label: "Interested", count: stats.interested },
  ];

  const memberNameMap: Record<string, string> = {};
  members.forEach((m) => { memberNameMap[m.user_id] = m.display_name; });

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = user?.email?.split("@")[0] || "";

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: 12,
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{getGreeting()}, {displayName} 👋</h1>
        <p className="text-sm text-muted-foreground">Your lead generation pipeline at a glance</p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Daily Quota */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Today's Send Quota</span>
            </div>
            <span className="text-sm font-semibold">{quota.sent} / {quota.limit}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min((quota.sent / quota.limit) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {quota.limit - quota.sent > 0 ? `${quota.limit - quota.sent} emails remaining today` : "Daily limit reached"}
          </p>
        </CardContent>
      </Card>

      {/* Pipeline — vertical bar chart */}
      <ExportableChart title="Pipeline" fileName="pipeline">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={pipelineData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
              {pipelineData.map((_, i) => (
                <Cell key={i} fill={PIPELINE_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ExportableChart>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Area Chart */}
        <ExportableChart title="7-Day Activity" fileName="7day_activity">
          <ResponsiveContainer width="100%" height={300}>
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
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="discovered" name="Discovered" stroke="hsl(var(--primary))" fill="url(#gradDiscovered)" strokeWidth={2} />
              <Area type="monotone" dataKey="emails" name="Emails" stroke="hsl(220 80% 55%)" fill="url(#gradEmails)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ExportableChart>

        {/* Hot Leads Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" /> Hot Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
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

      {/* Activity Feed with Team Tab */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="mine">
            <TabsList className="mb-3">
              <TabsTrigger value="mine">My Activity</TabsTrigger>
              {members.length > 1 && (
                <TabsTrigger value="team">
                  <Users className="h-3 w-3 mr-1.5" /> Team
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="mine">
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
            </TabsContent>

            {members.length > 1 && (
              <TabsContent value="team">
                {teamActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No team activity yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {teamActivities.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-primary">
                            {memberNameMap[a.user_id] || "Unknown"}
                          </span>
                          <span className="text-sm ml-1.5">{a.action?.replace(/_/g, " ")}</span>
                          {a.details?.business_name && (
                            <span className="text-xs text-muted-foreground ml-1.5">— {a.details.business_name}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{relativeTime(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
