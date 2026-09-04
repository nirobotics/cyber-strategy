import { describe, expect, it } from "vitest";
import { requireMethod, requireSameOrigin, sanitizeReturnTo } from "./request-security.server";

describe("sanitizeReturnTo", () => {
  it("keeps internal paths", () => {
    expect(sanitizeReturnTo("/dashboard?tab=team#8214")).toBe("/dashboard?tab=team#8214");
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/%5Cevil.example/",
  ])("rejects external redirect form %s", (value) => {
    expect(sanitizeReturnTo(value)).toBe("/");
  });
});

describe("request guards", () => {
  it("accepts the expected method and same origin", () => {
    const request = new Request("https://strategy.team8214.com/action", {
      method: "POST",
      headers: { Origin: "https://strategy.team8214.com" },
    });
    expect(() => requireMethod(request, "POST")).not.toThrow();
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("rejects unexpected methods", () => {
    expectThrownResponse(
      () => requireMethod(new Request("https://strategy.team8214.com/action", { method: "DELETE" }), "POST"),
      405,
    );
  });

  it("rejects missing and cross-origin Origin headers", () => {
    expectThrownResponse(
      () => requireSameOrigin(new Request("https://strategy.team8214.com/action", { method: "POST" })),
      403,
    );
    expectThrownResponse(
      () => requireSameOrigin(new Request("https://strategy.team8214.com/action", {
        method: "POST",
        headers: { Origin: "https://evil.team8214.com" },
      })),
      403,
    );
  });
});

function expectThrownResponse(run: () => void, status: number) {
  try {
    run();
    throw new Error("expected Response");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
  }
}
