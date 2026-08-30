export type PeriodScores = {
  autoPoints: number | null;
  teleopPoints: number | null;
};

export function extractFrcPeriodScores(alliance: Record<string, unknown>): PeriodScores {
  return {
    autoPoints: firstNumber(alliance.autoPoints, alliance.totalAutoPoints),
    teleopPoints: firstNumber(alliance.teleopPoints, alliance.totalTeleopPoints),
  };
}

export function extractTbaPeriodScores(_breakdown: Record<string, unknown>): PeriodScores {
  return { autoPoints: null, teleopPoints: null };
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}
