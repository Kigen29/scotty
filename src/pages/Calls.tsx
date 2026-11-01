import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { Empty, PageHeader, Section, ago, fullDate } from "@/components/scotty/ui";
import { useCalls, type CallLead } from "@/lib/api";

function Row({ l, hint }: { l: CallLead; hint: string | null }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link to={`/leads/${l.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium hover:underline">{l.business_name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{hint ?? [l.category, l.location].filter(Boolean).join(" · ")}</span>
      </Link>
      {l.icp_score != null ? <span className="tabular hidden w-8 text-right text-[12px] text-muted-foreground sm:block">{l.icp_score}</span> : null}
      {l.phone ? (
        <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] hover:bg-muted/50">
          <Phone className="h-3.5 w-3.5" /> {l.phone}
        </a>
      ) : null}
    </li>
  );
}

const Calls = () => {
  const calls = useCalls();
  const d = calls.data;

  return (
    <div className="pb-12">
      <PageHeader
        title="Calls"
        description="Who to ring today. Open a business to see Scotty's call notes, log how it went, and send the free report when they say yes."
      />
      <div className="mx-auto max-w-4xl space-y-8 px-6 pt-6">
        {calls.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}

        {d?.opened.length ? (
          <Section title={`Opened their report · ${d.opened.length}`}>
            <ul className="divide-y rounded-lg border border-primary/30">
              {d.opened.map((l) => (
                <Row key={l.id} l={l} hint={`Opened ${ago(l.report_viewed_at!)}. A good moment to call.`} />
              ))}
            </ul>
          </Section>
        ) : null}

        {d?.call_backs.length ? (
          <Section title={`Call back · ${d.call_backs.length}`}>
            <ul className="divide-y rounded-lg border">
              {d.call_backs.map((l) => (
                <Row
                  key={l.id}
                  l={l}
                  hint={`${l.last_call_outcome === "no_answer" ? "No answer last time" : "Asked to be called back"} · due ${fullDate(l.next_call_at!)}`}
                />
              ))}
            </ul>
          </Section>
        ) : null}

        {d ? (
          <Section title={`To call · ${d.to_call.length}`} aside={<span className="text-[11px] text-muted-foreground">Qualified, not called yet, best first</span>}>
            {d.to_call.length ? (
              <ul className="divide-y rounded-lg border">
                {d.to_call.map((l) => (
                  <Row key={l.id} l={l} hint={l.agent_reason} />
                ))}
              </ul>
            ) : (
              <Empty title="No one left to call">Run a Discovery search, and Scotty will qualify the businesses worth calling.</Empty>
            )}
          </Section>
        ) : null}

      </div>
    </div>
  );
};

export default Calls;
