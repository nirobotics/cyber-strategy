import { getClient } from "./supabase.server";

/**
 * 追加一条审计（append-only）。只记录 actor + action + 改了哪些**字段名**，
 * 绝不记录字段值（cyber-apps 模式 13/16）。失败不阻断主流程，但必须写服务端错误日志。
 */
export async function appendAudit(
  action: string,
  opts: {
    actorOpenId?: string | null;
    changedFields?: string[];
    targetType?: string | null;
    targetId?: string | null;
  } = {},
): Promise<void> {
  const sb = getClient();
  if (!sb) {
    console.error("audit_logs unavailable: Supabase 未配置");
    return;
  }
  try {
    const { error } = await sb.from("audit_logs").insert({
      actor_open_id: opts.actorOpenId ?? null,
      action,
      changed_fields: opts.changedFields ?? [],
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
    });
    if (error) console.error("audit_logs insert failed", { action, error: error.message });
  } catch (error) {
    console.error("audit_logs insert failed", { action, error });
  }
}
