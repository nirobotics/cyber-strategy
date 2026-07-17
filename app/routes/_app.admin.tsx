import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_app.admin";
import { Badge, Button, Card } from "../components/ui";
import { StrategySettingsPanel } from "../components/strategy-settings-panel";
import { requireAdmin } from "../lib/auth.server";
import { DEFAULT_DATA_RANGE, parseDataRange, validateDataRange } from "../lib/data-range";
import { activateDataset, deleteDataset, listDatasets } from "../lib/datasets.server";
import { getDataRange, getTierPercentages, saveDataRange, saveTierPercentages } from "../lib/settings.server";
import {
  DEFAULT_TIER_PERCENTAGES,
  parseTierPercentages,
  validateTierPercentages,
} from "../lib/tier-settings";

type ActionData = { error?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [datasets, tierPercentages, dataRange] = await Promise.all([listDatasets(), getTierPercentages(), getDataRange()]);
  return { datasets, tierPercentages, dataRange };
}

export async function action({ request }: Route.ActionArgs): Promise<Response | ActionData> {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "activate") {
      await activateDataset(String(formData.get("id") || ""), user.feishuOpenId);
      throw redirect("/admin");
    }

    if (intent === "delete") {
      await deleteDataset(String(formData.get("id") || ""), user.feishuOpenId);
      throw redirect("/admin");
    }

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
          <h1 className="text-2xl font-semibold text-ink">数据集</h1>
        </div>
        <Link to="/" className="btn">
          返回
        </Link>
      </div>

      {actionData?.error ? (
        <Card className="border-danger/40 bg-danger/10 p-3 text-danger">{actionData.error}</Card>
      ) : null}

      <StrategySettingsPanel tierPercentages={loaderData.tierPercentages} dataRange={loaderData.dataRange} busy={busy} />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <h2 className="section-label">已保存数据集</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
              <tr>
                <th className="px-3 py-2 text-left">标题</th>
                <th className="px-3 py-2 text-left">赛事</th>
                <th className="px-3 py-2 text-left">队伍数</th>
                <th className="px-3 py-2 text-left">更新时间</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.datasets.map((dataset) => (
                <tr key={dataset.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{dataset.title}</span>
                      {dataset.isActive ? <Badge className="border-ok/40 bg-ok/10 text-ok">当前</Badge> : null}
                    </div>
                    <p className="text-xs text-ink-faint">{dataset.sourceFilename || dataset.id}</p>
                  </td>
                  <td className="px-3 py-2">{dataset.eventKey}</td>
                  <td className="px-3 py-2">{Object.keys(dataset.teamData).length}</td>
                  <td className="px-3 py-2 text-ink-dim">{dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {!dataset.isActive ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="activate" />
                          <input type="hidden" name="id" value={dataset.id} />
                          <Button type="submit" disabled={busy}>设为当前</Button>
                        </Form>
                      ) : null}
                      {!dataset.id.startsWith("sample-") ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={dataset.id} />
                          <Button type="submit" disabled={busy}>删除</Button>
                        </Form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
