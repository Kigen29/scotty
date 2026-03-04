import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, Mail, Users, MessageSquare, TrendingUp, Flame, Star } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const Reports = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [{ data: l }, { data: c }, { data: a }] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user.id),
        supabase.from("email_campaigns").select("*, leads(business_name)").eq("user_id", user.id),
        supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (l) setLeads(l);
      if (c) setCampaigns(c);
      if (a) setActivities(a);
    };
    fetch();
  }, [user]);

  const filterByDate = (items: any[], field = "created_at") =>
    dateRange ? items.filter((i) => { const d = new Date(i[field]); return d >= dateRange.from && d <= dateRange.to; }) : items;

  const fl = filterByDate(leads);
  const fc = filterByDate(campaigns);

  const sent = fc.filter((c) => c.status !== "draft").length;
  const replied = fc.filter((c) => c.status === "replied").length;
  const rate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0";

  const metrics = [
    { label: "TOTAL LEADS", value: fl.length, icon: Users },
    { label: "EMAILS SENT", value: sent, icon: Mail },
    { label: "RESPONSE RATE", value: `${rate}%`, icon: MessageSquare },
    { label: "INTERESTED", value: fl.filter((l) => l.status === "interested").length, icon: TrendingUp },
  ];

  // 7-day chart
  const now = new Date();
  const dailyData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000);
    const ds = d.toISOString().split("T")[0];
    return {
      day: d.toLocaleDateString("en", { weekday: "short" }),
      discovered: activities.filter((a) => a.action?.includes("discover") && a.created_at?.startsWith(ds)).length,
      sent: activities.filter((a) => a.action?.includes("email_sent") && a.created_at?.startsWith(ds)).length,
    };
  });

  // Funnel
  const funnel = [
    { label: "Discovered", count: fl.length, color: "bg-muted-foreground" },
    { label: "Contacted", count: fl.filter((l) => ["contacted","responded","interested","not_interested"].includes(l.status)).length, color: "bg-primary" },
    { label: "Responded", count: fl.filter((l) => ["responded","interested"].includes(l.status)).length, color: "bg-blue-500" },
    { label: "Interested", count: fl.filter((l) => l.status === "interested").length, color: "bg-emerald-500" },
  ];
  const maxF = Math.max(...funnel.map((f) => f.count), 1);

  // Category distribution
  const catData = Object.entries(
    fl.reduce((acc, l) => { acc[l.category || "Other"] = (acc[l.category || "Other"] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, count]) => ({ name, count })).sort((a, b) => (b.count as number) - (a.count as number));

  // Campaign table
  const campaignStats = fc.slice(0, 10);

  const exportCSV = () => {
    const h = ["Business Name","Category","Location","Email","Phone","Status","Priority","Discovered At"];
    const rows = fl.map((l: any) => [l.business_name,l.category,l.location,l.email,l.phone,l.status,l.priority_score||5,l.discovered_at]);
    const csv = [h,...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads_report.csv"; a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Track your outreach performance</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      <DateFilter defaultPreset="this_week" onChange={setDateRange} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{m.label}</p>
                  <p className="text-3xl font-bold mt-1">{m.value}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted"><m.icon className="h-5 w-5 text-muted-foreground" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Chart */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Daily Activity</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="gDisc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(220 80% 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(220 80% 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Area type="monotone" dataKey="discovered" name="Discovered" stroke="hsl(var(--primary))" fill="url(#gDisc)" strokeWidth={2} />
                <Area type="monotone" dataKey="sent" name="Emails" stroke="hsl(220 80% 55%)" fill="url(#gSent)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Leads by Category</CardTitle></CardHeader>
          <CardContent>
            {catData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} className="fill-muted-foreground" />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                  <Bar dataKey="count" name="Leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {funnel.map((f) => {
              const pct = fl.length > 0 ? ((f.count / fl.length) * 100).toFixed(0) : "0";
              return (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="text-xs w-20 text-right text-muted-foreground">{f.label}</span>
                  <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden">
                    <div className={`h-full ${f.color} rounded-md flex items-center px-2.5 transition-all duration-500`}
                      style={{ width: `${Math.max((f.count / maxF) * 100, 3)}%` }}>
                      <span className="text-[11px] font-semibold text-white">{f.count}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-10">{pct}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Campaign Performance */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent Campaigns</CardTitle></CardHeader>
        <CardContent>
          {campaignStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No campaigns yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">Lead</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignStats.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium truncate max-w-[200px]">{c.subject}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.leads?.business_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{(c.channel || "email").replace("_", " ")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
