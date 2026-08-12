import { describe, expect, it } from "vitest";
import { dashboardResourcePath, shouldRevalidateDashboard } from "./dashboard-performance";

describe("dashboard performance helpers", () => {
  it("builds focused resource URLs without reloading the dashboard", () => {
    expect(dashboardResourcePath("match", "2026otsan")).toBe("/api/match-schedule?event=2026otsan");
    expect(dashboardResourcePath("proposal", "event with space")).toBe("/strategy-proposal?event=event%20with%20space");
    expect(dashboardResourcePath("picklist", "2026cnsh")).toBe("/picklists?event=2026cnsh");
  });

  it("skips the expensive dashboard loader after focused form actions", () => {
    expect(shouldRevalidateDashboard("/strategy-proposal", true)).toBe(false);
    expect(shouldRevalidateDashboard("/scouting-lead", true)).toBe(false);
    expect(shouldRevalidateDashboard("/picklists", true)).toBe(false);
    expect(shouldRevalidateDashboard("/admin", true)).toBe(true);
  });
});
