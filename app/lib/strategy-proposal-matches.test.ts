import { describe, expect, it } from "vitest";
import {
  firstProposalMatchForTeam,
  proposalMatchForKeyOrFirst,
  proposalMatchIncludesTeam,
  proposalMatchesForTeam,
  proposalMatchMatchesTeamQuery,
  type ProposalMatch,
} from "./strategy-proposal-matches";

const matches: ProposalMatch[] = [
  { key: "qm1", label: "Q1", redTeams: ["8214", "111", "222"], blueTeams: ["333", "444", "555"] },
  { key: "qm2", label: "Q2", redTeams: ["111", "222", "333"], blueTeams: ["9635", "444", "555"] },
  { key: "qm3", label: "Q3", redTeams: ["8214", "111", "222"], blueTeams: ["9635", "444", "555"] },
];

describe("strategy proposal matches", () => {
  it("filters selectable matches by own team", () => {
    expect(proposalMatchesForTeam(matches, "8214").map((match) => match.key)).toEqual(["qm1", "qm3"]);
    expect(proposalMatchesForTeam(matches, "9635").map((match) => match.key)).toEqual(["qm2", "qm3"]);
    expect(firstProposalMatchForTeam(matches, "9635")?.key).toBe("qm2");
    expect(proposalMatchIncludesTeam(matches[0], "9635")).toBe(false);
  });

  it("matches proposal matches by partial team number query", () => {
    expect(proposalMatchMatchesTeamQuery(matches[0], "82")).toBe(true);
    expect(proposalMatchMatchesTeamQuery(matches[0], "Team 333")).toBe(true);
    expect(proposalMatchMatchesTeamQuery(matches[0], "9635")).toBe(false);
  });

  it("falls back to the first selectable match when a stored match key is stale", () => {
    expect(proposalMatchForKeyOrFirst(matches, "missing")?.key).toBe("qm1");
    expect(proposalMatchForKeyOrFirst(matches, "qm2")?.key).toBe("qm2");
    expect(proposalMatchForKeyOrFirst([], "missing")).toBeNull();
  });
});
