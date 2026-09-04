import { afterEach, describe, expect, it } from "vitest";
import { isTenantAllowed, redirectUri } from "./feishu.server";

const originalBaseUrl = process.env.APP_BASE_URL;
const originalTenantKeys = process.env.FEISHU_ALLOWED_TENANT_KEYS;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
  if (originalTenantKeys === undefined) delete process.env.FEISHU_ALLOWED_TENANT_KEYS;
  else process.env.FEISHU_ALLOWED_TENANT_KEYS = originalTenantKeys;
});

describe("isTenantAllowed", () => {
  it("fails closed when the allow-list is missing", () => {
    delete process.env.FEISHU_ALLOWED_TENANT_KEYS;
    expect(isTenantAllowed("tenant-a")).toBe(false);
  });

  it("only accepts an exact configured tenant key", () => {
    process.env.FEISHU_ALLOWED_TENANT_KEYS = "tenant-a, tenant-b";
    expect(isTenantAllowed("tenant-b")).toBe(true);
    expect(isTenantAllowed("tenant-c")).toBe(false);
    expect(isTenantAllowed(null)).toBe(false);
  });
});

describe("redirectUri", () => {
  it("uses the shared Cyber App Feishu callback path", () => {
    process.env.APP_BASE_URL = "https://strategy.team8214.com/";
    expect(redirectUri()).toBe("https://strategy.team8214.com/auth/feishu/callback");
  });
});
