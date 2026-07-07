import { appendAudit } from "./audit.server";
import { DEFAULT_DATA_RANGE, normalizeDataRange, validateDataRange, type DataRange } from "./data-range";
import type { AppSettingRow } from "./db-types";
import { getClient } from "./supabase.server";
import {
  DEFAULT_TIER_PERCENTAGES,
  normalizeTierPercentages,
  validateTierPercentages,
  type TierPercentages,
} from "./tier-settings";

const TIER_PERCENTAGES_KEY = "tier_percentages";
const DATA_RANGE_KEY = "data_range";

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

export async function getDataRange(): Promise<DataRange[]> {
  const sb = getClient();
  if (!sb) return DEFAULT_DATA_RANGE;

  try {
    const { data, error } = await sb.from("app_settings").select("value").eq("key", DATA_RANGE_KEY).maybeSingle();
    if (error || !data) return DEFAULT_DATA_RANGE;
    return normalizeDataRange((data as Pick<AppSettingRow, "value">).value);
  } catch {
    return DEFAULT_DATA_RANGE;
  }
}

export async function saveDataRange(range: DataRange[], actorOpenId: string): Promise<void> {
  const error = validateDataRange(range);
  if (error) throw new Response(error, { status: 400 });

  const sb = getClient();
  if (!sb) throw new Response("Supabase 未配置", { status: 503 });

  const { error: saveError } = await sb.from("app_settings").upsert(
    {
      key: DATA_RANGE_KEY,
      value: range,
      updated_by: actorOpenId,
    },
    { onConflict: "key" },
  );
  if (saveError) throw new Response("保存数据范围失败，请确认数据库迁移已执行。", { status: 500 });

  await appendAudit("settings.data_range.update", {
    actorOpenId,
    changedFields: ["data_range"],
  });
}
