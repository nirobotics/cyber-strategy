import { Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_app.admin";
import { Card } from "../components/ui";
import { StrategySettingsPanel } from "../components/strategy-settings-panel";
import { requireAdmin } from "../lib/auth.server";
import { DEFAULT_DATA_RANGE, parseDataRange, validateDataRange } from "../lib/data-range";
import { getDataRange, getTierPercentages, saveDataRange, saveTierPercentages } from "../lib/settings.server";
import {
  DEFAULT_TIER_PERCENTAGES,
  parseTierPercentages,
  validateTierPercentages,
} from "../lib/tier-settings";

type ActionData = { error?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [tierPercentages, dataRange] = await Promise.all([getTierPercentages(), getDataRange()]);
  return { tierPercentages, dataRange };
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
      throw redirect("/admin");
    }

    if (intent === "reset-tier-percentages") {
      await saveTierPercentages(DEFAULT_TIER_PERCENTAGES, user.feishuOpenId);
      throw redirect("/admin");
    }

    if (intent === "save-data-range") {
      const range = parseDataRange(formData.getAll("dataRange"));
      const validationError = validateDataRange(range);
      if (validationError) return { error: validationError };
      await saveDataRange(range, user.feishuOpenId);
      throw redirect("/admin");
    }

    if (intent === "reset-data-range") {
      await saveDataRange(DEFAULT_DATA_RANGE, user.feishuOpenId);
      throw redirect("/admin");
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: "未知操作。" };
}

export default function AdminRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="section-label">管理</p>
        </div>
        <Link to="/" className="btn">
          返回
        </Link>
      </div>

      {actionData?.error ? (
        <Card className="border-danger/40 bg-danger/10 p-3 text-danger">{actionData.error}</Card>
      ) : null}

      <StrategySettingsPanel tierPercentages={loaderData.tierPercentages} dataRange={loaderData.dataRange} busy={busy} />
    </div>
  );
}
