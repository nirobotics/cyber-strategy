import { BarChart3, Bot, FileText, ListChecks, Settings, ShieldCheck, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cn } from "./ui";

export type StrategyNavItem = "browser" | "compare" | "match" | "picklist" | "proposal" | "lead" | "admin";

export function StrategyNavigation({
  active,
  eventKey,
  isAdmin,
}: {
  active: StrategyNavItem;
  eventKey: string | null;
  isAdmin: boolean;
}) {
  const items: Array<{ id: StrategyNavItem; label: string; icon: ReactNode; to: string; adminOnly?: boolean }> = [
    { id: "browser", label: "队伍浏览", icon: <Bot className="size-4" />, to: dashboardPath(eventKey, "browser") },
    { id: "compare", label: "队伍对比", icon: <BarChart3 className="size-4" />, to: dashboardPath(eventKey, "compare") },
    { id: "match", label: "赛程分析", icon: <Table2 className="size-4" />, to: dashboardPath(eventKey, "match") },
    { id: "picklist", label: "Picklist", icon: <ListChecks className="size-4" />, to: dashboardPath(eventKey, "picklist") },
    { id: "proposal", label: "Strategy Proposal", icon: <FileText className="size-4" />, to: pagePath("/strategy-proposal", eventKey) },
    { id: "lead", label: "Scouting Lead", icon: <ShieldCheck className="size-4" />, to: pagePath("/scouting-lead", eventKey), adminOnly: true },
    { id: "admin", label: "管理", icon: <Settings className="size-4" />, to: "/admin", adminOnly: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <NavLink
          key={item.id}
          to={item.to}
          className={cn("btn", active === item.id && "btn-active")}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function dashboardPath(eventKey: string | null, tab: StrategyNavItem) {
  const params = new URLSearchParams();
  if (eventKey) params.set("event", eventKey);
  if (tab !== "browser") params.set("tab", tab);
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

function pagePath(path: string, eventKey: string | null) {
  if (!eventKey) return path;
  return `${path}?event=${encodeURIComponent(eventKey)}`;
}
