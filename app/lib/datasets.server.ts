import type { ScoutingDatasetRow } from "./db-types";
import { SAMPLE_DATASET } from "./sample-dataset";
import type { ScoutingDataset } from "./scouting";
import { getClient } from "./supabase.server";

export async function getActiveDataset(): Promise<ScoutingDataset> {
  const sb = getClient();
  if (!sb) return SAMPLE_DATASET;
  const { data, error } = await sb
    .from("scouting_datasets")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return SAMPLE_DATASET;
  return rowToDataset(data as ScoutingDatasetRow);
}

export async function getDatasetForEvent(eventKey: string): Promise<ScoutingDataset | null> {
  const sb = getClient();
  if (!sb) return SAMPLE_DATASET.eventKey === eventKey ? SAMPLE_DATASET : null;
  const { data, error } = await sb
    .from("scouting_datasets")
    .select("*")
    .eq("event_key", eventKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return rowToDataset(data as ScoutingDatasetRow);
}

export async function hasStoredDatasetTarget(eventKey: string, teamNumber?: string): Promise<boolean> {
  const sb = getClient();
  if (!sb) return SAMPLE_DATASET.eventKey === eventKey && (!teamNumber || Boolean(SAMPLE_DATASET.teamData[teamNumber]));
  const { data, error } = await sb
    .from("scouting_datasets")
    .select(teamNumber ? "team_data" : "id")
    .eq("event_key", eventKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  return teamNumber ? Boolean((data as Pick<ScoutingDatasetRow, "team_data">).team_data?.[teamNumber]) : true;
}

function rowToDataset(row: ScoutingDatasetRow): ScoutingDataset {
  return {
    id: row.id,
    title: row.title,
    eventKey: row.event_key,
    sourceFilename: row.source_filename,
    teamData: row.team_data,
    teamPhotos: row.team_photos ?? {},
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
