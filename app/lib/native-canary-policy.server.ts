// Independent app-local canary policy: no caller-supplied authority or generic write API.
export const CANARY_EVENT = "2026cfmigrationacceptance";
export const CANARY_MARKER = "SYNTHETIC_MIGRATION_CANARY";
export const CANARY_PROPOSAL_ID = "2bc56a47-e09d-45db-8f18-ecf91fca0001";
export const CANARY_MATCH = CANARY_EVENT + "_qm1";
export type CanaryIntent = "save" | "submit" | "review" | "restore" | "delete";
export type CanaryAdmission = { operation: "strategy-proposal"; actorOpenId: string; intent: CanaryIntent; databaseId: string | null };
export function denied(message = "canary_denied", status = 403): never { throw Response.json({ error: message }, { status }); }
export function canaryConfig(env: Record<string, unknown>) {
  const utc = (value: unknown) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && new Date(value).toISOString().replace(".000Z", "Z") === value ? Date.parse(value) : NaN;
  let start = NaN, end = NaN;
  try { start = utc(env.CANARY_STARTS_AT); end = utc(env.CANARY_EXPIRES_AT); } catch { /* Invalid calendar dates fail closed. */ }
  if (env.BUSINESS_WRITES !== "controlled-canary" || env.CANARY_EVENT_KEY !== CANARY_EVENT ||
      typeof env.MIGRATION_CANARY_ACTOR_OPEN_ID !== "string" || !env.MIGRATION_CANARY_ACTOR_OPEN_ID ||
      env.MIGRATION_CANARY_ACTOR_OPEN_ID.trim() !== env.MIGRATION_CANARY_ACTOR_OPEN_ID ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86_400_000 || Date.now() < start || Date.now() >= end)
    denied("canary_configuration_blocked", 503);
  return { actor: env.MIGRATION_CANARY_ACTOR_OPEN_ID };
}
export async function boundedCanaryText(request: Request, max = 8192) {
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) denied("canary_body_too_large", 413);
  if (request.headers.has("Content-Encoding")) denied("canary_encoding_denied", 415);
  const reader = request.clone().body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); denied("canary_body_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return denied("canary_invalid_utf8", 400); }
}
