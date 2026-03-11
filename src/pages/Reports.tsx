import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, Mail, Users, MessageSquare, TrendingUp } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { DateFilter, type DateRange } from "@/components/DateFilter";
import ExportableChart from "@/components/ExportableChart";

const FUNNEL_COLORS = [
  "hsl(var(--muted-foreground))",
  "hsl(var(--primary))",
  "hsl(220 80% 55%)",
  "hsl(142 71% 45%)",
];

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

  const sent = fc.filter((c) => c.sent_at != null).length;
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
      discovered: leads.filter((l) => l.discovered_at?.startsWith(ds)).length,
      sent: campaigns.filter((c) => c.sent_at?.startsWith(ds)).length,
    };
  });

  // Funnel as vertical bar data
  const funnelData = [
    { label: "Discovered", count: fl.length },
    { label: "Contacted", count: fl.filter((l) => ["contacted","responded","interested","not_interested"].includes(l.status)).length },
    { label: "Responded", count: fl.filter((l) => ["responded","interested"].includes(l.status)).length },
    { label: "Interested", count: fl.filter((l) => l.status === "interested").length },
  ];

  // Category distribution — vertical bars
  const catData = Object.entries(
    fl.reduce((acc, l) => { acc[l.category || "Other"] = (acc[l.category || "Other"] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, count]) => ({ name, count })).sort((a, b) => (b.count as number) - (a.count as number)).slice(0, 10);

  // Campaign table
  const campaignStats = fc.slice(0, 10);

  const exportCSV = () => {
    const h = ["Business Name","Category","Location","Email","Phone","Status","Priority","Discovered At"];
    const rows = fl.map((l: any) => [l.business_name,l.category,l.location,l.email,l.phone,l.status,l.priority_score||5,l.discovered_at]);
    const csv = [h,...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads_report.csv"; a.click();
  };

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: 12,
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Track your outreach performance</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" /> Export CSV
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

      {/* Daily Activity — full width */}
      <ExportableChart title="Daily Activity" fileName="daily_activity">
        <ResponsiveContainer width="100%" height={300}>
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
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="discovered" name="Discovered" stroke="hsl(var(--primary))" fill="url(#gDisc)" strokeWidth={2} />
            <Area type="monotone" dataKey="sent" name="Emails" stroke="hsl(220 80% 55%)" fill="url(#gSent)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ExportableChart>

      {/* Conversion Funnel — vertical bars */}
      <ExportableChart title="Conversion Funnel" fileName="conversion_funnel">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={funnelData} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
              {funnelData.map((_, i) => (
                <Cell key={i} fill={FUNNEL_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ExportableChart>

      {/* Leads by Category — vertical bars */}
      <ExportableChart title="Leads by Category" fileName="leads_by_category">
        {catData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={catData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                angle={-35}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Leads" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ExportableChart>

      {/* Campaign Performance */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent Campaigns</CardTitle></CardHeader>
        <CardContent className="p-6">
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
