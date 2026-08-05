import { describe, expect, it } from "vitest";
import { filterAssignmentUsers } from "./scouting-lead-panel";

describe("filterAssignmentUsers", () => {
  const users = [
    { id: "1", displayName: "8214 张梓轩" },
    { id: "2", displayName: "9635 陈子洋" },
  ];

  it("filters assignment users by team number or name", () => {
    expect(filterAssignmentUsers(users, "8214")).toEqual([users[0]]);
    expect(filterAssignmentUsers(users, "子洋")).toEqual([users[1]]);
    expect(filterAssignmentUsers(users, "")).toEqual(users);
  });
});
