import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM 封装/解封小 JSON 负载（OAuth state + session）。
 * key 由 SESSION_SECRET 派生（cyber-apps 模式 13）。无 SESSION_SECRET 时抛错：
 * 认证是硬依赖，不能静默降级。
 */
function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for auth");
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

/** 把对象封成 base64url 字符串：iv(12) | tag(16) | ciphertext。 */
export function seal(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/** 解封；篡改/过期/格式错误一律返回 null（绝不抛进调用方）。 */
export function unseal<T = unknown>(token: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** PKCE: 生成 code_verifier。 */
export function randomVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** PKCE: S256 challenge = base64url(sha256(verifier))。 */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
