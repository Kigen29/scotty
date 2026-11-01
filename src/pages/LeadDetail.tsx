import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Empty, ago, fullDate } from "@/components/scotty/ui";
import { STAGES } from "@/lib/api";
import { CallPanel } from "@/components/scotty/CallPanel";
import { cn } from "@/lib/utils";

type Lead = Tables<"leads">;
type Message = Tables<"conversations">;
type Event = Tables<"agent_events">;
type Item = { at: string; message?: Message; event?: Event };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const LeadDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as Lead | null;
    },
  });
  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: async () => {
      const [m, e] = await Promise.all([
        supabase.from("conversations").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
        supabase.from("agent_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      ]);
      if (m.error) throw new Error(m.error.message);
      if (e.error) throw new Error(e.error.message);
      const items: Item[] = [
        ...(m.data as Message[]).map((message) => ({ at: message.created_at, message })),
        // Message arrivals and sends are already shown as messages; keep the decisions and errors.
        ...(e.data as Event[]).filter((ev) => !["received", "operator_replied", "auto_replied"].includes(ev.kind)).map((event) => ({ at: event.created_at, event })),
      ];
      return items.sort((a, b) => b.at.localeCompare(a.at));
    },
    refetchInterval: 30_000,
  });

  useEffect(() => setNotes(lead.data?.notes ?? ""), [lead.data?.notes]);

  const update = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      toast({ title: "Lead deleted" });
      navigate("/leads");
    },
  });

  const l = lead.data;
  if (lead.isLoading) return <div className="p-6 text-[13px] text-muted-foreground">Loading…</div>;
  if (!l) return <div className="p-6 text-[13px] text-muted-foreground">This lead doesn't exist.</div>;
  const hasMessages = timeline.data?.some((i) => i.message);

  return (
    <div className="pb-12">
      <header className="border-b px-6 pb-4 pt-5">
        <Link to="/leads" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{l.business_name}</h1>
          <select value={l.status} onChange={(e) => update.mutate({ status: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-[12px]" aria-label="Stage">
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {hasMessages ? (
            <Button size="sm" variant="outline" onClick={() => navigate(`/inbox?lead=${l.id}`)}>
              <Inbox /> Open in inbox
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 pt-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-2">
          <h2 className="text-[13px] font-medium text-muted-foreground">Timeline</h2>
          {timeline.data?.length ? (
            <ol className="space-y-4">
              {timeline.data.map((i) =>
                i.message ? (
                  <li key={i.message.id} className={cn("border-l-2 pl-4", i.message.direction === "inbound" ? "border-border" : i.message.sent_by === "auto" ? "border-primary/60" : "border-foreground/30")}>
                    <div className="flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {i.message.direction === "inbound" ? l.business_name : i.message.sent_by === "auto" ? "Scotty (automatic reply)" : "You"}
                      </span>
                      <span>{i.message.channel}</span>
                      <span title={fullDate(i.message.created_at)}>{ago(i.message.created_at)}</span>
                    </div>
                    {i.message.summary ? <p className="mt-1 text-[12px] italic text-muted-foreground">{i.message.summary}</p> : null}
                    {i.message.subject ? <p className="mt-1.5 text-[13px] font-medium">{i.message.subject}</p> : null}
                    <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed">{i.message.message}</p>
                  </li>
                ) : (
                  <li key={i.event!.id} className="flex items-baseline gap-2 pl-[18px] text-[12px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full", i.event!.kind === "held" ? "bg-warning" : i.event!.kind === "error" ? "bg-destructive" : "bg-muted-foreground/40")} />
                    <span className="flex-1">{i.event!.summary}</span>
                    <span>{ago(i.event!.created_at)}</span>
                  </li>
                ),
              )}
            </ol>
          ) : (
            <Empty title="Nothing here yet">Messages and everything Scotty does for this lead will appear here.</Empty>
          )}
        </section>

        <aside className="space-y-6">
          {l.discovery_source === "google_places" || l.last_call_at || l.consent_at ? <CallPanel lead={l} /> : null}
          <section>
            <h2 className="mb-1 text-[13px] font-medium text-muted-foreground">Details</h2>
            <dl className="divide-y rounded-lg border px-3">
              <Detail label="Email">{l.email ? <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a> : null}</Detail>
              <Detail label="Phone">{l.phone ? <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a> : null}</Detail>
              <Detail label="Location">{l.location}</Detail>
              <Detail label="Category">{l.category}</Detail>
              <Detail label="Website">{l.website_url ? <a href={l.website_url} target="_blank" rel="noreferrer" className="hover:underline">{l.website_url.replace(/^https?:\/\//, "")}</a> : l.has_website === false ? "None" : null}</Detail>
              {l.place_id ? (
                <Detail label="On Google">
                  {l.rating ? `${Number(l.rating).toFixed(1)} stars from ${l.review_count ?? 0} reviews` : "No reviews"}
                  {l.google_maps_url ? (
                    <>
                      {" · "}
                      <a href={l.google_maps_url} target="_blank" rel="noreferrer" className="hover:underline">
                        Map
                      </a>
                    </>
                  ) : null}
                </Detail>
              ) : null}
              <Detail label="Source">{l.discovery_source === "google_places" ? "Google Maps" : l.discovery_source}</Detail>
              <Detail label="Added">{fullDate(l.created_at)}</Detail>
            </dl>
          </section>

          <section>
            <h2 className="mb-1 text-[13px] font-medium text-muted-foreground">Notes</h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (l.notes ?? "") && update.mutate({ notes: notes.trim() || null })}
              rows={5}
              placeholder="Anything worth remembering. Saves when you click away."
              className="text-[13px]"
            />
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <label className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-[13px] font-medium">Don't contact</span>
                <span className="block text-[12px] text-muted-foreground">Scotty will never email them, even if they write again.</span>
              </span>
              <Switch checked={!!l.unsubscribed} onCheckedChange={(c) => update.mutate({ unsubscribed: c })} />
            </label>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-destructive"
              onClick={() => window.confirm(`Delete ${l.business_name} and all their messages? This can't be undone.`) && remove.mutate()}
            >
              Delete lead
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default LeadDetail;
