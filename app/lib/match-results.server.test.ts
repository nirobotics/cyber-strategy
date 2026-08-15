import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchResult } from "./match-analysis";

const mocks = vi.hoisted(() => ({
  fetchFrcMatchResults: vi.fn(),
  loadSuperScoutMatchResults: vi.fn(),
}));

vi.mock("./frc-events.server", () => ({ fetchFrcMatchResults: mocks.fetchFrcMatchResults }));
vi.mock("./cyber-scout.server", () => ({ loadSuperScoutMatchResults: mocks.loadSuperScoutMatchResults }));

import { fetchMatchResults } from "./match-results.server";

describe("match result source priority", () => {
  afterEach(() => vi.clearAllMocks());

  it("requests FRC Events and Super Scout concurrently, while keeping official scores", async () => {
    const official = result("frc-events", 123, 98);
    let resolveOfficial!: (value: MatchResult[]) => void;
    mocks.fetchFrcMatchResults.mockReturnValue(new Promise((resolve) => { resolveOfficial = resolve; }));
    mocks.loadSuperScoutMatchResults.mockResolvedValue([result("super-scout", 500, 400)]);

    const pending = fetchMatchResults("2026cnsh");
    expect(mocks.fetchFrcMatchResults).toHaveBeenCalledBefore(mocks.loadSuperScoutMatchResults);
    expect(mocks.loadSuperScoutMatchResults).toHaveBeenCalledTimes(1);
    resolveOfficial([official]);
    await expect(pending).resolves.toEqual([official]);
  });

  it("uses Super Scout after FRC Events has no result", async () => {
    const fallback = result("super-scout", 500, 400);
    mocks.fetchFrcMatchResults.mockResolvedValue([]);
    mocks.loadSuperScoutMatchResults.mockResolvedValue([fallback]);

    await expect(fetchMatchResults("2026cnsh")).resolves.toEqual([fallback]);
    expect(mocks.fetchFrcMatchResults).toHaveBeenCalledBefore(mocks.loadSuperScoutMatchResults);
  });
});

function result(source: MatchResult["source"], red: number, blue: number): MatchResult {
  return {
    source,
    comp_level: "qm",
    match_number: 1,
    alliances: { red: { score: red }, blue: { score: blue } },
  };
}
