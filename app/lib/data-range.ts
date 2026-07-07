export const DATA_RANGE_OPTIONS = [
  { value: "practice", label: "练习赛" },
  { value: "qualification", label: "资格赛" },
  { value: "playoff", label: "淘汰赛" },
] as const;

export type DataRange = (typeof DATA_RANGE_OPTIONS)[number]["value"];

export const DEFAULT_DATA_RANGE: DataRange[] = ["qualification"];

const values = new Set<DataRange>(DATA_RANGE_OPTIONS.map((option) => option.value));

export function normalizeDataRange(value: unknown): DataRange[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized = raw.filter((item): item is DataRange => typeof item === "string" && values.has(item as DataRange));
  return normalized.length ? [...new Set(normalized)] : DEFAULT_DATA_RANGE;
}

export function parseDataRange(values: FormDataEntryValue[]): DataRange[] {
  return values.filter((value): value is DataRange => typeof value === "string" && DATA_RANGE_OPTIONS.some((option) => option.value === value));
}

export function validateDataRange(range: DataRange[]): string | null {
  return range.length ? null : "至少选择一个数据范围。";
}

export function matchTypeFromValue(value: unknown): DataRange {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["p", "pr", "practice", "practice_match", "练习赛"].includes(normalized)) return "practice";
  if (["e", "elims", "elim", "elimination", "playoff", "playoffs", "ef", "qf", "sf", "f", "淘汰赛"].includes(normalized)) return "playoff";
  return "qualification";
}

export function matchTypeFromTbaCompLevel(value: unknown): DataRange | null {
  const compLevel = String(value ?? "").trim().toLowerCase();
  if (compLevel === "qm") return "qualification";
  if (["ef", "qf", "sf", "f"].includes(compLevel)) return "playoff";
  return null;
}
