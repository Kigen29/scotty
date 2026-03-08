import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Star, Mail, Phone, MapPin } from "lucide-react";

interface KanbanCardProps {
  lead: any;
  onClick?: () => void;
}

const KanbanCard = ({ lead, onClick }: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="p-3 rounded-lg bg-card border border-border shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight truncate">{lead.business_name}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
          <span className="text-[10px] font-semibold">{lead.priority_score || 5}</span>
        </div>
      </div>

      {lead.category && (
        <Badge variant="outline" className="text-[10px] font-normal">
          {lead.category}
        </Badge>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {lead.location && (
          <span className="flex items-center gap-0.5 truncate">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            {lead.location}
          </span>
        )}
        {lead.email && <Mail className="h-2.5 w-2.5 text-emerald-500 shrink-0" />}
        {lead.phone && <Phone className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
      </div>
    </div>
  );
};

export default KanbanCard;
