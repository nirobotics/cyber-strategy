import { describe, expect, it } from "vitest";
import {
  createCyberPitEmbedUrl,
  isCyberPitEmbedRequestAuthorized,
  verifyCyberPitEmbedUrl,
} from "./cyber-pit-embed.server";
import { cyberPitMatchDataRange, matchesCyberPitMatch } from "./cyber-pit-integration.server";

const secret = "test-secret-with-enough-entropy";
const now = Date.UTC(2026, 7, 1);

describe("Cyber Pit embed signing", () => {
  it("accepts an untampered short-lived URL", () => {
    const url = new URL(createCyberPitEmbedUrl("https://strategy.team8214.com", {
      eventKey: "2026otsan",
      kind: "match",
      target: "2026otsan_qm33",
      theme: "dark",
    }, secret, now));

    expect(verifyCyberPitEmbedUrl(url, secret, now + 1_000)).toMatchObject({
      eventKey: "2026otsan",
      kind: "match",
      target: "2026otsan_qm33",
      theme: "dark",
    });
  });

  it("rejects tampering and expired URLs", () => {
    const url = new URL(createCyberPitEmbedUrl("https://strategy.team8214.com", {
      eventKey: "2026otsan",
      kind: "team",
      target: "8214",
      theme: "light",
    }, secret, now));
    url.searchParams.set("target", "9999");
    expect(verifyCyberPitEmbedUrl(url, secret, now)).toBeNull();
    url.searchParams.set("target", "8214");
    expect(verifyCyberPitEmbedUrl(url, secret, now + 5 * 60_000 + 1)).toBeNull();
  });

  it("uses a constant-time bearer comparison", () => {
    expect(isCyberPitEmbedRequestAuthorized(new Request("https://example.com", {
      headers: { Authorization: `Bearer ${secret}` },
    }), secret)).toBe(true);
    expect(isCyberPitEmbedRequestAuthorized(new Request("https://example.com", {
      headers: { Authorization: "Bearer wrong" },
    }), secret)).toBe(false);
  });

  it("limits match preflight to the relevant FRC schedule", () => {
    expect(cyberPitMatchDataRange("practice-0-2")).toBe("practice");
    expect(cyberPitMatchDataRange("qm-0-33")).toBe("qualification");
    expect(cyberPitMatchDataRange("sf-2-1")).toBe("playoff");
    expect(cyberPitMatchDataRange("2026otsan_qm33", "2026otsan")).toBe("qualification");
  });

  it("matches Pit event keys across FRC playoff normalization", () => {
    expect(matchesCyberPitMatch({ comp_level: "qm", match_number: 33 }, "2026otsan", "2026otsan_qm33")).toBe(true);
    expect(matchesCyberPitMatch({ comp_level: "sf", set_number: 5, match_number: 1 }, "2026otsan", "2026otsan_ef5m5")).toBe(true);
    expect(matchesCyberPitMatch({ comp_level: "f", set_number: 1, match_number: 3 }, "2026otsan", "2026otsan_f1m3")).toBe(true);
  });
});
