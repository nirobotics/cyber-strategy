import { createHmac, timingSafeEqual } from "node:crypto";

export type CyberPitEmbedKind = "match" | "team";
export type CyberPitEmbedTheme = "light" | "dark";

export type CyberPitEmbedPayload = {
  eventKey: string;
  kind: CyberPitEmbedKind;
  target: string;
  theme: CyberPitEmbedTheme;
  expires: number;
};

const MAX_LIFETIME_MS = 5 * 60_000;

export function createCyberPitEmbedUrl(
  baseUrl: string,
  input: Omit<CyberPitEmbedPayload, "expires">,
  secret: string,
  now = Date.now(),
) {
  const payload = normalizeEmbedPayload({ ...input, expires: now + MAX_LIFETIME_MS });
  if (!payload || !secret) throw new Error("Cyber Pit embed configuration is invalid.");
  const url = new URL("/embed", baseUrl);
  url.searchParams.set("event", payload.eventKey);
  url.searchParams.set("kind", payload.kind);
  url.searchParams.set("target", payload.target);
  url.searchParams.set("theme", payload.theme);
  url.searchParams.set("expires", String(payload.expires));
  url.searchParams.set("signature", signEmbedPayload(payload, secret));
  return url.toString();
}

export function verifyCyberPitEmbedUrl(url: URL, secret: string, now = Date.now()): CyberPitEmbedPayload | null {
  const payload = normalizeEmbedPayload({
    eventKey: url.searchParams.get("event"),
    kind: url.searchParams.get("kind"),
    target: url.searchParams.get("target"),
    theme: url.searchParams.get("theme"),
    expires: Number(url.searchParams.get("expires")),
  });
  const signature = url.searchParams.get("signature") ?? "";
  if (!payload || !secret || payload.expires < now || payload.expires > now + MAX_LIFETIME_MS) return null;
  return safeEqual(signature, signEmbedPayload(payload, secret)) ? payload : null;
}

export function isCyberPitEmbedRequestAuthorized(request: Request, secret: string) {
  const value = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(secret) && safeEqual(value, secret);
}

function normalizeEmbedPayload(value: Record<string, unknown>): CyberPitEmbedPayload | null {
  const eventKey = String(value.eventKey ?? "").trim().toLowerCase();
  const kind = value.kind;
  const target = String(value.target ?? "").trim();
  const theme = value.theme;
  const expires = Number(value.expires);
  if (!/^\d{4}[a-z0-9_-]{3,}$/i.test(eventKey)) return null;
  if (kind !== "match" && kind !== "team") return null;
  if (theme !== "light" && theme !== "dark") return null;
  if (!Number.isSafeInteger(expires)) return null;
  if (kind === "team" && !/^\d{1,6}$/.test(target)) return null;
  if (kind === "match" && !validMatchTarget(target, eventKey)) return null;
  return { eventKey, kind, target, theme, expires };
}

function validMatchTarget(target: string, eventKey: string) {
  const suffix = target.startsWith(`${eventKey}_`) ? target.slice(eventKey.length + 1) : "";
  return /^(?:practice|qm)\d+$/.test(suffix)
    || /^(?:ef|qf|sf|f)\d+m\d+$/.test(suffix)
    || /^(?:practice|qm|ef|qf|sf|f)-\d+-\d+$/.test(target);
}

function signEmbedPayload(payload: CyberPitEmbedPayload, secret: string) {
  return createHmac("sha256", secret).update([
    payload.eventKey,
    payload.kind,
    payload.target,
    payload.theme,
    payload.expires,
  ].join("\n")).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
