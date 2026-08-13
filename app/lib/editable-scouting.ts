export type EditableNormalValues = {
  shootingSeconds: number;
  transferSeconds: number;
};

export type EditableSuperValues = {
  driveScore: number;
  defenseScore: number;
  accuracy: number;
  bps: number;
};

export type EditableScoutingRecord = {
  eventKey: string;
  team: string;
  matchType: "practice" | "qualification" | "playoff";
  matchNumber: number;
  normal: (EditableNormalValues & { recordCount: number }) | null;
  super: EditableSuperValues | null;
};

export type EditableScoutingResponse =
  | { ok: true; record: EditableScoutingRecord; saved?: boolean }
  | { ok: false; error: string };

type Payload = Record<string, unknown>;

export function normalTimeOverride(payload: Payload) {
  const override = objectValue(payload.strategyOverride);
  const shootingMs = finiteNumber(override.shootingMs);
  const transferShootingMs = finiteNumber(override.transferShootingMs);
  return shootingMs == null || transferShootingMs == null
    ? null
    : { shootingMs: Math.max(0, shootingMs), transferShootingMs: Math.max(0, transferShootingMs) };
}

export function patchNormalTimeOverride(
  payload: unknown,
  values: EditableNormalValues,
  metadata: { updatedAt: string; updatedBy: string },
): Payload {
  const current = objectValue(payload);
  return {
    ...current,
    strategyOverride: {
      ...objectValue(current.strategyOverride),
      shootingMs: Math.round(values.shootingSeconds * 1000),
      transferShootingMs: Math.round(values.transferSeconds * 1000),
      ...metadata,
    },
  };
}

export function readSuperValues(payload: unknown, team: string): EditableSuperValues | null {
  const current = objectValue(payload);
  const index = arrayValue(current.teams).findIndex((value) => teamNumber(value) === team);
  if (index < 0) return null;
  return {
    driveScore: numberAt(current.drive, index),
    defenseScore: numberAt(current.defense, index),
    accuracy: numberAt(current.accuracy, index),
    bps: numberAt(current.bps, index),
  };
}

export function patchSuperValues(payload: unknown, team: string, values: EditableSuperValues): Payload {
  const current = objectValue(payload);
  const index = arrayValue(current.teams).findIndex((value) => teamNumber(value) === team);
  if (index < 0) throw new Error(`Super Scout 记录中没有 Team ${team}`);
  return {
    ...current,
    drive: replaceAt(current.drive, index, values.driveScore),
    defense: replaceAt(current.defense, index, values.defenseScore),
    accuracy: replaceAt(current.accuracy, index, values.accuracy),
    bps: replaceAt(current.bps, index, values.bps),
  };
}

function replaceAt(value: unknown, index: number, next: number) {
  const values = arrayValue(value);
  while (values.length <= index) values.push(0);
  values[index] = next;
  return values;
}

function numberAt(value: unknown, index: number) {
  return finiteNumber(arrayValue(value)[index]) ?? 0;
}

function teamNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match?.[0] ?? "";
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : [];
}
