export type DashboardResourceTab = "match" | "proposal" | "lead" | "picklist";

const resourcePaths: Record<DashboardResourceTab, string> = {
  match: "/api/match-schedule",
  proposal: "/strategy-proposal",
  lead: "/scouting-lead",
  picklist: "/picklists",
};

export function dashboardResourcePath(tab: DashboardResourceTab, eventKey: string) {
  return `${resourcePaths[tab]}?event=${encodeURIComponent(eventKey)}`;
}

export function shouldRevalidateDashboard(formAction: string | undefined, defaultShouldRevalidate: boolean) {
  return formAction === "/strategy-proposal" || formAction === "/scouting-lead" || formAction === "/picklists" ? false : defaultShouldRevalidate;
}
