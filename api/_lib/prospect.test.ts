import { describe, expect, it } from "vitest";
import { domainGuesses, prospectScore, websiteKind, type Prospect } from "./prospect.js";

describe("website check", () => {
  it("tells no site, social presence and a real site apart", () => {
    expect(websiteKind(null)).toBe("none");
    expect(websiteKind("")).toBe("none");
    expect(websiteKind("https://www.facebook.com/mamanjerisalon")).toBe("social");
    expect(websiteKind("https://m.facebook.com/x")).toBe("social");
    expect(websiteKind("http://wa.me/254700000000")).toBe("social");
    expect(websiteKind("https://mamanjeri.business.site/")).toBe("social");
    expect(websiteKind("https://rangautiles.com/")).toBe("site");
    expect(websiteKind("rangautiles.com")).toBe("site");
  });
  it("doesn't mistake lookalike hosts for social sites", () => {
    expect(websiteKind("https://notfacebook.com")).toBe("site");
  });
});

describe("domain guesses", () => {
  it("builds the likely .co.ke and .ke names", () => {
    expect(domainGuesses("Mama Njeri's Salon")).toEqual(["mamanjerissalon.co.ke", "mamanjerissalon.ke"]);
    expect(domainGuesses("Rongai Hardware Ltd")).toEqual(["rongaihardware.co.ke", "rongaihardware.ke"]);
    expect(domainGuesses("Café Délice & Co.")).toEqual(["cafedelice.co.ke", "cafedelice.ke"]);
  });
  it("gives up on names too short or too long to guess", () => {
    expect(domainGuesses("Ltd")).toEqual([]);
    expect(domainGuesses("A".repeat(60))).toEqual([]);
  });
});

describe("prospect score", () => {
  const base: Prospect = { website: "none", hasPhone: true, rating: 4.5, reviews: 30, category: "Bakery", location: "Ngong", domainRegistered: false };
  const targets = { categories: ["bakeries"], locations: ["Ngong"] };

  it("rates an active, reachable business with no website highly", () => {
    expect(prospectScore(base, targets)).toBe(96);
  });
  it("ranks no site above social-only above a domain that may host a site", () => {
    const none = prospectScore(base, targets);
    const social = prospectScore({ ...base, website: "social" }, targets);
    const domain = prospectScore({ ...base, domainRegistered: true }, targets);
    expect(none).toBeGreaterThan(social);
    expect(none).toBeGreaterThan(domain);
  });
  it("marks down businesses we can't call", () => {
    expect(prospectScore({ ...base, hasPhone: false }, targets)).toBeLessThan(prospectScore(base, targets));
  });
  it("stays within 0–100", () => {
    expect(prospectScore({ ...base, website: "site", hasPhone: false, reviews: 0, rating: null, domainRegistered: true }, { categories: [], locations: [] })).toBeGreaterThanOrEqual(0);
  });
});
