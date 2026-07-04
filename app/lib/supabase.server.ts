import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端 Supabase 单例，只用 service_role。
 * 前端绝不导入此模块；所有访问经同源 /api/* 走服务端。
 *
 * DB 可缺失：没有 env 时返回 null，调用方降级到默认值（cyber-apps 模式 16）。
 */
let cached: SupabaseClient | null | undefined;

export function getClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** 测试用：清掉缓存的单例。 */
export function __resetClientForTests() {
  cached = undefined;
}
