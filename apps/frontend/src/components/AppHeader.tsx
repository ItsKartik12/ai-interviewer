import { Link } from "react-router";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "./ui/button";

export function AppHeader() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4">
      <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        AI Interviewer
      </Link>
      <nav className="flex items-center gap-2">
        {loading ? null : user ? (
          <>
            <Link
              to="/dashboard"
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Dashboard
            </Link>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Log out
            </Button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
