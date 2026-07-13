import { describe, expect, it } from "vitest";
import { addPickListTeam, insertPickListTeam, orderPickPool, sanitizePickList } from "./picklist";

describe("picklist helpers", () => {
  const teams = [
    { team: "1", avgTotal: 100 },
    { team: "2", avgTotal: 80 },
    { team: "3", avgTotal: 0 },
    { team: "4", avgTotal: 60 },
  ];

  it("keeps crossed teams at the bottom while ranked teams stay sorted", () => {
    expect(orderPickPool(teams, ["2"]).map((team) => team.team)).toEqual(["1", "4", "3", "2"]);
  });

  it("builds independent pools from each pick list while sharing crossed teams", () => {
    expect(orderPickPool(teams, ["2"], ["1"]).map((team) => team.team)).toEqual(["4", "3", "2"]);
    expect(orderPickPool(teams, ["2"], ["4"]).map((team) => team.team)).toEqual(["1", "3", "2"]);
  });

  it("does not duplicate teams in one pick list", () => {
    expect(addPickListTeam(["1", "2"], "2")).toEqual(["1", "2"]);
    expect(addPickListTeam(["1", "2"], "3")).toEqual(["1", "2", "3"]);
  });

  it("lets the same team live in separate pick lists", () => {
    const first = addPickListTeam([], "6328");
    const second = addPickListTeam([], "6328");
    expect(first).toEqual(["6328"]);
    expect(second).toEqual(["6328"]);
  });

  it("reorders teams by inserting before a target", () => {
    expect(insertPickListTeam(["1", "2", "3"], "3", "1")).toEqual(["3", "1", "2"]);
    expect(insertPickListTeam(["1", "2", "3"], "1")).toEqual(["2", "3", "1"]);
  });

  it("filters stale and duplicate teams", () => {
    expect(sanitizePickList(["1", "9", "2", "1"], ["1", "2"])).toEqual(["1", "2"]);
  });
});
