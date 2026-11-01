import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Empty, PageHeader, Section, Stat, ago, fullDate } from "@/components/scotty/ui";
import { useAgentEvents, useOverview } from "@/lib/api";
import { cn } from "@/lib/utils";

const KINDS: { id: string; label: string; dot: string }[] = [
  { id: "auto_replied", label: "Replied", dot: "bg-primary" },
  { id: "held", label: "Held for you", dot: "bg-warning" },
  { id: "received", label: "Received", dot: "bg-muted-foreground/40" },
  { id: "operator_replied", label: "You replied", dot: "bg-foreground/50" },
  { id: "skipped", label: "Spam", dot: "bg-muted-foreground/20" },
  { id: "discovered", label: "Discovery", dot: "bg-sky-500" },
  { id: "error", label: "Problems", dot: "bg-destructive" },
];
const kind = (id: string) => KINDS.find((k) => k.id === id) ?? { id, label: id, dot: "bg-muted-foreground/40" };

const RULES = [
  "Replies straight away to new enquiries from people who wrote to you first.",
  "Holds complaints, discount or custom-price requests, contracts and payment terms, legal questions, existing clients, and anything unclear, and tells you why.",
  "Ignores spam.",
  "Never emails anyone marked “Don't contact”, and stops after two automatic replies to one person in a day.",
  "Never starts a conversation: cold outreach stays off until it has its own domain and a consent-first flow.",
];

const Agent = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const overview = useOverview();
  const events = useAgentEvents(500);
  const [filter, setFilter] = useState<string | null>(null);

  const on = overview.data?.auto_reply_enabled ?? true;
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from("settings").update({ auto_reply_enabled: enabled }).eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast({ title: enabled ? "Automatic replies are on" : "Automatic replies are off", description: enabled ? undefined : "New enquiries will wait for you in the inbox." });
    },
    onError: (e: Error) => toast({ title: "Couldn't change it", description: e.message, variant: "destructive" }),
  });

  const all = events.data ?? [];
  const week = all.filter((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 86400_000);
  const count = (k: string) => week.filter((e) => e.kind === k).length;
  const shown = filter ? all.filter((e) => e.kind === filter) : all;

  return (
    <div className="pb-12">
      <PageHeader title="Agent" description="What Scotty does on its own, and the switch that stops it." />

      <div className="mx-auto max-w-5xl space-y-8 px-6 pt-6">
        <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", on ? "bg-primary" : "bg-muted-foreground/40")} />
              <h2 className="text-[14px] font-semibold">Automatic replies {on ? "on" : "off"}</h2>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <Switch checked={on} disabled={overview.isLoading || toggle.isPending} onCheckedChange={(c) => toggle.mutate(c)} aria-label="Automatic replies" />
        </div>

        <Section title="Last 7 days">
          <div className="grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4 sm:divide-y-0">
            <Stat label="Messages received" value={count("received")} />
            <Stat label="Replied automatically" value={count("auto_replied")} />
            <Stat label="Held for you" value={count("held")} />
            <Stat label="Spam ignored" value={count("skipped")} />
          </div>
        </Section>

        <Section title="Activity">
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilter(null)} className={cn("h-7 rounded-md px-2 text-[12px]", !filter ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              Everything
            </button>
            {KINDS.map((k) => (
              <button key={k.id} onClick={() => setFilter(k.id)} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px]", filter === k.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", k.dot)} />
                {k.label}
              </button>
            ))}
          </div>
          {events.isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : shown.length ? (
            <ul className="divide-y rounded-lg border">
              {shown.map((e) => {
                const k = kind(e.kind);
                return (
                  <li key={e.id} className="flex items-baseline gap-3 px-4 py-2.5 text-[13px]">
                    <span className={cn("h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full", k.dot)} />
                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{k.label}</span>
                    <span className="min-w-0 flex-1">
                      {e.lead_id ? (
                        <Link to={`/leads/${e.lead_id}`} className="hover:underline">
                          {e.summary}
                        </Link>
                      ) : (
                        e.summary
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground" title={fullDate(e.created_at)}>
                      {ago(e.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="No activity">Nothing matches this filter yet.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
};

export default Agent;
