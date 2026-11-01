import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Empty, PageHeader, ago } from "@/components/scotty/ui";
import { STAGES, stageLabel } from "@/lib/api";
import { cn } from "@/lib/utils";

type Lead = Pick<Tables<"leads">, "id" | "business_name" | "email" | "phone" | "location" | "category" | "status" | "discovery_source" | "updated_at" | "created_at">;

const SOURCE_LABEL: Record<string, string> = { website: "Website", email: "Email", google_places: "Google Maps", manual: "Added by you", web: "Web search", firecrawl: "Web search" };
const sourceLabel = (s: string | null) => (s ? (SOURCE_LABEL[s] ?? s.replace(/_/g, " ")) : "—");

const select = "h-8 rounded-md border bg-background px-2 text-[12px]";

function AddLead({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ business_name: "", email: "", phone: "", location: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").insert({
        business_name: form.business_name.trim(),
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        discovery_source: "manual",
        verification_state: "verified",
        status: "qualified",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead added" });
      setForm({ business_name: "", email: "", phone: "", location: "", notes: "" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }),
  });
  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div className="space-y-1">
      <Label className="text-[12px]">{label}</Label>
      <Input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="h-8 text-[13px]" />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add a lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {field("business_name", "Business or person")}
          <div className="grid grid-cols-2 gap-3">
            {field("email", "Email", "email")}
            {field("phone", "Phone")}
          </div>
          {field("location", "Location")}
          {field("notes", "Notes")}
          <p className="text-[11px] text-muted-foreground">Scotty only emails people after they've written to you, so a lead you add by hand won't be emailed automatically.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!form.business_name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Leads = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [source, setSource] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const leads = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, business_name, email, phone, location, category, status, discovery_source, updated_at, created_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Lead[];
    },
  });

  const all = useMemo(() => leads.data ?? [], [leads.data]);
  const sources = useMemo(() => [...new Set(all.map((l) => l.discovery_source).filter(Boolean))] as string[], [all]);
  const shown = all.filter(
    (l) =>
      (stage === "all" || l.status === stage) &&
      (source === "all" || l.discovery_source === source) &&
      (!search || `${l.business_name} ${l.email ?? ""} ${l.phone ?? ""} ${l.location ?? ""}`.toLowerCase().includes(search.toLowerCase())),
  );

  const bulk = useMutation({
    mutationFn: async (op: { stage?: string; remove?: boolean }) => {
      const ids = [...picked];
      for (const id of ids) {
        const q = op.remove ? supabase.from("leads").delete().eq("id", id) : supabase.from("leads").update({ status: op.stage }).eq("id", id);
        const { error } = await q;
        if (error) throw new Error(error.message);
      }
      return ids.length;
    },
    onSuccess: (n, op) => {
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      toast({ title: op.remove ? `Deleted ${n} lead${n === 1 ? "" : "s"}` : `Moved ${n} lead${n === 1 ? "" : "s"} to ${stageLabel(op.stage!)}` });
    },
    onError: (e: Error) => toast({ title: "Something went wrong", description: e.message, variant: "destructive" }),
  });

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allPicked = shown.length > 0 && shown.every((l) => picked.has(l.id));

  return (
    <div className="pb-12">
      <PageHeader
        title="Leads"
        description={`${all.length} lead${all.length === 1 ? "" : "s"}`}
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add lead
          </Button>
        }
      />
      <AddLead open={adding} onOpenChange={setAdding} />

      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-8 w-56 text-[13px]" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={select} aria-label="Stage">
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={select} aria-label="Source">
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
        {picked.size ? (
          <div className="ml-auto flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">{picked.size} selected</span>
            <select className={select} value="" onChange={(e) => e.target.value && bulk.mutate({ stage: e.target.value })} aria-label="Move selected to stage">
              <option value="">Move to…</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => window.confirm(`Delete ${picked.size} lead(s) and their messages? This can't be undone.`) && bulk.mutate({ remove: true })}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <div className="px-6">
        {leads.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : shown.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-[13px]">
              <thead className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox checked={allPicked} onCheckedChange={(c) => setPicked(c ? new Set(shown.map((l) => l.id)) : new Set())} aria-label="Select all" />
                  </th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((l) => (
                  <tr key={l.id} className={cn("cursor-pointer hover:bg-muted/40", picked.has(l.id) && "bg-muted/40")} onClick={() => navigate(`/leads/${l.id}`)}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={picked.has(l.id)} onCheckedChange={() => toggle(l.id)} aria-label={`Select ${l.business_name}`} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.business_name}</div>
                      {l.location || l.category ? <div className="text-[12px] text-muted-foreground">{[l.category, l.location].filter(Boolean).join(" · ")}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div>{l.email ?? "—"}</div>
                      {l.phone ? <div className="text-[12px]">{l.phone}</div> : null}
                    </td>
                    <td className="px-3 py-2">{stageLabel(l.status)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{sourceLabel(l.discovery_source)}</td>
                    <td className="tabular px-3 py-2 text-muted-foreground">{ago(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={all.length ? "No leads match" : "No leads yet"}>
            {all.length ? "Try a different search or filter." : "Website enquiries become leads automatically. You can also add one by hand."}
          </Empty>
        )}
      </div>
    </div>
  );
};

export default Leads;
