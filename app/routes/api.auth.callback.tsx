import { redirect } from "react-router";
import type { Route } from "./+types/api.auth.callback";
import { unseal } from "../lib/crypto.server";
import { completeLogin, isTenantAllowed } from "../lib/feishu.server";
import { toSessionUser, upsertProfile } from "../lib/profiles.server";
import { createSessionCookie } from "../lib/session.server";
import { appendAudit } from "../lib/audit.server";

type StatePayload = { v: string; r: string; exp: number };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");

  if (!code || !rawState) return fail("missing_code_or_state");

  const state = unseal<StatePayload>(rawState);
  if (!state || typeof state.v !== "string" || typeof state.exp !== "number") {
    return fail("bad_state");
  }
  if (state.exp < Math.floor(Date.now() / 1000)) return fail("state_expired");

  const user = await completeLogin(code, state.v);
  if (!user) return fail("feishu_exchange_failed");

  if (!isTenantAllowed(user.tenantKey)) return fail("tenant_not_allowed");

  await upsertProfile(user);
  await appendAudit("auth.login", { actorOpenId: user.openId });

  const returnTo = state.r && state.r.startsWith("/") && !state.r.startsWith("//") ? state.r : "/";
  return redirect(returnTo, {
    headers: { "Set-Cookie": createSessionCookie(toSessionUser(user)) },
  });
}

function fail(reason: string) {
  return redirect(`/auth/login?error=${encodeURIComponent(reason)}`);
}
