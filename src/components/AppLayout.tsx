import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Search, Mail, MessageSquare, BarChart3, Settings, Zap, LogOut, Menu, X, GitBranch, ShieldCheck, Columns3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/discovery", icon: Search, label: "Discovery" },
  { to: "/campaigns", icon: Mail, label: "Campaigns" },
  { to: "/sequences", icon: GitBranch, label: "Sequences" },
  { to: "/pipeline", icon: Columns3, label: "Pipeline" },
  { to: "/conversations", icon: MessageSquare, label: "Conversations" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/deliverability", icon: ShieldCheck, label: "Deliverability" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const closeSidebar = () => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
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
              <p className="text-[10px] text-muted-foreground">Lead Autopilot</p>
            </div>
          </div>
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
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
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        {isMobile && (
          <header className="flex items-center gap-3 p-3 border-b border-border bg-background">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                <Zap className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">ScoutAgent</span>
            </div>
          </header>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
