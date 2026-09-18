import { Link } from "react-router";
import { PlusCircle, Sparkles } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-xs shadow-xs">
      <Link
        to="/"
        className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
        title="AI Interviewer Home"
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
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Start New Interview"
        >
          <PlusCircle className="size-3.5" />
          <span>New Interview</span>
        </Link>
      </div>
    </header>
  );
}

