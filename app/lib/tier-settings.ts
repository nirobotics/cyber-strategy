export const TIER_ORDER = ["Elite", "Strong", "Mid", "Low", "Struggling"] as const;

export type TierLabel = (typeof TIER_ORDER)[number];
export type TierPercentages = Record<TierLabel, number>;
export type TierInfo = { label: TierLabel; className: string };

export const DEFAULT_TIER_PERCENTAGES: TierPercentages = {
  Elite: 10,
  Strong: 20,
  Mid: 40,
  Low: 20,
  Struggling: 10,
};

const TIER_CLASS_NAMES: Record<TierLabel, string> = {
  Elite: "border-yellow-400/40 bg-yellow-400/10 text-yellow-600 dark:text-yellow-300",
  Strong: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Mid: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  Low: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Struggling: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

export const TIER_DISPLAY_LABELS: Record<TierLabel, string> = {
  Elite: "顶级",
  Strong: "强队",
  Mid: "中游",
  Low: "低分",
  Struggling: "待观察",
};

export function tierDisplayLabel(label: TierLabel) {
  return TIER_DISPLAY_LABELS[label];
}

export function getTierForRank(rankIndex: number, totalTeams: number, percentages: TierPercentages = DEFAULT_TIER_PERCENTAGES): TierInfo {
  const total = Math.max(totalTeams, 1);
  const percentile = (Math.max(rankIndex, 0) / total) * 100;
  let cumulative = 0;

  for (const label of TIER_ORDER) {
    cumulative += Math.max(0, percentages[label]);
    if (percentile < cumulative || label === "Struggling") {
      return { label, className: TIER_CLASS_NAMES[label] };
    }
  }

  return { label: "Struggling", className: TIER_CLASS_NAMES.Struggling };
}

export function buildTierAssignments<T extends { team: string }>(teams: T[], percentages: TierPercentages = DEFAULT_TIER_PERCENTAGES) {
  return new Map(teams.map((team, index) => [team.team, getTierForRank(index, teams.length, percentages)]));
}

export function normalizeTierPercentages(raw: unknown): TierPercentages {
  if (!raw || typeof raw !== "object") return DEFAULT_TIER_PERCENTAGES;
  const source = raw as Record<string, unknown>;
  const next = { ...DEFAULT_TIER_PERCENTAGES };

  for (const label of TIER_ORDER) {
    const value = Number(source[label]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      next[label] = round1(value);
    }
  }

  return validateTierPercentages(next) ? DEFAULT_TIER_PERCENTAGES : next;
}

export function validateTierPercentages(percentages: TierPercentages): string | null {
  for (const label of TIER_ORDER) {
    const value = percentages[label];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return `${tierDisplayLabel(label)} 比例必须在 0 到 100 之间。`;
    }
  }

  const total = round1(TIER_ORDER.reduce((sum, label) => sum + percentages[label], 0));
  if (Math.abs(total - 100) > 0.01) return `比例总和必须等于 100%，当前为 ${total}%。`;
  return null;
}

export function parseTierPercentages(values: (label: TierLabel) => FormDataEntryValue | null): TierPercentages {
  const next = { ...DEFAULT_TIER_PERCENTAGES };
  for (const label of TIER_ORDER) {
    const value = Number(values(label));
    next[label] = Number.isFinite(value) ? round1(value) : Number.NaN;
  }
  return next;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
