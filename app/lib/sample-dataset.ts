import rawDataset from "../data/advantalytics-sample.json";
import type { ScoutingDataset, ScoutingDatasetPayload } from "./scouting";

const payload = rawDataset as ScoutingDatasetPayload;

export const SAMPLE_DATASET: ScoutingDataset = {
  id: "sample-2026mabil",
  title: payload.title,
  eventKey: payload.eventKey,
  sourceFilename: payload.sourceFilename,
  teamData: payload.teamData,
  teamPhotos: payload.teamPhotos,
  isActive: true,
  createdAt: null,
  updatedAt: null,
};
