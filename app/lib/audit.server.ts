import { getClient } from "./supabase.server";

/**
 * 追加一条审计（append-only）。只记录 actor + action + 改了哪些**字段名**，
 * 绝不记录字段值（cyber-apps 模式 13/16）。best-effort：DB 缺失或失败时静默跳过。
 */
export async function appendAudit(
  action: string,
  opts: { actorOpenId?: string | null; changedFields?: string[] } = {},
): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    await sb.from("audit_logs").insert({
      actor_open_id: opts.actorOpenId ?? null,
      action,
      changed_fields: opts.changedFields ?? [],
    });
  } catch {
    // 审计是增强，不阻断主流程
  }
}
