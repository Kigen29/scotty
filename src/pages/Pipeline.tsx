import { useEffect, useState, useCallback, useMemo } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, DragOverlay, closestCorners } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useTeam } from "@/hooks/useTeam";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Star, Mail, Phone, MapPin, Globe, Search, X, UserCircle } from "lucide-react";
import KanbanColumn from "@/components/pipeline/KanbanColumn";

const STAGES = [
  { id: "discovered", label: "Discovered", color: "bg-muted-foreground" },
  { id: "qualified", label: "Qualified", color: "bg-blue-500" },
  { id: "contacted", label: "Contacted", color: "bg-amber-500" },
  { id: "responded", label: "Responded", color: "bg-primary" },
  { id: "interested", label: "Interested", color: "bg-emerald-500" },
  { id: "not_interested", label: "Not Interested", color: "bg-destructive" },
];

const Pipeline = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { members, assignLead } = useTeam();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [minPriority, setMinPriority] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)
      .order("priority_score", { ascending: false });
    if (data) setLeads(data);
  }, [user]);

  useEffect(() => {
    if (user) fetchLeads();
  }, [user, fetchLeads]);

  useRealtimeSubscription("leads", user?.id, fetchLeads);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    let newStatus = over.id as string;

    // If dropped on a card instead of a column, resolve the card's column
    if (!STAGES.find((s) => s.id === newStatus)) {
      const overLead = leads.find((l) => l.id === newStatus);
      if (overLead) {
        newStatus = overLead.status;
      } else {
        return;
      }
    }

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );

    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", leadId);

    if (error) {
      toast({ title: "Failed to move lead", description: error.message, variant: "destructive" });
      fetchLeads(); // revert
    } else {
      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user!.id,
        action: "lead_stage_changed",
        details: {
          lead_id: leadId,
          business_name: lead.business_name,
          from: lead.status,
          to: newStatus,
        },
      });
      toast({ title: `Moved to ${newStatus.replace("_", " ")}` });
    }
  };

  const activeLead = leads.find((l) => l.id === activeId);

  // Derive unique categories and locations for filter dropdowns
  const categories = useMemo(() => [...new Set(leads.map((l) => l.category).filter(Boolean))].sort(), [leads]);
  const locations = useMemo(() => [...new Set(leads.map((l) => l.location).filter(Boolean))].sort(), [leads]);
  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => { map[m.user_id] = m.display_name; });
    return map;
  }, [members]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (searchQuery && !l.business_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
      if (locationFilter !== "all" && l.location !== locationFilter) return false;
      if ((l.priority_score || 0) < minPriority) return false;
      return true;
    });
  }, [leads, searchQuery, categoryFilter, locationFilter, minPriority]);

  const hasFilters = searchQuery || categoryFilter !== "all" || locationFilter !== "all" || minPriority > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setLocationFilter("all");
    setMinPriority(0);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag leads between stages to update their status
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">Priority ≥ {minPriority}</span>
          <Slider
            value={[minPriority]}
            onValueChange={([v]) => setMinPriority(v)}
            min={0}
            max={10}
            step={1}
            className="w-[100px]"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap">
        {STAGES.map((stage) => {
          const count = filteredLeads.filter((l) => l.status === stage.id).length;
          return (
            <div key={stage.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${stage.color}`} />
              <span className="font-medium">{count}</span>
              <span>{stage.label}</span>
            </div>
          );
        })}
        {hasFilters && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            Showing {filteredLeads.length} of {leads.length}
          </span>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 min-h-[400px]">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.id}
                id={stage.id}
                label={stage.label}
                color={stage.color}
                leads={filteredLeads.filter((l) => l.status === stage.id)}
                onCardClick={setSelectedLead}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead ? (
              <div className="p-3 rounded-lg bg-card border border-primary shadow-lg w-[244px] rotate-2">
                <p className="text-sm font-medium truncate">{activeLead.business_name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {activeLead.category} • {activeLead.location}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <SheetContent className="overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedLead.business_name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={`text-[10px] border-0 ${
                      {
                        discovered: "bg-secondary text-secondary-foreground",
                        qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                        contacted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                        responded: "bg-primary/15 text-primary",
                        interested: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                        not_interested: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
                      }[selectedLead.status as string] || "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {selectedLead.status?.replace("_", " ")}
                  </Badge>
                  {selectedLead.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedLead.category}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2.5 text-sm">
                  {selectedLead.location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedLead.location}
                    </div>
                  )}
                  {selectedLead.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {selectedLead.email}
                    </div>
                  )}
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {selectedLead.phone}
                    </div>
                  )}
                  {selectedLead.website_url && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      <a
                        href={selectedLead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline truncate"
                      >
                        {selectedLead.website_url}
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-semibold">
                    Priority: {selectedLead.priority_score || 5}/10
                  </span>
                </div>

                {/* Assignment */}
                {members.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <UserCircle className="h-3.5 w-3.5" /> Assigned To
                    </Label>
                    <Select
                      value={selectedLead.assigned_to || "unassigned"}
                      onValueChange={async (v) => {
                        const target = v === "unassigned" ? null : v;
                        const { error } = await assignLead(selectedLead.id, target);
                        if (!error) {
                          setSelectedLead({ ...selectedLead, assigned_to: target });
                          setLeads((prev) =>
                            prev.map((l) =>
                              l.id === selectedLead.id ? { ...l, assigned_to: target } : l
                            )
                          );
                          toast({ title: target ? "Lead assigned" : "Assignment removed" });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedLead.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm bg-muted p-3 rounded-lg">{selectedLead.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Pipeline;
