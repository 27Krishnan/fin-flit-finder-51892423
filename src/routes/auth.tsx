import { createFileRoute, Navigate } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthPage from "@/pages/Auth";

const queryClient = new QueryClient();

export const Route = createFileRoute("/auth")({
  component: RouteComponent,
});

function PublicGate() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" />;
  return <AuthPage />;
}

function RouteComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <PublicGate />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
