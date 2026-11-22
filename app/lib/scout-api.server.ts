import { createHash, createHmac } from "node:crypto";
import { requireNative, requireMutation } from "./native-context.server";
import { getOptionalUser } from "./auth.server";
import { nativeProfile } from "./native-repository.server";
import type { CyberScoutEventRow, CyberScoutRecordRow } from "./cyber-scout";

type Service = { fetch(request: Request): Promise<Response> };
export async function scoutRequest(path: string, method = "GET", payload?: unknown) {
  const { env, request } = requireNative();
  const service = env.SCOUT as Service | undefined, secret = env.SCOUT_STRATEGY_SECRET;
  if (!service?.fetch || typeof secret !== "string" || secret.length < 32) throw new Response("Scout binding unavailable", { status: 503 });
  let capability = "read", actor = (await getOptionalUser(request))?.feishuOpenId ?? "pit-embed";
  if (!["GET", "HEAD"].includes(method)) {
    requireMutation();
    const user = await getOptionalUser(request);
    if (!user || !(await nativeProfile(user.feishuOpenId)).data?.is_admin) throw new Response("Forbidden", { status: 403 });
    capability = "admin"; actor = user.feishuOpenId;
  }
  if (path.startsWith("/photo?") && !(await getOptionalUser(request))) throw new Response("Unauthorized", { status: 401 });
  const body = payload === undefined ? "" : JSON.stringify(payload), at = String(Date.now());
  const target = "/_scout/v1" + path;
  const canonical = ["scout-strategy-v1", method, target, at, actor, capability, createHash("sha256").update(body).digest("hex")].join("\n");
  const headers = new Headers({ "X-Scout-Time": at, "X-Scout-Actor": actor, "X-Scout-Capability": capability, "X-Scout-Signature": createHmac("sha256", secret).update(canonical).digest("hex") });
  if (body) headers.set("Content-Type", "application/json");
  if (path.startsWith("/photo?") && request.headers.has("Range")) headers.set("Range", request.headers.get("Range")!);
  const response = await service.fetch(new Request(String(env.CYBER_SCOUT_ORIGIN) + target, { method, headers, ...(body ? { body } : {}) }));
  if (!response.ok) throw new Response("Scout operation failed", { status: response.status });
  return response;
}
async function json<T>(path: string, method?: string, payload?: unknown): Promise<T> { return (await scoutRequest(path, method, payload)).json() as Promise<T>; }
export function scoutEvents() { return json<CyberScoutEventRow[]>("/events"); }
export function scoutRecords(eventId: string) { return json<CyberScoutRecordRow[]>(`/events/${encodeURIComponent(eventId)}/records`); }
export function scoutUsers() { return json<Array<{ id: string; display_name: string }>>("/users"); }
export function scoutConfig<T>() { return json<T>("/config"); }
export function scoutDelete(id: string) { return json<boolean>(`/records/${encodeURIComponent(id)}`, "DELETE"); }
export function scoutAssignment(action: "save" | "delete", input: unknown) { return json<{ ok: boolean }>(`/assignments/${action}`, "POST", input); }
export function scoutEdit(input: unknown) { return json<{ ok: boolean }>("/edits", "POST", input); }
