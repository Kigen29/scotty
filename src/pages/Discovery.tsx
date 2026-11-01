import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Phone, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Empty, PageHeader, ago } from "@/components/scotty/ui";
import { action } from "@/lib/api";
import { cn } from "@/lib/utils";

type Lead = Tables<"leads">;
type Usage = { used: number; limit: number; configured: boolean };
type Result = { query: string; found: number; added: number; already_known: number; with_website: number; closed: number };
type Analysis = { website?: "none" | "social"; listed_url?: string | null; registered_domain?: string | null };

const VIEWS = [
  { id: "discovered", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "dismissed", label: "Dismissed" },
] as const;

function WebsiteCheck({ a }: { a: Analysis }) {
  if (a.registered_domain) {
    return <span title="A domain matching their name is registered. They may have a site Google doesn't list.">Domain {a.registered_domain}</span>;
  }
  if (a.website === "social") {
    return (
      <span>
        Social only
        {a.listed_url ? (
          <a href={a.listed_url} target="_blank" rel="noreferrer" className="ml-1 text-muted-foreground hover:text-foreground">
            ↗
          </a>
        ) : null}
      </span>
    );
  }
  return <span className="text-primary">No website</span>;
}

const Discovery = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("discovered");
  const [last, setLast] = useState<Result | null>(null);

  const usage = useQuery({ queryKey: ["discovery-usage"], queryFn: () => action<Usage>("discovery-usage") });
  const settings = useQuery({
    queryKey: ["settings-targets"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("target_categories, target_locations").maybeSingle();
      return data as Pick<Tables<"settings">, "target_categories" | "target_locations"> | null;
    },
  });
  const leads = useQuery({
    queryKey: ["discovered", view],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("discovery_source", "google_places")
        .eq("status", view)
        .order("icp_score", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return data as Lead[];
    },
  });

  const search = useMutation({
    mutationFn: () => action<Result>("discover-leads", { category: what.trim(), location: where.trim() }),
    onSuccess: (r) => {
      setLast(r);
      setView("discovered");
      qc.invalidateQueries({ queryKey: ["discovered"] });
      qc.invalidateQueries({ queryKey: ["discovery-usage"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["agent_events"] });
    },
    onError: (e: Error) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovered"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const u = usage.data;
  const left = u ? Math.max(0, u.limit - u.used) : null;
  const chips = (list: string[] | null | undefined, set: (v: string) => void, current: string) =>
    (list ?? []).filter(Boolean).slice(0, 8).map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => set(c)}
        className={cn("h-6 rounded border px-1.5 text-[11px]", current === c ? "border-foreground/40 bg-muted" : "text-muted-foreground hover:text-foreground")}
      >
        {c}
      </button>
    ));

  return (
    <div className="pb-12">
      <PageHeader
        title="Discovery"
        description="Real businesses on Google Maps that don't have a website yet."
        actions={left != null ? <span className="tabular text-[12px] text-muted-foreground">{left} of {u!.limit} Google searches left this month</span> : null}
      />

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {u && !u.configured ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px]">
            <span className="font-medium">Discovery isn't connected yet.</span> Add a Google Maps Platform key as <code>GOOGLE_PLACES_API_KEY</code> in
            Vercel, then redeploy.
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (what.trim() || where.trim()) search.mutate();
          }}
          className="space-y-3 rounded-lg border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <label htmlFor="what" className="text-[12px] text-muted-foreground">
                Kind of business
              </label>
              <Input id="what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. bakeries, salons, hardware shops" className="h-9" />
              <div className="flex flex-wrap gap-1">{chips(settings.data?.target_categories, setWhat, what)}</div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="where" className="text-[12px] text-muted-foreground">
                Area
              </label>
              <Input id="where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Ngong, Kilimani, Nakuru" className="h-9" />
              <div className="flex flex-wrap gap-1">{chips(settings.data?.target_locations, setWhere, where)}</div>
            </div>
            <div className="flex items-start pt-[22px]">
              <Button type="submit" disabled={search.isPending || (!what.trim() && !where.trim()) || u?.configured === false}>
                {search.isPending ? <Loader2 className="animate-spin" /> : <Search />}
                {search.isPending ? "Searching Google…" : "Search"}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Each search looks at up to 60 businesses (3 Google searches) and keeps the ones with no website or only a social page.
          </p>
          {last ? (
            <p className="rounded bg-muted/60 px-2 py-1.5 text-[12px]">
              <span className="font-medium">{last.added} new</span> from {last.found} found for “{last.query}”.
              {last.with_website ? ` ${last.with_website} already have a website.` : ""}
              {last.already_known ? ` ${last.already_known} were already in Scotty.` : ""}
              {last.closed ? ` ${last.closed} are closed.` : ""}
            </p>
          ) : null}
        </form>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn("h-7 rounded-md px-2 text-[12px]", view === v.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {v.label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">New finds nobody acts on are cleared after 30 days, as Google's terms require.</span>
          </div>

          {leads.isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : leads.data?.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">On Google</th>
                    <th className="px-3 py-2 font-medium">Website</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leads.data.map((l) => {
                    const a = (l.analysis ?? {}) as Analysis;
                    return (
                      <tr key={l.id} className="align-top hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Link to={`/leads/${l.id}`} className="font-medium hover:underline">
                            {l.business_name}
                          </Link>
                          <div className="max-w-[340px] truncate text-[12px] text-muted-foreground" title={l.location ?? ""}>
                            {[l.category, l.location].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {l.phone ? (
                            <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:underline">
                              <Phone className="h-3 w-3 opacity-60" />
                              {l.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {l.rating ? (
                            <span className="tabular inline-flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {Number(l.rating).toFixed(1)} ({l.review_count ?? 0})
                            </span>
                          ) : (
                            "No reviews"
                          )}
                          {l.google_maps_url ? (
                            <a href={l.google_maps_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 hover:text-foreground">
                              Map <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <WebsiteCheck a={a} />
                        </td>
                        <td className="tabular px-3 py-2 text-right font-medium">{l.icp_score ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {view !== "qualified" ? (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => setStatus.mutate({ id: l.id, status: "qualified" })}>
                              Qualify
                            </Button>
                          ) : null}
                          {view !== "dismissed" ? (
                            <Button size="sm" variant="ghost" className="ml-1 h-7 text-muted-foreground" onClick={() => setStatus.mutate({ id: l.id, status: "dismissed" })}>
                              Dismiss
                            </Button>
                          ) : null}
                          {view === "dismissed" ? (
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatus.mutate({ id: l.id, status: "discovered" })}>
                              Restore
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                {leads.data.length} business{leads.data.length === 1 ? "" : "es"} · last found {ago(leads.data.reduce((m, l) => (l.created_at > m ? l.created_at : m), leads.data[0].created_at))}
              </p>
            </div>
          ) : (
            <Empty title={view === "discovered" ? "No new businesses yet" : `Nothing ${view}`}>
              {view === "discovered" ? "Search for a kind of business and an area above." : "Leads you move here show up in this list."}
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
};

export default Discovery;
