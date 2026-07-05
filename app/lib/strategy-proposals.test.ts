import { describe, expect, it } from "vitest";
import {
  canDeleteProposalAs,
  canEditProposal,
  canEditProposalAs,
  canRestoreApprovedSnapshot,
  canReviewProposal,
  normalizeOwnTeam,
  normalizeProposalPayload,
  proposalMatchesOwnTeamQuery,
  proposalMatchesSnapshot,
  strategyProposalTitle,
  type StrategyProposal,
} from "./strategy-proposals";

describe("strategy proposal helpers", () => {
  it("generates proposal titles from match and type", () => {
    expect(strategyProposalTitle("auto", "Q9")).toBe("Q9 · Auto");
    expect(strategyProposalTitle("self_strategy", "Q12")).toBe("Q12 · 我们自己");
    expect(strategyProposalTitle("partner_strategy", "Q15")).toBe("Q15 · 队友策略");
  });

  it("normalizes auto proposal payload and manual winner", () => {
    expect(normalizeProposalPayload("auto", {
      autoWinner: "red",
      autoRoutes: { frc8214: [{ x: 10.04, y: 99.96 }, { x: -1, y: 2 }] },
      transitionRoutes: { 9635: [{ x: 50, y: 40 }] },
      teamNotes: { frc8214: "  start left  " },
      note: "  hold center  ",
    })).toEqual({
      kind: "auto",
      autoWinner: "red",
      autoRoutes: { "8214": [{ x: 10, y: 100 }] },
      transitionRoutes: { "9635": [{ x: 50, y: 40 }] },
      teamNotes: { "8214": "start left" },
      note: "hold center",
    });
  });

  it("keeps self strategy as one map per shift", () => {
    const payload = normalizeProposalPayload("self_strategy", {
      shifts: {
        active: { points: [{ x: 1, y: 2 }], note: "cycle" },
        inactive: { points: [{ x: 3, y: 4 }], note: "feed" },
      },
    });

    expect(payload).toMatchObject({
      kind: "self_strategy",
      shifts: {
        active: { points: [{ x: 1, y: 2 }], note: "cycle" },
        inactive: { points: [{ x: 3, y: 4 }], note: "feed" },
        endgame: { points: [], note: "" },
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
