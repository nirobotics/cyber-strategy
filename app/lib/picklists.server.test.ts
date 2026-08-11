import { describe, expect, it } from "vitest";
import { createMainPicklist } from "./picklists.server";

describe("picklist server permissions", () => {
  it("rejects Main creation before touching the database for a non-admin", async () => {
    await expect(createMainPicklist({
      eventKey: "2026cnsh",
      name: "Regional Main",
      actorOpenId: "user-1",
      isAdmin: false,
    })).rejects.toMatchObject({ status: 403 });
  });
});
