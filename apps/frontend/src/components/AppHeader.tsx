import { NavLink, useNavigate } from "react-router";
import { LogOut, PlusCircle, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/history", label: "History", icon: TrendingUp },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <NavLink
          to="/"
          className="group flex items-center gap-2.5"
          title="AI Interviewer Home"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">
            AI <span className="text-primary">Interviewer</span>
          </span>
        </NavLink>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
              aria-label={label}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
            aria-label="Start New Interview"
          >
            <PlusCircle className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </NavLink>

          {user && (
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate("/login"));
              }}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Sign out ${user.email ?? ""}`}
            >
              <LogOut className="size-3.5" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
