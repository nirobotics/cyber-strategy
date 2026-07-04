import { redirect } from "react-router";
import type { SessionUser } from "./auth-types";
import { readSession } from "./session.server";
import { isAdmin } from "./profiles.server";

/** 可选当前用户（游客兼容 loader 用）。 */
export function getOptionalUser(request: Request): SessionUser | null {
  return readSession(request);
}

/** 必须登录（写操作 action / API 用）；未登录抛 401 或重定向。 */
export function requireUser(request: Request, opts: { redirectToLogin?: boolean } = {}): SessionUser {
  const user = readSession(request);
  if (!user) {
    if (opts.redirectToLogin) {
      const url = new URL(request.url);
      throw redirect(`/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
    }
    throw new Response("未登录", { status: 401 });
  }
  return user;
}

/** 必须为管理员；服务端读 profiles.is_admin（前端禁用不算数）。 */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = requireUser(request);
  if (!(await isAdmin(user.feishuOpenId))) {
    throw new Response("无权限", { status: 403 });
  }
  return user;
}
