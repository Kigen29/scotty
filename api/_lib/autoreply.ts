import type { Triage } from "./triage.js";

/**
 * Whether Scotty sends its drafted reply on its own. Deliberately plain code, not the model: Claude labels
 * the message, and these rules decide. Anything not clearly safe is held for the operator.
 */

export type AutoReplyContext = {
  /** Settings → Automation. The kill switch. */
  enabled: boolean;
  /** canReply(): they wrote to us first, have an email, haven't unsubscribed. */
  canReply: { ok: true } | { ok: false; reason: string };
  /** Automatic replies already sent to this lead in the last 24 hours. */
  autoRepliesLast24h: number;
};

export type Decision =
  | { action: "auto_replied" }
  | { action: "held"; reason: string }
  | { action: "skipped"; reason: string };

/**
 * Only new enquiries get an automatic answer. Existing clients deserve a personal reply, and suppliers,
 * job seekers and "other" wait for a person.
 */
const AUTO_CATEGORIES = new Set<Triage["category"]>(["new_lead"]);

/** Stops two automated mailboxes replying to each other forever, once email replies flow in. */
export const MAX_AUTO_REPLIES_PER_DAY = 2;

export function autoReplyDecision(triage: Triage | null, ctx: AutoReplyContext): Decision {
  if (!triage) return { action: "held", reason: "Claude couldn't sort this message" };
  if (triage.category === "spam") return { action: "skipped", reason: "Spam" };
  if (!triage.reply) return { action: "held", reason: "No reply was drafted" };
  if (!ctx.enabled) return { action: "held", reason: "Automatic replies are switched off" };
  if (!ctx.canReply.ok) return { action: "held", reason: ctx.canReply.reason };
  if (triage.needs_human) return { action: "held", reason: triage.needs_human_reason || "Claude flagged it for you" };
  if (triage.category === "existing_client") return { action: "held", reason: "An existing client: worth a personal reply" };
  if (!AUTO_CATEGORIES.has(triage.category)) {
    return { action: "held", reason: `Not an enquiry (${triage.category.replace(/_/g, " ")})` };
  }
  if (ctx.autoRepliesLast24h >= MAX_AUTO_REPLIES_PER_DAY) {
    return { action: "held", reason: `Already sent ${ctx.autoRepliesLast24h} automatic replies to them today` };
  }
  return { action: "auto_replied" };
}
