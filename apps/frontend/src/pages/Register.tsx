import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function Register() {
  const { user, loading, configured, register, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await register(email.trim(), password);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to create an account.");
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to sign in with Google.");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <AppHeader />
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Email and password are stored by Firebase Authentication. The API key never leaves the
          server for Gemini or Firebase Admin.
        </p>

        {!configured ? (
          <div className="mt-8">
            <SetupNotice
              title="Firebase is not configured"
              detail="Registration is disabled until PUBLIC_FIREBASE_* environment variables are set."
            />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Create account
            </Button>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => void onGoogle()}>
              Continue with Google
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
