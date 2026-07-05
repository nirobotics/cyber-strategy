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

export function proposalMatchesForTeam(matches: ProposalMatch[], team: string) {
  return matches.filter((match) => proposalMatchIncludesTeam(match, team));
}

export function firstProposalMatchForTeam(matches: ProposalMatch[], team: string) {
  return matches.find((match) => proposalMatchIncludesTeam(match, team)) ?? null;
}

export function proposalMatchForKeyOrFirst(matches: ProposalMatch[], key: string) {
  return matches.find((match) => match.key === key) ?? matches[0] ?? null;
}

export function proposalMatchIncludesTeam(match: ProposalMatch, team: string) {
  return match.redTeams.includes(team) || match.blueTeams.includes(team);
}

export function proposalMatchMatchesTeamQuery(match: ProposalMatch, query: string) {
  const teamQuery = query.replace(/\D/g, "");
  if (!teamQuery) return true;
  return [...match.redTeams, ...match.blueTeams].some((team) => team.includes(teamQuery));
}

function matchHasOwnTeam(match: ProposalMatch) {
  return ownStrategyTeams.some((team) => proposalMatchIncludesTeam(match, team));
}
