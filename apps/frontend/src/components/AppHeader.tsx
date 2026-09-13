import { Link } from "react-router";

export function AppHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4">
      <Link
        to="/"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        AI Interviewer
      </Link>
      <span className="text-xs text-muted-foreground">
        Voice interview workspace
      </span>
    </header>
  );
}
