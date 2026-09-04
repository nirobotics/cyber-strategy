export type SessionUser = {
  id: string;
  feishuOpenId: string;
  displayName: string;
  avatarUrl: string | null;
  tenantKey: string;
};

export type AuthMode = "guest-compatible" | "login-required";
