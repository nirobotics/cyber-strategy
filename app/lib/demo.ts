import { matchTeams, type CombinedMatch } from "./match-analysis";
import type { ScoutConfidenceResult } from "./cyber-scout.server";
import type { ScoutingDataset, TeamPitData } from "./scouting";
import type { PicklistBoard, SharedPicklist } from "./picklist";
import type { ProposalMatch } from "./strategy-proposal-matches";
import { normalizeProposalPayload, strategyProposalTitle, type StrategyProposal, type StrategyProposalStatus } from "./strategy-proposals";

export const DEMO_EVENT_KEY = "2026txcmp2";
export const DEMO_EVENT_NAME = "Event 1";
export const DEMO_OWN_TEAMS = ["1000"] as const;

export function buildDemoStrategyProposals(matches: ProposalMatch[]): StrategyProposal[] {
  const statuses: StrategyProposalStatus[] = ["approved", "submitted", "rejected"];
  const notes = ["优先执行中路自动路线，主动阶段保持分散。", "开局避让队友，主动阶段集中进攻。", "自动阶段保守运行，末段提前准备爬升。"];
  const reviewNotes = ["方案清晰，可以按此执行。", null, "请补充与队友发生路线冲突时的备用方案。"];

  return matches.slice(0, 3).map((match, index) => ({
    id: `demo-proposal-${index + 1}`,
    eventKey: DEMO_EVENT_KEY,
    matchKey: match.key,
    matchLabel: match.label,
    ownTeam: DEMO_OWN_TEAMS[0] as StrategyProposal["ownTeam"],
    proposalType: "auto",
    status: statuses[index],
    title: strategyProposalTitle("auto", match.label),
    payload: normalizeProposalPayload("auto", { note: notes[index] }),
    createdBy: "demo",
    createdByName: `scout ${index + 1}`,
    reviewedBy: index === 1 ? null : "demo-admin",
    reviewNote: reviewNotes[index],
    submittedAt: "2026-04-04T08:00:00.000Z",
    reviewedAt: index === 1 ? null : "2026-04-04T08:30:00.000Z",
    lastApprovedSnapshot: null,
    createdAt: "2026-04-04T08:00:00.000Z",
    updatedAt: `2026-04-04T0${9 - index}:00:00.000Z`,
  }));
}

export function buildDemoData(dataset: ScoutingDataset, matches: CombinedMatch[], scoutingLead: ScoutConfidenceResult, picklists: SharedPicklist[] = []) {
  const originalTeams = [...new Set([
    ...Object.keys(dataset.teamData),
    ...matches.flatMap((match) => [...matchTeams(match, "red"), ...matchTeams(match, "blue")]),
  ])].sort((a, b) => Number(a) - Number(b));

  if (originalTeams.length !== 45) {
    throw new Error(`Demo 需要 45 支队伍，当前读取到 ${originalTeams.length} 支。`);
  }

  const teamMap = new Map(originalTeams.map((team, index) => [team, String(1000 + index)]));
  const scoutMap = buildScoutMap(dataset, scoutingLead);
  const teamData = Object.fromEntries(Object.entries(dataset.teamData).map(([team, summary]) => {
    const demoTeam = mappedTeam(teamMap, team);
    return [demoTeam, {
      ...summary,
      team: demoTeam,
      matches: summary.matches.map((match) => ({
        ...match,
        comment: "",
        scoutName: anonymizedScout(scoutMap, match.scoutName),
        autoScoutName: match.autoScoutName ? anonymizedScout(scoutMap, match.autoScoutName) : undefined,
      })),
    }];
  }));

  const teamPitData: TeamPitData | undefined = dataset.teamPitData
    ? Object.fromEntries(Object.entries(dataset.teamPitData).map(([team, value]) => [mappedTeam(teamMap, team), value]))
    : undefined;

  return {
    dataset: {
      ...dataset,
      id: "demo-event-1",
      title: DEMO_EVENT_NAME,
      eventKey: DEMO_EVENT_KEY,
      sourceFilename: null,
      teamData,
      teamPhotos: {},
      teamPitData,
      isActive: true,
    },
    matches: matches.map((match) => anonymizeMatch(match, teamMap)),
    scoutingLead: anonymizeScoutingLead(scoutingLead, teamMap, scoutMap),
    picklists: picklists.map((list) => ({ ...list, eventKey: DEMO_EVENT_KEY, board: mapPicklistBoard(list.board, teamMap), createdBy: list.kind === "personal" && list.name.toLowerCase().includes("scout 1") ? "demo" : list.createdBy })),
  };
}

function mapPicklistBoard(board: PicklistBoard, teamMap: Map<string, string>): PicklistBoard {
  return Object.fromEntries(Object.entries(board).map(([column, teams]) => [column, teams.map((team) => teamMap.get(team) ?? String(1000 + (Number(team) % 45)))])) as PicklistBoard;
}

function buildScoutMap(dataset: ScoutingDataset, scoutingLead: ScoutConfidenceResult) {
  const leadNames = [
    ...scoutingLead.report.people.map((person) => person.scoutName),
    ...scoutingLead.report.matches.flatMap((match) => [...match.redPredictors, ...match.bluePredictors]),
    ...scoutingLead.leadData.users.map((user) => user.displayName),
    ...scoutingLead.leadData.assignments.map((assignment) => assignment.userName),
    ...scoutingLead.leadData.recordSchedule.matches.flatMap((match) => [...match.red, ...match.blue].flatMap((cell) =>
      [...cell.normalRecords, ...cell.superRecords].map((record) => record.completedBy),
    )),
  ];
  const names = [...new Set([
    ...Object.values(dataset.teamData).flatMap((team) =>
      team.matches.flatMap((match) => [match.scoutName, match.autoScoutName].filter((name): name is string => Boolean(name))),
    ),
    ...leadNames.filter(Boolean),
  ])].sort((a, b) => stableHash(a) - stableHash(b) || a.localeCompare(b));
  return new Map(names.map((name, index) => [name, `scout ${index + 1}`]));
}

function anonymizedScout(scoutMap: Map<string, string>, name: string) {
  return name ? scoutMap.get(name) ?? "scout" : "";
}

function anonymizeMatch(match: CombinedMatch, teamMap: Map<string, string>): CombinedMatch {
  return {
    ...match,
    alliances: mapAlliances(match.alliances, teamMap),
    red_alliance: mapTeamValues(match.red_alliance, teamMap),
    blue_alliance: mapTeamValues(match.blue_alliance, teamMap),
    tba: match.tba ? { ...match.tba, alliances: mapAlliances(match.tba.alliances, teamMap) } : undefined,
    videos: [],
  };
}

function anonymizeScoutingLead(
  data: ScoutConfidenceResult,
  teamMap: Map<string, string>,
  scoutMap: Map<string, string>,
): ScoutConfidenceResult {
  let recordIndex = 0;
  const anonymizeRecord = (record: ScoutConfidenceResult["leadData"]["recordSchedule"]["matches"][number]["red"][number]["normalRecords"][number]) => {
    const teamNumber = record.teamNumber ? mappedTeam(teamMap, record.teamNumber) : null;
    return {
      ...record,
      id: `demo-record-${++recordIndex}`,
      teamNumber,
      completedBy: anonymizedScout(scoutMap, record.completedBy),
      label: record.recordType === "normal_match"
        ? `普通 Scout · Team ${teamNumber || "-"} · ${record.position || "-"}`
        : `超级 Scout · ${record.alliance === "red" ? "红方" : record.alliance === "blue" ? "蓝方" : "联盟"}`,
    };
  };
  const matches = data.leadData.recordSchedule.matches.map((match) => ({
    ...match,
    red: match.red.map((cell) => ({
      ...cell,
      team: mappedTeam(teamMap, cell.team),
      normalRecords: cell.normalRecords.map(anonymizeRecord),
      superRecords: cell.superRecords.map(anonymizeRecord),
    })),
    blue: match.blue.map((cell) => ({
      ...cell,
      team: mappedTeam(teamMap, cell.team),
      normalRecords: cell.normalRecords.map(anonymizeRecord),
      superRecords: cell.superRecords.map(anonymizeRecord),
    })),
  }));

  return {
    report: {
      ...data.report,
      people: data.report.people.map((person) => ({ ...person, scoutName: anonymizedScout(scoutMap, person.scoutName) })),
      matches: data.report.matches.map((match) => ({
        ...match,
        redPredictors: match.redPredictors.map((name) => anonymizedScout(scoutMap, name)),
        bluePredictors: match.bluePredictors.map((name) => anonymizedScout(scoutMap, name)),
      })),
    },
    events: [{ eventKey: DEMO_EVENT_KEY, name: DEMO_EVENT_NAME, isActive: true, updatedAt: data.sourceStatus.updatedAt }],
    selectedEventKey: DEMO_EVENT_KEY,
    sourceStatus: {
      source: "cyber-scout",
      label: "Demo 数据",
      message: DEMO_EVENT_NAME,
      updatedAt: data.sourceStatus.updatedAt,
    },
    leadData: {
      ...data.leadData,
      recordSchedule: { ...data.leadData.recordSchedule, matches },
      assignments: data.leadData.assignments.map((assignment, index) => ({
        ...assignment,
        id: `demo-assignment-${index + 1}`,
        userName: anonymizedScout(scoutMap, assignment.userName),
      })),
      users: data.leadData.users.map((user, index) => ({
        id: `demo-user-${index + 1}`,
        displayName: anonymizedScout(scoutMap, user.displayName),
      })),
      configEventKey: DEMO_EVENT_NAME,
    },
  };
}

function mapAlliances(alliances: CombinedMatch["alliances"], teamMap: Map<string, string>) {
  if (!alliances) return undefined;
  return {
    red: alliances.red ? { ...alliances.red, team_keys: mapTeamValues(alliances.red.team_keys, teamMap) } : undefined,
    blue: alliances.blue ? { ...alliances.blue, team_keys: mapTeamValues(alliances.blue.team_keys, teamMap) } : undefined,
  };
}

function mapTeamValues(values: Array<string | number> | undefined, teamMap: Map<string, string>) {
  return values?.map((value) => {
    const raw = String(value);
    const mapped = mappedTeam(teamMap, raw.replace(/^frc/, ""));
    if (raw.startsWith("frc")) return `frc${mapped}`;
    return typeof value === "number" ? Number(mapped) : mapped;
  });
}

function mappedTeam(teamMap: Map<string, string>, team: string) {
  const mapped = teamMap.get(team);
  if (!mapped) throw new Error("Apollo Demo 数据包含未映射队伍。");
  return mapped;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
