import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Empty, StateLabel, ago, fullDate } from "@/components/scotty/ui";
import { STAGES, action, useThreads, type Thread } from "@/lib/api";
import { cn } from "@/lib/utils";

type Message = Tables<"conversations">;
type Filter = "needs_you" | "all" | "waiting" | "spam";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "needs_you", label: "Needs you" },
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting on them" },
  { id: "spam", label: "Spam" },
];

function ThreadList({ threads, selected, onSelect }: { threads: Thread[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="divide-y">
      {threads.map((t) => (
        <li key={t.lead_id}>
          <button
            onClick={() => onSelect(t.lead_id)}
            className={cn("block w-full px-4 py-3 text-left hover:bg-muted/50", selected === t.lead_id && "bg-muted")}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{t.business_name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{ago(t.last_at)}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{t.state === "needs_you" && t.reason ? t.reason : t.preview}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <StateLabel state={t.state} auto={t.last_sent_by === "auto"} />
              {t.urgency === "high" ? <span className="text-[11px] font-medium text-destructive">Urgent</span> : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

const CHANNEL: Record<string, string> = { email: "email", website: "website form", whatsapp: "WhatsApp" };

function MessageItem({ m, leadName }: { m: Message; leadName: string }) {
  const inbound = m.direction === "inbound";
  const who = inbound ? leadName : m.sent_by === "auto" ? "Scotty (automatic reply)" : "You";
  return (
    <article className={cn("border-l-2 py-1 pl-4", inbound ? "border-border" : m.sent_by === "auto" ? "border-primary/60" : "border-foreground/30")}>
      <header className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">{who}</span>
        <span>{CHANNEL[m.channel] ?? m.channel}</span>
        <span title={fullDate(m.created_at)}>{ago(m.created_at)}</span>
        {m.category ? <span>· {m.category.replace(/_/g, " ")}</span> : null}
        {m.urgency === "high" ? <span className="font-medium text-destructive">· urgent</span> : null}
      </header>
      {m.summary ? <p className="mt-1 text-[12px] italic text-muted-foreground">{m.summary}</p> : null}
      {m.subject ? <p className="mt-2 text-[13px] font-medium">{m.subject}</p> : null}
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{m.message}</p>
    </article>
  );
}

function ThreadView({ leadId, onBack }: { leadId: string; onBack?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const lead = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as Tables<"leads"> | null;
    },
  });
  const messages = useQuery({
    queryKey: ["messages", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").eq("lead_id", leadId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data as Message[];
    },
    refetchInterval: 30_000,
  });

  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const last = list[list.length - 1];
  const awaiting = last?.direction === "inbound" ? last : null;

  // Start from Scotty's draft when the latest message is still unanswered.
  useEffect(() => {
    setSubject(awaiting?.ai_suggested_subject ?? "");
    setBody(awaiting?.ai_suggested_reply ?? "");
  }, [leadId, awaiting?.id, awaiting?.ai_suggested_reply, awaiting?.ai_suggested_subject]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["messages", leadId] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["agent_events"] });
  };

  const send = useMutation({
    mutationFn: () => action("send-reply", { lead_id: leadId, subject: subject.trim() || undefined, message: body.trim() }),
    onSuccess: () => {
      toast({ title: "Reply sent", description: `Emailed to ${lead.data?.email}` });
      setBody("");
      setSubject("");
      refresh();
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });
  const sort = useMutation({
    mutationFn: (id: string) => action("sort-conversation", { conversation_id: id }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't sort it", description: e.message, variant: "destructive" }),
  });
  const setStage = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const l = lead.data;
  if (lead.isLoading || messages.isLoading) return <div className="p-6 text-[13px] text-muted-foreground">Loading…</div>;
  if (!l) return <div className="p-6 text-[13px] text-muted-foreground">This lead no longer exists.</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        {onBack ? (
          <button onClick={onBack} className="rounded p-1 hover:bg-muted" aria-label="Back to inbox">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link to={`/leads/${l.id}`} className="block truncate text-[14px] font-semibold hover:underline">
            {l.business_name}
          </Link>
          <p className="truncate text-[12px] text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <select
          value={l.status}
          onChange={(e) => setStage.mutate(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-[12px]"
          aria-label="Stage"
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {awaiting && awaiting.agent_action === "held" ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px]">
            <span className="font-medium">Scotty held this for you.</span> {awaiting.agent_reason}
          </div>
        ) : null}
        {list.map((m) => (
          <div key={m.id}>
            <MessageItem m={m} leadName={l.business_name} />
            {m.direction === "inbound" && !m.summary ? (
              <Button size="sm" variant="outline" className="ml-4 mt-2" disabled={sort.isPending} onClick={() => sort.mutate(m.id)}>
                {sort.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {sort.isPending ? "Sorting…" : "Sort with Claude"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t px-5 py-3">
        {awaiting?.ai_suggested_reply && body === awaiting.ai_suggested_reply ? (
          <p className="text-[11px] text-muted-foreground">Scotty's draft. Edit it or send as is.</p>
        ) : null}
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-8 text-[13px]" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" rows={7} className="text-[13px] leading-relaxed" />
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[11px] text-muted-foreground">{l.email ? `To ${l.email}` : "No email address"}</p>
          <Button size="sm" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

const InboxPage = () => {
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const selected = params.get("lead");
  const [filter, setFilter] = useState<Filter>("needs_you");
  const [search, setSearch] = useState("");
  const threads = useThreads();

  const all = threads.data ?? [];
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, f.id === "all" ? all.length : all.filter((t) => t.state === f.id).length]));
  // Open on "Needs you" only when there is something there.
  useEffect(() => {
    if (threads.isSuccess && counts.needs_you === 0) setFilter((f) => (f === "needs_you" ? "all" : f));
  }, [threads.isSuccess, counts.needs_you]);

  const shown = all
    .filter((t) => filter === "all" || t.state === filter)
    .filter((t) => !search || `${t.business_name} ${t.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const select = (id: string | null) => setParams(id ? { lead: id } : {});
  const showList = !isMobile || !selected;
  const showThread = !isMobile || selected;

  return (
    <div className="flex h-full">
      {showList ? (
        <div className={cn("flex flex-col border-r", isMobile ? "w-full" : "w-80 shrink-0")}>
          <div className="space-y-3 border-b px-4 pb-3 pt-5">
            <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="h-8 text-[13px]" />
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "h-7 rounded-md px-2 text-[12px]",
                    filter === f.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label} <span className="tabular opacity-60">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.isLoading ? (
              <p className="p-4 text-[13px] text-muted-foreground">Loading…</p>
            ) : shown.length ? (
              <ThreadList threads={shown} selected={selected} onSelect={select} />
            ) : (
              <div className="p-4">
                <Empty title={filter === "needs_you" ? "Nothing needs you" : "No conversations"}>
                  {filter === "needs_you" ? "Scotty is handling replies." : "Website enquiries appear here as they arrive."}
                </Empty>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showThread ? (
        <div className="min-w-0 flex-1">
          {selected ? (
            <ThreadView key={selected} leadId={selected} onBack={isMobile ? () => select(null) : undefined} />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Choose a conversation</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default InboxPage;
