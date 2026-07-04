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
  };
}

/**
 * 登录时 upsert 身份档案。best-effort：DB 缺失/失败也让登录成功（模式 16），
 * 这种情况下 is_admin 视为 false。
 */
export async function upsertProfile(u: FeishuUser): Promise<{ isAdmin: boolean }> {
  const sb = getClient();
  if (!sb) return { isAdmin: false };
  try {
    // 先读旧档案：避免覆盖 is_admin（is_admin 由管理操作单独设置）
    const { data: existing } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("open_id", u.openId)
      .maybeSingle();

    await sb.from("profiles").upsert(
      {
        open_id: u.openId,
        name: u.name,
        avatar_url: u.avatarUrl,
      },
      { onConflict: "open_id" },
    );
    return { isAdmin: Boolean(existing?.is_admin) };
  } catch {
    return { isAdmin: false };
  }
}

export async function getProfile(openId: string): Promise<ProfileRow | null> {
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
