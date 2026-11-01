import { describe, expect, it } from "vitest";
import { shortArea, whatsappDigits } from "./outreach.js";

describe("WhatsApp numbers", () => {
  it("normalises the formats Google and people use for Kenyan numbers", () => {
    expect(whatsappDigits("+254 719 587323")).toBe("254719587323");
    expect(whatsappDigits("0719 587323")).toBe("254719587323");
    expect(whatsappDigits("0110 123456")).toBe("254110123456");
    expect(whatsappDigits("719587323")).toBe("254719587323");
    expect(whatsappDigits("(+254) 722-518-763")).toBe("254722518763");
  });
  it("returns nothing rather than a wrong number", () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("12345")).toBeNull();
    expect(whatsappDigits("n/a")).toBeNull();
  });
});

describe("short area", () => {
  it("keeps the last two parts of an address", () => {
    expect(shortArea("Adlife Plaza, 2nd floor Ring Rd Kilimani, Nairobi")).toBe("2nd floor Ring Rd Kilimani, Nairobi");
    expect(shortArea("Menelik Rd, Nairobi")).toBe("Menelik Rd, Nairobi");
    expect(shortArea(null)).toBeNull();
  });
});
