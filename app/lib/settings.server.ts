import { appendAudit } from "./audit.server";
import type { AppSettingRow } from "./db-types";
import { getClient } from "./supabase.server";
import {
  DEFAULT_TIER_PERCENTAGES,
  normalizeTierPercentages,
  validateTierPercentages,
  type TierPercentages,
} from "./tier-settings";

const TIER_PERCENTAGES_KEY = "tier_percentages";

export async function getTierPercentages(): Promise<TierPercentages> {
  const sb = getClient();
  if (!sb) return DEFAULT_TIER_PERCENTAGES;

  try {
    const { data, error } = await sb.from("app_settings").select("value").eq("key", TIER_PERCENTAGES_KEY).maybeSingle();
    if (error || !data) return DEFAULT_TIER_PERCENTAGES;
    return normalizeTierPercentages((data as Pick<AppSettingRow, "value">).value);
  } catch {
    return DEFAULT_TIER_PERCENTAGES;
  }
}

export async function saveTierPercentages(percentages: TierPercentages, actorOpenId: string): Promise<void> {
  const error = validateTierPercentages(percentages);
  if (error) throw new Response(error, { status: 400 });

  const sb = getClient();
  if (!sb) throw new Response("Supabase 未配置", { status: 503 });

  const { error: saveError } = await sb.from("app_settings").upsert(
    {
      key: TIER_PERCENTAGES_KEY,
      value: percentages,
      updated_by: actorOpenId,
    },
    { onConflict: "key" },
  );
  if (saveError) throw new Response("保存分档比例失败，请确认数据库迁移已执行。", { status: 500 });

  await appendAudit("settings.tier_percentages.update", {
    actorOpenId,
    changedFields: ["tier_percentages"],
  });
}
