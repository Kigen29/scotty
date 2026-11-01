import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PageHeader, Section, Stat, Empty, ago, duration } from "@/components/scotty/ui";
import { STAGES, useAgentEvents, useOverview, useThreads } from "@/lib/api";
import { cn } from "@/lib/utils";

const today = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });

const Home = () => {
  const threads = useThreads();
  const overview = useOverview();
  const events = useAgentEvents(8);
  const o = overview.data;
  const needsYou = threads.data?.filter((t) => t.state === "needs_you") ?? [];

  const pipeline = STAGES.slice(0, 6).map((s) => ({ ...s, n: o?.pipeline.find((p) => p.status === s.id)?.n ?? 0 }));
  const pipelineTotal = pipeline.reduce((a, s) => a + s.n, 0);

  return (
    <div className="pb-12">
      <PageHeader
        title="Home"
        description={
          <>
            {today} ·{" "}
            {o ? (
              o.auto_reply_enabled ? (
                <span>Scotty is replying to new enquiries</span>
              ) : (
                <span className="text-warning">Automatic replies are off</span>
              )
            ) : (
              "…"
            )}
          </>
        }
      />

      <div className="mx-auto max-w-5xl space-y-8 px-6 pt-6">
        <Section
          title={`Needs you${needsYou.length ? ` · ${needsYou.length}` : ""}`}
          aside={
            <Link to="/inbox" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              Open inbox <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {threads.isLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          ) : needsYou.length ? (
            <ul className="divide-y rounded-lg border">
              {needsYou.slice(0, 6).map((t) => (
                <li key={t.lead_id}>
                  <Link to={`/inbox?lead=${t.lead_id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{t.business_name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{t.reason ?? t.preview}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{ago(t.last_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nothing needs you">Scotty answers new enquiries itself and brings anything unusual here.</Empty>
          )}
        </Section>

        <Section title="Last 7 days">
          <div className="grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4 sm:divide-y-0">
            <Stat label="Enquiries" value={o?.received_7d ?? "—"} />
            <Stat label="Replied by Scotty" value={o?.auto_replied_7d ?? "—"} />
            <Stat label="Held for you" value={o?.held_7d ?? "—"} />
            <Stat label="Median time to reply" value={duration(o?.median_reply_minutes ?? null)} hint="last 30 days" />
          </div>
        </Section>

        <div className="grid gap-8 lg:grid-cols-5">
          <Section
            title="What Scotty did"
            className="lg:col-span-3"
            aside={
              <Link to="/agent" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                All activity <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {events.data?.length ? (
              <ul className="divide-y rounded-lg border">
                {events.data.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-[13px]">
                      {e.lead_id ? (
                        <Link to={`/leads/${e.lead_id}`} className="hover:underline">
                          {e.summary}
                        </Link>
                      ) : (
                        e.summary
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{ago(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No activity yet">When an enquiry arrives, everything Scotty does with it shows up here.</Empty>
            )}
          </Section>

          <Section title={`Pipeline · ${o?.leads ?? 0} leads`} className="lg:col-span-2">
            <div className="rounded-lg border p-4">
              {pipelineTotal ? (
                <div className="mb-4 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  {pipeline.map((s, i) =>
                    s.n ? (
                      <div key={s.id} className={cn("h-full", ["bg-primary/30", "bg-primary/45", "bg-primary/60", "bg-primary/75", "bg-primary/90", "bg-primary"][i])} style={{ width: `${(s.n / pipelineTotal) * 100}%` }} />
                    ) : null,
                  )}
                </div>
              ) : null}
              <dl className="space-y-1.5">
                {pipeline.map((s) => (
                  <div key={s.id} className="flex justify-between text-[13px]">
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="tabular font-medium">{s.n}</dd>
                  </div>
                ))}
              </dl>
              <Link to="/pipeline" className="mt-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                Open pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default Home;
