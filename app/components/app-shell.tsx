import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AppFooter } from "./app-footer";
import { AppHeader } from "./app-header";
import type { SessionUser } from "../lib/auth-types";

export function AppShell({
  appName,
  appSubtitle,
  centerTitle,
  version,
  user,
  authLoading,
  allowGuest,
  busy,
  onLogin,
  children,
  Icon,
}: {
  appName: string;
  appSubtitle: string;
  centerTitle?: string | null;
  version: string;
  user: SessionUser | null;
  authLoading: boolean;
  allowGuest: boolean;
  busy: boolean;
  onLogin: () => void;
  children: ReactNode;
  Icon?: LucideIcon;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)] has-[[data-fixed-page]]:h-dvh has-[[data-fixed-page]]:overflow-hidden has-[[data-fixed-browser]]:lg:h-dvh has-[[data-fixed-browser]]:lg:overflow-hidden has-[[data-fixed-picklist]]:sm:h-dvh has-[[data-fixed-picklist]]:sm:overflow-hidden has-[[data-fixed-desktop]]:xl:h-dvh has-[[data-fixed-desktop]]:xl:overflow-hidden">
      <TopProgressBar active={busy} />
      <AppHeader
        appName={appName}
        appSubtitle={appSubtitle}
        centerTitle={centerTitle}
        user={user}
        authLoading={authLoading}
        allowGuest={allowGuest}
        onLogin={onLogin}
        Icon={Icon}
      />
      <main className="flex-1 p-2.5 has-[[data-fixed-page]]:min-h-0 has-[[data-fixed-page]]:overflow-hidden has-[[data-fixed-browser]]:lg:min-h-0 has-[[data-fixed-browser]]:lg:overflow-hidden has-[[data-fixed-picklist]]:sm:min-h-0 has-[[data-fixed-picklist]]:sm:overflow-hidden has-[[data-fixed-desktop]]:xl:min-h-0 has-[[data-fixed-desktop]]:xl:overflow-hidden">
        {children}
      </main>
      <AppFooter version={version} />
    </div>
  );
}

function TopProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-[var(--accent)]/20">
      <div className="h-full w-1/3 animate-[route-progress_1s_ease-in-out_infinite] bg-[var(--accent)]" />
    </div>
  );
}
