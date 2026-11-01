import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInbound, validSignature, whatsappDigits } from "./whatsapp.js";

describe("validSignature", () => {
  const secret = "app-secret";
  const raw = '{"object":"whatsapp_business_account"}';
  const good = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  it("accepts Meta's signature of the exact body", () => {
    expect(validSignature(raw, good, secret)).toBe(true);
  });
  it("rejects a changed body, a wrong secret, or no header", () => {
    expect(validSignature(`${raw} `, good, secret)).toBe(false);
    expect(validSignature(raw, good, "other")).toBe(false);
    expect(validSignature(raw, null, secret)).toBe(false);
    expect(validSignature(raw, "sha1=abc", secret)).toBe(false);
  });
});

describe("parseInbound", () => {
  const delivery = (messages: unknown[]) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "1", changes: [{ field: "messages", value: { contacts: [{ wa_id: "254712345678", profile: { name: "Wanjiru" } }], messages } }] }],
  });

  it("reads a text message with the sender's name", () => {
    const [m] = parseInbound(delivery([{ id: "wamid.1", from: "254712345678", timestamp: "1793565346", type: "text", text: { body: "Yes please send it" } }]));
    expect(m).toMatchObject({ id: "wamid.1", from: "254712345678", name: "Wanjiru", text: "Yes please send it" });
    expect(m.at).toBe(new Date(1793565346 * 1000).toISOString());
  });
  it("labels media and reads button replies", () => {
    const out = parseInbound(
      delivery([
        { id: "a", from: "254712345678", type: "audio" },
        { id: "b", from: "254712345678", type: "button", button: { text: "Send it" } },
        { id: "c", from: "254712345678", type: "reaction" },
      ]),
    );
    expect(out.map((m) => m.text)).toEqual(["[sent a voice note]", "Send it", "[sent a reaction]"]);
  });
  it("ignores status updates and other objects", () => {
    expect(parseInbound({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(parseInbound({ object: "page" })).toEqual([]);
    expect(parseInbound(null)).toEqual([]);
  });
});

describe("whatsappDigits", () => {
  it("normalises Kenyan numbers", () => {
    expect(whatsappDigits("0719 587323")).toBe("254719587323");
    expect(whatsappDigits("+254 110 123456")).toBe("254110123456");
  });
});
