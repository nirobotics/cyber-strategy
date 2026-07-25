import { Navigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.admin";
import { requireAdmin } from "../lib/auth.server";
import { parseDataRange, validateDataRange } from "../lib/data-range";
import { saveDataRange, saveTierPercentages } from "../lib/settings.server";
import {
  DEFAULT_TIER_PERCENTAGES,
  parseTierPercentages,
  validateTierPercentages,
} from "../lib/tier-settings";

type ActionData = { error?: string; ok?: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs): Promise<Response | ActionData> {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save-tier-percentages") {
      const percentages = parseTierPercentages((label) => formData.get(`tier_${label}`));
      const validationError = validateTierPercentages(percentages);
      if (validationError) return { error: validationError };
      await saveTierPercentages(percentages, user.feishuOpenId);
      return { ok: true };
    }

    if (intent === "reset-tier-percentages") {
      await saveTierPercentages(DEFAULT_TIER_PERCENTAGES, user.feishuOpenId);
      return { ok: true };
    }

    if (intent === "save-data-range") {
      const range = parseDataRange(formData.getAll("dataRange"));
      const validationError = validateDataRange(range);
      if (validationError) return { error: validationError };
      await saveDataRange(range, user.feishuOpenId);
      return { ok: true };
    }

  } catch (error) {
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: "未知操作。" };
}

export default function AdminRoute() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set("tab", "settings");
  return <Navigate to={`/?${params.toString()}`} replace />;
}
