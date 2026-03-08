import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";

interface KanbanColumnProps {
  id: string;
  label: string;
  color: string;
  leads: any[];
  onCardClick?: (lead: any) => void;
}

const KanbanColumn = ({ id, label, color, leads, onCardClick }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto text-[11px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 space-y-2 transition-colors min-h-[200px] ${
          isOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/40"
        }`}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick?.(lead)} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
