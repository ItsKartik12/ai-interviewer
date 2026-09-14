import { Link } from "react-router";
import { LogIn } from "lucide-react";
import { LOGIN_URL } from "@/lib/config";

export function AppHeader() {
  const isExternalLogin = /^https?:\/\//i.test(LOGIN_URL);

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4">
      <Link
        to="/"
        className="text-sm font-semibold tracking-tight text-foreground/90 hover:text-foreground transition-colors"
      >
        AI Interviewer
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Voice interview workspace
        </span>
        {isExternalLogin ? (
          <a
            href={LOGIN_URL}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Return to Login page on InternSetu"
          >
            <LogIn className="size-3.5" />
            <span>Return to Login</span>
          </a>
        ) : (
          <Link
            to={LOGIN_URL}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
