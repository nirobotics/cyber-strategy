import { describe, expect, it } from "vitest";
import { createMainPicklist, deletePersonalPicklist } from "./picklists.server";

describe("picklist server permissions", () => {
  it("rejects Main creation before touching the database for a non-admin", async () => {
    await expect(createMainPicklist({
      eventKey: "2026cnsh",
      name: "Regional Main",
      actorOpenId: "user-1",
      isAdmin: false,
    })).rejects.toMatchObject({ status: 403 });
  });

  it("requires a name before touching the database", async () => {
    await expect(createMainPicklist({
      eventKey: "2026cnsh",
      name: "   ",
      actorOpenId: "admin-1",
      isAdmin: true,
    })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an invalid Personal id before touching the database", async () => {
    await expect(deletePersonalPicklist({ id: "invalid", actorOpenId: "user-1" })).rejects.toMatchObject({ status: 404 });
  });
});
