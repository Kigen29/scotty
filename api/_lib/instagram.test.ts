import { describe, expect, it } from "vitest";
import { handleGuesses, igUsernameFromUrl, looksLikeMatch, summarize } from "./instagram.js";

describe("igUsernameFromUrl", () => {
  it("reads the handle from profile links, with or without tracking params", () => {
    expect(igUsernameFromUrl("https://www.instagram.com/spritzhairstudio/")).toBe("spritzhairstudio");
    expect(igUsernameFromUrl("https://www.instagram.com/_hair_on_wheelske?igsh=MXhn&utm_source=qr")).toBe("_hair_on_wheelske");
    expect(igUsernameFromUrl("instagram.com/SpaAlexiz254")).toBe("spaalexiz254");
  });
  it("ignores posts, reels and other sites", () => {
    expect(igUsernameFromUrl("https://www.instagram.com/p/Cx123/")).toBeNull();
    expect(igUsernameFromUrl("https://www.instagram.com/reel/Cx123/")).toBeNull();
    expect(igUsernameFromUrl("http://www.facebook.com/brimhardware")).toBeNull();
    expect(igUsernameFromUrl(null)).toBeNull();
  });
});

describe("handleGuesses", () => {
  it("drops filler words and tries Kenyan suffixes", () => {
    const g = handleGuesses("Ramco Hardware Ltd");
    expect(g[0]).toBe("ramcohardware");
    expect(g).toContain("ramcohardwareke");
    expect(g).toContain("ramco_hardware");
  });
  it("returns nothing usable for an empty name", () => {
    expect(handleGuesses("Ltd")).toEqual([]);
  });
});

describe("looksLikeMatch", () => {
  const lead = { business_name: "Spritz Hair Studio", phone: "0712 345678" };
  it("accepts a same-name account based in Kenya", () => {
    expect(looksLikeMatch({ username: "spritzhairstudio", name: "Spritz Hair Studio", biography: "Salon in Kilimani, Nairobi" }, lead)).toBe(true);
  });
  it("accepts a same-name account carrying the business's phone", () => {
    expect(looksLikeMatch({ username: "spritzhair", name: "Spritz Hair", biography: "Book: 0712345678" }, lead)).toBe(true);
  });
  it("rejects a namesake abroad", () => {
    expect(looksLikeMatch({ username: "spritzhairstudio", name: "Spritz Hair Studio", biography: "Salon in Austin, Texas" }, lead)).toBe(false);
  });
  it("rejects a different business in Nairobi", () => {
    expect(looksLikeMatch({ username: "glowbar", name: "Glow Bar", biography: "Nairobi" }, lead)).toBe(false);
  });
});

describe("summarize", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  it("works out recency, activity and likes", () => {
    const f = summarize(
      {
        username: "polar",
        followers_count: 1200,
        media_count: 80,
        biography: "Café in Buru",
        media: {
          data: [
            { caption: "We turned 1! 🎉", timestamp: "2026-10-28T10:00:00+0000", media_type: "VIDEO", like_count: 300 },
            { caption: "New menu", timestamp: "2026-10-10T10:00:00+0000", media_type: "IMAGE", like_count: 100 },
            { caption: "Pop-up", timestamp: "2026-07-01T10:00:00+0000", media_type: "IMAGE", like_count: 50 },
          ],
        },
      },
      "google",
      now,
    );
    expect(f.url).toBe("https://www.instagram.com/polar/");
    expect(f.last_post_days_ago).toBe(4);
    expect(f.posts_last_30_days).toBe(2);
    expect(f.average_likes).toBe(150);
    expect(f.recent_posts[0]).toMatchObject({ type: "VIDEO", caption: "We turned 1! 🎉" });
  });
  it("handles an account with no posts", () => {
    const f = summarize({ username: "quiet" }, "guessed", now);
    expect(f.last_post_days_ago).toBeNull();
    expect(f.average_likes).toBeNull();
    expect(f.recent_posts).toEqual([]);
  });
});
