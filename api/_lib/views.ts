import { sql } from "./db.js";

/**
 * Read models for the Inbox and Home screens. A thread's state comes from its latest message, worked out
 * here in one query so every screen agrees on what "needs you" means.
 */

type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, values: unknown[] = []) => (await sql().query(text, values)) as T[];

export type ThreadState = "needs_you" | "waiting" | "spam";

export type Thread = {
  lead_id: string;
  business_name: string;
  email: string | null;
  status: string;
  state: ThreadState;
  /** Why it needs you, when it does. */
  reason: string | null;
  last_at: string;
  last_direction: "inbound" | "outbound";
  last_sent_by: string | null;
  preview: string;
  urgency: string | null;
  messages: number;
};

/** A latest inbound message needs you unless Scotty answered it or binned it as spam. */
const STATE_SQL = `
  CASE
    WHEN last.direction = 'outbound' THEN 'waiting'
    WHEN last.agent_action = 'skipped' THEN 'spam'
    ELSE 'needs_you'
  END`;

export async function threads(operatorId: string): Promise<Thread[]> {
  return q<Thread>(
    `WITH last AS (
       SELECT DISTINCT ON (lead_id) *
         FROM scotty.conversations WHERE user_id = $1::uuid
        ORDER BY lead_id, created_at DESC
     ), counts AS (
       SELECT lead_id, count(*)::int AS n FROM scotty.conversations WHERE user_id = $1::uuid GROUP BY lead_id
     )
     SELECT l.id AS lead_id, l.business_name, l.email, l.status,
            ${STATE_SQL} AS state,
            CASE WHEN last.direction = 'inbound' AND last.agent_action IS DISTINCT FROM 'skipped'
                 THEN coalesce(last.agent_reason, CASE WHEN last.summary IS NULL THEN 'Not sorted yet' END) END AS reason,
            last.created_at AS last_at, last.direction AS last_direction, last.sent_by AS last_sent_by,
            coalesce(last.summary, left(last.message, 160)) AS preview, last.urgency, counts.n AS messages
       FROM last JOIN scotty.leads l ON l.id = last.lead_id JOIN counts ON counts.lead_id = last.lead_id
      ORDER BY last.created_at DESC`,
    [operatorId],
  );
}

export async function overview(operatorId: string) {
  const [counts] = await q<{
    received_7d: number;
    auto_replied_7d: number;
    held_7d: number;
    you_replied_7d: number;
    leads: number;
    leads_7d: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND direction = 'inbound' AND created_at > now() - interval '7 days') AS received_7d,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND sent_by = 'auto' AND created_at > now() - interval '7 days') AS auto_replied_7d,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND agent_action = 'held' AND created_at > now() - interval '7 days') AS held_7d,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND sent_by = 'operator' AND created_at > now() - interval '7 days') AS you_replied_7d,
       (SELECT count(*)::int FROM scotty.leads WHERE user_id = $1::uuid) AS leads,
       (SELECT count(*)::int FROM scotty.leads WHERE user_id = $1::uuid AND created_at > now() - interval '7 days') AS leads_7d`,
    [operatorId],
  );
  // Median minutes from an enquiry to the first reply after it, over the last 30 days.
  const [speed] = await q<{ median_minutes: number | null }>(
    `SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.created_at - i.created_at) / 60)::numeric, 1)::float AS median_minutes
       FROM scotty.conversations i
       JOIN LATERAL (
         SELECT created_at FROM scotty.conversations o
          WHERE o.lead_id = i.lead_id AND o.direction = 'outbound' AND o.created_at >= i.created_at
          ORDER BY o.created_at LIMIT 1
       ) r ON true
      WHERE i.user_id = $1::uuid AND i.direction = 'inbound' AND i.created_at > now() - interval '30 days'`,
    [operatorId],
  );
  const pipeline = await q<{ status: string; n: number }>(
    "SELECT status, count(*)::int AS n FROM scotty.leads WHERE user_id = $1::uuid GROUP BY status",
    [operatorId],
  );
  const [settings] = await q<{ auto_reply_enabled: boolean; auto_qualify_enabled: boolean }>(
    "SELECT auto_reply_enabled, auto_qualify_enabled FROM scotty.settings WHERE user_id = $1::uuid",
    [operatorId],
  );
  return {
    ...counts,
    median_reply_minutes: speed?.median_minutes ?? null,
    pipeline,
    auto_reply_enabled: settings?.auto_reply_enabled ?? true,
    auto_qualify_enabled: settings?.auto_qualify_enabled ?? true,
  };
}
