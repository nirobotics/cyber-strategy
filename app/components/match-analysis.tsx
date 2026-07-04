import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card, cn } from "./ui";

type View = "matches" | "epa";

type StatboticsMatch = {
  key?: string;
  comp_level?: string;
  match_number?: number;
  set_number?: number;
  winning_alliance?: string;
  alliances?: {
    red?: { team_keys?: string[]; score?: number };
    blue?: { team_keys?: string[]; score?: number };
  };
  red_alliance?: string[];
  blue_alliance?: string[];
  red_score?: number;
  blue_score?: number;
  pred?: {
    red_score?: number;
    blue_score?: number;
    red_win_prob?: number;
    win_prob?: number;
  };
  epa?: {
    red?: { total?: number };
    blue?: { total?: number };
  };
};

type TeamEvent = {
  team?: string | number;
  team_number?: string | number;
  team_key?: string;
  epa?: number | {
    total?: number;
    auto?: number;
    teleop?: number;
    endgame?: number;
    total_points?: { mean?: number };
    auto_points?: { mean?: number };
    teleop_points?: { mean?: number };
    endgame_points?: { mean?: number };
  };
  record?: { wins?: number; losses?: number; ties?: number };
  wins?: number;
  losses?: number;
  ties?: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; matches: StatboticsMatch[]; teamEvents: TeamEvent[] };

export function MatchAnalysis({ eventKey }: { eventKey: string }) {
  const [view, setView] = useState<View>("matches");
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setState({ status: "loading" });
    });
    Promise.allSettled([
      fetch(`https://api.statbotics.io/v3/matches?event=${encodeURIComponent(eventKey)}&limit=500`),
      fetch(`https://api.statbotics.io/v3/team_events?event=${encodeURIComponent(eventKey)}&limit=200`),
    ])
      .then(async ([matchesResult, teamEventsResult]) => {
        if (!alive) return;
        const matches = matchesResult.status === "fulfilled" && matchesResult.value.ok
          ? ((await matchesResult.value.json()) as StatboticsMatch[])
          : [];
        const teamEvents = teamEventsResult.status === "fulfilled" && teamEventsResult.value.ok
          ? ((await teamEventsResult.value.json()) as TeamEvent[])
          : [];
        if (!matches.length && !teamEvents.length) {
          setState({ status: "error", message: "Statbotics data is not available." });
          return;
        }
        setState({ status: "ready", matches, teamEvents });
      })
      .catch((error: Error) => {
        if (alive) setState({ status: "error", message: error.message });
      });
    return () => {
      alive = false;
    };
  }, [eventKey]);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <p className="section-label">Statbotics</p>
          <h2 className="text-lg font-semibold text-ink">{eventKey}</h2>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={view === "matches" ? "active" : "default"} onClick={() => setView("matches")}>
            Match Schedule
          </Button>
          <Button type="button" variant={view === "epa" ? "active" : "default"} onClick={() => setView("epa")}>
            EPA Rankings
          </Button>
        </div>
      </Card>

      {state.status === "loading" || state.status === "idle" ? (
        <Card className="grid place-items-center p-10 text-ink-dim">
          <RefreshCw className="mb-3 size-6 animate-spin" />
          Loading Statbotics data
        </Card>
      ) : null}

      {state.status === "error" ? (
        <Card className="p-6 text-danger">
          <p className="font-semibold">Could not load match data</p>
          <p className="mt-1 text-sm text-ink-dim">{state.message}</p>
        </Card>
      ) : null}

      {state.status === "ready" && view === "matches" ? <MatchSchedule matches={state.matches} /> : null}
      {state.status === "ready" && view === "epa" ? <EpaRankings teamEvents={state.teamEvents} /> : null}
    </div>
  );
}

function MatchSchedule({ matches }: { matches: StatboticsMatch[] }) {
  if (!matches.length) {
    return <Card className="p-8 text-center text-ink-dim">No match schedule available.</Card>;
  }

  const levelOrder: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  const sorted = [...matches].sort((a, b) => {
    const levelDiff = (levelOrder[a.comp_level ?? "qm"] ?? 0) - (levelOrder[b.comp_level ?? "qm"] ?? 0);
    if (levelDiff) return levelDiff;
    return (a.match_number ?? a.set_number ?? 0) - (b.match_number ?? b.set_number ?? 0);
  });
  const rows = sorted.map((match, index) => {
    const group = levelLabel(match.comp_level ?? "qm");
    const previous = index > 0 ? levelLabel(sorted[index - 1].comp_level ?? "qm") : "";
    return { match, group, showGroup: group !== previous };
  });

  return (
    <div className="space-y-3">
      {rows.map(({ match, group, showGroup }) => {
        const level = match.comp_level ?? "qm";
        return (
          <div key={match.key ?? `${level}-${match.set_number ?? 0}-${match.match_number ?? 0}`}>
            {showGroup ? <h3 className="mb-2 section-label">{group}</h3> : null}
            <MatchCard match={match} />
          </div>
        );
      })}
    </div>
  );
}

function MatchCard({ match }: { match: StatboticsMatch }) {
  const redTeams = teams(match.alliances?.red?.team_keys ?? match.red_alliance);
  const blueTeams = teams(match.alliances?.blue?.team_keys ?? match.blue_alliance);
  const redScore = match.alliances?.red?.score ?? match.red_score ?? null;
  const blueScore = match.alliances?.blue?.score ?? match.blue_score ?? null;
  const hasScore = redScore != null && redScore >= 0 && blueScore != null;
  const predRed = match.pred?.red_score ?? match.epa?.red?.total ?? null;
  const predBlue = match.pred?.blue_score ?? match.epa?.blue?.total ?? null;
  const winProb = match.pred?.red_win_prob ?? match.pred?.win_prob ?? null;
  const winner = match.winning_alliance || (hasScore ? (redScore > blueScore ? "red" : blueScore > redScore ? "blue" : "tie") : null);

  return (
    <Card className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-ink-faint">{matchLabel(match)}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", hasScore ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>
          {hasScore ? "Played" : "Upcoming"}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <AllianceBlock
          color="red"
          winner={winner === "red"}
          score={hasScore ? redScore : predRed}
          teams={redTeams}
          predicted={!hasScore}
        />
        <div className="grid justify-items-center gap-1 text-xs text-ink-faint">
          <span className="font-semibold uppercase">vs</span>
          {winProb != null ? (
            <>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-danger" style={{ width: `${Math.round(winProb * 100)}%` }} />
              </div>
              <span>{Math.round(winProb * 100)}% red</span>
            </>
          ) : null}
          {!hasScore && predRed != null && predBlue != null ? <span>{Math.round(predRed)} - {Math.round(predBlue)}</span> : null}
        </div>
        <AllianceBlock
          color="blue"
          winner={winner === "blue"}
          score={hasScore ? blueScore : predBlue}
          teams={blueTeams}
          predicted={!hasScore}
        />
      </div>
    </Card>
  );
}

function AllianceBlock({
  color,
  winner,
  score,
  teams,
  predicted,
}: {
  color: "red" | "blue";
  winner: boolean;
  score: number | null;
  teams: string[];
  predicted: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-center",
        color === "red" ? "border-danger/30 bg-danger/10" : "border-info/30 bg-info/10",
        winner && (color === "red" ? "ring-2 ring-danger" : "ring-2 ring-info"),
      )}
    >
      <div className={cn("text-2xl font-semibold", color === "red" ? "text-danger" : "text-info")}>
        {score == null ? "-" : predicted ? `~${Math.round(score)}` : Math.round(score)}
      </div>
      <div className="mt-1 text-xs leading-5 text-ink-dim">{teams.length ? teams.join(" · ") : "TBD"}</div>
    </div>
  );
}

function EpaRankings({ teamEvents }: { teamEvents: TeamEvent[] }) {
  if (!teamEvents.length) return <Card className="p-8 text-center text-ink-dim">No EPA data available.</Card>;

  const sorted = [...teamEvents].sort((a, b) => epaTotal(b) - epaTotal(a));
  const max = Math.max(epaTotal(sorted[0]), 1);
  const hasBreakdown = sorted.some((team) => epaAuto(team) != null);
  const hasRecord = sorted.some((team) => team.record || team.wins != null || team.losses != null);

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
            <tr>
              <th className="w-12 px-3 py-2 text-center">#</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left">EPA</th>
              {hasBreakdown ? (
                <>
                  <th className="px-3 py-2 text-left">Auto</th>
                  <th className="px-3 py-2 text-left">Teleop</th>
                  <th className="px-3 py-2 text-left">Endgame</th>
                </>
              ) : null}
              {hasRecord ? <th className="px-3 py-2 text-left">W-L-T</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => (
              <tr key={teamNumber(team)} className="border-t border-line">
                <td className={cn("px-3 py-2 text-center font-semibold text-ink-faint", index < 3 && "text-brand")}>{index + 1}</td>
                <td className="px-3 py-2 font-semibold text-brand">Team {teamNumber(team)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(4, (epaTotal(team) / max) * 120)}px` }} />
                    <span className="font-semibold">{fmt(epaTotal(team))}</span>
                  </div>
                </td>
                {hasBreakdown ? (
                  <>
                    <td className="px-3 py-2">{fmt(epaAuto(team))}</td>
                    <td className="px-3 py-2">{fmt(epaTele(team))}</td>
                    <td className="px-3 py-2">{fmt(epaEndgame(team))}</td>
                  </>
                ) : null}
                {hasRecord ? <td className="px-3 py-2 text-ink-dim">{record(team)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function teams(values: Array<string | number> | undefined) {
  return (values ?? []).map((team) => String(team).replace(/^frc/, ""));
}

function levelLabel(level: string) {
  return { qm: "Qualification Matches", ef: "Elimination Round", qf: "Quarterfinals", sf: "Semifinals", f: "Finals" }[level] ?? level.toUpperCase();
}

function matchLabel(match: StatboticsMatch) {
  const level = match.comp_level ?? "qm";
  const number = match.match_number ?? match.set_number ?? match.key?.split("_").pop() ?? "?";
  if (level === "qm") return `Q${number}`;
  if (level === "qf") return `QF${match.set_number ?? ""}-${number}`;
  if (level === "sf") return `SF${match.set_number ?? ""}-${number}`;
  if (level === "f") return `F${number}`;
  return `${level.toUpperCase()}-${number}`;
}

function epaTotal(team: TeamEvent) {
  return typeof team.epa === "number" ? team.epa : team.epa?.total_points?.mean ?? team.epa?.total ?? 0;
}

function epaAuto(team: TeamEvent) {
  return typeof team.epa === "number" ? null : team.epa?.auto_points?.mean ?? team.epa?.auto ?? null;
}

function epaTele(team: TeamEvent) {
  return typeof team.epa === "number" ? null : team.epa?.teleop_points?.mean ?? team.epa?.teleop ?? null;
}

function epaEndgame(team: TeamEvent) {
  return typeof team.epa === "number" ? null : team.epa?.endgame_points?.mean ?? team.epa?.endgame ?? null;
}

function teamNumber(team: TeamEvent) {
  return String(team.team ?? team.team_number ?? team.team_key ?? "").replace(/^frc/, "");
}

function record(team: TeamEvent) {
  const wins = team.record?.wins ?? team.wins ?? 0;
  const losses = team.record?.losses ?? team.losses ?? 0;
  const ties = team.record?.ties ?? team.ties ?? 0;
  return `${wins}-${losses}${ties ? `-${ties}` : ""}`;
}

function fmt(value: number | null) {
  return value == null ? "-" : value.toFixed(1);
}
