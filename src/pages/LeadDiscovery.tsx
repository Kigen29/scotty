import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Search, Globe, Phone, Mail, MapPin, ExternalLink, CheckCircle2, X, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const categories = ["restaurants", "salons", "hardware stores", "clinics", "retail shops", "schools", "hotels", "pharmacies"];
const locations = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Nyeri", "Malindi"];

const LeadDiscovery = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Tables<"leads">[]>([]);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState<string | null>(null);

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

  const statusColors: Record<string, string> = {
    discovered: "bg-muted text-muted-foreground",
    qualified: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
    contacted: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    responded: "bg-primary/10 text-primary",
    interested: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    not_interested: "bg-destructive/10 text-destructive",
    dismissed: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Lead Discovery</h1>
        <p className="text-muted-foreground mt-1">Find Kenyan businesses that need your services</p>
      </div>

      {/* Search Controls */}
      <Card>
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
        {leads.map((lead) => (
          <Card key={lead.id} className="relative">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-base">{lead.business_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {lead.category && <Badge variant="secondary" className="text-xs">{lead.category}</Badge>}
                    <Badge className={`text-xs ${statusColors[lead.status] || ""}`}>
                      {lead.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                {lead.has_website ? (
                  <Globe className="h-4 w-4 text-[hsl(var(--success))]" />
                ) : (
                  <Globe className="h-4 w-4 text-destructive" />
                )}
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                {lead.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> {lead.location}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" /> {lead.phone}
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> {lead.email}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
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
        ))}
      </div>

      {leads.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No leads discovered yet</p>
          <p className="text-sm">Select a category and location above to start discovering businesses</p>
        </div>
      )}
    </div>
  );
};

export default LeadDiscovery;
