import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, MessageSquare, Phone, RefreshCw, Send } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { action } from "@/lib/api";
import { ago } from "@/components/scotty/ui";
import { cn } from "@/lib/utils";

type Lead = Tables<"leads">;
type Sheet = {
  opener: string;
  talking_points: string[];
  objections: { q: string; a: string }[];
  ask: string;
  message: string;
  report: { headline: string };
};

const REPORT_BASE = "https://code5developers.com/r";
const OUTCOMES = [
  { id: "no_answer", label: "No answer" },
  { id: "call_back", label: "Call back" },
  { id: "not_interested", label: "Not interested" },
  { id: "interested", label: "Interested" },
] as const;

/** Kenyan numbers → wa.me digits. Mirrors whatsappDigits() on the server. */
function waDigits(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^254\d{9}$/.test(d)) return d;
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

/** Everything for one call: the prepared notes, the report link, the outcome, and sending the report after a yes. */
export function CallPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["id"] | null>(null);
  const [note, setNote] = useState("");
  const [callBack, setCallBack] = useState("");
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(lead.email ?? "");

  const sheet = (lead.report as Sheet | null) ?? null;
  const url = lead.report_token ? `${REPORT_BASE}/${lead.report_token}` : null;
  const wa = waDigits(lead.phone);
  const consented = !!lead.consent_at;
  const text = sheet && url ? `${sheet.message}\n\n${url}` : "";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead", lead.id] });
    qc.invalidateQueries({ queryKey: ["timeline", lead.id] });
    qc.invalidateQueries({ queryKey: ["calls"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };
  const prepare = useMutation({
    mutationFn: (again: boolean) => action("prepare-call", { lead_id: lead.id, refresh: again }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't prepare the call", description: e.message, variant: "destructive" }),
  });
  const log = useMutation({
    mutationFn: () =>
      action("log-call", {
        lead_id: lead.id,
        outcome,
        note: note || undefined,
        call_back_at: outcome === "call_back" && callBack ? new Date(callBack).toISOString() : undefined,
        consent: outcome === "interested" && consent,
        email: outcome === "interested" && consent && email.trim() ? email.trim() : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Call logged" });
      setOutcome(null);
      setNote("");
      setCallBack("");
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn't log the call", description: e.message, variant: "destructive" }),
  });
  const emailReport = useMutation({
    mutationFn: () => action("send-report-email", { lead_id: lead.id }),
    onSuccess: () => {
      toast({ title: "Report emailed", description: lead.email ?? undefined });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });

  if (!lead.phone && !lead.email) return null;

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Call</h2>
        {lead.last_call_at ? (
          <span className="text-[11px] text-muted-foreground">
            Last call {ago(lead.last_call_at)}: {OUTCOMES.find((o) => o.id === lead.last_call_outcome)?.label ?? lead.last_call_outcome}
          </span>
        ) : null}
      </div>

      {lead.phone ? (
        <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-[15px] font-medium hover:bg-muted">
          <Phone className="h-4 w-4" /> {lead.phone}
        </a>
      ) : null}

      {!sheet ? (
        <Button size="sm" variant="outline" className="w-full" disabled={prepare.isPending} onClick={() => prepare.mutate(false)}>
          {prepare.isPending ? <Loader2 className="animate-spin" /> : null}
          {prepare.isPending ? "Preparing notes and report…" : "Prepare call notes and free report"}
        </Button>
      ) : (
        <div className="space-y-2 text-[12px]">
          <p className="rounded bg-muted/40 p-2 italic">“{sheet.opener}”</p>
          <ul className="list-disc space-y-1 pl-4">
            {sheet.talking_points.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer text-muted-foreground">If they say…</summary>
            <dl className="mt-1 space-y-1.5">
              {sheet.objections.map((o) => (
                <div key={o.q}>
                  <dt className="font-medium">“{o.q}”</dt>
                  <dd className="text-muted-foreground">{o.a}</dd>
                </div>
              ))}
            </dl>
          </details>
          <p className="font-medium">{sheet.ask}</p>
          {url ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground">
                <ExternalLink className="h-3 w-3 shrink-0" /> Their free report
              </a>
              <button className="ml-auto inline-flex items-center gap-1 hover:text-foreground" onClick={() => prepare.mutate(true)} disabled={prepare.isPending} title="Write it again">
                <RefreshCw className={cn("h-3 w-3", prepare.isPending && "animate-spin")} /> Rewrite
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <p className="text-[12px] text-muted-foreground">How did it go?</p>
        <div className="grid grid-cols-2 gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOutcome(o.id)}
              className={cn("h-8 rounded-md border text-[12px]", outcome === o.id ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/50")}
            >
              {o.label}
            </button>
          ))}
        </div>
        {outcome === "call_back" ? (
          <Input type="datetime-local" value={callBack} onChange={(e) => setCallBack(e.target.value)} className="h-8 text-[12px]" aria-label="Call back at" />
        ) : null}
        {outcome === "interested" ? (
          <div className="space-y-2 rounded-md bg-muted/40 p-2">
            <label className="flex items-start gap-2 text-[12px]">
              <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
              <span>They agreed to receive the free report. This is recorded as their consent to hear from you.</span>
            </label>
            {consent ? <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email (optional)" className="h-8 text-[12px]" /> : null}
          </div>
        ) : null}
        {outcome ? (
          <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 text-[12px]" />
            <Button size="sm" className="w-full" disabled={log.isPending} onClick={() => log.mutate()}>
              Log call
            </Button>
          </>
        ) : null}
      </div>

      {consented && sheet && url ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-[12px] text-muted-foreground">They agreed {ago(lead.consent_at!)}. Send the report:</p>
          <div className="grid grid-cols-3 gap-1">
            {wa ? (
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null}
            {lead.phone ? (
              <a href={`sms:${lead.phone.replace(/\s/g, "")}?body=${encodeURIComponent(text)}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50">
                <Send className="h-3.5 w-3.5" /> SMS
              </a>
            ) : null}
            <button
              disabled={!lead.email || emailReport.isPending}
              onClick={() => emailReport.mutate()}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50 disabled:opacity-40"
              title={lead.email ? `Email ${lead.email}` : "No email address"}
            >
              Email
            </button>
          </div>
          <button className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(text).then(() => toast({ title: "Copied" }))}>
            <Copy className="h-3 w-3" /> Copy message and link
          </button>
          {lead.report_viewed_at ? <p className="text-[11px] text-primary">Opened {ago(lead.report_viewed_at)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
