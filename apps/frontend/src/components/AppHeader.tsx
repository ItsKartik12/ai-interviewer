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
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Log out
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/register">Sign up</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
