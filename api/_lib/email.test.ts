import { describe, expect, it } from "vitest";
import { bareAddress, displayName, isAutomated, isUnsubscribe, leadIdFromAddresses, replyAddress, stripQuoted } from "./email.js";

const LEAD = "047a0d31-373a-49da-8a5a-877b6a229fbc";
const DOMAIN = "in.code5developers.com";

describe("reply addresses", () => {
  it("round-trips a lead id", () => {
    expect(leadIdFromAddresses(["someone@else.com", replyAddress(LEAD, DOMAIN)], DOMAIN)).toBe(LEAD);
  });
  it("finds it inside a display-name address and ignores other domains", () => {
    expect(leadIdFromAddresses([`Code 5 <reply+${LEAD.toUpperCase()}@IN.code5developers.com>`], DOMAIN)).toBe(LEAD);
    expect(leadIdFromAddresses([`reply+${LEAD}@evil.com`], DOMAIN)).toBeNull();
  });
  it("parses names and bare addresses", () => {
    expect(bareAddress("Jane Wanjiku <Jane@Example.com>")).toBe("jane@example.com");
    expect(displayName('"Jane Wanjiku" <jane@example.com>')).toBe("Jane Wanjiku");
    expect(displayName("jane@example.com")).toBeNull();
  });
});

describe("stripping quoted history", () => {
  it("keeps only the new part of a Gmail reply", () => {
    const t = "Sounds good, Thursday works.\n\nOn Sun, 1 Nov 2026 at 14:00, Code 5 Developers <info@code5developers.com> wrote:\n> Hi Kemboi,\n> Thanks for reaching out.";
    expect(stripQuoted(t)).toBe("Sounds good, Thursday works.");
  });
  it("handles Gmail's wrapped attribution line", () => {
    expect(stripQuoted("Yes please.\n\nOn Sun, 1 Nov 2026 at 14:00, Code 5 Developers <\ninfo@code5developers.com> wrote:\n> old")).toBe("Yes please.");
  });
  it("cuts Outlook's header block and old-style separators", () => {
    expect(stripQuoted("Call me tomorrow.\r\n\r\nFrom: Code 5 <info@code5developers.com>\r\nSent: Sunday\r\nTo: me\r\nSubject: Re: site")).toBe("Call me tomorrow.");
    expect(stripQuoted("OK\n-----Original Message-----\nold stuff")).toBe("OK");
  });
  it("drops signatures and stray quoted lines", () => {
    expect(stripQuoted("Great, thanks\n> quoted\n-- \nJane\n0700 000000")).toBe("Great, thanks");
  });
});

describe("robots and opt-outs", () => {
  it("spots auto-responders, bounces and bulk mail", () => {
    expect(isAutomated({ "Auto-Submitted": "auto-replied" }, "jane@x.com", "Re: site")).toBe(true);
    expect(isAutomated({ precedence: "bulk" }, "jane@x.com", "Hello")).toBe(true);
    expect(isAutomated({}, "MAILER-DAEMON@google.com", "Delivery Status Notification (Failure)")).toBe(true);
    expect(isAutomated({}, "jane@x.com", "Out of Office: back Monday")).toBe(true);
    expect(isAutomated({ "auto-submitted": "no" }, "jane@x.com", "Re: Website enquiry")).toBe(false);
  });
  it("recognises a request to stop", () => {
    for (const t of ["STOP", "Unsubscribe.", "remove me", "Please stop emailing me", "Don't contact me again"]) expect(isUnsubscribe(t)).toBe(true);
  });
  it("doesn't mistake an ordinary message for one", () => {
    expect(isUnsubscribe("Can we stop by your office on Friday to talk about the site?")).toBe(false);
    expect(isUnsubscribe("Yes, go ahead.")).toBe(false);
  });
});
