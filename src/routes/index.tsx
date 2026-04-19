import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import IndexPage from "@/pages/Index";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

const queryClient = new QueryClient();

function PendingApproval() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-sm space-y-6 text-center">
        <div className="text-5xl">⏳</div>
        <h1 className="text-xl font-bold text-foreground">Pending Approval</h1>
        <p className="text-sm text-muted-foreground">
          Your account <strong>{user?.email}</strong> is awaiting admin approval. You'll be able to sign in once approved.
        </p>
        <button onClick={signOut} className="text-sm text-primary hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProtectedShell() {
  const { session, loading, approved } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" />;
  if (approved === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!approved) return <PendingApproval />;

  return (
    <AppProvider>
      <IndexPage />
    </AppProvider>
  );
}

function RouteComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <ProtectedShell />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
