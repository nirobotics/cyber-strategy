import { describe, expect, it } from "vitest";
import { formatServerTiming } from "./server-timing.server";

describe("Server-Timing", () => {
  it("formats generic stage names and non-negative durations", () => {
    expect(formatServerTiming([["embed_dataset", 12.34], ["embed_view", -1]])).toBe(
      "embed_dataset;dur=12.3, embed_view;dur=0.0",
    );
  });
});
