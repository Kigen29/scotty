import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, X, Briefcase, Instagram, MessageCircle, Cpu, Search, Key, CalendarDays, Users, User, Mail, Zap, Target, AlertTriangle } from "lucide-react";
import { ICPProfileCard } from "@/components/settings/ICPProfileCard";
import TeamSettings from "@/components/settings/TeamSettings";

interface PortfolioProject {
  url: string;
  industry: string;
  features: string;
  problem_solved: string;
}

const SettingsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    company_name: "",
    company_website: "",
    services: [] as string[],
    portfolio_links: [] as string[],
    email_signature: "",
    sender_email: "",
    daily_send_limit: 50,
    follow_up_intervals: [3, 7, 14] as number[],
    target_categories: ["restaurants", "salons", "hardware stores", "clinics", "retail shops", "football pitches"],
    target_locations: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
    active_hours_start: "08:00",
    active_hours_end: "17:00",
    is_autonomous: true,
    social_discovery_enabled: true,
    whatsapp_number: "",
    discovery_pipeline: "firecrawl",
    booking_link: "",
  });
  const [portfolioProjects, setPortfolioProjects] = useState<PortfolioProject[]>([]);
  const [newService, setNewService] = useState("");
  const [newPortfolio, setNewPortfolio] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    if (!user) return;
    const { data } = await supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle();
    if (data) {
      setSettings({
        company_name: data.company_name || "",
        company_website: data.company_website || "",
        services: data.services || [],
        portfolio_links: data.portfolio_links || [],
        email_signature: data.email_signature || "",
        sender_email: data.sender_email || "",
        daily_send_limit: data.daily_send_limit || 50,
        follow_up_intervals: data.follow_up_intervals || [3, 7, 14],
        target_categories: data.target_categories || [],
        target_locations: data.target_locations || [],
        active_hours_start: data.active_hours_start || "08:00",
        active_hours_end: data.active_hours_end || "17:00",
        is_autonomous: data.is_autonomous ?? true,
        social_discovery_enabled: data.social_discovery_enabled ?? true,
        whatsapp_number: data.whatsapp_number || "",
        discovery_pipeline: data.discovery_pipeline || "firecrawl",
        booking_link: data.booking_link || "",
      });
      setPortfolioProjects((data as any).portfolio_projects || []);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("settings").upsert({
        user_id: user.id, ...settings, portfolio_projects: portfolioProjects,
      } as any, { onConflict: "user_id" });
      if (error) throw error;
      toast({ title: "Settings saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const addToList = (key: keyof typeof settings, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setSettings((s) => ({ ...s, [key]: [...(s[key] as string[]), value.trim()] }));
    setter("");
  };

  const removeFromList = (key: keyof typeof settings, index: number) => {
    setSettings((s) => ({ ...s, [key]: (s[key] as string[]).filter((_, i) => i !== index) }));
  };

  const addPortfolioProject = () => {
    setPortfolioProjects((p) => [...p, { url: "", industry: "", features: "", problem_solved: "" }]);
  };

  const updatePortfolioProject = (index: number, field: keyof PortfolioProject, value: string) => {
    setPortfolioProjects((p) => p.map((proj, i) => i === index ? { ...proj, [field]: value } : proj));
  };

  const removePortfolioProject = (index: number) => {
    setPortfolioProjects((p) => p.filter((_, i) => i !== index));
  };

  const TagList = ({ items, onRemove, colorClass = "bg-primary/10 text-primary" }: { items: string[]; onRemove: (i: number) => void; colorClass?: string }) => (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((item, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${colorClass}`}>
          {item} <button onClick={() => onRemove(i)}><X className="h-2.5 w-2.5" /></button>
        </span>
      ))}
    </div>
  );

  const AddField = ({ value, onChange, onAdd, placeholder }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string }) => (
    <div className="flex gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" onKeyDown={(e) => e.key === "Enter" && onAdd()} />
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={onAdd}><Plus className="h-3.5 w-3.5" /></Button>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Configure your outreach system</p>
        </div>
        <Button onClick={saveSettings} disabled={loading} size="sm">
          <Save className="h-4 w-4 mr-1" /> {loading ? "Saving..." : "Save All"}
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 h-10">
          <TabsTrigger value="profile" className="text-xs gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Portfolio</TabsTrigger>
          <TabsTrigger value="discovery" className="text-xs gap-1.5"><Target className="h-3.5 w-3.5" /> Discovery</TabsTrigger>
          <TabsTrigger value="email" className="text-xs gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</TabsTrigger>
          <TabsTrigger value="automation" className="text-xs gap-1.5"><Zap className="h-3.5 w-3.5" /> Automation</TabsTrigger>
          <TabsTrigger value="team" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Team</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Profile</CardTitle>
              <CardDescription className="text-xs">Basic information used in outreach emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Name</Label>
                  <Input value={settings.company_name} onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))} placeholder="Emmanuel Kigen" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Website / Portfolio</Label>
                  <Input value={settings.company_website} onChange={(e) => setSettings((s) => ({ ...s, company_website: e.target.value }))} placeholder="https://yourportfolio.com" className="h-9" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Services</Label>
                <AddField value={newService} onChange={setNewService} onAdd={() => addToList("services", newService, setNewService)} placeholder="e.g. Website Development" />
                <TagList items={settings.services} onRemove={(i) => removeFromList("services", i)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Portfolio Links</Label>
                <AddField value={newPortfolio} onChange={setNewPortfolio} onAdd={() => addToList("portfolio_links", newPortfolio, setNewPortfolio)} placeholder="https://example.com" />
                <TagList items={settings.portfolio_links} onRemove={(i) => removeFromList("portfolio_links", i)} colorClass="bg-accent/20 text-accent-foreground" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Email Signature</Label>
                <Textarea value={settings.email_signature} onChange={(e) => setSettings((s) => ({ ...s, email_signature: e.target.value }))} placeholder="Your signature..." rows={3} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Portfolio Tab */}
        <TabsContent value="portfolio">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> Portfolio Projects</CardTitle>
                  <CardDescription className="text-xs">AI references these in outreach emails</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addPortfolioProject}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {portfolioProjects.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No projects yet. Add portfolio projects so the AI can reference them in outreach emails.</p>}
              {portfolioProjects.map((project, i) => (
                <div key={i} className="relative p-3 rounded-lg border border-border space-y-2">
                  <button onClick={() => removePortfolioProject(i)} className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-[10px]">URL</Label><Input value={project.url} onChange={(e) => updatePortfolioProject(i, "url", e.target.value)} placeholder="https://heartbeatsafaris.com" className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[10px]">Industry</Label><Input value={project.industry} onChange={(e) => updatePortfolioProject(i, "industry", e.target.value)} placeholder="Tourism" className="h-8 text-xs" /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-[10px]">Features</Label><Input value={project.features} onChange={(e) => updatePortfolioProject(i, "features", e.target.value)} placeholder="Online booking, payments" className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Problem Solved</Label><Input value={project.problem_solved} onChange={(e) => updatePortfolioProject(i, "problem_solved", e.target.value)} placeholder="Increased revenue by 40%" className="h-8 text-xs" /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discovery Tab */}
        <TabsContent value="discovery" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Discovery Pipeline</CardTitle>
              <CardDescription className="text-xs">Choose which engine discovers new leads</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={settings.discovery_pipeline} onValueChange={(v) => setSettings((s) => ({ ...s, discovery_pipeline: v }))} className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.discovery_pipeline === "firecrawl" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <RadioGroupItem value="firecrawl" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-sm font-medium">Firecrawl</span></div>
                    <p className="text-xs text-muted-foreground mt-0.5">Web scraping — searches Google, scrapes results.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.discovery_pipeline === "lovable_ai" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <RadioGroupItem value="lovable_ai" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-sm font-medium">Lovable AI</span></div>
                    <p className="text-xs text-muted-foreground mt-0.5">AI research agent — identifies businesses via local knowledge.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.discovery_pipeline === "openai" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <RadioGroupItem value="openai" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><Key className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-sm font-medium">OpenAI</span></div>
                    <p className="text-xs text-muted-foreground mt-0.5">Uses your own OpenAI API key (GPT-4o-mini).</p>
                  </div>
                </label>
              </RadioGroup>
            </CardContent>
          </Card>

          {user && <ICPProfileCard userId={user.id} />}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Targeting</CardTitle>
              <CardDescription className="text-xs">Categories and locations for lead discovery</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Target Categories</Label>
                <AddField value={newCategory} onChange={setNewCategory} onAdd={() => addToList("target_categories", newCategory, setNewCategory)} placeholder="e.g. bakeries" />
                <TagList items={settings.target_categories} onRemove={(i) => removeFromList("target_categories", i)} colorClass="bg-muted text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Locations</Label>
                <AddField value={newLocation} onChange={setNewLocation} onAdd={() => addToList("target_locations", newLocation, setNewLocation)} placeholder="e.g. Meru" />
                <TagList items={settings.target_locations} onRemove={(i) => removeFromList("target_locations", i)} colorClass="bg-muted text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email & Channels Tab */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Email Config</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">Sender Email</Label><Input value={settings.sender_email} onChange={(e) => setSettings((s) => ({ ...s, sender_email: e.target.value }))} placeholder="you@yourdomain.com" className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Daily Limit</Label><Input type="number" value={settings.daily_send_limit} onChange={(e) => setSettings((s) => ({ ...s, daily_send_limit: parseInt(e.target.value) || 50 }))} className="h-9" /></div>
              </div>
              {settings.sender_email && /(@gmail\.com|@yahoo\.com|@hotmail\.com|@outlook\.com|@aol\.com|@icloud\.com)$/i.test(settings.sender_email) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Free email provider</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">Resend cannot send from Gmail/Yahoo. Auto-sent emails will use <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">onboarding@resend.dev</code>. For a custom sender, verify your own domain at resend.com.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Meeting Booking</CardTitle>
              <CardDescription className="text-xs">Auto-include booking link when leads show interest</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Calendly / Cal.com Link</Label>
                <Input value={settings.booking_link} onChange={(e) => setSettings((s) => ({ ...s, booking_link: e.target.value }))} placeholder="https://calendly.com/your-name/30min" className="h-9" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Instagram className="h-4 w-4" /> Social Channels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div><Label className="text-xs">Social Discovery</Label><p className="text-[10px] text-muted-foreground">Search Instagram & TikTok</p></div>
                <Switch checked={settings.social_discovery_enabled} onCheckedChange={(c) => setSettings((s) => ({ ...s, social_discovery_enabled: c }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp Number</Label>
                <Input value={settings.whatsapp_number} onChange={(e) => setSettings((s) => ({ ...s, whatsapp_number: e.target.value }))} placeholder="+254 7XX XXX XXX" className="h-9" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Automation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label className="text-xs">Autonomous Mode</Label><p className="text-[10px] text-muted-foreground">System sends emails without approval</p></div>
                <Switch checked={settings.is_autonomous} onCheckedChange={(c) => setSettings((s) => ({ ...s, is_autonomous: c }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">Active Start (EAT)</Label><Input type="time" value={settings.active_hours_start} onChange={(e) => setSettings((s) => ({ ...s, active_hours_start: e.target.value }))} className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Active End (EAT)</Label><Input type="time" value={settings.active_hours_end} onChange={(e) => setSettings((s) => ({ ...s, active_hours_end: e.target.value }))} className="h-9" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Team
              </CardTitle>
              <CardDescription>Manage your team, invite members, and assign roles</CardDescription>
            </CardHeader>
            <CardContent>
              <TeamSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
