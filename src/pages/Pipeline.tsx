import { useEffect, useState, useCallback } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, DragOverlay, closestCorners } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Star, Mail, Phone, MapPin, Globe } from "lucide-react";
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
    const newStatus = over.id as string;

    // Check if dropped on a column (stage id)
    if (!STAGES.find((s) => s.id === newStatus)) return;

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

  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag leads between stages to update their status
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap">
        {STAGES.map((stage) => {
          const count = leads.filter((l) => l.status === stage.id).length;
          return (
            <div key={stage.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${stage.color}`} />
              <span className="font-medium">{count}</span>
              <span>{stage.label}</span>
            </div>
          );
        })}
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
                leads={leads.filter((l) => l.status === stage.id)}
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
