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
    // 20 base + 30 no site + 12 phone + 9 for 30 reviews + 8 for 4.5 stars + 4 category + 4 area
    expect(prospectScore(base, targets)).toBe(87);
  });

  it("spreads busy businesses apart instead of capping them all at 100", () => {
    const scores = [
      prospectScore({ ...base, reviews: 69, rating: 4.9 }, targets),
      prospectScore({ ...base, reviews: 246, rating: 4.4 }, targets),
      prospectScore({ ...base, reviews: 7, rating: 5 }, targets),
      prospectScore({ ...base, reviews: 46, rating: 3.2 }, targets),
    ];
    expect(new Set(scores).size).toBe(4);
    expect(Math.max(...scores)).toBeLessThan(100);
  });

  it("ignores a perfect rating from a handful of reviews", () => {
    expect(prospectScore({ ...base, reviews: 2, rating: 5 }, targets)).toBeLessThan(prospectScore({ ...base, reviews: 40, rating: 4.6 }, targets));
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
