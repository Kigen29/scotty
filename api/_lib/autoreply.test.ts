import { describe, expect, it } from "vitest";
import { autoReplyDecision, MAX_AUTO_REPLIES_PER_DAY, type AutoReplyContext } from "./autoreply.js";
import type { Triage } from "./triage.js";

const lead: Triage = {
  category: "new_lead",
  urgency: "normal",
  summary: "A salon wants a booking site.",
  business: "Mama Njeri's Salon",
  suggested_package: "Business website",
  reply: { subject: "Re: your enquiry", body: "Hi..." },
  needs_human: false,
  needs_human_reason: null,
};
const ok: AutoReplyContext = { enabled: true, canReply: { ok: true }, autoRepliesLast24h: 0 };

describe("automatic replies", () => {
  it("answers a genuine new enquiry straight away", () => {
    expect(autoReplyDecision(lead, ok)).toEqual({ action: "auto_replied" });
  });

  it("skips spam without bothering anyone", () => {
    expect(autoReplyDecision({ ...lead, category: "spam", reply: null }, ok)).toEqual({ action: "skipped", reason: "Spam" });
  });

  it("holds whatever Claude flags, with Claude's reason", () => {
    expect(autoReplyDecision({ ...lead, needs_human: true, needs_human_reason: "Asks for a discount" }, ok)).toEqual({
      action: "held",
      reason: "Asks for a discount",
    });
  });

  it("holds existing clients, suppliers, job seekers and tests for a person", () => {
    for (const category of ["existing_client", "supplier_or_partner", "job_seeker", "other"] as const) {
      expect(autoReplyDecision({ ...lead, category }, ok).action).toBe("held");
    }
  });

  it("respects the kill switch", () => {
    expect(autoReplyDecision(lead, { ...ok, enabled: false })).toEqual({ action: "held", reason: "Automatic replies are switched off" });
  });

  it("never emails someone it may not contact", () => {
    const d = autoReplyDecision(lead, { ...ok, canReply: { ok: false, reason: "This person asked not to be contacted." } });
    expect(d).toEqual({ action: "held", reason: "This person asked not to be contacted." });
  });

  it("stops after a couple of automatic replies a day, so two robots can't loop", () => {
    expect(autoReplyDecision(lead, { ...ok, autoRepliesLast24h: MAX_AUTO_REPLIES_PER_DAY }).action).toBe("held");
  });

  it("holds when Claude couldn't sort it or didn't draft anything", () => {
    expect(autoReplyDecision(null, ok).action).toBe("held");
    expect(autoReplyDecision({ ...lead, reply: null }, ok).action).toBe("held");
  });
});
