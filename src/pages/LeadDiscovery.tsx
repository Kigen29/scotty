import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Search, Globe, Phone, Mail, MapPin, CheckCircle2, X, Loader2, Star, Brain, Instagram, Linkedin, MessageCircle, ExternalLink } from "lucide-react";
import { DateFilter, type DateRange } from "@/components/DateFilter";

const categories = ["restaurants", "salons", "hardware stores", "clinics", "retail shops", "schools", "hotels", "pharmacies"];
const locations = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Nyeri", "Malindi"];

const statusColors: Record<string, string> = {
  discovered: "bg-secondary text-secondary-foreground",
  qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  responded: "bg-primary/15 text-primary dark:text-primary",
  interested: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  not_interested: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dismissed: "bg-secondary text-secondary-foreground",
};

const sourceIcons: Record<string, React.ReactNode> = {
  web: <Globe className="h-3 w-3" />,
  google_maps: <MapPin className="h-3 w-3" />,
  instagram: <Instagram className="h-3 w-3" />,
  tiktok: <span className="text-[10px] font-bold">TT</span>,
  linkedin: <Linkedin className="h-3 w-3" />,
};

const sourceColors: Record<string, string> = {
  web: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  google_maps: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  tiktok: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

const PriorityStars = ({ score }: { score: number }) => {
  const filled = Math.min(5, Math.round(score / 2));
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3 w-3 ${i < filled ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
};

const LeadDiscovery = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  const generateEmail = async (leadId: string) => {
    setGeneratingEmail(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: { lead_id: leadId, template_type: "first_touch" },
      });
      if (error) throw error;
      toast({ title: "Email generated", description: "Draft email created — check Campaigns" });
      fetchLeads();
    } catch (error: any) {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingEmail(null);
    }
  };

  useEffect(() => {
    if (user) fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setLeads(data);
  };

  const handleDiscover = async () => {
    if (!category && !location) {
      toast({ title: "Select a category or location", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("discover-leads", {
        body: { category, location, query: searchQuery },
      });
      if (error) throw error;
      toast({ title: "Discovery complete", description: `Found ${data?.leads_added || 0} new leads` });
      fetchLeads();
    } catch (error: any) {
      toast({ title: "Discovery failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    fetchLeads();
  };

  const filteredLeads = leads.filter((lead) => {
    if (dateRange) {
      const d = new Date(lead.discovered_at || lead.created_at);
      if (d < dateRange.from || d > dateRange.to) return false;
    }
    return true;
  });

  const getProfileUrl = (lead: any): string => {
    const social = lead.social_links as any;
    return (
      social?.google_maps ||
      social?.instagram ||
      social?.tiktok ||
      `https://www.google.com/search?q=${encodeURIComponent(`${lead.business_name} ${lead.location || ""} Kenya`)}`
    );
  };

  const getProfileLabel = (lead: any): string => {
    const social = lead.social_links as any;
    if (social?.google_maps) return "View on Google Maps";
    if (social?.instagram) return "View on Instagram";
    if (social?.tiktok) return "View on TikTok";
    return "Search on Google";
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Lead Discovery</h1>
        <p className="text-muted-foreground mt-1">Find Kenyan businesses that need your services</p>
      </div>

      {/* Date Filter */}
      <DateFilter defaultPreset="today" onChange={setDateRange} />

      {/* Search Controls */}
      <Card className="border border-border">
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Additional search terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button onClick={handleDiscover} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Discover Leads
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leads List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TooltipProvider>
          {filteredLeads.map((lead) => {
            const analysis = lead.analysis as any;
            const priorityScore = lead.priority_score || 5;
            const source = (lead as any).discovery_source || "web";
            const contactChannels: any[] = (lead as any).contact_channels || [];
            const profileUrl = getProfileUrl(lead);
            const profileLabel = getProfileLabel(lead);
            return (
              <Card key={lead.id} className="relative border border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base text-foreground">{lead.business_name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {lead.category && <Badge variant="secondary" className="text-xs">{lead.category}</Badge>}
                        <Badge className={`text-xs border-0 ${statusColors[lead.status] || "bg-secondary text-secondary-foreground"}`}>
                          {lead.status.replace("_", " ")}
                        </Badge>
                        <Badge className={`text-xs border-0 gap-1 ${sourceColors[source] || sourceColors.web}`}>
                          {sourceIcons[source]} {source.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <PriorityStars score={priorityScore} />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm text-foreground/80">
                    {lead.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {lead.location}
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {lead.phone}
                      </div>
                    )}
                    {lead.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {lead.email}
                      </div>
                    )}
                  </div>

                  {/* Contact channel indicators */}
                  {contactChannels.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {contactChannels.some((c: any) => c.type === "email") && (
                        <Tooltip><TooltipTrigger><Mail className="h-3.5 w-3.5 text-blue-500" /></TooltipTrigger>
                          <TooltipContent>Email available</TooltipContent></Tooltip>
                      )}
                      {contactChannels.some((c: any) => c.type === "whatsapp" || c.type === "phone") && (
                        <Tooltip><TooltipTrigger><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /></TooltipTrigger>
                          <TooltipContent>WhatsApp/Phone available</TooltipContent></Tooltip>
                      )}
                      {contactChannels.some((c: any) => c.type === "instagram_dm") && (
                        <Tooltip><TooltipTrigger><Instagram className="h-3.5 w-3.5 text-pink-500" /></TooltipTrigger>
                          <TooltipContent>Instagram DM available</TooltipContent></Tooltip>
                      )}
                      {contactChannels.some((c: any) => c.type === "linkedin") && (
                        <Tooltip><TooltipTrigger><Linkedin className="h-3.5 w-3.5 text-sky-500" /></TooltipTrigger>
                          <TooltipContent>LinkedIn available</TooltipContent></Tooltip>
                      )}
                    </div>
                  )}

                  {/* Analysis summary */}
                  {analysis?.summary && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mt-2 flex items-start gap-1.5 p-2 rounded bg-muted/50 cursor-help">
                          <Brain className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground line-clamp-2">{analysis.summary}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          {analysis.pain_points?.length > 0 && (
                            <div>
                              <p className="font-semibold mb-1">Pain Points:</p>
                              <ul className="list-disc pl-3 space-y-0.5">
                                {analysis.pain_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                              </ul>
                            </div>
                          )}
                          {analysis.recommended_solutions?.length > 0 && (
                            <div>
                              <p className="font-semibold mb-1">Solutions:</p>
                              <ul className="list-disc pl-3 space-y-0.5">
                                {analysis.recommended_solutions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <div className="flex gap-2 mt-4">
                    {/* Google Maps / profile link */}
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      className="text-xs"
                    >
                      <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        {profileLabel}
                      </a>
                    </Button>
                  </div>

                  <div className="flex gap-2 mt-2">
                    {lead.status === "discovered" && (
                      <>
                        <Button size="sm" onClick={() => updateLeadStatus(lead.id, "qualified")} className="flex-1">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateLeadStatus(lead.id, "dismissed")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {lead.status === "qualified" && (
                      <Button size="sm" onClick={() => generateEmail(lead.id)} disabled={generatingEmail === lead.id} className="flex-1">
                        {generatingEmail === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
                        Generate Email
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TooltipProvider>
      </div>

      {leads.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No leads discovered yet</p>
          <p className="text-sm">Select a category and location above to start discovering businesses</p>
        </div>
      )}

      {leads.length > 0 && filteredLeads.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No leads match this date range</p>
          <p className="text-sm">Try changing the date filter above</p>
        </div>
      )}
    </div>
  );
};

export default LeadDiscovery;
