import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Sun, Moon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletPanel } from "@/components/web3/WalletPanel";
import { LogoMark } from "@/components/shared/Logo";
import { useUi } from "@/lib/ui-state";
import { useTheme } from "@/lib/theme";
import { CRUZ_MODULES, CRUZ_MODULE_ICONS } from "@/lib/studio/manifest";

// CRUZ is single-mode: one nav, derived from the module manifest. No network
// selector (only one chain — Arbitrum One), no mode switching. Slimmer
// icon-forward rail.
const NAV = [
  { to: "/app", label: "Dashboard", icon: Home, exact: true },
  ...CRUZ_MODULES.map((m) => ({
    to: m.path,
    label: m.label,
    icon: CRUZ_MODULE_ICONS[m.id],
  })),
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-4">
        <Link
          to="/app"
          className="flex items-center gap-2"
          aria-label="CRUZ dashboard"
          onClick={onNavigate}
        >
          <LogoMark className="h-7 w-7" />
          <span className="font-display text-sm font-bold tracking-tight text-foreground">
            CR<span className="text-primary">UZ</span>
          </span>
        </Link>
        <button
          onClick={onNavigate ?? toggleSidebar}
          className="rounded-sm p-1 text-meta hover:text-foreground"
          aria-label={onNavigate ? "Close menu" : "Collapse sidebar"}
          title={onNavigate ? "Close menu" : "Collapse sidebar"}
        >
          {onNavigate ? <X className="h-4 w-4" /> : null}
        </button>
      </div>

      <div className="border-b border-border px-3 py-3">
        <WalletPanel />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-2 px-2.5 font-mono text-[10px] uppercase tracking-widest text-meta">
          CRUZ
        </p>
        <div className="space-y-0.5">
          {NAV.map((item) => (
            <SidebarLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={isActive(item.to, (item as { exact?: boolean }).exact)}
              onClick={onNavigate}
            />
          ))}
        </div>
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-meta">CRUZ v0.1</span>
          <ThemeButton />
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const { mobileNavOpen, closeMobileNav, sidebarCollapsed } = useUi();

  return (
    <>
      {!sidebarCollapsed && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface md:flex">
          <SidebarContent />
        </aside>
      )}

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="flex w-72 max-w-[85%] flex-col border-r border-border bg-surface">
            <SidebarContent onNavigate={closeMobileNav} />
          </div>
          <button
            className="flex-1 bg-background/60 backdrop-blur-sm"
            onClick={closeMobileNav}
            aria-label="Close menu overlay"
          />
        </div>
      )}
    </>
  );
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-medium transition",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function ThemeButton() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[10px] text-meta hover:border-primary hover:text-primary"
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
