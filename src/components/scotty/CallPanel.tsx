import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Mail, MessageSquare, Phone, RefreshCw, Send } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { action } from "@/lib/api";
import { ago } from "@/components/scotty/ui";
import { cn } from "@/lib/utils";

type Lead = Tables<"leads">;
type Prepared = {
  first_message: string;
  call: { opener: string; talking_points: string[]; objections: { q: string; a: string }[]; ask: string };
  audit: { title: string };
  send_message: string;
  hook?: string | null;
};

const REPORT_BASE = "https://code5developers.com/r";
const OUTCOMES = [
  { id: "no_answer", label: "No reply / no answer" },
  { id: "call_back", label: "Follow up later" },
  { id: "not_interested", label: "Not interested" },
  { id: "interested", label: "Said yes" },
] as const;

/** Kenyan numbers → wa.me digits. Mirrors whatsappDigits() on the server. */
function waDigits(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^254\d{9}$/.test(d)) return d;
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

function CopyBox({ label, text }: { label: string; text: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <button className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(text).then(() => toast({ title: "Copied" }))}>
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[12px] leading-relaxed">{text}</p>
    </div>
  );
}

/**
 * Outreach for one lead, in the shape of the Polar message that worked: a personal first message offering a free
 * audit as a gift, call notes if you'd rather ring, then the audit itself once they say yes.
 */
export function CallPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const prepared = (lead.report as Prepared | null)?.audit ? (lead.report as Prepared) : null;
  const [hook, setHook] = useState(prepared?.hook ?? "");
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["id"] | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(lead.email ?? "");

  const url = lead.report_token ? `${REPORT_BASE}/${lead.report_token}` : null;
  const wa = waDigits(lead.phone);
  const analysis = (lead.analysis ?? {}) as { listed_url?: string | null; instagram?: { url: string; source: "google" | "guessed"; username: string } | null };
  const social = analysis.listed_url ?? analysis.instagram?.url ?? null;
  const guessedIg = !analysis.listed_url && analysis.instagram?.source === "guessed";
  const consented = !!lead.consent_at;
  const sendText = prepared && url ? `${prepared.send_message}\n\n${url}` : "";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead", lead.id] });
    qc.invalidateQueries({ queryKey: ["timeline", lead.id] });
    qc.invalidateQueries({ queryKey: ["calls"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };
  const prepare = useMutation({
    mutationFn: () => action("prepare-call", { lead_id: lead.id, refresh: !!prepared, hook: hook.trim() || undefined }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't prepare it", description: e.message, variant: "destructive" }),
  });
  const log = useMutation({
    mutationFn: () =>
      action<{ audit_sent?: string | null; audit_error?: string | null }>("log-call", {
        lead_id: lead.id,
        outcome,
        note: note || undefined,
        call_back_at: outcome === "call_back" && followUp ? new Date(followUp).toISOString() : undefined,
        consent: outcome === "interested" && consent,
        email: outcome === "interested" && consent && email.trim() ? email.trim() : undefined,
      }),
    onSuccess: (r: { audit_sent?: string | null; audit_error?: string | null }) => {
      if (r?.audit_sent) toast({ title: "Logged, and the audit is on its way on WhatsApp" });
      else if (r?.audit_error) toast({ title: "Logged, but the audit wasn't sent", description: r.audit_error, variant: "destructive" });
      else toast({ title: "Logged" });
      setOutcome(null);
      setNote("");
      setFollowUp("");
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn't log it", description: e.message, variant: "destructive" }),
  });
  const usage = useQuery({
    queryKey: ["outreach-usage"],
    queryFn: () => action<{ sent_today: number; limit: number; configured: boolean; whatsapp: boolean }>("outreach-usage", {}),
    enabled: !!prepared,
  });
  const emailFirst = useMutation({
    mutationFn: () => action<{ sent_today: number; limit: number }>("send-first-email", { lead_id: lead.id }),
    onSuccess: (r) => {
      toast({ title: "Emailed from outreach@", description: `${r.sent_today} of ${r.limit} today. Their reply will land in the Inbox.` });
      qc.invalidateQueries({ queryKey: ["outreach-usage"] });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });
  const waAudit = useMutation({
    mutationFn: () => action("send-audit-whatsapp", { lead_id: lead.id }),
    onSuccess: () => {
      toast({ title: "Audit sent on WhatsApp" });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });
  const emailAudit = useMutation({
    mutationFn: () => action("send-report-email", { lead_id: lead.id }),
    onSuccess: () => {
      toast({ title: "Audit emailed", description: lead.email ?? undefined });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Outreach</h2>
        {lead.last_call_at ? (
          <span className="text-[11px] text-muted-foreground">
            {ago(lead.last_call_at)}: {OUTCOMES.find((o) => o.id === lead.last_call_outcome)?.label ?? lead.last_call_outcome}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="hook" className="text-[11px] text-muted-foreground">
          What caught your eye? (optional, makes the opening personal)
        </label>
        <Input id="hook" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="e.g. anniversary video on TikTok, pop-ups to a café" className="h-8 text-[12px]" />
        <Button size="sm" variant={prepared ? "outline" : "default"} className="w-full" disabled={prepare.isPending} onClick={() => prepare.mutate()}>
          {prepare.isPending ? <Loader2 className="animate-spin" /> : prepared ? <RefreshCw /> : null}
          {prepare.isPending ? "Writing the message and audit…" : prepared ? "Rewrite" : "Write first message and free audit"}
        </Button>
      </div>

      {prepared ? (
        <div className="space-y-3">
          <CopyBox label="First message" text={prepared.first_message} />
          <div className="flex flex-wrap gap-1">
            {social ? (
              <a href={social} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted/50">
                <ExternalLink className="h-3 w-3" /> {guessedIg ? `Found @${analysis.instagram!.username}: check it's them, then send` : "Open their page to send it"}
              </a>
            ) : null}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted/50">
                <ExternalLink className="h-3 w-3" /> Preview their audit
              </a>
            ) : null}
            {lead.email && !consented ? (
              <button
                disabled={emailFirst.isPending || usage.data?.configured === false}
                onClick={() => emailFirst.mutate()}
                title={usage.data?.configured === false ? "The outreach mailbox isn't set up yet" : `Send to ${lead.email} from outreach@`}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted/50 disabled:opacity-40"
              >
                <Mail className="h-3 w-3" /> {emailFirst.isPending ? "Sending…" : "Email it"}
                {usage.data ? <span className="text-muted-foreground">({usage.data.sent_today}/{usage.data.limit} today)</span> : null}
              </button>
            ) : null}
          </div>
          {lead.phone ? (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-muted-foreground">Rather call? Notes for the call</summary>
              <div className="mt-2 space-y-2">
                <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-[14px] font-medium hover:bg-muted">
                  <Phone className="h-4 w-4" /> {lead.phone}
                </a>
                <p className="rounded bg-muted/40 p-2 italic">“{prepared.call.opener}”</p>
                <ul className="list-disc space-y-1 pl-4">
                  {prepared.call.talking_points.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <dl className="space-y-1.5">
                  {prepared.call.objections.map((o) => (
                    <div key={o.q}>
                      <dt className="font-medium">“{o.q}”</dt>
                      <dd className="text-muted-foreground">{o.a}</dd>
                    </div>
                  ))}
                </dl>
                <p className="font-medium">{prepared.call.ask}</p>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-3">
        <p className="text-[12px] text-muted-foreground">What happened?</p>
        <div className="grid grid-cols-2 gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOutcome(o.id)}
              className={cn("h-8 rounded-md border px-1 text-[12px]", outcome === o.id ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/50")}
            >
              {o.label}
            </button>
          ))}
        </div>
        {outcome === "call_back" ? (
          <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="h-8 text-[12px]" aria-label="Follow up at" />
        ) : null}
        {outcome === "interested" ? (
          <div className="space-y-2 rounded-md bg-muted/40 p-2">
            <label className="flex items-start gap-2 text-[12px]">
              <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
              <span>They said yes to receiving the audit on WhatsApp or email. This is recorded as their consent to hear from you.</span>
            </label>
            {consent ? <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email (optional)" className="h-8 text-[12px]" /> : null}
          </div>
        ) : null}
        {outcome ? (
          <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 text-[12px]" />
            <Button size="sm" className="w-full" disabled={log.isPending} onClick={() => log.mutate()}>
              Save
            </Button>
          </>
        ) : null}
      </div>

      {consented && prepared && url ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-[12px] text-muted-foreground">They said yes {ago(lead.consent_at!)}. Send the audit:</p>
          <CopyBox label="Message with the link" text={sendText} />
          <div className="grid grid-cols-3 gap-1">
            {wa && usage.data?.whatsapp ? (
              <button
                disabled={waAudit.isPending}
                onClick={() => waAudit.mutate()}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50 disabled:opacity-40"
              >
                <MessageSquare className="h-3.5 w-3.5" /> {waAudit.isPending ? "Sending…" : "WhatsApp"}
              </button>
            ) : wa ? (
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(sendText)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null}
            {lead.phone ? (
              <a href={`sms:${lead.phone.replace(/\s/g, "")}?body=${encodeURIComponent(sendText)}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50">
                <Send className="h-3.5 w-3.5" /> SMS
              </a>
            ) : null}
            <button
              disabled={!lead.email || emailAudit.isPending}
              onClick={() => emailAudit.mutate()}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[12px] hover:bg-muted/50 disabled:opacity-40"
              title={lead.email ? `Email ${lead.email}` : "No email address"}
            >
              Email
            </button>
          </div>
          {lead.report_viewed_at ? <p className="text-[11px] text-primary">Opened {ago(lead.report_viewed_at)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
