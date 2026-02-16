import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, X, Globe, Briefcase, Instagram, MessageCircle } from "lucide-react";

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
    target_categories: ["restaurants", "salons", "hardware stores", "clinics", "retail shops"],
    target_locations: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
    active_hours_start: "08:00",
    active_hours_end: "17:00",
    is_autonomous: true,
    social_discovery_enabled: true,
    whatsapp_number: "",
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
    const { data } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
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
        social_discovery_enabled: (data as any).social_discovery_enabled ?? true,
        whatsapp_number: (data as any).whatsapp_number || "",
      });
      setPortfolioProjects((data as any).portfolio_projects || []);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({
          user_id: user.id,
          ...settings,
          portfolio_projects: portfolioProjects,
        } as any, { onConflict: "user_id" });
      if (error) throw error;
      toast({ title: "Settings saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your outreach system</p>
        </div>
        <Button onClick={saveSettings} disabled={loading}>
          <Save className="h-4 w-4 mr-2" /> {loading ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Your Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>Your personal details used in outreach emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Your Name</Label>
              <Input value={settings.company_name} onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))} placeholder="Emmanuel Kigen" />
            </div>
            <div className="space-y-2">
              <Label>Your Website / Portfolio</Label>
              <Input value={settings.company_website} onChange={(e) => setSettings((s) => ({ ...s, company_website: e.target.value }))} placeholder="https://yourportfolio.com" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Services Offered</Label>
            <div className="flex gap-2">
              <Input value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="e.g. Website Development" onKeyDown={(e) => e.key === "Enter" && addToList("services", newService, setNewService)} />
              <Button variant="outline" size="icon" onClick={() => addToList("services", newService, setNewService)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.services.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                  {s} <button onClick={() => removeFromList("services", i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Portfolio Links</Label>
            <div className="flex gap-2">
              <Input value={newPortfolio} onChange={(e) => setNewPortfolio(e.target.value)} placeholder="https://example.com" onKeyDown={(e) => e.key === "Enter" && addToList("portfolio_links", newPortfolio, setNewPortfolio)} />
              <Button variant="outline" size="icon" onClick={() => addToList("portfolio_links", newPortfolio, setNewPortfolio)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.portfolio_links.map((l, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm">
                  {l} <button onClick={() => removeFromList("portfolio_links", i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email Signature</Label>
            <Textarea value={settings.email_signature} onChange={(e) => setSettings((s) => ({ ...s, email_signature: e.target.value }))} placeholder="Your professional email signature..." rows={4} />
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Projects */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Portfolio Projects</CardTitle>
              <CardDescription>Your completed projects — AI agents reference these when crafting personalized emails</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addPortfolioProject}><Plus className="h-4 w-4 mr-1" /> Add Project</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {portfolioProjects.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No portfolio projects yet. Add your completed projects so the AI can reference them in outreach emails.</p>
          )}
          {portfolioProjects.map((project, i) => (
            <div key={i} className="relative p-4 rounded-lg border border-border space-y-3">
              <button onClick={() => removePortfolioProject(i)} className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-4 w-4" />
              </button>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Project URL</Label>
                  <Input value={project.url} onChange={(e) => updatePortfolioProject(i, "url", e.target.value)} placeholder="https://heartbeatsafaris.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Industry</Label>
                  <Input value={project.industry} onChange={(e) => updatePortfolioProject(i, "industry", e.target.value)} placeholder="Tourism & Travel" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key Features</Label>
                <Input value={project.features} onChange={(e) => updatePortfolioProject(i, "features", e.target.value)} placeholder="Online booking, payment integration, mobile responsive" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Problem Solved</Label>
                <Input value={project.problem_solved} onChange={(e) => updatePortfolioProject(i, "problem_solved", e.target.value)} placeholder="Enabled online bookings, increasing revenue by 40%" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Social Media Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Instagram className="h-5 w-5" /> Social Media Channels</CardTitle>
          <CardDescription>Configure social media discovery and outreach channels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Social Media Discovery</Label>
              <p className="text-sm text-muted-foreground">Search Instagram & TikTok for business leads</p>
            </div>
            <Switch checked={settings.social_discovery_enabled} onCheckedChange={(c) => setSettings((s) => ({ ...s, social_discovery_enabled: c }))} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp Business Number</Label>
            <Input value={settings.whatsapp_number} onChange={(e) => setSettings((s) => ({ ...s, whatsapp_number: e.target.value }))} placeholder="+254 7XX XXX XXX" />
            <p className="text-xs text-muted-foreground">Used in outreach templates when suggesting WhatsApp contact</p>
          </div>
        </CardContent>
      </Card>

      {/* Email Config */}
      <Card>
        <CardHeader><CardTitle>Email Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sender Email</Label>
              <Input value={settings.sender_email} onChange={(e) => setSettings((s) => ({ ...s, sender_email: e.target.value }))} placeholder="emmanuelkigen029@gmail.com" />
            </div>
            <div className="space-y-2">
              <Label>Daily Send Limit</Label>
              <Input type="number" value={settings.daily_send_limit} onChange={(e) => setSettings((s) => ({ ...s, daily_send_limit: parseInt(e.target.value) || 50 }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automation */}
      <Card>
        <CardHeader><CardTitle>Automation Rules</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Fully Autonomous Mode</Label>
              <p className="text-sm text-muted-foreground">System sends emails without manual approval</p>
            </div>
            <Switch checked={settings.is_autonomous} onCheckedChange={(c) => setSettings((s) => ({ ...s, is_autonomous: c }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Active Hours Start (EAT)</Label>
              <Input type="time" value={settings.active_hours_start} onChange={(e) => setSettings((s) => ({ ...s, active_hours_start: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Active Hours End (EAT)</Label>
              <Input type="time" value={settings.active_hours_end} onChange={(e) => setSettings((s) => ({ ...s, active_hours_end: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Categories</Label>
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. bakeries" onKeyDown={(e) => e.key === "Enter" && addToList("target_categories", newCategory, setNewCategory)} />
              <Button variant="outline" size="icon" onClick={() => addToList("target_categories", newCategory, setNewCategory)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.target_categories.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
                  {c} <button onClick={() => removeFromList("target_categories", i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Locations</Label>
            <div className="flex gap-2">
              <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Meru" onKeyDown={(e) => e.key === "Enter" && addToList("target_locations", newLocation, setNewLocation)} />
              <Button variant="outline" size="icon" onClick={() => addToList("target_locations", newLocation, setNewLocation)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.target_locations.map((l, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
                  {l} <button onClick={() => removeFromList("target_locations", i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
