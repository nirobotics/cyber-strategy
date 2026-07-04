import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_app.admin";
import { Badge, Button, Card, Input } from "../components/ui";
import { requireAdmin } from "../lib/auth.server";
import { activateDataset, createDataset, deleteDataset, listDatasets } from "../lib/datasets.server";
import { parseScoutingCsv } from "../lib/scouting";

type ActionData = { error?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { datasets: await listDatasets() };
}

export async function action({ request }: Route.ActionArgs): Promise<Response | ActionData> {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "upload") {
      const file = formData.get("csv");
      if (!(file instanceof File) || !file.size) return { error: "请上传 CSV 文件。" };
      const text = await file.text();
      const teamData = parseScoutingCsv(text);
      await createDataset({
        actorOpenId: user.feishuOpenId,
        activate: formData.get("activate") === "on",
        payload: {
          title: String(formData.get("title") || file.name.replace(/\.csv$/i, "") || "侦察数据集"),
          eventKey: String(formData.get("eventKey") || "2026mabil"),
          sourceFilename: file.name,
          teamData,
          teamPhotos: {},
        },
      });
      throw redirect("/admin");
    }

    if (intent === "activate") {
      await activateDataset(String(formData.get("id") || ""), user.feishuOpenId);
      throw redirect("/admin");
    }

    if (intent === "delete") {
      await deleteDataset(String(formData.get("id") || ""), user.feishuOpenId);
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

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">导入 CSV</h2>
        <Form method="post" encType="multipart/form-data" className="grid gap-3 md:grid-cols-[1fr_180px]">
          <input type="hidden" name="intent" value="upload" />
          <label className="grid gap-1">
            <span className="text-sm font-medium text-ink-dim">标题</span>
            <Input name="title" placeholder="2026 MABIL" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-ink-dim">赛事代码</span>
            <Input name="eventKey" defaultValue="2026mabil" />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-medium text-ink-dim">CSV</span>
            <input
              name="csv"
              type="file"
              accept=".csv,text/csv"
              className="block w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-brand-fg"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input name="activate" type="checkbox" defaultChecked className="size-4 accent-[var(--accent)]" />
            导入后设为当前数据集
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            导入
          </Button>
        </Form>
      </Card>

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
