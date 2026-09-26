import { NavLink, useNavigate } from "react-router";
import { LogOut, PlusCircle, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/lib/theme";

const NAV_ITEMS = [
  { to: "/history", label: "History", icon: TrendingUp },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-none">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-6 md:px-8">
        <NavLink
          to="/"
          className="group flex shrink-0 items-center gap-2 sm:gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          title="AI Interviewer Home"
        >
          <span className="grid size-7 sm:size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-3.5 sm:size-4" />
          </span>
          <span className="text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap">
            AI <span className="text-primary">Interviewer</span>
          </span>
        </NavLink>

        <nav className="flex items-center gap-0.5 sm:gap-1.5" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
              aria-label={label}
              title={label}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
            aria-label="Start New Interview"
            title="Start New Interview"
          >
            <PlusCircle className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">New</span>
          </NavLink>

          <ThemeToggle className="ml-0.5" />

          {user && (
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate("/login"));
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Sign out ${user.email ?? ""}`}
              title="Sign out"
            >
              <LogOut className="size-3.5 shrink-0" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
