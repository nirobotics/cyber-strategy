import type { SessionUser } from "./auth-types";
import { seal, unseal } from "./crypto.server";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天
const OAUTH_TTL_SECONDS = 10 * 60;

type SessionPayload = { user: SessionUser; exp: number; iat: number };
type OAuthFlowPayload = { nonce: string; verifier: string; exp: number };

export type AuthSession = { user: SessionUser; issuedAt: number };

function isSecure(): boolean {
  const base = process.env.APP_BASE_URL || "";
  return base.startsWith("https://");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function cookieName(name: string): string {
  return isSecure() ? `__Host-${name}` : name;
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  return [
    `${cookieName(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    isSecure() ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** 生成登录 Set-Cookie（签名加密的 HttpOnly cookie）。 */
export function createSessionCookie(user: SessionUser): string {
  const issuedAt = Date.now();
  const payload: SessionPayload = {
    user,
    iat: issuedAt,
    exp: Math.floor(issuedAt / 1000) + SESSION_TTL_SECONDS,
  };
  return serializeCookie("strategy_session", seal(payload), SESSION_TTL_SECONDS);
}

/** 立即过期的 Set-Cookie（登出）。 */
export function destroySessionCookie(): string {
  return serializeCookie("strategy_session", "", 0);
}

/** 从请求读取并校验 session；无/过期/篡改返回 null。 */
export function readSession(request: Request): AuthSession | null {
  const raw = readCookie(request, cookieName("strategy_session"));
  if (!raw) return null;
  const payload = unseal<SessionPayload>(raw);
  if (!payload || !payload.user || typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
  if (!payload.user.tenantKey) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return { user: payload.user, issuedAt: payload.iat };
}

export function createOAuthFlowCookie(payload: Omit<OAuthFlowPayload, "exp">): string {
  return serializeCookie("strategy_oauth", seal({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS,
  }), OAUTH_TTL_SECONDS);
}

export function readOAuthFlowCookie(request: Request): OAuthFlowPayload | null {
  const raw = readCookie(request, cookieName("strategy_oauth"));
  if (!raw) return null;
  const payload = unseal<OAuthFlowPayload>(raw);
  if (!payload || !payload.nonce || !payload.verifier || typeof payload.exp !== "number") {
    return null;
  }
  return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export function destroyOAuthFlowCookie(): string {
  return serializeCookie("strategy_oauth", "", 0);
}
