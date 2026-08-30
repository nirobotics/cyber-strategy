import type { TeamSummary } from "./scouting";
import {
  editableScoutingFields,
  patchSeasonEditableValues,
  readSeasonEditableValues,
  validateSeasonEditableValues,
} from "../season/scouting";

export type EditableScoutingValues = Record<string, number>;

export type EditableScoutingGroup = {
  recordCount: number;
  values: EditableScoutingValues;
};

export type EditableScoutingRecord = {
  eventKey: string;
  team: string;
  matchType: "practice" | "qualification" | "playoff";
  matchNumber: number;
  normal: EditableScoutingGroup | null;
  super: EditableScoutingGroup | null;
};

export type EditableScoutingResponse =
  | { ok: true; record: EditableScoutingRecord; saved?: boolean; team?: TeamSummary }
  | { ok: false; error: string };

export { editableScoutingFields };

export function editableFieldsFor(recordType: "normal" | "super") {
  return editableScoutingFields.filter((field) => field.recordType === recordType);
}

export function readEditableValues(payload: unknown, team: string, recordType: "normal" | "super") {
  return readSeasonEditableValues(payload, team, recordType);
}

export function patchEditableValues(
  payload: unknown,
  team: string,
  recordType: "normal" | "super",
  values: EditableScoutingValues,
) {
  return patchSeasonEditableValues(payload, team, recordType, values);
}

export function validateEditableValues(recordType: "normal" | "super", values: EditableScoutingValues) {
  validateSeasonEditableValues(recordType, values);
}
