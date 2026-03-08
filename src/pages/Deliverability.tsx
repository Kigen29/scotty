import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import {
  Mail, ShieldCheck, ShieldAlert, Eye, MailOpen, ArrowDownCircle,
  TrendingUp, Trophy, Beaker,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import ExportableChart from "@/components/ExportableChart";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(220 80% 55%)",
];

const Deliverability = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [abTests, setAbTests] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: c }, { data: ab }] = await Promise.all([
      supabase
        .from("email_campaigns")
        .select("*, leads(business_name, email)")
        .eq("user_id", user.id)
        .neq("status", "draft"),
      supabase
        .from("ab_tests")
        .select("*, campaign_a:email_campaigns!ab_tests_campaign_a_id_fkey(id,subject,status,opened_at,sent_at), campaign_b:email_campaigns!ab_tests_campaign_b_id_fkey(id,subject,status,opened_at,sent_at), leads(business_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    if (c) setCampaigns(c);
    if (ab) setAbTests(ab);
  }, [user]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  useRealtimeSubscription("email_campaigns", user?.id, fetchAll);

  const stats = useMemo(() => {
    const sent = campaigns.filter((c) => ["sent", "opened", "replied", "bounced", "delivered"].includes(c.status));
    const opened = campaigns.filter((c) => c.opened_at || c.status === "opened" || c.status === "replied");
    const bounced = campaigns.filter((c) => c.status === "bounced");
    const replied = campaigns.filter((c) => c.status === "replied");
    const total = sent.length || 1;
    return {
      totalSent: sent.length,
      openRate: Math.round((opened.length / total) * 100),
      bounceRate: Math.round((bounced.length / total) * 100),
      replyRate: Math.round((replied.length / total) * 100),
      opened: opened.length,
      bounced: bounced.length,
      replied: replied.length,
    };
  }, [campaigns]);

  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    campaigns.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [campaigns]);

  const dailyVolume = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(now.getTime() - (13 - i) * 86400000);
      const ds = d.toISOString().split("T")[0];
      const dayCampaigns = campaigns.filter((c) => c.sent_at?.startsWith(ds));
      return {
        day: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
        sent: dayCampaigns.length,
        opened: dayCampaigns.filter((c) => c.opened_at || c.status === "opened").length,
        bounced: dayCampaigns.filter((c) => c.status === "bounced").length,
      };
    });
  }, [campaigns]);

  const healthScore = useMemo(() => {
    if (stats.totalSent === 0) return 100;
    const penalty = stats.bounceRate * 2;
    return Math.max(0, Math.min(100, 100 - penalty + Math.floor(stats.openRate / 5)));
  }, [stats]);

  const healthColor =
    healthScore >= 80 ? "text-emerald-500" : healthScore >= 50 ? "text-amber-500" : "text-destructive";

  const metricCards = [
    { label: "EMAILS SENT", value: stats.totalSent, icon: Mail, accent: "text-primary" },
    { label: "OPEN RATE", value: `${stats.openRate}%`, icon: MailOpen, accent: "text-emerald-500" },
    { label: "BOUNCE RATE", value: `${stats.bounceRate}%`, icon: ArrowDownCircle, accent: "text-destructive" },
    { label: "REPLY RATE", value: `${stats.replyRate}%`, icon: TrendingUp, accent: "text-blue-500" },
  ];

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: 12,
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Deliverability</h1>
        <p className="text-sm text-muted-foreground">Email health, open/bounce tracking, and A/B test results</p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {card.label}
                  </p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`p-2 rounded-lg bg-muted ${card.accent}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sender Health */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`h-6 w-6 ${healthColor}`} />
              <div>
                <p className="text-sm font-medium">Sender Health Score</p>
                <p className="text-xs text-muted-foreground">
                  Based on bounce rate and engagement
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-4xl font-bold ${healthColor}`}>{healthScore}</p>
              <p className="text-xs text-muted-foreground">/100</p>
            </div>
          </div>
          <div className="mt-3 h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                healthScore >= 80
                  ? "bg-emerald-500"
                  : healthScore >= 50
                  ? "bg-amber-500"
                  : "bg-destructive"
              }`}
              style={{ width: `${healthScore}%` }}
            />
          </div>
          {stats.bounceRate > 5 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" />
              High bounce rate detected — consider verifying emails before sending
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="abtests">
            <Beaker className="h-3.5 w-3.5 mr-1.5" />
            A/B Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Send Volume Chart — full width */}
          <ExportableChart title="14-Day Send Volume" fileName="send_volume">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyVolume}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="sent" name="Sent" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="opened" name="Opened" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="bounced" name="Bounced" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ExportableChart>

          {/* Status Pie Chart — full width */}
          <ExportableChart title="Status Distribution" fileName="status_distribution">
            {statusDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {statusDist.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ExportableChart>

          {/* Recent bounces */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Bounces & Issues</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {campaigns.filter((c) => c.status === "bounced").length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No bounces — your sender reputation is clean!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Subject</TableHead>
                      <TableHead className="text-xs">Lead</TableHead>
                      <TableHead className="text-xs">Recipient</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns
                      .filter((c) => c.status === "bounced")
                      .slice(0, 10)
                      .map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm font-medium truncate max-w-[200px]">
                            {c.subject}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.leads?.business_name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.leads?.email || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abtests" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Beaker className="h-4 w-4 text-primary" />
                A/B Test Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-4">
                When generating emails, the system creates two subject-line variants. The winner is
                determined by which gets opened first.
              </p>
              {abTests.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <Beaker className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No A/B tests yet</p>
                  <p className="text-xs mt-1">
                    Generate emails with "A/B Test" to start comparing subject lines
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Lead</TableHead>
                      <TableHead className="text-xs">Variant A</TableHead>
                      <TableHead className="text-xs">Variant B</TableHead>
                      <TableHead className="text-xs">Winner</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abTests.map((test: any) => (
                      <TableRow key={test.id}>
                        <TableCell className="text-sm font-medium">
                          {test.leads?.business_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          <div className="flex items-center gap-1.5">
                            {test.winner === "a" && (
                              <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                            {test.campaign_a?.subject || "—"}
                            {test.campaign_a?.opened_at && (
                              <Eye className="h-3 w-3 text-emerald-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          <div className="flex items-center gap-1.5">
                            {test.winner === "b" && (
                              <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                            {test.campaign_b?.subject || "—"}
                            {test.campaign_b?.opened_at && (
                              <Eye className="h-3 w-3 text-emerald-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {test.winner ? (
                            <Badge className="text-[10px] border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              Variant {test.winner.toUpperCase()}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              test.status === "completed"
                                ? "border-emerald-500 text-emerald-600"
                                : ""
                            }`}
                          >
                            {test.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Deliverability;
