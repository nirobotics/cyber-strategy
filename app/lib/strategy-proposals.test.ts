import { describe, expect, it } from "vitest";
import {
  canEditProposal,
  canReviewProposal,
  normalizeOwnTeam,
  normalizeProposalPayload,
  type StrategyProposal,
} from "./strategy-proposals";

describe("strategy proposal helpers", () => {
  it("normalizes auto proposal payload and manual winner", () => {
    expect(normalizeProposalPayload("auto", {
      autoWinner: "red",
      autoRoutes: { frc8214: [{ x: 10.04, y: 99.96 }, { x: -1, y: 2 }] },
      transitionRoutes: { 9635: [{ x: 50, y: 40 }] },
      note: "  hold center  ",
    })).toEqual({
      kind: "auto",
      autoWinner: "red",
      autoRoutes: { "8214": [{ x: 10, y: 100 }] },
      transitionRoutes: { "9635": [{ x: 50, y: 40 }] },
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
    expect(canEditProposal(proposal("approved"), "u1")).toBe(false);
    expect(canReviewProposal(proposal("submitted"), true)).toBe(true);
    expect(canReviewProposal(proposal("draft"), true)).toBe(false);
    expect(canReviewProposal(proposal("submitted"), false)).toBe(false);
  });
});

function proposal(status: StrategyProposal["status"]): Pick<StrategyProposal, "createdBy" | "status"> {
  return { createdBy: "u1", status };
}
