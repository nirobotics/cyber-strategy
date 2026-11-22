import { hasNative, nativeLogin, nativeProfile } from "./native-repository.server";
import { requireMutation, statement, timestamp } from "./native-context.server";
import { getClient } from "./supabase.server";
import type { FeishuUser } from "./feishu.server";
import type { ProfileRow } from "./db-types";
import type { SessionUser } from "./auth-types";

/** FeishuUser → 应用 session 形状。 */
export function toSessionUser(u: FeishuUser): SessionUser {
  return {
    id: u.openId,
    feishuOpenId: u.openId,
    displayName: u.name,
    avatarUrl: u.avatarUrl,
    tenantKey: u.tenantKey ?? "",
  };
}

/**
 * 登录时 upsert 身份档案。身份数据库是认证硬依赖，失败时拒绝登录。
 */
export async function upsertProfile(u: FeishuUser): Promise<{ isAdmin: boolean; isActive: boolean }> {
  if (hasNative()) return nativeLogin(u);
  const sb = getClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await sb.from("profiles").upsert(
    {
      open_id: u.openId,
      name: u.name,
      avatar_url: u.avatarUrl,
    },
    { onConflict: "open_id" },
  ).select("is_admin,is_active").single();
  if (error) throw error;
  return { isAdmin: Boolean(data?.is_admin), isActive: data?.is_active !== false };
}

export async function getProfile(openId: string): Promise<ProfileRow | null> {
  if (hasNative()) return (await nativeProfile(openId)).data;
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from("profiles").select("*").eq("open_id", openId).maybeSingle();
    return (data as ProfileRow) ?? null;
  } catch {
    return null;
  }
}

export async function isAdmin(openId: string): Promise<boolean> {
  const profile = await getProfile(openId);
  return Boolean(profile?.is_admin);
}

export async function isSessionAllowed(openId: string, issuedAt: number): Promise<boolean> {
  const profile = await getProfile(openId);
  if (!profile || profile.is_active === false) return false;
  const validAfter = Date.parse(profile.session_valid_after ?? "1970-01-01T00:00:00.000Z");
  return Number.isFinite(validAfter) && issuedAt >= validAfter;
}

export async function revokeSessions(openId: string): Promise<void> {
  if (hasNative()) {
    requireMutation();
    await statement("UPDATE profiles SET row_json=json_set(row_json,'$.session_valid_after',?) WHERE id=?", timestamp(), openId).run();
    return;
  }
  const sb = getClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { error } = await sb
    .from("profiles")
    .update({ session_valid_after: new Date().toISOString() })
    .eq("open_id", openId);
  if (error) throw error;
}
