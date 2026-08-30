import { seasonConfig } from "./config";

export type AllianceColor = "red" | "blue";
export type FieldPoint = { x: number; y: number };

export function defaultRobotPoint(alliance: AllianceColor, index: number, count: number): FieldPoint {
  return {
    x: alliance === "red" ? 80 : 20,
    y: ((index + 1) / (Math.max(count, 1) + 1)) * 100,
  };
}

export function defaultStationPoint(alliance: AllianceColor, index: number, count: number): FieldPoint {
  return {
    x: alliance === "red" ? 97 : 3,
    y: ((index + 1) / (Math.max(count, 1) + 1)) * 100,
  };
}

export function autoRouteField() {
  return seasonConfig.autoRouteField;
}

export function strategyBoardField() {
  return seasonConfig.strategyBoard;
}
