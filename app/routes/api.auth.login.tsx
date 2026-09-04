import { redirect } from "react-router";
import type { Route } from "./+types/api.auth.login";
import { codeChallengeS256, randomVerifier, seal } from "../lib/crypto.server";
import { buildAuthorizeUrl } from "../lib/feishu.server";
import { sanitizeReturnTo } from "../lib/request-security.server";
import { createOAuthFlowCookie } from "../lib/session.server";

const STATE_TTL_SECONDS = 10 * 60; // 10 分钟

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const verifier = randomVerifier();
  const nonce = randomVerifier();
  const challenge = codeChallengeS256(verifier);
  const state = seal({
    n: nonce,
    r: returnTo,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });

  throw redirect(buildAuthorizeUrl({ state, codeChallenge: challenge }), {
    headers: {
      "Cache-Control": "private, no-store",
      "Set-Cookie": createOAuthFlowCookie({ nonce, verifier }),
    },
  });
}
