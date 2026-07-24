export type DashboardResourceTab = "match" | "proposal" | "lead";

const resourcePaths: Record<DashboardResourceTab, string> = {
  match: "/api/match-schedule",
  proposal: "/strategy-proposal",
  lead: "/scouting-lead",
};

export function dashboardResourcePath(tab: DashboardResourceTab, eventKey: string) {
  return `${resourcePaths[tab]}?event=${encodeURIComponent(eventKey)}`;
}

export function shouldRevalidateDashboard(formAction: string | undefined, defaultShouldRevalidate: boolean) {
  return formAction === "/strategy-proposal" || formAction === "/scouting-lead" ? false : defaultShouldRevalidate;
}
