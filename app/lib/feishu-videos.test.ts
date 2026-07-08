import { describe, expect, it } from "vitest";
import { indexVideoEntries } from "./feishu-videos.server";
import type { TbaMatch } from "./match-analysis";

describe("feishu match video index", () => {
  it("matches qualification videos by title label", () => {
    const videos = indexVideoEntries(
      [{ title: "Shanghai Regional Q3 8214.mp4", url: "https://example.com/q3", path: ["比赛视频"] }],
      [match({ key: "2026cnsh_qm3", comp_level: "qm", match_number: 3 })],
    );

    expect(videos["2026cnsh_qm3"]).toEqual([{ title: "Shanghai Regional Q3 8214.mp4", url: "https://example.com/q3" }]);
  });

  it("matches final videos as playoff videos", () => {
    const videos = indexVideoEntries(
      [{ title: "决赛 F1 完整录像", url: "https://example.com/f1", path: ["比赛视频"] }],
      [match({ key: "2026cnsh_f1m1", comp_level: "f", match_number: 1, set_number: 1 })],
    );

    expect(videos["2026cnsh_f1m1"]).toEqual([{ title: "决赛 F1 完整录像", url: "https://example.com/f1" }]);
  });

  it("matches videos by TBA key", () => {
    const videos = indexVideoEntries(
      [{ title: "raw 2026cnsh_sf13m1.mov", url: "https://example.com/sf", path: ["比赛视频"] }],
      [match({ key: "2026cnsh_sf13m1", comp_level: "sf", match_number: 1, set_number: 13 })],
    );

    expect(videos["2026cnsh_sf13m1"]).toEqual([{ title: "raw 2026cnsh_sf13m1.mov", url: "https://example.com/sf" }]);
  });
});

function match(value: TbaMatch): TbaMatch {
  return value;
}
