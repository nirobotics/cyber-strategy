import type { ScoutingDatasetPayload } from "./scouting";

export type ProfileRow = {
  open_id: string;
  name: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
};

export type ScoutingDatasetRow = {
  id: string;
  title: string;
  event_key: string;
  source_filename: string | null;
  team_data: ScoutingDatasetPayload["teamData"];
  team_photos: ScoutingDatasetPayload["teamPhotos"];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
