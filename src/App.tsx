import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";
import Inbox from "@/pages/Inbox";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Agent from "@/pages/Agent";
import LeadDiscovery from "@/pages/LeadDiscovery";
import Campaigns from "@/pages/Campaigns";
import Reports from "@/pages/Reports";
import Deliverability from "@/pages/Deliverability";
import SettingsPage from "@/pages/SettingsPage";
import Sequences from "@/pages/Sequences";
import Pipeline from "@/pages/Pipeline";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } });

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/discovery" element={<LeadDiscovery />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/conversations" element={<Navigate to="/inbox" replace />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/deliverability" element={<Deliverability />} />
            <Route path="/sequences" element={<Sequences />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
