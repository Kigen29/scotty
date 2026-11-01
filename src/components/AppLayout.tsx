import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Activity, BarChart3, Columns3, GitBranch, Home, Inbox, LogOut, Mail, Menu, Moon, Phone, Search, Settings, ShieldCheck, Sun, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCalls, useOverview, useThreads } from "@/lib/api";

type Item = { to: string; label: string; icon: typeof Home; end?: boolean };

const WORK: Item[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/discovery", label: "Discovery", icon: Search },
];
const SCOTTY: Item[] = [
  { to: "/agent", label: "Agent", icon: Activity },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];
// Cold outreach is switched off until it has its own domain and a consent-first flow.
const OUTREACH: Item[] = [
  { to: "/campaigns", label: "Campaigns", icon: Mail },
  { to: "/sequences", label: "Sequences", icon: GitBranch },
  { to: "/deliverability", label: "Deliverability", icon: ShieldCheck },
];

function NavItem({ item, badge, dot, onClick }: { item: Item; badge?: number; dot?: string; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dot)} /> : null}
      {badge ? <span className="tabular rounded bg-warning/15 px-1.5 text-[11px] font-medium text-warning">{badge}</span> : null}
    </NavLink>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-px">
      <p className="px-2 pb-1 pt-4 text-[11px] font-medium text-sidebar-foreground/60">{label}</p>
      {children}
    </div>
  );
}

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const threads = useThreads();
  const overview = useOverview();
  const calls = useCalls();

  useEffect(() => setOpen(false), [location.pathname]);

  const needsYou = threads.data?.filter((t) => t.state === "needs_you").length ?? 0;
  // Calls that are due now: call-backs and people looking at their report.
  const callsDue = (calls.data?.call_backs.length ?? 0) + (calls.data?.opened.length ?? 0);
  const autoOn = overview.data?.auto_reply_enabled;
  const close = isMobile ? () => setOpen(false) : undefined;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="flex h-screen bg-background">
      {isMobile && open ? <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} /> : null}

      <aside
        className={cn(
          "z-50 flex w-56 shrink-0 flex-col border-r bg-sidebar-background",
          isMobile ? cn("fixed inset-y-0 left-0 transition-transform duration-200", open ? "translate-x-0" : "-translate-x-full") : "relative",
        )}
      >
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          <span className="text-[14px] font-semibold tracking-tight">Scotty</span>
          <span className="text-[12px] text-sidebar-foreground/60">Code 5</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-px">
            {WORK.map((item) => (
              <NavItem key={item.to} item={item} onClick={close} badge={item.to === "/inbox" ? needsYou : item.to === "/calls" ? callsDue : undefined} />
            ))}
          </div>
          <Group label="Scotty">
            {SCOTTY.map((item) => (
              <NavItem
                key={item.to}
                item={item}
                onClick={close}
                dot={item.to === "/agent" && autoOn !== undefined ? (autoOn ? "bg-primary" : "bg-muted-foreground/40") : undefined}
              />
            ))}
          </Group>
          <Group label="Outreach · paused">
            {OUTREACH.map((item) => (
              <NavItem key={item.to} item={item} onClick={close} />
            ))}
          </Group>
        </nav>

        <div className="space-y-px border-t px-2 py-2">
          <NavItem item={{ to: "/settings", label: "Settings", icon: Settings }} onClick={close} />
          <div className="flex items-center gap-1 px-2 pt-1">
            <span className="flex-1 truncate text-[12px] text-sidebar-foreground/70" title={user?.email}>
              {user?.email}
            </span>
            <button
              className="rounded p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Switch theme"
              aria-label="Switch theme"
            >
              <Sun className="h-3.5 w-3.5 dark:hidden" />
              <Moon className="hidden h-3.5 w-3.5 dark:block" />
            </button>
            <button
              className="rounded p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile ? (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <button className="rounded p-1.5 hover:bg-muted" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-[14px] font-semibold">Scotty</span>
          </div>
        ) : null}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
