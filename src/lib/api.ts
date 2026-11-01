import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Calls an api/fn action and unwraps its data, throwing its error so React Query can show it. */
export async function action<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export type ThreadState = "needs_you" | "waiting" | "spam";

export type Thread = {
  lead_id: string;
  business_name: string;
  email: string | null;
  status: string;
  state: ThreadState;
  reason: string | null;
  last_at: string;
  last_direction: "inbound" | "outbound";
  last_sent_by: string | null;
  preview: string;
  urgency: string | null;
  messages: number;
};

export type Overview = {
  received_7d: number;
  auto_replied_7d: number;
  held_7d: number;
  you_replied_7d: number;
  leads: number;
  leads_7d: number;
  median_reply_minutes: number | null;
  pipeline: { status: string; n: number }[];
  auto_reply_enabled: boolean;
  auto_qualify_enabled: boolean;
};

export type AgentEvent = Tables<"agent_events"> & { leads?: { business_name: string } | null };

/** Refetch on an interval: there's no realtime any more, and new enquiries arrive in the background. */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true };

export const useThreads = () => useQuery({ queryKey: ["threads"], queryFn: () => action<Thread[]>("threads"), ...LIVE });
export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: () => action<Overview>("overview"), ...LIVE });

export const useAgentEvents = (limit = 200) =>
  useQuery({
    queryKey: ["agent_events", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_events")
        .select("*, leads(business_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data as AgentEvent[];
    },
    ...LIVE,
  });

export const STAGES = [
  { id: "discovered", label: "Discovered" },
  { id: "qualified", label: "Qualified" },
  { id: "contacted", label: "Contacted" },
  { id: "responded", label: "Responded" },
  { id: "interested", label: "Interested" },
  { id: "converted", label: "Won" },
  { id: "not_interested", label: "Not interested" },
  { id: "dismissed", label: "Dismissed" },
] as const;

export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;

export type CallLead = {
  id: string;
  business_name: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  icp_score: number | null;
  last_call_at: string | null;
  last_call_outcome: string | null;
  next_call_at: string | null;
  report_viewed_at: string | null;
  agent_reason: string | null;
};
export type CallList = { call_backs: CallLead[]; opened: CallLead[]; to_call: CallLead[] };

/** The Calls screen's list; also feeds the sidebar badge. */
export const useCalls = () => useQuery({ queryKey: ["calls"], queryFn: () => action<CallList>("calls"), refetchInterval: 60_000 });
