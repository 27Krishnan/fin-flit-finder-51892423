import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ResetPassword from "@/pages/ResetPassword";

const queryClient = new QueryClient();

export const Route = createFileRoute("/reset-password")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <ResetPassword />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
