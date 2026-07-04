import type { CyberScoutRecordRow } from "./cyber-scout";

type Alliance = "red" | "blue";
type ActualWinner = Alliance | "tie";
type PredictionOutcome = "correct" | "wrong" | "pending" | "incomplete";

export type ConfidenceTbaMatch = {
  comp_level?: string;
  match_number?: number;
  winning_alliance?: string;
  alliances?: {
    red?: { score?: number };
    blue?: { score?: number };
  };
};

export type ScoutConfidencePrediction = {
  id: string;
  scoutName: string;
  team: string;
  matchNumber: number;
  predictedWinner: Alliance | null;
  confidence: number | null;
  actualWinner: ActualWinner | null;
  outcome: PredictionOutcome;
  netScore: number;
  sourceAt: number;
};

export type ScoutConfidencePerson = {
  scoutName: string;
  netScore: number;
  correctPoints: number;
  wrongPenalty: number;
  scoredCount: number;
  pendingCount: number;
  incompleteCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number | null;
  averageNet: number | null;
};

export type ScoutConfidenceMatch = {
  matchNumber: number;
  predictionCount: number;
  redPredictions: number;
  bluePredictions: number;
  incompleteCount: number;
  averageConfidence: number | null;
  actualWinner: ActualWinner | null;
  hasDisagreement: boolean;
  isLowConfidence: boolean;
};

export type ScoutConfidenceCalibration = {
  confidence: number;
  correctCount: number;
  wrongCount: number;
  pendingCount: number;
  netScore: number;
  accuracy: number | null;
};

export type ScoutConfidenceReviewItem = {
  kind: "high-confidence-wrong" | "low-confidence" | "disagreement";
  matchNumber: number;
  scoutName: string | null;
  team: string | null;
  confidence: number | null;
  message: string;
};

export type ScoutConfidenceReport = {
  summary: {
    totalRecords: number;
    scoredRecords: number;
    pendingRecords: number;
    incompleteRecords: number;
    totalNetScore: number;
    accuracy: number | null;
  };
  people: ScoutConfidencePerson[];
  matches: ScoutConfidenceMatch[];
  calibration: ScoutConfidenceCalibration[];
  reviewQueue: ScoutConfidenceReviewItem[];
};

export function emptyScoutConfidenceReport(): ScoutConfidenceReport {
  return {
    summary: {
      totalRecords: 0,
      scoredRecords: 0,
      pendingRecords: 0,
      incompleteRecords: 0,
      totalNetScore: 0,
      accuracy: null,
    },
    people: [],
    matches: [],
    calibration: [1, 2, 3, 4, 5].map((confidence) => ({
      confidence,
      correctCount: 0,
      wrongCount: 0,
      pendingCount: 0,
      netScore: 0,
      accuracy: null,
    })),
    reviewQueue: [],
  };
}

export function buildScoutConfidenceReport({
  records,
  tbaMatches,
}: {
  records: CyberScoutRecordRow[];
  tbaMatches: ConfidenceTbaMatch[];
}): ScoutConfidenceReport {
  const actualByMatch = buildActualWinnerMap(tbaMatches);
  const predictions = latestConfidencePredictions(records).map((prediction) =>
    scorePrediction(prediction, actualByMatch.get(prediction.matchNumber) ?? null),
  );

  return {
    summary: buildSummary(predictions),
    people: buildPeople(predictions),
    matches: buildMatches(predictions),
    calibration: buildCalibration(predictions),
    reviewQueue: buildReviewQueue(predictions),
  };
}

function latestConfidencePredictions(records: CyberScoutRecordRow[]) {
  const latest = new Map<string, Omit<ScoutConfidencePrediction, "actualWinner" | "outcome" | "netScore">>();
  for (const row of records) {
    if (row.record_type !== "normal_match") continue;
    const payload = objectPayload(row.payload);
    const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
    const matchNumber = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
    if (!team || !matchNumber) continue;

    const scoutName = stringValue(payload.scout) || "未知 Scout";
    const prediction = {
      id: row.id,
      scoutName,
      team,
      matchNumber,
      predictedWinner: parseWinner(payload.predictionWinner ?? payload.pw),
      confidence: parseConfidence(payload.predictionConfidence ?? payload.pc),
      sourceAt: rowTimestamp(row),
    };
    const key = `${scoutName}:${matchNumber}:${team}`;
    const current = latest.get(key);
    if (!current || prediction.sourceAt >= current.sourceAt) latest.set(key, prediction);
  }
  return [...latest.values()];
}

function scorePrediction(
  prediction: Omit<ScoutConfidencePrediction, "actualWinner" | "outcome" | "netScore">,
  actualWinner: ActualWinner | null,
): ScoutConfidencePrediction {
  if (!prediction.predictedWinner || prediction.confidence == null) {
    return { ...prediction, actualWinner, outcome: "incomplete", netScore: 0 };
  }
  if (!actualWinner) {
    return { ...prediction, actualWinner, outcome: "pending", netScore: 0 };
  }
  if (prediction.predictedWinner === actualWinner) {
    return { ...prediction, actualWinner, outcome: "correct", netScore: prediction.confidence };
  }
  return { ...prediction, actualWinner, outcome: "wrong", netScore: -prediction.confidence };
}

function buildSummary(predictions: ScoutConfidencePrediction[]): ScoutConfidenceReport["summary"] {
  const correct = predictions.filter((prediction) => prediction.outcome === "correct").length;
  const wrong = predictions.filter((prediction) => prediction.outcome === "wrong").length;
  const scoredRecords = correct + wrong;
  return {
    totalRecords: predictions.length,
    scoredRecords,
    pendingRecords: predictions.filter((prediction) => prediction.outcome === "pending").length,
    incompleteRecords: predictions.filter((prediction) => prediction.outcome === "incomplete").length,
    totalNetScore: predictions.reduce((sum, prediction) => sum + prediction.netScore, 0),
    accuracy: scoredRecords ? correct / scoredRecords : null,
  };
}

function buildPeople(predictions: ScoutConfidencePrediction[]): ScoutConfidencePerson[] {
  const byScout = new Map<string, ScoutConfidencePrediction[]>();
  for (const prediction of predictions) {
    byScout.set(prediction.scoutName, [...(byScout.get(prediction.scoutName) ?? []), prediction]);
  }

  return [...byScout.entries()]
    .map(([scoutName, values]) => {
      const correct = values.filter((prediction) => prediction.outcome === "correct");
      const wrong = values.filter((prediction) => prediction.outcome === "wrong");
      const scoredCount = correct.length + wrong.length;
      const netScore = values.reduce((sum, prediction) => sum + prediction.netScore, 0);
      return {
        scoutName,
        netScore,
        correctPoints: correct.reduce((sum, prediction) => sum + (prediction.confidence ?? 0), 0),
        wrongPenalty: wrong.reduce((sum, prediction) => sum + (prediction.confidence ?? 0), 0),
        scoredCount,
        pendingCount: values.filter((prediction) => prediction.outcome === "pending").length,
        incompleteCount: values.filter((prediction) => prediction.outcome === "incomplete").length,
        correctCount: correct.length,
        wrongCount: wrong.length,
        accuracy: scoredCount ? correct.length / scoredCount : null,
        averageNet: scoredCount ? netScore / scoredCount : null,
      };
    })
    .sort((a, b) =>
      b.netScore - a.netScore ||
      b.scoredCount - a.scoredCount ||
      (b.accuracy ?? -1) - (a.accuracy ?? -1) ||
      a.scoutName.localeCompare(b.scoutName),
    );
}

function buildMatches(predictions: ScoutConfidencePrediction[]): ScoutConfidenceMatch[] {
  const byMatch = new Map<number, ScoutConfidencePrediction[]>();
  for (const prediction of predictions) {
    byMatch.set(prediction.matchNumber, [...(byMatch.get(prediction.matchNumber) ?? []), prediction]);
  }

  return [...byMatch.entries()]
    .map(([matchNumber, values]) => {
      const complete = values.filter((prediction) => prediction.predictedWinner && prediction.confidence != null);
      const redPredictions = complete.filter((prediction) => prediction.predictedWinner === "red").length;
      const bluePredictions = complete.filter((prediction) => prediction.predictedWinner === "blue").length;
      const averageConfidence = average(complete.map((prediction) => prediction.confidence ?? 0));
      return {
        matchNumber,
        predictionCount: complete.length,
        redPredictions,
        bluePredictions,
        incompleteCount: values.length - complete.length,
        averageConfidence,
        actualWinner: values.find((prediction) => prediction.actualWinner)?.actualWinner ?? null,
        hasDisagreement: redPredictions > 0 && bluePredictions > 0,
        isLowConfidence: averageConfidence != null && averageConfidence < 3,
      };
    })
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

function buildCalibration(predictions: ScoutConfidencePrediction[]): ScoutConfidenceCalibration[] {
  return [1, 2, 3, 4, 5].map((confidence) => {
    const values = predictions.filter((prediction) => prediction.confidence === confidence);
    const correctCount = values.filter((prediction) => prediction.outcome === "correct").length;
    const wrongCount = values.filter((prediction) => prediction.outcome === "wrong").length;
    const scoredCount = correctCount + wrongCount;
    return {
      confidence,
      correctCount,
      wrongCount,
      pendingCount: values.filter((prediction) => prediction.outcome === "pending").length,
      netScore: values.reduce((sum, prediction) => sum + prediction.netScore, 0),
      accuracy: scoredCount ? correctCount / scoredCount : null,
    };
  });
}

function buildReviewQueue(predictions: ScoutConfidencePrediction[]): ScoutConfidenceReviewItem[] {
  const items: ScoutConfidenceReviewItem[] = [];
  for (const prediction of predictions) {
    if (prediction.outcome === "wrong" && (prediction.confidence ?? 0) >= 4) {
      items.push({
        kind: "high-confidence-wrong",
        matchNumber: prediction.matchNumber,
        scoutName: prediction.scoutName,
        team: prediction.team,
        confidence: prediction.confidence,
        message: `高信心预测错误：Q${prediction.matchNumber} Team ${prediction.team}`,
      });
    }
    if (prediction.outcome !== "incomplete" && (prediction.confidence ?? 0) <= 2) {
      items.push({
        kind: "low-confidence",
        matchNumber: prediction.matchNumber,
        scoutName: prediction.scoutName,
        team: prediction.team,
        confidence: prediction.confidence,
        message: `低信心记录：Q${prediction.matchNumber} Team ${prediction.team}`,
      });
    }
  }

  for (const match of buildMatches(predictions)) {
    if (!match.hasDisagreement) continue;
    items.push({
      kind: "disagreement",
      matchNumber: match.matchNumber,
      scoutName: null,
      team: null,
      confidence: match.averageConfidence,
      message: `预测分歧：Q${match.matchNumber} 红 ${match.redPredictions} / 蓝 ${match.bluePredictions}`,
    });
  }

  return items.sort((a, b) => a.matchNumber - b.matchNumber || kindOrder(a.kind) - kindOrder(b.kind));
}

function buildActualWinnerMap(matches: ConfidenceTbaMatch[]): Map<number, ActualWinner> {
  const values = new Map<number, ActualWinner>();
  for (const match of matches) {
    if (match.comp_level && match.comp_level !== "qm") continue;
    if (!match.match_number) continue;
    const winner = actualWinner(match);
    if (winner) values.set(match.match_number, winner);
  }
  return values;
}

function actualWinner(match: ConfidenceTbaMatch): ActualWinner | null {
  const red = match.alliances?.red?.score ?? null;
  const blue = match.alliances?.blue?.score ?? null;
  if (red == null || blue == null || red < 0 || blue < 0) return null;
  if (match.winning_alliance === "red" || match.winning_alliance === "blue" || match.winning_alliance === "tie") {
    return match.winning_alliance;
  }
  return red > blue ? "red" : blue > red ? "blue" : "tie";
}

function parseWinner(value: unknown): Alliance | null {
  if (value === "red" || value === "r") return "red";
  if (value === "blue" || value === "b") return "blue";
  return null;
}

function parseConfidence(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveId(value: unknown): string | null {
  const parsed = positiveNumber(value);
  return parsed ? String(parsed) : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowTimestamp(row: CyberScoutRecordRow): number {
  const parsed = Date.parse(row.uploaded_at ?? row.client_created_at ?? row.created_at ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function kindOrder(kind: ScoutConfidenceReviewItem["kind"]) {
  return { "high-confidence-wrong": 0, disagreement: 1, "low-confidence": 2 }[kind];
}
