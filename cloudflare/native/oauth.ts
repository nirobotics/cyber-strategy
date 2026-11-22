import { createHash, timingSafeEqual } from "node:crypto";
import type { RuntimeEnv } from "./runtime";
const cookieName = "__Host-strategy_native_oauth";
const digest = (state: string) => createHash("sha256").update(state).digest("hex");
export async function consumeState(request: Request, env: RuntimeEnv) {
  const state = new URL(request.url).searchParams.get("state") ?? "";
  const cookie = request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1) ?? "";
  const id = digest(state);
  if (!state || !/^[a-f0-9]{64}$/.test(cookie) || !timingSafeEqual(Buffer.from(cookie), Buffer.from(id))) return false;
  const consumed = await env.DB.prepare("UPDATE native_oauth_states SET used=1 WHERE id=? AND used=0 AND expires_ms>? RETURNING id").bind(id, Date.now()).first();
  return Boolean(consumed);
}
export async function registerState(response: Response, env: RuntimeEnv) {
  const location = response.headers.get("Location");
  if (response.status !== 302 || !location) return response;
  const state = new URL(location).searchParams.get("state");
  if (!state) return response;
  const id = digest(state);
  await env.DB.prepare("INSERT INTO native_oauth_states(id,expires_ms,used) VALUES(?,?,0)").bind(id, Date.now() + 10 * 60_000).run();
  await env.DB.prepare("DELETE FROM native_oauth_states WHERE expires_ms<?").bind(Date.now() - 10 * 60_000).run();
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${cookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`);
  return new Response(response.body, { status: response.status, headers });
}
