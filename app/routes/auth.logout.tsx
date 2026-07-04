import { redirect } from "react-router";
import type { Route } from "./+types/auth.logout";
import { getOptionalUser } from "../lib/auth.server";
import { destroySessionCookie } from "../lib/session.server";
import { appendAudit } from "../lib/audit.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = getOptionalUser(request);
  if (user) await appendAudit("auth.logout", { actorOpenId: user.feishuOpenId });
  throw redirect("/auth/login?signedOut=1", { headers: { "Set-Cookie": destroySessionCookie() } });
}

export default function LogoutRoute() {
  return null;
}
