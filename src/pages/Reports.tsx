import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, TrendingUp, TrendingDown, Mail, Users, MessageSquare, Flame, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const Reports = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: l }, { data: c }, { data: a }] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user.id),
        supabase.from("email_campaigns").select("*").eq("user_id", user.id),
        supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (l) setLeads(l);
      if (c) setCampaigns(c);
      if (a) setActivities(a);
    };
    fetchData();
  }, [user]);

  // Filter by date range
  const filterByDate = (items: any[], dateField = "created_at") =>
    dateRange ? items.filter((i) => { const d = new Date(i[dateField]); return d >= dateRange.from && d <= dateRange.to; }) : items;

  const filteredLeads = filterByDate(leads);
  const filteredCampaigns = filterByDate(campaigns);
  const filteredActivities = filterByDate(activities);

  const totalEmails = filteredCampaigns.length;
  const sentEmails = filteredCampaigns.filter((c) => c.status !== "draft").length;
  const repliedEmails = filteredCampaigns.filter((c) => c.status === "replied").length;
  const responseRate = sentEmails > 0 ? ((repliedEmails / sentEmails) * 100).toFixed(1) : "0";

  // Daily activity chart (last 7 days)
  const now = new Date();
  const dailyData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const dayStr = date.toISOString().split("T")[0];
    const dayLabel = date.toLocaleDateString("en", { weekday: "short" });
    const discovered = activities.filter((a) => a.action.includes("discover") && a.created_at.startsWith(dayStr)).length;
    const emailsSent = activities.filter((a) => a.action.includes("email_sent") && a.created_at.startsWith(dayStr)).length;
    return { day: dayLabel, discovered, sent: emailsSent };
  });

  const hotLeads = filteredLeads
    .filter((l: any) => l.status === "interested" || (l.priority_score && l.priority_score >= 8))
    .sort((a: any, b: any) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, 5);

  const funnelStages = [
    { label: "Discovered", count: filteredLeads.length, color: "hsl(var(--muted-foreground))" },
    { label: "Contacted", count: filteredLeads.filter((l) => ["contacted", "responded", "interested", "not_interested", "converted"].includes(l.status)).length, color: "hsl(var(--primary))" },
    { label: "Responded", count: filteredLeads.filter((l) => ["responded", "interested", "not_interested", "converted"].includes(l.status)).length, color: "hsl(220 80% 55%)" },
    { label: "Interested", count: filteredLeads.filter((l) => ["interested", "converted"].includes(l.status)).length, color: "hsl(142 70% 45%)" },
    { label: "Converted", count: filteredLeads.filter((l) => l.status === "converted").length, color: "hsl(45 90% 50%)" },
  ];

  const TrendIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null;
    return value > 0 ? (
      <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400"><TrendingUp className="h-3 w-3" /> +{value}%</span>
    ) : (
      <span className="flex items-center gap-0.5 text-xs text-red-500"><TrendingDown className="h-3 w-3" /> {value}%</span>
    );
  };

  const exportCSV = () => {
    const headers = ["Business Name", "Category", "Location", "Email", "Phone", "Status", "Priority", "Discovered At"];
    const rows = filteredLeads.map((l: any) => [l.business_name, l.category, l.location, l.email, l.phone, l.status, l.priority_score || 5, l.discovered_at]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_report.csv";
    a.click();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Track your outreach performance</p>
        </div>
        <Button onClick={exportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <DateFilter defaultPreset="this_week" onChange={setDateRange} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: totalEmails, icon: Mail, trend: 0 },
          { label: "Sent", value: sentEmails, icon: TrendingUp, trend: 0 },
          { label: "Response Rate", value: `${responseRate}%`, icon: MessageSquare, trend: 0 },
          { label: "Total Leads", value: filteredLeads.length, icon: Users, trend: 0 },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{m.label}</p>
                <p className="text-2xl font-bold mt-1">{m.value}</p>
              </div>
              <m.icon className="h-6 w-6 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Daily Activity (Last 7 Days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs fill-muted-foreground" />
              <YAxis className="text-xs fill-muted-foreground" />
              <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} labelStyle={{ color: "hsl(var(--foreground))" }} />
              <Bar dataKey="discovered" name="Discovered" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sent" name="Emails Sent" fill="hsl(220 80% 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {hotLeads.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" /> Hot Leads</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hotLeads.map((lead: any) => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm">{lead.business_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.category} • {lead.location}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{lead.status}</Badge>
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
        <CardHeader><CardTitle>Lead Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelStages.map((stage) => {
              const maxCount = Math.max(...funnelStages.map((s) => s.count), 1);
              const width = Math.max((stage.count / maxCount) * 100, 4);
              return (
                <div key={stage.label} className="flex items-center gap-4">
                  <span className="text-sm w-24 text-muted-foreground">{stage.label}</span>
                  <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg flex items-center px-3 transition-all" style={{ width: `${width}%`, backgroundColor: stage.color }}>
                      <span className="text-xs font-medium text-white">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Leads by Category</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(
              filteredLeads.reduce((acc, l) => {
                const cat = l.category || "Uncategorized";
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([cat, count]) => (
              <div key={cat} className="p-4 rounded-lg bg-muted text-center">
                <p className="text-2xl font-bold">{count as number}</p>
                <p className="text-xs text-muted-foreground capitalize">{cat}</p>
              </div>
            ))}
          </div>
          {filteredLeads.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No data yet</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
