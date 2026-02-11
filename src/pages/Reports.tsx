import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BarChart3, Download, TrendingUp, Mail, Users, MessageSquare } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const Reports = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Tables<"leads">[]>([]);
  const [campaigns, setCampaigns] = useState<Tables<"email_campaigns">[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: l }, { data: c }] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user.id),
        supabase.from("email_campaigns").select("*").eq("user_id", user.id),
      ]);
      if (l) setLeads(l);
      if (c) setCampaigns(c);
    };
    fetchData();
  }, [user]);

  const totalEmails = campaigns.length;
  const sentEmails = campaigns.filter((c) => c.status !== "draft").length;
  const openedEmails = campaigns.filter((c) => c.status === "opened" || c.status === "replied").length;
  const repliedEmails = campaigns.filter((c) => c.status === "replied").length;
  const responseRate = sentEmails > 0 ? ((repliedEmails / sentEmails) * 100).toFixed(1) : "0";

  const funnelStages = [
    { label: "Discovered", count: leads.length, color: "bg-muted" },
    { label: "Contacted", count: leads.filter((l) => ["contacted", "responded", "interested", "not_interested", "converted"].includes(l.status)).length, color: "bg-[hsl(var(--info))]" },
    { label: "Responded", count: leads.filter((l) => ["responded", "interested", "not_interested", "converted"].includes(l.status)).length, color: "bg-[hsl(var(--warning))]" },
    { label: "Interested", count: leads.filter((l) => ["interested", "converted"].includes(l.status)).length, color: "bg-primary" },
    { label: "Converted", count: leads.filter((l) => l.status === "converted").length, color: "bg-[hsl(var(--success))]" },
  ];

  const exportCSV = () => {
    const headers = ["Business Name", "Category", "Location", "Email", "Phone", "Status", "Discovered At"];
    const rows = leads.map((l) => [l.business_name, l.category, l.location, l.email, l.phone, l.status, l.discovered_at]);
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

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Emails", value: totalEmails, icon: Mail },
          { label: "Sent", value: sentEmails, icon: TrendingUp },
          { label: "Response Rate", value: `${responseRate}%`, icon: MessageSquare },
          { label: "Total Leads", value: leads.length, icon: Users },
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

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelStages.map((stage) => {
              const maxCount = Math.max(...funnelStages.map((s) => s.count), 1);
              const width = Math.max((stage.count / maxCount) * 100, 4);
              return (
                <div key={stage.label} className="flex items-center gap-4">
                  <span className="text-sm w-24 text-muted-foreground">{stage.label}</span>
                  <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-lg flex items-center px-3 transition-all`}
                      style={{ width: `${width}%` }}
                    >
                      <span className="text-xs font-medium text-primary-foreground">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Leads by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(
              leads.reduce((acc, l) => {
                const cat = l.category || "Uncategorized";
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([cat, count]) => (
              <div key={cat} className="p-4 rounded-lg bg-muted text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">{cat}</p>
              </div>
            ))}
          </div>
          {leads.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
