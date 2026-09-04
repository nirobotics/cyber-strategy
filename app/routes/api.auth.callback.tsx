import { redirect } from "react-router";
import type { Route } from "./+types/api.auth.callback";
import { safeEqual, unseal } from "../lib/crypto.server";
import { completeLogin, isTenantAllowed } from "../lib/feishu.server";
import { toSessionUser, upsertProfile } from "../lib/profiles.server";
import {
  createSessionCookie,
  destroyOAuthFlowCookie,
  readOAuthFlowCookie,
} from "../lib/session.server";
import { appendAudit } from "../lib/audit.server";
import { sanitizeReturnTo } from "../lib/request-security.server";

type StatePayload = { n: string; r: string; exp: number };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const flow = readOAuthFlowCookie(request);

  if (!code || !rawState) return fail("missing_code_or_state");

  const state = unseal<StatePayload>(rawState);
  if (!state || typeof state.n !== "string" || typeof state.r !== "string" || typeof state.exp !== "number") {
    return fail("bad_state");
  }
  if (state.exp <= Math.floor(Date.now() / 1000)) return fail("state_expired");
  if (!flow || !safeEqual(state.n, flow.nonce)) return fail("state_not_bound");

  const user = await completeLogin(code, flow.verifier);
  if (!user) return fail("feishu_exchange_failed");

  if (!isTenantAllowed(user.tenantKey)) return fail("tenant_not_allowed");

  const profile = await upsertProfile(user).catch(() => null);
  if (!profile) return fail("profile_unavailable");
  if (!profile.isActive) return fail("account_disabled");
  await appendAudit("auth.login", { actorOpenId: user.openId });

  return redirect(sanitizeReturnTo(state.r), {
    headers: [
      ["Cache-Control", "private, no-store"],
      ["Set-Cookie", createSessionCookie(toSessionUser(user))],
      ["Set-Cookie", destroyOAuthFlowCookie()],
    ],
  });
}

function fail(reason: string) {
  return redirect(`/auth/login?error=${encodeURIComponent(reason)}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Set-Cookie": destroyOAuthFlowCookie(),
    },
  });
}
