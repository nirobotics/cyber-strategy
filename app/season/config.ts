export type SeasonMetricFormat = "number" | "percent";

export type SeasonMetricDefinition = {
  key: string;
  label: string;
  format?: SeasonMetricFormat;
  digits?: number;
  summary?: boolean;
  matchTable?: boolean;
  compare?: boolean;
};

export type SeasonPhaseDefinition = {
  id: string;
  label: string;
};

export type SeasonFieldDefinition = {
  backgroundImage: string | null;
  aspectRatio: number;
};

export type SeasonConfig = {
  id: string;
  name: string;
  ownTeams: readonly string[];
  matchDurationMs: number;
  incapNormalThresholdMs: number;
  metrics: readonly SeasonMetricDefinition[];
  autoRouteField: SeasonFieldDefinition;
  strategyBoard: SeasonFieldDefinition & {
    phases: readonly SeasonPhaseDefinition[];
  };
};

export const seasonConfig: SeasonConfig = {
  id: "template",
  name: "FRC Strategy Template",
  ownTeams: [],
  matchDurationMs: 150_000,
  incapNormalThresholdMs: 20_000,
  metrics: [],
  autoRouteField: {
    backgroundImage: null,
    aspectRatio: 16 / 9,
  },
  strategyBoard: {
    backgroundImage: null,
    aspectRatio: 16 / 9,
    phases: [{ id: "strategy", label: "STRATEGY" }],
  },
};

export function validateSeasonConfig(config: SeasonConfig = seasonConfig) {
  const errors: string[] = [];
  if (!config.id.trim()) errors.push("赛季 ID 不能为空");
  if (!config.name.trim()) errors.push("赛季名称不能为空");
  if (!Number.isFinite(config.matchDurationMs) || config.matchDurationMs <= 0) errors.push("比赛时长必须大于 0");
  if (!Number.isFinite(config.incapNormalThresholdMs) || config.incapNormalThresholdMs < 0) errors.push("宕机阈值不能小于 0");
  if (!Number.isFinite(config.autoRouteField.aspectRatio) || config.autoRouteField.aspectRatio <= 0) errors.push("自动路线画布比例必须大于 0");
  if (!Number.isFinite(config.strategyBoard.aspectRatio) || config.strategyBoard.aspectRatio <= 0) errors.push("策略画布比例必须大于 0");

  const teamSet = new Set<string>();
  for (const team of config.ownTeams) {
    if (!/^\d{1,6}$/.test(team)) errors.push(`己方队号无效：${team}`);
    if (teamSet.has(team)) errors.push(`己方队号重复：${team}`);
    teamSet.add(team);
  }

  const metricSet = new Set<string>();
  for (const metric of config.metrics) {
    if (!/^[a-z][a-z0-9_]*$/i.test(metric.key)) errors.push(`指标 key 无效：${metric.key}`);
    if (!metric.label.trim()) errors.push(`指标 ${metric.key} 缺少名称`);
    if (metricSet.has(metric.key)) errors.push(`指标 key 重复：${metric.key}`);
    metricSet.add(metric.key);
  }

  const phaseSet = new Set<string>();
  for (const phase of config.strategyBoard.phases) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(phase.id)) errors.push(`策略阶段 ID 无效：${phase.id}`);
    if (!phase.label.trim()) errors.push(`策略阶段 ${phase.id} 缺少名称`);
    if (phaseSet.has(phase.id)) errors.push(`策略阶段 ID 重复：${phase.id}`);
    phaseSet.add(phase.id);
  }
  if (!config.strategyBoard.phases.length) errors.push("至少需要一个策略阶段");
  return errors;
}

export function formatSeasonMetric(value: number | null | undefined, metric: SeasonMetricDefinition) {
  if (value == null || !Number.isFinite(value)) return "-";
  const formatted = value.toFixed(metric.digits ?? 1).replace(/\.0$/, "");
  return metric.format === "percent" ? `${formatted}%` : formatted;
}
