import { describe, expect, it } from "vitest";
import {
  canDeleteProposalAs,
  canEditProposal,
  canEditProposalAs,
  canRestoreApprovedSnapshot,
  canReviewProposal,
  compactRoutePoints,
  ensureStrategyBoardTeams,
  eraseStrategyStrokes,
  normalizeOwnTeam,
  normalizeProposalPayload,
  proposalMatchesOwnTeamQuery,
  proposalMatchesSnapshot,
  shouldFinishRouteStroke,
  strategyProposalTitle,
  type StrategyProposal,
} from "./strategy-proposals";

describe("strategy proposal helpers", () => {
  it("generates proposal titles from match and type", () => {
    expect(strategyProposalTitle("auto", "Q9")).toBe("Q9 · 比赛策略");
    expect(strategyProposalTitle("self_strategy", "Q12")).toBe("Q12 · 我们自己");
    expect(strategyProposalTitle("partner_strategy", "Q15")).toBe("Q15 · 队友策略");
  });

  it("migrates legacy Auto routes into the unified match board", () => {
    expect(normalizeProposalPayload("auto", {
      autoWinner: "red",
      autoRoutes: { frc8214: [{ x: 10.04, y: 99.96, start: true }, { x: 20, y: 80 }, { x: -1, y: 2 }] },
      transitionRoutes: { 9635: [{ x: 50, y: 40 }] },
      teamNotes: { frc8214: "  start left  " },
      note: "  hold center  ",
    })).toEqual({
      kind: "match_strategy",
      autoWinner: "red",
      phases: {
        auto: {
          robots: [],
          strokes: [{
            id: "legacy-auto-8214-0",
            color: "#f8fafc",
            points: [{ x: 10, y: 100 }, { x: 20, y: 80 }],
          }],
        },
        transition: { robots: [], strokes: [] },
        active: { robots: [], strokes: [] },
        inactive: { robots: [], strokes: [] },
      },
      teamNotes: { "8214": "start left" },
      note: "hold center",
    });
  });

  it("adds six independent robot models to every match phase", () => {
    const payload = ensureStrategyBoardTeams(
      normalizeProposalPayload("auto", {}) as Extract<ReturnType<typeof normalizeProposalPayload>, { kind: "match_strategy" }>,
      ["8214", "9992", "6399"],
      ["11019", "9995", "10016"],
    );

    expect(payload.phases.auto.robots).toHaveLength(6);
    expect(payload.phases.transition.robots).toHaveLength(6);
    expect(payload.phases.auto.robots[0]).toEqual({ team: "8214", x: 2680 / 3510 * 100, y: 205 / 1610 * 100, rotation: 0 });
    expect(payload.phases.auto.robots[3]).toEqual({ team: "11019", x: 830 / 3510 * 100, y: 205 / 1610 * 100, rotation: 0 });
    expect(payload.phases.auto.robots).not.toBe(payload.phases.transition.robots);
  });

  it("migrates only untouched legacy robot positions", () => {
    const payload = normalizeProposalPayload("auto", {
      phases: {
        auto: {
          robots: [
            { team: "8214", x: 20, y: 20, rotation: 0 },
            { team: "9992", x: 42, y: 44, rotation: 25 },
            { team: "11019", x: 80, y: 20, rotation: 180 },
          ],
        },
      },
    }) as Extract<ReturnType<typeof normalizeProposalPayload>, { kind: "match_strategy" }>;

    const migrated = ensureStrategyBoardTeams(payload, ["8214", "9992"], ["11019"]);

    expect(migrated.phases.auto.robots[0]).toEqual({ team: "8214", x: 2680 / 3510 * 100, y: 205 / 1610 * 100, rotation: 0 });
    expect(migrated.phases.auto.robots[1]).toEqual({ team: "9992", x: 42, y: 44, rotation: 25 });
    expect(migrated.phases.auto.robots[2]).toEqual({ team: "11019", x: 830 / 3510 * 100, y: 205 / 1610 * 100, rotation: 0 });
  });

  it("eraser removes the whole stroke it touches", () => {
    const strokes = [
      { id: "a", color: "#ffffff", points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] },
      { id: "b", color: "#ef4444", points: [{ x: 10, y: 80 }, { x: 50, y: 80 }] },
    ];
    expect(eraseStrategyStrokes(strokes, { x: 30, y: 31 }, 2).map((stroke) => stroke.id)).toEqual(["b"]);
  });

  it("keeps self strategy as one map per shift", () => {
    const payload = normalizeProposalPayload("self_strategy", {
      shifts: {
        active: { points: [{ x: 1, y: 2 }], opponentRoutes: { frc3: [{ x: 5, y: 6 }] }, note: "cycle" },
        inactive: { points: [{ x: 3, y: 4 }], note: "feed" },
      },
    });

    expect(payload).toMatchObject({
      kind: "self_strategy",
      shifts: {
        active: { points: [{ x: 1, y: 2 }], opponentRoutes: { "3": [{ x: 5, y: 6 }] }, note: "cycle" },
        inactive: { points: [{ x: 3, y: 4 }], opponentRoutes: {}, note: "feed" },
        endgame: { points: [], opponentRoutes: {}, note: "" },
      },
    });
  });

  it("keeps partner strategy as one shared route map per shift", () => {
    const payload = normalizeProposalPayload("partner_strategy", {
      partners: ["frc1", "2"],
      partnerNotes: { frc1: "  feed from left  " },
      shifts: {
        active: {
          routes: {
            1: [{ x: 10, y: 20 }],
            2: [{ x: 30, y: 40 }],
          },
          note: "split lanes",
        },
      },
    });

    expect(payload).toMatchObject({
      kind: "partner_strategy",
      partners: ["1", "2"],
      partnerNotes: { "1": "feed from left" },
      shifts: {
        active: {
          routes: {
            "1": [{ x: 10, y: 20 }],
            "2": [{ x: 30, y: 40 }],
          },
          note: "split lanes",
        },
      },
    });
  });

  it("compacts hand-drawn route points before saving", () => {
    const denseStroke = Array.from({ length: 220 }, (_, index) => ({
      x: Math.min(99, index * 0.3),
      y: 20,
      start: index === 0,
    }));
    const compacted = compactRoutePoints(denseStroke);

    expect(compacted.length).toBeLessThan(80);
    expect(compacted[0]).toEqual({ x: 0, y: 20, start: true });
    expect(compacted.at(-1)).toEqual({ x: 65.7, y: 20 });
  });

  it("caps very long strokes to a bounded payload size", () => {
    const longStroke = Array.from({ length: 220 }, (_, index) => ({
      x: Math.round(((index % 100) + 0.1) * 10) / 10,
      y: Math.round((index * 1.3 % 100) * 10) / 10,
      start: index === 0,
    }));

    expect(compactRoutePoints(longStroke).length).toBeLessThanOrEqual(100);
  });

  it("keeps iPad touch and Apple Pencil strokes active through pointerleave", () => {
    expect(shouldFinishRouteStroke("pointerleave", "touch")).toBe(false);
    expect(shouldFinishRouteStroke("pointerleave", "pen")).toBe(false);
    expect(shouldFinishRouteStroke("pointerleave", "mouse")).toBe(true);
    expect(shouldFinishRouteStroke("pointerup", "touch")).toBe(true);
    expect(shouldFinishRouteStroke("pointercancel", "pen")).toBe(true);
  });

  it("locks own team choices and permissions", () => {
    expect(normalizeOwnTeam("9635")).toBe("9635");
    expect(normalizeOwnTeam("6328")).toBe("8214");
    expect(canEditProposal(proposal("draft"), "u1")).toBe(true);
    expect(canEditProposal(proposal("rejected"), "u1")).toBe(true);
    expect(canEditProposal(proposal("submitted"), "u1")).toBe(false);
    expect(canEditProposal(proposal("approved"), "u1")).toBe(true);
    expect(canEditProposalAs(proposal("submitted"), "u2", true)).toBe(true);
    expect(canReviewProposal(proposal("submitted"), true)).toBe(true);
    expect(canReviewProposal(proposal("draft"), true)).toBe(false);
    expect(canReviewProposal(proposal("submitted"), false)).toBe(false);
    expect(canDeleteProposalAs(proposal("submitted"), "u1", false)).toBe(true);
    expect(canDeleteProposalAs(proposal("submitted"), "u2", false)).toBe(false);
    expect(canDeleteProposalAs(proposal("submitted"), "u2", true)).toBe(true);
  });

  it("allows restoring a changed proposal to the last approved snapshot", () => {
    const changed = {
      ...proposal("submitted"),
      matchKey: "qm1",
      matchLabel: "Q1",
      ownTeam: "8214" as const,
      proposalType: "auto" as const,
      title: "Changed",
      payload: normalizeProposalPayload("auto", { note: "new" }),
      lastApprovedSnapshot: {
        matchKey: "qm1",
        matchLabel: "Q1",
        ownTeam: "8214" as const,
        proposalType: "auto" as const,
        title: "Approved",
        payload: normalizeProposalPayload("auto", { note: "old" }),
        reviewedBy: "admin",
        reviewNote: null,
        reviewedAt: "2026-07-05T00:00:00.000Z",
      },
    };
    const unchanged = { ...changed, title: "Approved", payload: normalizeProposalPayload("auto", { note: "old" }) };

    expect(canRestoreApprovedSnapshot(changed, "u1", false)).toBe(true);
    expect(canRestoreApprovedSnapshot(changed, "u2", false)).toBe(false);
    expect(canRestoreApprovedSnapshot(changed, "u2", true)).toBe(true);
    expect(canRestoreApprovedSnapshot(unchanged, "u1", false)).toBe(false);
  });

  it("does not treat generated title differences as proposal changes", () => {
    const payload = normalizeProposalPayload("auto", { note: "same" });
    expect(proposalMatchesSnapshot({
      ...proposal("approved"),
      matchKey: "qm1",
      matchLabel: "Q1",
      ownTeam: "8214",
      proposalType: "auto",
      payload,
      lastApprovedSnapshot: {
        matchKey: "qm1",
        matchLabel: "Q1",
        ownTeam: "8214",
        proposalType: "auto",
        title: "Old generated title",
        payload,
        reviewedBy: "admin",
        reviewNote: null,
        reviewedAt: "2026-07-05T00:00:00.000Z",
      },
    })).toBe(true);
  });

  it("searches proposals by own team, not every team in the match", () => {
    expect(proposalMatchesOwnTeamQuery({ ownTeam: "8214" }, "9635")).toBe(false);
    expect(proposalMatchesOwnTeamQuery({ ownTeam: "9635" }, "9635")).toBe(true);
    expect(proposalMatchesOwnTeamQuery({ ownTeam: "8214" }, "Team 82")).toBe(true);
  });

});

function proposal(status: StrategyProposal["status"]): Pick<StrategyProposal, "createdBy" | "status"> {
  return { createdBy: "u1", status };
}
