import { afterEach, describe, expect, it } from "vitest";
import { redirectUri } from "./feishu.server";

const originalBaseUrl = process.env.APP_BASE_URL;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

describe("redirectUri", () => {
  it("uses the Vite development origin by default", () => {
    delete process.env.APP_BASE_URL;
    expect(redirectUri()).toBe("http://localhost:5173/auth/feishu/callback");
  });

  it("uses the shared Cyber App Feishu callback path", () => {
    process.env.APP_BASE_URL = "https://strategy.team8214.com/";
    expect(redirectUri()).toBe("https://strategy.team8214.com/auth/feishu/callback");
  });
});
