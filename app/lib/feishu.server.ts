/**
 * 飞书 OAuth 2.0（PKCE）服务端模块。所有第三方调用在服务端完成，
 * 前端只走同源 /api/auth/*（cyber-apps 模式 3）。
 */

const AUTHORIZE_BASE = process.env.FEISHU_AUTHORIZE_BASE || "https://accounts.feishu.cn";
const API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn";

export type FeishuUser = {
  openId: string;
  name: string;
  avatarUrl: string | null;
  tenantKey: string | null;
};

function appId(): string {
  const id = process.env.FEISHU_APP_ID;
  if (!id) throw new Error("FEISHU_APP_ID is required");
  return id;
}

function appSecret(): string {
  const s = process.env.FEISHU_APP_SECRET;
  if (!s) throw new Error("FEISHU_APP_SECRET is required");
  return s;
}

/** 规范回调地址：canonical-origin redirect（模式 13）。 */
export function redirectUri(): string {
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/auth/feishu/callback`;
}

/** 构造飞书授权 URL（带 PKCE S256 + sealed state）。 */
export function buildAuthorizeUrl(opts: { state: string; codeChallenge: string }): string {
  const url = new URL("/open-apis/authen/v1/authorize", AUTHORIZE_BASE);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  const scope = process.env.FEISHU_OAUTH_SCOPE;
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

/** 用 code + PKCE verifier 换 user_access_token。失败返回 null（不抛进 UI）。 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/open-apis/authen/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: appId(),
        client_secret: appSecret(),
        code,
        redirect_uri: redirectUri(),
        code_verifier: codeVerifier,
      }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    // v2 顶层返回 access_token；兼容 data 包裹
    const data = (json.data as Record<string, unknown>) ?? json;
    const token = data.access_token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/** 用 user_access_token 拉用户基本信息，归一化（模式 14）。 */
async function fetchUserInfo(accessToken: string): Promise<FeishuUser | null> {
  try {
    const res = await fetch(`${API_BASE}/open-apis/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as Record<string, unknown>;
    const data = (json.data as Record<string, unknown>) ?? {};
    const openId = firstString(data.open_id, data.union_id);
    if (!openId) return null;
    return {
      openId,
      name: firstString(data.name, data.en_name) ?? "队员",
      avatarUrl: firstString(data.avatar_url, data.avatar_thumb, data.avatar_middle),
      tenantKey: firstString(data.tenant_key),
    };
  } catch {
    return null;
  }
}

/** 组织 allow-list：未配置或无法识别租户时拒绝登录。 */
export function isTenantAllowed(tenantKey: string | null): boolean {
  const raw = process.env.FEISHU_ALLOWED_TENANT_KEYS;
  if (!raw || !raw.trim()) return false;
  const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return tenantKey != null && allow.includes(tenantKey);
}

/** 完整登录换取：code → token → user。任一步失败返回 null。 */
export async function completeLogin(code: string, codeVerifier: string): Promise<FeishuUser | null> {
  const token = await exchangeCodeForToken(code, codeVerifier);
  if (!token) return null;
  return fetchUserInfo(token);
}
