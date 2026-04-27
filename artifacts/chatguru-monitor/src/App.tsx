import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { Conversations } from "@/pages/conversations";
import { CheckStatus } from "@/pages/check-status";
import { Reengagement } from "@/pages/reengagement";
import { Team } from "@/pages/team";
import { Numbers } from "@/pages/numbers";
import { TagsPage } from "@/pages/tags-page";
import { Alerts } from "@/pages/alerts";
import { Summaries } from "@/pages/summaries";
import { TrafficPerformance } from "@/pages/traffic-performance";
import { AuditPage } from "@/pages/audit";
import { LoginPage } from "@/pages/login";
import NotFound from "@/pages/not-found";
import React, { useState, useEffect, useCallback } from "react";
import { SearchModal } from "@/components/search-modal";
import { LeadModal } from "@/components/lead-modal";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const queryClient = new QueryClient();

// Pages restricted to admin role only
const ADMIN_ONLY_PATHS = [
  "/summaries",
  "/traffic",
  "/audit",
  "/team",
  "/numbers",
  "/tags",
];

function ProtectedRoute({
  component: Component,
  adminOnly,
}: {
  component: React.ComponentType;
  adminOnly?: boolean;
}) {
  const { role } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (adminOnly && role === "team") {
      navigate("/");
    }
  }, [role, adminOnly, navigate]);

  if (adminOnly && role === "team") return null;
  return <Component />;
}

function Router() {
  const { role, loading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<number | null>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!role) {
    return <LoginPage />;
  }

  return (
    <Layout onSearch={openSearch}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/conversations" component={Conversations} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/reengagement" component={Reengagement} />
        <Route path="/check" component={CheckStatus} />
        {/* Admin-only routes */}
        <Route path="/summaries">
          <ProtectedRoute component={Summaries} adminOnly />
        </Route>
        <Route path="/traffic">
          <ProtectedRoute component={TrafficPerformance} adminOnly />
        </Route>
        <Route path="/audit">
          <ProtectedRoute component={AuditPage} adminOnly />
        </Route>
        <Route path="/team">
          <ProtectedRoute component={Team} adminOnly />
        </Route>
        <Route path="/numbers">
          <ProtectedRoute component={Numbers} adminOnly />
        </Route>
        <Route path="/tags">
          <ProtectedRoute component={TagsPage} adminOnly />
        </Route>
        <Route component={NotFound} />
      </Switch>
      <SearchModal
        open={searchOpen}
        onClose={closeSearch}
        onSelect={(id) => setSelectedLead(id)}
      />
      <LeadModal leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
