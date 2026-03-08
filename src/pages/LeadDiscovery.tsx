import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Globe, Phone, Mail, MapPin, CheckCircle2, X, Loader2, Star, Brain,
  ExternalLink, ChevronUp, ChevronDown, Users, Filter, ArrowUpDown, Trash2, Cpu, Zap, Flame,
} from "lucide-react";

const categories = [
  "restaurants", "salons", "hardware stores", "clinics", "retail shops",
  "schools", "hotels", "pharmacies", "football pitches",
];
const locations = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Nyeri", "Malindi"];
const statuses = ["discovered", "qualified", "contacted", "responded", "interested", "not_interested", "dismissed"];

const statusColors: Record<string, string> = {
  discovered: "bg-secondary text-secondary-foreground",
  qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  responded: "bg-primary/15 text-primary",
  interested: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  not_interested: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dismissed: "bg-secondary text-secondary-foreground",
};

type SortKey = "business_name" | "category" | "location" | "priority_score" | "status" | "created_at";
type SortDir = "asc" | "desc";

const LeadDiscovery = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState<string | null>(null);

  // Discovery form
  const [discCategory, setDiscCategory] = useState("");
  const [discLocation, setDiscLocation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Current pipeline
  const [currentPipeline, setCurrentPipeline] = useState<string>("firecrawl");

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterHasEmail, setFilterHasEmail] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail sheet
  const [detailLead, setDetailLead] = useState<any>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const perPage = 25;

  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchPipeline();
    }
  }, [user]);

  const fetchPipeline = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("settings")
      .select("discovery_pipeline")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.discovery_pipeline) setCurrentPipeline(data.discovery_pipeline);
  };

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
    if (!discCategory && !discLocation) {
      toast({ title: "Select a category or location", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("discover-leads", {
        body: { category: discCategory, location: discLocation, query: searchQuery },
      });
      if (error) throw error;
      const pipelineLabel = data?.pipeline === "openai" ? "OpenAI" : data?.pipeline === "lovable_ai" ? "Lovable AI" : "Firecrawl";
      toast({ title: "Discovery complete", description: `Found ${data?.leads_added || 0} new leads via ${pipelineLabel}` });
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

  const generateEmail = async (leadId: string) => {
    setGeneratingEmail(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: { lead_id: leadId, template_type: "first_touch" },
      });
      if (error) throw error;
      toast({ title: "Email generated", description: "Draft created — check Campaigns" });
      fetchLeads();
    } catch (error: any) {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingEmail(null);
    }
  };

  const analyzeLead = async (leadId: string) => {
    try {
      const { error } = await supabase.functions.invoke("analyze-lead", {
        body: { lead_id: leadId },
      });
      if (error) throw error;
      toast({ title: "Lead analyzed", description: "AI analysis complete" });
      fetchLeads();
    } catch (error: any) {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    }
  };

  const deleteLead = async (leadId: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", leadId);
    if (!error) {
      fetchLeads();
      toast({ title: "Lead deleted" });
    }
  };

  const bulkUpdateStatus = async (status: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (const id of ids) {
      await supabase.from("leads").update({ status }).eq("id", id);
    }
    setSelected(new Set());
    fetchLeads();
    toast({ title: `${ids.length} leads updated to ${status}` });
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (const id of ids) {
      await supabase.from("leads").delete().eq("id", id);
    }
    setSelected(new Set());
    fetchLeads();
    toast({ title: `${ids.length} leads deleted` });
  };

  // Filtered & sorted
  const filtered = useMemo(() => {
    let result = leads;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      result = result.filter((l) =>
        l.business_name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q)
      );
    }
    if (filterCategory !== "all") result = result.filter((l) => l.category === filterCategory);
    if (filterLocation !== "all") result = result.filter((l) => l.location === filterLocation);
    if (filterStatus !== "all") result = result.filter((l) => l.status === filterStatus);
    if (filterHasEmail) result = result.filter((l) => l.email);

    result = [...result].sort((a, b) => {
      let av = a[sortKey] ?? "";
      let bv = b[sortKey] ?? "";
      if (sortKey === "priority_score") { av = av || 0; bv = bv || 0; }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [leads, filterSearch, filterCategory, filterLocation, filterStatus, filterHasEmail, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const withEmail = leads.filter((l) => l.email).length;
  const qualified = leads.filter((l) => l.status === "qualified").length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((l) => l.id)));
  };

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getProfileUrl = (lead: any): string => {
    const social = lead.social_links as any;
    return (
      social?.google_maps ||
      social?.instagram ||
      social?.tiktok ||
      `https://www.google.com/search?q=${encodeURIComponent(`${lead.business_name} ${lead.location || ""} Kenya`)}`
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead Discovery</h1>
          <p className="text-sm text-muted-foreground">Find Kenyan businesses that need your services</p>
        </div>
      </div>

      {/* Compact discover bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={discCategory} onValueChange={setDiscCategory}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={discLocation} onValueChange={setDiscLocation}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Search terms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-48 h-9 text-sm" />
            <Button onClick={handleDiscover} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
              Discover
            </Button>
            <Badge variant="outline" className={`text-xs gap-1 ${
              currentPipeline === "openai" ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400" :
              currentPipeline === "lovable_ai" ? "border-violet-500/50 text-violet-700 dark:text-violet-400" :
              "border-orange-500/50 text-orange-700 dark:text-orange-400"
            }`}>
              {currentPipeline === "openai" ? <Zap className="h-3 w-3" /> :
               currentPipeline === "lovable_ai" ? <Cpu className="h-3 w-3" /> :
               <Flame className="h-3 w-3" />}
              {currentPipeline === "openai" ? "OpenAI" : currentPipeline === "lovable_ai" ? "Lovable AI" : "Firecrawl"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-4 w-4" /> <span className="font-semibold text-foreground">{leads.length}</span> leads
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Mail className="h-4 w-4" /> <span className="font-semibold text-foreground">{withEmail}</span> with email
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> <span className="font-semibold text-foreground">{qualified}</span> qualified
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-4 w-4" />
        </div>
        <Input placeholder="Search leads..." value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }} className="w-56 h-9 text-sm" />
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLocation} onValueChange={(v) => { setFilterLocation(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={filterHasEmail} onCheckedChange={(c) => { setFilterHasEmail(c); setPage(0); }} />
          <span className="text-muted-foreground">Has Email</span>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("qualified")}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("dismissed")}>
            <X className="h-3.5 w-3.5 mr-1" /> Dismiss
          </Button>
          <Button size="sm" variant="destructive" onClick={bulkDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("business_name")}>
                  <span className="flex items-center">Business <SortIcon col="business_name" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                  <span className="flex items-center">Category <SortIcon col="category" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("location")}>
                  <span className="flex items-center">Location <SortIcon col="location" /></span>
                </TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                  <span className="flex items-center">Status <SortIcon col="status" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("priority_score")}>
                  <span className="flex items-center">Priority <SortIcon col="priority_score" /></span>
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetailLead(lead)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(lead.id)}
                      onCheckedChange={(c) => {
                        const next = new Set(selected);
                        c ? next.add(lead.id) : next.delete(lead.id);
                        setSelected(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.business_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">{lead.category || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.location || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">
                    {lead.email ? (
                      <span className="text-foreground">{lead.email}</span>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">No email</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs border-0 ${statusColors[lead.status] || "bg-secondary text-secondary-foreground"}`}>
                      {lead.status?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Star className={`h-3.5 w-3.5 ${(lead.priority_score || 5) >= 7 ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                      <span className="text-sm">{lead.priority_score || 5}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${
                      lead.discovery_source === "ai_search" ? "border-violet-500/40 text-violet-600 dark:text-violet-400" :
                      lead.discovery_source === "google_maps" ? "border-orange-500/40 text-orange-600 dark:text-orange-400" :
                      lead.discovery_source === "social" ? "border-blue-500/40 text-blue-600 dark:text-blue-400" :
                      "border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {lead.discovery_source === "ai_search" ? <Cpu className="h-2.5 w-2.5" /> :
                       lead.discovery_source === "google_maps" ? <Flame className="h-2.5 w-2.5" /> :
                       lead.discovery_source === "social" ? <Globe className="h-2.5 w-2.5" /> :
                       <Search className="h-2.5 w-2.5" />}
                      {lead.discovery_source === "ai_search" ? "AI" :
                       lead.discovery_source === "google_maps" ? "Maps" :
                       lead.discovery_source === "social" ? "Social" :
                       lead.discovery_source || "Web"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {lead.status === "discovered" && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateLeadStatus(lead.id, "qualified")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateLeadStatus(lead.id, "dismissed")}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {lead.status === "qualified" && lead.email && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => generateEmail(lead.id)} disabled={generatingEmail === lead.id}>
                          {generatingEmail === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {!lead.analysis && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Analyze" onClick={() => analyzeLead(lead.id)}>
                          <Brain className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openExternal(getProfileUrl(lead))}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => deleteLead(lead.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {leads.length === 0 ? (
                      <div>
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No leads yet. Use the discovery bar above to find businesses.</p>
                      </div>
                    ) : (
                      <p>No leads match your filters</p>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!detailLead} onOpenChange={() => setDetailLead(null)}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          {detailLead && (
            <>
              <SheetHeader>
                <SheetTitle>{detailLead.business_name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="flex flex-wrap gap-2">
                  {detailLead.category && <Badge variant="secondary">{detailLead.category}</Badge>}
                  <Badge className={`border-0 ${statusColors[detailLead.status]}`}>{detailLead.status?.replace("_", " ")}</Badge>
                  <Badge variant="outline">{detailLead.discovery_source || "web"}</Badge>
                </div>

                <div className="space-y-2 text-sm">
                  {detailLead.location && (
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {detailLead.location}</div>
                  )}
                  {detailLead.phone && (
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {detailLead.phone}</div>
                  )}
                  {detailLead.email && (
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {detailLead.email}</div>
                  )}
                  {detailLead.website_url && (
                    <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> {detailLead.website_url}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  <span className="font-medium">{detailLead.priority_score || 5}/10 Priority</span>
                </div>

                {detailLead.notes && (
                  <div className="p-3 rounded-lg bg-muted text-sm">{detailLead.notes}</div>
                )}

                {/* Analysis */}
                {(detailLead.analysis as any)?.summary && (
                  <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 text-primary font-medium text-sm">
                      <Brain className="h-4 w-4" /> AI Analysis
                    </div>
                    <p className="text-sm text-muted-foreground">{(detailLead.analysis as any).summary}</p>
                    {(detailLead.analysis as any).pain_points?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1">Pain Points</p>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {(detailLead.analysis as any).pain_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {(detailLead.analysis as any).recommended_solutions?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1">Solutions</p>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {(detailLead.analysis as any).recommended_solutions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" onClick={() => openExternal(getProfileUrl(detailLead))}>
                    <ExternalLink className="h-4 w-4 mr-2" /> View Profile
                  </Button>
                  {detailLead.status === "discovered" && (
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => { updateLeadStatus(detailLead.id, "qualified"); setDetailLead(null); }}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button variant="outline" onClick={() => { updateLeadStatus(detailLead.id, "dismissed"); setDetailLead(null); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {detailLead.status === "qualified" && detailLead.email && (
                    <Button onClick={() => generateEmail(detailLead.id)} disabled={generatingEmail === detailLead.id}>
                      {generatingEmail === detailLead.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                      Generate Email
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default LeadDiscovery;
