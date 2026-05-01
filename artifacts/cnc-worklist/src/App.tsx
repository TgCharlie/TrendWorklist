import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import WorklistsPage from "@/pages/WorklistsPage";
import WorklistDetailPage from "@/pages/WorklistDetailPage";
import CutlistsPage from "@/pages/CutlistsPage";
import MaterialsPage from "@/pages/MaterialsPage";
import FavouritesPage from "@/pages/FavouritesPage";
import UsersPage from "@/pages/admin/UsersPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Redirect to="/" />;
  return <Component />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={WorklistsPage} />
        <Route path="/worklists/:id" component={WorklistDetailPage} />
        <Route path="/cutlists" component={CutlistsPage} />
        <Route path="/materials" component={MaterialsPage} />
        <Route path="/favourites" component={FavouritesPage} />
        <Route path="/admin/users">
          <AdminRoute component={UsersPage} />
        </Route>
        <Route path="/admin/settings">
          <AdminRoute component={SettingsPage} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
