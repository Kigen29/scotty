import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ThreadState } from "@/lib/api";

/** The top of every screen: a title, one line of context, and the screen's actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b px-6 pb-4 pt-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A number with a label underneath. No icon tiles. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground/80">{hint}</div> : null}
    </div>
  );
}

const STATE: Record<ThreadState, { label: string; dot: string }> = {
  needs_you: { label: "Needs you", dot: "bg-warning" },
  waiting: { label: "Waiting on them", dot: "bg-muted-foreground/40" },
  spam: { label: "Spam", dot: "bg-muted-foreground/20" },
};

export function StateLabel({ state, auto }: { state: ThreadState; auto?: boolean }) {
  const s = STATE[state];
  const label = state === "waiting" && auto ? "Replied by Scotty" : s.label;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", state === "waiting" && auto ? "bg-primary" : s.dot)} />
      {label}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 min ago", "yesterday", or a date for anything older than a week. */
export function ago(iso: string | Date) {
  const d = new Date(iso);
  const s = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

/** Minutes as "4 min", "2.5 h" or "3 d". */
export function duration(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} h`;
  return `${Math.round(minutes / 60 / 24)} d`;
}

/** Shown on the outreach screens while cold outreach is switched off. */
export function OutreachPaused() {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground">Outreach is paused.</span> Scotty doesn't send cold emails until outreach has its own
      domain and a permission-first message. Replies to people who write to you work as normal in the Inbox.
    </div>
  );
}
