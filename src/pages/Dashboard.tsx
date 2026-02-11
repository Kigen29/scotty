import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, Mail, MessageSquare, TrendingUp, Eye, XCircle, CheckCircle2 } from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0,
    contacted: 0,
    responded: 0,
    interested: 0,
    notInterested: 0,
    emailsSent: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data: leads } = await supabase
        .from("leads")
        .select("status")
        .eq("user_id", user.id);

      const { data: emails } = await supabase
        .from("email_campaigns")
        .select("status")
        .eq("user_id", user.id);

      const { data: logs } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (leads) {
        setStats({
          totalLeads: leads.length,
          contacted: leads.filter((l) => l.status === "contacted").length,
          responded: leads.filter((l) => l.status === "responded").length,
          interested: leads.filter((l) => l.status === "interested").length,
          notInterested: leads.filter((l) => l.status === "not_interested").length,
          emailsSent: emails?.filter((e) => e.status === "sent").length || 0,
        });
      }

      if (logs) setActivities(logs);
    };

    fetchStats();
  }, [user]);

  const metricCards = [
    { label: "Total Leads", value: stats.totalLeads, icon: Users, color: "text-primary" },
    { label: "Emails Sent", value: stats.emailsSent, icon: Mail, color: "text-[hsl(var(--info))]" },
    { label: "Responded", value: stats.responded, icon: MessageSquare, color: "text-[hsl(var(--warning))]" },
    { label: "Interested", value: stats.interested, icon: TrendingUp, color: "text-[hsl(var(--success))]" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your lead generation pipeline at a glance</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { label: "Discovered", count: stats.totalLeads, icon: Eye },
              { label: "Contacted", count: stats.contacted, icon: Mail },
              { label: "Responded", count: stats.responded, icon: MessageSquare },
              { label: "Interested", count: stats.interested, icon: CheckCircle2 },
              { label: "Not Interested", count: stats.notInterested, icon: XCircle },
            ].map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center p-4 rounded-lg bg-muted min-w-[120px]">
                  <stage.icon className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-2xl font-bold">{stage.count}</span>
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                </div>
                {i < 4 && <span className="text-muted-foreground text-lg">→</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No activity yet. Start by discovering leads!
            </p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Badge variant="outline" className="text-xs">
                    {activity.action}
                  </Badge>
                  <span className="text-sm flex-1">
                    {typeof activity.details === "object" && activity.details
                      ? JSON.stringify(activity.details)
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.created_at).toLocaleString()}
                  </span>
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
