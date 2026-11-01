import { sql } from "./db.js";

/** The Calls screen: who to call back today, who opened their report, and the best not-yet-called prospects. */

type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, values: unknown[] = []) => (await sql().query(text, values)) as T[];

const COLUMNS = `id, business_name, category, location, phone, icp_score, status, last_call_at, last_call_outcome, next_call_at,
                 report_token, report_viewed_at, analysis->>'agent_reason' AS agent_reason`;

export async function callList(operatorId: string) {
  // "Today" in Nairobi, so a call-back set for this afternoon shows up this morning.
  const callBacks = await q(
    `SELECT ${COLUMNS} FROM scotty.leads
      WHERE user_id = $1::uuid AND next_call_at IS NOT NULL AND unsubscribed IS NOT TRUE
        AND next_call_at < (date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') + interval '1 day') AT TIME ZONE 'Africa/Nairobi'
        AND status NOT IN ('not_interested', 'dismissed', 'converted')
      ORDER BY next_call_at`,
    [operatorId],
  );
  const opened = await q(
    `SELECT ${COLUMNS} FROM scotty.leads
      WHERE user_id = $1::uuid AND report_viewed_at > now() - interval '7 days'
        AND (last_call_at IS NULL OR last_call_at < report_viewed_at) AND unsubscribed IS NOT TRUE
      ORDER BY report_viewed_at DESC`,
    [operatorId],
  );
  const toCall = await q(
    `SELECT ${COLUMNS} FROM scotty.leads
      WHERE user_id = $1::uuid AND status = 'qualified' AND last_call_at IS NULL AND phone IS NOT NULL AND unsubscribed IS NOT TRUE
      ORDER BY icp_score DESC NULLS LAST, created_at DESC LIMIT 50`,
    [operatorId],
  );
  return { call_backs: callBacks, opened, to_call: toCall };
}
