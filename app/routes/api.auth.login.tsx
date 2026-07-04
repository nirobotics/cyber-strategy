import { redirect } from "react-router";
import type { Route } from "./+types/api.auth.login";
import { codeChallengeS256, randomVerifier, seal } from "../lib/crypto.server";
import { buildAuthorizeUrl } from "../lib/feishu.server";

const STATE_TTL_SECONDS = 10 * 60; // 10 分钟

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const verifier = randomVerifier();
  const challenge = codeChallengeS256(verifier);
  const state = seal({
    v: verifier,
    r: returnTo,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });

  throw redirect(buildAuthorizeUrl({ state, codeChallenge: challenge }));
}

/** 只接受本站内部相对路径，挡 open-redirect。 */
function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
