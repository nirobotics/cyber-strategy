import { appendAudit } from "./audit.server";
import type { ScoutingDatasetRow } from "./db-types";
import { SAMPLE_DATASET } from "./sample-dataset";
import type { ScoutingDataset, ScoutingDatasetPayload } from "./scouting";
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

export async function listDatasets(): Promise<ScoutingDataset[]> {
  const sb = getClient();
  if (!sb) return [SAMPLE_DATASET];
  const { data, error } = await sb
    .from("scouting_datasets")
    .select("*")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Response("Failed to load datasets", { status: 500 });
  return ((data as ScoutingDatasetRow[] | null) ?? []).map(rowToDataset);
}

export async function createDataset(opts: {
  payload: ScoutingDatasetPayload;
  actorOpenId: string;
  activate: boolean;
}): Promise<ScoutingDataset> {
  const sb = getClient();
  if (!sb) throw new Response("Supabase is not configured", { status: 503 });

  const { data, error } = await sb
    .from("scouting_datasets")
    .insert({
      title: opts.payload.title,
      event_key: opts.payload.eventKey,
      source_filename: opts.payload.sourceFilename ?? null,
      team_data: opts.payload.teamData,
      team_photos: opts.payload.teamPhotos,
      is_active: false,
      created_by: opts.actorOpenId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Response("Failed to create dataset", { status: 500 });

  if (opts.activate) await activateDataset(String(data.id), opts.actorOpenId);
  await appendAudit("dataset.create", {
    actorOpenId: opts.actorOpenId,
    changedFields: ["title", "event_key", "team_data", "team_photos", "is_active"],
  });
  return opts.activate ? getDataset(String(data.id)) : rowToDataset(data as ScoutingDatasetRow);
}

export async function activateDataset(id: string, actorOpenId: string): Promise<void> {
  const sb = getClient();
  if (!sb) throw new Response("Supabase is not configured", { status: 503 });

  const { error: clearError } = await sb.from("scouting_datasets").update({ is_active: false }).neq("id", id);
  if (clearError) throw new Response("Failed to clear active dataset", { status: 500 });

  const { error: activeError } = await sb.from("scouting_datasets").update({ is_active: true }).eq("id", id);
  if (activeError) throw new Response("Failed to activate dataset", { status: 500 });

  await appendAudit("dataset.activate", { actorOpenId, changedFields: ["is_active"] });
}

export async function deleteDataset(id: string, actorOpenId: string): Promise<void> {
  const sb = getClient();
  if (!sb) throw new Response("Supabase is not configured", { status: 503 });

  const { data: existing } = await sb
    .from("scouting_datasets")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();
  const { error } = await sb.from("scouting_datasets").delete().eq("id", id);
  if (error) throw new Response("Failed to delete dataset", { status: 500 });

  if (existing?.is_active) {
    const { data: next } = await sb
      .from("scouting_datasets")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next?.id) await activateDataset(String(next.id), actorOpenId);
  }
  await appendAudit("dataset.delete", { actorOpenId, changedFields: ["id"] });
}

async function getDataset(id: string): Promise<ScoutingDataset> {
  const sb = getClient();
  if (!sb) return SAMPLE_DATASET;
  const { data, error } = await sb.from("scouting_datasets").select("*").eq("id", id).single();
  if (error || !data) throw new Response("Dataset not found", { status: 404 });
  return rowToDataset(data as ScoutingDatasetRow);
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
