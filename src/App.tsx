import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import LeadDiscovery from "@/pages/LeadDiscovery";
import Campaigns from "@/pages/Campaigns";
import Conversations from "@/pages/Conversations";
import Reports from "@/pages/Reports";
import Deliverability from "@/pages/Deliverability";
import SettingsPage from "@/pages/SettingsPage";
import Sequences from "@/pages/Sequences";
import Pipeline from "@/pages/Pipeline";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/discovery" element={<LeadDiscovery />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/conversations" element={<Conversations />} />
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
);

export default App;
