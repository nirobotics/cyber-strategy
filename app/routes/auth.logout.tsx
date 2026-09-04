import { redirect } from "react-router";
import type { Route } from "./+types/auth.logout";
import { getOptionalUser } from "../lib/auth.server";
import { destroySessionCookie } from "../lib/session.server";
import { appendAudit } from "../lib/audit.server";
import { revokeSessions } from "../lib/profiles.server";
import { requireMethod, requireSameOrigin, securityResponseHeaders } from "../lib/request-security.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod(request, "POST");
  requireSameOrigin(request);
  const user = await getOptionalUser(request);
  if (user) {
    try {
      await revokeSessions(user.feishuOpenId);
    } catch (error) {
      console.error("session revocation failed", error);
      throw new Response("登出失败，请重试", {
        status: 503,
        headers: { ...securityResponseHeaders, "Set-Cookie": destroySessionCookie() },
      });
    }
  }
  if (user) await appendAudit("auth.logout", { actorOpenId: user.feishuOpenId });
  throw redirect("/auth/login?signedOut=1", { headers: { "Set-Cookie": destroySessionCookie() } });
}

export function loader() {
  throw redirect("/auth/login");
}

export default function LogoutRoute() {
  return null;
}
