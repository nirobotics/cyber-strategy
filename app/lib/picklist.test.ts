import { describe, expect, it } from "vitest";
import {
  buildPicklistColumns,
  emptyPicklistBoard,
  migrateLegacyPicklist,
  movePicklistTeam,
  reorderPicklistTeam,
  sanitizePicklistBoard,
} from "./picklist";

describe("picklist board", () => {
  const teams = [
    { team: "1", avgTotal: 80 },
    { team: "2", avgTotal: 100 },
    { team: "3", avgTotal: 60 },
    { team: "4", avgTotal: 0 },
  ];
  const validTeams = teams.map((team) => team.team);

  it("keeps every team in exactly one column and ranks the unassigned pool", () => {
    const columns = buildPicklistColumns(teams, { tier1: ["1"], tier2: ["2"], tier3: [], dnp: [] });
    expect(columns).toEqual({ tier1: ["1"], tier2: ["2"], tier3: [], dnp: [], pool: ["3", "4"] });
  });

  it("moves a team across columns without duplication", () => {
    const board = { tier1: ["1", "2"], tier2: ["3"], tier3: [], dnp: [] };
    expect(movePicklistTeam(board, validTeams, "2", "tier2", "3")).toEqual({
      tier1: ["1"],
      tier2: ["2", "3"],
      tier3: [],
      dnp: [],
    });
  });

  it("reorders within a column and returns teams to the pool", () => {
    const board = { tier1: ["1", "2", "3"], tier2: [], tier3: [], dnp: [] };
    const reordered = movePicklistTeam(board, validTeams, "3", "tier1", "1");
    expect(reordered.tier1).toEqual(["3", "1", "2"]);
    expect(movePicklistTeam(reordered, validTeams, "1", "pool").tier1).toEqual(["3", "2"]);
  });

  it("does not move a team when it is dropped on itself", () => {
    const board = { tier1: ["1", "2", "3"], tier2: [], tier3: [], dnp: [] };
    expect(movePicklistTeam(board, validTeams, "1", "tier1", "1")).toEqual(board);
  });

  it("reorders upward and downward by the hovered team index", () => {
    const board = { tier1: ["1", "2", "3"], tier2: [], tier3: [], dnp: [] };
    const preview = reorderPicklistTeam(board, validTeams, "tier1", "3", "2");
    expect(preview.tier1).toEqual(["1", "3", "2"]);
    expect(reorderPicklistTeam(preview, validTeams, "tier1", "3", "3")).toEqual(preview);
    expect(reorderPicklistTeam(board, validTeams, "tier1", "1", "3").tier1).toEqual(["2", "3", "1"]);
  });

  it("filters stale teams and duplicates across all categories", () => {
    expect(sanitizePicklistBoard({ tier1: ["1", "9", "1"], tier2: ["1", "2"], dnp: ["3"] }, validTeams)).toEqual({
      tier1: ["1"],
      tier2: ["2"],
      tier3: [],
      dnp: ["3"],
    });
  });

  it("migrates the former first, second and crossed lists", () => {
    expect(migrateLegacyPicklist(["1", "3"], ["2"], ["3", "9"], validTeams)).toEqual({
      tier1: ["1"],
      tier2: ["2"],
      tier3: [],
      dnp: ["3"],
    });
  });

  it("starts with an empty board", () => {
    expect(emptyPicklistBoard()).toEqual({ tier1: [], tier2: [], tier3: [], dnp: [] });
  });
});
