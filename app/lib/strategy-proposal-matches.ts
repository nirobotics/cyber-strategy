import { matchIdentity, matchLabel, matchTeams, sortedMatches, type CombinedMatch } from "./match-analysis";
import { ownStrategyTeams } from "./strategy-proposals";

export type ProposalMatch = { key: string; label: string; redTeams: string[]; blueTeams: string[] };

export function toProposalMatches(matches: CombinedMatch[]): ProposalMatch[] {
  return sortedMatches(matches)
    .map((match) => ({
      key: matchIdentity(match),
      label: matchLabel(match),
      redTeams: matchTeams(match, "red"),
      blueTeams: matchTeams(match, "blue"),
    }))
    .filter((match) => match.redTeams.length === 3 && match.blueTeams.length === 3 && matchHasOwnTeam(match));
}

function matchHasOwnTeam(match: ProposalMatch) {
  const teams = [...match.redTeams, ...match.blueTeams];
  return ownStrategyTeams.some((team) => teams.includes(team));
}
