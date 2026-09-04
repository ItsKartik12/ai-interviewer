import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/api";

type MeResponse = {
  uid: string;
  email: string | null;
  name: string | null;
};

export function Dashboard() {
  const { user, logout } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await authFetch("/api/v1/me");
        const body = (await response.json()) as MeResponse & { message?: string };
        if (!response.ok) {
          throw new Error(body.message ?? `Request failed (${response.status})`);
        }
        if (!cancelled) {
          setMe(body);
        }
      } catch (error) {
        if (!cancelled) {
          setMeError(error instanceof Error ? error.message : "Could not reach the authenticated API.");
        }
      } finally {
        if (!cancelled) {
          setMeLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative min-h-screen px-6 py-20">
      <AppHeader />
      <div className="mx-auto w-full max-w-2xl pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in. Resume analysis and the new interview engine will land in later phases.
          The original GitHub voice interview is still available from the home page.
        </p>

        <section className="mt-8 rounded-xl border border-border bg-card/60 p-6">
          <h2 className="text-sm font-medium text-muted-foreground">Firebase session</h2>
          <p className="mt-3 text-sm">{user?.email ?? user?.uid}</p>
          <p className="mt-1 text-xs text-muted-foreground">UID: {user?.uid}</p>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-card/60 p-6">
          <h2 className="text-sm font-medium text-muted-foreground">Backend GET /api/v1/me</h2>
          {meLoading ? (
            <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground" />
          ) : meError ? (
            <p className="mt-3 text-sm text-destructive">{meError}</p>
          ) : (
            <pre className="mt-3 overflow-x-auto text-sm text-muted-foreground">
              {JSON.stringify(me, null, 2)}
            </pre>
          )}
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open interview start
          </Link>
          <Button variant="outline" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </div>
    </main>
  );
}
