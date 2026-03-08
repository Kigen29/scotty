import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Search, Mail, MessageSquare, BarChart3, Settings, Zap, Menu, X, GitBranch, ShieldCheck, Columns3, Sun, Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationCenter from "@/components/NotificationCenter";
import ProfileDropdown from "@/components/ProfileDropdown";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", badgeKey: "activity" as const },
  { to: "/discovery", icon: Search, label: "Discovery" },
  { to: "/campaigns", icon: Mail, label: "Campaigns" },
  { to: "/sequences", icon: GitBranch, label: "Sequences" },
  { to: "/pipeline", icon: Columns3, label: "Pipeline", badgeKey: "assignments" as const },
  { to: "/conversations", icon: MessageSquare, label: "Conversations" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/deliverability", icon: ShieldCheck, label: "Deliverability" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/discovery": "Lead Discovery",
  "/campaigns": "Campaigns",
  "/sequences": "Sequences",
  "/pipeline": "Pipeline",
  "/conversations": "Conversations",
  "/reports": "Reports",
  "/deliverability": "Deliverability",
  "/settings": "Settings",
};

const AppLayout = () => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadActivity, newAssignments, markActivitySeen, markAssignmentsSeen } = useNotifications();

  useEffect(() => {
    if (location.pathname === "/") markActivitySeen();
    if (location.pathname === "/pipeline") markAssignmentsSeen();
  }, [location.pathname, markActivitySeen, markAssignmentsSeen]);

  const getBadgeCount = (key?: "activity" | "assignments") => {
    if (key === "activity") return unreadActivity;
    if (key === "assignments") return newAssignments;
    return 0;
  };

  const closeSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const pageTitle = pageTitles[location.pathname] || "ScoutAgent";

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — clean nav only */}
      <aside className={cn(
        "flex-shrink-0 bg-sidebar-background border-r border-sidebar-border flex flex-col z-50 transition-transform duration-200",
        isMobile
          ? `fixed inset-y-0 left-0 w-56 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
          : "w-56 relative"
      )}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground text-sm leading-tight">ScoutAgent</h1>
              <p className="text-[10px] text-sidebar-foreground/50">Lead Autopilot</p>
            </div>
          </div>
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className="flex-1 px-2 space-y-0.5 mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={closeSidebar}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.badgeKey && getBadgeCount(item.badgeKey) > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1.5">
                  {getBadgeCount(item.badgeKey) > 99 ? "99+" : getBadgeCount(item.badgeKey)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h2 className="text-base font-semibold">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <ProfileDropdown />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
