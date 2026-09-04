import { Navigate } from "react-router";
import { useAuth } from "@/auth/AuthContext";
import { SetupNotice } from "./SetupNotice";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();

  if (!configured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <SetupNotice
          title="Firebase is not configured"
          detail="Authentication cannot run until the public Firebase client variables are set. The app will not pretend you are signed in."
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
