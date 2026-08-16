import { describe, expect, it } from "vitest";
import {
  buildPicklistColumns,
  canCreateMainPicklist,
  canEditSharedPicklist,
  canViewSharedPicklist,
  comparePicklistTier,
  emptyPicklistBoard,
  findPicklistTeamTier,
  migrateLegacyPicklist,
  movePicklistTeam,
  normalizePicklistBoard,
  previewPicklistTeam,
  reorderPicklistTeam,
  sanitizePicklistBoard,
  samePicklistBoard,
  visiblePicklistsForEvent,
  type SharedPicklist,
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

  it("copies a personal team into Main without changing the personal snapshot", () => {
    const main = emptyPicklistBoard();
    const personal = { tier1: ["2", "1"], tier2: [], tier3: [], dnp: [] };
    const next = movePicklistTeam(main, validTeams, personal.tier1[0], "tier1");
    expect(next.tier1).toEqual(["2"]);
    expect(personal.tier1).toEqual(["2", "1"]);
  });

  it("keeps the visible middle position when a cross-column drag then hits the column container", () => {
    const board = { tier1: ["1"], tier2: ["2", "3", "4"], tier3: [], dnp: [] };
    const preview = previewPicklistTeam(board, validTeams, "tier1", {
      team: "1",
      column: "tier2",
      beforeTeam: "3",
    });
    expect(preview.tier2).toEqual(["2", "1", "3", "4"]);
    expect(previewPicklistTeam(preview, validTeams, "tier2", { team: "1", column: "tier2" })).toEqual(preview);
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

  it("detects changes made after a personal picklist submission", () => {
    const submitted = { tier1: ["1"], tier2: ["2"], tier3: [], dnp: [] };
    expect(samePicklistBoard(submitted, { ...submitted, tier1: ["1"] })).toBe(true);
    expect(samePicklistBoard(submitted, { ...submitted, tier1: ["1", "3"] })).toBe(false);
  });

  it("finds a searched team's tier with the Main board taking priority", () => {
    const main = { tier1: [], tier2: ["2"], tier3: [], dnp: [] };
    const personal = { tier1: ["2"], tier2: [], tier3: ["3"], dnp: [] };
    expect(findPicklistTeamTier("2", [main, personal])).toBe("tier2");
    expect(findPicklistTeamTier("3", [main, personal])).toBe("tier3");
    expect(findPicklistTeamTier("4", [main, personal])).toBeNull();
  });

  it("normalizes stored boards and removes invalid or duplicate teams", () => {
    expect(normalizePicklistBoard({
      tier1: ["frc1", "2", "bad"],
      tier2: [2, "3"],
      tier3: null,
      dnp: ["4"],
    })).toEqual({ tier1: ["1", "2"], tier2: ["3"], tier3: [], dnp: ["4"] });
  });

  it("enforces Main and Personal visibility and edit permissions", () => {
    const main = sharedList({ kind: "main", createdBy: "admin" });
    const draft = sharedList({ id: "draft", kind: "personal", createdBy: "u1", submittedAt: null });
    const submitted = sharedList({ id: "submitted", kind: "personal", createdBy: "u1", submittedAt: "2026-08-11T00:00:00Z" });

    expect(canCreateMainPicklist(false)).toBe(false);
    expect(canCreateMainPicklist(true)).toBe(true);
    expect(canEditSharedPicklist(main, "u1", false)).toBe(false);
    expect(canEditSharedPicklist(main, "admin", true)).toBe(true);
    expect(canEditSharedPicklist(draft, "u1", false)).toBe(true);
    expect(canEditSharedPicklist(draft, "u2", true)).toBe(false);
    expect(canViewSharedPicklist(main, "u2", false)).toBe(true);
    expect(canViewSharedPicklist(draft, "u2", true)).toBe(false);
    expect(canViewSharedPicklist(submitted, "u2", true)).toBe(true);
    expect(canViewSharedPicklist(submitted, "u2", false)).toBe(false);
  });

  it("keeps similarly named events isolated before applying visibility", () => {
    const expected = sharedList({ id: "expected", eventKey: "2026ab_cd" });
    const wildcardLookalike = sharedList({ id: "other", eventKey: "2026abxcd" });
    expect(visiblePicklistsForEvent([expected, wildcardLookalike], "2026ab_cd", "u1", false)).toEqual([expected]);
  });

  it("shows only the latest personal picklist for each user", () => {
    const older = sharedList({ id: "older", kind: "personal", createdBy: "u1", submittedAt: "2026-08-10T00:00:00Z" });
    const latest = sharedList({ id: "latest", kind: "personal", createdBy: "u1", submittedAt: "2026-08-12T00:00:00Z", updatedAt: "2026-08-12T00:00:00Z" });
    const other = sharedList({ id: "other", kind: "personal", createdBy: "u2", submittedAt: "2026-08-11T00:00:00Z" });

    expect(visiblePicklistsForEvent([older, other, latest], "2026cnsh", "admin", true)).toEqual([other, latest]);
  });

  it("compares selected lists within one tier by rank and appearances", () => {
    const main = sharedList({ id: "main", board: { tier1: ["1", "2"], tier2: [], tier3: [], dnp: [] } });
    const personalA = sharedList({ id: "a", kind: "personal", board: { tier1: ["2", "1", "3"], tier2: [], tier3: [], dnp: [] } });
    const personalB = sharedList({ id: "b", kind: "personal", board: { tier1: ["2", "3"], tier2: [], tier3: [], dnp: [] } });

    expect(comparePicklistTier([main, personalA, personalB], "tier1")).toEqual([
      { team: "2", ranks: { main: 2, a: 1, b: 1 }, averageRank: 4 / 3, appearances: 3 },
      { team: "1", ranks: { main: 1, a: 2, b: null }, averageRank: 1.5, appearances: 2 },
      { team: "3", ranks: { main: null, a: 3, b: 2 }, averageRank: 2.5, appearances: 2 },
    ]);
  });
});

function sharedList(overrides: Partial<SharedPicklist> = {}): SharedPicklist {
  return {
    id: "main",
    clientId: null,
    eventKey: "2026cnsh",
    name: "List",
    kind: "main",
    board: emptyPicklistBoard(),
    createdBy: "admin",
    createdByName: "Admin",
    submittedAt: null,
    updatedAt: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}
