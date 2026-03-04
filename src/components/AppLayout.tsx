import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Search, Mail, MessageSquare, BarChart3, Settings, Zap, LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/discovery", icon: Search, label: "Discovery" },
  { to: "/campaigns", icon: Mail, label: "Campaigns" },
  { to: "/conversations", icon: MessageSquare, label: "Conversations" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/discovery": "Lead Discovery",
  "/campaigns": "Campaigns",
  "/conversations": "Conversations",
  "/reports": "Reports",
  "/settings": "Settings",
};

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTitle = pageTitles[location.pathname] || "ScoutAgent";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Compact Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-sidebar-background border-r border-sidebar-border flex flex-col">
        <div className="p-4 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sidebar-foreground text-sm leading-tight">ScoutAgent</h1>
            <p className="text-[10px] text-muted-foreground">Lead Autopilot</p>
          </div>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
