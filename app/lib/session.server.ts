import type { SessionUser } from "./auth-types";
import { seal, unseal } from "./crypto.server";

const SESSION_COOKIE = "strategy_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

type SessionPayload = { user: SessionUser; exp: number };

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

/** 生成登录 Set-Cookie（签名加密的 HttpOnly cookie）。 */
export function createSessionCookie(user: SessionUser): string {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const value = seal(payload);
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isSecure() ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** 立即过期的 Set-Cookie（登出）。 */
export function destroySessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecure() ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** 从请求读取并校验 session；无/过期/篡改返回 null。 */
export function readSession(request: Request): SessionUser | null {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const payload = unseal<SessionPayload>(raw);
  if (!payload || !payload.user || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload.user;
}
