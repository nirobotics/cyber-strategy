import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seal } from "./crypto.server";
import {
  createOAuthFlowCookie,
  createSessionCookie,
  readOAuthFlowCookie,
  readSession,
} from "./session.server";

const originalSecret = process.env.SESSION_SECRET;
const originalBaseUrl = process.env.APP_BASE_URL;
const user = {
  id: "ou_1",
  feishuOpenId: "ou_1",
  displayName: "Scout",
  avatarUrl: null,
  tenantKey: "tenant-a",
};

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-bytes";
  process.env.APP_BASE_URL = "https://strategy.team8214.com";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

describe("session cookies", () => {
  it("uses a __Host cookie and restores a complete session", () => {
    const cookie = createSessionCookie(user);
    expect(cookie).toContain("__Host-strategy_session=");
    expect(cookie).toContain("Secure");
    const session = readSession(requestWithCookie(cookie));
    expect(session?.user).toEqual(user);
    expect(session?.issuedAt).toEqual(expect.any(Number));
  });

  it("rejects legacy payloads without issue time and tenant binding", () => {
    const token = seal({ user: { ...user, tenantKey: undefined }, exp: Math.floor(Date.now() / 1000) + 60 });
    const request = new Request("https://strategy.team8214.com/", {
      headers: { Cookie: `__Host-strategy_session=${token}` },
    });
    expect(readSession(request)).toBeNull();
  });
});

describe("OAuth flow cookie", () => {
  it("keeps the verifier in an encrypted browser-bound cookie", () => {
    const cookie = createOAuthFlowCookie({ nonce: "nonce", verifier: "verifier" });
    expect(cookie).not.toContain("verifier");
    expect(readOAuthFlowCookie(requestWithCookie(cookie))).toMatchObject({ nonce: "nonce", verifier: "verifier" });
  });
});

function requestWithCookie(setCookie: string) {
  return new Request("https://strategy.team8214.com/", {
    headers: { Cookie: setCookie.split(";", 1)[0] },
  });
}
