# 赛季定制指南

本仓库采用“一个分支、一个赛季”的方式复用 Cyber Strategy。`strategy-template` 只维护通用能力；年度分支只替换赛季配置、数据映射、计分规则和场地资源。

## 创建年度分支

从最新模板创建年度分支，例如：

```sh
git switch strategy-template
git pull --ff-only
git switch -c strategy-2027
```

不要在同一构建中加入运行时赛季选择或动态插件加载。

## 年度修改入口

| 入口 | 每年需要确认的内容 |
| --- | --- |
| `app/season/config.ts` | 赛季 ID/名称、己方队伍、比赛时长、宕机阈值、动态指标和 Proposal 阶段 |
| `app/season/scouting.ts` | Normal/Super/Pit payload 读取、年度指标汇总、可编辑字段与校验 |
| `app/season/scoring.ts` | FRC Events/TBA 年度 Score Breakdown 提取和队伍得分分配 |
| `app/season/fields.ts` | 自动路线与策略画板背景、宽高比、节点、机器人和站位初始坐标 |
| `public/` | 当前年度场地图；文件名由赛季配置引用 |

除兼容层外，通用组件和 `app/lib/` 不应出现年度队号、计分字段、阶段 ID、地图文件名或像素坐标。

## 配置约定

- `ownTeams` 使用字符串队号；Proposal 写入时由服务端按这里的队伍列表校验。
- `matchDurationMs` 和 `incapNormalThresholdMs` 分别控制比赛时长与宕机判定，不在组件中复制固定值。
- `metrics` 的 key 必须稳定且唯一；`label`、格式、小数位以及摘要、逐场表格、对比页的展示开关均由定义控制。
- 逐场通用数据固定保留比赛、Total、Auto、Tele、状态、备注和记录员；年度字段放入 `metrics`，忽略比赛后所有统计都从剩余场次重算。
- 机器人状态统一为正常、通信问题、轻微故障、严重故障、未到场、宕机、未知；`disabled` 与 `downtimeMs` 独立保存。
- Proposal 阶段使用赛季配置中的稳定 ID。旧 `auto`、`self_strategy`、`partner_strategy` payload 必须继续可读，新数据使用当前统一比赛策略流程。

## 数据与计分适配

Cyber Scout 是 Normal/Super/Pit、照片、提交记录、用户和人员分配的来源。年度 Scout 适配器只负责把当年 payload 转为通用字段与 `metrics`，不得把年度字段扩散到通用组件。

比赛数据职责和队伍分项优先级固定如下：

1. FIRST FRC Events 提供赛程、比赛身份、R1–B3 阵容、联盟总分和 Auto/Tele 分项。
2. TBA 补充比赛 key、级别、组号、场次、胜方、阵容、比分、视频与年度 `score_breakdown`。
3. FIRST 无可用队伍分项时使用 TBA 年度 breakdown，再降级到 Super Scout 估算，最终使用 `0`。
4. Statbotics 独立提供预测比分、胜率和 Team Event 评分，不替代官方结果或 Scout 数据。

`hubScore`、Fuel、Transfer、BPS、Climb、准确率等年度字段只能在当年 `app/season/` 适配器中读取和映射。

## 场地与坐标

- 自动路线与策略画板分别配置背景图和宽高比；坐标使用画布百分比，不绑定图片像素尺寸。
- 背景图可以为 `null`。未配置时显示中性网格和“未配置年度场地图”，绘制、橡皮、撤销、机器人拖动和旋转仍可用。
- 没有官方场地图时保持空背景，不添加合成坐标或临时年度资源。
- Proposal 页面、打印/PDF 和 Cyber Pit Embed 必须读取同一份赛季场地定义。

## 完成检查

1. 搜索并确认通用代码中没有当年队号、赛季计分字段、阶段、地图文件名和坐标。
2. 验证 FIRST、TBA、Super Scout 的提取、来源优先级和缺失数据降级。
3. 验证动态指标、状态映射、忽略场次重算、空场地图和已配置场地图。
4. 验证 Proposal 阶段、旧 payload、PDF、己方队伍校验、Picklist 和 Cyber Pit Embed。
5. 同步 `package.json`、应用页脚和登录页页脚版本。
6. 执行：

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```
