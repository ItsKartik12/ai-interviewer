import { Link } from "react-router";
import { LogIn, Sparkles } from "lucide-react";
import { LOGIN_URL } from "@/lib/config";

export function AppHeader() {
  const isExternalLogin = /^https?:\/\//i.test(LOGIN_URL);

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-xs shadow-xs">
      <Link
        to="/"
        className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
      >
        <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <span>AI Interviewer</span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
          Autonomous Technical Interview Workspace
        </span>
        {isExternalLogin ? (
          <a
            href={LOGIN_URL}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Return to Login page"
          >
            <LogIn className="size-3.5" />
            <span>Return to Login</span>
          </a>
        ) : (
          <Link
            to={LOGIN_URL}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Return to Login page"
          >
            <LogIn className="size-3.5" />
            <span>Return to Login</span>
          </Link>
        )}
      </div>
    </header>
  );
}
